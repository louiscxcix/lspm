const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {Client}=require('pg');
const {openStore}=require('./local-store');
const {withPostgresStore}=require('./postgres-store');
const {applyMigrations}=require('./scripts/supabase-migrations');
const {readBackup,restoreBackup}=require('./scripts/restore-original-backup');
const M=require('./ontology-model'),P=require('./projects');

test('verified encrypted database restores atomically, preserves extra rows, and reruns without overwriting edits',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-real-restore-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'fixture.sqlite'),store=openStore(file);
  let ws=store.load();ws.projects.push(P.create('Original project'));ws=store.save(ws,null,ws.revision);
  const part=M.addEntity(ws.library,{type:'Part',name:'Original part'}),machine=M.addEntity(ws.library,{type:'Resource',name:'Original machine',resourceKind:'machine'}),step=M.addEntity(ws.library,{type:'Production Step',name:'Original operation'}),secret=M.addEntity(ws.library,{type:'Evidence',name:'Private retained message'});secret.privacy='local_only';
  M.addRelation(ws.library,{type:'operated_in',from:step.id,to:machine.id});M.addRelation(ws.library,{type:'applies_to',from:step.id,to:part.id});M.addRelation(ws.library,{type:'supported_by',from:part.id,to:secret.id});
  ws=store.save(ws,'library',ws.revision);P.attachMembers(ws.projects[0],ws.library,[part.id,machine.id,step.id,secret.id]);ws=store.save(ws,ws.projects[0].id,ws.revision);store.close();
  const sqlite=new DatabaseSync(file),sourceBytes=Buffer.from("Original bytes ' ; DROP TABLE entities; --\u0000",'utf8');
  sqlite.exec("UPDATE projects SET project_type='program'; ALTER TABLE sources ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'; CREATE TABLE extra_history(id TEXT PRIMARY KEY,data_json TEXT); INSERT INTO extra_history VALUES('retained-extra','{\"preserved\":true}'); UPDATE meta SET value='5' WHERE key='schema_version'");
  sqlite.prepare('INSERT INTO sources(id,kind,filename,mime_type,content,created_at,metadata_json) VALUES(?,?,?,?,?,?,?)').run('original-source','history',"original's file.txt",'text/plain',sourceBytes,'2026-10-16T20:00:00Z','{"original":true}');
  sqlite.close();
  const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),key='test-key-only';
  const encrypted=path.join(dir,'ontology-2026-10-16.sqlite.enc');
  assert.equal(spawnSync('openssl',['enc','-aes-256-cbc','-pbkdf2','-iter','200000','-in',file,'-out',encrypted,'-pass','env:LSPM_DB_BACKUP_KEY'],{env:{...process.env,LSPM_DB_BACKUP_KEY:key}}).status,0);
  const manifest={format:'pm-local-sqlite-encrypted-v1',databaseRevision:ws.revision,encryption:{cipher:'aes-256-cbc',kdf:'PBKDF2',iterations:200000},encryptedSha256:hash(encrypted),plaintextSha256:hash(file),counts:{entities:4,relations:3,projects:1,sources:1}};
  fs.writeFileSync(path.join(dir,'ontology-2026-10-16.manifest.json'),JSON.stringify(manifest));
  const backup=readBackup({directory:dir,key});assert.equal(backup.report.tables.extra_history.count,1);
  const admin=new Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
  const name='pm_restore_'+randomUUID().replaceAll('-','');let client;
  try{
    await admin.query('CREATE DATABASE '+name);const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;
    client=new Client({connectionString:url.toString()});await client.connect();
    await client.query("CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; CREATE TABLE auth.users(id UUID PRIMARY KEY)");
    const query=async(sql,parameters=[])=>(await client.query(sql,parameters)).rows;
    await applyMigrations(query,path.join(__dirname,'supabase/migrations'),()=>{});
    const options={backup,backupSha256:manifest.plaintextSha256};
    // Fail after inserts to prove that the entire application import rolls back.
    await assert.rejects(restoreBackup({...options,query:async(sql,parameters)=>query(sql.startsWith('BEGIN;')?sql.replace("UPDATE pm.backup_recovery SET state='committed'","SELECT 1/0; UPDATE pm.backup_recovery SET state='committed'"):sql,parameters)}),/division by zero/);
    assert.equal((await query('SELECT count(*)::integer AS n FROM pm.entities'))[0].n,0);
    const restored=await restoreBackup({...options,query});assert.equal(restored.status,'restored');assert.equal(restored.counts.objects,4);assert.equal(restored.counts.relations,3);assert.equal(restored.counts.public_objects,3);
    assert.deepEqual((await query('SELECT content FROM pm.sources'))[0].content,sourceBytes);
    assert.equal((await query('SELECT metadata_json FROM pm.sources'))[0].metadata_json,'{"original":true}');
    assert.equal((await query("SELECT count(*)::integer AS n FROM pm.backup_recovery_rows WHERE table_name='extra_history'"))[0].n,1);
    const owner=(await query('SELECT owner_id FROM pm.publication'))[0].owner_id;
    let imported=await withPostgresStore(client,owner,s=>s.load());assert.equal(imported.projects[0].projectType,'program');assert.equal(imported.library.entities.length,4);assert.equal(imported.library.relations.length,3);
    M.validateStore(imported.library);
    await query('BEGIN');await query('SET LOCAL ROLE anon');
    const publicData=(await query("SELECT public.pm_public_read('workspace') AS value"))[0].value;
    assert.equal(publicData.library.entities.length,3);assert.equal(publicData.library.relations.length,2);assert.ok(!JSON.stringify(publicData).includes('Private retained message'));
    await assert.rejects(query('SELECT * FROM pm.backup_recovery_rows'),/permission denied/);await query('ROLLBACK');
    imported.library.entities.find(e=>e.id===part.id).name='Newer online edit';await withPostgresStore(client,owner,s=>s.save(imported,'library',imported.revision));
    const again=await restoreBackup({...options,query});assert.equal(again.previouslyCommitted,true);assert.equal((await withPostgresStore(client,owner,s=>s.load())).library.entities.find(e=>e.id===part.id).name,'Newer online edit');
    await assert.rejects(restoreBackup({...options,query,backupSha256:'a'.repeat(64)}),/SUPABASE_ALREADY_HAS_RECORDS/);
  }finally{if(client)await client.end();await admin.query('DROP DATABASE IF EXISTS '+name);await admin.end();}
});
