(function(root){
 'use strict';
 // Change the version rather than editing definitions used by saved runs.
 const TEMPLATE_VERSION='sample-preparation-v3',PROFILE_VERSION='sample-preparation-v2',LEGACY_VERSION='sample-preparation-v1';
 const QUESTIONS=Object.freeze([
  ['product','Product and material','Are the product, revision, sample quantity and due date confirmed?','Record the exact model and revision, required quantity and agreed due date; distinguish plans from confirmations.'],
  ['approved-definition','Product and material','Are the approved drawing, BOM and acceptance requirements available for this revision?','Identify the approved revisions and acceptance limits; a reference is not evidence that this run was checked.'],
  ['pcb-provenance','Product and material','Is the correct internal or supplier PCB source and its provenance confirmed?','Record the actual producing source, PCB identity, revision and lot. Preserve internal versus supplier origin; do not infer a specific SMT asset.'],
  ['materials','Product and material','Are required materials available, released and within expiry for this run?','Check usable quantities, arrival, release, storage and expiry, including setup and rework consumption; do not invent stock or a buffer.'],
  ['traceability','Traceability','Are LOT and MES requirements confirmed and the first QR scan matched to its stored record?','P0 in the source: verify the first-off QR/LOT stored record and material-lot linkage. Readability alone is insufficient; do not invent a LOT format or restore a LOT automatically. Not applicable records a reason only; it does not approve production start.','P0'],
  ['program-settings','Equipment and setup','Are the approved program and settings matched to the product revision?','Identify the approved program, recipe and settings and the reviewed setup evidence; this answer does not change machine settings.'],
  ['equipment','Equipment and setup','Are the required equipment and calibrated measurement devices available?','Confirm actual factory, equipment identity, capability, reserved slot and valid calibration where applicable.'],
  ['tooling','Equipment and setup','Are compatible tooling, fixtures and necessary spares ready?','Check the required jig, tray, cable, fixture and machine subpart against its drawing/version and actual equipment.'],
  ['line-clearance','Equipment and setup','Are cleaning and line clearance confirmed before the sample starts?','Review residue, mixed material and previous-run clearance. Pressing 3 and Pressing 4 have a known cleaning risk; confirm applicability without extending that risk to other machines.'],
  ['first-piece','Quality and containment','Are first-piece criteria and the authorized approver confirmed?','Agree the first-piece inspection criteria, evidence and approval authority before trial; no acceptance or start approval is assumed.'],
  ['ng-response','Quality and containment','Are NG containment, source repair and retest arrangements confirmed?','Identify and hold affected units. Confirm original internal or supplier SMT provenance before source repair; accepted reinspection/retest is required before return to the failed downstream step. Unknown origin remains held.'],
  ['roles-support','People and release','Are trained roles and technical or quality support available for this run?','Confirm authorized operator, Technician/MT, Leader, Supervisor and approver coverage as applicable; name people only when present in this project.'],
  ['escalation-route','People and release','Are escalation contacts and the material transfer route confirmed?','Confirm role contacts, escalation sequence and material handoff/receiving route; do not infer assignments, authority or availability.'],
  ['packing-release','People and release','Are packing, labels and the release contact confirmed?','Confirm compatible packing, product/revision/lot labels, dispatch requirements and the authorized release contact. Record actual release separately.']
 ].map(([id,group,question,guidance,priority=null])=>Object.freeze({id,group,question,guidance,priority})));
 const PROFILE_GUIDANCE=Object.freeze({
  general:Object.freeze({
   'line-clearance':'Review residue, mixed material and previous-run clearance for the equipment actually selected. Do not infer a machine-specific defect.',
   'closeout':'Additional review suggestion, not an observed incident: reconcile input, OK, NG, rework and scrap quantities; record unresolved items, evidence and the agreed follow-up contact.'
  }),
  tem:Object.freeze({
   'product':'Confirm the selected P768 A-2 or BL7m PE P sample, revision, quantity and due date. Keep an unverified customer/model correction unresolved; do not transfer acceptance from another model.',
   'pcb-provenance':'Confirm the actual PCB source, code, revision and lot against the sample BOM. Verify Starpro supply only where the selected model has that confirmed source; distinguish big PCB and routed small PCB.',
   'materials':'Confirm PCB, heatsink, tape, bonding inputs and fasteners against the actual BOM, usable quantity and arrival/release evidence. Include setup and rework consumption; do not infer stock.',
   'equipment':'Confirm the actual TEM factory, machine identity, capability, sample slot and measurement/calibration status. Reference machines are not confirmed installed assets. Check breakdown recovery and backup availability without assuming interchangeability.',
   'program-settings':'Match drawing/BOM, machine program and setup revisions. Review applicable bonding, wire bonding, plasma, AOI and EOL settings only for operations confirmed in this model route; no process thresholds are invented.',
   'tooling':'Confirm actual compatible jigs, trays, clamps, cables, pickup/bonding tools and EOL contacts. Check wear, contamination and replacement subpart revision. Unmapped reference equipment stays unconfirmed.',
   'ng-response':'Contain suspect units and confirm the original PCB source. Agree authorized local repair or source-SMT/Starpro return, receiving contact and reinspection/retest before downstream re-entry. Neither color nor a checklist answer authorizes scrap or release.'
  }),
  smt:Object.freeze({
   'product':'Confirm the selected PCB model and revision, required sample quantity and due date. G65 PCB, JP-RH PCB and LQ2 PCB variants are PCB outputs, not finished LDM products.',
   'pcb-provenance':'Record the internally produced PCB model, actual producing SMT line, revision and material lots from confirmed records. Do not substitute Starpro as the producer or guess a line or finished-product linkage.',
   'program-settings':'Confirm the approved PCB program and applicable placement, soldering and inspection settings against this revision. Additional review suggestion: check recipe changeover and first-off evidence; these operations are not automatically added to the process map.',
   'materials':'Verify the actual PCB BOM, usable components, material lots, release/storage and shelf life where applicable. Review setup consumption and shortages without inventing available stock.',
   'tooling':'Additional review suggestion: verify compatible tooling, feeders/nozzles and inspection fixtures only where actually used; retain unidentified assets as unknown.',
   'ng-response':'Confirm the downstream return route to the original producing SMT line, affected PCB/lot identification, repair receiving contact and reinspection/retest evidence before return. Do not redirect an internal PCB to Starpro or treat a repair plan as completed.'
  }),
  't1-2':Object.freeze({
   'pcb-provenance':'Confirm the internally produced PCB used for T1-2 Uplevel, its code, revision and lot. Starpro is not its producer. The actual producing SMT asset remains unknown unless explicitly confirmed.',
   'program-settings':'Review the approved ICT, Pressing, connector assembly and EOL setup against the actual T1-2 Uplevel route. Preserve the existing six stages; five press machines are resources, not five newly invented sequential operations.',
   'equipment':'Confirm the actual selected press among Pressing 1 through 5, ICT/EOL availability and applicable calibration. Do not assume all five presses are used for the same run or that another machine is interchangeable.',
   'tooling':'Check the selected press tooling, plastic/PCB fit, fixtures, connector tools and ICT/EOL contacts against the approved revision. Record wear, missing spares and compatibility questions as open items.',
   'line-clearance':'Specifically verify cleaning and approved cleanliness acceptance for Pressing 3 and Pressing 4 if selected. The known cleaning risk is not assigned to Pressing 1, 2 or 5. Hold suspect material for quality review; no cleaning interval or completion is inferred.'
  })
 });
 const CLOSURE=Object.freeze({id:'closeout',group:'People and release',question:'Are sample quantities, evidence and unresolved follow-up items reconciled?',guidance:PROFILE_GUIDANCE.general.closeout,priority:null});
 const TEMPLATES=Object.freeze(Object.fromEntries(Object.keys(PROFILE_GUIDANCE).map(profile=>[profile,Object.freeze([...QUESTIONS,CLOSURE].map(q=>Object.freeze({...q,guidance:PROFILE_GUIDANCE[profile][q.id]||PROFILE_GUIDANCE.general[q.id]||q.guidance})))])));
 const SIMPLE_CHECKS=Object.freeze({
  product:'Are the sample model, version, quantity and date agreed?',
  'approved-definition':'Are the correct drawing, parts list and quality checks ready?',
  'pcb-provenance':'Are the correct PCB source and delivery date confirmed?',
  materials:'Will enough usable materials be ready before the sample date?',
  traceability:'Is the first QR and lot check planned before production?',
  'program-settings':'Are the correct machine program and settings ready?',
  equipment:'Are the line, machines and measuring tools reserved and checked?',
  tooling:'Are the correct tools, trays and spare parts ready?',
  'line-clearance':'Is machine cleaning planned before the sample?',
  'first-piece':'Are the first sample checks and the person who checks it agreed?',
  'ng-response':'Is a plan ready to separate, repair and recheck bad parts?',
  'roles-support':'Are trained workers and support people available for the sample?',
  'escalation-route':'Do we know the line Leader or Supervisor to contact first?',
  'packing-release':'Are packing, labels and the shipping contact ready?',
  closeout:'Is a plan ready to count samples and record open problems?'
 });
 const SIMPLE_GUIDANCE=Object.freeze({
  'pcb-provenance':'Check who makes the PCB, its model and lot, and when it will be ready. An unknown source still needs checking.',
  traceability:'Arrange the first QR scan and check its lot in the system before starting. A readable QR alone is not enough.',
  equipment:'Confirm the actual line, machine and time slot. Reference equipment may not be available for this run.',
  'line-clearance':'Plan cleaning and removal of old material before starting. Do not mark future cleaning as already done.',
  'ng-response':'Keep bad parts separate. Agree where they will be repaired and rechecked before returning.',
  'escalation-route':'Contact the line Leader or Supervisor first. Who is on duty still needs confirmation.',
  closeout:'Plan how good and bad samples will be counted and who will follow up open problems.'
 });
 const SIMPLE_TEMPLATES=Object.freeze(Object.fromEntries(Object.keys(PROFILE_GUIDANCE).map(profile=>[profile,Object.freeze([...QUESTIONS,CLOSURE].map(q=>{
  let question=SIMPLE_CHECKS[q.id],guidance=SIMPLE_GUIDANCE[q.id]||'Confirm this for the planned sample run; leave it unknown until checked.';
  if(q.id==='pcb-provenance'&&['smt','t1-2'].includes(profile))question='Is this PCB made in-house, with materials ready for the sample date?';
  if(q.id==='pcb-provenance'&&profile==='tem')guidance='Check the actual PCB supplier and arrival date for this model. Do not assume every TEM sample uses the same supplier.';
  if(q.id==='tooling'&&profile==='tem')question='Are the TEM tools, trays and test contacts ready for this model?';
  if(q.id==='tooling'&&profile==='smt')question='Are the PCB tools, trays and test equipment ready?';
  if(q.id==='line-clearance'&&profile==='t1-2')guidance='Check Press 3 and 4 if used. Their cleaning risk must not be assigned to other presses.';
  return Object.freeze({...q,question,guidance});
 }))])));
 function profileFor(project,partId){
  if(!(project.entities||[]).some(e=>e.id===partId&&e.type==='Part'))return 'general';
  if(partId==='ls-part-t1-2-uplevel')return 't1-2';
  if(['tem-part-p768-a2','tem-part-bl7m'].includes(partId))return 'tem';
  if(['smt-g65-pcb','smt-jp-rh-pcb','smt-lq2-hb-pcb','smt-lq2-lh-pcb','smt-lq2-rh-pcb'].includes(partId))return 'smt';
  return 'general';
 }
 function newProfileFor(project,partId){
  const known=profileFor(project,partId);if(known!=='general')return known;
  const family=project.entities?.find(e=>e.type==='Part'&&e.id===partId)?.productionFamily;
  return family==='SMT'?'smt':family==='TEM'?'tem':'general';
 }
 function questions(sheet){if(sheet?.templateVersion===LEGACY_VERSION)return QUESTIONS;const templates=sheet?.templateVersion===PROFILE_VERSION?TEMPLATES:SIMPLE_TEMPLATES;return templates[sheet?.profile]||templates.general;}
 function today(now=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}
 function worksheet(project,sheet,now=new Date()){
  const entities=new Map((project.entities||[]).filter(e=>e.status!=='archived'&&e.privacy!=='local_only').map(e=>[e.id,e])),relations=(project.relations||[]).filter(r=>!r.scopeProjectId||r.scopeProjectId===project.id),part=entities.get(sheet.partId);
  const uncertain=r=>!!(part?.routeAssumption||part?.referenceOnly||entities.get(r.from)?.routeAssumption||entities.get(r.from)?.referenceOnly||entities.get(r.to)?.routeAssumption||entities.get(r.to)?.referenceOnly||r.reviewState==='unverified'||r.routeAssumption);
  const steps=new Map();for(const r of relations)if(r.type==='applies_to'&&r.to===part?.id&&entities.get(r.from)?.type==='Production Step')steps.set(r.from,!!(steps.get(r.from)||uncertain(r)));
  const lineLinks=relations.filter(r=>r.type==='operated_in'&&steps.has(r.from)||r.type==='produces'&&r.to===part?.id);
  const lines=new Map(),sources=new Map(),inputSuppliers=new Map();
  const add=(map,id,r,pathUnconfirmed=false,role)=>{const e=entities.get(id);if(!e)return;const key=id+(role?':'+role:''),old=map.get(key);map.set(key,{id:e.id,name:e.name,...(role?{role}:{}),unconfirmed:!!(old?.unconfirmed||pathUnconfirmed||uncertain(r))});};
  for(const r of lineLinks){const id=r.type==='produces'?r.from:r.to;if(entities.get(id)?.type==='Resource'&&entities.get(id)?.resourceKind==='line')add(lines,id,r,steps.get(r.from));}
  const inputs=new Map();for(const r of relations)if(r.type==='part_of'&&r.to===part?.id&&entities.get(r.from)?.type==='Part')inputs.set(r.from,!!(inputs.get(r.from)||uncertain(r)));
  const pcbOutput=newProfileFor(project,part?.id)==='smt';
  for(const r of relations)if(['supplies','produces'].includes(r.type)&&['Organization','Resource'].includes(entities.get(r.from)?.type)){
   const role=r.type==='produces'?'producer':'supplier';
   if(pcbOutput&&r.to===part.id)add(sources,r.from,r,false,role);
   if(inputs.has(r.to)){
    if(pcbOutput)add(inputSuppliers,r.from,r,inputs.get(r.to),role);
    else if(/\bPCB\b/i.test(entities.get(r.to)?.name||''))add(sources,r.from,r,inputs.get(r.to),role);
   }
  }
  const day=today(now),date=sheet.sampleDate||'',days=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000):null;
  const timing={today:day,preparationDate:sheet.preparationDate||'',sampleDate:date,daysUntilSample:days,state:days===null?'not_set':days<0?'past':days===0?'today':'upcoming',preparedAfterSample:!!(date&&sheet.preparationDate&&sheet.preparationDate>date)};
  const sorted=map=>[...map.values()].sort((a,b)=>a.id.localeCompare(b.id)||String(a.role).localeCompare(String(b.role)));
  return {questions:questions(sheet).map(q=>({...q,question:sheet.templateVersion===TEMPLATE_VERSION?q.question:SIMPLE_CHECKS[q.id]||q.question})),context:{lines:sorted(lines),pcbSources:sorted(sources),inputSuppliers:sorted(inputSuppliers),pcbOutput},timing};
 }
 function metadata(sheet){
  const result={};
  for(const key of ['sampleDate','preparationDate'])if(sheet[key]!==undefined){const date=text(sheet[key],key==='sampleDate'?'Planned sample date':'Preparation date',10);if(date!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1900-01-01'||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw Error('Use a valid date (YYYY-MM-DD).');result[key]=date;}
  if(sheet.sampleQuantity!==undefined){const n=sheet.sampleQuantity;if(n!==null&&(!Number.isSafeInteger(n)||n<1))throw Error('Sample quantity must be a positive whole number or left unknown.');result.sampleQuantity=n;}
  if(sheet.memo!==undefined)result.memo=text(sheet.memo,'Short memo',1000);
  return result;
 }
 function riskReview(project,partId){
  const entities=new Map((project.entities||[]).filter(e=>e.status!=='archived').map(e=>[e.id,e])),relations=project.relations||[];
  if(entities.get(partId)?.type!=='Part')return {linked:[],references:[]};
  const subjectIds=new Set([partId]);
  for(const r of relations){
   if(r.to===partId&&r.type==='applies_to'&&['Production Step','Work Item'].includes(entities.get(r.from)?.type))subjectIds.add(r.from);
   if(r.to===partId&&r.type==='produces'&&['Production Step','Resource'].includes(entities.get(r.from)?.type))subjectIds.add(r.from);
   if(r.to===partId&&r.type==='part_of'&&entities.get(r.from)?.type==='Part')subjectIds.add(r.from);
  }
  const operations=[...subjectIds].filter(id=>entities.get(id)?.type==='Production Step');
  for(const r of relations)if(operations.includes(r.from)&&['requires','uses','operated_in','performed_at'].includes(r.type)&&entities.get(r.to)?.type==='Resource')subjectIds.add(r.to);
  const linked=[],references=[];
  for(const risk of entities.values())if(risk.type==='Risk'){
   const targets=relations.filter(r=>r.type==='potentially_affects'&&r.from===risk.id).map(r=>entities.get(r.to)).filter(Boolean);
   const mitigations=relations.filter(r=>r.type==='mitigates'&&r.to===risk.id).map(r=>entities.get(r.from)).filter(e=>e?.type==='Work Item');
   const item={risk,targets:[...new Map(targets.map(e=>[e.id,e])).values()],mitigations:[...new Map(mitigations.map(e=>[e.id,e])).values()]};
   (targets.some(e=>subjectIds.has(e.id))?linked:references).push(item);
  }
  return {linked,references};
 }
 const STATUSES=Object.freeze(['unknown','in_progress','verified','issue','not_applicable']);
 const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function isSample(project){return !!project&&(project.projectType!=null?project.projectType==='sample':['MOBIS + HELLA','SMT','T1-2'].includes(project.name));}
 function create(project,input={}){
  if(!isSample(project))throw Error('Choose a sample project.');
  const profile=newProfileFor(project,input.partId),sheet={id:'sample-preparation-'+root.crypto.randomUUID(),partId:input.partId??'',runName:input.runName??'',templateVersion:TEMPLATE_VERSION,profile,version:0,preparationDate:input.preparationDate??today(),sampleDate:input.sampleDate??'',sampleQuantity:input.sampleQuantity??null,memo:input.memo??''};
  return {...sheet,answers:questions(sheet).map(q=>({questionId:q.id,status:'unknown',note:'',ownerId:null,referenceIds:[]}))};
 }
 function text(value,label,max){if(typeof value!=='string'||value.length>max)throw Error(label+' must be text up to '+max+' characters.');return value.trim();}
 function validate(project,sheet){
  if(!isSample(project))throw Error('Choose a sample project.');
  if(!object(sheet)||!identifier(sheet.id))throw Error('Invalid checksheet ID.');
  const entities=new Map((project.entities||[]).map(e=>[e.id,e]));
  if(!identifier(sheet.partId)||entities.get(sheet.partId)?.type!=='Part')throw Error('Choose a Part in this project.');
  const runName=text(sheet.runName,'Run name',180);if(!runName)throw Error('Run name is required.');
  if(![TEMPLATE_VERSION,PROFILE_VERSION,LEGACY_VERSION].includes(sheet.templateVersion))throw Error('Unsupported template version.');
  if(sheet.templateVersion===PROFILE_VERSION&&sheet.profile!==profileFor(project,sheet.partId))throw Error('Checksheet profile must match the selected model.');
  if(sheet.templateVersion===TEMPLATE_VERSION&&sheet.profile!==newProfileFor(project,sheet.partId))throw Error('Checksheet profile must match the selected model.');
  const list=questions(sheet),details=metadata(sheet);
  if(!Number.isSafeInteger(sheet.version)||sheet.version<0)throw Error('Invalid sheet version.');
  if(!Array.isArray(sheet.answers)||sheet.answers.length!==list.length)throw Error('Provide all '+list.length+' question answers.');
  const byId=new Map();
  for(const answer of sheet.answers){
   if(!object(answer)||!list.some(q=>q.id===answer.questionId)||byId.has(answer.questionId))throw Error('Invalid or duplicate question ID.');
   byId.set(answer.questionId,answer);
  }
  const answers=list.map(q=>{
   const answer=byId.get(q.id),status=answer.status??'unknown',note=text(answer.note??'','Evidence note',4000);
   if(!STATUSES.includes(status))throw Error('Unknown answer status.');
   if(status==='verified'&&(note.length<10||!/[\p{L}\p{N}]/u.test(note)||/^(verified|confirmed|completed|not applicable)[.!\s]*$/i.test(note)))throw Error('Verified requires a substantive evidence note (at least 10 characters).');
   if(status==='not_applicable'&&(note.length<5||!/[\p{L}\p{N}]/u.test(note)||/^(n\/?a|none|not applicable)[.!\s]*$/i.test(note)))throw Error('Not applicable requires a reason (at least 5 characters).');
   const ownerId=answer.ownerId===''||answer.ownerId==null?null:answer.ownerId;
   if(ownerId!==null&&(!identifier(ownerId)||!['Person','Organization'].includes(entities.get(ownerId)?.type)))throw Error('Owner must be a Person or Organization in this project.');
   const refs=answer.referenceIds??[];
   if(!Array.isArray(refs)||refs.length>20||refs.some(id=>!identifier(id)||!entities.has(id)))throw Error('Use at most 20 reference IDs from this project.');
   return {questionId:q.id,status,note,ownerId,referenceIds:[...new Set(refs)]};
  });
  return {id:sheet.id,partId:sheet.partId,runName,templateVersion:sheet.templateVersion,...(sheet.templateVersion!==LEGACY_VERSION?{profile:sheet.profile}:{}),...details,answers,version:sheet.version};
 }
 function summary(sheet){
  const list=questions(sheet),result={total:list.length,unknown:0,in_progress:0,verified:0,issue:0,not_applicable:0,complete:false,p0Status:'unknown'};
  for(const q of list){const value=sheet?.answers?.find(a=>a.questionId===q.id)?.status,status=STATUSES.includes(value)?value:'unknown';result[status]++;if(q.priority==='P0')result.p0Status=status;}
  result.complete=result.verified+result.not_applicable===result.total;return result;
 }
 function latest(records){
  const sheets=new Map();for(const sheet of records){const old=sheets.get(sheet.id);if(!old||sheet.version>old.version||sheet.version===old.version&&(sheet.recordRevision||0)>(old.recordRevision||0))sheets.set(sheet.id,sheet);}return [...sheets.values()];
 }
 // Notes are intentionally viewer-visible; omit source payloads and private entity links.
 function sanitize(sheet){
  return {id:sheet.id,partId:sheet.partId,runName:sheet.runName,templateVersion:sheet.templateVersion,version:sheet.version,...(sheet.templateVersion!==LEGACY_VERSION?{profile:sheet.profile}:{}),...metadata(sheet),
   answers:questions(sheet).map(q=>{const a=sheet.answers?.find(a=>a.questionId===q.id);return {questionId:q.id,status:STATUSES.includes(a?.status)?a.status:'unknown',note:typeof a?.note==='string'?a.note:''};})};
 }
 const api={QUESTIONS,TEMPLATE_VERSION,STATUSES,isSample,create,validate,normalize:validate,summary,latest,sanitize,questions,profileFor,newProfileFor,worksheet,today,riskReview};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SamplePreparation=api;
})(globalThis);
