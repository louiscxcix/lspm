'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const P=require('./projects'),M=require('./ontology-model'),{openStore}=require('./local-store');
const types=()=>{a(fs.existsSync(path.join(__dirname,'project-types.js')),'ProjectTypes helper must exist');return require('./project-types');};
const migration=()=>{a(fs.existsSync(path.join(__dirname,'update-project-types.js')),'Project types migration must exist');return require('./update-project-types');};
const PART='ls-part-t1-2-uplevel',STEPS=['ict','bending','connector','eol','visual','packing'].map(s=>'ls-step-t1-2-uplevel-'+s);
function fixture(){
 const library={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]};
 const add=(id,input)=>{const e=M.addEntity(library,input);e.id=id;return e;};
 const link=(from,type,to,scopeProjectId=null)=>M.addRelation(library,{from,type,to,scopeProjectId,evidence:'Existing reference; applicability unconfirmed.'});
 add(PART,{type:'Part',name:'T1-2 Uplevel',productionFamily:'LDM'});
 add('base',{type:'Part',name:'T1-2 Base',productionFamily:'LDM'});
 add('ldm',{type:'Resource',name:'LDM',resourceKind:'line'});
 add('ls-org-lg-innotek-mexico',{type:'Organization',name:'LG Innotek Mexico'});
 STEPS.forEach((id,i)=>{add(id,{type:'Production Step',name:id,productionStage:['ICT','Pressing','Connector fastening','EOL','Visual inspection','Packing'][i],processLevel:'main'});link(id,'applies_to',PART);link(id,'operated_in','ldm');if(i)link(STEPS[i-1],'precedes',id);});
 for(const [step,id]of [[STEPS[0],'ict-machine'],[STEPS[3],'eol-machine'],...Array.from({length:5},(_,i)=>[STEPS[1],'t1-2-uplevel-press-'+(i+1)])]){add(id,{type:'Resource',name:id,resourceKind:'machine'});link(step,'requires',id);}
 add('ng',{type:'Production Step',name:'NG storage',productionStage:'NG storage',processLevel:'sub',branchKind:'exception'});link('ng','applies_to',PART);link(STEPS[3],'on_failure','ng');
 add('other-step',{type:'Production Step',name:'Other route'});link('other-step','applies_to','base');
 add('starpro',{type:'Organization',name:'Starpro'});add('external-pcb',{type:'Part',name:'Starpro PCB',itemKind:'component'});link('starpro','supplies','external-pcb');
 add('leader',{type:'Person',name:'Existing LDM leader'});add('team',{type:'Organization',name:'LDM · Leader team'});link('leader','works_on','ldm');link('leader','member_of','team');link('ldm','escalates_to','team');
 add('other-person',{type:'Person',name:'Unrelated SMT person'});
 for(const id of ['people-sample-role-leader','people-sample-check-materials','people-sample-check-ldm','people-sample-check-tem','people-sample-check-closure'])add(id,{type:'Requirement',name:id,status:'unknown',applicability:'pending_review'});
 add('quality-ls-part-'+PART,{type:'Requirement',name:'T1-2 quality policy',qualityKind:'policy'});link('quality-ls-part-'+PART,'applies_to',PART,'ls');
 add('quality-defect-lot-missing',{type:'Requirement',name:'LOT missing',qualityKind:'defect'});link('quality-ls-part-'+PART,'quality_reference','quality-defect-lot-missing','ls');
 add('ls-risk',{type:'Risk',name:'Existing LS risk'});link('ls-risk','potentially_affects','t1-2-uplevel-press-3','ls');link('quality-ls-part-'+PART,'quality_reference','ls-risk','ls');
 add('old-event',{type:'Event',name:'Existing History'});link('old-event','records_on',PART);
 const ls={...P.create('LS'),id:'ls'};P.attachMembers(ls,library,library.entities.map(e=>e.id));ls.relations=library.relations.map(r=>({...r,projectId:'ls'}));
 return {version:2,revision:0,library,projects:[ls,P.create('MOBIS + HELLA'),P.create('SMT'),P.create('Unclassified')],viewSettings:{}};
}
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-project-types-'));return {dir,file:path.join(dir,'db.sqlite'),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}
function databaseSnapshot(file){const db=new DatabaseSync(file,{readOnly:true});try{const schema=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();return {schema,rows:schema.map(({name})=>db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all())};}finally{db.close();}}
function seed(s){let w=s.load(),f=fixture();w.projects=f.projects.map(p=>({...p,entities:[],relations:[]}));w=s.save(w,null,w.revision);w.library={...f.library,relations:f.library.relations.filter(r=>!r.scopeProjectId)};w=s.save(w,'library',w.revision);w.projects[0]=f.projects[0];return s.save(w,'ls',w.revision);}

