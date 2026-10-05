const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {openStore} = require('./local-store.js');
const Projects = require('./projects.js');
const Model = require('./ontology-model.js');

function sharedPart(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-twin-store-'));
  const dbPath = path.join(dir, 'ontology.sqlite');
  const db = openStore(dbPath);
  t.after(() => { db.close(); fs.rmSync(dir, {recursive:true, force:true}); });
  let ws = db.load();
  ws.projects.push(Projects.create('LS'), Projects.create('Other'));
  ws = db.save(ws, null, ws.revision);
  const part = Model.addEntity(ws.library, {type:'Part', name:'G65'});
  ws = db.save(ws, 'library', ws.revision);
  for (let i=0; i<ws.projects.length; i++) {
    const project = ws.projects[i];
    project.entities.push({...part, projectId:project.id});
    ws = db.save(ws, project.id, ws.revision);
  }
  return {db, ws, part, dbPath};
}

test('fresh local database has an empty Library and no projects', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-twin-store-'));
  const db = openStore(path.join(dir, 'ontology.sqlite'));
  t.after(() => { db.close(); fs.rmSync(dir, {recursive:true, force:true}); });
  const workspace = db.load();
  assert.equal(workspace.revision, 0);
  assert.deepEqual(workspace.projects, []);
  assert.deepEqual(workspace.library.entities, []);
  assert.deepEqual(workspace.library.relations, []);
});

test('WIP upload saves dated unit counts, preserves zero, and can be reverted', t => {
  const {db,part}=sharedPart(t),ws=db.load(),projectId=ws.projects[0].id;
  const saved=db.saveWip({projectId,revision:ws.revision,capturedAt:'2026-10-03T14:00:00.000Z',filename:'mes.xlsx',sheet:'WIP',rows:[
    {row:3,column:4,code:'A1',partName:'G65',partId:part.id,stage:'ICT(LS)',quantity:15554},
    {row:3,column:5,code:'A1',partName:'G65',partId:part.id,stage:'Packing',quantity:0}
  ]});
  const result=db.listWip(projectId);
  assert.equal(result.snapshots.length,1);
  assert.equal(result.counts.length,2);
  assert.deepEqual(result.counts.map(item=>item.quantity),[15554,0]);
  assert.equal(result.counts[0].partId,part.id);
  assert.ok(saved.pendingChange.items.some(item=>item.label.includes('mes.xlsx')));
  assert.equal(db.exportAll().wipCounts.length,2);
  db.revertChange(saved.pendingChange.id,saved.revision);
  assert.deepEqual(db.listWip(projectId).snapshots,[]);
});

test('WIP upload rejects unknown Part ID and stale revision without partial save', t => {
  const {db,ws}=sharedPart(t),projectId=ws.projects[0].id;
  const input={projectId,revision:ws.revision,capturedAt:'2026-10-03T14:00:00.000Z',filename:'mes.xlsx',sheet:'WIP',rows:[
    {row:3,column:4,partName:'G65',partId:'wrong',stage:'ICT',quantity:1}
  ]};
  assert.throws(()=>db.saveWip(input),/Part mapping/);
  assert.equal(db.listWip(projectId).snapshots.length,0);
  assert.throws(()=>db.saveWip({...input,revision:ws.revision-1}),/STALE_REVISION/);
});

test('dated worker count belongs to one Part and keeps its own history', t => {
  const {db,part}=sharedPart(t),ws=db.load(),projectId=ws.projects[0].id;
  const saved=db.saveStaffing({projectId,revision:ws.revision,partId:part.id,count:8,capturedAt:'2026-10-03T14:00:00.000Z',shift:'A',basis:'observed',note:'Line lead count'});
  assert.equal(db.listStaffing(projectId)[0].count,8);
  assert.equal(db.listStaffing(projectId)[0].partId,part.id);
  assert.equal(db.exportAll().staffingCounts.length,1);
  db.revertChange(saved.pendingChange.id,saved.revision);
  assert.deepEqual(db.listStaffing(projectId),[]);
});

