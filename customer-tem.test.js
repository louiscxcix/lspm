const {test}=require('node:test'),a=require('node:assert/strict'),M=require('./ontology-model'),W=require('./workflow');
test('customer TEM routes, materials, equipment requirements and named line contacts, without changing LS',()=>{
  const s=require('./local-store').openStore('../.local-data/ontology.sqlite');let w;try{w=s.load();}finally{s.close();}
  const ls=JSON.stringify(w.projects.find(p=>p.name==='LS')),U=require('./update-customer-tem');U.apply(w);
  const p=w.projects.find(p=>p.name==='MOBIS + HELLA');a.equal(p.entities.filter(e=>e.id.startsWith('customer-tem-')&&e.type==='Production Step').length,40);
  for(const id of ['tem-part-bl7m','tem-part-p768-a2']){
    const steps=p.relations.filter(r=>r.type==='applies_to'&&r.to===id).map(r=>M.byId(p,r.from)).filter(e=>e.type==='Production Step'&&!['exception','rework'].includes(e.branchKind));a.equal(steps.length,20);a(steps.every(e=>e.routeAssumption));
    a.equal(p.relations.filter(r=>r.type==='precedes'&&steps.some(e=>e.id===r.from)&&steps.some(e=>e.id===r.to)).length,19);
  }
  const network=W.productionNetwork(p,{line:'TEM',showStakeholders:true});a(network.nodes.some(n=>n.entity.name==='Miguel Angel Vega'));a(network.nodes.some(n=>n.entity.name==='Samuel Luna'));a(network.nodes.some(n=>n.entity.name==='Hector Garrido'));
  a(!p.relations.some(r=>r.type==='assigned_to'&&M.byId(p,r.to)?.type==='Person'));M.validateStore(w.library);M.validateStore(p);a.equal(JSON.stringify(w.projects.find(p=>p.name==='LS')),ls);
  const before=JSON.stringify(w);U.apply(w);a.equal(JSON.stringify(w),before);
});