test('canonical helper exports browser/CommonJS API and explicit types override exact legacy names',()=>{
 const T=types();a.deepEqual(T.TYPES.map(t=>t.id),['program','sample','npi','improvement','shared']);a(T.TYPES.every(t=>t.label));
 for(const [name,kind]of [['LS','program'],['MOBIS + HELLA','sample'],['SMT','sample'],['T1-2','sample'],['T1-2 Sample','sample'],['Knowledge 360','shared'],['Knowledge360','shared'],['Other','improvement'],['LS experiment','improvement']])a.equal(T.kind({name}),kind);
 a.equal(T.kind({name:'LS',projectType:'npi'}),'npi');a.equal(T.kind(null),'improvement');a.equal(T.validate(undefined),undefined);
 for(const {id}of T.TYPES)a.equal(T.validate(id),id);
 for(const value of ['',null,'SAMPLE',{},'other'])a.throws(()=>T.validate(value),/project type/i);
 const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'project-types.js'),'utf8'),sandbox);a.equal(sandbox.ProjectTypes.kind({name:'LS'}),'program');
});
test('create(name,type?) and import preserve optional legacy type and reject invalid enum',()=>{
 const p=P.create('Typed','sample');a.equal(p.projectType,'sample');a.equal(P.importProject(p).projectType,'sample');
 const legacy=P.create('Legacy');a(!Object.hasOwn(legacy,'projectType'));P.validate(legacy);
 for(const projectType of ['',null,'invalid']){a.throws(()=>P.create('Bad',projectType),/project type/i);a.throws(()=>P.validate({...legacy,projectType}),/project type/i);}
});
test('browser ProjectStore resolves ProjectTypes at runtime when helper loads later',()=>{
 const sandbox={OntologyModel:M,crypto:require('node:crypto')};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'projects.js'),'utf8'),sandbox);
 a.equal(sandbox.ProjectStore.create('Legacy').projectType,undefined);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'project-types.js'),'utf8'),sandbox);
 const p=sandbox.ProjectStore.create('Late helper','sample');a.equal(p.projectType,'sample');a.equal(sandbox.ProjectStore.validate(p).projectType,'sample');
 a.throws(()=>sandbox.ProjectStore.create('Bad','other'),/project type/i);
});
test('SQLite adds project_type to legacy schema, persists and reverts types, enforcing save scope and revision',()=>{
 const t=temp();let s;
 try{const db=new DatabaseSync(t.file);db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); INSERT INTO projects VALUES ('legacy','LS','active','2026-01-01','2026-01-01')");db.close();
  s=openStore(t.file);let w=s.load();a(!Object.hasOwn(w.projects[0],'projectType'));w.projects[0].projectType='program';w=s.save(w,'legacy',w.revision);a.equal(w.projects[0].projectType,'program');
  const inspect=new DatabaseSync(t.file,{readOnly:true});a.equal(inspect.prepare('SELECT project_type FROM projects').get().project_type,'program');inspect.close();
  w=s.revertChange(w.pendingChange.id,w.revision);a(!Object.hasOwn(w.projects[0],'projectType'));
  w.projects[0].projectType='sample';a.throws(()=>s.save(w,null,w.revision),/outside the save scope/);a.throws(()=>s.save(w,'library',w.revision),/outside the save scope/);a.throws(()=>s.save(w,'legacy',w.revision-1),/STALE_REVISION/);
  w.projects[0].projectType='bad';a.throws(()=>s.save(w,'legacy',w.revision),/project type/i);
  w=s.load();w.projects.push(P.create('New','npi'));w=s.save(w,null,w.revision);a.equal(w.projects.at(-1).projectType,'npi');s.close();s=openStore(t.file);a.equal(s.load().projects.at(-1).projectType,'npi');
 }finally{s?.close();t.cleanup();}
});
test('sample slice reuses exactly six normal steps and machines, scoped internal source, LDM people, safe references',()=>{
 const w=fixture(),g=structuredClone(w.library),ls=structuredClone(w.projects[0]);a.equal(migration().applyWorkspace(w),true);
 const p=w.projects.find(p=>p.name==='T1-2 Sample');a(p);a.equal(p.projectType,'sample');P.validate(p);
 a.deepEqual(p.entities.filter(e=>e.type==='Production Step').map(e=>e.id).sort(),[...STEPS].sort());
 a.deepEqual(p.entities.filter(e=>e.type==='Resource'&&e.resourceKind==='machine').map(e=>e.id).sort(),['ict-machine','eol-machine',...Array.from({length:5},(_,i)=>'t1-2-uplevel-press-'+(i+1))].sort());
 for(const id of ['leader','team','ldm','people-sample-role-leader','people-sample-check-materials','people-sample-check-ldm','quality-ls-part-'+PART,'quality-defect-lot-missing'])a(M.byId(p,id),id);
 for(const id of ['base','other-step','other-person','starpro','external-pcb','ng','old-event','ls-risk','people-sample-check-tem','people-sample-check-closure'])a(!M.byId(p,id),id);
 const pcb=p.entities.find(e=>e.itemKind==='component');a(pcb);a.match(pcb.context,/internal|internally/i);a.match(pcb.context,/line.*unconfirmed/i);
 a(p.relations.some(r=>r.type==='supplies'&&r.from==='ls-org-lg-innotek-mexico'&&r.to===pcb.id&&r.scopeProjectId===p.id));
 a(p.relations.some(r=>r.type==='consumes'&&r.to===pcb.id&&r.scopeProjectId===p.id));
 a(!p.relations.some(r=>['approved_by','assigned_to','produces'].includes(r.type)));
 const risk=p.entities.find(e=>e.type==='Risk'),action=p.entities.find(e=>e.type==='Work Item');a(risk);a(action);a.notEqual(risk.id,'ls-risk');a.equal(risk.status,'unknown');a.equal(action.status,'planned');a.equal(action.qualityKind,'action');
 for(const entity of [risk,action])a.deepEqual(p.relations.filter(r=>r.from===entity.id&&['potentially_affects','quality_reference'].includes(r.type)).map(r=>r.to).sort(),['t1-2-uplevel-press-3','t1-2-uplevel-press-4'].filter(()=>entity===risk));
 a(p.relations.some(r=>r.type==='mitigates'&&r.from===action.id&&r.to===risk.id&&r.scopeProjectId===p.id));
 a(!p.entities.some(e=>['Event','Evidence','Assignment','Gate','Build'].includes(e.type)));a(!p.changes?.length);
 a.deepEqual(w.library,g);a.deepEqual({...w.projects[0],projectType:undefined},{...ls,projectType:undefined});a.equal(w.projects[0].projectType,'program');
 a(!w.projects.some(p=>/knowledge/i.test(p.name)));const saved=JSON.stringify(w);a.equal(migration().applyWorkspace(w),false);a.equal(JSON.stringify(w),saved);
});
test('migration preserves explicit enums, manual sample edits, and refuses missing canonical route',()=>{
 const w=fixture();w.projects[0].projectType='npi';migration().applyWorkspace(w);a.equal(w.projects[0].projectType,'npi');
 const p=w.projects.find(p=>p.name==='T1-2 Sample');p.entities.find(e=>e.type==='Work Item').context+=' Manual reviewer note.';p.workstreams={};const before=JSON.stringify(w);a.equal(migration().applyWorkspace(w),false);a.equal(JSON.stringify(w),before);
 const broken=fixture();broken.library.relations=broken.library.relations.filter(r=>!(r.from===STEPS[0]&&r.type==='precedes'));a.throws(()=>migration().applyWorkspace(broken),/canonical|route/i);
});
test('migration resumes an empty legacy sample project without losing its identity or inferred type',()=>{
 const w=fixture(),empty=P.create('T1-2 Sample');w.projects.push(empty);migration().applyWorkspace(w);
 const p=w.projects.find(p=>p.id===empty.id);a.equal(p.projectType,'sample');a.equal(w.projects.filter(p=>p.name==='T1-2 Sample').length,1);a.equal(migration().applyWorkspace(w),false);
});
test('store rejects attaching an existing project-owned risk across projects',()=>{
 const s=openStore(':memory:');try{let w=seed(s);const target=w.projects[1];P.attachMembers(target,w.library,['ls-risk']);a.throws(()=>s.save(w,target.id,w.revision),/already belongs to another project/);}finally{s.close();}
});
test('local store exposes sample preparation factory methods with sheet/workspace CAS',()=>{
 const s=openStore(':memory:');try{
  a.equal(typeof s.samplePreparationList,'function');a.equal(typeof s.samplePreparationSave,'function');
  let w=s.load();w.projects.push(P.create('Trial','sample'));w=s.save(w,null,w.revision);const id=w.projects[0].id;
  M.addEntity(w.projects[0],{type:'Part',name:'Trial Part',itemKind:'product'});w=s.save(w,id,w.revision);const p=w.projects[0];
  const sheet=require('./sample-preparation').create(p,{partId:p.entities[0].id,runName:'Trial 1'});a.deepEqual(s.samplePreparationList(id),[]);
  const result=s.samplePreparationSave({projectId:id,revision:w.revision,sheet});a.equal(result.sheet.version,1);a.equal(result.workspace.revision,w.revision+1);a.equal(s.samplePreparationList(id).length,1);
  a.throws(()=>s.samplePreparationSave({projectId:id,revision:w.revision,sheet}),/STALE_REVISION/);a.equal(s.history.list({scope:id}).totalDistinct,0);
 }finally{s.close();}
});
test('CLI defaults to dry-run, backs up before schema/data writes, and repeat apply does not write',async()=>{
 const t=temp();try{let s=openStore(t.file);seed(s);s.close();const legacy=new DatabaseSync(t.file);legacy.exec('ALTER TABLE projects DROP COLUMN project_type');legacy.close();const before=fs.readFileSync(t.file),snapshot=databaseSnapshot(t.file);const m=migration();const preview=await m.migrate(t.file);a.equal(preview.dryRun,true);a.equal(preview.changed,true);a.deepEqual(fs.readFileSync(t.file),before);
  const result=await m.migrate(t.file,{apply:true});a.equal(result.changed,true);a(fs.existsSync(result.backup));a.deepEqual(databaseSnapshot(result.backup),snapshot);
  s=openStore(t.file);const w=s.load(),p=w.projects.find(p=>p.name==='T1-2 Sample');a(p);P.validate(p);a.equal(w.projects.find(p=>p.name==='LS').projectType,'program');
  for(const project of w.projects){a.equal(s.listProgress(project.id).rows.length,0);a.equal(s.listHourly(project.id).length,0);a.equal(s.history.list({scope:project.id}).totalDistinct,0);}s.close();
  const saved=fs.readFileSync(t.file),retry=await m.migrate(t.file,{apply:true});a.equal(retry.changed,false);a.equal(retry.revision,w.revision);a(!retry.backup);a.deepEqual(fs.readFileSync(t.file),saved);
 }finally{t.cleanup();}
});
