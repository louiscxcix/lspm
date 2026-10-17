'use strict';
const M=require('./ontology-model'),P=require('./projects'),crypto=require('node:crypto');
const FILE='LG_Innotek_Ontology_People_Risk_Management_Update.md',SOURCE_ID='people-sample-source-v1',PREFIX='people-sample-';
const groupId=key=>PREFIX+'check-'+key,roleId=key=>PREFIX+'role-'+key;
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const groupKeys={
 'A. Product definition':'product','B. LOT, QR and traceability --- P0':'traceability','C. Materials and small parts':'materials',
 'D. Machine, program and tooling':'machine','E. Process and quality':'quality','F. People and coordination':'people',
 'Final start gate':'start','First-piece validation':'first-piece','Ongoing monitoring':'monitoring','Abnormality and containment':'containment'
};
function parse(text){
 const roles=[['supervisor','Supervisor --- Unit Leader / 반장'],['leader','Leader --- Shift Leader / 조장'],['technician','Technician --- Maintenance / MT'],['operator','Operator / 작업자']].map(([key,title])=>{
  const start=text.indexOf('### '+title+'\n');if(start<0)throw Error('Missing role section: '+key);
  const rest=text.slice(start+title.length+5),end=rest.search(/\n#{2,3} /);
  return {key,title,text:(end<0?rest:rest.slice(0,end)).trim()};
 });
 const groups=[];let phase='',title='',key='',priority=null;
 for(const paragraph of text.split(/\n\s*\n/)){
  const flat=paragraph.replaceAll('\\[','[').replaceAll('\\]',']').replace(/\s+/g,' ').trim();
  if(/^### Phase 1 /.test(flat))phase='before';else if(/^### Phase 2 /.test(flat))phase='during';else if(/^### Phase 3 /.test(flat)){phase='after';title='After the sample run';key='closure';priority=null;}
  if(/^## 5\./.test(flat))phase='';
  if(!phase)continue;
  if(/^#### /.test(flat)){title=flat.slice(5);key=groupKeys[title];priority=title.includes('--- P0')?'P0':null;if(!key)throw Error('Unmapped checklist heading: '+title);}
  let area='all',heading=title,groupKey=key,p=priority;
  const areaMatch=flat.match(/^\*\*(TEM|SMT|LDM) checks/);
  if(areaMatch){area=areaMatch[1];heading=area+' checks · if applicable';groupKey=area.toLowerCase();p=null;}
  const pieces=flat.split(/(?:^|\s)-\s+\[ \]\s*/);if(pieces.length<2)continue;
  if(!groupKey)throw Error('Checklist without category.');
  let group=groups.find(g=>g.key===groupKey);if(!group){group={key:groupKey,title:heading,phase,area,priority:p,items:[]};groups.push(group);}
  group.items.push(...pieces.slice(1).map(s=>s.trim()));
 }
 if(groups.length!==14||groups.some(g=>!g.items.length))throw Error('Checklist structure changed; review the source before import.');
 const count=(text.replaceAll('\\[','[').replaceAll('\\]',']').match(/\[ \]/g)||[]).length;
 if(groups.flatMap(g=>g.items).length!==count)throw Error('Checklist coverage mismatch.');
 return {roles,groups};
}
function ensure(g,id,input){
 const old=M.byId(g,id);if(old){if(old.type!==input.type)throw Error('Existing object type conflict: '+id);return old;}
 const e=M.addEntity(g,input);e.id=id;return e;
}
function link(g,from,type,to,evidence,scope=null){
 if(g.relations.some(r=>r.from===from&&r.type===type&&r.to===to&&(r.scopeProjectId??null)===scope))return;
 const r=M.addRelation(g,{from,type,to,evidence,scopeProjectId:scope});
 r.id=PREFIX+'link-'+digest(JSON.stringify([from,type,to,scope])).slice(0,24);
}
const escalations=[
 ['machine','기기 이상 · 기술 대응·상향 보고',['technician','leader','supervisor'],'Technician/MT performs authorized initial response and monitoring; inform Leader, then escalate unresolved/critical issues. Record machine, time, alarm, affected product/LOT, action and downtime.'],
 ['target','목표 미달·라인 정지 · 분석·상향 보고',['leader','supervisor'],'Leader compares hourly target and actual, performs first-level analysis and informs Supervisor for major delay. Record target vs actual, time, known cause and support needed. No invented hourly target or automatic production update.'],
 ['quality','품질 이상 · 격리·품질/기술 지원',['operator','leader','supervisor'],'Contain and identify affected product per site procedure; inform Leader and relevant Quality/Engineering support, escalate major issues to Supervisor. Record defect, quantity, LOT/QR, process and containment. No automatic disposition or release.'],
 ['staffing','인력 공백 · 숙련도·지원 범위 확인',['supervisor'],'Supervisor reviews headcount and skills. Record shift, missing skill/role, proposed reassignment and coverage. Do not allocate named people without confirmed coverage.'],
 ['material','자재 부족 · 보충 요청·생산 위험 보고',['operator','leader','supervisor'],'Operator requests replenishment through the confirmed material-responsible route. Notify material support; escalate to Leader/Supervisor if production is at risk. Record material, quantity, line and need-by time. No new request recipient inferred.'],
 ['coordination','부서 간 의존성 · 담당·필요 시점 조율',['leader','supervisor'],'Leader/Supervisor identifies dependency and owner; Supervisor coordinates with the related department. Record impacted process, owner, required-by time and resolution. Do not infer approval or stop-production authority.']
];
function roleGuidance(g,roles,hash){
 const suffixes={supervisor:' · Supervisor team',leader:' · Leader team',technician:' · Maintenance Technician team'};
 for(const e of g.entities.filter(e=>e.type==='Organization')){
  const r=roles.find(r=>suffixes[r.key]&&e.name.endsWith(suffixes[r.key]));if(!r)continue;
  const marker='[Role guidance '+hash+']';if(e.context?.includes(marker))continue;
  M.updateEntity(g,e.id,{context:(e.context||'')+'\n\n'+marker+'\nSource: '+FILE+'; reference '+roleId(r.key)+'. Generic role responsibilities only; existing membership remains unchanged. Not an approved SOP, individual assignment or new formal HR reporting relationship.\n'+r.text});
 }
}
function source(g,id,text){
 const hash=digest(text),old=M.byId(g,id);
 if(old&&(!old.context.includes('SHA-256: '+hash)||old.rawLog!==text))throw Error('Source changed; explicit revision review required.');
 return ensure(g,id,{type:'Evidence',name:'LGIT · 역할 책임·샘플 관리 원문',status:'active',rawLog:text,context:'Source: '+FILE+'\nSHA-256: '+hash+'\nUser-supplied reference document. Not proof that any readiness check, sample trial, training or approval occurred.'});
}
function applyShared(g,text){
 const before=JSON.stringify(g),applied=!!M.byId(g,SOURCE_ID),parsed=parse(text),ev=source(g,SOURCE_ID,text),hash=digest(text);
 // Each scope saves atomically; an existing source stamp preserves later manual edits on retries.
 if(applied)return false;
 const add=(id,name,context,fields={})=>{
  const e=ensure(g,id,{type:'Requirement',name,status:'unknown',framework:'LGIT people / sample control reference',templateItemId:id,templateVersion:hash,requirementSource:'internal',applicability:'pending_review',context:'Source: '+FILE+'\nSHA-256: '+hash+'\nReference template, not an approved site procedure or completed check.\n'+context,...fields});
  link(g,e.id,'supported_by',ev.id,'Document provenance only; does not verify compliance or completion.');return e;
 };
 for(const r of parsed.roles)add(roleId(r.key),'역할 기준 · '+r.title,r.text+'\nDraft responsibility/escalation flow: Technician/MT → Leader/Shift Leader → Supervisor/Unit Leader. Not proof of named reporting or stop-production authority.',{role:r.key});
 for(const [key,title,roles,body]of escalations)add(PREFIX+'response-'+key,title,body+'\nRequired role guidance: '+roles.join(' → ')+'. Follow official plant rules for authority, safety and escalation timing.');
 for(const g of parsed.groups)add(groupId(g.key),'샘플 체크 · '+g.title,'Phase: '+g.phase+'; area: '+g.area+'; priority: '+(g.priority||'not individually assigned in source')+'.\n'+g.items.map((s,i)=>(i+1)+'. [미확인] '+s).join('\n')+'\nOwner, model applicability, evidence, verifier, due date and exception approval remain unconfirmed. A checked box requires reviewed evidence, not a report of readiness.'+(g.key==='traceability'?'\nP0: verify the first-off QR/LOT stored record before full production; no invented LOT format.':''),{phase:g.phase,tier:'Sample controls / '+g.phase+' / '+g.area});
 roleGuidance(g,parsed.roles,hash);M.validateStore(g);return before!==JSON.stringify(g);
}
const groupRisks={
 product:['settings','material','trial'],traceability:['traceability'],materials:['supply','material','consumption'],machine:['equipment','tooling','settings'],
 tem:['equipment','tooling','settings','trial'],smt:['supply','material','traceability','settings'],ldm:['material','settings','containment'],
 quality:['trial','containment'],people:['coverage'],start:['traceability','coverage','trial'],
 'first-piece':['trial','containment','traceability'],monitoring:['material','settings','containment','traceability'],containment:['containment','traceability'],closure:['closure','dispatch']
};
const missingRisks=[
 ['traceability','샘플 · LOT/QR·MES 추적성 검증 누락','Readable QR may have no matching production record, wrong/duplicate data or missing material-LOT linkage. Existing Sin Lote creation/restoration and return policies remain unchanged.','Verify approved LOT/QR specification and first-off stored record; preserve physical-unit/material-LOT linkage, reprint/retest history and authorized correction. Do not invent a LOT format or auto-create/restore a LOT.'],
 ['coverage','샘플 · 역할·훈련·대응 지원 공백','Required operator, Technician/MT, Leader, Supervisor or first-piece/start approver coverage may be unconfirmed.','Confirm authorization/training, role coverage, escalation contacts and shared-resource availability before trial; identify approvers explicitly. No new named assignment or approval authority is inferred.'],
 ['containment','샘플 · 초품·이상 격리·재시작 승인 누락','Unverified first-piece acceptance, affected-unit containment or unauthorized setting/restart changes may allow suspect units to proceed.','Use approved containment and traceability; record defect/LOT/QR/time/machine/program, authorized corrective action and restart approval. Verify first unit after restart and record rework, retest and scrap separately. Existing Visual → Storage and source-SMT return routes remain in force.'],
 ['closure','샘플 · 종료 수량·증빙·미해결 항목 누락','Sample input/OK/NG/rework/scrap quantities, trace records and unresolved issues may not be reconciled after the run.','Reconcile quantities without inventing a material balance; retain inspection/program evidence, identify remaining samples/materials, share results and record an owner, due date and next action for each actual open issue. This reference does not close any issue.']
];
function applyProject(p,g,text){
 if(p.status!=='active'||!['LS','SMT','MOBIS + HELLA'].includes(p.name))return false;
 const before=JSON.stringify(p),existingIds=new Set(p.entities.map(e=>e.id)),parsed=parse(text),hash=digest(text),slug=p.name==='LS'?'ls':p.name==='SMT'?'smt':'customer';
 if(M.byId(p,SOURCE_ID+'-'+slug)){source(p,SOURCE_ID+'-'+slug,text);return false;}
 const ids=g.entities.filter(e=>e.type==='Requirement'&&e.id.startsWith(PREFIX)).filter(e=>p.name!=='SMT'||![groupId('tem'),groupId('ldm')].includes(e.id)).map(e=>e.id);
 P.attachMembers(p,g,ids);const ev=source(p,SOURCE_ID+'-'+slug,text);
 p.workstreams||={};for(const id of [...ids,ev.id])if(!existingIds.has(id))p.workstreams[id]=['production','quality'];
 for(const id of ids)link(p,id,'supported_by',ev.id,'Source reference only; no verified checklist completion.',p.id);
 roleGuidance(p,parsed.roles,hash);
 if(p.name==='LS'){
  for(const r of p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('tem-machine-risk-ls-'))){
   for(const key of ['machine','tem']){link(p,groupId(key),'quality_reference',r.id,'TEM readiness reference for this existing Risk; no new occurrence or asset assignment.',p.id);for(const action of p.relations.filter(l=>l.type==='mitigates'&&l.to===r.id))link(p,groupId(key),'quality_reference',action.from,'Reference checks; preserve existing mitigation state and owner.',p.id);}
  }
  if(M.byId(p,'risk-ls-press-cleanliness'))link(p,groupId('quality'),'quality_reference','risk-ls-press-cleanliness','Cleaning/line-clearance reference only; confirmed cleanliness Risk stays limited to Pressing 3 and 4.',p.id);
 }
 if(p.name==='MOBIS + HELLA'){
  const parts=['tem-part-bl7m','tem-part-p768-a2'].filter(id=>M.byId(p,id)),steps=p.entities.filter(e=>e.type==='Production Step'&&/^customer-tem-(mobis|hella)-step-\d+$/.test(e.id));
  for(const [key,title,description,control]of missingRisks){
   const risk=ensure(p,PREFIX+'risk-'+key,{type:'Risk',name:title,status:'unknown',context:'Source: '+FILE+'; SHA-256: '+hash+'. Sample-common review candidate, not an observed failure. '+description+' Likelihood/severity, actual affected units, owner and due date unconfirmed.'});
   const action=ensure(p,risk.id+'-mitigation',{type:'Work Item',name:title+' · 대책 검증',status:'planned',qualityKind:'action',context:'Proposed control: '+control+' Not executed or verified. Owner, due date and evidence not supplied.'});
   link(p,action.id,'mitigates',risk.id,control,p.id);
   for(const part of parts){link(p,risk.id,'potentially_affects',part,'Sample-common potential risk; no incident or model-specific readiness assertion.',p.id);link(p,action.id,'applies_to',part,'Proposed sample control; not a production step or confirmed execution.',p.id);}
   for(const step of steps.filter(s=>key!=='closure'||/Packing/i.test(s.displayProcessName||s.productionStage)))link(p,risk.id,'potentially_affects',step.id,'Review applicability in this existing sample route; no sequence, machine or disposition change.',p.id);
   for(const id of [risk.id,action.id])if(!existingIds.has(id))p.workstreams[id]=['production','quality'];
  }
  for(const group of parsed.groups){
   const id=groupId(group.key),inArea=group.area==='all'||group.area==='TEM';
   if(inArea)for(const part of parts)link(p,id,'applies_to',part,'Reference checklist; model-specific applicability pending review.',p.id);
   const risks=(groupRisks[group.key]||[]).map(key=>M.byId(p,'sample-common-risk-'+key)||M.byId(p,PREFIX+'risk-'+key)).filter(Boolean);
   if(['machine','tem'].includes(group.key))risks.push(...p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('tem-machine-risk-customer-')));
   for(const r of risks){link(p,id,'quality_reference',r.id,'Checklist reference for an existing or proposed risk; not a failure report.',p.id);for(const mitigation of p.relations.filter(l=>l.type==='mitigates'&&l.to===r.id))link(p,id,'quality_reference',mitigation.from,'Control checklist supports proposed mitigation verification; current action state unchanged.',p.id);}
   if(inArea&&group.phase==='before')for(const gate of ['tem-mobis-gate-3','tem-hella-gate-3'].filter(id=>M.byId(p,id)))link(p,gate,'requires',id,'Proposed readiness checklist; applicability remains pending review. Explicit P0 LOT/QR items require evidence or authorized exception; no gate decision or approval changed.',p.id);
  }
  const responseTargets={machine:['sample-common-risk-equipment','sample-common-risk-tooling','sample-common-risk-settings'],target:[PREFIX+'risk-coverage'],quality:[PREFIX+'risk-containment'],staffing:[PREFIX+'risk-coverage'],material:['sample-common-risk-supply','sample-common-risk-material'],coordination:[PREFIX+'risk-coverage','sample-common-risk-dispatch']};
  for(const [key,,roles]of escalations)for(const riskId of responseTargets[key])for(const l of p.relations.filter(l=>l.type==='mitigates'&&l.to===riskId)){
   link(p,PREFIX+'response-'+key,'quality_reference',l.from,'Response guidance, not an actual response Event or assignment.',p.id);
   for(const role of roles)link(p,roleId(role),'quality_reference',l.from,'Required role definition only. Actual coverage and named assignment must be verified separately.',p.id);
  }
 }
 P.validate(p);return before!==JSON.stringify(p);
}
module.exports={parse,applyShared,applyProject,SOURCE_ID,groupId};
if(require.main===module)(async()=>{
 const fs=require('node:fs'),path=require('node:path'),text=fs.readFileSync('/Users/louis/Downloads/'+FILE,'utf8');parse(text);
 const file=path.join(__dirname,'..','.local-data','ontology.sqlite'),s=require('./local-store').openStore(file);
 try{
  let w=s.load();const scopes=[['library',w.library],...w.projects.filter(p=>p.status==='active'&&['LS','SMT','MOBIS + HELLA'].includes(p.name)).map(p=>[p.id,p])],candidate=structuredClone(w);
  const shared=applyShared(candidate.library,text),changed=[shared,...candidate.projects.filter(p=>p.status==='active'&&['LS','SMT','MOBIS + HELLA'].includes(p.name)).map(p=>applyProject(p,candidate.library,text))].some(Boolean);
  if(!changed){console.log(JSON.stringify({changed:false,revision:w.revision}));return;}
  const backup=path.join(path.dirname(file),'ontology-before-people-sample-controls-'+Date.now()+'.sqlite');await s.backup(backup);
  for(const [scope]of scopes){w=s.load();const did=scope==='library'?applyShared(w.library,text):applyProject(w.projects.find(p=>p.id===scope),w.library,text);if(did)s.save(w,scope,w.revision);}
  w=s.load();console.log(JSON.stringify({changed:true,backup,revision:w.revision,sourceSha256:digest(text),roles:parse(text).roles.length,checklistGroups:parse(text).groups.length,checklistItems:parse(text).groups.flatMap(g=>g.items).length,projects:w.projects.filter(p=>p.status==='active').map(p=>({name:p.name,importedObjects:p.entities.filter(e=>e.id.startsWith(PREFIX)).length}))}));
 }finally{s.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
