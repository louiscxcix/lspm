const assert=require('node:assert/strict'),O=require('./update-production-organization'),C=require('./update-contact-routes'),F=require('./workflow');
const p={id:'test',entities:[],relations:[],workstreams:{}};O.apply(p);assert.equal(C.apply(p),true);assert.equal(C.apply(p),false);
const line=p.entities.find(e=>e.type==='Resource'&&e.name==='LDM');
let id=line.id;const names=[];for(let i=0;i<3;i++){const r=p.relations.find(r=>r.from===id&&r.type==='escalates_to');assert.ok(r);id=r.to;names.push(p.entities.find(e=>e.id===id).name);}
assert.deepEqual(names,['LDM · Leader team','LDM · Supervisor team','Cesar Alexis Figueroa']);
const graph=F.productionNetwork(p,{line:'LDM',showStakeholders:true});assert.equal(graph.edges.filter(r=>r.type==='reports_via').length,6);
assert.ok(!graph.nodes.some(n=>n.entity.name==='TEM · Leader team'));
assert.ok(!p.relations.some(r=>r.type==='assignment_scope'));
console.log('Role-group reporting, line contact chain, isolation and no station assignments passed');
