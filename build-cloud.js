'use strict';
const fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'public-build');fs.mkdirSync(out,{recursive:true});
// Remove any previous data snapshot; cloud builds never publish private records.
for(const filename of ['public-workspace.json','public-api.js'])fs.rmSync(path.join(out,filename),{force:true});
for(const file of ['index.html','styles.css','app.js','ontology-model.js','projects.js','import-resolver.js','ingestion.js','workflow.js','production-logs.js','analysis-views.js','apqp.js','local-api.js','supabase-config.js','supabase-api.js'])fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Built cloud frontend; no SQLite data or private files included.');
