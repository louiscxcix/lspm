const {test}=require('node:test'),a=require('node:assert/strict'),M=require('./ontology-model'),F=require('./workflow');
test('TEM people and customer routes share canonical IDs across LS and customer project, with side-only support',()=>{
 const s=require('./local-store').openStore('../.local-data/ontology.sqlite');let w;try{w=s.load();}finally{s.close();}
 const U=require('./update-tem-stakeholders');U.apply(w);
 for(const name of ['LS','MOBIS + HELLA']){
  const p=w.projects.find(p=>p.name===name);for(const id of ['tem-person-jose-luis','tem-person-lee-jeongho','tem-team-production','tem-team-engineering'])a(p.entities.some(e=>e.id===id));
  a.equal(p.entities.filter(e=>e.type==='Production Step'&&e.id.startsWith('customer-tem-')).length,40);
  const graph=F.productionNetwork(p,{line:'TEM',showStakeholders:true});for(const name of ['Jose Luis','이정호','Miguel Angel Vega','Hector Garrido'])a(graph.nodes.some(n=>n.entity.name===name),name);
  const without=F.productionNetwork(p,{line:'TEM',showStakeholders:false});a(!without.nodes.some(n=>n.entity.type==='Person'));
  const ldm=F.productionNetwork(p,{line:'LDM',showStakeholders:true});a(!ldm.nodes.some(n=>['Jose Luis','이정호'].includes(n.entity.name)));
  const layout=F.productionContextLayout(p,graph,{showMachines:true,showComponents:true}),plain=F.productionContextLayout(p,without,{showMachines:true,showComponents:true});
  for(const n of without.nodes.filter(n=>n.entity.type==='Production Step'))a.deepEqual(layout.positions[n.id],plain.positions[n.id]);
  const processRight=Math.max(...without.nodes.filter(n=>n.entity.type==='Production Step').map(n=>plain.positions[n.id].x+194));
  for(const n of graph.nodes.filter(n=>n.entity.type==='Person'))a(layout.positions[n.id].x>processRight);
  a(!p.relations.some(r=>['assigned_to','manages'].includes(r.type)&&r.from==='tem-person-jose-luis'));M.validateStore(p);
 }
 a.equal(w.library.entities.filter(e=>e.name==='Jose Luis').length,1);a.equal(w.library.entities.filter(e=>e.name==='이정호').length,1);
 const previous=JSON.stringify(w);U.apply(w);a.equal(JSON.stringify(w),previous);
});
test('support means line-level organizational help, never station allocation',()=>{
 const p={entities:[{id:'team',type:'Organization'},{id:'machine',type:'Resource',resourceKind:'machine'},{id:'line',type:'Resource',resourceKind:'line'}],relations:[]};
 a.match(M.validateRelation(p,{from:'team',to:'machine',type:'supports_line'}),/production line/);a.equal(M.validateRelation(p,{from:'team',to:'line',type:'supports_line'}),'');
});
