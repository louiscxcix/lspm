const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const path=require('node:path');
const {applyMigrations}=require('./scripts/supabase-migrations');
const {withPostgresStore,withPublicPostgresStore}=require('./postgres-store');
const {createCloudHandler}=require('./cloud-handler');
const Projects=require('./projects'),Model=require('./ontology-model');

test('public workspace is pinned, readable without login, and cannot be changed by guests', {skip:!process.env.TEST_DATABASE_URL},async()=>{
  const admin=new Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
  const dbName='pm_public_'+randomUUID().replaceAll('-','');let client;
  try{
    await admin.query('CREATE DATABASE '+dbName);const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+dbName;
    client=new Client({connectionString:url.toString()});await client.connect();
    await client.query("CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; CREATE TABLE auth.users(id UUID PRIMARY KEY)");
    const owner=randomUUID(),other=randomUUID();await client.query('INSERT INTO auth.users(id) VALUES ($1)',[owner]);
    // Test bootstrap does not need an anonymous database role; production Supabase has it.
    await admin.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$");
    await applyMigrations(async sql=>(await client.query(sql)).rows,path.join(__dirname,'supabase/migrations'),()=>{});
    assert.equal((await client.query('SELECT owner_id FROM pm.publication')).rows[0].owner_id,owner);
    let ws=await withPostgresStore(client,owner,s=>s.load());ws.projects.push(Projects.create('Visible project'));
    ws=await withPostgresStore(client,owner,s=>s.save(ws,null,ws.revision));
    const evidence=Model.addEntity(ws.library,{type:'Evidence',name:'Visible evidence',rawLog:'private source bytes'});
    evidence.sourceExcerpt='private excerpt';
    const part=Model.addEntity(ws.library,{type:'Part',name:'Visible part'});
    const link=Model.addRelation(ws.library,{type:'supported_by',from:part.id,to:evidence.id});link.sourceExcerpt='private link excerpt';
    await withPostgresStore(client,owner,s=>s.save(ws,'library',ws.revision));
    let hidden=await withPostgresStore(client,other,s=>s.load());hidden.projects.push(Projects.create('Other private account'));
    await withPostgresStore(client,other,s=>s.save(hidden,null,hidden.revision));
    const handler=createCloudHandler({allowedOrigins:['https://louiscxcix.github.io'],authenticate:async()=>{throw Error('No login');},withStore:()=>{throw Error('No login');},withPublicStore:fn=>withPublicPostgresStore(client,fn)});
    const request=(route,method='GET')=>handler(new Request('https://example.supabase.co/functions/v1/ontology/api/'+route,{method}));
    let response=await request('public/workspace?owner_id='+other);assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.projects.length,1);assert.equal(data.projects[0].name,'Visible project');
    assert.equal(data.pendingChange,null);assert.deepEqual(data.library.changes,[]);
    assert.equal(data.library.entities[0].rawLog,undefined);assert.equal(data.library.entities[0].sourceExcerpt,undefined);
    assert.equal(data.library.relations[0].sourceExcerpt,undefined);
    assert.equal((await request('public/workspace','POST')).status,405);
    assert.equal((await request('workspace','POST')).status,401);
    assert.equal((await request('public/export')).status,404);
    response=await request('public/health');assert.deepEqual(await response.json(),{ok:true,readOnly:true});
    await assert.rejects(withPublicPostgresStore(client,s=>s.putSettings('library','library',{zoom:2})),/read.only transaction/);
  }finally{if(client)await client.end();await admin.query('DROP DATABASE IF EXISTS '+dbName);await admin.end();}
});
