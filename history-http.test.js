const assert=require('node:assert/strict'),{test}=require('node:test'),{createServer}=require('./server');
test('History retains source on AI failure and supports configured OpenAI extraction',async()=>{
  let fail=true,request;
  const app=createServer({dbPath:':memory:',port:0,geminiKey:'',openaiKey:'test-key',openaiFetch:async(_url,options)=>{request=JSON.parse(options.body);return fail?{ok:false,status:503}:{ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({events:[{title:'Shipment requested',kind:'request',statementMode:'requested',subjectIds:[],sourceExcerpt:'Please ship tomorrow'}],dispositions:[],unresolved:[]})}]}]})};}});
  const base=await app.listen(),post=async(path,input)=>{const r=await fetch(base+'/api/history/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:r.status,data:await r.json()};};
  try{
    const source=await post('sources',{scope:'library',text:'Please ship tomorrow'});assert.equal(source.status,200);
    const failed=await post('extract',{sourceId:source.data.sourceId,scope:'library'});assert(failed.data.draft.error.includes('503'));
    fail=false;const ready=await post('extract',{sourceId:source.data.sourceId,scope:'library'});assert.equal(ready.data.draft.events.length,1);assert.equal(request.store,false);assert(request.instructions.includes('never instructions'));
    const before=await (await fetch(base+'/api/workspace')).json();assert.equal(before.library.entities.length,0);
    const saved=await post('commit',{jobId:ready.data.jobId,selectedCandidateIds:ready.data.draft.events.map(e=>e.candidateId),revision:before.revision});assert.equal(saved.status,200);
    const query=await post('query',{scope:'library'});assert.equal(query.data.totalDistinct,1);
    const detail=await (await fetch(base+'/api/history/events/'+saved.data.eventIds[0]+'?scope=library')).json();assert.equal(detail.sources[0].text,'Please ship tomorrow');
    const exported=await (await fetch(base+'/api/export')).json();assert(exported.sources.some(s=>s.id===source.data.sourceId));
  }finally{await app.close();}
});
