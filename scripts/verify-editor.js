'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {createManagementApi}=require('./supabase-management');
async function verifyEditor(){
 const api=createManagementApi({project:'ahzpuefosoajwwgbfhng',token:process.env.SUPABASE_ACCESS_TOKEN}),base='https://ahzpuefosoajwwgbfhng.supabase.co';
 const query=(query,parameters=[])=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,...(parameters.length?{parameters}:{})})});
 const keys=await api('/api-keys'),service=keys.find(k=>k.name==='service_role')?.api_key;
 if(!service)throw Error('EDITOR_CHECK_ADMIN_KEY_UNAVAILABLE');
 const publicKey=keys.find(k=>k.name==='anon')?.api_key;
 if(!publicKey)throw Error('EDITOR_CHECK_PUBLIC_KEY_UNAVAILABLE');
 let userId,stage='create-test-account',cleaned=false;
 const email='migration-check-'+randomUUID()+'@example.invalid',password=randomBytes(32).toString('base64url');
 async function request(path,{method='GET',body,auth,key=publicKey}={}){
  const r=await fetch(base+path,{method,headers:{apikey:key,...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const result=await r.json().catch(()=>({}));if(!r.ok)throw Error('EDITOR_CHECK_'+stage.toUpperCase().replaceAll('-','_')+'_HTTP_'+r.status);return result;
 }
 try{
  const user=await request('/auth/v1/admin/users',{method:'POST',key:service,auth:service,body:{email,password,email_confirm:true}});userId=user.id;
  if(!/^[a-f0-9-]{36}$/.test(userId||''))throw Error('EDITOR_CHECK_INVALID_TEST_USER');
  const [owner]=await query('SELECT owner_id FROM pm.publication WHERE singleton=true');if(owner?.owner_id===userId)throw Error('EDITOR_CHECK_OWNER_ISOLATION_FAILED');
  stage='sign-in';const session=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  stage='load-private';let workspace=await request('/functions/v1/ontology/api/workspace',{auth:session.access_token});
  if(workspace.projects.length||workspace.library.entities.length)throw Error('EDITOR_CHECK_ACCOUNT_ISOLATION_FAILED');
  const id='project-'+randomUUID();workspace.projects.push({id,name:'Migration verification',status:'active',createdAt:new Date().toISOString(),version:2,entities:[],relations:[]});
  stage='save-private';workspace=await request('/functions/v1/ontology/api/workspace',{method:'POST',auth:session.access_token,body:{workspace,scope:null,revision:workspace.revision}});
  stage='reload-private';const reloaded=await request('/functions/v1/ontology/api/workspace',{auth:session.access_token});if(!reloaded.projects.some(p=>p.id===id)||reloaded.revision!==workspace.revision)throw Error('EDITOR_CHECK_SAVE_NOT_PERSISTED');
  stage='verify-public-isolation';const published=await request('/functions/v1/ontology/api/public/workspace');if(published.projects.some(p=>p.id===id))throw Error('EDITOR_CHECK_PRIVATE_PROJECT_PUBLISHED');
  console.log('Authenticated editor save/reload and account isolation verified with a temporary account.');
 }finally{
  if(userId){
   stage='cleanup';
   await query("BEGIN; SET CONSTRAINTS ALL DEFERRED; DELETE FROM pm.change_sets WHERE owner_id='"+userId+"'::uuid; DELETE FROM pm.projects WHERE owner_id='"+userId+"'::uuid; DELETE FROM pm.meta WHERE owner_id='"+userId+"'::uuid; COMMIT;");
   await request('/auth/v1/admin/users/'+userId,{method:'DELETE',key:service,auth:service});cleaned=true;
  }
  if(cleaned)console.log('Temporary verification account and its records removed.');
 }
}
if(require.main===module)verifyEditor().catch(e=>{console.error(/^[A-Z_0-9]+$/.test(e.message)?e.message:'EDITOR_CHECK_FAILED');process.exitCode=1;});
module.exports={verifyEditor};
