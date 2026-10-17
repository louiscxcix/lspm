'use strict';
const {randomUUID}=require('node:crypto'),S=require('./sample-preparation');

module.exports=function(db,load){
 db.exec(`CREATE TABLE IF NOT EXISTS sample_preparation_records (
  id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),sheet_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),data_json TEXT NOT NULL,recorded_at TEXT NOT NULL,revision INTEGER NOT NULL,
  UNIQUE(project_id,sheet_id,version));
  CREATE INDEX IF NOT EXISTS sample_preparation_project ON sample_preparation_records(project_id,revision);`);
 function project(id){
  const p=load().projects.find(p=>p.id===id);if(!p)throw Error('Unknown project.');if(!S.isSample(p))throw Error('Choose a sample project.');return p;
 }
 function list(projectId){
  project(projectId);return S.latest(db.prepare('SELECT data_json,recorded_at,revision FROM sample_preparation_records WHERE project_id=? ORDER BY revision,version,id').all(projectId)
   .map(row=>({...JSON.parse(row.data_json),recordedAt:row.recorded_at,recordRevision:row.revision})));
 }
 function save({projectId,revision,sheet}){
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('STALE_REVISION');
  db.exec('BEGIN IMMEDIATE');
  let saved;
  try{
   const current=Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get()?.value);
   if(current!==revision)throw Error('STALE_REVISION');
   const p=project(projectId);if(p.status==='archived')throw Error('Archived project is read only.');
   const value=S.validate(p,sheet),prior=db.prepare('SELECT project_id,data_json FROM sample_preparation_records WHERE sheet_id=? ORDER BY version DESC LIMIT 1').get(value.id);
   const old=prior?JSON.parse(prior.data_json):null;
   if(prior&&prior.project_id!==projectId)throw Error('Checksheet project identity cannot change.');
   if(value.version!==(old?.version??0))throw Error('SHEET_VERSION_CONFLICT');
   if(old&&['partId','runName','templateVersion'].some(key=>old[key]!==value[key]))throw Error('Run/model/template identity cannot change. Create a new run.');
   saved={...value,version:value.version+1};
   const recordedAt=new Date().toISOString(),record={id:'sample-preparation-record-'+randomUUID(),project_id:projectId,sheet_id:saved.id,version:saved.version,data_json:JSON.stringify(saved),recorded_at:recordedAt,revision:revision+1};
   db.prepare('INSERT INTO sample_preparation_records(id,project_id,sheet_id,version,data_json,recorded_at,revision) VALUES(?,?,?,?,?,?,?)')
    .run(record.id,record.project_id,record.sheet_id,record.version,record.data_json,record.recorded_at,record.revision);
   const changed=db.prepare("UPDATE meta SET value=? WHERE key='revision' AND value=?").run(String(revision+1),String(revision));
   if(changed.changes!==1)throw Error('STALE_REVISION');
   db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at) VALUES(?,?,?,?,?,?,?)')
    .run('change-'+randomUUID(),projectId,recordedAt,revision+1,JSON.stringify([{action:'Saved',label:'Sample preparation · '+saved.runName+' · version '+saved.version,fields:[]}]),JSON.stringify([{table:'sample_preparation_records',key:[record.id],before:null,after:record}]),recordedAt);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {workspace:load(),sheet:saved};
 }
 return {list,save};
};
