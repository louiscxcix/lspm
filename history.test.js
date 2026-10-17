const assert=require('node:assert/strict'),H=require('./history'),M=require('./ontology-model');
const {openStore}=require('./local-store'),s=openStore(':memory:');
try{
  let w=s.load();w.library.entities.push({id:'step',type:'Production Step',name:'Router',status:'active'},{id:'a',type:'Resource',resourceKind:'machine',name:'A',status:'active'},{id:'b',type:'Resource',resourceKind:'machine',name:'B',status:'active'},{id:'person',type:'Person',name:'Alexis',status:'active'});w.library.relations.push({id:'machine',type:'requires',from:'step',to:'a',scopeProjectId:null,evidence:'Confirmed'});for(const e of [...w.library.entities,...w.library.relations])e.projectId='library';s.save(w,'library',w.revision);
  const h=s.history,source=h.source({scope:'library',text:'Router stopped. Use B tomorrow.'});assert.equal(h.source({scope:'library',text:'Router stopped. Use B tomorrow.'}).sourceId,source.sourceId);
  const job=h.newJob(source.sourceId,'library');const ready=h.finishJob(job.jobId,{events:[{candidateId:'one',title:'Router stop reported',kind:'disruption',reportedAt:'2026-10-06T10:32:00-06:00',subjectIds:['step'],reporterId:'person',proposals:[{effectiveAt:'2099-10-07T08:00:00-06:00',operations:[{kind:'relationship',targetId:'step',type:'requires',relationId:'machine',before:'a',after:'b'}]}]}]});
  const before=s.load().library.entities;const saved=h.commit({jobId:job.jobId,selectedCandidateIds:['one'],revision:s.load().revision});
  assert.deepEqual(s.load().library.entities.filter(e=>before.some(old=>old.id===e.id)),before);
  assert.equal(s.load().library.relations.find(r=>r.id==='machine').to,'a');assert.deepEqual(h.commit({jobId:job.jobId,selectedCandidateIds:['one'],revision:0}).eventIds,saved.eventIds);
  const list=h.list({scope:'library',start:'2026-10-06',end:'2026-10-06'});assert.equal(list.totalDistinct,1);assert.equal(list.items[0].time.basis,'reportedAt');assert.equal(list.counts.step.length,1);
  const detail=h.detail(saved.eventIds[0]);assert.equal(detail.sources[0].text,'Router stopped. Use B tomorrow.');assert(detail.links.some(r=>r.type==='reported_by'));
  h.review({id:saved.proposalIds[0],action:'ready',revision:s.load().revision});assert.throws(()=>h.apply({id:saved.proposalIds[0],revision:s.load().revision}),/not effective/);
  const p=h.propose({eventId:saved.eventIds[0],scope:'library',revision:s.load().revision,operations:[{kind:'relationship',targetId:'step',type:'requires',relationId:'machine',before:'a',after:'b'}]});h.review({id:p.proposalId,action:'ready',revision:s.load().revision});h.apply({id:p.proposalId,revision:s.load().revision});assert.equal(s.load().library.relations.find(r=>r.id==='machine').to,'b');h.apply({id:p.proposalId,reverse:true,revision:s.load().revision});assert.equal(s.load().library.relations.find(r=>r.id==='machine').to,'a');
  const p2=h.propose({eventId:saved.eventIds[0],scope:'library',revision:s.load().revision,operations:[{kind:'relationship',targetId:'step',type:'requires',relationId:'machine',before:'b',after:'a'}]});h.review({id:p2.proposalId,action:'ready',revision:s.load().revision});assert.throws(()=>h.apply({id:p2.proposalId,revision:s.load().revision}),/conflict/);
  assert.equal(H.day('2026-10-07T01:00:00Z'),'2026-10-06');assert(!H.structure(s.load().library).entities.some(e=>e.eventRecord));
  assert.equal(H.visible({eventRecord:{scope:{kind:'explicit_projects',projectIds:['hella']}}},'mobis',['machine'],new Set(['machine'])),false);
  assert.equal(H.visible({eventRecord:{scope:{kind:'unassigned',projectIds:[]}}},'hella',['machine'],new Set(['machine'])),false);
  M.validateStore(s.load().library);console.log('History: provenance, retries, timezone, no state mutation, future blocking, scoped visibility, apply/reverse/conflict passed.');
}finally{s.close();}
