'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('./ontology-model'),P=require('./projects'),F=require('./workflow');
const O=require('./update-production-organization'),C=require('./update-contact-routes');

function fixture(){
 const p=P.create('Reporting test');p.workstreams={};O.apply(p);C.apply(p);
 const line=name=>p.entities.find(e=>e.type==='Resource'&&e.resourceKind==='line'&&e.name===name);
 for(const [id,name,parent] of [['tem-line-1','TEM · Line 1',null],['tem-line-2','TEM · Line 2',null],['tem-line-3','TEM · Line 3',null],['smt-line-1','SMT · Line 1','SMT'],['smt-line-2','SMT · Line 2','SMT']]){
  const e=M.addEntity(p,{type:'Resource',name,resourceKind:'line'});e.id=id;
  if(parent)M.addRelation(p,{from:id,type:'part_of',to:line(parent).id,scopeProjectId:null});
 }
 const starpro=M.addEntity(p,{type:'Resource',name:'Starpro SMT',resourceKind:'line'});starpro.id='tem-starpro-smt';
 return {p,line};
}
const migration=()=>require('./update-reporting-entry');

test('reporting interface exists independently of checklist or branding',()=>{
 assert.equal(typeof F.reportingContacts,'function');
});

test('all five areas offer equivalent Leader/Supervisor entries and named members before managers',()=>{
 const {p,line}=fixture();migration().apply(p);
 for(const [name,area] of Object.entries(O.areas)){
  const result=F.reportingContacts(p,line(name).id);
  assert.equal(result.status,'resolved');assert.equal(result.line.id,line(name).id);
  assert.equal(result.entryMode,'either');assert.equal(result.firstContacts.length,2);
  for(const role of ['Leader','Supervisor']){
   const contact=result.firstContacts.find(c=>c.group.name===name+' · '+role+' team');
   assert(contact);assert.equal(contact.priority,1);
   assert.deepEqual(contact.members.map(e=>e.name).sort(),area.groups.filter(g=>g[0]===role).flatMap(g=>g.slice(2)).sort());
  }
  assert.equal(result.laterManagers[0].name,area.manager);
  assert(!result.firstContacts.some(c=>c.members.some(e=>e.name===area.manager)));
 }
});

test('TEM and SMT sublines and explicit process context resolve their own parent; names never infer routes',()=>{
 const {p,line}=fixture();migration().apply(p);
 for(const [id,area] of [['tem-line-1','TEM'],['tem-line-2','TEM'],['tem-line-3','TEM'],['smt-line-1','SMT'],['smt-line-2','SMT']]){
  const step=M.addEntity(p,{type:'Production Step',name:'Misleading LDM name'});
  M.addRelation(p,{from:step.id,type:'operated_in',to:id});
  for(const selected of [id,step.id]){
   const result=F.reportingContacts(p,selected);assert.equal(result.line.id,line(area).id);
   assert(result.relations.some(r=>r.type==='part_of'&&r.from===id&&r.to===line(area).id));
  }
  const child=M.addEntity(p,{type:'Production Step',name:'Detail',processLevel:'sub',parentWorkId:step.id});
  assert.equal(F.reportingContacts(p,child.id).line.id,line(area).id);
 }
 const work=M.addEntity(p,{type:'Work Item',name:'Existing sample line requirement'});
 M.addRelation(p,{from:work.id,type:'requires',to:'tem-line-2'});
 assert.equal(F.reportingContacts(p,work.id).line.id,line('TEM').id);
 const misleading=M.addEntity(p,{type:'Resource',name:'TEM · Line 99',resourceKind:'line',site:'TEM'});
 const unknown=F.reportingContacts(p,misleading.id);
 assert.equal(unknown.firstContacts.length,0);
 assert.equal(F.reportingContacts(p,'tem-starpro-smt').firstContacts.length,0);
 assert.equal(F.reportingContacts(p,'missing').status,'unknown');
 const unlinked=M.addEntity(p,{type:'Production Step',name:'LDM process'});
 const connected=M.addEntity(p,{type:'Production Step',name:'Known TEM process'});
 M.addRelation(p,{from:connected.id,type:'operated_in',to:line('TEM').id});
 M.addRelation(p,{from:unlinked.id,type:'precedes',to:connected.id});
 assert.equal(F.reportingContacts(p,unlinked.id).status,'unknown');
});

