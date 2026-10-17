const {test}=require('node:test'),a=require('node:assert/strict'),H=require('./history'),C=require('./cloud-domain');
test('History distinguishes actions from WIP and aggregates importance before pagination',()=>{
  for(const kind of ['risk','response','resolution'])a(H.KINDS.includes(kind));
  const event=(id,kind,importance='normal',recordClass='business')=>({id,type:'Event',name:id,eventRecord:{schemaVersion:1,recordClass,kind,importance,lifecycle:'active',statementMode:'reported_fact',verification:'reported',timePrecision:'exact',recordedAt:'2026-10-08T15:00:00Z',scope:{kind:'shared',projectIds:[]}}});
  const entities=[event('normal','observation'),event('reply','response'),event('fixed','resolution'),event('urgent','disruption','critical'),event('wip','observation','normal','production_log')];
  const w={library:{entities,relations:entities.map(e=>({id:e.id+'-r',from:e.id,to:'step',type:'records_on'}))},projects:[]};
  const result=C.query(w,{limit:1,focus:'actionable'});
  a.equal(result.totalDistinct,3);a.equal(result.items.length,1);a.equal(result.counts.step.length,3);a.equal(result.priorities.step,'critical');
  a.equal(C.query(w,{}).totalDistinct,4);a.equal(H.priority({kind:'disruption',importance:'normal'}),'attention');a.equal(H.priority({kind:'resolution',importance:'normal'}),'resolved');
});
