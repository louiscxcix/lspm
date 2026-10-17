const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {changesFrom,publish}=require('./publish-supabase');

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-publisher-test-')),file=path.join(dir,'db.sqlite'),db=new DatabaseSync(file);
 db.exec("CREATE TABLE sources(id TEXT,kind TEXT,filename TEXT,mime_type TEXT,content BLOB,created_at TEXT,metadata_json TEXT);CREATE TABLE entities(id TEXT,type TEXT,data_json TEXT);CREATE TABLE relations(id TEXT,type TEXT,from_id TEXT,to_id TEXT,scope_project_id TEXT,data_json TEXT);CREATE TABLE project_memberships(project_id TEXT,entity_id TEXT)");
 db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?)').run('s','history','source','text/plain',Buffer.from('{"text":"LG Innotek request","cdrToken":"must-not-upload"}'),'2026-10-17','{}');
 db.prepare('INSERT INTO entities VALUES(?,?,?)').run('person','Person',JSON.stringify({id:'person',type:'Person',name:'Confirmed person',status:'active'}));
 return {dir,file,db};
}
test('publisher retains author text but excludes credentials and deduplicates confirmed rows',()=>{
 const f=fixture();const rows=changesFrom(f.db);assert.equal(rows.length,2);const s=rows.find(r=>r.table==='sources');const text=Buffer.from(s.row.content,'base64').toString();assert.ok(text.includes('LG Innotek request'));assert.ok(!text.includes('must-not-upload'));
 const cache=Object.fromEntries(rows.map(r=>[r.key,{hash:r.fingerprint,row:r.row}]));assert.deepEqual(changesFrom(f.db,cache),[]);f.db.close();
});
test('failed publication does not advance local checkpoint',async()=>{
 const f=fixture();f.db.close();const configFile=path.join(f.dir,'config.json'),stateFile=path.join(f.dir,'state.json');fs.writeFileSync(configFile,JSON.stringify({token:'private-token',publishableKey:'public'}));
 await assert.rejects(publish({configFile,stateFile,dbFile:f.file,fetchImpl:async()=>({ok:false,status:503})}),/SUPABASE_PUBLISH_FAILED_503/);assert.equal(fs.existsSync(stateFile),false);
});
test('invalid ontology never reaches the remote publisher',async()=>{
 const f=fixture();f.db.prepare('UPDATE entities SET data_json=?').run(JSON.stringify({id:'person',type:'Person',name:'Broken person'}));f.db.close();
 const configFile=path.join(f.dir,'config.json'),stateFile=path.join(f.dir,'state.json');fs.writeFileSync(configFile,JSON.stringify({token:'private-token',publishableKey:'public'}));let called=false;
 await assert.rejects(publish({configFile,stateFile,dbFile:f.file,fetchImpl:async()=>{called=true;throw Error('Unexpected network call');}}),/Invalid or duplicate object/);assert.equal(called,false);assert.equal(fs.existsSync(stateFile),false);
});
test('successful publication checkpoints accepted rows only and retries conflicts',async()=>{
 const f=fixture();f.db.close();const configFile=path.join(f.dir,'config.json'),stateFile=path.join(f.dir,'state.json');fs.writeFileSync(configFile,JSON.stringify({token:'private-token',publishableKey:'public'}));
 const result=await publish({configFile,stateFile,dbFile:f.file,fetchImpl:async(_url,request)=>{const b=JSON.parse(request.body).p_batch;return {ok:true,json:async()=>({revision:12,changed:1,accepted:b.changes.filter(r=>r.table==='sources'),conflicts:[{table:'entities',id:'person'}]})};}});
 assert.equal(result.conflicts,1);const cache=JSON.parse(fs.readFileSync(stateFile));assert.ok(cache.records['sources:s']);assert.equal(cache.records['entities:person'],undefined);
 const db=new DatabaseSync(f.file,{readOnly:true});assert.equal(changesFrom(db,cache.records).length,1);db.close();
});