test('direct production worker observations stay separate by Step and machine and revert safely', t => {
  const {db,part}=sharedPart(t);let ws=db.load(),projectId=ws.projects[0].id;
  const project=ws.projects[0];
  const step=Model.addEntity(project,{type:'Production Step',name:'EOL'});
  const machine=Model.addEntity(project,{type:'Resource',name:'EOL machine',resourceKind:'machine'});
  ws=db.save(ws,projectId,ws.revision);
  assert.throws(()=>db.saveProductionStaffing({projectId,revision:ws.revision,targetId:part.id,targetType:'Part',count:2,capturedAt:'2026-10-03T14:00:00.000Z'}),/Step or Resource/);
  assert.equal(db.listProductionStaffing(projectId).length,0);
  ws=db.saveProductionStaffing({projectId,revision:ws.revision,targetId:step.id,targetType:'Production Step',count:0,capturedAt:'2026-10-03T14:00:00.000Z',shift:'A',basis:'observed',note:'No operator assigned'});
  assert.equal(db.listProductionStaffing(projectId)[0].count,0);
  assert.equal(db.listProductionStaffing(projectId)[0].targetId,step.id);
  assert.throws(()=>db.saveProductionStaffing({projectId,revision:ws.revision-1,targetId:machine.id,targetType:'Resource',count:3,capturedAt:'2026-10-03T14:00:00.000Z'}),/STALE_REVISION/);
  ws=db.saveProductionStaffing({projectId,revision:ws.revision,targetId:machine.id,targetType:'Resource',count:3,capturedAt:'2026-10-03T15:00:00.000Z',shift:'B',basis:'planned'});
  assert.equal(db.listProductionStaffing(projectId)[0].targetId,machine.id);
  assert.equal(db.exportAll().productionStaffingCounts.length,2);
  db.revertChange(ws.pendingChange.id,ws.revision);
  assert.deepEqual(db.listProductionStaffing(projectId).map(item=>item.count),[0]);
});

test('project creation review omits internal IDs and timestamps', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-twin-store-'));
  const db=openStore(path.join(dir,'ontology.sqlite'));
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  let ws=db.load();ws.projects.push(Projects.create('G65'));
  ws=db.save(ws,null,ws.revision);
  assert.deepEqual(ws.pendingChange.items[0].fields,[]);
});

test('one canonical Part can belong to two project views', t => {
  const {ws,part} = sharedPart(t);
  assert.equal(ws.library.entities.length, 1);
  assert.equal(ws.projects[0].entities[0].id, part.id);
  assert.equal(ws.projects[1].entities[0].id, part.id);
});

test('workstream membership is project-specific and accepts multiple lanes', t => {
  const {db,part}=sharedPart(t);
  let ws=db.load();
  ws.projects[0].workstreams={[part.id]:['engineering','production']};
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  assert.deepEqual(ws.projects[0].workstreams[part.id],['engineering','production']);
  assert.deepEqual(ws.projects[1].workstreams,{});
  assert.equal(db.exportAll().workstreams.length,2);
  ws.projects[0].workstreams[part.id]=['invalid'];
  assert.throws(()=>db.save(ws,ws.projects[0].id,ws.revision),/Invalid workstream/);
});

test('one saved change set reviews and reverts a project update without resetting other data', t => {
  const {db,part}=sharedPart(t);
  let ws=db.load(),project=ws.projects[0];
  db.putSettings(project.id,'overview',{search:'G65'});
  const work=Model.addEntity(project,{type:'Work Item',name:'Inspect G65'});
  const machine=Model.addEntity(project,{type:'Resource',name:'Inspection station'});
  Model.addRelation(project,{from:work.id,type:'requires',to:machine.id});
  project.workstreams={[work.id]:['quality']};
  ws=db.save(ws,project.id,ws.revision);
  const change=ws.pendingChange;
  assert.equal(change.scope,project.id);
  assert.ok(change.items.some(item=>item.label.includes('Inspect G65')));
  assert.equal(db.listChanges(project.id).changes[0].id,change.id);
  ws=db.revertChange(change.id,ws.revision);
  assert.equal(ws.projects[0].entities.some(item=>item.id===work.id),false);
  assert.equal(ws.projects[0].relations.length,0);
  assert.equal(ws.library.entities.some(item=>item.id===work.id),false);
  assert.equal(ws.projects[1].entities[0].id,part.id);
  assert.equal(ws.viewSettings[project.id].overview.search,'G65');
  assert.equal(db.listChanges(project.id).changes[1].revertedAt!==null,true);
  assert.throws(()=>db.revertChange(change.id,ws.revision),/already reviewed or reverted|latest/);
});

