'use strict';
const M=require('./ontology-model'),P=require('./projects');
const NG='obj-muuj7txx-793y1',SCRAP='obj-muuj7txx-18p2g',PRESS='ls-step-t1-2-uplevel-bending',SET='obj-muuhrk68-l9oj9';
const source='User clarification 2026-10-13: T1-2; five press machines; inadequate cleaning can cause defects. SMT-origin defects found downstream return to their original producing SMT for repair and reinspection.';
function ensure(g,id,input){let e=M.byId(g,id);if(!e){e=M.addEntity(g,input);e.id=id;}return e;}
function link(g,from,type,to,evidence=source,scopeProjectId=null){
 if(!g.relations.some(r=>r.from===from&&r.type===type&&r.to===to&&(r.scopeProjectId??null)===scopeProjectId)){
  const r=M.addRelation(g,{from,type,to,evidence,scopeProjectId});r.id='smt-press-link-'+[from,type,to,scopeProjectId||'shared'].join('-');
 }
}
function applyShared(g){
 const before=JSON.stringify(g),press=M.byId(g,PRESS),set=M.byId(g,SET);
 for(const id of [NG,SCRAP,'ls-smt-source-line','tem-starpro-smt'])if(!M.byId(g,id))throw Error('Canonical source/disposition missing: '+id);
 if(!press||!set)throw Error('Canonical T1-2 Uplevel press missing.');
 if(press.productionStage!=='Pressing'){
  if(press.productionStage!=='Press bending #1–#5')throw Error('Press route changed manually; review before migration.');
  M.updateEntity(g,PRESS,{name:'T1-2 Uplevel · Pressing',productionStage:'Pressing',context:press.context+'\n'+source+' One operation; physical station order is unconfirmed, not Stacking/Sticking.'});
 }
 if(set.resourceKind==='machine')M.updateEntity(g,SET,{name:'T1-2 Uplevel · Press equipment set',resourceKind:'other',machineMode:'',context:set.context+'\n'+source+' Historical aggregate reference retained as equipment set, not a sixth machine.'});
 else if(set.resourceKind!=='other')throw Error('Press equipment identity changed manually; review required.');
 g.relations=g.relations.filter(r=>!(r.from===PRESS&&r.type==='requires'&&r.to===SET));
 for(let n=1;n<=5;n++){
  const e=ensure(g,'t1-2-uplevel-press-'+n,{type:'Resource',name:'T1-2 Uplevel · Pressing '+n,resourceKind:'machine',machineMode:'specific_asset',machineFamily:'Press',context:source+' Ordinal label only; actual asset ID, tooling, cleaning procedure and individual operator unconfirmed.'});
  if(!e.tier)M.updateEntity(g,e.id,{tier:'T1-2 Uplevel / Pressing '+n});
  link(g,PRESS,'requires',e.id);link(g,e.id,'part_of',SET);
 }
 const ng=M.byId(g,NG),returnRule='SMT-origin routing: confirm source and cause before return; repair and accepted reinspection at the original producing SMT, then retest at the original failed downstream step. Unknown source stays held. Local non-SMT repair and unrecoverable Scrap remain separate.';
 if(!ng.context.includes(returnRule))M.updateEntity(g,NG,{context:ng.context+'\n'+source+' '+returnRule});
 for(const r of g.relations.filter(r=>r.from===NG&&r.type==='rework_of'))if(!r.evidence.includes('SMT-origin'))r.evidence+=' Local non-SMT repair only; confirmed SMT-origin defects must use source repair and accepted reinspection before return.';
 // Customer sample policies attach their source-specific return links in applyProject.
 const returns=g.relations.filter(r=>r.from===NG&&r.type==='rework_of'&&!r.to.startsWith('customer-tem-')).map(r=>r.to);
 for(const [prefix,line,label] of [['smt-origin-internal','ls-smt-source-line','Internal SMT'],['smt-origin-starpro','tem-starpro-smt','Starpro SMT']]){
  const condition='Only if confirmed SMT-origin defect AND original producing source is '+label+'. Record original source line/asset, PCB or component identity, lot/unit trace, failed downstream step and repair case. Unknown origin remains held; these are conditional alternatives, not two required sources.';
  const repair=ensure(g,prefix+'-repair',{type:'Production Step',name:label+' · origin repair',productionStage:label+' origin repair',processLevel:'sub',parentWorkId:NG,branchKind:'rework',status:'planned',operatorAction:'Identify original source and repair case; repair only under an approved procedure.',context:source+' '+condition+' Exact repair station and operator unconfirmed. Policy, not an actual repair Event.'});
  const check=ensure(g,prefix+'-reinspection',{type:'Production Step',name:label+' · reinspection / release',productionStage:label+' reinspection',processLevel:'sub',parentWorkId:NG,branchKind:'rework',status:'planned',acceptanceCriteria:'Recorded reinspection acceptance required before release back to the original failed downstream process.',context:source+' '+condition+' Retest criteria and approval authority unconfirmed. Not new production output.'});
  link(g,NG,'on_failure',repair.id,condition);
  for(const e of [repair,check])link(g,e.id,'operated_in',line,condition+' Exact child line comes from actual case provenance, not this generic policy.');
  link(g,repair.id,'precedes',check.id,'Repair then reinspection; no direct bypass back to downstream production.');
  link(g,check.id,'on_failure',NG,'Failed or unapproved reinspection: remain on hold for disposition; no automatic release or inventory change. Existing unrecoverable Scrap rule remains.');
  for(const id of returns)link(g,check.id,'rework_of',id,'Only after accepted reinspection, return to THIS originating failed step for the SAME unit/lot. '+condition);
 }
 M.validateStore(g);return before!==JSON.stringify(g);
}
const candidates=[
 ['equipment','Sample · equipment / factory readiness','Actual equipment identity, factory, compatible capability or reserved availability may be missing.','Verify actual factory, line/asset IDs, capability and sample slot. Record confirmation; do not treat an equipment requirement as a physical asset.'],
 ['tooling','Sample · machine subpart / tooling compatibility','Required jig, tray, cable or machine subpart may be missing or incompatible.','Confirm required tooling and machine subparts by drawing/version; record readiness per asset. Register only identified subparts as Resources, not product Components.'],
 ['settings','Sample · setup / program revision mismatch','Drawing, BOM, program or machine setup may refer to different revisions.','Reconcile approved drawing/BOM/program/recipe versions and record setup confirmation before trial; do not automatically change current settings.'],
 ['trial','Sample · trial acceptance not established','A setup trial may be treated as acceptable without recorded checks.','Agree trial acceptance and inspection evidence before sample release. Readiness remains unknown until evidence is reviewed.'],
 ['supply','Sample · Starpro material availability / arrival','Required PCB/material may not arrive in time for the planned sample.','Confirm item identity, required quantity, supplier availability and promised/actual arrival separately. Preserve Starpro SMT origin, lot and receiving record.'],
 ['material','Sample · material code / revision / lot mismatch','Received material may differ from required model, revision or lot.','Compare received item code, revision, lot and quantity against confirmed requirements; segregate mismatches pending disposition.'],
 ['consumption','Sample · setup / rework consumes available material','Setup loss and rework may consume material needed for the sample.','Review usable stock and expected trial/rework consumption; agree extra material only from confirmed demand. Do not invent a buffer or reuse the capacity 15% margin.'],
 ['dispatch','Sample · packing / transfer readiness','Packing container or transfer readiness may delay or compromise sample delivery.','Confirm compatible packaging, dispatch staging, transfer contact and sample delivery requirement; record actual transfer separately from plan.']
];
function applyProject(p,g){
 if(!['LS','SMT','MOBIS + HELLA'].includes(p.name)||p.status!=='active')return false;
 const before=JSON.stringify(p),ids=new Set([NG,SCRAP]);
 const origins=p.name==='SMT'?['smt-origin-internal']:p.name==='MOBIS + HELLA'?['smt-origin-starpro']:['smt-origin-internal','smt-origin-starpro'];
 for(const prefix of origins)for(const suffix of ['repair','reinspection'])ids.add(prefix+'-'+suffix);
 for(const r of g.relations)if(ids.has(r.from)&&r.type==='operated_in')ids.add(r.to);
 if(p.name==='LS')for(const id of [PRESS,SET,...Array.from({length:5},(_,i)=>'t1-2-uplevel-press-'+(i+1))])ids.add(id);
 P.attachMembers(p,g,[...ids]);
 // Existing members preserve project dates and assessments while canonical corrections take effect.
 if(p.name==='LS')for(const id of [PRESS,SET]){
  const e=M.byId(p,id),canonical=M.byId(g,id);
  Object.assign(e,{name:canonical.name,context:canonical.context,...(id===PRESS?{productionStage:canonical.productionStage}:{resourceKind:canonical.resourceKind,machineMode:canonical.machineMode})});
 }
 p.relations=p.relations.filter(r=>!(r.from===PRESS&&r.type==='requires'&&r.to===SET));
 const members=new Set(p.entities.map(e=>e.id));
 for(const r of g.relations)if(members.has(r.from)&&members.has(r.to)&&(!r.scopeProjectId||r.scopeProjectId===p.id)&&!p.relations.some(x=>x.id===r.id))p.relations.push({...r,projectId:p.id});
 const failureSteps=p.entities.filter(e=>e.type==='Production Step'&&/^customer-tem-.*-step-(1|6|17)$/.test(e.id));
 for(const step of failureSteps){
  link(p,step.id,'on_failure',NG,'Conditional shared NG policy for the temporarily reused sample inspection route; not proof of actual defects.');
  link(p,NG,'rework_of',step.id,'Local repair return only to the originating failed inspection; SMT-origin defects require source repair and accepted reinspection.');
  for(const r of p.relations.filter(r=>r.type==='applies_to'&&r.from===step.id))link(p,NG,'applies_to',r.to,'Shared NG policy for this sample Part; not a defect count.');
 }
 for(const prefix of origins)for(const r of p.relations.filter(r=>r.from===NG&&r.type==='rework_of'))link(p,prefix+'-reinspection','rework_of',r.to,'Accepted source-SMT reinspection only: return to THIS original failed process of the SAME traced item, not every linked process.');
 p.workstreams||={};for(const id of ids)p.workstreams[id]=[...new Set([...(p.workstreams[id]||[]),'production'])];
 const slug=p.name==='LS'?'ls':p.name==='SMT'?'smt':'customer';
 function risk(id,name,context,targets,action){
  const e=ensure(p,id,{type:'Risk',name,status:'unknown',context:source+' '+context+' Potential failure, not a recorded incident. Likelihood, severity, owner and due date unconfirmed.'});
  const work=ensure(p,id+'-mitigation',{type:'Work Item',name:name+' · mitigation',status:'planned',context:action+' Proposed action; not completed. Owner, deadline and verification evidence not yet provided.'});
  link(p,work.id,'mitigates',e.id,action,p.id);
  for(const target of targets.filter(id=>M.byId(p,id)))link(p,e.id,'potentially_affects',target,context,p.id);
  p.workstreams[e.id]=['production'];p.workstreams[work.id]=['production'];return work;
 }
 risk('risk-'+slug+'-smt-origin-return','SMT origin defect · downstream return / rework delay','Downstream SMT-origin defects require a return loop. Wrong source, lost traceability or premature release can delay samples and reintroduce defective material.',[NG,...origins.map(x=>x+'-repair'),...origins.map(x=>x==='smt-origin-internal'?'ls-smt-source-line':'tem-starpro-smt')],'Hold suspect items; confirm cause and original producing source/lot, preserve failed-step ID, agree repair and return handling, record repair/reinspection acceptance, retest at original failed downstream step. Unknown source stays held; no automatic inventory/state change.');
 if(p.name==='LS'){
  const riskId='risk-ls-press-cleanliness',correction='User correction 2026-10-13: cleanliness Risk applies only to Pressing 3 and 4. No cleanliness Risk is registered for 1, 2 or 5; this does not certify them risk-free.';
  p.relations=p.relations.filter(r=>!(r.from===riskId&&r.type==='potentially_affects'&&[PRESS,'t1-2-uplevel-press-1','t1-2-uplevel-press-2','t1-2-uplevel-press-5'].includes(r.to)));
  risk(riskId,'T1-2 Pressing · inadequate machine cleaning',correction,['t1-2-uplevel-press-3','t1-2-uplevel-press-4'],'Confirm approved cleaning procedure and cleanliness acceptance for Pressing 3 and 4; preserve per-machine check evidence before use. Hold suspect material and review cleanliness and approved trial/quality release. No cleaning interval, chemistry or operator inferred.');
  for(const id of [riskId,riskId+'-mitigation']){
   const e=M.byId(p,id);let context=e.context.replace('Pressing 1–5','Pressing 3 and 4');
   if(!context.includes(correction))context+='\n'+correction;
   if(context!==e.context)M.updateEntity(p,id,{context});
  }
  for(const r of p.relations.filter(r=>r.type==='mitigates'&&r.to===riskId))r.evidence=r.evidence.replace('Pressing 1–5','Pressing 3 and 4');
 }
 if(p.name==='MOBIS + HELLA'){
  const targets=['tem-mobis-main','tem-hella-main'].filter(id=>M.byId(p,id));
  for(const [key,name,context,action] of candidates)risk('sample-common-risk-'+key,name,'Sample readiness review candidate shared by MOBIS + HELLA: '+context,targets,action);
  for(const id of ['tem-mobis-readiness-risk','tem-hella-readiness-risk'])if(M.byId(p,id)){
   const work=ensure(p,id+'-mitigation',{type:'Work Item',name:M.byId(p,id).name+' · readiness verification',status:'planned',context:'Review sample equipment, setup, material and trial readiness with traceable evidence. Existing gate decision/status remains unchanged; no owner inferred.'});
   link(p,work.id,'mitigates',id,'Readiness review proposal; no completion evidence provided.',p.id);p.workstreams[work.id]=['production'];
  }
 }
 P.validate(p);return before!==JSON.stringify(p);
}
module.exports={applyShared,applyProject};
if(require.main===module)(async()=>{
 const path=require('node:path'),s=require('./local-store').openStore(path.join(__dirname,'..','.local-data','ontology.sqlite'));
 try{
  const backup=path.join(__dirname,'..','.local-data','ontology-before-smt-return-press-risk-'+Date.now()+'.sqlite');await s.backup(backup);
  let w=s.load();if(applyShared(w.library))s.save(w,'library',w.revision);
  for(const name of ['LS','SMT','MOBIS + HELLA']){w=s.load();const p=w.projects.find(p=>p.name===name&&p.status==='active');if(!p)throw Error('Active project missing: '+name);if(applyProject(p,w.library))s.save(w,p.id,w.revision);}
  w=s.load();console.log(JSON.stringify({backup,revision:w.revision,projects:w.projects.filter(p=>['LS','SMT','MOBIS + HELLA'].includes(p.name)&&p.status==='active').map(p=>({name:p.name,risks:p.entities.filter(e=>e.type==='Risk'&&e.status!=='archived').length}))}));
 }finally{s.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
