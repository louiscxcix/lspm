'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {TABLES}=require('../import-backup');
const [dbPath,output]=process.argv.slice(2);
if(!dbPath||!output)throw Error('Usage: node scripts/export-sqlite.js /path/to/ontology.sqlite /private/path/backup.json');
const db=new DatabaseSync(dbPath,{readOnly:true});
try{
  if(Number(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value)!==4)throw Error('Export requires SQLite schema version 4.');
  const backup={format:'pm-process-twin-local',version:1,exportedAt:new Date().toISOString(),revision:Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value)};
  for(const [key,table] of Object.entries(TABLES))backup[key]=db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
  backup.sources=backup.sources.map(row=>({...row,content:Buffer.from(row.content).toString('base64')}));
  fs.writeFileSync(output,JSON.stringify(backup),{mode:0o600,flag:'wx'});
  console.log('Exported',backup.entities.length,'objects and',backup.projects.length,'projects. Keep this backup private.');
}finally{db.close();}