test('keep acknowledges latest change and stale undo cannot erase a later edit', t => {
  const {db,part,dbPath}=sharedPart(t);
  let ws=db.load(),project=ws.projects[0];
  Model.updateEntity(project,part.id,{name:'G65 revised'});
  ws=db.save(ws,project.id,ws.revision);
  const first=ws.pendingChange;
  assert.ok(first.items.some(item=>item.fields?.some(field=>field.key==='name')));
  db.keepChange(first.id);
  assert.equal(db.load().pendingChange,null);
  assert.throws(()=>db.revertChange(first.id,ws.revision),/already reviewed/);
  Model.updateEntity(ws.projects[0],part.id,{name:'G65 final'});
  ws=db.save(ws,project.id,ws.revision);
  assert.throws(()=>db.revertChange(first.id,ws.revision),/already reviewed|latest/);
  const reopened=openStore(dbPath);t.after(()=>reopened.close());
  assert.equal(reopened.listChanges(project.id).changes[0].items[0].label.includes('G65'),true);
  assert.equal(reopened.load().library.entities[0].name,'G65 final');
});

test('global Library history includes project-originated database changes', t => {
  const {db}=sharedPart(t);
  let ws=db.load();
  const project=ws.projects[0];
  Model.addEntity(project,{type:'Work Item',name:'Production review'});
  ws=db.save(ws,project.id,ws.revision);
  const globalHistory=db.listChanges('library').changes;
  assert.equal(globalHistory[0].id,ws.pendingChange.id);
  assert.equal(globalHistory[0].scope,project.id);
  assert.ok(globalHistory.some(change=>change.scope==='library'));
});

test('editing a canonical Part in one project updates every view', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  Model.updateEntity(ws.projects[0], part.id, {name:'G65 main board'});
  ws = db.save(ws, ws.projects[0].id, ws.revision);
  assert.equal(ws.library.entities[0].name, 'G65 main board');
  assert.equal(ws.projects[1].entities[0].name, 'G65 main board');
});

test('stakeholder assessment belongs only to its project', t => {
  const {db} = sharedPart(t);
  let ws = db.load();
  const person = Model.addEntity(ws.library, {type:'Person', name:'Marta', title:'Inspector'});
  ws = db.save(ws, 'library', ws.revision);
  for (let i=0; i<2; i++) {
    ws.projects[i].entities.push({...person, projectId:ws.projects[i].id});
    ws = db.save(ws, ws.projects[i].id, ws.revision);
  }
  Model.updateEntity(ws.projects[0], person.id, {power:'high', influence:'medium', currentEngagement:'neutral'});
  ws = db.save(ws, ws.projects[0].id, ws.revision);
  assert.equal(Model.byId(ws.projects[0], person.id).power, 'high');
  assert.equal(Model.byId(ws.projects[1], person.id).power, undefined);
  assert.equal(Model.byId(ws.library, person.id).power, undefined);
});

test('a reusable Production Step has project-specific schedule and status', t => {
  const {db}=sharedPart(t);
  let ws=db.load();
  const step=Model.addEntity(ws.library,{type:'Production Step',name:'EOL inspection',status:'active'});
  ws=db.save(ws,'library',ws.revision);
  for(let i=0;i<ws.projects.length;i++){const project=ws.projects[i];project.entities.push({...step,projectId:project.id});ws=db.save(ws,project.id,ws.revision);}
  Model.updateEntity(ws.projects[0],step.id,{status:'planned',plannedStart:'2026-10-05',plannedEnd:'2026-10-08'});
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  assert.equal(Model.byId(ws.projects[0],step.id).plannedStart,'2026-10-05');
  assert.equal(Model.byId(ws.projects[0],step.id).status,'planned');
  assert.equal(Model.byId(ws.projects[1],step.id).plannedStart,undefined);
  assert.equal(Model.byId(ws.projects[1],step.id).status,'active');
  assert.equal(Model.byId(ws.library,step.id).plannedStart,undefined);
  assert.equal(Model.byId(ws.library,step.id).status,'active');
  assert.equal(db.exportAll().projectSchedules.length,1);
});

