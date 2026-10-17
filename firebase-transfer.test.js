const {test}=require('node:test');
const assert=require('node:assert/strict');
let transfer={};
try{transfer=require('./firebase-transfer');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}

test('redacts credentials nested inside retained JSON without changing business text',()=>{
  assert.equal(typeof transfer.redact,'function');
  const input={fields:{payload:{stringValue:JSON.stringify({text:'Machine authorization is pending',cdrToken:'call-secret',rows:[{quantity:42}]})}}};
  const output=transfer.redact(input);
  assert.equal(JSON.parse(output.fields.payload.stringValue).cdrToken,'[REDACTED]');
  assert.equal(JSON.parse(output.fields.payload.stringValue).text,'Machine authorization is pending');
  assert.equal(JSON.parse(output.fields.payload.stringValue).rows[0].quantity,42);
  assert.equal(JSON.parse(input.fields.payload.stringValue).cdrToken,'call-secret');
});

test('Firestore values preserve timestamps and exact large integer IDs',()=>{
  assert.equal(typeof transfer.decodeFields,'function');
  const result=transfer.decodeFields({count:{integerValue:'5'},logId:{integerValue:'3953216721672443340'},createdAt:{timestampValue:'2026-10-16T12:00:00Z'},values:{arrayValue:{values:[{booleanValue:false}]}}});
  assert.equal(result.count,5);assert.equal(result.logId,'3953216721672443340');
  assert.equal(result.createdAt,'2026-10-16T12:00:00Z');assert.deepEqual(result.values,[false]);
});

test('merge SQL inserts missing rows only and records conflicts instead of overwriting',()=>{
  assert.equal(typeof transfer.mergeSQL,'function');
  const sql=transfer.mergeSQL({tables:['projects','entities','relations'],snapshotHash:'a'.repeat(64),expectedRevision:338});
  assert.match(sql,/BEGIN/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/firebase_conflicts/);assert.match(sql,/338/);assert.match(sql,/COMMIT/);
  assert.doesNotMatch(sql,/ON CONFLICT[^;]*DO UPDATE|DELETE FROM pm\.(projects|entities|relations)/);
  assert.throws(()=>transfer.mergeSQL({tables:['projects; DROP TABLE pm.projects'],snapshotHash:'a'.repeat(64),expectedRevision:338}));
});

