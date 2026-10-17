const assert=require('node:assert/strict'),{apply}=require('./update-g65-marker-cornering'),F=require('./workflow');
const d=require('./local-store').openStore('../.local-data/ontology.sqlite');
try{const p=d.load().projects.find(p=>p.name==='LS');apply(p);assert.equal(apply(p),false);
for(const key of ['side-marker','cornering'])for(const side of ['lh','rh']){const part=p.entities.find(e=>e.id==='ls-g65-'+key+'-'+side);assert.equal(part.itemKind,'product');const graph=F.productionNetwork(p,{line:'LDM',partIds:[part.id]});assert.equal(graph.nodes.filter(n=>n.entity.type==='Production Step'&&!['NG storage','Scrap'].includes(n.entity.productionStage)).length,5);assert.ok(!p.relations.some(r=>r.type==='requires'&&r.from==='ls-step-g65-'+key+'-lam'));}
assert.equal(p.relations.filter(r=>r.type==='produces'&&r.reviewState==='proposed'&&/-(lh|rh)-pcb$/.test(r.to)).length,4);
console.log('LH/RH routes, component quantities, manual LAM, tentative SMT origin and idempotence passed');}finally{d.close();}