test('scope, ambiguity, archived records and relation order cannot select unrelated contacts',()=>{
 const {p,line}=fixture();migration().apply(p);
 const step=M.addEntity(p,{type:'Production Step',name:'Scoped process'});
 M.addRelation(p,{from:step.id,type:'operated_in',to:line('TEM').id,scopeProjectId:p.id});
 M.addRelation(p,{from:step.id,type:'operated_in',to:line('LDM').id,scopeProjectId:'other-project'});
 const baseline=F.reportingContacts(p,step.id);
 assert.equal(baseline.line.id,line('TEM').id);
 const reordered={...p,entities:p.entities.slice().reverse(),relations:p.relations.slice().reverse()};
 assert.deepEqual(F.reportingContacts(reordered,step.id),baseline);
 M.addRelation(p,{from:step.id,type:'operated_in',to:line('SMT').id,scopeProjectId:p.id});
 assert.equal(F.reportingContacts(p,step.id).status,'ambiguous');
 assert.deepEqual(F.reportingContacts(p,step.id).firstContacts,[]);
 const foreign={...p,id:'other-project',entities:p.entities.filter(e=>e.id!==line('LDM').id)};
 assert.deepEqual(F.reportingContacts(foreign,step.id).firstContacts,[]);
 const group=baseline.firstContacts[0].group;M.byId(p,group.id).status='archived';
 assert(!F.reportingContacts(p,line('TEM').id).firstContacts.some(c=>c.group.id===group.id));
 const cycle=structuredClone(p);cycle.relations.push({id:'cycle',from:line('TEM').id,type:'part_of',to:'tem-line-1'});
 assert.equal(F.reportingContacts(cycle,'tem-line-1').status,'unknown');
});

test('migration is additive, idempotent, validates, and preserves entities, chronology and unrelated data',()=>{
 const {p}=fixture(),before=structuredClone(p);
 assert.equal(migration().apply(p),true);P.validate(p);
 assert.deepEqual(p.entities,before.entities);assert.deepEqual(p.workstreams,before.workstreams);
 assert.deepEqual(p.relations.slice(0,before.relations.length),before.relations);
 assert(p.relations.slice(before.relations.length).every(r=>['escalates_to','part_of'].includes(r.type)&&r.evidence.includes('reporting-entry-v1')));
 assert(!p.relations.some(r=>r.type==='assignment_scope'));
 const once=JSON.stringify(p);assert.equal(migration().apply(p),false);assert.equal(JSON.stringify(p),once);
 assert.equal(migration().apply({...p,status:'archived'}),false);
});

test('workspace migration attaches only applicable contacts, preserving project overrides and archived scopes',()=>{
 const {p}=fixture(),library={...structuredClone(p),id:'library',name:'Global Library'};
 for(const e of library.entities)e.projectId='library';for(const r of library.relations)r.projectId='library';
 const isolated=P.create('TEM only'),unrelated=P.create('Unrelated'),archived=P.create('Archived');
 P.attachMembers(isolated,library,['tem-line-2']);isolated.workstreams={'tem-line-2':['engineering']};
 const archivedBefore=structuredClone({...archived,status:'archived'});archived.status='archived';
 const w={version:2,revision:7,library,projects:[isolated,unrelated,archived],viewSettings:{keep:{overview:{test:true}}}};
 const untouched=structuredClone({unrelated,archived:archivedBefore,viewSettings:w.viewSettings});
 assert.equal(migration().applyWorkspace(w),true);P.validateWorkspace(w);
 const result=F.reportingContacts(isolated,'tem-line-2');assert.equal(result.line.name,'TEM');
 assert.equal(result.firstContacts.length,2);assert(result.firstContacts.every(c=>c.members.length));
 assert(!isolated.entities.some(e=>e.resourceKind==='line'&&e.name!=='TEM'&&e.id!=='tem-line-2'));
 assert(!isolated.entities.some(e=>e.type==='Organization'&&e.name.startsWith('LDM')));
 assert.deepEqual(isolated.workstreams['tem-line-2'],['engineering']);
 assert.deepEqual({unrelated,archived,viewSettings:w.viewSettings},untouched);
 assert.equal(w.revision,7);const once=JSON.stringify(w);assert.equal(migration().applyWorkspace(w),false);assert.equal(JSON.stringify(w),once);
});

