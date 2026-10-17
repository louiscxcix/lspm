'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),S=require('./sample-preparation');
const makeProject=(partId='ls-part-t1-2-uplevel')=>({id:'p',projectType:'sample',entities:[
 {id:partId,type:'Part',name:'Selected model'},{id:'step',type:'Production Step',name:'Pressing'},
 {id:'press-3',type:'Resource',name:'Pressing 3'},{id:'other-press',type:'Resource',name:'Other model press'},
 {id:'clean',type:'Risk',name:'Press cleanliness'},{id:'unlinked',type:'Risk',name:'Other equipment risk'},
 {id:'action',type:'Work Item',name:'Clean and verify first piece',status:'planned'}
],relations:[{type:'applies_to',from:'step',to:partId},{type:'requires',from:'step',to:'press-3'},
 {type:'potentially_affects',from:'clean',to:'press-3'},{type:'potentially_affects',from:'unlinked',to:'other-press'},
 {type:'mitigates',from:'action',to:'clean'}]});
test('legacy v2 retains its 15-question model-specific template without changing frozen v1',()=>{
 const p=makeProject(),before=structuredClone(p),sheet={...S.create(p,{partId:p.entities[0].id,runName:'Trial'}),templateVersion:'sample-preparation-v2'};
 a.equal(sheet.templateVersion,'sample-preparation-v2');a.equal(sheet.profile,'t1-2');a.equal(S.questions(sheet).length,15);
 a.equal(S.QUESTIONS.length,14);a.equal(S.questions({templateVersion:'sample-preparation-v1'}),S.QUESTIONS);
 a.match(S.questions(sheet).find(q=>q.id==='pcb-provenance').guidance,/internally produced/i);
 a.match(S.questions(sheet).find(q=>q.id==='line-clearance').guidance,/Pressing 3.*Pressing 4/);
 a.ok(sheet.answers.every(x=>x.status==='unknown'&&!x.ownerId&&!x.referenceIds.length));a.deepEqual(p,before);
 a.equal(S.summary(sheet).total,15);a.equal(S.summary(sheet).unknown,15);
});
test('profiles use confirmed model IDs, not model-name guesses or inferred machines',()=>{
 for(const [id,profile] of [['smt-g65-pcb','smt'],['smt-jp-rh-pcb','smt'],['smt-lq2-hb-pcb','smt'],['smt-lq2-lh-pcb','smt'],['smt-lq2-rh-pcb','smt'],['tem-part-p768-a2','tem'],['tem-part-bl7m','tem'],['unknown','general']]){
  const p=makeProject(id);p.entities[0].name='T1-2 Uplevel';a.equal(S.profileFor(p,id),profile);
 }
 const s={...S.create(makeProject('smt-g65-pcb'),{partId:'smt-g65-pcb'}),templateVersion:'sample-preparation-v2'},text=S.questions(s).map(q=>q.guidance).join(' ');
 a.doesNotMatch(text,/Pressing 3|Pressing 4/);a.match(text,/PCB/);a.match(text,/review suggestion/i);
});
test('date, optional quantity and memo survive validation and viewer projection; malformed values fail',()=>{
 const p=makeProject(),s=S.create(p,{partId:p.entities[0].id,runName:'Trial'});
 a.equal(s.sampleDate,'');a.match(s.preparationDate,/^\d{4}-\d{2}-\d{2}$/);a.equal(s.sampleQuantity,null);a.equal(s.memo,'');
 Object.assign(s,{sampleDate:'2026-10-15',sampleQuantity:120,memo:' First piece trial. '});
 const out=S.validate(p,s);a.equal(out.memo,'First piece trial.');a.equal(out.sampleQuantity,120);
 const safe=S.sanitize(out);a.equal(safe.sampleDate,out.sampleDate);a.equal(safe.sampleQuantity,120);a.equal(safe.profile,'t1-2');a.equal(safe.memo,out.memo);a.doesNotThrow(()=>S.validate(p,safe));
 for(const patch of [{sampleDate:'2026-02-30'},{sampleDate:'invalid'},{sampleQuantity:-1},{sampleQuantity:0},{sampleQuantity:1.5},{sampleQuantity:'12'},{sampleQuantity:Number.MAX_SAFE_INTEGER+1},{memo:'x'.repeat(1001)},{profile:'tem'}])a.throws(()=>S.validate(p,{...s,...patch}));
});
test('legacy v1 runs keep their exact questions and can be revised with optional print metadata',()=>{
 const p=makeProject(),s={id:'legacy',partId:p.entities[0].id,runName:'Old run',templateVersion:'sample-preparation-v1',version:3,answers:S.QUESTIONS.map(q=>({questionId:q.id,status:'unknown',note:'',ownerId:null,referenceIds:[]}))};
 a.deepEqual(S.validate(p,s),s);a.equal(S.summary(s).total,14);a.equal(S.sanitize(s).profile,undefined);
 a.equal(S.validate(p,{...s,sampleDate:'2026-10-10',sampleQuantity:50,memo:'Legacy run.'}).sampleQuantity,50);
});
test('risk context follows explicit model/process/equipment links and separates unconfirmed references',()=>{
 const p=makeProject(),before=structuredClone(p),review=S.riskReview(p,p.entities[0].id);
 a.deepEqual(review.linked.map(x=>x.risk.id),['clean']);a.deepEqual(review.references.map(x=>x.risk.id),['unlinked']);
 a.deepEqual(review.linked[0].mitigations.map(x=>x.id),['action']);a.deepEqual(p,before);
 a.deepEqual(S.riskReview(p,''),{linked:[],references:[]});
 p.relations.push({type:'related_to',from:'step',to:'other-press'});a.deepEqual(S.riskReview(p,p.entities[0].id).linked.map(x=>x.risk.id),['clean']);
});
test('risk on a model-specific preparation Work Item stays linked without unrelated graph expansion',()=>{
 const p=makeProject();p.entities.push({id:'setup',type:'Work Item',name:'Model setup readiness'},{id:'setup-risk',type:'Risk',name:'Setup incomplete'});
 p.relations.push({type:'applies_to',from:'setup',to:p.entities[0].id},{type:'potentially_affects',from:'setup-risk',to:'setup'});
 a.ok(S.riskReview(p,p.entities[0].id).linked.some(x=>x.risk.id==='setup-risk'));
});