test('PostgreSQL merge preserves edits, is idempotent, and rejects stale revisions',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const {Client}=require('pg'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
  const admin=new Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
  const name='firebase_transfer_'+randomUUID().replaceAll('-','');let db;
  try{
    await admin.query('CREATE DATABASE '+name);const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;
    db=new Client({connectionString:url.toString()});await db.connect();
    await db.query("CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$SELECT NULL::uuid$$;CREATE SCHEMA pm;CREATE TABLE pm.projects(owner_id UUID NOT NULL,rowid BIGINT GENERATED ALWAYS AS IDENTITY,id TEXT NOT NULL,name TEXT,status TEXT,created_at TEXT,updated_at TEXT,project_type TEXT,PRIMARY KEY(owner_id,id));CREATE TABLE pm.meta(owner_id UUID,key TEXT,value TEXT,PRIMARY KEY(owner_id,key));CREATE TABLE pm.publication(singleton BOOLEAN,owner_id UUID)");
    for(const role of ['anon','authenticated']){const exists=await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);if(!exists.rowCount)await db.query('CREATE ROLE '+role);}
    await db.query(fs.readFileSync(require('node:path').join(__dirname,'supabase/migrations/202610170005_firebase_transfer.sql'),'utf8'));
    const owner=randomUUID(),snapshot='a'.repeat(64),other='b'.repeat(64);
    await db.query('INSERT INTO pm.publication VALUES(true,$1)',[owner]);
    await db.query("INSERT INTO pm.meta VALUES($1,'revision','338')",[owner]);
    await db.query("INSERT INTO pm.projects(owner_id,id,name,status,created_at,updated_at,project_type) VALUES($1,'existing','Online edit','active','2026-10-16','2026-10-16','sample')",[owner]);
    await db.query("INSERT INTO pm.firebase_exports(snapshot_hash,owner_id,status,manifest) VALUES($1,$2,'staging','{}'),($3,$2,'staging','{}')",[snapshot,owner,other]);
    for(const id of ['existing','new'])await db.query('INSERT INTO pm.firebase_candidates VALUES($1,$2,$3,$4)',[snapshot,'projects',{id},{id,name:'Firebase project',status:'active',created_at:'2026-10-16',updated_at:'2026-10-16',project_type:'sample'}]);
    const sql=transfer.mergeSQL({tables:['projects'],snapshotHash:snapshot,expectedRevision:338});
    await db.query(sql);
    assert.equal((await db.query("SELECT name FROM pm.projects WHERE id='existing'")).rows[0].name,'Online edit');
    assert.equal((await db.query('SELECT count(*)::integer n FROM pm.projects')).rows[0].n,2);
    assert.equal((await db.query('SELECT count(*)::integer n FROM pm.firebase_conflicts')).rows[0].n,1);
    await db.query(sql);assert.equal((await db.query("SELECT value FROM pm.meta WHERE key='revision'")).rows[0].value,'339');
    await assert.rejects(db.query(transfer.mergeSQL({tables:['projects'],snapshotHash:other,expectedRevision:338})),/TARGET_REVISION_CHANGED/);await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT status FROM pm.firebase_exports WHERE snapshot_hash=$1',[other])).rows[0].status,'staging');
    await db.query('BEGIN;SET LOCAL ROLE anon');await assert.rejects(db.query('SELECT * FROM pm.firebase_documents'),/permission denied/);await db.query('ROLLBACK');
    await db.query('CREATE TABLE pm.entities(owner_id UUID,id TEXT,type TEXT,data_json TEXT,PRIMARY KEY(owner_id,id));CREATE TABLE pm.sources(owner_id UUID,id TEXT,kind TEXT,filename TEXT,mime_type TEXT,content BYTEA,created_at TEXT,metadata_json TEXT,PRIMARY KEY(owner_id,id));CREATE TABLE pm.relations(owner_id UUID,id TEXT,type TEXT,from_id TEXT,to_id TEXT,scope_project_id TEXT,data_json TEXT,PRIMARY KEY(owner_id,id));CREATE TABLE pm.project_memberships(owner_id UUID,project_id TEXT,entity_id TEXT,PRIMARY KEY(owner_id,project_id,entity_id))');
    await db.query(fs.readFileSync(require('node:path').join(__dirname,'supabase/migrations/202610170006_history_publisher.sql'),'utf8'));
    const token='fixture-only-'.padEnd(64,'x'),tokenHash=require('node:crypto').createHash('sha256').update(token).digest('hex');
    await db.query("INSERT INTO pm.publisher_devices(token_hash,owner_id,name) VALUES($1,$2,'test')",[tokenHash,owner]);
    await assert.rejects(db.query('SELECT public.pm_history_sync_status($1)',['wrong']),/PUBLISHER_AUTH_REQUIRED/);
    const row={id:'contact',type:'Person',data_json:JSON.stringify({id:'contact',type:'Person',name:'Confirmed contact'})};
    const batch={key:'c'.repeat(64),changes:[{table:'entities',id:'contact',row}]};
    const result=(await db.query('SELECT public.pm_ingest_local_history($1,$2) value',[token,batch])).rows[0].value;assert.equal(result.changed,1);assert.equal(result.revision,340);
    assert.deepEqual((await db.query('SELECT public.pm_ingest_local_history($1,$2) value',[token,batch])).rows[0].value,result);
    const conflict={key:'d'.repeat(64),changes:[{table:'entities',id:'contact',row:{...row,data_json:JSON.stringify({id:'contact',type:'Person',name:'Unconfirmed overwrite'})}}]};
    assert.equal((await db.query('SELECT public.pm_ingest_local_history($1,$2) value',[token,conflict])).rows[0].value.conflicts.length,1);
    assert.equal(JSON.parse((await db.query("SELECT data_json FROM pm.entities WHERE id='contact'")).rows[0].data_json).name,'Confirmed contact');
    await db.query('BEGIN;SET LOCAL ROLE anon');
    assert.equal((await db.query('SELECT public.pm_history_sync_status($1) value',[token])).rows[0].value.people,1);await db.query('ROLLBACK');
  }finally{if(db)await db.end();await admin.query('DROP DATABASE IF EXISTS '+name);await admin.end();}
});
