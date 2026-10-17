'use strict';
const M=require('./ontology-model'),P=require('./projects'),T=require('./project-types');
const PART='ls-part-t1-2-uplevel',SAMPLE_ID='project-t1-2-sample',SAMPLE_NAME='T1-2 Sample';
const STEPS=['ict','bending','connector','eol','visual','packing'].map(key=>'ls-step-t1-2-uplevel-'+key);
const PRESSES=Array.from({length:5},(_,i)=>'t1-2-uplevel-press-'+(i+1));
const PCB='t1-2-sample-internal-pcb',RISK='t1-2-sample-press-cleanliness';
const SOURCE='User-approved T1-2 sample scope, 2026-10-14. Reference preparation only; no run, quantity, readiness verification or approval recorded.';
function add(g,id,input){const e=M.addEntity(g,input);e.id=id;return e;}
function link(p,from,type,to,evidence){
 if(p.relations.some(r=>r.from===from&&r.type===type&&r.to===to&&r.scopeProjectId===p.id))return;
 const r=M.addRelation(p,{from,type,to,evidence,scopeProjectId:p.id});r.id='t1-2-sample-link-'+require('node:crypto').createHash('sha256').update(JSON.stringify([p.id,from,type,to])).digest('hex').slice(0,24);
}
function prepareSample(w){
 const matches=w.projects.filter(p=>p.name===SAMPLE_NAME||p.id===SAMPLE_ID);
 if(matches.length>1)throw Error('Multiple T1-2 Sample identities; review before migration.');
 const old=matches[0];
 if(old&&(old.name!==SAMPLE_NAME||old.status!=='active'))throw Error('T1-2 Sample identity is unavailable or archived.');
 // The project graph saves atomically; an existing marker preserves subsequent manual edits.
 if(old?.entities.some(e=>e.id===RISK))return null;
 if(old&&(old.entities.length||old.relations.length))throw Error('Existing T1-2 Sample has manual content; review before seeding.');
 const p=old?structuredClone(old):{...P.create(SAMPLE_NAME,'sample'),id:SAMPLE_ID};
 if(p.projectType===undefined)p.projectType=T.kind(p);
 const g=w.library,byId=new Map(g.entities.map(e=>[e.id,e])),shared=g.relations.filter(r=>!r.scopeProjectId);
 function requireObject(id,type){const e=byId.get(id);if(!e||e.type!==type||e.status==='archived')throw Error('Canonical T1-2 object missing or changed: '+id);return e;}
 requireObject(PART,'Part');requireObject('ls-org-lg-innotek-mexico','Organization');
 for(const [i,id]of STEPS.entries()){
  const step=requireObject(id,'Production Step');
  if(step.processLevel==='sub'||step.branchKind&&step.branchKind!=='normal'||!shared.some(r=>r.from===id&&r.type==='applies_to'&&r.to===PART))throw Error('Canonical T1-2 normal route changed: '+id);
  if(i&&!shared.some(r=>r.from===STEPS[i-1]&&r.type==='precedes'&&r.to===id))throw Error('Canonical T1-2 route sequence missing: '+id);
 }
 for(const id of PRESSES){
  if(requireObject(id,'Resource').resourceKind!=='machine'||!shared.some(r=>r.from===STEPS[1]&&r.type==='requires'&&r.to===id))throw Error('Canonical Pressing machine missing: '+id);
 }
 const pressMachines=shared.filter(r=>r.from===STEPS[1]&&r.type==='requires'&&byId.get(r.to)?.resourceKind==='machine');
 if(pressMachines.length!==5)throw Error('Canonical Pressing machine allocation changed; expected five machines.');
 const selected=new Set([PART,...STEPS,'ls-org-lg-innotek-mexico']);
 const lines=new Set();
 for(const r of shared)if(STEPS.includes(r.from)&&['requires','operated_in'].includes(r.type)&&byId.get(r.to)?.type==='Resource'){
  selected.add(r.to);if(r.type==='operated_in'&&byId.get(r.to).name==='LDM')lines.add(r.to);
 }
 // Reuse confirmed line contacts and their teams, without assigning them to this sample run.
 for(const r of shared)if(lines.has(r.to)&&['works_on','manages','supports_line'].includes(r.type)&&['Person','Organization'].includes(byId.get(r.from)?.type))selected.add(r.from);
 for(const r of shared)if(r.type==='member_of'&&selected.has(r.from)&&byId.get(r.to)?.type==='Organization')selected.add(r.to);
 let expanded=true;
 while(expanded){expanded=false;for(const r of shared)if(r.type==='escalates_to'&&selected.has(r.from)&&['Person','Organization'].includes(byId.get(r.to)?.type)&&!selected.has(r.to)){selected.add(r.to);expanded=true;}}
 const references=['product','traceability','materials','machine','quality','people','start','ldm'].map(key=>'people-sample-check-'+key)
  .concat(['operator','technician','leader','supervisor'].map(key=>'people-sample-role-'+key));
 for(const id of references)if(byId.get(id)?.type==='Requirement')selected.add(id);
 const policy=byId.get('quality-ls-part-'+PART);
 const applicablePolicy=policy?.qualityKind==='policy'&&g.relations.some(r=>r.from===policy.id&&r.type==='applies_to'&&r.to===PART);
 const definitions=applicablePolicy?g.relations.filter(r=>r.from===policy.id&&r.type==='quality_reference'&&byId.get(r.to)?.type==='Requirement'&&byId.get(r.to)?.qualityKind==='defect').map(r=>r.to):[];
 if(applicablePolicy){selected.add(policy.id);for(const id of definitions)selected.add(id);}
 P.attachMembers(p,g,[...selected]);
 const safeTypes=new Set(['applies_to','requires','precedes','operated_in','part_of','works_on','manages','supports_line','member_of','reports_to','reports_via','escalates_to','quality_reference']);
 for(const r of shared)if(selected.has(r.from)&&selected.has(r.to)&&safeTypes.has(r.type))p.relations.push({...r,projectId:p.id});
 add(p,PCB,{type:'Part',name:'T1-2 Uplevel · internally produced PCB',itemKind:'component',productionFamily:'LDM',status:'unknown',context:SOURCE+' LGIT internally produced PCB/component source. Exact producing SMT line, asset, PCB code/revision, LOT and availability remain unconfirmed.'});
 link(p,'ls-org-lg-innotek-mexico','supplies',PCB,'LGIT internal production for this sample only. Exact producing SMT line is unconfirmed; this reference does not record supply or receipt.');
 link(p,PCB,'part_of',PART,'Sample-scoped component reference; exact PCB code/revision and BOM applicability require confirmation.');
 link(p,STEPS[0],'consumes',PCB,'Sample input reference at the existing ICT entry; no material quantity, consumption or current stock asserted.');
 add(p,RISK,{type:'Risk',name:'T1-2 Sample · Pressing 3/4 cleanliness',status:'unknown',context:SOURCE+' Inadequate cleaning on Pressing 3 and 4 can cause defects. Likelihood, severity, current condition, owner and due date remain unconfirmed.'});
 add(p,RISK+'-mitigation',{type:'Work Item',name:'T1-2 Sample · verify Pressing 3/4 cleaning',qualityKind:'action',status:'planned',context:'Confirm the approved cleaning procedure and cleanliness acceptance for Pressing 3 and 4; record per-machine evidence before use. Hold suspect material for quality review. Proposed action; no execution, owner, deadline, cleaning interval or approval inferred.'});
 link(p,RISK+'-mitigation','mitigates',RISK,'Proposed verification for Pressing 3 and 4 only; no completed cleaning or release recorded.');
 for(const id of PRESSES.slice(2,4))link(p,RISK,'potentially_affects',id,'Confirmed cleanliness risk scope: Pressing 3 and 4 only.');
 for(const id of ['people-sample-check-quality','people-sample-check-machine'])if(selected.has(id))link(p,id,'quality_reference',RISK,'Reference checks only; evidence and model applicability remain unconfirmed.');
 if(applicablePolicy){
  link(p,policy.id,'applies_to',PART,'Existing Part quality policy as sample reference; no LS-owned response actions, cases or approvals attached.');
  for(const id of definitions)link(p,policy.id,'quality_reference',id,'Existing defect definition only; no actual sample defect or disposition recorded.');
  link(p,policy.id,'quality_reference',RISK,'New sample-owned risk; existing LS risk identity and state remain unchanged.');
 }
 p.workstreams=Object.fromEntries(p.entities.map(e=>[e.id,['Requirement','Risk','Work Item'].includes(e.type)?['production','quality']:['production']]));
 P.validate(p);return p;
}
function applyWorkspace(w){
 for(const p of w.projects)T.validate(p.projectType);
 const sample=prepareSample(w);let changed=false;
 for(const p of w.projects)if(p.projectType===undefined){p.projectType=T.kind(p);changed=true;}
 if(sample){const i=w.projects.findIndex(p=>p.id===sample.id);if(i<0)w.projects.push(sample);else w.projects[i]=sample;changed=true;}
 const target=sample||w.projects.find(p=>p.id===SAMPLE_ID||p.name===SAMPLE_NAME),overview=w.viewSettings?.[target.id]?.overview;
 if(!Object.hasOwn(overview||{},'historyScope')){
  w.viewSettings||={};w.viewSettings[target.id]||={};w.viewSettings[target.id].overview={...overview,historyScope:'explicit_projects'};changed=true;
 }
 return changed;
}
async function migrate(file,{apply=false}={}){
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync,backup}=require('node:sqlite');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-project-types-preview-'));
 let source,preview,store;
 try{
  // Opening the real store runs additive DDL, so preflight uses a disposable SQLite snapshot.
  source=new DatabaseSync(file,{readOnly:true});
  const previewFile=path.join(dir,'preview.sqlite');await backup(source,previewFile);
  preview=require('./local-store').openStore(previewFile);const initial=preview.load(),candidate=structuredClone(initial);
  const changed=applyWorkspace(candidate),summary={changed,dryRun:!apply,revision:initial.revision,projects:candidate.projects.map(p=>({id:p.id,name:p.name,projectType:p.projectType}))};
  preview.close();preview=null;
  if(!changed||!apply)return summary;
  const backupFile=path.join(path.dirname(file),'ontology-before-project-types-'+Date.now()+'.sqlite');
  await backup(source,backupFile);source.close();source=null;
  store=require('./local-store').openStore(file);let w=store.load();if(w.revision!==initial.revision)throw Error('STALE_REVISION');
  for(const desired of candidate.projects){
   let existing=w.projects.find(p=>p.id===desired.id);
   if(!existing){w.projects.push({...desired,entities:[],relations:[],workstreams:{}});w=store.save(w,null,w.revision);existing=w.projects.find(p=>p.id===desired.id);}
   if(existing.projectType!==desired.projectType||JSON.stringify(existing.entities)!==JSON.stringify(desired.entities)||JSON.stringify(existing.relations)!==JSON.stringify(desired.relations)){
    w.projects[w.projects.findIndex(p=>p.id===desired.id)]=desired;w=store.save(w,desired.id,w.revision);
   }
   if(candidate.viewSettings?.[desired.id]?.overview?.historyScope==='explicit_projects'&&!Object.hasOwn(w.viewSettings?.[desired.id]?.overview||{},'historyScope')){
    store.history.transaction(w.revision,'Sample History scope',()=>{store.putSettings(desired.id,'overview',{...w.viewSettings?.[desired.id]?.overview,historyScope:'explicit_projects'});},desired.id);w=store.load();
   }
  }
  return {...summary,revision:w.revision,backup:backupFile};
 }finally{preview?.close();store?.close();source?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={applyWorkspace,migrate,SAMPLE_ID,SAMPLE_NAME,PART,STEPS};
if(require.main===module){
 const args=process.argv.slice(2),apply=args.includes('--apply'),files=args.filter(arg=>!['--apply','--dry-run'].includes(arg));
 if(files.length>1||files.some(arg=>arg.startsWith('--'))||apply&&args.includes('--dry-run')){console.error('Usage: node update-project-types.js [database.sqlite] [--apply | --dry-run]');process.exitCode=1;}
 else migrate(files[0]||require('node:path').join(__dirname,'..','.local-data','ontology.sqlite'),{apply}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
