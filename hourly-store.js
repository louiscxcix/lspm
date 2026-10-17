const {randomUUID}=require('node:crypto'),H=require('./hourly');
module.exports=function(db,load,history){
 function project(id){const p=load().projects.find(p=>p.id===id);if(!p)throw Error('프로젝트가 없습니다.');return p;}
 function list(id){project(id);return db.prepare('SELECT id,data_json,recorded_at,revision FROM hourly_records WHERE project_id=? ORDER BY revision,id').all(id).map(r=>({...JSON.parse(r.data_json),id:r.id,recordedAt:r.recorded_at,recordRevision:r.revision}));}
 function featureSave({projectId,revision,features}){if(project(projectId).status==='archived')throw Error('Archived project is read only.');const value=H.features(features);return history.transaction(revision,'Project feature settings saved',()=>{db.prepare("INSERT INTO project_view_settings VALUES (?,'features',?) ON CONFLICT(project_id,view_key) DO UPDATE SET data_json=excluded.data_json").run(projectId,JSON.stringify(value));return {features:value};},projectId);}
 function save({projectId,revision,rows,text='',confirmCorrections=false}){
  if(load().revision!==revision)throw Error('STALE_REVISION');if(typeof text!=='string'||text.length>100000)throw Error('입력 원문을 확인하세요.');
  const changed=H.changes(list(projectId),H.validate(project(projectId),rows),confirmCorrections);
  if(!changed.length)return {revision,duplicate:true};return history.transaction(revision,'Hourly production records saved',()=>{
   const source=text?history.source({scope:projectId,text,filename:'Hourly production report',metadata:{provider:'hourly-input',privacy:'local_only'}}):null;
   const ids=[];for(const row of changed){const id='hourly-'+randomUUID();ids.push(id);db.prepare('INSERT INTO hourly_records VALUES (?,?,?,?,?)').run(id,projectId,JSON.stringify({...row,...(source?{sourceId:source.id}:{})}),new Date().toISOString(),revision+1);}return {ids};},projectId);
 }
 function rateSave({projectId,revision,...input}){const value=H.rate(project(projectId),input);return history.transaction(revision,'Model Unit Time standard saved',()=>{const row=db.prepare("SELECT data_json FROM project_view_settings WHERE project_id=? AND view_key='hourlyRates'").get(projectId),rates=row?JSON.parse(row.data_json):[];rates.push({...value,recordRevision:revision+1,recordedAt:new Date().toISOString()});db.prepare("INSERT INTO project_view_settings VALUES (?,'hourlyRates',?) ON CONFLICT(project_id,view_key) DO UPDATE SET data_json=excluded.data_json").run(projectId,JSON.stringify(rates));return {rate:value};},projectId);}
 return {list,save,featureSave,rateSave};
};
