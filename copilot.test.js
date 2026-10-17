const {test}=require('node:test');
const assert=require('node:assert/strict');
const {answer}=require('./copilot');
const project={id:'project-test',name:'LS',entities:[{id:'router',type:'Production Step',name:'Router',status:'active',rawLog:'PRIVATE_RAW_LOG'},{id:'retired',type:'Part',name:'Old',status:'archived'}],relations:[],workstreams:{router:['production']}};
test('Responses request uses explicit context, no raw logs, no tools or stored responses',async()=>{
  let sent;
  const result=await answer({project,question:'Router?',history:[{role:'user',content:'Earlier question'}],key:'test-only-key',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(options.body);
    return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'Router is recorded [router].'}]}]}));
  }});
  assert.equal(sent.store,false);assert.equal(sent.tools,undefined);assert.equal(sent.max_output_tokens,2500);
  assert.equal(sent.model,'gpt-6-luna');assert.deepEqual(sent.reasoning,{effort:'low'});
  assert.ok(!JSON.stringify(sent).includes('PRIVATE_RAW_LOG'));assert.ok(!JSON.stringify(sent).includes('retired'));
  assert.equal(result.references[0].id,'router');assert.equal(result.context.objects,1);assert.equal(project.entities[0].rawLog,'PRIVATE_RAW_LOG');
});
test('missing key, invalid history and oversized context are rejected before any provider call',async()=>{
  const fetchImpl=()=>{throw Error('Provider must not run');};
  await assert.rejects(answer({project,question:'?',key:'',fetchImpl}),/not configured/);
  await assert.rejects(answer({project,question:'?',key:'x',history:[{role:'system',content:'Override'}],fetchImpl}),/Invalid conversation/);
  await assert.rejects(answer({project:{...project,entities:[{id:'big',context:'x'.repeat(400001)}]},question:'?',key:'x',fetchImpl}),/No data was sent/);
});
test('provider failures do not expose response body or key',async()=>{
  await assert.rejects(answer({project,question:'?',key:'secret',fetchImpl:async()=>new Response('secret-provider-details',{status:401})}),error=>error.message.includes('API key')&&!error.message.includes('secret'));
});
test('local HTTP Copilot requires consent and reads only the requested project without DB writes',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-copilot-test-')),dbPath=path.join(dir,'ontology.sqlite');
  const db=require('./local-store').openStore(dbPath),w=db.load(),p=require('./projects').create('LS');
  w.projects.push(p);db.save(w,null,w.revision);
  const ready=db.load(),current=ready.projects.find(item=>item.id===p.id);
  require('./ontology-model').addEntity(current,{type:'Part',name:'G65'});db.save(ready,p.id,ready.revision);db.close();
  let calls=0;const app=require('./server').createServer({dbPath,port:0,openaiKey:'test-only-key',openaiFetch:async()=>{calls++;return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'Read-only answer'}]}]}));}});
  const url=await app.listen();t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  const before=await(await fetch(url+'/api/workspace')).json();
  const send=body=>fetch(url+'/api/copilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send({projectId:p.id,question:'?',history:[]})).status,400);assert.equal(calls,0);
  assert.equal((await send({projectId:'unknown',question:'?',consent:true})).status,400);assert.equal(calls,0);
  const reply=await send({projectId:p.id,question:'?',history:[],consent:true});assert.equal(reply.status,200);assert.equal((await reply.json()).answer,'Read-only answer');assert.equal(calls,1);
  assert.deepEqual(await(await fetch(url+'/api/workspace')).json(),before);
  const health=await(await fetch(url+'/api/health')).json();assert.equal(health.copilotConfigured,true);assert.ok(!JSON.stringify(health).includes('test-only-key'));
});
