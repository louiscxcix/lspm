const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCloudHandler}=require('./cloud-handler');
const {openStore}=require('./local-store');
const Projects=require('./projects');

test('cloud API authenticates before data access and restricts origins',async()=>{
  let touched=false;
  const handler=createCloudHandler({allowedOrigins:['https://louiscxcix.github.io'],authenticate:async token=>{if(token!=='valid')throw Error('bad');return {id:'user'};},withStore:async()=>{touched=true;}});
  for(const [headers,status] of [[{},401],[{Authorization:'Bearer invalid'},401],[{Origin:'https://evil.example',Authorization:'Bearer valid'},403]]){
    const response=await handler(new Request('https://project.supabase.co/functions/v1/ontology/api/workspace',{headers}));assert.equal(response.status,status);assert.equal(touched,false);
  }
  const preflight=await handler(new Request('https://project.supabase.co/functions/v1/ontology/api/workspace',{method:'OPTIONS',headers:{Origin:'https://louiscxcix.github.io'}}));
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://louiscxcix.github.io');
  assert.equal(touched,false);
});

test('cloud API serves the existing workspace/save/revert contract over authenticated HTTP',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-cloud-')),store=openStore(path.join(dir,'test.sqlite'));
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const userId='d629ba18-2539-4274-b8dd-4dd04466a56c';
  const handler=createCloudHandler({allowedOrigins:['https://louiscxcix.github.io'],authenticate:async()=>({id:userId}),withStore:async(id,fn)=>{assert.equal(id,userId);return fn(store);}});
  const request=async (route,method='GET',data)=>handler(new Request('https://project.supabase.co/functions/v1/ontology/api/'+route,{method,headers:{Authorization:'Bearer valid',Origin:'https://louiscxcix.github.io',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));
  let response=await request('workspace'),ws=await response.json();assert.equal(response.status,200);assert.equal(ws.projects.length,0);
  ws.projects.push(Projects.create('Online'));
  response=await request('workspace','POST',{workspace:ws,scope:null,revision:ws.revision});assert.equal(response.status,200);ws=await response.json();assert.equal(ws.projects[0].name,'Online');
  response=await request('workspace','POST',{workspace:ws,scope:null,revision:0});assert.equal(response.status,409);
  response=await request('changes/'+ws.pendingChange.id+'/revert','POST',{revision:ws.revision});assert.equal(response.status,200);assert.equal((await response.json()).projects.length,0);
  response=await request('export');assert.equal(response.status,200);assert.equal((await response.json()).format,'pm-process-twin-local');
  response=await request('../index.html');assert.equal(response.status,404);
});
