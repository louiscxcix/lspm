'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createManagementApi}=require('./supabase-management');
const project='ahzpuefosoajwwgbfhng';
async function main(){
  const token=process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if(!token)throw Error('Missing SUPABASE_ACCESS_TOKEN. Add it as a GitHub repository Actions secret, or supply it securely to this process.');
  if(/^(sb_publishable_|sb_secret_|eyJ)/.test(token))throw Error('SUPABASE_ACCESS_TOKEN must be a personal access token from Supabase account settings, not a project API key.');
  const api=createManagementApi({project,token});
  const query=sql=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
  console.log('Checking PostgreSQL migration for project '+project+'…');
  // Stop rather than apply a migration to a pre-existing, unrecognized pm schema.
  const result=await query("SELECT to_regclass('pm.meta') IS NOT NULL AS present");
  if(result[0]?.present){
    const applied=await query("SELECT to_regclass('pm.migration_version') IS NOT NULL AS present");
    if(!applied[0]?.present)throw Error('Unrecognized existing pm schema. Review it before migration.');
    const versions=await query('SELECT version FROM pm.migration_version');
    if(versions.length!==1||versions[0].version!=='202610160001')throw Error('Unexpected database migration version.');
  }else{
    console.log('Applying PostgreSQL migration…');
    const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610160001_ontology.sql'),'utf8');
    await query('BEGIN;\n'+migration+'\nCOMMIT;');
    console.log('Applied owner-isolated PostgreSQL schema.');
  }
  const form=new FormData();
  form.set('metadata',JSON.stringify({name:'ontology',entrypoint_path:'index.ts',verify_jwt:false}));
  for(const filename of ['index.ts','app.mjs'])form.append('file',new Blob([fs.readFileSync(path.join(__dirname,'../supabase/functions/ontology',filename))],{type:'application/octet-stream'}),filename);
  console.log('Deploying ontology Edge Function…');
  await api('/functions/deploy?slug=ontology',{method:'POST',body:form});
  console.log('Deployed ontology function. Sign in through the app to verify your own workspace.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
