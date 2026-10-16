'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createManagementApi,redact}=require('./supabase-management');
const {applyMigrations}=require('./supabase-migrations');
const {verifyBackend}=require('./verify-supabase');
const project='ahzpuefosoajwwgbfhng';
async function main(){
  const mode=process.argv[2]||'--all';
  if(!['--all','--schema-only','--function-only'].includes(mode))throw Error('Use --schema-only, --function-only or no argument.');
  const token=process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if(!token)throw Error('Missing SUPABASE_ACCESS_TOKEN. Add it as a GitHub repository Actions secret, or supply it securely to this process.');
  if(/^(sb_publishable_|sb_secret_|eyJ)/.test(token))throw Error('SUPABASE_ACCESS_TOKEN must be a personal access token from Supabase account settings, not a project API key.');
  if(mode!=='--function-only'){
    const api=createManagementApi({project,token});
    const query=sql=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
    console.log('Checking PostgreSQL migrations for project '+project+'…');
    await applyMigrations(query,path.join(__dirname,'../supabase/migrations'));
  }
  if(mode!=='--schema-only'){
    console.log('Deploying ontology Edge Function with the official Supabase CLI…');
    const cli=path.join(__dirname,'../node_modules/.bin/supabase');
    const result=spawnSync(cli,['functions','deploy','ontology','--project-ref',project,'--use-api','--no-verify-jwt','--yes'],{cwd:path.join(__dirname,'..'),stdio:'inherit',env:{...process.env,SUPABASE_ACCESS_TOKEN:token}});
    if(result.error)throw Error('Could not start Supabase CLI. Run npm ci first.');
    if(result.status!==0){process.exitCode=result.status||1;return;}
    if(mode==='--all')await verifyBackend();
  }
}
main().catch(error=>{
  const message=redact(error.message,process.env.SUPABASE_ACCESS_TOKEN?.trim());
  console.error(message);
  if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Supabase deployment::'+message.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
  process.exitCode=1;
});
