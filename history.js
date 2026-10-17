(function(root){
  const KINDS=['disruption','risk','response','resolution','change','request','decision','progress','observation','communication','other'];
  const MODES=['reported_fact','observed_fact','requested','planned','decided'];
  const enumValue=(value,allowed,label)=>{if(!allowed.includes(value))throw Error('Invalid '+label);};
  const stamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
  function validateEvent(r){
    if(!r||typeof r!=='object'||Array.isArray(r)||r.schemaVersion!==1)throw Error('Invalid history schema.');
    enumValue(r.recordClass,['business','source_report','production_log'],'record class');
    enumValue(r.kind,KINDS,'event kind');enumValue(r.statementMode,MODES,'statement mode');
    enumValue(r.verification,['reported','verified','disputed'],'verification');
    enumValue(r.lifecycle,['active','superseded','retracted'],'lifecycle');
    enumValue(r.timePrecision,['exact','date','approximate','unknown'],'time precision');
    enumValue(r.importance,['normal','attention','critical'],'importance');
    for(const key of ['occurredAt','reportedAt','recordedAt','effectiveAt'])if(r[key]&&!stamp(r[key]))throw Error(key+' needs an ISO timestamp with timezone.');
    if(r.occurredDate&&(!/^\d{4}-\d\d-\d\d$/.test(r.occurredDate)||!Number.isFinite(Date.parse(r.occurredDate))||new Date(r.occurredDate).toISOString().slice(0,10)!==r.occurredDate))throw Error('Invalid event date.');
    for(const field of ['facets','observations','unresolved'])if(r[field]!=null&&(!Array.isArray(r[field])||r[field].length>100))throw Error('Invalid '+field);
    new Intl.DateTimeFormat('en',{timeZone:r.timezone||'America/Mexico_City'});
    if(!r.scope||!['explicit_projects','shared','unassigned'].includes(r.scope.kind)||!Array.isArray(r.scope.projectIds))throw Error('Invalid event scope.');
    if(r.scope.kind==='explicit_projects'&&!r.scope.projectIds.length)throw Error('Choose a project.');
    if(r.scope.kind!=='explicit_projects'&&r.scope.projectIds.length)throw Error('Unexpected project scope.');
    if(JSON.stringify(r).length>24000)throw Error('Event details exceed 24 KB.');
    return r;
  }
  const dateFormatters=new Map();
  function day(value,timezone='America/Mexico_City'){
    if(!value)return '';if(/^\d{4}-\d\d-\d\d$/.test(value))return value;
    if(!dateFormatters.has(timezone)){
      if(dateFormatters.size>=32)dateFormatters.clear();
      dateFormatters.set(timezone,new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}));
    }
    const parts=dateFormatters.get(timezone).formatToParts(new Date(value));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  }
  function time(r,basis='occurred',timezone='America/Mexico_City'){
    const keys=basis==='recorded'?['recordedAt']:basis==='reported'?['reportedAt','recordedAt']:['occurredAt','occurredDate','reportedAt','recordedAt'];
    const key=keys.find(k=>r[k]);return {value:key?r[key]:'',day:key?day(r[key],timezone):'',basis:key||'unknown'};
  }
  function visible(event,scope,subjectIds,projectIds){
    const s=event.eventRecord.scope;
    return scope==='library'||s.kind==='explicit_projects'&&s.projectIds.includes(scope)||s.kind==='shared'&&subjectIds.some(id=>projectIds.has(id));
  }
  function structure(graph){
    const hidden=new Set(graph.entities.filter(e=>e.type==='Event'&&(e.eventRecord||e.sourceChatId)||e.type==='Evidence'&&e.historySource).map(e=>e.id));
    return {...graph,entities:graph.entities.filter(e=>!hidden.has(e.id)),relations:graph.relations.filter(r=>!hidden.has(r.from)&&!hidden.has(r.to))};
  }
  function personIdentity(graph,id){
    const account=graph.entities.find(e=>e.id===id),identity={id,name:account?.name||id},match=account?.identityMatch;
    if(account?.type!=='Person'||account.privacy!=='local_only'||match?.status!=='confirmed'||
      typeof account.kakaoAuthorId!=='string'||!account.kakaoAuthorId.trim()||account.kakaoAuthorId!==match.authorId||
      !Array.isArray(match.evidenceSourceIds)||!match.evidenceSourceIds.length||!match.evidenceSourceIds.every(sourceId=>typeof sourceId==='string'&&sourceId.trim()))return identity;
    const target=graph.entities.find(e=>e.id===match.personId);
    return target?.type==='Person'&&target.status==='active'?{...identity,canonicalId:target.id,canonicalName:target.name}:identity;
  }
  function business(r,focus){return r?.recordClass==='business'&&r.lifecycle!=='retracted'&&(focus!=='actionable'||['disruption','risk','response','resolution','change','request','decision','progress','other'].includes(r.kind)||r.importance!=='normal');}
  function priority(r){return r.importance==='critical'?'critical':r.importance==='attention'||['disruption','risk'].includes(r.kind)?'attention':r.kind==='resolution'?'resolved':'normal';}
  function strongest(values){return ['critical','attention','resolved','normal'].find(p=>values.includes(p))||'normal';}
  function priorities(items){const result={};for(const e of items)for(const id of new Set(e.subjectIds))result[id]=strongest([result[id],priority(e.record)]);return result;}
  const api={KINDS,MODES,validateEvent,day,time,visible,structure,personIdentity,business,priority,strongest,priorities};
  if(typeof module==='object')module.exports=api;else root.EventHistory=api;
})(typeof globalThis==='undefined'?this:globalThis);