test('network exposes both entries, parent context and selection links without shifting process layout',()=>{
 const {p,line}=fixture();
 const part=M.addEntity(p,{type:'Part',name:'TEM sample',itemKind:'product',productionFamily:'TEM'});
 const a=M.addEntity(p,{type:'Production Step',name:'First'}),b=M.addEntity(p,{type:'Production Step',name:'Second'});
 for(const step of [a,b]){M.addRelation(p,{from:step.id,type:'applies_to',to:part.id});M.addRelation(p,{from:step.id,type:'operated_in',to:'tem-line-1'});}
 M.addRelation(p,{from:a.id,type:'precedes',to:b.id});
 const options={partIds:[part.id],showLineReferences:false},plain=F.productionContextLayout(p,F.productionNetwork(p,options));
 migration().apply(p);
 const network=F.productionNetwork(p,{...options,showStakeholders:true}),layout=F.productionContextLayout(p,network),contacts=F.reportingContacts(p,a.id);
 for(const id of [a.id,b.id])assert.deepEqual(layout.positions[id],plain.positions[id]);
 for(const id of ['tem-line-1',line('TEM').id,...contacts.firstContacts.map(c=>c.group.id)]){
  assert(network.nodes.some(n=>n.id===id));assert(layout.positions[id].x>plain.width);
  assert(F.belongsToPart(network.nodes.find(n=>n.id===id),part.id));
 }
 for(const contact of contacts.firstContacts){
  assert(network.edges.some(e=>e.from===line('TEM').id&&e.to===contact.group.id&&e.type==='escalates_to'&&F.belongsToPart(e,part.id)));
  assert(F.selectionNeighborhood(p,[line('TEM').id]).has(contact.group.id));
  assert(F.selectionNeighborhood(p,[contact.group.id]).has(contact.members[0].id));
 }
 assert.equal(layout.positions[contacts.firstContacts[0].group.id].y,layout.positions[contacts.firstContacts[1].group.id].y);
 assert(network.edges.some(e=>e.from==='tem-line-1'&&e.to===line('TEM').id&&e.type==='part_of'));
 assert(!network.nodes.some(n=>n.id===line('LDM').id||n.id==='tem-line-2'));
 assert.deepEqual(F.productionContextLayout(p,F.productionNetwork(p,options)),plain);
 const subline=F.productionNetwork(p,{line:'TEM · Line 1',showStakeholders:true});
 assert(subline.nodes.some(n=>n.id===line('TEM').id));
});

test('inherited contact context never inserts a hidden parent process into a filtered route',()=>{
 const {p,line}=fixture();migration().apply(p);
 const part=M.addEntity(p,{type:'Part',name:'Selected',itemKind:'product',productionFamily:'TEM'});
 M.addEntity(p,{type:'Part',name:'Other',itemKind:'product',productionFamily:'TEM'});
 const parent=M.addEntity(p,{type:'Production Step',name:'Hidden parent'});
 const child=M.addEntity(p,{type:'Production Step',name:'Visible detail',processLevel:'sub',parentWorkId:parent.id});
 M.addRelation(p,{from:child.id,type:'applies_to',to:part.id});M.addRelation(p,{from:parent.id,type:'operated_in',to:line('TEM').id});
 const options={partIds:[part.id],showLineReferences:false},plain=F.productionNetwork(p,options),shown=F.productionNetwork(p,{...options,showStakeholders:true});
 assert(!plain.nodes.some(n=>n.id===parent.id));assert(!shown.nodes.some(n=>n.id===parent.id));
 assert(shown.nodes.some(n=>n.id===line('TEM').id));
 assert.deepEqual(F.productionContextLayout(p,shown).positions[child.id],F.productionContextLayout(p,plain).positions[child.id]);
});

test('cross-Part contact inheritance preserves every visible production node route membership',()=>{
 const {p,line}=fixture();migration().apply(p);
 const a=M.addEntity(p,{type:'Part',name:'Child Part A',itemKind:'product',productionFamily:'TEM'});
 const b=M.addEntity(p,{type:'Part',name:'Parent Part B',itemKind:'product',productionFamily:'TEM'});
 const parent=M.addEntity(p,{type:'Production Step',name:'Parent in B'});
 const child=M.addEntity(p,{type:'Production Step',name:'Child in A',processLevel:'sub',parentWorkId:parent.id});
 M.addRelation(p,{from:parent.id,type:'applies_to',to:b.id});M.addRelation(p,{from:child.id,type:'applies_to',to:a.id});
 M.addRelation(p,{from:parent.id,type:'operated_in',to:line('TEM').id});
 const options={partIds:[a.id,b.id],showLineReferences:false};
 const plain=F.productionNetwork(p,options),shown=F.productionNetwork(p,{...options,showStakeholders:true});
 const processMemberships=graph=>graph.nodes.filter(n=>n.entity.type==='Production Step').map(n=>({id:n.id,partIds:n.partIds.slice().sort()})).sort((x,y)=>x.id.localeCompare(y.id));
 assert(!F.belongsToPart(plain.nodes.find(n=>n.id===parent.id),a.id));
 assert.deepEqual(processMemberships(shown),processMemberships(plain));
 assert(!F.belongsToPart(shown.nodes.find(n=>n.id===parent.id),a.id));
 for(const c of F.reportingContacts(p,child.id).firstContacts){
  const node=shown.nodes.find(n=>n.id===c.group.id);assert(F.belongsToPart(node,a.id));assert(F.belongsToPart(node,b.id));
 }
});

