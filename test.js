const assert = require("node:assert/strict");
const fs = require("node:fs");
const Model = require("./ontology-model.js");

const laneProject={id:'lane-project',version:2,entities:[
  {id:'lane-work',type:'Work Item',name:'Approve material',status:'planned'},
  {id:'lane-part',type:'Part',name:'G65',status:'active'},
  {id:'lane-other',type:'Work Item',name:'Release production',status:'planned'},
  {id:'lane-unrelated',type:'Work Item',name:'Customer pricing',status:'planned'}
],relations:[
  {id:'lane-link-1',type:'applies_to',from:'lane-work',to:'lane-part'},
  {id:'lane-link-2',type:'precedes',from:'lane-work',to:'lane-other'}
],workstreams:{'lane-work':['purchasing'],'lane-other':['production'],'lane-unrelated':['commercial']}};
const laneGraph=require('./workflow.js').workstreamGraph(laneProject,'purchasing',{types:Model.ENTITY_TYPES});
assert.deepEqual(new Set(laneGraph.entities.map(e=>e.id)),new Set(['lane-work','lane-part','lane-other']));
assert.ok(laneGraph.boundary.has('lane-other'));
assert.equal(laneGraph.entities.some(e=>e.id==='lane-unrelated'),false);

const store = Model.newStore();
const p045Results = Model.search(store, "P045");
assert.ok(p045Results.some(entity => entity.id === "part-045b"));
assert.ok(p045Results.some(entity => entity.id === "wi-qc"));
assert.equal(Model.validateRelation(store, { from: "wi-qc", type: "precedes", to: "wi-ship" }), "This dependency would create a cycle.");

const part = Model.addEntity(store, { type: "Part Revision", name: "P046 Rev.A" });
assert.equal(part.type, "Part Revision");
Model.addRelation(store, { from: "wi-qc", type: "applies_to", to: part.id, evidence: "B02 scope" });
assert.equal(Model.relationsFor(store, part.id).length, 1);
assert.doesNotThrow(() => Model.validateStore(store));
assert.throws(() => Model.addRelation(store, { from: "jose", type: "precedes", to: "wi-qc" }), /does not support/);

console.log("ontology model checks passed");

const Projects = require("./projects.js");
const memberLibrary={id:'library',name:'Global Library',status:'active',version:2,entities:[
  {id:'part-select',type:'Part',name:'Modulo',status:'active',projectId:'library'},
  {id:'step-select',type:'Production Step',name:'Assembly',status:'active',projectId:'library'},
  {id:'machine-select',type:'Resource',name:'Assembly machine',status:'active',projectId:'library'}
],relations:[
  {id:'link-select-1',type:'applies_to',from:'step-select',to:'part-select',scopeProjectId:null,projectId:'library'},
  {id:'link-select-2',type:'requires',from:'step-select',to:'machine-select',scopeProjectId:null,projectId:'library'}
]};
const memberProject=Projects.create('Selection');
assert.deepEqual(Projects.membershipCandidates(memberLibrary,memberProject,['part-select'],true).sort(),['machine-select','part-select','step-select']);
Projects.attachMembers(memberProject,memberLibrary,['part-select','step-select','machine-select']);
assert.equal(memberProject.entities.length,3);
assert.equal(memberProject.entities[0].projectId,memberProject.id);
const records = new Map([[Projects.LEGACY, JSON.stringify(Model.newStore())]]);
const storage = {getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value)};
const legacy = records.get(Projects.LEGACY);
const workspace = Projects.load(storage);
const a = workspace.projects[0];
assert.ok(a.entities.every(e => e.type !== "Project" && e.projectId === a.id));
assert.ok(a.legacyProjectRecords.length);
assert.equal(records.get(Projects.LEGACY), legacy);
assert.deepEqual(Projects.load(storage), workspace);
const before = JSON.stringify(a);
const b = Projects.create("Second project");
assert.equal(b.entities.length, 0);
const person = Model.addEntity(b, {type: "Person", name: "Test owner"});
assert.equal(person.projectId, b.id);
assert.throws(() => Model.addEntity(b, {type: "Project", name: "Wrong"}));
assert.throws(() => Model.addRelation(b, {from: person.id, type: "owns", to: a.entities[0].id}));
assert.equal(JSON.stringify(a), before);
workspace.projects.push(b);
Projects.commit(storage, workspace);
assert.deepEqual(Projects.load(storage), workspace);
const imported = Projects.importProject(JSON.parse(JSON.stringify(a)));
assert.notEqual(imported.id, a.id);
assert.deepEqual(imported.entities.map(e => e.id), a.entities.map(e => e.id));
assert.equal(imported.relations.length, a.relations.length);
assert.ok(imported.relations.every(r => r.projectId === imported.id));
const invalid = structuredClone(b); invalid.entities[0].projectId = a.id;
assert.throws(() => Projects.validate(invalid), /Cross-project/);
invalid.entities[0].projectId = b.id; invalid.entities[0].type = "Unknown";
assert.throws(() => Projects.validate(invalid));
b.status = "archived"; Projects.commit(storage, workspace);
assert.equal(Projects.load(storage).projects[1].status, "archived");
assert.throws(() => Projects.commit({setItem() { throw Error("quota"); }}, workspace), /quota/);
records.set(Projects.KEY, "invalid JSON");
assert.throws(() => Projects.load(storage));
assert.equal(records.get(Projects.KEY), "invalid JSON");
console.log("project migration, isolation, persistence, import and recovery checks passed");

assert.equal(typeof Model.updateEntity, "function", "Phase 2 needs validated object editing");
const dated = Projects.create("Schedule checks");
const task = Model.addEntity(dated, {type: "Work Item", name: "QC", plannedStart: "2026-09-20", plannedEnd: "2026-09-22", phase: "Validation"});
assert.equal(task.plannedStart, "2026-09-20");
Model.updateEntity(dated, task.id, {forecastEnd: "2026-09-25"});
assert.equal(Model.byId(dated, task.id).plannedEnd, "2026-09-22");
assert.equal(dated.changes.length, 1);
Model.updateEntity(dated, task.id, {actualStart: ''});
assert.equal(Object.hasOwn(Model.byId(dated,task.id),'actualStart'),false,'Empty unknown fields should not create noisy changes');
assert.throws(() => Model.updateEntity(dated, task.id, {plannedEnd: "2026-02-30"}), /date/i);
assert.throws(() => Model.updateEntity(dated, task.id, {plannedEnd: "2026-09-19"}), /start/i);
assert.throws(() => Model.updateEntity(dated, task.id, {type: "Person"}), /type/i);
const Flow = require("./workflow.js");
assert.deepEqual(Flow.range(Model.byId(dated, task.id)), {start: "2026-09-25", end: "2026-09-25", basis: "forecast"});
assert.equal(Flow.range({type:"Event", occurredDate:"2026-09-16", due:"2026-10-01"}).basis, "actual event");
const csv = '\uFEFFid,type,name,context,plannedStart,plannedEnd\r\npart1,Part,"PCB, main","first\nsecond",,\r\nwork1,Work Item,"QC ""incoming""",,2026-09-20,2026-09-21';
const preview = Flow.previewCSV(dated, csv, "objects");
assert.equal(preview.errors.length, 0);
assert.equal(preview.rows.length, 2);
assert.equal(preview.project.entities.at(-2).name, "PCB, main");
assert.equal(dated.entities.length, 1, "preview must not mutate project");
assert.ok(Flow.previewCSV(preview.project, csv, "objects").errors.some(e => /duplicate/i.test(e)));
assert.ok(Flow.previewCSV(dated, 'id,type,name\nx,Person,A\nx,Person,B', "objects").errors.length);
assert.ok(Flow.previewCSV(dated, 'id,type,name\nx,Person,"unfinished', "objects").errors.length);
assert.ok(Flow.previewCSV(dated, 'id,type,name,due\nx,Work Item,Bad,2026-02-30', "objects").errors.length);
assert.ok(Flow.previewCSV(dated, 'id,type,name,garbage\nx,Person,A,xx', "objects").errors.length);
assert.ok(Flow.previewCSV(dated, 'id,type,from,to\nr,precedes,missing,work1', "relations").errors.length);
const graph = Projects.create("Graph");
graph.entities = [
  {id:"a",type:"Work Item",name:"A",status:"planned",due:"2026-09-01"},
  {id:"b",type:"Work Item",name:"B",status:"planned",due:"2026-09-22"},
  {id:"c",type:"Work Item",name:"C",status:"planned"},
  {id:"p",type:"Person",name:"Owner",status:"active"}
].map(e => ({...e,projectId:graph.id}));
Model.addRelation(graph, {from:"a",to:"b",type:"precedes",scopeProjectId:graph.id});
Model.addRelation(graph, {from:"b",to:"c",type:"precedes",scopeProjectId:graph.id});
const filtered = Flow.projectGraph(graph, {types:["Work Item"],start:"2026-09-20",end:"2026-09-30",keepPredecessors:true});
assert.deepEqual(filtered.entities.map(e=>e.id).sort(), ["a","b","c"]);
assert.ok(filtered.context.has("a"));
assert.deepEqual(Flow.projectGraph(graph,{types:["Person"]}).entities.map(e=>e.id), ["p"]);
assert.deepEqual([...Flow.downstream(graph,"a")].sort(),["a","b","c"]);
const positions = Flow.layout(graph.entities,graph.relations);
assert.ok(positions.positions.b.y > positions.positions.a.y);
assert.ok(positions.positions.c.y > positions.positions.b.y);
assert.ok(Flow.previewCSV(graph,'id,type,from,to\nr,precedes,c,a',"relations").errors.some(e=>/cycle/.test(e)));
assert.ok(Flow.previewCSV({...graph,status:"archived"},csv,"objects").errors.length);
const hundred = Array.from({length:100},(_,i)=>`part${i},Part,Part ${i}`).join('\n');
assert.equal(Flow.previewCSV(dated,'id,type,name\n'+hundred,"objects").rows.length,100);
const hundredLayout=Flow.layout(Flow.previewCSV(dated,'id,type,name\n'+hundred,"objects").project.entities,[]);
assert.ok(hundredLayout.width<=1100, '100 independent parts should wrap into rows, not one giant horizontal line');
console.log("Phase 2 scheduling, graph projection, CSV atomic preview and 100-part checks passed");

