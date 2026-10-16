'use strict';
const fs=require('node:fs');
const {Client}=require('pg');
const {withPostgresStore}=require('../postgres-store');
const {importBackup}=require('../import-backup');
async function main(){
  const [filename,userId]=process.argv.slice(2);
  if(!filename||!userId||!process.env.PM_DATABASE_URL)throw Error('Usage: PM_DATABASE_URL=<secure connection> node scripts/import-supabase.js backup.json supabase-auth-user-uuid');
  const backup=JSON.parse(fs.readFileSync(filename,'utf8'));
  const client=new Client({connectionString:process.env.PM_DATABASE_URL});
  await client.connect();
  try{const result=await withPostgresStore(client,userId,(store,connection)=>importBackup(store,connection,backup));console.log('Imported',result.library.entities.length,'objects and',result.projects.length,'projects.');}
  finally{await client.end();}
}
main().catch(()=>{console.error('Import failed. Verify the backup, empty target account, migration and secure database connection. No partial import was committed.');process.exitCode=1;});
