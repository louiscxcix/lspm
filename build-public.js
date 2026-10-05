'use strict';
const fs=require('node:fs'),path=require('node:path');
const {openStore}=require('./local-store');
const out=path.join(__dirname,'public-build');fs.mkdirSync(out,{recursive:true});
const files=['index.html','styles.css','app.js','ontology-model.js','projects.js','import-resolver.js','ingestion.js','workflow.js','production-logs.js','analysis-views.js','apqp.js','local-api.js'];
for(const file of files)fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
const db=openStore(process.env.PM_DB_PATH||path.join(__dirname,'..','.local-data','ontology.sqlite'));
try {
  const workspace=db.load();workspace.pendingChange=null;
  const production={};
  for(const p of workspace.projects){const latest=db.listWip(p.id);production[p.id]={wip:latest,history:Object.fromEntries(latest.snapshots.map(s=>[s.id,db.listWip(p.id,s.id)])),staffing:db.listStaffing(p.id),productionStaffing:db.listProductionStaffing(p.id)};}
  fs.writeFileSync(path.join(out,'public-workspace.json'),JSON.stringify({publishedAt:new Date().toISOString(),workspace,production}));
} finally {db.close();}
fs.copyFileSync(path.join(__dirname,'public-api.js'),path.join(out,'public-api.js'));
const html=fs.readFileSync(path.join(out,'index.html'),'utf8').replace('<script src="app.js?', '<script src="public-api.js"></script><script src="app.js?').replace(/\?v=[^"\s]+/g,'?v='+Date.now());
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Built public read-only workspace. Raw uploaded files and SQLite database are excluded.');