const stakeholder=Model.addEntity(graph,{type:'Person',name:'Quality manager',title:'Plant quality manager',power:'high',influence:'medium',currentEngagement:'neutral',desiredEngagement:'supportive',currentRole:'Reviewer',desiredRole:'Sponsor'});
assert.equal(stakeholder.title,'Plant quality manager');
assert.throws(()=>Model.updateEntity(graph,stakeholder.id,{power:'extreme'}),/power/i);
Model.addRelation(graph,{from:stakeholder.id,to:'p',type:'influences',evidence:'PM observation'});
assert.equal(Model.relationsFor(graph,stakeholder.id)[0].type,'influences');
const subprocess=Model.addEntity(graph,{type:'Work Item',name:'QC failed — arrange refund',processLevel:'sub',parentWorkId:'b',branchKind:'exception'});
assert.equal(subprocess.parentWorkId,'b');
assert.doesNotThrow(()=>Projects.validate(graph));
assert.throws(()=>Model.updateEntity(graph,subprocess.id,{parentWorkId:'missing'}),/parent/i);
assert.throws(()=>Model.updateEntity(graph,'b',{parentWorkId:subprocess.id,processLevel:'sub'}),/cycle/i);
Model.addRelation(graph,{from:'b',to:subprocess.id,type:'on_failure',evidence:'Only if inspection fails'});
Model.addRelation(graph,{from:subprocess.id,to:'b',type:'rework_of',evidence:'Separate retry'});
assert.ok(!Flow.downstream(graph,'b').has(subprocess.id),'Failure branches must not imply normal dependencies');
const mainOnly=Flow.projectGraph(graph,{showSubprocesses:false});
assert.ok(!mainOnly.entities.some(e=>e.id===subprocess.id));
const layered=Flow.projectGraph(graph,{});
assert.ok(layered.relations.some(r=>r.type==='subprocess'&&r.to===subprocess.id));
const subLayout=Flow.layout(layered.entities,layered.relations);
assert.ok(subLayout.positions[subprocess.id].x>subLayout.positions.b.x);
assert.ok(Flow.previewCSV(graph,'id,type,name,power,influence,title\nnewperson,Person,New manager,low,high,Buyer','objects').project);
console.log('Stakeholder profiles, influence direction, subprocess hierarchy and main-only projection checks passed');
const roundtrip=Projects.importProject(JSON.parse(JSON.stringify(graph)));
assert.equal(Model.byId(roundtrip,stakeholder.id).title,'Plant quality manager');
assert.equal(Model.byId(roundtrip,subprocess.id).parentWorkId,'b');
assert.ok(roundtrip.relations.some(r=>r.type==='influences'));
assert.doesNotThrow(()=>Projects.validate(roundtrip));
const resourceForInvalidInfluence=Model.addEntity(graph,{type:'Resource',name:'Test bench'});
assert.throws(()=>Model.addRelation(graph,{from:stakeholder.id,to:resourceForInvalidInfluence.id,type:'influences'}),/does not support/);
console.log('Extended ontology export/import compatibility checks passed');

const CloudWorkspace = require('./cloud-workspace.js');
const remoteProject = Projects.create('Cloud workspace');
const localProject = Projects.create('Local workspace');
assert.deepEqual(
  CloudWorkspace.initialWorkspace([{id: remoteProject.id, ...remoteProject}], {version:2, projects:[localProject]}),
  {source:'cloud', workspace:{version:2, projects:[remoteProject]}}
);
assert.deepEqual(
  CloudWorkspace.initialWorkspace([], {version:2, projects:[localProject]}),
  {source:'migration', workspace:{version:2, projects:[localProject]}}
);
assert.deepEqual(
  CloudWorkspace.initialWorkspace([], null),
  {source:'empty', workspace:{version:2, projects:[]}}
);
console.log('Cloud workspace source selection checks passed');

