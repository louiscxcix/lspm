const{test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),M=require('./ontology-model'),H=require('./hourly');
test('SMT demo uses registered G65 PCB and retains people/equipment graph',()=>{
 const p={id:'smt',name:'SMT',status:'active',entities:[{id:'smt-g65-pcb',type:'Part',name:'G65 PCB',itemKind:'component'}],relations:[]};const root={HourlyProduction:H,OntologyModel:M,ProductionProgress:require('./progress')};vm.runInNewContext(fs.readFileSync('./hourly-view.js','utf8'),{globalThis:root,Intl,Date,Map,Set});const view=new root.HourlyView(()=>{},()=>{});view.ctx={store:p,kind:'production'};view.active=true;view.selectedParts=['smt-g65-pcb'];
 const sample=view.sample();a.equal(sample.rows[0].partId,'smt-g65-pcb');a.equal(sample.project.entities[0].name,'G65 PCB');a.equal(p.entities.length,1);
 const graph={nodes:[{id:'machine',entity:{type:'Resource'},partIds:[]},{id:'person',entity:{type:'Person'},partIds:[]}],edges:[],parts:[]};a.equal(view.graph('production',p,graph),graph);
});
test('SMT PCB line graph preserves staff and does not invent finished-product mappings',()=>{
 const p={id:'smt',status:'active',version:2,entities:[],relations:[]},line=M.addEntity(p,{type:'Resource',name:'SMT',resourceKind:'line'});line.id='ls-smt-source-line';const person=M.addEntity(p,{type:'Person',name:'Supervisor'});M.addRelation(p,{from:person.id,type:'manages',to:line.id});
 require('./update-smt-models').apply(p);const graph=require('./workflow').productionNetwork(p,{line:'SMT',showStakeholders:true});for(const id of ['smt-g65-pcb','smt-jp-rh-pcb','smt-lq2-hb-pcb','smt-lq2-lh-pcb','smt-lq2-rh-pcb','smt-line-1','smt-line-2',person.id])a(graph.nodes.some(n=>n.id===id),id);
 a.equal(p.entities.filter(e=>e.type==='Production Step').length,0);a(!p.relations.some(r=>r.type==='part_of'&&M.byId(p,r.from)?.type==='Part'));a.equal(require('./update-smt-models').apply(p),false);
});
test('local model time versions persist without changing production observations',()=>{
 const os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-smt-rate-')),db=require('./local-store').openStore(path.join(dir,'db.sqlite')),P=require('./projects');try{const p=P.create('SMT'),pcb=M.addEntity(p,{type:'Part',name:'G65 PCB',itemKind:'component'});let w=db.load();w.projects.push(p);w=db.save(w,null,w.revision);w.projects[0]=p;w=db.save(w,p.id,w.revision);
 db.hourlyRateSave({projectId:p.id,revision:w.revision,partId:pcb.id,unitTimeSeconds:6,effectiveDate:'2026-10-10'});const rates=db.load().viewSettings[p.id].hourlyRates;a.equal(H.rateFor(rates,pcb.id,'2026-10-09'),null);a.equal(H.capacity(H.rateFor(rates,pcb.id,'2026-10-10').unitTimeSeconds).target,510);a.equal(db.listHourly(p.id).length,0);a.equal(db.history.list({scope:p.id}).totalDistinct,0);a.throws(()=>db.hourlyRateSave({projectId:p.id,revision:w.revision,partId:pcb.id,unitTimeSeconds:7,effectiveDate:'2026-10-11'}),/STALE/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('model time gives 85 percent capacity with effective production day and no fabricated time',()=>{
 a.equal(H.capacity(6).uph,600);a.equal(H.capacity(6).target,510);a.equal(H.capacity(null),null);a.throws(()=>H.capacity(-1));
 a.equal(H.productionDay('2026-10-11T06:00:00-06:00'),'2026-10-10');a.equal(H.productionDay('2026-10-11T07:00:00-06:00'),'2026-10-11');
 const p={status:'active',entities:[{id:'pcb',type:'Part',itemKind:'component'}],relations:[]};a.equal(H.rate(p,{partId:'pcb',unitTimeSeconds:6,effectiveDate:'2026-10-10'}).margin,0.15);a.throws(()=>H.rate(p,{partId:'missing',unitTimeSeconds:6,effectiveDate:'2026-10-10'}));
});