test('contacts remain visible when groups have no recorded manager or works_on links',()=>{
 const {p,line}=fixture();migration().apply(p);
 p.relations=p.relations.filter(r=>!['manages','works_on'].includes(r.type));
 const graph=F.productionNetwork(p,{line:'Nexlide',showStakeholders:true});
 for(const c of F.reportingContacts(p,line('Nexlide').id).firstContacts)assert(graph.nodes.some(n=>n.id===c.group.id));
});

test('shared area contacts retain separate subline and process highlights across repeated projections',()=>{
 const {p,line}=fixture();migration().apply(p);const routes=[];
 for(const n of [1,2]){
  const part=M.addEntity(p,{type:'Part',name:'Sample '+n,itemKind:'product',productionFamily:'TEM'});
  const step=M.addEntity(p,{type:'Production Step',name:'Process '+n});
  M.addRelation(p,{from:step.id,type:'applies_to',to:part.id});M.addRelation(p,{from:step.id,type:'operated_in',to:'tem-line-'+n});
  routes.push({part,step,lineId:'tem-line-'+n});
 }
 const options={partIds:routes.map(r=>r.part.id),showLineReferences:false,showStakeholders:true};
 const graph=F.productionNetwork(p,options);assert.deepEqual(F.productionNetwork(p,options),graph);
 for(const route of routes)for(const other of routes){
  for(const id of [route.step.id,route.lineId])assert.equal(F.belongsToPart(graph.nodes.find(n=>n.id===id),other.part.id),route===other);
  for(const c of F.reportingContacts(p,line('TEM').id).firstContacts)assert(F.belongsToPart(graph.nodes.find(n=>n.id===c.group.id),other.part.id));
 }
 const leader=F.reportingContacts(p,line('TEM').id).firstContacts.find(c=>c.group.name.includes('Leader'));
 M.byId(p,leader.members[0].id).status='archived';
 assert(!F.productionNetwork(p,options).nodes.some(n=>n.id===leader.members[0].id),'No contact cache survives a render');
});

test('normal audited saves persist additions in a disposable database without rewriting prior rows',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reporting-entry-')),store=require('./local-store').openStore(path.join(dir,'test.sqlite'));
 try{
  const {p}=fixture();let w=store.load();w.projects.push(p);w=store.save(w,null,w.revision);w.projects[0]=p;w=store.save(w,p.id,w.revision);
  const before=store.exportAll(),revision=w.revision;
  const candidate=structuredClone(w);assert.equal(candidate.version,undefined);
  assert.equal(migration().applyWorkspace(candidate),true);assert.equal(candidate.version,undefined);
  assert.equal(migration().applyWorkspace(candidate),false);assert.equal(candidate.revision,revision);
  assert(migration().apply(w.library));store.save(w,'library',w.revision);
  w=store.load();assert.equal(migration().apply(w.library),false);
  if(migration().applyProject(w.projects[0],w.library))store.save(w,p.id,w.revision);
  const after=store.exportAll(),saved=store.load();assert.equal(saved.revision,revision+1);
  assert.equal(F.reportingContacts(saved.projects[0],'tem-line-1').firstContacts.length,2);
  for(const key of ['entities','memberships','assessments','projectSchedules','workstreams','viewSettings','hourlyRecords','changes','sources','ingestionJobs','wipSnapshots','wipCounts','staffingCounts','productionStaffingCounts'])assert.deepEqual(after[key],before[key],key);
  for(const r of before.relations)assert.deepEqual(after.relations.find(next=>next.id===r.id),r);
  const audit=store.listChanges('library').changes[0];assert(audit.items.every(i=>i.action==='Added'&&i.label.startsWith('Connection')));
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('CLI requires explicit exports, never overwrites input/output and has no default database access',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reporting-entry-cli-'));
 try{
  const {p}=fixture(),library={...structuredClone(p),id:'library'};
  for(const e of library.entities)e.projectId='library';for(const r of library.relations)r.projectId='library';
  const input=path.join(dir,'input.json'),output=path.join(dir,'output.json'),text=JSON.stringify({version:2,library,projects:[p]});fs.writeFileSync(input,text);
  const run=args=>spawnSync(process.execPath,[path.join(__dirname,'update-reporting-entry.js'),...args],{cwd:dir,encoding:'utf8'});
  assert.equal(run([]).status,1);assert.deepEqual(fs.readdirSync(dir),['input.json']);
  assert.equal(run(['--input',input,'--output',input]).status,1);
  const args=['--input',input,'--output',output],result=run(args);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).changed,true);assert.equal(fs.readFileSync(input,'utf8'),text);
  const written=fs.readFileSync(output,'utf8');assert.equal(run(args).status,1);assert.equal(fs.readFileSync(output,'utf8'),written);
  assert.equal(migration().applyWorkspace(JSON.parse(written)),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
