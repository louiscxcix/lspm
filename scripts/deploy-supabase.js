'use strict';
const fs=require('node:fs'),path=require('node:path');
const project='ahzpuefosoajwwgbfhng';
async function api(route,options={}){
  const response=await fetch('https://api.supabase.com/v1/projects/'+project+route,{...options,headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,...options.headers}});
  if(!response.ok)throw Error('Supabase management request failed ('+response.status+'). Verify project permissions and network access.');
  return response.json();
}
async function main(){
  if(!process.env.SUPABASE_ACCESS_TOKEN)throw Error('Set SUPABASE_ACCESS_TOKEN securely in environment settings before deployment.');
  const query=sql=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
  // Stop rather than apply a migration to a pre-existing, unrecognized pm schema.
  const result=await query("SELECT to_regclass('pm.meta') IS NOT NULL AS present");
  if(result[0]?.present){
    const applied=await query("SELECT to_regclass('pm.migration_version') IS NOT NULL AS present");
    if(!applied[0]?.present)throw Error('Unrecognized existing pm schema. Review it before migration.');
    const versions=await query('SELECT version FROM pm.migration_version');
    if(versions.length!==1||versions[0].version!=='202610160001')throw Error('Unexpected database migration version.');
  }else{
    const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610160001_ontology.sql'),'utf8');
    await query('BEGIN;\n'+migration+'\nCOMMIT;');
    console.log('Applied owner-isolated PostgreSQL schema.');
  }
  const form=new FormData();
  form.set('metadata',JSON.stringify({name:'ontology',entrypoint_path:'index.ts',verify_jwt:false}));
  for(const filename of ['index.ts','app.mjs'])form.append('file',new Blob([fs.readFileSync(path.join(__dirname,'../supabase/functions/ontology',filename))],{type:'application/octet-stream'}),filename);
  await api('/functions/deploy?slug=ontology',{method:'POST',body:form});
  console.log('Deployed ontology function. Sign in through the app to verify your own workspace.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
