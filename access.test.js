'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('./server'),{basicWorkspace}=require('./access'),P=require('./projects'),M=require('./ontology-model');
test('Basic data contains only LS graph fields, never private history or other projects',()=>{
  const ws={projects:[{id:'ls',name:'LS',entities:[{id:'step',type:'Production Step',name:'Router',rawLog:'secret',context:'private note'},{id:'risk',type:'Risk',name:'Private issue'},{id:'event',type:'Event',name:'Private message'},{id:'secret',type:'Person',name:'Private person',privacy:'local_only'}],relations:[{id:'r',from:'step',to:'risk',type:'records_on',evidence:'secret'}],workstreams:{step:['production'],risk:['production']},changes:['private']},{id:'other',name:'HELLA',entities:[{name:'secret'}]}],library:{entities:[{name:'secret'}]}};
  const basic=basicWorkspace(ws);assert.equal(basic.projects.length,1);assert.equal(basic.projects[0].entities.length,1);assert.equal(basic.projects[0].entities[0].name,'Router');assert.equal(basic.projects[0].entities[0].context,undefined);assert(!JSON.stringify(basic).includes('secret'));assert.equal(basic.projects[0].relations.length,0);assert.deepEqual(basic.library.entities,[]);
});
test('Server enforces basic/owner access, persistent sessions, password changes and logout',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-access-')),dbPath=path.join(dir,'db.sqlite'),accessPath=path.join(dir,'access.json');let app=createServer({dbPath,port:0,accessPath,initialPassword:'temporary-owner-password'}),base=await app.listen();
  t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  const post=(endpoint,input={},cookie='')=>fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(input)});
  let ws=await(await fetch(base+'/api/workspace')).json();assert.equal(ws.access.mode,'basic');assert.equal((await fetch(base+'/api/export')).status,401);
  for(const endpoint of ['/api/workspace','/api/history/manual','/api/history/query','/api/copilot','/api/extract','/api/wip'])assert.equal((await post(endpoint)).status,401);
  assert.equal((await fetch(base+'/api/history/jobs?scope=library')).status,401);assert.equal((await fetch(base+'/access.json')).status,404);
  assert.equal((await post('/api/access/login',{password:'wrong'})).status,401);
  const login=await post('/api/access/login',{password:'temporary-owner-password'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const cookie=login.headers.get('set-cookie').split(';')[0];
  ws=await(await fetch(base+'/api/workspace',{headers:{Cookie:cookie}})).json();assert.equal(ws.access.mode,'owner');const ls=P.create('LS'),other=P.create('HELLA');M.addEntity(ls,{type:'Production Step',name:'Router'});ws.projects.push(ls,other);
  const save=await post('/api/workspace',{workspace:ws,scope:null,revision:ws.revision},cookie);assert.equal(save.status,200);
  const basic=await(await fetch(base+'/api/workspace')).json();assert.deepEqual(basic.projects.map(p=>p.name),['LS']);assert.equal((await fetch(base+'/api/export',{headers:{Cookie:cookie}})).status,200);
  await app.close();app=createServer({dbPath,port:0,accessPath});base=await app.listen();assert.equal((await(await fetch(base+'/api/access/status',{headers:{Cookie:cookie}})).json()).mode,'owner');
  const secondLogin=await post('/api/access/login',{password:'temporary-owner-password'}),secondCookie=secondLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/access/password',{currentPassword:'wrong',password:'replacement-owner-password'},cookie)).status,401);
  assert.equal((await post('/api/access/password',{currentPassword:'temporary-owner-password',password:'replacement-owner-password'},cookie)).status,200);
  assert.equal((await fetch(base+'/api/export',{headers:{Cookie:secondCookie}})).status,401);assert.equal((await post('/api/access/login',{password:'temporary-owner-password'})).status,401);
  const config=JSON.parse(fs.readFileSync(accessPath,'utf8'));assert(!JSON.stringify(config).includes('replacement-owner-password'));
  assert.equal((await post('/api/access/logout',{},cookie)).status,200);assert.equal((await fetch(base+'/api/export',{headers:{Cookie:cookie}})).status,401);
  for(let i=0;i<5;i++)await post('/api/access/login',{password:'wrong'});assert.equal((await post('/api/access/login',{password:'replacement-owner-password'})).status,429);
});