test('a Production Step created inside a project enters Library without its schedule', t => {
  const {db}=sharedPart(t);
  let ws=db.load();
  const step=Model.addEntity(ws.projects[0],{type:'Production Step',name:'Router',status:'planned',forecastStart:'2026-10-11'});
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  assert.equal(Model.byId(ws.library,step.id).status,'active');
  assert.equal(Model.byId(ws.library,step.id).forecastStart,undefined);
  assert.equal(Model.byId(ws.projects[0],step.id).status,'planned');
  assert.equal(Model.byId(ws.projects[0],step.id).forecastStart,'2026-10-11');
  ws.library.entities.find(e=>e.id===step.id).due='2026-10-15';
  assert.throws(()=>db.save(ws,'library',ws.revision),/dates belong to a project/);
});

test('global relations follow shared members; project relations stay local', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  const person = Model.addEntity(ws.library, {type:'Person', name:'Buyer A'});
  const org = Model.addEntity(ws.library, {type:'Organization', name:'Supplier B'});
  Model.addRelation(ws.library, {from:person.id, type:'works_at', to:org.id});
  ws = db.save(ws, 'library', ws.revision);
  for (let i=0; i<2; i++) {
    const project = ws.projects[i];
    project.entities.push({...person,projectId:project.id}, {...org,projectId:project.id});
    ws = db.save(ws, project.id, ws.revision);
  }
  const a = ws.projects[0];
  Model.addRelation(a, {from:person.id, type:'influences', to:part.id, scopeProjectId:a.id});
  ws = db.save(ws, a.id, ws.revision);
  assert.deepEqual(ws.projects[0].relations.map(r=>r.type).sort(), ['influences','works_at']);
  assert.deepEqual(ws.projects[1].relations.map(r=>r.type), ['works_at']);
  assert.equal(ws.library.relations.length, 2);
});

test('unlinking a Part from one project preserves Library and other project', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  const projectId = ws.projects[0].id;
  ws.projects[0].entities = [];
  ws = db.save(ws, projectId, ws.revision);
  assert.deepEqual(ws.projects[0].entities, []);
  assert.equal(Model.byId(ws.projects[1], part.id).name, 'G65');
  assert.equal(Model.byId(ws.library, part.id).name, 'G65');
});

test('removing a global relation from a project updates the shared graph', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  const parent = Model.addEntity(ws.library, {type:'Part', name:'Main unit'});
  Model.addRelation(ws.library, {from:part.id,type:'part_of',to:parent.id});
  ws = db.save(ws, 'library', ws.revision);
  for (let i=0; i<2; i++) {
    ws.projects[i].entities.push({...parent,projectId:ws.projects[i].id});
    ws = db.save(ws,ws.projects[i].id,ws.revision);
  }
  assert.equal(ws.projects[0].relations.length,1);
  ws.projects[0].relations = [];
  ws = db.save(ws,ws.projects[0].id,ws.revision);
  assert.equal(ws.library.relations.length,0);
  assert.equal(ws.projects[1].relations.length,0);
});

test('stale saves are rejected without partial writes', t => {
  const {db} = sharedPart(t);
  const old = db.load();
  const current = db.load();
  Model.updateEntity(current.projects[0], current.projects[0].entities[0].id, {name:'Current'});
  const saved = db.save(current,current.projects[0].id,current.revision);
  Model.updateEntity(old.projects[1], old.projects[1].entities[0].id, {name:'Stale'});
  assert.throws(() => db.save(old,old.projects[1].id,old.revision), /STALE_REVISION/);
  assert.equal(db.load().library.entities[0].name, 'Current');
  assert.equal(db.load().revision, saved.revision);
});

test('same directed relation may be asserted independently in two projects', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  const buyer = Model.addEntity(ws.library, {type:'Person',name:'Buyer'});
  ws = db.save(ws,'library',ws.revision);
  for (let i=0; i<2; i++) {
    const project = ws.projects[i];
    project.entities.push({...buyer,projectId:project.id});
    Model.addRelation(project,{from:buyer.id,type:'influences',to:part.id,scopeProjectId:project.id});
    ws = db.save(ws,project.id,ws.revision);
  }
  assert.equal(ws.library.relations.length,2);
  Model.addEntity(ws.library,{type:'Part',name:'Another part'});
  assert.doesNotThrow(() => db.save(ws,'library',ws.revision));
});

