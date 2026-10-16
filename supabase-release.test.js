const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {verifyBackend}=require('./scripts/verify-supabase');
const {applyMigrations}=require('./scripts/supabase-migrations');

test('release gate requires the actual application auth response and matching CORS',async()=>{
  const origin='https://louiscxcix.github.io';let calls=0;
  await verifyBackend({attempts:1,fetchImpl:async(_,options)=>{
    calls++;
    return options.method==='OPTIONS'?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin}}):Response.json({error:'Sign in to open your workspace.'},{status:401,headers:{'Access-Control-Allow-Origin':origin}});
  }});
  assert.equal(calls,2);
  // A gateway auth error must not masquerade as a healthy, running application.
  await assert.rejects(verifyBackend({attempts:1,fetchImpl:async()=>Response.json({message:'Missing authorization header'},{status:401})}),/release check failed/);
  await assert.rejects(verifyBackend({attempts:1,fetchImpl:async()=>Response.json({error:'Sign in to open your workspace.'},{status:401})}),/frontend origin/);
  await assert.rejects(verifyBackend({attempts:1,fetchImpl:async()=>Response.json({ok:true},{status:200})}),/HTTP 200/);
});

test('migration runner applies the real initial schema, forward migrations and safe reruns', {skip:!process.env.TEST_DATABASE_URL},async()=>{
  const admin=new Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
  const dbName='pm_release_'+randomUUID().replaceAll('-','');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pm-release-'));
  let client;
  try{
    await admin.query('CREATE DATABASE '+dbName);
    const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+dbName;
    client=new Client({connectionString:url.toString()});await client.connect();
    await client.query("CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated");
    fs.copyFileSync(path.join(__dirname,'supabase/migrations/202610160001_ontology.sql'),path.join(folder,'202610160001_ontology.sql'));
    const query=async sql=>(await client.query(sql)).rows;
    await applyMigrations(query,folder,()=>{});
    assert.equal((await query('SELECT count(*)::int AS count FROM pm.migration_version'))[0].count,1);
    fs.writeFileSync(path.join(folder,'202610160002_test_upgrade.sql'),'ALTER TABLE pm.entities ADD COLUMN release_test TEXT;');
    await applyMigrations(query,folder,()=>{});
    await applyMigrations(query,folder,()=>{});
    assert.equal((await query('SELECT count(*)::int AS count FROM pm.migration_version'))[0].count,2);
    await query('SELECT release_test FROM pm.entities LIMIT 1');
    fs.unlinkSync(path.join(folder,'202610160002_test_upgrade.sql'));
    await assert.rejects(applyMigrations(query,folder,()=>{}),/absent from this checkout/);
  }finally{
    if(client)await client.end();
    await admin.query('DROP DATABASE IF EXISTS '+dbName);
    await admin.end();fs.rmSync(folder,{recursive:true,force:true});
  }
});
