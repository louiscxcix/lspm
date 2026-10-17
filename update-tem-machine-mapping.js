'use strict';
const M=require('./ontology-model'),P=require('./projects');
const source='TEM_Machine_Process_Mapping.md · working field-note draft; document sequence is not an approved route.';
const rows=[
 ['loading-1','Loading Machine 1','Loading Process 1',null,'Loaded product/component, source and correspondence to Magazine/Tray Loading are unconfirmed.'],
 ['rivet','Rivet Machine','Rivet Process',null,'Rivet attachment is not assumed equivalent to the existing Bolt Attachment operation.'],
 ['laser','Laser Machine','Laser Process',8,'Exact laser function is unconfirmed in this note. Previous Laser Etching / Cleaning detail is preserved, not silently certified or discarded.'],
 ['bonding','BESI Machine','LED Bonding',11,'BESI equipment name maps to the existing LED Bonding operation; exact asset/model and per-customer allocation unconfirmed.'],
 ['loading-2','Loading Machine 2','Loading Process 2',null,'Transferred item and location in the existing route are unconfirmed; distinct from Loading Machine 1.'],
 ['plasma','Plasma Machine','Plasma Process',15,'Treatment purpose and approved recipe/acceptance are unconfirmed.'],
 ['wire','Wire Bonding Machine','Wire Bonding',16,'Wire connection operation; actual bonding requirements and machine identity unconfirmed.'],
 ['aoi','AOI Machine','AOI Inspection',null,'Not automatically equated to Section 1 Inspection or to supplier/internal SMT AOI. Inspection criteria unconfirmed.'],
 ['eol','EOL Machine','EOL Inspection',17,'Existing EOL operation retained; exact tests and pass criteria unconfirmed.'],
 ['packing','Packing Machine / Station','Packing',19,'Existing Automatic Packing detail retained. Note does not resolve machine versus manual station, quantity or labeling criteria.']
];
function link(g,from,type,to,evidence=source,scopeProjectId=null){
 if(!g.relations.some(r=>r.from===from&&r.type===type&&r.to===to&&(r.scopeProjectId??null)===scopeProjectId)){
  const r=M.addRelation(g,{from,type,to,evidence,scopeProjectId});r.id='tem-mapping-link-'+[from,type,to,scopeProjectId||'shared'].join('-');
 }
}
function ensure(g,id,input){let e=M.byId(g,id);if(!e){e=M.addEntity(g,input);e.id=id;}return e;}
function append(e,note){return e.context.includes(note)?e.context:e.context+'\n'+note;}
function applyShared(g){
 const before=JSON.stringify(g),tem=g.entities.find(e=>e.type==='Resource'&&e.resourceKind==='line'&&e.name==='TEM');if(!tem)throw Error('Canonical TEM area missing.');
 for(const [key,machine,operation,index,note] of rows){
  if(index==null){
   const id='tem-reference-machine-'+key;
   ensure(g,id,{type:'Resource',name:'TEM · '+machine,resourceKind:key==='aoi'?'test_equipment':'machine',machineFamily:machine,tier:'TEM / '+machine,site:'TEM · exact location unconfirmed',mappingState:'reference_unverified',status:'planned',context:source+' '+note+' Name reference only: asset ID, model, availability, operator and customer usage unconfirmed.'});
   const step=ensure(g,'tem-reference-step-'+key,{type:'Production Step',name:'TEM reference · '+operation,productionStage:operation,displayProcessName:operation,processLevel:'main',branchKind:'support',applicability:'pending_review',status:'planned',context:source+' '+note+' Unplaced line reference; no confirmed model or sequence. Not an added stage in existing Part routes.'});
   link(g,step.id,'requires',id);link(g,step.id,'operated_in',tem.id);link(g,id,'part_of',tem.id,'TEM equipment-domain reference only; exact location and physical allocation unconfirmed. '+source);
   continue;
  }
  for(const prefix of ['tem-biled','customer-tem-mobis','customer-tem-hella']){
   const stepId=prefix+'-step-'+index,equipmentId=(prefix==='tem-biled'?'':prefix+'-')+'tem-biled-equipment-'+index;
   const step=M.byId(g,stepId),equipment=M.byId(g,equipmentId);if(!step||!equipment)continue;
   if(!g.relations.some(r=>r.from===stepId&&r.type==='requires'&&r.to===equipmentId))throw Error('Existing machine correspondence changed: '+stepId);
   const label=step.name.split('·')[0].trim(),detail=source+' '+note+' Equipment-name correspondence is provisional; no cross-customer physical-asset merge. Original stage key: '+step.productionStage+'.';
   M.updateEntity(g,stepId,{name:label+' · '+operation,displayProcessName:operation,context:append(step,detail)});
   M.updateEntity(g,equipmentId,{name:label+' · '+machine,tier:'TEM / '+machine,context:append(equipment,detail)});
  }
 }
 // Existing physical flow stays intact; area is not a new factory/building or a child-line assignment.
 for(const e of g.entities.filter(e=>e.id.startsWith('tem-biled-step-')))link(g,e.id,'operated_in',tem.id,'TEM area context; exact child line and individual allocation unconfirmed. '+source);
 M.validateStore(g);return before!==JSON.stringify(g);
}
const definitions=[
 ['availability','Machine breakdown / unavailable slot',null,'Fault, power/control interruption or lack of a sample slot can stop preparation. No current failure is asserted.','Confirm actual asset/location/capability, readiness checks, reserved slot and approved recovery contact before trial; retain downtime and release evidence.'],
 ['spares','Spare part supply / repair delay',null,'A required spare or qualified maintenance support may be unavailable, extending sample delay.','Identify approved spare part codes/revisions, supplier lead time and repair support. Record availability; never assume a substitute is compatible.'],
 ['compatibility','Subpart / jig / fixture mismatch',null,'Installed or replacement subparts may have incompatible dimensions, model, revision or interfaces. Specific installed subparts remain unconfirmed.','Check actual installed BOM/part code, revision and approved compatibility; record replacement history and acceptance. Register named subparts as Resources only when identified.'],
 ['settings','Wrong program / recipe / model changeover',null,'Wrong or stale programs, offsets, units or recipe revisions may produce apparently normal but incorrect samples.','Match approved drawing/BOM/test/program versions to the sample, record setup/changeover review and trial acceptance; no automatic settings update.'],
 ['motion','Loading / transfer motion or positioning fault',['loading-1','loading-2'],'Drive, guide, position sensor, clamp or vacuum fault may cause misfeed, jams or damaged/misaligned items, if that mechanism is installed.','Verify actual mechanism and its approved checks; record jams, handling damage and position verification. No assumed vacuum hardware or invented motion settings.'],
 ['fastening','Rivet feed / tooling wear / attachment defect',['rivet'],'Feed/tool wear or incompatible rivet/fixture may cause missing or inconsistent attachment. Rivet station correspondence to the product route remains unknown.','Confirm rivet/tool codes and fixture, review approved attachment checks and trial evidence. Do not substitute Bolt Attachment or invent force/torque limits.'],
 ['laser','Laser optics / focus / program drift',['laser'],'Optics contamination, alignment/focus or wrong program may affect the intended operation. Exact laser purpose is unresolved.','Confirm intended laser operation and approved program/inspection; request qualified equipment checks and acceptance evidence. No invented cleaning technique, laser power or exposure settings.'],
 ['bonding','LED placement / pickup tooling / bonding deviation',['bonding'],'Worn or incompatible pickup/bonding tooling, alignment drift or incorrect bonding recipe may affect placement or connection, if present.','Identify installed tooling and approved recipe; retain setup, alignment, trial and inspection acceptance. Specific nozzle/collet, materials and limits are not yet confirmed.'],
 ['plasma','Plasma treatment / recipe / utility deviation',['plasma'],'Unconfirmed recipe or utility/equipment condition may lead to ineffective treatment. The actual treatment purpose and installed utility configuration are unknown.','Confirm purpose, installed equipment configuration and approved process checks; retain treatment/trial acceptance. Do not invent gas, pressure or power limits.'],
 ['wire','Wire feed / bonding tool wear / connection defect',['wire'],'Wire-feed problems, worn/incompatible bonding tooling or alignment/recipe drift may affect electrical connections.','Confirm approved wire/tool identities and recipe; retain connection inspection/testing and maintenance acceptance. Actual capillary/tool model and test thresholds are unconfirmed.'],
 ['aoi','AOI recipe / optics / false acceptance',['aoi'],'Wrong model recipe, optics/lighting condition or unvalidated criteria may miss defects or reject acceptable items.','Verify inspection scope, approved model recipe and reference acceptance/rejection checks; retain validation evidence. Do not treat AOI as EOL or guess covered defects.'],
 ['eol','EOL fixture contacts / calibration / false pass',['eol'],'Worn or contaminated contacts, wrong test program or unverified measurement status may yield unreliable final tests.','Identify fixture/contact and approved program/test limits; review measurement verification and reference checks. Contact wear/contamination here is a candidate, not the confirmed Pressing cleanliness Risk.'],
 ['packing','Packing handling / container / label mismatch',['packing'],'Handling faults or wrong container, quantity or label can compromise sample dispatch. Automation remains unconfirmed in the new note.','Confirm packaging method and approved container/count/label requirements; retain sample identity and dispatch checks. No assumed tray capacity.']
];
function machineIds(g,key){
 const row=rows.find(r=>r[0]===key),index=row[3];
 return index==null?['tem-reference-machine-'+key]:['tem-biled-equipment-'+index,...['mobis','hella'].map(k=>'customer-tem-'+k+'-tem-biled-equipment-'+index)];
}
function applyProject(p,g){
 if(!['LS','MOBIS + HELLA'].includes(p.name)||p.status!=='active')return false;
 const before=JSON.stringify(p),tem=g.entities.find(e=>e.name==='TEM'&&e.resourceKind==='line'),ids=new Set([tem.id]);
 for(const row of rows){for(const id of machineIds(g,row[0]))if(M.byId(g,id)&&(p.name==='LS'||id.startsWith('tem-reference-')||id.startsWith('customer-tem-')))ids.add(id);if(row[3]==null)ids.add('tem-reference-step-'+row[0]);}
 if(p.name==='LS')for(const e of g.entities.filter(e=>e.id.startsWith('tem-biled-step-')||e.id==='tem-part-biled'))ids.add(e.id);
 // Existing LS/customer route resources are reused, never merged by matching names.
 for(const r of g.relations)if(ids.has(r.from)&&['requires','applies_to','consumes','produces'].includes(r.type)&&M.byId(g,r.to))ids.add(r.to);
 P.attachMembers(p,g,[...ids]);
 for(const e of p.entities){const canonical=M.byId(g,e.id);if(!canonical)continue;
  if(/^(tem-biled|customer-tem-(mobis|hella))-step-/.test(e.id)&&canonical.displayProcessName)Object.assign(e,{name:canonical.name,displayProcessName:canonical.displayProcessName,context:canonical.context});
  if((e.id.startsWith('tem-biled-equipment-')||e.id.startsWith('customer-tem-')&&e.type==='Resource')&&canonical.tier)Object.assign(e,{name:canonical.name,tier:canonical.tier,context:canonical.context});
 }
 const members=new Set(p.entities.map(e=>e.id));for(const r of g.relations)if((!r.scopeProjectId||r.scopeProjectId===p.id)&&members.has(r.from)&&members.has(r.to)&&!p.relations.some(x=>x.id===r.id))p.relations.push({...r,projectId:p.id});
 p.workstreams||={};for(const id of ids)p.workstreams[id]=[...new Set([...(p.workstreams[id]||[]),'production'])];
 const slug=p.name==='LS'?'ls':'customer';
 for(const [key,title,keys,failure,control] of definitions){
  const targets=(keys||rows.map(r=>r[0])).flatMap(k=>machineIds(g,k)).filter(id=>members.has(id));if(!targets.length)continue;
  const id='tem-machine-risk-'+slug+'-'+key,risk=ensure(p,id,{type:'Risk',name:'TEM · '+title,status:'unknown',context:source+' Review candidate only; not a confirmed machine incident. '+failure+' Actual asset assignment, occurrence, severity/probability, owner, due date and repair completion unconfirmed.'});
  const work=ensure(p,id+'-mitigation',{type:'Work Item',name:'TEM · '+title+' · mitigation',status:'planned',context:'Proposed control: '+control+' Owner and due date unassigned; completion requires actual reviewed evidence, not this note.'});
  for(const target of targets)link(p,risk.id,'potentially_affects',target,'Candidate applies to this named equipment reference/requirement, not proof of a faulty actual asset. '+failure,p.id);
  link(p,work.id,'mitigates',risk.id,control,p.id);p.workstreams[id]=['production'];p.workstreams[work.id]=['production'];
 }
 P.validate(p);return before!==JSON.stringify(p);
}
module.exports={applyShared,applyProject,rows};
if(require.main===module)(async()=>{
 const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
 const text=fs.readFileSync('/Users/louis/Downloads/TEM_Machine_Process_Mapping.md','utf8');
 for(const row of rows)if(!text.includes(row[1]))throw Error('Source document changed; review mapping before applying: '+row[1]);
 const s=require('./local-store').openStore(path.join(__dirname,'..','.local-data','ontology.sqlite'));
 try{
  const backup=path.join(__dirname,'..','.local-data','ontology-before-tem-machine-mapping-'+Date.now()+'.sqlite');await s.backup(backup);
  let w=s.load();if(applyShared(w.library))s.save(w,'library',w.revision);
  for(const name of ['LS','MOBIS + HELLA']){w=s.load();const p=w.projects.find(p=>p.name===name&&p.status==='active');if(!p)throw Error('Active project missing: '+name);const before=JSON.stringify(p);applyProject(p,w.library);if(name==='LS')require('./update-smt-return-press-risk').applyProject(p,w.library);if(before!==JSON.stringify(p))s.save(w,p.id,w.revision);}
  w=s.load();console.log(JSON.stringify({backup,revision:w.revision,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),mappingRows:rows.length,projects:w.projects.filter(p=>p.status==='active'&&['LS','MOBIS + HELLA'].includes(p.name)).map(p=>({name:p.name,equipmentCandidates:p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('tem-machine-risk-')).length}))}));
 }finally{s.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
