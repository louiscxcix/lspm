'use strict';
const path=require('node:path'),M=require('./ontology-model');
function prepare(w){
  const p=w.library,legacy=p.entities.filter(e=>e.type==='Event'&&e.sourceChatId),changes=legacy.filter(e=>!e.eventRecord),findings=p.entities.filter(e=>e.id.startsWith('kakao-')&&['Issue','Work Item'].includes(e.type));
  for(const e of changes){
    const reported=e.occurredAt||null;e.eventRecord={schemaVersion:1,recordClass:'source_report',kind:'communication',statementMode:'reported_fact',verification:'reported',lifecycle:'active',importance:'normal',occurredAt:null,occurredDate:null,reportedAt:reported,recordedAt:e.recordedAt||reported||new Date().toISOString(),effectiveAt:null,timePrecision:'unknown',timezone:'America/Mexico_City',scope:{kind:'unassigned',projectIds:[]},visibility:'local_only',facets:[],legacyMessageTime:{occurredAt:e.occurredAt||null,occurredDate:e.occurredDate||null}};
    delete e.occurredAt;delete e.occurredDate;
    for(const r of p.relations.filter(r=>r.from===e.id&&r.type==='supported_by')){const evidence=M.byId(p,r.to);if(evidence)evidence.historySource=true;}
  }
  const events=findings.map(f=>{
    const reports=p.relations.filter(r=>r.type==='records_on'&&r.to===f.id).map(r=>M.byId(p,r.from)).filter(e=>e?.type==='Event'),reportIds=new Set(reports.map(e=>e.id)),links=p.relations.filter(r=>reportIds.has(r.from)),evidenceIds=[...new Set(links.filter(r=>r.type==='supported_by').map(r=>r.to))],reporterIds=[...new Set(links.filter(r=>r.type==='reported_by').map(r=>r.to))];
    const sourceExcerpt=evidenceIds.map(id=>M.byId(p,id)?.rawLog||'').join('\n\n');
    const subjectIds=[...new Set([f.id,...links.filter(r=>r.type==='records_on'&&!findings.some(f=>f.id===r.to)).map(r=>r.to),...p.relations.filter(r=>r.from===f.id&&r.type==='potentially_affects').map(r=>r.to)])];
    return {candidateId:'review-'+f.id,title:f.name,summary:f.context,kind:f.type==='Issue'?/inventory|stock/i.test(f.name)?'observation':'disruption':/plan|request/i.test(f.name)?'request':'progress',statementMode:/request|plan/i.test(f.name)?'requested':'reported_fact',reportedAt:reports.map(e=>e.eventRecord.reportedAt).filter(Boolean).sort().at(-1)||null,subjectIds,reporterIds,reporterId:reporterIds.length===1?reporterIds[0]:'',reporterLabel:reporterIds.map(id=>M.byId(p,id)?.name).join(', '),evidenceIds,sourceExcerpt,facets:['production'],unresolved:['기존 보고에서 정리한 후보입니다. 대상 공정·발생 시각·후속 관계를 검토하세요.'],proposals:[]};
  });
  return {sourceCount:legacy.length,changedCount:changes.length,events};
}
async function migrate(db,apply=false){
  const w=db.load(),draft=prepare(w);if(!apply)return {sourceCount:draft.sourceCount,changedCount:draft.changedCount,candidates:draft.events.length};
  const backup=path.resolve(__dirname,'../.local-data/ontology-before-history-'+Date.now()+'.sqlite');await db.backup(backup);
  for(const event of w.library.entities.filter(e=>e.sourceChatId)){
    const links=w.library.relations.filter(r=>r.from===event.id),reporter=M.byId(w.library,links.find(r=>r.type==='reported_by')?.to);
    for(const relation of links.filter(r=>r.type==='supported_by')){const evidence=M.byId(w.library,relation.to);if(!evidence?.rawLog)continue;const source=db.history.source({scope:'library',text:evidence.rawLog,filename:evidence.name,metadata:{provider:'kakao',account:'local-kakao',roomId:event.sourceChatId,externalId:event.sourceMessageId,senderId:reporter?.kakaoAuthorId||'',senderName:reporter?.name||'',sentAt:event.eventRecord.reportedAt,sourceType:event.sourceMessageType}});evidence.sourceId=source.sourceId;}
  }
  if(draft.changedCount)db.save(w,'library',w.revision);
  const existing=db.history.jobs('library').find(j=>j.draft.migration==='kakao-history-v1');
  let job=existing?{jobId:existing.id}:null;
  if(!job&&draft.events.length){const raw=w.library.entities.filter(e=>e.id.startsWith('kakao-evidence-')).map(e=>e.name+'\n'+e.rawLog).join('\n\n');const source=db.history.source({scope:'library',text:raw,filename:'Kakao retained reports · reviewed history candidates',metadata:{migration:'kakao-history-v1'}});job=db.history.newJob(source.sourceId,'library');db.history.finishJob(job.jobId,{migration:'kakao-history-v1',events:draft.events,dispositions:[{action:'review_existing_findings',sourceRecords:draft.sourceCount,eventCandidates:draft.events.length}],unresolved:['프로젝트 범위 미배정. Global Library에서 검토합니다.']});}
  return {sourceCount:draft.sourceCount,converted:draft.changedCount,candidates:draft.events.length,jobId:job?.jobId,backup,revision:db.load().revision};
}
module.exports={prepare,migrate};
if(require.main===module){const db=require('./local-store').openStore(process.env.PM_DB_PATH||path.resolve(__dirname,'../.local-data/ontology.sqlite'));migrate(db,process.argv.includes('--apply')).then(result=>console.log(JSON.stringify(result))).finally(()=>db.close());}