test('stable works_at relation entered in a project is global', t => {
  const {db} = sharedPart(t);
  let ws = db.load();
  const person = Model.addEntity(ws.library,{type:'Person',name:'Alexis'});
  const org = Model.addEntity(ws.library,{type:'Organization',name:'Plant'});
  ws = db.save(ws,'library',ws.revision);
  ws.projects[0].entities.push({...person,projectId:ws.projects[0].id},{...org,projectId:ws.projects[0].id});
  Model.addRelation(ws.projects[0],{from:person.id,type:'works_at',to:org.id});
  ws = db.save(ws,ws.projects[0].id,ws.revision);
  ws.projects[1].entities.push({...person,projectId:ws.projects[1].id},{...org,projectId:ws.projects[1].id});
  ws = db.save(ws,ws.projects[1].id,ws.revision);
  assert.equal(ws.projects[1].relations[0].type,'works_at');
  assert.equal(ws.projects[1].relations[0].scopeProjectId,null);
});

test('view settings survive reopen and do not leak across projects', t => {
  const {db,dbPath} = sharedPart(t);
  const [a,b] = db.load().projects;
  db.putSettings(a.id,'production',{partId:'part-1',expandedIds:['step-1'],layers:['parts']});
  const reopened = openStore(dbPath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.load().viewSettings[a.id].production,{partId:'part-1',expandedIds:['step-1'],layers:['parts']});
  assert.equal(reopened.load().viewSettings[b.id],undefined);
});

test('Library save cannot silently drop canonical entities', t => {
  const {db} = sharedPart(t);
  const ws = db.load();
  ws.library.entities = [];
  assert.throws(() => db.save(ws,'library',ws.revision), /Global deletion requires/);
  assert.equal(db.load().library.entities.length,1);
});

test('canonical object type cannot be changed through a project payload', t => {
  const {db} = sharedPart(t);
  const ws = db.load();
  ws.projects[0].entities[0].type = 'Person';
  assert.throws(() => db.save(ws,ws.projects[0].id,ws.revision), /type cannot change/);
  assert.equal(db.load().library.entities[0].type,'Part');
});

test('canonical edit history remains visible after reload', t => {
  const {db,part} = sharedPart(t);
  let ws = db.load();
  Model.updateEntity(ws.projects[0],part.id,{name:'G65 revised'});
  ws = db.save(ws,ws.projects[0].id,ws.revision);
  assert.equal(ws.projects[0].changes.length,1);
  assert.equal(ws.projects[1].changes.length,1);
  assert.equal(db.load().library.changes.length,1);
});

test('project-owned Work Items cannot leak into a second project', t => {
  const {db} = sharedPart(t);
  let ws=db.load();
  const work=Model.addEntity(ws.projects[0],{type:'Work Item',name:'LS release',due:'2026-10-10'});
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  ws.projects[1].entities.push({...work,projectId:ws.projects[1].id});
  assert.throws(()=>db.save(ws,ws.projects[1].id,ws.revision),/project-owned/);
  assert.equal(db.load().projects[1].entities.length,1);
});

test('attaching an existing global ID cannot overwrite canonical facts', t => {
  const {db} = sharedPart(t);
  let ws=db.load();
  const newPart=Model.addEntity(ws.library,{type:'Part',name:'Original'});
  ws=db.save(ws,'library',ws.revision);
  ws.projects[0].entities.push({...newPart,name:'Tampered',projectId:ws.projects[0].id});
  assert.throws(()=>db.save(ws,ws.projects[0].id,ws.revision),/conflicts with global/);
  assert.equal(Model.byId(db.load().library,newPart.id).name,'Original');
});

