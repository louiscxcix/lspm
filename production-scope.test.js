const assert=require('node:assert/strict');
const Flow=require('./workflow');
const p={entities:[
  {id:'step',type:'Production Step',name:'Router',status:'active'},
  {id:'part',type:'Part',name:'Plate',status:'active'},
  {id:'machine',type:'Resource',name:'Router',status:'active'},
  {id:'risk',type:'Risk',name:'Orientation',status:'unknown'},
  {id:'sales',type:'Work Item',name:'Sell',status:'active'},
  {id:'other',type:'Part',name:'Unrelated',status:'active'}
],relations:[
  {id:'r1',from:'step',to:'part',type:'consumes'},
  {id:'r2',from:'step',to:'machine',type:'requires'},
  {id:'r3',from:'risk',to:'step',type:'potentially_affects'},
  {id:'r4',from:'sales',to:'machine',type:'requires'},
  {id:'r5',from:'sales',to:'other',type:'applies_to'}
],workstreams:{step:['production'],sales:['commercial']}};
assert.deepEqual(new Set(Flow.workstreamRecords(p,'production').map(e=>e.id)),new Set(['step','part','machine','risk']));
assert.deepEqual(Flow.relatedRisks(p,'part').map(e=>e.id),['risk']);
assert.deepEqual(Flow.relatedRisks(p,'machine').map(e=>e.id),['risk']);
assert.deepEqual(Flow.relatedRisks(p,'other'),[]);
console.log('PASS: bounded production scope and contextual risks');
const lines={entities:[{id:'ldm',type:'Part',name:'G65',status:'active',productionFamily:'LDM'}, {id:'step',type:'Production Step',name:'Integration',status:'active'}, {id:'orphan',type:'Production Step',name:'Unassigned',status:'active'}],relations:[{id:'route',from:'step',to:'ldm',type:'applies_to'}]};
assert.equal(Flow.productionNetwork(lines,{line:'LDM'}).nodes.length,1);
for(const line of ['Nexlide','TEM','SMT'])assert.equal(Flow.productionNetwork(lines,{line}).nodes.length,0);
assert.equal(Flow.productionNetwork(lines,{line:'TEM',partIds:['ldm']}).parts.length,0);
console.log('PASS: line maps isolate routes; empty lines never inherit LDM or orphan steps');
assert.deepEqual(Flow.selectionNeighborhood(p,new Set(['part','other'])),new Set(['part','step','other','sales']));
assert.deepEqual(Flow.selectionNeighborhood(p,new Set()),new Set());
console.log('PASS: multi-selection union is direct, not transitive');
