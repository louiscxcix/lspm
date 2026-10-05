const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('./ontology-model'),P=require('./projects'),F=require('./workflow');
test('shared machine occurrences inherit their own step route, not all machine uses',()=>{
  const p=P.create('Highlight');
  const add=(type,name,fields={})=>M.addEntity(p,{type,name,...fields});
  const a=add('Part','A',{itemKind:'product'}),b=add('Part','B',{itemKind:'product'}),empty=add('Part','No route',{itemKind:'product'});
  const sa=add('Production Step','A ICT'),sb=add('Production Step','B ICT'),machine=add('Resource','Shared ICT',{resourceKind:'machine',machineMode:'shared_pool'}),material=add('Part','A material',{itemKind:'component'});
  for(const [from,type,to] of [[sa,'applies_to',a],[sb,'applies_to',b],[sa,'requires',machine],[sb,'requires',machine],[sa,'consumes',material]])M.addRelation(p,{from:from.id,type,to:to.id});
  const graph=F.productionNetwork(p),layout=F.productionContextLayout(p,graph);
  assert.equal(layout.satellites.filter(s=>F.belongsToPart(s,a.id)).length,2);
  assert.equal(layout.satellites.filter(s=>s.stepId===sb.id&&F.belongsToPart(s,a.id)).length,0);
  assert.equal(layout.satellites.filter(s=>F.belongsToPart(s,empty.id)).length,0);
  assert.equal(graph.nodes.filter(s=>F.belongsToPart(s,empty.id)).length,0);
  assert.ok(layout.satellites.every(s=>F.belongsToPart(s,'')));
});
test('explicit material scope narrows a shared step occurrence',()=>{
  assert.equal(F.belongsToPart({partIds:['a','b'],relation:{routePartId:'a'}},'b'),false);
  assert.equal(F.belongsToPart({partIds:['a','b'],relation:{routePartId:'a'}},'a'),true);
});
