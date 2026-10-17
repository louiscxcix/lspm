'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),S=require('./sample-preparation');
function project(id='ls-part-t1-2-uplevel',family='LDM'){
 return {id:'sample',name:'Sample',projectType:'sample',entities:[{id,type:'Part',name:'Selected model',productionFamily:family},{id:'step',type:'Production Step',name:'Pressing'},{id:'line',type:'Resource',resourceKind:'line',name:'Line 2'},{id:'pcb',type:'Part',name:'Input PCB'},{id:'source',type:'Organization',name:'Confirmed supplier'}],relations:[{type:'applies_to',from:'step',to:id},{type:'operated_in',from:'step',to:'line'},{type:'part_of',from:'pcb',to:id},{type:'supplies',from:'source',to:'pcb'}]};
}
test('new worksheet separates prepared date from unknown planned sample date and uses prospective simple questions',()=>{
 const p=project(),s=S.create(p,{partId:p.entities[0].id,runName:'Future sample'});
 a.equal(s.templateVersion,'sample-preparation-v3');a.match(s.preparationDate,/^\d{4}-\d{2}-\d{2}$/);a.equal(s.sampleDate,'');
 const list=S.worksheet(p,s).questions;a.equal(list.length,15);a.match(list.find(q=>q.id==='line-clearance').question,/clean/i);
 a.match(list.find(q=>q.id==='pcb-provenance').question,/made in-house/);
 a.match(list.find(q=>q.id==='traceability').question,/plan|ready/i);
 a.match(list.find(q=>q.id==='closeout').question,/plan|ready/i);
 a.doesNotMatch(list.map(q=>q.question).join(' '),/BOM|provenance|containment|reconciled|calibrat/i);
 a.deepEqual(S.validate(p,s).preparationDate,s.preparationDate);a.equal(S.sanitize(s).preparationDate,s.preparationDate);
});
test('worksheet dates use Mexico City calendar and report time left without claiming a sample happened',()=>{
 const p=project(),s=S.create(p,{partId:p.entities[0].id,runName:'Planned',preparationDate:'2026-10-15',sampleDate:'2026-10-18'});
 const clock='2026-10-16T03:00:00Z',timing=S.worksheet(p,s,clock).timing;
 a.equal(timing.today,'2026-10-15');a.equal(timing.daysUntilSample,3);a.equal(timing.state,'upcoming');
 a.equal(S.worksheet(p,{...s,sampleDate:'2026-10-15'},clock).timing.state,'today');
 a.equal(S.worksheet(p,{...s,sampleDate:'2026-10-14'},clock).timing.state,'past');
 a.equal(S.worksheet(p,{...s,sampleDate:''},clock).timing.state,'not_set');
 a.equal(S.worksheet(p,{...s,preparationDate:'2026-10-19'},clock).timing.preparedAfterSample,true);
 a.throws(()=>S.validate(p,{...s,preparationDate:'2026-02-30'}),/date/i);
});
test('worksheet context stays scoped and distinguishes actual PCB source links from storage and generic graph neighbors',()=>{
 const p=project('other','TEM');p.entities.push({id:'unrelated',type:'Part',name:'Unrelated'},{id:'other-line',type:'Resource',resourceKind:'line',name:'Other line'},{id:'storage',type:'Resource',resourceKind:'facility',name:'Storage'},{id:'outsider',type:'Organization',name:'Not the supplier'});
 p.relations.push({type:'produces',from:'other-line',to:'unrelated'},{type:'receives_from',from:'storage',to:'outsider'},{type:'related_to',from:'other',to:'outsider'});
 const w=S.worksheet(p,S.create(p,{partId:'other'})),before=JSON.stringify(p);
 a.deepEqual(w.context.lines.map(e=>e.id),['line']);a.deepEqual(w.context.pcbSources.map(e=>e.id),['source']);
 a.equal(JSON.stringify(p),before);a.doesNotMatch(w.questions.map(q=>q.question).join(' '),/made in-house|Starpro|Press 3/);
 p.relations.find(r=>r.type==='supplies').reviewState='unverified';a.equal(S.worksheet(p,S.create(p,{partId:'other'})).context.pcbSources[0].unconfirmed,true);
 p.entities.find(e=>e.id==='step').routeAssumption=true;a.equal(S.worksheet(p,S.create(p,{partId:'other'})).context.lines[0].unconfirmed,true);
});
test('uncertainty survives intermediate model links and SMT output producers stay separate from material suppliers',()=>{
 const p=project('pcb-output','SMT');p.entities.push({id:'producer',type:'Resource',resourceKind:'line',name:'Internal SMT'});
 p.relations.push({type:'produces',from:'producer',to:'pcb-output'});
 let context=S.worksheet(p,S.create(p,{partId:'pcb-output'})).context;
 a.deepEqual(context.pcbSources.map(e=>[e.id,e.role]),[['producer','producer']]);
 a.deepEqual(context.inputSuppliers.map(e=>[e.id,e.role]),[['source','supplier']]);
 const recognized=structuredClone(p);recognized.entities[0].id='smt-g65-pcb';delete recognized.entities[0].productionFamily;
 recognized.relations=recognized.relations.map(r=>({...r,from:r.from==='pcb-output'?'smt-g65-pcb':r.from,to:r.to==='pcb-output'?'smt-g65-pcb':r.to}));
 const knownContext=S.worksheet(recognized,S.create(recognized,{partId:'smt-g65-pcb'})).context;
 a.deepEqual(knownContext.pcbSources.map(e=>e.id),['producer']);a.deepEqual(knownContext.inputSuppliers.map(e=>e.id),['source']);
 p.relations.find(r=>r.type==='applies_to').reviewState='unverified';p.relations.find(r=>r.type==='part_of').reviewState='unverified';
 context=S.worksheet(p,S.create(p,{partId:'pcb-output'})).context;
 a.equal(context.lines.find(e=>e.id==='line').unconfirmed,true);a.equal(context.inputSuppliers[0].unconfirmed,true);
 const tem=project('tem-model','TEM');tem.relations.find(r=>r.type==='part_of').reviewState='unverified';
 a.equal(S.worksheet(tem,S.create(tem,{partId:'tem-model'})).context.pcbSources[0].unconfirmed,true);
});
test('new registered SMT models use their declared family while old templates retain exact question definitions',()=>{
 const p=project('new-pcb','SMT'),s=S.create(p,{partId:'new-pcb'});a.equal(s.profile,'smt');
 a.match(S.questions(s).find(q=>q.id==='pcb-provenance').question,/made in-house/);
 const v2={...s,templateVersion:'sample-preparation-v2',profile:'general'};
 a.match(S.questions(v2).find(q=>q.id==='approved-definition').question,/BOM/);a.doesNotThrow(()=>S.validate(p,{...v2,runName:'Legacy'}));
 const v1={...s,templateVersion:'sample-preparation-v1',answers:s.answers.slice(0,14)};a.equal(S.questions(v1),S.QUESTIONS);
 a.equal(S.worksheet(p,v1).questions.length,14);
});
