'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const M=require('./ontology-model'),H=require('./history');
const validateEntity=e=>M.validateStore({version:1,entities:[e],relations:[]});
const uid=prefix=>prefix+'-'+randomUUID(),now=()=>new Date().toISOString();
module.exports=function(db,load){
  db.exec(`CREATE TABLE IF NOT EXISTS event_change_proposals(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES entities(id),scope TEXT NOT NULL,status TEXT NOT NULL,effective_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,data_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS history_proposal_event ON event_change_proposals(event_id);
    CREATE INDEX IF NOT EXISTS history_relation_target ON relations(to_id,type,from_id);
    CREATE INDEX IF NOT EXISTS history_entity_type ON entities(type);`);
  if(!db.prepare('PRAGMA table_info(sources)').all().some(c=>c.name==='metadata_json'))db.exec("ALTER TABLE sources ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS history_source_identity ON sources(json_extract(metadata_json,'$.sourceKey'),json_extract(metadata_json,'$.hash'),json_extract(metadata_json,'$.scope'),coalesce(json_extract(metadata_json,'$.occurrence'),'')) WHERE kind='history'");
  const one=id=>{const row=db.prepare('SELECT data_json FROM entities WHERE id=?').get(id);return row?JSON.parse(row.data_json):null;};
  const put=e=>db.prepare('INSERT INTO entities(id,type,data_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json').run(e.id,e.type,JSON.stringify(e));
  const tables=['entities','relations','ingestion_jobs','event_change_proposals','project_schedules','wip_snapshots','wip_counts','hourly_records','project_view_settings'];
  const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all().map(r=>({...r}))]));
  function scopeCheck(scope){if(scope==='library')return;const p=db.prepare('SELECT status FROM projects WHERE id=?').get(scope);if(!p)throw Error('Unknown project.');if(p.status==='archived')throw Error('Archived project is read only.');}
  function transaction(revision,label,fn,scope='library'){
    db.exec('BEGIN IMMEDIATE');try{
      const current=Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value);
      if(revision!==current)throw Error('STALE_REVISION');
      const before=snapshot(),id=uid('history-change'),result=fn(id)||{},after=snapshot(),rows=[];
      for(const table of tables){const key=r=>table==='project_schedules'?r.project_id+'|'+r.entity_id:table==='project_view_settings'?r.project_id+'|'+r.view_key:r.id;const old=new Map(before[table].map(r=>[key(r),r])),next=new Map(after[table].map(r=>[key(r),r]));for(const k of new Set([...old.keys(),...next.keys()]))if(!isDeepStrictEqual(old.get(k),next.get(k))){const item=next.get(k)||old.get(k);rows.push({table,key:table==='project_schedules'?[item.project_id,item.entity_id]:table==='project_view_settings'?[item.project_id,item.view_key]:[item.id],before:old.get(k)||null,after:next.get(k)||null});}}
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(current+1));
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at) VALUES(?,?,?,?,?,?,?)').run(id,scope==='library'?null:scope,now(),current+1,JSON.stringify([{action:'Saved',label,fields:[]}]),JSON.stringify(rows),now());
      db.exec('COMMIT');return {...result,revision:current+1,changeId:id};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function source(input){
    scopeCheck(input.scope);const mime=input.mimeType||'text/plain';if(!['text/plain','text/markdown','text/csv','application/pdf'].includes(mime))throw Error('Use TXT, Markdown, CSV or PDF.');
    const content=typeof input.text==='string'?Buffer.from(input.text):Buffer.from(input.base64||'','base64');if(!content.length||content.length>10000000)throw Error('Source must be 1 byte to 10 MB.');
    const hash=createHash('sha256').update(content).digest('hex'),metadata={...input.metadata,scope:input.scope,hash,privacy:'local_only'};
    const sourceKey=metadata.externalId?[metadata.provider||'manual',metadata.account||'',metadata.roomId||'',String(metadata.externalId)].join('|'):hash;
    metadata.sourceKey=sourceKey;
    const old=db.prepare("SELECT id FROM sources WHERE json_extract(metadata_json,'$.sourceKey')=? AND json_extract(metadata_json,'$.hash')=? AND json_extract(metadata_json,'$.scope')=?").get(sourceKey,hash,input.scope);
    const separate=input.separateOccurrence===true||input.metadata?.separateOccurrence===true;
    if(old&&!separate)return {sourceId:old.id,duplicate:true};
    if(separate)metadata.occurrence=randomUUID();
    const id=uid('history-source');db.prepare('INSERT INTO sources(id,kind,filename,mime_type,content,created_at,metadata_json) VALUES(?,?,?,?,?,?,?)').run(id,'history',String(input.filename||'Daily update').slice(0,120),mime,content,now(),JSON.stringify(metadata));return {sourceId:id,duplicate:false};
  }
  function sourceRecord(id){const r=db.prepare('SELECT * FROM sources WHERE id=?').get(id);if(!r)throw Error('Source not found.');return {...r,metadata:JSON.parse(r.metadata_json)};}
  function newJob(sourceId,scope,policy='key_changes'){
    scopeCheck(scope);const s=sourceRecord(sourceId);if(s.metadata.scope!==scope)throw Error('Source scope mismatch.');if(!['key_changes','daily_summary','detailed'].includes(policy))throw Error('Invalid recording policy.');
    if(db.prepare("SELECT id FROM ingestion_jobs WHERE source_id=? AND status='committed' AND json_extract(draft_json,'$.schemaVersion')=2").get(sourceId))throw Error('이미 이력으로 저장된 원문입니다. 기존 기록을 확인하거나 별도 발생 기록을 선택하세요.');
    const id=uid('history-job'),draft={schemaVersion:2,scope,policy,events:[],dispositions:[],unresolved:[]};db.prepare('INSERT INTO ingestion_jobs(id,source_id,status,draft_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,sourceId,'extracting',JSON.stringify(draft),now(),now());return {jobId:id,source:s,draft};
  }
  function finishJob(id,draft,error=''){
    const row=db.prepare('SELECT draft_json FROM ingestion_jobs WHERE id=?').get(id);if(!row)throw Error('Job not found.');const old=JSON.parse(row.draft_json);
    if(old.committed)throw Error('History already committed.');
    const merged={...old,...draft,scope:old.scope,policy:old.policy,schemaVersion:2,error};
    if(!Array.isArray(merged.events)||merged.events.length>100)throw Error('At most 100 event candidates per update.');
    merged.events=merged.events.map(e=>({...e,candidateId:e.candidateId||uid('candidate')}));
    if(new Set(merged.events.map(e=>e.candidateId)).size!==merged.events.length)throw Error('Duplicate candidate IDs.');
    db.prepare('UPDATE ingestion_jobs SET status=?,draft_json=?,updated_at=? WHERE id=?').run(error?'failed':'ready_for_review',JSON.stringify(merged),now(),id);return {jobId:id,draft:merged};
  }
  function record(input,scope){
    const r={schemaVersion:1,recordClass:'business',kind:input.kind||'observation',statementMode:input.statementMode||'reported_fact',verification:input.verification||'reported',lifecycle:'active',importance:input.importance||'normal',occurredAt:input.occurredAt||null,occurredDate:input.occurredDate||null,reportedAt:input.reportedAt||null,recordedAt:now(),effectiveAt:input.effectiveAt||null,timePrecision:input.occurredAt?'exact':input.occurredDate?'date':'unknown',timezone:'America/Mexico_City',scope:{kind:scope==='library'?'unassigned':'explicit_projects',projectIds:scope==='library'?[]:[scope]},visibility:'local_only',observations:input.observations||[],unresolved:input.unresolved||[],episodeId:input.episodeId||null,reporterLabel:String(input.reporterLabel||'').slice(0,120),facets:input.facets||[]};
    if(input.shared===true)r.scope={kind:'shared',projectIds:[]};return H.validateEvent(r);
  }
  function link(graph,from,type,to,extra={}){const r={id:uid('history-link'),type,from,to,scopeProjectId:null,evidence:'Reviewed daily history',...extra};const error=M.validateRelation(graph,r);if(error)throw Error(error);db.prepare('INSERT INTO relations(id,type,from_id,to_id,scope_project_id,data_json) VALUES(?,?,?,?,?,?)').run(r.id,r.type,r.from,r.to,null,JSON.stringify(r));graph.relations.push(r);}
  function commit(input){
    const row=db.prepare('SELECT * FROM ingestion_jobs WHERE id=?').get(input.jobId);if(!row)throw Error('Job not found.');const draft=JSON.parse(row.draft_json);if(draft.committed)return {...draft.committed,revision:load().revision};scopeCheck(draft.scope);
    if(row.status!=='ready_for_review')throw Error('Review a completed extraction first.');
    const ids=new Set(input.selectedCandidateIds||[]);if([...ids].some(id=>!draft.events.some(e=>e.candidateId===id)))throw Error('Unknown candidate.');
    return transaction(input.revision,'Daily history saved',()=>{
      const graph=load().library,src=sourceRecord(row.source_id),evidence={id:uid('history-evidence'),type:'Evidence',name:src.filename,status:'active',context:'Retained daily source',sourceId:src.id,historySource:true,privacy:'local_only'};put(evidence);graph.entities.push(evidence);
      const snapshotIds=[];
      if(input.progressRows){
        const project=load().projects.find(p=>p.id===draft.scope);if(!project||project.status==='archived')throw Error('Open an active project.');
        const G=require('./progress');G.validate(project,input.progressRows);
        const groups=new Map();for(const r of input.progressRows){const key=G.timestamp(r.capturedAt)+'|'+G.unitKey(r.unit);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
        for(const rows of groups.values()){
          const capturedAt=G.timestamp(rows[0].capturedAt),unit=G.unitKey(rows[0].unit);
          for(const r of rows){const old=db.prepare('SELECT c.quantity FROM wip_counts c JOIN wip_snapshots s ON s.id=c.snapshot_id WHERE s.project_id=? AND julianday(s.captured_at)=julianday(?) AND c.part_id=? AND c.step_id=? AND (s.sheet=? OR (?=\'pcs\' AND s.sheet NOT LIKE \'Progress · %\')) ORDER BY s.created_at DESC LIMIT 1').get(project.id,capturedAt,r.partId,r.stepId,'Progress · '+unit,unit);if(old&&old.quantity!==r.quantity&&!input.confirmCorrections)throw Error('WIP conflict: same Part/step/time has a different count. Confirm correction first.');}
          const id=uid('wip');snapshotIds.push(id);db.prepare('INSERT INTO wip_snapshots VALUES(?,?,?,?,?,?)').run(id,project.id,capturedAt,'Progress observation','Progress · '+unit,now());
          rows.forEach((r,i)=>db.prepare('INSERT INTO wip_counts VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid('count'),id,r.row||i+1,r.column||1,one(r.partId).modelCode||'',one(r.partId).name,r.partId,String(r.stage||one(r.stepId).productionStage||one(r.stepId).name),r.stepId,r.quantity));
        }
      }
      const eventIds=[],proposalIds=[];
      for(const candidate of draft.events.filter(e=>ids.has(e.candidateId))){
        const c={...candidate,...input.edits?.[candidate.candidateId]},name=String(c.title||'').trim();if(!name||name.length>180)throw Error('Event title required, up to 180 characters.');
        const r=record(c,draft.scope);if(input.progressRows)r.recordClass='production_log';if(!r.facets.length&&M.WORKSTREAMS.some(w=>w.code===src.metadata.workstream))r.facets=[src.metadata.workstream];if(src.metadata.lineId&&one(src.metadata.lineId)?.resourceKind==='line')r.lineId=src.metadata.lineId;
        const entity={id:uid('history-event'),type:'Event',name,status:'active',context:String(c.summary||'').slice(0,5000),eventRecord:r,privacy:'local_only',recordedAt:r.recordedAt,extractionJobId:row.id,candidateId:c.candidateId};
        if(c.occurredAt)entity.occurredAt=c.occurredAt;if(c.occurredDate)entity.occurredDate=c.occurredDate;
        put(entity);graph.entities.push(entity);eventIds.push(entity.id);
        link(graph,entity.id,'supported_by',evidence.id,{sourceExcerpt:String(c.sourceExcerpt||'').slice(0,4000)});
        for(const id of new Set(c.evidenceIds||[]))link(graph,entity.id,'supported_by',id);
        for(const id of new Set(c.subjectIds||[]))link(graph,entity.id,'records_on',id,{historyRole:'subject'});
        for(const id of new Set(c.reporterIds||[]))if(id!==c.reporterId)link(graph,entity.id,'reported_by',id);
        for(const [field,type]of [['reporterId','reported_by'],['performerId','performed_by'],['recipientId','requested_from'],['followsUpId','follows_up'],['supersedesId','supersedes']])if(c[field])link(graph,entity.id,type,c[field]);
        for(const spec of c.proposals||[]){
          const p={operations:spec.operations||[],expectedRevision:input.revision,reviewedAt:null,appliedChangeId:null};validateOperations(p.operations,draft.scope,graph);
          const id=uid('event-proposal'),effective=spec.effectiveAt||r.effectiveAt||null;if(effective&&!Number.isFinite(Date.parse(effective)))throw Error('Invalid effective time.');
          db.prepare('INSERT INTO event_change_proposals VALUES(?,?,?,?,?,?,?,?)').run(id,entity.id,draft.scope,'draft',effective,now(),now(),JSON.stringify(p));proposalIds.push(id);
        }
      }
      const committed={eventIds,proposalIds,...(snapshotIds.length?{snapshotIds}:{})};db.prepare('UPDATE ingestion_jobs SET status=?,draft_json=?,updated_at=? WHERE id=?').run('committed',JSON.stringify({...draft,committed,selectedCandidateIds:[...ids],reviewedAt:now()}),now(),row.id);return committed;
    },draft.scope);
  }
  function subjects(graph,eventId){return graph.relations.filter(r=>r.from===eventId&&r.type==='records_on'&&r.historyRole!=='context').map(r=>r.to);}
  function historyVisible(w,event,scope,ids,members){
    if(scope!=='library'&&w.viewSettings?.[scope]?.overview?.historyScope==='explicit_projects'&&event.eventRecord.scope.kind!=='explicit_projects')return false;
    return H.visible(event,scope,ids,members);
  }
  function list(query={}){
    const w=load(),scope=query.scope||'library',project=scope==='library'?w.library:w.projects.find(p=>p.id===scope);if(!project)throw Error('Unknown project.');
    const timezone=query.timezone||'America/Mexico_City';new Intl.DateTimeFormat('en',{timeZone:timezone});
    if(query.start&&query.end&&query.start>query.end)throw Error('History start must precede end.');
    const byId=new Map(w.library.entities.map(e=>[e.id,e])),projectIds=new Set(project.entities.map(e=>e.id)),requested=new Set(query.subjectIds||[]),visible=new Set(query.visibleSubjectIds||[]),items=[],byFrom=new Map(),personIdentities=new Map();
    for(const r of w.library.relations){if(!byFrom.has(r.from))byFrom.set(r.from,[]);byFrom.get(r.from).push(r);}
    for(const e of w.library.entities){const r=e.eventRecord;if(e.type!=='Event'||!H.business(r,query.focus))continue;
      const links=byFrom.get(e.id)||[],ids=links.filter(x=>x.type==='records_on'&&x.historyRole!=='context').map(x=>x.to);if(!historyVisible(w,e,scope,ids,projectIds))continue;
      const t=H.time(r,query.dateBasis,timezone);if(query.start&&t.day<query.start||query.end&&t.day>query.end)continue;
      if(query.kinds?.length&&!query.kinds.includes(r.kind)||query.verification&&query.verification!==r.verification)continue;
      const participants=links.filter(x=>['reported_by','performed_by','requested_from'].includes(x.type)).map(x=>{
        if(!personIdentities.has(x.to))personIdentities.set(x.to,H.personIdentity(w.library,x.to));
        return {...personIdentities.get(x.to),role:x.type};
      });
      if(query.personId&&!participants.some(p=>p.id===query.personId||p.canonicalId===query.personId))continue;
      if(requested.size&&!ids.some(id=>requested.has(id)))continue;
      if(query.workstream&&!r.facets?.includes(query.workstream)&&!ids.some(id=>project.workstreams?.[id]?.includes(query.workstream)))continue;
      if(query.lineId&&r.lineId!==query.lineId&&!ids.some(id=>id===query.lineId||(byFrom.get(id)||[]).some(x=>x.type==='operated_in'&&x.to===query.lineId)))continue;
      items.push({id:e.id,title:e.name,summary:e.context,record:r,time:t,subjectIds:ids,subjects:ids.map(id=>({id,name:byId.get(id)?.name||id,type:byId.get(id)?.type})),participants,hiddenSubjects:visible.size?ids.filter(id=>!visible.has(id)):[]});
    }
    items.sort((a,b)=>(Date.parse(b.time.value)||0)-(Date.parse(a.time.value)||0)||a.id.localeCompare(b.id));
    const counts={};for(const e of items)for(const id of new Set(e.subjectIds))(counts[id]||=[]).push(e.id);
    const offset=Math.max(0,Number(query.cursor)||0),limit=Math.min(100,Math.max(1,Number(query.limit)||50));
    return {items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null,totalDistinct:items.length,unmatchedCount:items.filter(e=>!e.subjectIds.length).length,counts,priorities:H.priorities(items)};
  }
  function detail(id,scope='library'){
    const w=load(),e=one(id);if(!e?.eventRecord)throw Error('Event not found.');const p=scope==='library'?w.library:w.projects.find(p=>p.id===scope);if(!p||!historyVisible(w,e,scope,subjects(w.library,id),new Set(p.entities.map(x=>x.id))))throw Error('Event outside this scope.');
    const links=w.library.relations.filter(r=>r.from===id||r.to===id),sources=links.filter(r=>r.from===id&&r.type==='supported_by').map(r=>{const ev=one(r.to),source=ev?.sourceId?db.prepare('SELECT content,mime_type,metadata_json FROM sources WHERE id=?').get(ev.sourceId):null;return {name:ev?.name,excerpt:r.sourceExcerpt||'',text:ev?.rawLog|| (source&&source.mime_type!=='application/pdf'?Buffer.from(source.content).toString('utf8'):''),metadata:source?JSON.parse(source.metadata_json):{},attachment:source?.mime_type==='application/pdf'};});
    return {event:e,links:links.map(r=>({...r,fromName:one(r.from)?.name,toName:one(r.to)?.name})),sources,proposals:db.prepare('SELECT * FROM event_change_proposals WHERE event_id=?').all(id).map(p=>({...p,data:JSON.parse(p.data_json)}))};
  }
  function validateOperations(ops,scope,graph=load().library){
    if(!Array.isArray(ops)||!ops.length||ops.length>20)throw Error('Choose 1–20 explicit changes.');scopeCheck(scope);
    for(const op of ops){const e=M.byId(graph,op.targetId);if(!e)throw Error('Change target missing.');if(scope!=='library'&&!db.prepare('SELECT 1 FROM project_memberships WHERE project_id=? AND entity_id=?').get(scope,e.id))throw Error('Change target is outside project.');
      if(op.kind==='field'){if(e.type!=='Work Item'||!['status','plannedStart','plannedEnd','forecastStart','forecastEnd','due'].includes(op.field))throw Error('Unsupported field change.');if(op.field==='status'&&!['active','planned','in_progress','completed','blocked','cancelled','archived'].includes(op.after))throw Error('Invalid work status.');const test={...e,[op.field]:op.after};validateEntity(test);}
      else if(op.kind==='relationship'){if(!['requires','assigned_to'].includes(op.type))throw Error('Unsupported relationship change.');const relation=graph.relations.find(r=>r.id===op.relationId);if(!relation||relation.from!==e.id||relation.type!==op.type)throw Error('Relationship target mismatch.');if((relation.scopeProjectId||'library')!==scope)throw Error('Shared relationship must be changed in Global Library.');const error=M.validateRelation({...graph,relations:graph.relations.filter(r=>r.id!==relation.id)},{...relation,to:op.after});if(error)throw Error(error);}
      else throw Error('Unsupported change operation.');
    }
  }
  function proposal(id){const p=db.prepare('SELECT * FROM event_change_proposals WHERE id=?').get(id);if(!p)throw Error('Change proposal missing.');return {...p,data:JSON.parse(p.data_json)};}
  function propose(input){
    const e=one(input.eventId);if(!e?.eventRecord||e.eventRecord.recordClass!=='business')throw Error('Choose a business Event.');
    scopeCheck(input.scope);validateOperations(input.operations,input.scope);
    if(input.effectiveAt&&!M.isTimestamp(input.effectiveAt))throw Error('Effective time requires an ISO timestamp with timezone.');
    return transaction(input.revision,'Created state change proposal',()=>{const id=uid('event-proposal');db.prepare('INSERT INTO event_change_proposals VALUES(?,?,?,?,?,?,?,?)').run(id,e.id,input.scope,'draft',input.effectiveAt||null,now(),now(),JSON.stringify({operations:input.operations}));return {proposalId:id};},input.scope);
  }
  function review({id,action,revision}){if(!['ready','dismissed'].includes(action))throw Error('Invalid review action.');const p=proposal(id);if(!['draft','ready','conflict'].includes(p.status))throw Error('Proposal already applied or dismissed.');return transaction(revision,'Reviewed state change proposal',()=>{db.prepare('UPDATE event_change_proposals SET status=?,data_json=?,updated_at=? WHERE id=?').run(action,JSON.stringify({...p.data,reviewedAt:now()}),now(),id);},p.scope);}
  function apply({id,revision,reverse=false}){
    const p=proposal(id);if(!reverse&&p.status==='applied'||reverse&&p.status==='reversed')return {revision:load().revision,alreadyApplied:true};
    if(p.status!==(reverse?'applied':'ready'))throw Error('Review the change proposal first.');if(!reverse&&p.effective_at&&Date.parse(p.effective_at)>Date.now())throw Error('This change is not effective yet.');
    return transaction(revision,reverse?'Reversed current-state change':'Applied reviewed current-state change',changeId=>{
      const graph=load().library,ops=p.data.operations.map(op=>reverse?{...op,before:op.after,after:op.before}:op);validateOperations(ops,p.scope,graph);
      for(const op of ops){const e=M.byId(graph,op.targetId);if(op.kind==='field'){
        const row=p.scope==='library'?null:db.prepare('SELECT data_json FROM project_schedules WHERE project_id=? AND entity_id=?').get(p.scope,e.id),override=row?JSON.parse(row.data_json):{};
        const current=Object.hasOwn(override,op.field)?override[op.field]:e[op.field]??null;if(!isDeepStrictEqual(current,op.before??null))throw Error('State conflict: '+e.name+' changed since review.');
        const value={...e,...override,[op.field]:op.after};validateEntity(value);
        if(p.scope==='library'){e[op.field]=op.after;put(e);}else db.prepare('INSERT INTO project_schedules VALUES(?,?,?) ON CONFLICT(project_id,entity_id) DO UPDATE SET data_json=excluded.data_json').run(p.scope,e.id,JSON.stringify({...override,[op.field]:op.after}));
      }else{const r=graph.relations.find(r=>r.id===op.relationId);if(r.to!==op.before)throw Error('State conflict: relationship changed since review.');r.to=op.after;db.prepare('UPDATE relations SET to_id=?,data_json=? WHERE id=?').run(r.to,JSON.stringify(r),r.id);}}
      db.prepare('UPDATE event_change_proposals SET status=?,data_json=?,updated_at=? WHERE id=?').run(reverse?'reversed':'applied',JSON.stringify({...p.data,appliedChangeId:changeId,appliedAt:now()}),now(),id);
    },p.scope);
  }
  function jobs(scope){scopeCheck(scope);return db.prepare("SELECT id,source_id,status,draft_json,updated_at FROM ingestion_jobs WHERE json_extract(draft_json,'$.schemaVersion')=2 AND json_extract(draft_json,'$.scope')=? ORDER BY updated_at DESC LIMIT 30").all(scope).map(r=>({...r,draft:JSON.parse(r.draft_json)}));}
  return {source,sourceRecord,newJob,finishJob,commit,list,detail,review,propose,apply,jobs,transaction};
};
