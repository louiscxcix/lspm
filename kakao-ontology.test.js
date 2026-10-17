const assert=require('node:assert/strict'),I=require('./import-kakao-ontology'),M=require('./ontology-model');
const d=require('./local-store').openStore('../.local-data/ontology.sqlite');try{
  const w=d.load(),p=w.library,events=p.entities.filter(e=>e.id.startsWith('kakao-message-'));
  assert(events.length>=102);
  assert(events.every(e=>e.privacy==='local_only'&&(e.occurredAt||e.eventRecord?.reportedAt)&&p.relations.some(r=>r.from===e.id&&r.type==='supported_by'&&M.byId(p,r.to)?.rawLog)));
  const authored=events.filter(e=>e.sourceMessageType!==0);
  assert(authored.every(e=>p.relations.some(r=>r.from===e.id&&r.type==='reported_by'&&M.byId(p,r.to)?.type==='Person')));
  assert(p.entities.some(e=>e.id==='kakao-t1xl-plan-v3'));
  const msgs=events.map(e=>{const r=p.relations.find(r=>r.from===e.id&&r.type==='reported_by'),person=r&&M.byId(p,r.to),raw=p.relations.find(r=>r.from===e.id&&r.type==='supported_by');return {room:e.sourceChat,chatId:e.sourceChatId,logId:e.sourceMessageId,authorId:person?.kakaoAuthorId||'0',sender:person?.name||'(unknown)',type:e.sourceMessageType,time:e.occurredAt||e.eventRecord?.reportedAt,text:M.byId(p,raw.to).rawLog};});
  assert.equal(I.apply(p,msgs).changed,false);
  assert(w.projects.every(project=>!project.entities.some(e=>e.privacy==='local_only')));
  const clean=require('./public-privacy').removePrivateRecords(structuredClone(w));
  assert(!JSON.stringify(clean).includes('kakao-message-'));
  assert(!clean.library.entities.some(e=>e.privacy==='local_only'));
  console.log('102 source records, sender/time provenance, private export exclusion and idempotence passed');
}finally{d.close();}
