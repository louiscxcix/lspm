'use strict';
const fs=require('node:fs'),path=require('node:path');
const {openStore}=require('./local-store');
const out=path.join(__dirname,'public-build');fs.mkdirSync(out,{recursive:true});
const files=['index.html','styles.css','app.js','map-groups.js','ontology-model.js','projects.js','import-resolver.js','ingestion.js','workflow.js','production-logs.js','analysis-views.js','apqp.js','local-api.js'];
files.push('history.js','history-view.js','access-ui.js','progress.js','progress-view.js','cloud-domain.js','cloud-api.js','map-assistant.js','map-assistant-view.js');
files.push('hourly.js','hourly-view.js','project-view.js','project-password.js','project-access-cloud.js');
files.push('quality-map.js');
files.push('project-types.js','sample-preparation.js','sample-preparation-view.js','sample-preparation.css');
for(const file of files)fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
const db=openStore(process.env.PM_DB_PATH||path.join(__dirname,'..','.local-data','ontology.sqlite'));
try {
  const workspace=require('./public-privacy').removePrivateRecords(db.load());workspace.pendingChange=null;
  const production={};
  for(const p of workspace.projects){const latest=db.listWip(p.id),ids=new Set(p.entities.map(e=>e.id)),progress=db.listProgress(p.id);progress.rows=progress.rows.filter(r=>ids.has(r.partId)&&ids.has(r.stepId));for(const r of [...progress.snapshots,...progress.rows])delete r.eventId;production[p.id]={wip:latest,history:Object.fromEntries(latest.snapshots.map(s=>[s.id,db.listWip(p.id,s.id)])),progress,staffing:db.listStaffing(p.id),productionStaffing:db.listProductionStaffing(p.id)};}
  const catalog={version:2,revision:0,library:{id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]},projects:workspace.projects.filter(p=>p.status==='active').map(p=>({id:p.id,name:p.name,status:p.status,projectType:require('./project-types').kind(p),version:2,entities:[],relations:[],viewPending:true})),viewSettings:{},pendingChange:null};
  if(process.env.PM_CATALOG_PATH){
    const remote=JSON.parse(fs.readFileSync(process.env.PM_CATALOG_PATH,'utf8'));
    for(const row of remote.catalog||[]){const name=row.fields?.name?.stringValue,status=row.fields?.status?.stringValue;if(!name||status!=='active'||workspace.projects.some(p=>p.id===row.id))continue;catalog.projects.push({id:row.id,name,status,projectType:require('./project-types').kind({name,projectType:row.fields.projectType?.stringValue}),version:2,entities:[],relations:[],viewPending:true});}
  }
  fs.writeFileSync(path.join(out,'public-workspace.json'),JSON.stringify({publishedAt:new Date().toISOString(),workspace:catalog,production:{}}));
} finally {db.close();}
fs.copyFileSync(path.join(__dirname,'public-api.js'),path.join(out,'public-api.js'));
const release=Date.now();
const html=fs.readFileSync(path.join(out,'index.html'),'utf8').replace('<script src="app.js?', '<script src="public-api.js"></script><script src="cloud-domain.js"></script><script src="project-view.js"></script><script src="project-access-cloud.js"></script><script src="cloud-api.js"></script><script src="app.js?').replace(/src="([^"?]+\.js)(?:\?v=[^"]+)?"/g,(_,file)=>'src="'+file+'?v='+release+'"').replace(/href="([^"?]+\.css)(?:\?v=[^"]+)?"/g,(_,file)=>'href="'+file+'?v='+release+'"').replace(/\?v=[^"\s]+/g,'?v='+release);
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Built public read-only workspace. Raw uploaded files and SQLite database are excluded.');
