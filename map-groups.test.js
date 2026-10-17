const assert=require('node:assert/strict');
const {groupGraph}=require('./map-groups');
const graph={entities:[{id:'p',productFamily:'G65'},{id:'s'},{id:'x'}],relations:[{from:'s',to:'p',type:'applies_to'},{from:'s',to:'x',type:'precedes'}],context:new Set(),boundary:new Set()};
const folded=groupGraph(graph,'parts');
assert.equal(folded.entities.length,2);
assert(folded.relations.some(r=>r.from==='group:parts:G65'&&r.to==='x'));
assert.equal(groupGraph(graph,'parts',['group:parts:G65']).entities.length,3);
assert.equal(graph.relations.length,2);
const d=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const p=d.load().projects.find(x=>x.name==='LS');assert(p.entities.some(e=>e.id==='ls-family-g65'));assert(p.relations.some(r=>r.from==='ls-part-g65-main'&&r.to==='ls-family-g65'&&r.type==='part_of'));assert.equal(require('./update-part-tiers').apply(p),false);}finally{d.close();}
console.log('Group connection preservation, expansion and idempotent Part tiers passed');
const {universalGraph,universalLayout}=require('./map-groups'),F=require('./workflow');
const sample={...graph,entities:[...graph.entities,{id:'q',type:'Part',productFamily:'LQ2',status:'active'},{id:'person',type:'Person',department:'Production',status:'active'}].map(e=>({type:'Part',status:'active',...e}))};
const initial=universalGraph(sample),foldedUniversal=universalGraph(sample,['universal:Part family:G65']);
assert(initial.entities.some(e=>e.id==='s'));
assert(foldedUniversal.relations.some(r=>r.from==='universal:Part family:G65'&&r.to==='x'));
for(const input of [initial,foldedUniversal,universalGraph(sample)]){
  const output=universalLayout(input,F.layout),boxes=Object.values(output.positions);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert(!(boxes[i].x<boxes[j].x+220&&boxes[i].x+220>boxes[j].x&&boxes[i].y<boxes[j].y+94&&boxes[i].y+94>boxes[j].y));
  for(const f of output.frames)for(const e of input.groups.get(f.id).members){const p=output.positions[e.id];assert(p.x>=f.x&&p.x+220<=f.x+f.width&&p.y>=f.y+44&&p.y+94<=f.y+f.height);}
}
console.log('Universal default-expanded groups, cross-group links and collapse/reexpand collision checks passed');
const {flowGroupLayout}=require('./map-groups');
const route=[{id:'a',type:'Production Step'},{id:'b',type:'Production Step'},{id:'c',type:'Production Step'},{id:'part',type:'Part'}].map(e=>({status:'active',...e}));
const routeEdges=[{from:'a',to:'b',type:'precedes'},{from:'b',to:'c',type:'precedes'},{from:'b',to:'part',type:'produces'}];
const routeLayout=flowGroupLayout(route,routeEdges,F.layout);
assert.equal(routeLayout.positions.a.x,routeLayout.positions.c.x);
assert(routeLayout.positions.a.y<routeLayout.positions.b.y&&routeLayout.positions.b.y<routeLayout.positions.c.y);
assert(routeLayout.positions.part.x>routeLayout.positions.b.x+220);
console.log('Normal route alignment and side-context separation passed');
const withInput=[...route,{id:'pcb',type:'Part',itemKind:'component',status:'active'}].map(e=>({name:e.id,...e}));
const withInputEdges=[...routeEdges,{from:'b',to:'pcb',type:'consumes'}];
const inputLayout=flowGroupLayout(withInput,withInputEdges,F.layout);
assert(inputLayout.positions.pcb.x<inputLayout.positions.b.x);
assert.equal(inputLayout.positions.pcb.y,inputLayout.positions.b.y);
assert(inputLayout.positions.part.x>inputLayout.positions.b.x);
console.log('Production engine places input/output Components beside their consuming/producing step');