const ImportResolver = require('./import-resolver.js');
const lenient = Projects.create('Lenient import');
[
  {id:'supplier-b',type:'Organization',name:'Supplier B',status:'active'},
  {id:'rev-p045c',type:'Part Revision',name:'P045 Rev.C',status:'active'},
  {id:'risk-delay',type:'Risk',name:'Shipment delay',status:'active'},
  {id:'event-call',type:'Event',name:'Supplier call',status:'completed'},
  {id:'buyer-a',type:'Person',name:'Buyer A',status:'active'},
  {id:'work-ship',type:'Work Item',name:'Ship samples',status:'planned'},
  {id:'gate-qc',type:'Gate',name:'QC gate',status:'planned'}
].forEach(e=>lenient.entities.push({...e,projectId:lenient.id}));
let resolved=ImportResolver.previewRelations(lenient,[
  {id:'lr1',type:'supplied by',from:'P045 Rev.C',to:'Supplier B',evidence:'contract'},
  {id:'lr2',type:'has influence on',from:'BUYER-A',to:'risk-delay',evidence:'escalation'},
  {id:'lr3',type:'logged against',from:'event-call',to:'risk-delay',evidence:'call note'}
]);
assert.deepEqual(resolved.rows.map(r=>r.status),['normalized','normalized','normalized']);
assert.equal(resolved.rows[0].resolved.type,'supplies');
assert.equal(resolved.rows[0].resolved.from,'supplier-b');
assert.equal(resolved.rows[0].resolved.to,'rev-p045c');
assert.equal(resolved.errors.length,0);
assert.equal(resolved.project.relations.length,3);
assert.deepEqual(resolved.project.relations.map(r=>r.id),['lr1','lr2','lr3'],'Imported relationship IDs must be preserved');
resolved=ImportResolver.previewRelations(resolved.project,[
  {id:'lr1',type:'supplies',from:'supplier-b',to:'rev-p045c',evidence:'contract'},
  {id:'lr4',type:'supplies',from:'supplier-b',to:'rev-p045c',evidence:'duplicate edge'}
]);
assert.equal(resolved.rows[0].status,'duplicate');
assert.equal(resolved.rows[1].status,'duplicate');
assert.equal(resolved.project.relations.length,3,'duplicates must not append');
const ambiguous=structuredClone(lenient);
ambiguous.entities.push({id:'supplier-b2',type:'Organization',name:'Supplier B',status:'active',projectId:ambiguous.id});
resolved=ImportResolver.previewRelations(ambiguous,[{id:'lr5',type:'supplies',from:'Supplier B',to:'rev-p045c'}]);
assert.equal(resolved.rows[0].status,'needs_review');
assert.equal(resolved.project.relations.length,0);
const lenientCsv='id,type,from,to,evidence\nlr6,supplied by,P045 Rev.C,Supplier B,contract';
const integratedLenient=Flow.previewCSV(lenient,lenientCsv,'relations');
assert.equal(integratedLenient.errors.length,0);
assert.equal(integratedLenient.rows[0].status,'normalized');
assert.equal(integratedLenient.project.relations[0].from,'supplier-b');
assert.equal(integratedLenient.project.relations[0].id,'lr6');
assert.deepEqual(Flow.importedIds(integratedLenient.rows),['lr6'],'relationship history must use resolved IDs');
assert.deepEqual(Flow.importedIds(Flow.previewCSV(integratedLenient.project,lenientCsv,'relations').rows),[],'duplicate relationships are not imported');
assert.deepEqual(Flow.importedIds(preview.rows),['part1','work1'],'object history keeps object IDs');
const scopedCSV=Projects.create('Scoped relationship import');
scopedCSV.entities.push({id:'buyer-scope',type:'Person',name:'Buyer',status:'active',projectId:scopedCSV.id},{id:'part-scope',type:'Part',name:'Part',status:'active',projectId:scopedCSV.id});
scopedCSV.relations.push({id:'influence-global',type:'influences',from:'buyer-scope',to:'part-scope',scopeProjectId:null,projectId:scopedCSV.id});
const scopedPreview=Flow.previewCSV(scopedCSV,'id,type,from,to\ninfluence-local,influences,buyer-scope,part-scope','relations');
assert.equal(scopedPreview.errors.length,0,'project-scoped assertion may coexist with global edge');
assert.equal(scopedPreview.project.relations.at(-1).scopeProjectId,scopedCSV.id);
const collisionProject=Projects.create('CSV collision review');
const collisionCSV='id,type,name\ncandidate,Part,Modulo';
let collision=Flow.previewCSV(collisionProject,collisionCSV,'objects',{library:memberLibrary});
assert.equal(collision.rows[0].status,'needs_review');
assert.equal(collision.project,null,'unreviewed name match cannot be committed');
collision=Flow.previewCSV(collisionProject,collisionCSV,'objects',{library:memberLibrary,choices:{candidate:{action:'reuse',targetId:'part-select'}}});
assert.equal(collision.errors.length,0);
assert.equal(collision.project.entities[0].id,'part-select');
assert.deepEqual(Flow.importedIds(collision.rows),['part-select']);
collision=Flow.previewCSV(collisionProject,collisionCSV,'objects',{library:memberLibrary,choices:{candidate:{action:'create'}}});
assert.equal(collision.project.entities[0].id,'candidate','separate ID requires explicit choice');
collision=Flow.previewCSV(collisionProject,'id,type,name\npart-select,Part,Alias','objects',{library:memberLibrary});
assert.equal(collision.rows[0].status,'needs_review','global ID conflict must surface in preview');
collision=Flow.previewCSV(collisionProject,'id,type,name\npart-select,Part,Alias','objects',{library:memberLibrary,choices:{'part-select':{action:'create'}}});
assert.ok(collision.errors.some(error=>/already used/i.test(error)));
collision=Flow.previewCSV(collisionProject,collisionCSV,'objects',{library:memberLibrary,choices:{candidate:{action:'skip'}}});
assert.equal(collision.project.entities.length,0);
assert.ok(Flow.previewCSV(memberLibrary,'id,type,name,plannedStart\nstep-new,Production Step,EOL,2026-10-05','objects',{library:memberLibrary}).errors.some(error=>/dates belong to a project/.test(error)));
console.log('Lenient append-only relationship resolver checks passed');

const htmlContract=fs.readFileSync('./index.html','utf8');
assert.doesNotMatch(htmlContract,/firebase-store\.js|signInButton|signOutButton/,'Local app must not load Firebase authentication');
assert.match(htmlContract,/href="#\/library"/,'Home must expose global Library');
for(const id of ['scopeLabel','addFromLibrary','removeFromProject']) assert.match(htmlContract,new RegExp(`id="${id}"`));
for(const mode of ['single','csv','ai']) assert.match(htmlContract,new RegExp(`data-input-mode="${mode}"`));
assert.match(htmlContract,/Existing records will not be replaced/);
assert.match(htmlContract,/id="aiSourceText"/);
assert.match(htmlContract,/id="aiSourceFile"/);
assert.match(htmlContract,/id="externalTransfer"/);
console.log('Input mode UI contract checks passed');

const Ingestion=require('./ingestion.js');
const aiProject=Projects.create('AI extraction');
aiProject.entities.push({id:'supplier-b',type:'Organization',name:'Supplier B',status:'active',projectId:aiProject.id});
aiProject.entities.push({id:'work-ship',type:'Work Item',name:'Ship samples',status:'planned',projectId:aiProject.id});
const aiOutput={summary:'Supplier B delayed shipment.',objects:[
  {candidateId:'c-existing',suggestedAction:'link_existing',matchedObjectId:'supplier-b',type:'Organization',name:'Supplier B',confidence:.99,sourceExcerpt:'Supplier B'},
  {candidateId:'c-event',suggestedAction:'create',type:'Event',name:'Shipment delayed',status:'completed',occurredDate:'2026-09-20',confidence:.94,sourceExcerpt:'shipment delayed'}
],relationships:[{candidateId:'c-rel',type:'records_on',from:'c-event',to:'work-ship',confidence:.8,sourceExcerpt:'shipment update'}],unresolved:[]};
let draft=Ingestion.validateDraft(aiProject,aiOutput);
assert.equal(draft.errors.length,0);
assert.equal(draft.objects.length,2);
let applied=Ingestion.applySelected(aiProject,draft,new Set(['c-existing','c-event','c-rel']),{sourceId:'source-1',filename:'meeting.txt',confirmedBy:'user-1',addEvidence:true});
assert.equal(aiProject.entities.length,2,'review must not mutate live project');
assert.ok(applied.project.entities.some(e=>e.name==='Shipment delayed'&&e.sourceIds.includes('source-1')));
assert.ok(applied.project.entities.some(e=>e.type==='Evidence'&&e.sourceId==='source-1'));
assert.equal(applied.project.relations.filter(r=>r.type==='records_on').length,1);
assert.ok(applied.project.relations.every(r=>r.sourceIds?.includes('source-1')));
assert.throws(()=>Ingestion.applySelected(aiProject,draft,new Set(['c-existing','c-rel']),{sourceId:'source-1',filename:'meeting.txt',confirmedBy:'user-1'}),/c-rel.*unselected endpoint/,'selected relationship cannot silently disappear');
assert.equal(aiProject.relations.length,0,'failed review must leave the project unchanged');
const globalBuyer={id:'global-buyer',type:'Person',name:'Buyer A',status:'active',projectId:'library'};
const globalLibrary={id:'library',entities:[globalBuyer],relations:[]};
const globalDraft=Ingestion.validateDraft(globalLibrary,{objects:[{candidateId:'reuse-buyer',suggestedAction:'link_existing',matchedObjectId:'global-buyer',type:'Person',name:'Buyer A'}],relationships:[],unresolved:[]});
assert.ok(Ingestion.validateDraft(globalLibrary,{objects:[{candidateId:'wrong-type',suggestedAction:'link_existing',matchedObjectId:'global-buyer',type:'Part',name:'Buyer A'}],relationships:[],unresolved:[]}).errors.some(error=>/type mismatch/.test(error)));
const linkedDraft=Ingestion.applySelected(aiProject,globalDraft,new Set(['reuse-buyer']),{sourceId:'source-2',filename:'meeting.txt',confirmedBy:'local_user',library:globalLibrary});
assert.equal(Model.byId(linkedDraft.project,'global-buyer').projectId,aiProject.id);
const scopedAI=Projects.create('AI scoped relation');
scopedAI.entities.push({id:'person-ai',type:'Person',name:'Buyer',status:'active',projectId:scopedAI.id},{id:'part-ai',type:'Part',name:'Part',status:'active',projectId:scopedAI.id});
scopedAI.relations.push({id:'global-ai-influence',type:'influences',from:'person-ai',to:'part-ai',scopeProjectId:null,projectId:scopedAI.id});
const scopedAIDraft=Ingestion.validateDraft(scopedAI,{objects:[],relationships:[{candidateId:'local-ai-influence',type:'influences',from:'person-ai',to:'part-ai'}],unresolved:[]});
assert.equal(Ingestion.applySelected(scopedAI,scopedAIDraft,new Set(['local-ai-influence']),{sourceId:'source-3',filename:'meeting.txt',confirmedBy:'user'}).project.relations.at(-1).scopeProjectId,scopedAI.id);
assert.match(Ingestion.buildPrompt(aiProject,{sourceId:'source-1',kind:'meeting_transcript'}),/strict JSON/i);
console.log('Reviewed AI ingestion checks passed');