test('relation ID reused from another project cannot overwrite that assertion', t => {
  const {db,part} = sharedPart(t);
  let ws=db.load();
  const person=Model.addEntity(ws.library,{type:'Person',name:'Buyer'});
  ws=db.save(ws,'library',ws.revision);
  for(let i=0;i<2;i++){ws.projects[i].entities.push({...person,projectId:ws.projects[i].id});ws=db.save(ws,ws.projects[i].id,ws.revision);}
  Model.addRelation(ws.projects[0],{from:person.id,type:'influences',to:part.id,scopeProjectId:ws.projects[0].id});
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  const first=ws.projects[0].relations[0];
  ws.projects[1].relations.push({...first,projectId:ws.projects[1].id,scopeProjectId:ws.projects[1].id});
  assert.throws(()=>db.save(ws,ws.projects[1].id,ws.revision),/Relationship belongs/);
  assert.equal(db.load().projects[0].relations[0].id,first.id);
});

test('archived project cannot accept graph edits from a direct API payload', t => {
  const {db,part}=sharedPart(t);
  let ws=db.load();
  ws.projects[0].status='archived';
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  ws.projects[0].entities.find(e=>e.id===part.id).name='Hidden edit';
  assert.throws(()=>db.save(ws,ws.projects[0].id,ws.revision),/Archived project/);
  assert.equal(Model.byId(db.load().library,part.id).name,'G65');
});

test('saving one project cannot rename another project via the payload', t => {
  const {db}=sharedPart(t);
  const ws=db.load(),other=ws.projects[1];
  other.name='Tampered';
  assert.throws(()=>db.save(ws,ws.projects[0].id,ws.revision),/outside the save scope/);
  assert.equal(db.load().projects[1].name,'Other');
});

test('global relation ID cannot be rewritten from a project with different endpoints', t => {
  const {db,part}=sharedPart(t);
  let ws=db.load();
  const parent=Model.addEntity(ws.library,{type:'Part',name:'Parent'});
  const other=Model.addEntity(ws.library,{type:'Part',name:'Other'});
  const edge=Model.addRelation(ws.library,{from:part.id,type:'part_of',to:parent.id});
  ws=db.save(ws,'library',ws.revision);
  ws.projects[0].entities.push({...parent,projectId:ws.projects[0].id},{...other,projectId:ws.projects[0].id});
  ws=db.save(ws,ws.projects[0].id,ws.revision);
  ws.projects[0].relations.find(r=>r.id===edge.id).to=other.id;
  assert.throws(()=>db.save(ws,ws.projects[0].id,ws.revision),/Global relationship/);
  assert.equal(db.load().library.relations.find(r=>r.id===edge.id).to,parent.id);
});

test('reviewed AI ontology save and ingestion status commit together', t => {
  const {db}=sharedPart(t);
  let ws=db.load();
  const draft={objects:[{candidateId:'candidate-a',type:'Person',name:'Buyer A',suggestedAction:'create'}],relationships:[]};
  const job=db.saveIngestion({filename:'note.txt',mimeType:'text/plain',content:Buffer.from('Buyer A'),draft,scope:'library'});
  Model.addEntity(ws.library,{type:'Person',name:'Buyer A'});
  ws=db.save(ws,'library',ws.revision,{jobId:job.jobId,selectedIds:['candidate-a'],draft});
  assert.equal(ws.library.entities.some(e=>e.name==='Buyer A'),true);
  assert.equal(db.exportAll().ingestionJobs[0].status,'committed');
  assert.throws(()=>db.save(ws,'library',ws.revision,{jobId:job.jobId,selectedIds:['candidate-a'],draft}),/already committed/);
});

test('invalid AI job selection rolls back ontology changes', t => {
  const {db}=sharedPart(t);
  let ws=db.load();
  const draft={objects:[{candidateId:'candidate-a',type:'Person',name:'Buyer A',suggestedAction:'create'}],relationships:[]};
  const job=db.saveIngestion({filename:'note.txt',mimeType:'text/plain',content:Buffer.from('Buyer A'),draft,scope:'library'});
  Model.addEntity(ws.library,{type:'Person',name:'Buyer A'});
  assert.throws(()=>db.save(ws,'library',ws.revision,{jobId:job.jobId,selectedIds:['unknown'],draft}),/selected candidate/);
  assert.equal(db.load().library.entities.some(e=>e.name==='Buyer A'),false);
  assert.equal(db.exportAll().ingestionJobs[0].status,'ready_for_review');
});
