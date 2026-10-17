const {test}=require('node:test'),a=require('node:assert/strict'),M=require('./ontology-model'),P=require('./projects'),F=require('./workflow');
function fixture(){
 const g={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]};
 require('./update-tem').knowledge(g);
 const w={version:2,library:g,projects:[P.create('LS'),P.create('MOBIS + HELLA')]};require('./update-customer-tem').apply(w);
 return w;
}
const U=()=>require('./update-tem-machine-mapping');
test('TEM names/equipment align with the note without replacing any existing process step or sequence',()=>{
 const w=fixture(),g=w.library,steps=g.entities.filter(e=>e.id.startsWith('tem-biled-step-')).map(e=>e.id),edges=g.relations.filter(r=>r.type==='precedes');
 a.equal(U().applyShared(g),true);
 a.deepEqual(g.entities.filter(e=>e.id.startsWith('tem-biled-step-')).map(e=>e.id),steps);
 a.deepEqual(g.relations.filter(r=>r.type==='precedes'),edges);
 a.equal(M.byId(g,'tem-biled-equipment-11').tier,'TEM / BESI Machine');
 a.equal(M.byId(g,'customer-tem-mobis-tem-biled-equipment-11').tier,'TEM / BESI Machine');
 a.equal(M.byId(g,'tem-biled-step-15').name,'BiLED · Plasma Process');
 a.equal(M.byId(g,'tem-biled-step-19').name,'BiLED · Packing');
 a.equal(M.byId(g,'tem-biled-step-19').productionStage,'Automatic Packing','Stable stage key preserves past/future quantity mapping');
 a.match(M.byId(g,'tem-biled-step-8').context,/exact.*function.*unconfirmed/i);
 a(g.relations.some(r=>r.from==='tem-biled-step-11'&&r.type==='requires'&&r.to==='tem-biled-equipment-11'));
 a.equal(U().applyShared(g),false);M.validateStore(g);
});
test('ambiguous machines are separate line references, not guessed product-route insertions',()=>{
 const w=fixture(),g=w.library;U().applyShared(g);
 for(const key of ['loading-1','loading-2','rivet','aoi']){
  const step=M.byId(g,'tem-reference-step-'+key);a(step);a.equal(step.branchKind,'support');
  a(!g.relations.some(r=>r.type==='applies_to'&&r.from===step.id));
  a(!g.relations.some(r=>r.type==='precedes'&&(r.from===step.id||r.to===step.id)));
 }
 const p=w.projects[1];U().applyProject(p,g);
 const graph=F.productionNetwork(p,{line:'TEM',showStakeholders:true});a(graph.nodes.some(n=>n.id==='tem-reference-step-aoi'));
 a(!require('./progress').projection(graph).nodes.some(n=>n.entity.id.startsWith('tem-reference-step-')));
 const partGraph=F.productionNetwork(p,{line:'TEM',partIds:['tem-part-bl7m']});a(!partGraph.nodes.some(n=>n.id.startsWith('tem-reference-step-')),'Part-only map does not guess correspondence');
 a.equal(F.productionNetwork(p,{line:'LDM'}).nodes.length,0);
 a(F.productionNetwork(p,{line:'TEM',partIds:['tem-part-bl7m','tem-part-p768-a2'],showLineReferences:true}).nodes.some(n=>n.id==='tem-reference-step-rivet'),'Default all-parts UI includes unplaced line references');
 a.equal(U().applyProject(p,g),false);P.validate(p);
});
test('old stage keys and new display labels both resolve to the same existing process',()=>{
 const w=fixture();U().applyShared(w.library);const p=w.projects[1];U().applyProject(p,w.library);
 const Progress=require('./progress'),Logs=require('./production-logs');
 for(const label of ['Plasma','Plasma Process']){
  const parsed=Progress.parse(p,'Part,Step,Quantity,Timestamp\nBL7m PE P,'+label+',12,2026-10-13T09:00:00-06:00');
  a.equal(parsed.rows[0].stepId,'customer-tem-mobis-step-15');
  const logs=Logs.preview(p,'tem-part-bl7m','traceId,step,kind,occurredAt\nunit-a,'+label+',completed,2026-10-13T09:00:00-06:00');
  a.equal(logs.rows[0].stepId,'customer-tem-mobis-step-15');
 }
});
test('equipment candidates link to specific equipment requirements and planned mitigations, never completed incidents',()=>{
 const w=fixture();U().applyShared(w.library);const p=w.projects[1];U().applyProject(p,w.library);
 const risks=p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('tem-machine-risk-'));
 a(risks.length>=10);
 for(const risk of risks){a.equal(risk.status,'unknown');a.match(risk.context,/candidate/i);a(p.relations.some(r=>r.type==='mitigates'&&r.to===risk.id));a(p.relations.some(r=>r.type==='potentially_affects'&&r.from===risk.id&&M.byId(p,r.to)?.type==='Resource'));}
 a(F.relatedRisks(p,'customer-tem-mobis-step-11').some(r=>r.id.includes('bonding')));
 a.equal(p.entities.filter(e=>['Assignment','Event'].includes(e.type)).length,0);
 a.equal(U().applyProject(p,w.library),false);
});
test('only Pressing 3/4 expose cleanliness Risk, while the operation aggregates their risks without sibling bleed',()=>{
 const p=P.create('LS'),add=(id,input)=>{const e=M.addEntity(p,input);e.id=id;return e;};
 add('ls-step-t1-2-uplevel-bending',{type:'Production Step',name:'Pressing'});
 const risk=add('risk-ls-press-cleanliness',{type:'Risk',name:'Press cleaning'});
 for(let n=1;n<=5;n++){
  const machine=add('t1-2-uplevel-press-'+n,{type:'Resource',name:'Pressing '+n,resourceKind:'machine'});
  M.addRelation(p,{from:'ls-step-t1-2-uplevel-bending',type:'requires',to:machine.id});
  if([3,4].includes(n))M.addRelation(p,{from:risk.id,type:'potentially_affects',to:machine.id});
 }
 a(F.relatedRisks(p,'ls-step-t1-2-uplevel-bending').some(r=>r.id===risk.id));
 for(const n of [1,2,5])a(!F.relatedRisks(p,'t1-2-uplevel-press-'+n).some(r=>r.id===risk.id));
 for(const n of [3,4])a(F.relatedRisks(p,'t1-2-uplevel-press-'+n).some(r=>r.id===risk.id));
});
test('basic map retains process display names without exposing Risk or private context',()=>{
 const p=P.create('LS'),e=M.addEntity(p,{type:'Production Step',name:'Plasma Process',productionStage:'Plasma',displayProcessName:'Plasma Process',context:'private-context'});
 M.addEntity(p,{type:'Risk',name:'private-risk'});
 const safe=require('./access').basicWorkspace({projects:[p],library:{entities:[],relations:[]}}).projects[0];
 a.equal(M.byId(safe,e.id).displayProcessName,'Plasma Process');a.equal(M.byId(safe,e.id).context,undefined);a(!safe.entities.some(e=>e.type==='Risk'));
});