const ganttProjection=Flow.ganttWindow([
  {id:'task',type:'Work Item',plannedStart:'2026-09-03',plannedEnd:'2026-09-10',baselineStart:'2026-09-01',baselineEnd:'2026-09-07'},
  {id:'gate',type:'Gate',due:'2026-09-15'}
],'2026-09-01','2026-09-30','month');
assert.equal(ganttProjection.days,30);
assert.equal(ganttProjection.items[0].late,true);
assert.equal(ganttProjection.items[1].milestone,true);
assert.ok(ganttProjection.items[0].current.width>20);
assert.ok(ganttProjection.ticks.length>=4);
console.log('Gantt projection checks passed');

const localOne=Flow.localGraph(graph,'b',{depth:1,direction:'all',limit:20});
assert.ok(localOne.nodes.some(e=>e.id==='a'));
assert.ok(localOne.nodes.some(e=>e.id==='c'));
assert.ok(!localOne.nodes.some(e=>e.id==='p'));
const localOut=Flow.localGraph(graph,'b',{depth:1,direction:'outgoing',limit:20});
assert.ok(localOut.nodes.some(e=>e.id==='c'));
assert.ok(!localOut.nodes.some(e=>e.id==='a'));
const localTwo=Flow.localGraph(graph,'a',{depth:2,direction:'outgoing',limit:2});
assert.equal(localTwo.nodes.length,2);
assert.ok(localTwo.truncated>0);
console.log('Local relationship graph checks passed');

const APQP=require('./apqp.js');
const apqpProject=Projects.create('APQP program');
const characteristic=Model.addEntity(apqpProject,{type:'Characteristic',name:'Connector retention force',characteristicKind:'product',classification:'critical',specification:'≥ 80 N',measurementMethod:'Pull test',apqpPhase:'3',completionState:'in_progress'});
const requirement=Model.addEntity(apqpProject,{type:'Requirement',name:'Customer retention requirement',requirementSource:'customer',apqpPhase:'2',applicability:'applicable',completionState:'approved'});
const evidence=Model.addEntity(apqpProject,{type:'Evidence',name:'DV pull-test report',apqpPhase:'4',completionState:'approved'});
const gate=Model.addEntity(apqpProject,{type:'Gate',name:'Product validation release',apqpPhase:'4',readiness:'ready',decision:'not_decided'});
Model.addRelation(apqpProject,{from:evidence.id,type:'verifies',to:characteristic.id,evidence:'Report section 4'});
Model.addRelation(apqpProject,{from:evidence.id,type:'satisfies',to:requirement.id,evidence:'Customer acceptance result'});
Model.addRelation(apqpProject,{from:evidence.id,type:'required_for',to:gate.id,evidence:'Gate input'});
assert.throws(()=>Model.addEntity(apqpProject,{type:'Requirement',name:'Excluded item',applicability:'not_applicable'}),/reason/i);
assert.equal(APQP.dashboard(apqpProject).phases.find(p=>p.id==='4').total,2);
assert.equal(APQP.gateReviews(apqpProject)[0].decision,'not_decided');
assert.equal(APQP.traceability(apqpProject).broken.length,0);
const starter=APQP.starter();
assert.equal(starter.entities.filter(e=>e.type==='Gate').length,5);
assert.ok(starter.entities.every(e=>e.templateItemId&&e.templateVersion));
console.log('APQP model, traceability and starter checks passed');

const Analysis=require('./analysis-views.js');
assert.deepEqual(Analysis.quadrant({power:'high',influence:'low'}),{x:18,y:18});
assert.equal(Analysis.quadrant({power:'',influence:'high'}),null);
assert.deepEqual(Analysis.engagementTrack({currentEngagement:'resistant',desiredEngagement:'supportive'}),{current:1,desired:3});
const analysisStore=Projects.create('Analysis');
analysisStore.entities.push(
  {id:'buyer',type:'Person',name:'Buyer',status:'active',projectId:analysisStore.id},
  {id:'supplier',type:'Organization',name:'Supplier',status:'active',projectId:analysisStore.id},
  {id:'scope',type:'Work Item',name:'Release part',status:'planned',projectId:analysisStore.id},
  {id:'assign',type:'Assignment',name:'Buyer approval',status:'active',raci:'A',projectId:analysisStore.id}
);
Model.addRelation(analysisStore,{from:'buyer',type:'influences',to:'supplier'});
Model.addRelation(analysisStore,{from:'assign',type:'assigned_to',to:'buyer'});
Model.addRelation(analysisStore,{from:'assign',type:'assignment_scope',to:'scope'});
assert.equal(Analysis.influenceMatrix(analysisStore).cells.get('buyer:supplier'),true);
const raci=Analysis.raciMatrix(analysisStore);
assert.equal(raci.rows[0].cells.get('buyer'),'A');
assert.equal(raci.rows[0].review,'1 accountable · Missing R');
console.log('Stakeholder and RACI analysis projection checks passed');

const appContract=fs.readFileSync('./app.js','utf8'),styleContract=fs.readFileSync('./styles.css','utf8');
assert.match(appContract,/LocalAPI\.load/);
assert.doesNotMatch(appContract,/FirebaseStore|startFirebase|loadCloudWorkspace/);
assert.match(appContract,/restoreViewSettings/);
assert.match(appContract,/LocalAPI\.settings/);
assert.match(appContract,/LocalAPI\.extract/);
assert.match(appContract,/gantt-bar-title/);
assert.match(appContract,/gantt-callout/);
assert.match(styleContract,/\.gantt-bar\s*\{[^}]*height:28px/);
assert.match(styleContract,/\.gantt-callout/);
console.log('Readable Gantt UI contract checks passed');
for(const token of ['stakeholder-quadrant','influence-matrix','engagement-track','raci-matrix']) assert.match(appContract,new RegExp(token));
console.log('Stakeholder chart and RACI matrix UI contract checks passed');
for(const label of ['Add manually','Add to current ontology']) assert.match(htmlContract,new RegExp(label));
assert.match(appContract,/Review selected changes/);
assert.match(appContract,/Update ontology/);
assert.match(appContract,/Back to extracted draft/);
assert.match(appContract,/ids=Flow\.importedIds\(result\.rows\)/,'CSV save must use resolved import IDs');
console.log('Append-only ontology input workflow contract checks passed');
assert.match(htmlContract,/styles\.css\?v=\d{8}-\d+/);
assert.match(htmlContract,/app\.js\?v=\d{8}-\d+/);
assert.match(htmlContract,/import-resolver\.js\?v=\d{8}-\d+/);
console.log('Static asset cache-busting contract checks passed');

const production=Projects.create('Production graph');
const assemblyPart=Model.addEntity(production,{type:'Part',name:'Camera housing'});
const assemblyRevision=Model.addEntity(production,{type:'Part Revision',name:'Camera housing Rev.B'});
const assemble=Model.addEntity(production,{type:'Production Step',name:'Assemble camera',operationCode:'OP-010',productionStage:'Assembly',workCenter:'Line 2',processLevel:'main'});
const inspect=Model.addEntity(production,{type:'Production Step',name:'Inspect housing',operationCode:'OP-020',processLevel:'main'});
const rework=Model.addEntity(production,{type:'Production Step',name:'Rework housing',processLevel:'sub',parentWorkId:inspect.id,branchKind:'rework'});
const machine=Model.addEntity(production,{type:'Resource',name:'Screwdriving station',resourceKind:'machine',tier:'Station / asset',assetId:'MX-42',model:'SD-8',site:'Mexico',capacityNote:'Pending PM review'});
const ictPool=Model.addEntity(production,{type:'Resource',name:'ICT shared pool',resourceKind:'machine',machineMode:'shared_pool',machineFamily:'ICT'});
const dedicated=Model.addEntity(production,{type:'Resource',name:'ICT line 2',resourceKind:'machine',machineMode:'specific_asset',machineFamily:'ICT',assetId:'ICT-02'});
assert.equal(ictPool.machineMode,'shared_pool');
assert.equal(dedicated.machineMode,'specific_asset');
assert.throws(()=>Model.addEntity(production,{type:'Resource',name:'Bad machine',machineMode:'random'}),/machine mode/i);
assert.throws(()=>Model.addEntity(production,{type:'Part',name:'Wrong machine field',machineMode:'shared_pool'}),/Resource/);
const worker=Model.addEntity(production,{type:'Person',name:'Plant operator',workerRole:'Assembly operator',tier:'Grade 2',qualification:'Screwdriving',shift:'A',site:'Mexico'});
const supplier=Model.addEntity(production,{type:'Organization',name:'Housing supplier'});
const staff=Model.addEntity(production,{type:'Assignment',name:'Assembly staffing',role:'operator',raci:'R'});
const productionGate=Model.addEntity(production,{type:'Gate',name:'Assembly release'});
Model.addRelation(production,{from:assemblyRevision.id,type:'revision_of',to:assemblyPart.id});
Model.addRelation(production,{from:assemble.id,type:'applies_to',to:assemblyRevision.id});
Model.addRelation(production,{from:assemble.id,type:'requires',to:machine.id});
Model.addRelation(production,{from:assemble.id,type:'precedes',to:inspect.id});
Model.addRelation(production,{from:inspect.id,type:'on_failure',to:rework.id});
Model.addRelation(production,{from:productionGate.id,type:'condition_target',to:inspect.id});
Model.addRelation(production,{from:staff.id,type:'assignment_scope',to:assemble.id});
Model.addRelation(production,{from:staff.id,type:'assigned_to',to:worker.id});
Model.addRelation(production,{from:worker.id,type:'works_at',to:supplier.id});
Model.addRelation(production,{from:worker.id,type:'qualified_for',to:machine.id});
assert.doesNotThrow(()=>Projects.validate(production));
assert.throws(()=>Model.addRelation(production,{from:machine.id,type:'requires',to:assemble.id}),/does not support/);
const productionAll=Flow.productionGraph(production);
assert.ok(productionAll.entities.some(e=>e.id===machine.id));
assert.ok(productionAll.entities.some(e=>e.id===worker.id));
assert.ok(productionAll.relations.some(r=>r.type==='assigned'&&r.to===assemble.id));
assert.ok(productionAll.relations.some(r=>r.type==='precedes'&&r.to===inspect.id));
assert.ok(Flow.productionLayout(productionAll).positions[inspect.id].y>Flow.productionLayout(productionAll).positions[assemble.id].y);
assert.deepEqual(Flow.productionGraph(production,{partId:assemblyPart.id}).steps.map(e=>e.id),[assemble.id]);
assert.ok(!Flow.productionGraph(production,{layers:['parts']}).entities.some(e=>e.id===machine.id));
assert.ok(!Flow.productionGraph(production,{showSubprocesses:false}).steps.some(e=>e.id===rework.id));
assert.ok(APQP.gateReviews(production).some(e=>e.id===productionGate.id));
assert.ok(APQP.partReadiness(production).find(row=>row.part.id===assemblyPart.id).items.some(e=>e.id===assemble.id));
assert.equal(Projects.importProject(production).entities.find(e=>e.name==='Screwdriving station').assetId,'MX-42');
assert.equal(Flow.previewCSV(production,'id,type,name,resourceKind,tier,assetId\nmachine-2,Resource,Vision station,machine,Line / station,MX-43','objects').errors.length,0);
assert.match(appContract,/Production:\['Production Step'/);
assert.match(htmlContract,/id="productionMap"/);
assert.match(htmlContract,/data-production-view="APQP &amp; gates"/);
console.log('Production ontology, links, filtering, layout and UI checks passed');

const partB=Model.addEntity(production,{type:'Part',name:'Other light module'});
const partC=Model.addEntity(production,{type:'Part',name:'Unrouted spare'});
const buildB=Model.addEntity(production,{type:'Production Step',name:'Build other module',processLevel:'main'});
const unlinkedStep=Model.addEntity(production,{type:'Production Step',name:'Unlinked trial',processLevel:'main'});
Model.addRelation(production,{from:inspect.id,type:'applies_to',to:assemblyPart.id});
Model.addRelation(production,{from:rework.id,type:'applies_to',to:assemblyPart.id});
Model.addRelation(production,{from:buildB.id,type:'applies_to',to:partB.id});
Model.addRelation(production,{from:buildB.id,type:'requires',to:machine.id});
production.workstreams={...production.workstreams,[assemblyPart.id]:['production'],[partB.id]:['production'],[buildB.id]:['production']};
const scopedA=Flow.partFocusedGraph(production,assemblyPart.id,{types:Model.ENTITY_TYPES});
assert.ok(scopedA.entities.some(e=>e.id===assemblyPart.id));
assert.ok(scopedA.entities.some(e=>e.id===assemble.id));
assert.ok(scopedA.entities.some(e=>e.id===inspect.id));
assert.ok(scopedA.entities.some(e=>e.id===rework.id));
assert.ok(scopedA.entities.some(e=>e.id===machine.id));
assert.ok(scopedA.entities.some(e=>e.id===staff.id));
assert.ok(scopedA.relations.some(r=>r.type==='assignment_scope'&&r.to===assemble.id));
assert.ok(!scopedA.entities.some(e=>e.id===partB.id||e.id===buildB.id));
assert.ok(scopedA.relations.some(r=>r.type==='on_failure'&&r.to===rework.id));
assert.ok(!scopedA.relations.some(r=>r.type==='precedes'&&r.to===rework.id));
assert.equal(scopedA.steps.length,3);
const focusedPositions=Flow.productionLayout(scopedA).positions;
assert.ok(focusedPositions[inspect.id].y>focusedPositions[assemble.id].y);
assert.ok(focusedPositions[rework.id].x>focusedPositions[inspect.id].x);
assert.ok(Flow.productionLayout(scopedA,{compact:true}).positions[machine.id].x<1200);
assert.ok(Flow.partFocusedGraph(production,assemblyPart.id,{types:Model.ENTITY_TYPES,query:'Camera housing'}).steps.some(e=>e.id===assemble.id));
assert.ok(Flow.partSummary(production,{types:Model.ENTITY_TYPES,query:'Camera housing'}).entities.find(e=>e.partId===assemblyPart.id).summaryCount>0);
const inheritedChild=Model.addEntity(production,{type:'Production Step',name:'Adhesive detail',processLevel:'sub',parentWorkId:inspect.id,branchKind:'support'});
assert.ok(Flow.partFocusedGraph(production,assemblyPart.id,{types:Model.ENTITY_TYPES}).steps.some(e=>e.id===inheritedChild.id));
const partCards=Flow.partSummary(production,{types:Model.ENTITY_TYPES});
assert.ok(partCards.entities.find(e=>e.partId===assemblyPart.id).summaryCount>=4);
assert.ok(partCards.entities.some(e=>e.partId===partB.id));
assert.equal(partCards.entities.find(e=>e.partId===partC.id).summaryDetail,'No linked process');
assert.ok(partCards.entities.some(e=>e.summaryKind==='unlinked'&&e.summaryCount===1));
const workstreamCards=Flow.workstreamSummary(production,{types:Model.ENTITY_TYPES});
assert.equal(workstreamCards.entities.filter(e=>e.summaryKind==='workstream').length,6);
assert.ok(workstreamCards.entities.some(e=>e.summaryKind==='unassigned'));
console.log('Part-focused scope and compact workstream projections passed');

const lsDraft=Projects.create('LS draft workflow');
const ls=Model.addEntity(lsDraft,{type:'Part',name:'LS'});
const g65=Model.addEntity(lsDraft,{type:'Part',name:'G65'});
Model.addRelation(lsDraft,{from:g65.id,type:'part_of',to:ls.id,evidence:'Draft note: G65 belongs to LS family'});
assert.throws(()=>Model.addRelation(lsDraft,{from:ls.id,type:'part_of',to:g65.id}),/cycle/i);
const station=Model.addEntity(lsDraft,{type:'Resource',name:'G65 assembly station',resourceKind:'machine'});
const operator=Model.addEntity(lsDraft,{type:'Person',name:'Marta',workArea:'factory',department:'Production',workerRole:'Final inspection operator'});
const supervisor=Model.addEntity(lsDraft,{type:'Person',name:'Line lead',workArea:'factory',department:'Production',title:'Supervisor'});
Model.addRelation(lsDraft,{from:operator.id,type:'reports_to',to:supervisor.id});
assert.throws(()=>Model.addRelation(lsDraft,{from:supervisor.id,type:'reports_to',to:operator.id}),/cycle/i);
assert.throws(()=>Model.addEntity(lsDraft,{type:'Person',name:'Invalid',workArea:'warehouse'}),/work area/i);
const build=Model.addEntity(lsDraft,{type:'Production Step',name:'Assemble G65',operationCode:'OP-010',operatorAction:'Load the part and start the assembly cycle.',acceptanceCriteria:'Assembly complete',failureAction:'Escalate to technician'});
const check=Model.addEntity(lsDraft,{type:'Production Step',name:'Final check',operationCode:'OP-020'});
const reject=Model.addEntity(lsDraft,{type:'Production Step',name:'Ticket and isolate failed part',processLevel:'sub',parentWorkId:check.id,branchKind:'exception'});
const assignment=Model.addEntity(lsDraft,{type:'Assignment',name:'Final inspection',role:'operator'});
Model.addRelation(lsDraft,{from:build.id,type:'applies_to',to:g65.id});
Model.addRelation(lsDraft,{from:build.id,type:'requires',to:station.id});
Model.addRelation(lsDraft,{from:build.id,type:'precedes',to:check.id});
Model.addRelation(lsDraft,{from:check.id,type:'applies_to',to:g65.id});
Model.addRelation(lsDraft,{from:check.id,type:'on_failure',to:reject.id});
Model.addRelation(lsDraft,{from:reject.id,type:'applies_to',to:g65.id});
Model.addRelation(lsDraft,{from:assignment.id,type:'assignment_scope',to:check.id});
Model.addRelation(lsDraft,{from:assignment.id,type:'assigned_to',to:operator.id});
assert.doesNotThrow(()=>Projects.validate(lsDraft));
assert.deepEqual(Flow.productionGraph(lsDraft,{partId:ls.id}).steps.map(e=>e.id).sort(),[build.id,check.id,reject.id].sort());
const partFlow=Flow.partWorkflow(lsDraft,g65.id);
assert.deepEqual(partFlow.map(row=>row.step.id),[build.id,check.id,reject.id]);
assert.equal(partFlow[0].resources[0].id,station.id);
assert.equal(partFlow[1].workers[0].id,operator.id);
assert.equal(partFlow[1].failures[0].id,reject.id);
assert.equal(partFlow[0].step.operatorAction,'Load the part and start the assembly cycle.');
const groups=Analysis.stakeholderGroups([operator,supervisor]);
assert.equal(groups[0].name,'Factory');
assert.equal(groups[0].departments[0].name,'Production');
assert.equal(groups[0].departments[0].roles.length,2);
assert.equal(Analysis.reportingTree(lsDraft,[operator,supervisor])[0].entity.id,supervisor.id);
assert.equal(Analysis.reportingTree(lsDraft,[operator,supervisor])[0].reports[0].entity.id,operator.id);
assert.equal(Analysis.influenceMatrix(lsDraft,new Set([operator.id])).stakeholders.length,1);
assert.match(htmlContract,/id="productionTabs"/);
assert.match(htmlContract,/id="stakeholderFilters"/);
assert.match(appContract,/data-inspector-view="workflow"/);
console.log('LS part hierarchy, worker reporting, detailed part workflow and tab contracts passed');

const lsReview=JSON.parse(fs.readFileSync('../ls-production-review-draft.json','utf8'));
assert.doesNotThrow(()=>Model.validateStore(lsReview));
assert.equal(lsReview.entities.some(e=>e.id==='part-ls'),false,'LS is the project, not a Part');
for(const id of ['part-modulo','part-t1s','part-t1xl','part-module']) assert.equal(lsReview.entities.filter(e=>e.id===id).length,1);
const linked=(from,type,to)=>lsReview.relations.some(r=>r.from===from&&r.type===type&&r.to===to);
assert.ok(linked('step-g65-eol-initial','precedes','step-download'));
assert.ok(linked('step-download','precedes','step-router'));
assert.ok(linked('step-router','precedes','step-eol'));
assert.ok(linked('step-eol-visual','precedes','step-g65-pack'));
assert.ok(linked('step-modulo-photo','precedes','step-modulo-visual'));
assert.ok(linked('step-modulo-photo','on_failure','step-modulo-photo-hold'));
assert.equal(lsReview.relations.some(r=>r.type==='precedes'&&r.from==='step-modulo-photo-hold'),false);
assert.equal(lsReview.relations.some(r=>r.to==='part-t1s'&&r.from==='step-t1'),false,'T1S is not the unverified T1 test');
console.log('LS project and distinct part route draft checks passed');

const mainG65=lsReview.entities.filter(e=>e.type==='Part'&&e.name==='Main G65 part');
assert.equal(mainG65.length,1,'Main G65 is its own Part, not the existing G65');
assert.notEqual(mainG65[0].id,'part-g65');
const mainStages=['main-g65-router','main-g65-integration','main-g65-stacking','main-g65-eol','main-g65-visual'];
for(const [index,id] of mainStages.entries()) {
  assert.ok(lsReview.entities.some(e=>e.id===id&&e.type==='Production Step'&&!e.parentWorkId));
  assert.ok(linked(id,'applies_to',mainG65[0].id));
  if(index)assert.ok(linked(mainStages[index-1],'precedes',id));
}
assert.ok(linked('main-g65-router-load','precedes','main-g65-router-start'));
assert.ok(linked('main-g65-router-separate','precedes','main-g65-router-lower-pins'));
assert.ok(linked('main-g65-router-separate','precedes','main-g65-router-upper-pins'));
assert.ok(linked('main-g65-stacking','on_failure','main-g65-stacking-return'));
assert.ok(linked('main-g65-stacking-return','rework_of','main-g65-integration'));
assert.ok(linked('main-g65-eol','on_failure','main-g65-eol-manual-qr'));
assert.equal(lsReview.relations.some(r=>r.type==='part_of'&&r.to===mainG65[0].id),false,'BOM is not confirmed');
assert.equal(lsReview.relations.some(r=>r.type==='precedes'&&r.from==='main-g65-stacking-return'),false,'Failure return is not normal sequence');
const mainProject=Projects.importProject(lsReview);
const mainFolded=Flow.productionGraph(mainProject,{partId:mainG65[0].id,expandedIds:[]});
assert.deepEqual(mainFolded.steps.map(e=>e.id),mainStages);
const mainExpanded=Flow.productionGraph(mainProject,{partId:mainG65[0].id,expandedIds:['main-g65-router']});
assert.ok(mainExpanded.steps.some(e=>e.id==='main-g65-router-lower-pins'));
assert.ok(mainExpanded.steps.some(e=>e.id==='main-g65-router-tech-hold'));
assert.ok(!mainExpanded.steps.some(e=>e.id==='main-g65-integration-scan'));
assert.equal(Flow.partWorkflow(mainProject,mainG65[0].id).find(row=>row.step.id==='main-g65-stacking-return').lane,'failure');
console.log('Main G65 distinct Part, normal route, and problem branch checks passed');

const deltaObjectCsv=fs.readFileSync('../main-g65-objects.csv','utf8');
const deltaRelationCsv=fs.readFileSync('../main-g65-relations.csv','utf8');
const deltaObjects=Flow.parseCSV(deltaObjectCsv).rows;
const deltaRelations=Flow.parseCSV(deltaRelationCsv).rows;
assert.ok(deltaObjects.length>0&&deltaRelations.length>0);
assert.ok(deltaObjects.every(row=>row.id.startsWith('main-g65-')));
assert.ok(deltaRelations.every(row=>row.id.startsWith('main-g65-')));
const oldOnly={...lsReview,entities:lsReview.entities.filter(e=>!e.id.startsWith('main-g65-')),relations:lsReview.relations.filter(r=>!r.id.startsWith('main-g65-'))};
const beforeAppend=Projects.importProject(oldOnly);
const appendObjects=Flow.previewCSV(beforeAppend,deltaObjectCsv,'objects');
assert.deepEqual(appendObjects.errors,[]);
const appendRelations=Flow.previewCSV(appendObjects.project,deltaRelationCsv,'relations');
assert.deepEqual(appendRelations.errors,[]);
assert.deepEqual(appendRelations.project.entities.filter(e=>!e.id.startsWith('main-g65-')),beforeAppend.entities,'Append must not change existing objects');
assert.deepEqual(appendRelations.project.relations.filter(r=>!r.id.startsWith('main-g65-')),beforeAppend.relations,'Append must not change existing relations');
assert.ok(Flow.productionGraph(appendRelations.project,{partId:'main-g65-part',expandedIds:[]}).steps.length===5);
console.log('Main G65 append-only CSV import and old-route preservation checks passed');

const routeProject=Projects.importProject(lsReview);
const foldedModulo=Flow.productionGraph(routeProject,{partId:'part-modulo',expandedIds:[]});
assert.ok(foldedModulo.steps.some(e=>e.id==='step-modulo-assemble'));
assert.ok(!foldedModulo.steps.some(e=>e.parentWorkId),'Collapsed map must hide all detail and failure nodes');
const openModulo=Flow.productionGraph(routeProject,{partId:'part-modulo',expandedIds:['step-modulo-inspect']});
assert.ok(openModulo.steps.some(e=>e.id==='step-modulo-photo'));
assert.ok(openModulo.steps.some(e=>e.id==='step-modulo-photo-hold'));
assert.ok(!openModulo.steps.some(e=>e.id==='step-modulo-load'));
const openModuloPositions=Flow.productionLayout(openModulo).positions;
assert.ok(openModuloPositions['step-modulo-photo-hold'].x>openModuloPositions['step-modulo-photo'].x,'Failure route occupies its own lane');
assert.ok(openModuloPositions['step-modulo-circuit'].y<openModuloPositions['step-modulo-photo'].y);
assert.equal(openModuloPositions['step-modulo-circuit-hold'].y,openModuloPositions['step-modulo-circuit'].y,'Failure branch aligns with its source check');
assert.equal(openModuloPositions['step-modulo-photo-hold'].y,openModuloPositions['step-modulo-photo'].y,'Photo failure does not cross the next normal check');
const siblingOrder=Projects.create('Explicit child order');
const parentStep=Model.addEntity(siblingOrder,{type:'Production Step',name:'Inspection'});
const firstChild=Model.addEntity(siblingOrder,{type:'Production Step',name:'Zulu check',processLevel:'sub',parentWorkId:parentStep.id,branchKind:'support'});
const secondChild=Model.addEntity(siblingOrder,{type:'Production Step',name:'Alpha check',processLevel:'sub',parentWorkId:parentStep.id,branchKind:'support'});
Model.addRelation(siblingOrder,{from:firstChild.id,type:'precedes',to:secondChild.id});
const siblingPositions=Flow.productionLayout(Flow.productionGraph(siblingOrder)).positions;
assert.ok(siblingPositions[firstChild.id].y<siblingPositions[secondChild.id].y,'Recorded order beats alphabetical order');
const g65Route=Flow.productionGraph(routeProject,{partId:'part-g65',expandedIds:[]});
assert.ok(g65Route.unplacedIds.has('step-ict1'));
assert.ok(g65Route.unplacedIds.has('step-ict2'));
assert.ok(!g65Route.unplacedIds.has('step-g65-eol-initial'));
const moduloWorkflow=Flow.partWorkflow(routeProject,'part-modulo');
assert.equal(moduloWorkflow.find(row=>row.step.id==='step-modulo-assemble').assignments[0].role,'Load, scan, start cycle and check glue');
assert.equal(moduloWorkflow.find(row=>row.step.id==='step-modulo-photo-hold').lane,'failure');
assert.ok(Flow.partWorkflow(routeProject,'part-modulo-board-a').some(row=>row.step.id==='step-modulo-assemble'),'Component opens its relevant assembly step');
assert.equal(Flow.partWorkflow(routeProject,'part-g65').find(row=>row.step.id==='step-ict1').lane,'unplaced');
console.log('Production fold, route lanes, and unassigned operator projection checks passed');
assert.match(appContract,/Flow\.productionNetwork/);
assert.match(appContract,/Flow\.productionContextLayout/);
const spacedRoutes=Flow.networkLayout([{id:'a',entity:{name:'A'},partIds:['a']},{id:'b',entity:{name:'B'},partIds:['b']}],[],{context:{a:{machines:[{}],inputs:[],outputs:[]},b:{machines:[{}],inputs:[],outputs:[]}},partOrder:['a','b']});
assert.ok(spacedRoutes.positions.b.x-218>=spacedRoutes.positions.a.x+194+24,'Neighbor machine chip stays clear of previous route step');
assert.doesNotMatch(appContract,/data-production-expand/,'All Production steps are visible without expansion');
assert.match(appContract,/failure-step/);
assert.match(appContract,/Order not recorded/);
assert.match(appContract,/workflow-stage/);
assert.match(styleContract,/\.production-map-stage \.edge\.failure-edge/);
assert.match(htmlContract,/Normal route/);
assert.doesNotMatch(htmlContract,/data-production-layer="parts" checked/,'Part context is opt-in so normal route stays legible');
console.log('Continuous process graph and Part workflow UI contracts passed');
assert.match(htmlContract,/id="projectEntry"/);
assert.match(htmlContract,/id="projectHistory"/);
assert.match(htmlContract,/id="savedChangeReview"/);
assert.match(htmlContract,/id="workstreamChoices"/);
assert.match(appContract,/Flow\.workstreamGraph\(store,/);
assert.match(appContract,/LocalAPI\.revertChange\(/);
assert.match(styleContract,/\.workstream-grid/);
console.log('Project entry, workstream map, saved-change review and history UI contracts passed');

const laneFixture={id:'routes',entities:[
  {id:'part-a',type:'Part',name:'A'}, {id:'part-b',type:'Part',name:'B'}, {id:'part-c',type:'Part',name:'C'},
  {id:'route-start',type:'Production Step',name:'Start'}, {id:'route-end',type:'Production Step',name:'End'},
  {id:'route-detail',type:'Production Step',name:'Scan',processLevel:'sub',parentWorkId:'route-start',branchKind:'support'},
  {id:'route-fail',type:'Production Step',name:'Hold',processLevel:'sub',parentWorkId:'route-end',branchKind:'exception'},
  {id:'route-isolated',type:'Production Step',name:'Unplaced'},
  {id:'work-commercial',type:'Work Item',name:'Quote'}, {id:'work-logistics',type:'Work Item',name:'Ship'},
  {id:'work-unassigned',type:'Work Item',name:'Unclassified'}
],relations:[
  {id:'a1',type:'applies_to',from:'route-start',to:'part-a'}, {id:'a2',type:'applies_to',from:'route-end',to:'part-a'},
  {id:'a3',type:'applies_to',from:'route-start',to:'part-b'}, {id:'a4',type:'applies_to',from:'route-end',to:'part-b'},
  {id:'a5',type:'applies_to',from:'route-isolated',to:'part-a'},
  {id:'seq',type:'precedes',from:'route-start',to:'route-end'}, {id:'fail',type:'on_failure',from:'route-end',to:'route-fail'},
  {id:'cross',type:'precedes',from:'work-commercial',to:'work-logistics'}
],workstreams:{'work-commercial':['commercial'],'work-logistics':['logistics']}};
const routeLanes=Flow.productionLanes(laneFixture,{partIds:['part-a','part-b','part-c']});
assert.equal(routeLanes.lanes.length,3);
assert.ok(routeLanes.lanes[0].items.some(item=>item.id==='route-detail'&&item.lane==='detail'));
assert.ok(routeLanes.lanes[0].items.some(item=>item.id==='route-fail'&&item.lane==='failure'));
assert.ok(routeLanes.lanes[0].items.some(item=>item.id==='route-isolated'&&item.orderKnown===false));
assert.ok(routeLanes.lanes[1].items.some(item=>item.id==='route-start'));
assert.equal(routeLanes.lanes[2].items.length,0);
assert.deepEqual(new Set(routeLanes.lanes[0].edges.map(edge=>edge.type)),new Set(['precedes','on_failure']));
assert.equal(routeLanes.lanes[0].edges.some(edge=>edge.from==='route-detail'),false);
const streamLanes=Flow.workstreamLanes(laneFixture,{});
assert.ok(streamLanes.lanes.find(lane=>lane.code==='commercial').items.some(item=>item.id==='work-commercial'));
assert.ok(streamLanes.lanes.find(lane=>lane.code==='logistics').items.some(item=>item.id==='work-logistics'));
assert.ok(streamLanes.lanes.find(lane=>lane.code==='unassigned').items.some(item=>item.id==='work-unassigned'));
assert.ok(streamLanes.edges.some(edge=>edge.id==='cross'));
const routeCanvas=Flow.productionLaneLayout(routeLanes);
assert.equal(routeCanvas.bands.length,3);
assert.equal(routeCanvas.nodes.filter(node=>node.id==='route-start').length,2,'One canonical Step can have two visual instances');
assert.ok(routeCanvas.nodes.find(node=>node.id==='route-detail'&&node.partId==='part-a').y>routeCanvas.nodes.find(node=>node.id==='route-start'&&node.partId==='part-a').y);
assert.ok(routeCanvas.nodes.find(node=>node.id==='route-fail'&&node.partId==='part-a').y>routeCanvas.nodes.find(node=>node.id==='route-end'&&node.partId==='part-a').y);
assert.equal(routeCanvas.edges.filter(edge=>edge.type==='precedes').length,2);
const network=Flow.productionNetwork(laneFixture,{partIds:['part-a','part-b']});
assert.equal(network.nodes.filter(node=>node.id==='route-start').length,1,'Shared Step ID must render once');
assert.deepEqual(network.nodes.find(node=>node.id==='route-start').partIds,['part-a','part-b']);
assert.equal(network.edges.filter(edge=>edge.type==='precedes').length,1,'Shared recorded link must render once');
assert.deepEqual(network.edges.find(edge=>edge.type==='precedes').partIds,['part-a','part-b']);
assert.ok(network.edges.some(edge=>edge.type==='subprocess'&&edge.to==='route-detail'));
assert.ok(network.edges.some(edge=>edge.type==='on_failure'&&edge.to==='route-fail'));
assert.equal(network.edges.some(edge=>edge.from==='route-isolated'||edge.to==='route-isolated'),false,'Unconfirmed order must not invent arrows');
const sameNames={...laneFixture,entities:[...laneFixture.entities,{id:'route-start-two',type:'Production Step',name:'Start'}],relations:[...laneFixture.relations,{id:'same-label',type:'applies_to',from:'route-start-two',to:'part-a'}]};
assert.equal(Flow.productionNetwork(sameNames,{partIds:['part-a']}).nodes.filter(node=>node.entity.name==='Start').length,2,'Name alone must not merge activities');
const graphLayout=Flow.networkLayout(network.nodes,network.edges);
assert.equal(Object.keys(graphLayout.positions).length,network.nodes.length);
assert.ok(graphLayout.positions['route-start'].y<graphLayout.positions['route-end'].y,'Recorded order determines vertical position');
assert.ok(graphLayout.width>0&&graphLayout.height>0);
const sixParts={id:'six',entities:[...Array.from({length:6},(_,index)=>({id:'p'+index,type:'Part',name:'Part '+index})),{id:'common',type:'Production Step',name:'ICT'},{id:'finish',type:'Production Step',name:'EOL'},...Array.from({length:6},(_,index)=>({id:'step'+index,type:'Production Step',name:'Visual '+index}))],relations:[{id:'sequence',type:'precedes',from:'common',to:'finish'},...Array.from({length:6},(_,index)=>[{id:'applies'+index,type:'applies_to',from:'common',to:'p'+index},{id:'produces'+index,type:'applies_to',from:'finish',to:'p'+index},{id:'unique'+index,type:'applies_to',from:'step'+index,to:'p'+index},{id:'next'+index,type:'precedes',from:'finish',to:'step'+index}]).flat()]};
const sixNetwork=Flow.productionNetwork(sixParts);
assert.equal(sixNetwork.nodes.length,8,'Six routes fit one graph with shared steps drawn once');
assert.equal(sixNetwork.nodes.find(node=>node.id==='common').partIds.length,6);
assert.equal(new Set(Object.values(Flow.networkLayout(sixNetwork.nodes,sixNetwork.edges).positions).map(point=>point.x+':'+point.y)).size,8,'No activity positions overlap');
const streamCanvas=Flow.workstreamLaneLayout(streamLanes);
assert.ok(streamCanvas.nodes.some(node=>node.id==='work-commercial'));
assert.ok(streamCanvas.nodes.some(node=>node.id==='work-logistics'));
assert.ok(streamCanvas.edges.some(edge=>edge.id==='cross'));
const sequenceFixture={entities:[{id:'z',type:'Work Item',name:'Z start'},{id:'a',type:'Work Item',name:'A finish'}],relations:[{id:'linked',type:'precedes',from:'z',to:'a'}],workstreams:{z:['logistics'],a:['logistics']}};
const sequenceCanvas=Flow.workstreamLaneLayout(Flow.workstreamLanes(sequenceFixture));
assert.ok(sequenceCanvas.nodes.find(node=>node.id==='z').x<sequenceCanvas.nodes.find(node=>node.id==='a').x,'Recorded order beats alphabetical placement');
const onlyPartA=Flow.productionLanes({...laneFixture,entities:[...laneFixture.entities,{id:'orphan-step',type:'Production Step',name:'No Part'}]},{partIds:['part-a']});
assert.equal(onlyPartA.unlinked.length,0,'Filtered Part view must not show unrelated unlinked steps');
const familyPart=Model.addEntity(Projects.create('Family field'),{type:'Part',name:'P702 MCA LH',productionFamily:'Nexlide'});
assert.equal(familyPart.productionFamily,'Nexlide','Part production family must survive ontology validation and save');
