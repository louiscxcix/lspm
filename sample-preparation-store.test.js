'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');

function fixture(t){
 a.ok(fs.existsSync(path.join(__dirname,'sample-preparation-store.js')),'Sample Preparation store exists');
 const S=require('./sample-preparation'),db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO meta VALUES('revision','0');
 CREATE TABLE projects(id TEXT PRIMARY KEY);INSERT INTO projects VALUES('p'),('other');
 CREATE TABLE change_sets(id TEXT PRIMARY KEY,scope TEXT,recorded_at TEXT NOT NULL,revision INTEGER NOT NULL,items_json TEXT NOT NULL,rows_json TEXT NOT NULL,acknowledged_at TEXT,reverted_at TEXT,revert_of TEXT);
 CREATE TABLE entities(id TEXT PRIMARY KEY,data_json TEXT);INSERT INTO entities VALUES('gate','{"status":"unknown"}'),('event','{"type":"Event"}');
 CREATE TABLE relations(id TEXT PRIMARY KEY,data_json TEXT);INSERT INTO relations VALUES('route','{"type":"precedes"}');
 CREATE TABLE wip_counts(quantity INTEGER);INSERT INTO wip_counts VALUES(7);`);
 const p={id:'p',name:'Sample',projectType:'sample',status:'active',entities:[{id:'part-a',type:'Part'},{id:'ref-a',type:'Requirement'}],relations:[]},other={...p,id:'other'};
 const load=()=>({revision:Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value),projects:structuredClone([p,other]),library:{entities:db.prepare('SELECT * FROM entities').all(),relations:db.prepare('SELECT * FROM relations').all()}});
 const store=require('./sample-preparation-store')(db,load),sheet=S.create(p,{partId:'part-a',runName:'Trial 1'});
 return {S,db,p,other,load,store,sheet};
}
test('factory initializes additively and lists only the requested sample project',t=>{
 const {db,store,load}=fixture(t);a.deepEqual(store.list('p'),[]);a.throws(()=>store.list('missing'),/project/i);
 require('./sample-preparation-store')(db,load);a.equal(load().revision,0);a.equal(db.prepare('SELECT quantity FROM wip_counts').get().quantity,7);
});
test('v3 preparation and future sample dates round-trip separately while existing v2 snapshots stay byte-identical',t=>{
 const {db,store,sheet,S}=fixture(t),legacy={...sheet,id:'legacy-v2',templateVersion:'sample-preparation-v2',sampleDate:'2026-10-15'};delete legacy.preparationDate;
 store.save({projectId:'p',revision:0,sheet:legacy});
 const before=db.prepare('SELECT data_json FROM sample_preparation_records WHERE sheet_id=?').get(legacy.id).data_json;
 Object.assign(sheet,{preparationDate:'2026-10-15',sampleDate:'2026-10-18'});
 const out=store.save({projectId:'p',revision:1,sheet});a.equal(out.sheet.templateVersion,'sample-preparation-v3');
 const fresh=store.list('p').find(s=>s.id===sheet.id);a.equal(fresh.preparationDate,'2026-10-15');a.equal(fresh.sampleDate,'2026-10-18');a.equal(S.sanitize(fresh).preparationDate,'2026-10-15');
 a.equal(db.prepare('SELECT data_json FROM sample_preparation_records WHERE sheet_id=?').get(legacy.id).data_json,before);
});
test('save appends immutable snapshots, increments sheet/workspace versions and writes only technical audit',t=>{
 const {db,store,load,sheet}=fixture(t),before=load(),input=structuredClone(sheet),first=store.save({projectId:'p',revision:0,sheet});
 a.equal(first.workspace.revision,1);a.equal(first.sheet.version,1);a.deepEqual(sheet,input);
 const edit=structuredClone(first.sheet);Object.assign(edit.answers[0],{status:'verified',note:'Drawing revision B checked.'});
 const second=store.save({projectId:'p',revision:1,sheet:edit});a.equal(second.sheet.version,2);a.equal(second.workspace.revision,2);
 const rows=store.list('p');a.equal(rows.length,1);a.equal(rows[0].answers[0].status,'verified');a.deepEqual(store.list('other'),[]);
 const history=db.prepare('SELECT data_json FROM sample_preparation_records ORDER BY revision').all().map(r=>JSON.parse(r.data_json));a.equal(history.length,2);a.equal(history[0].answers[0].status,'unknown');a.equal(history[1].answers[0].status,'verified');
 a.deepEqual(load().library,before.library);a.deepEqual(load().projects,before.projects);a.equal(db.prepare('SELECT quantity FROM wip_counts').get().quantity,7);
 const audits=db.prepare('SELECT * FROM change_sets ORDER BY revision').all();a.equal(audits.length,2);a.equal(audits[1].scope,'p');a.ok(audits.every(x=>x.acknowledged_at));a.match(audits[1].items_json,/Sample preparation/);
 a.equal(JSON.parse(audits[1].rows_json)[0].table,'sample_preparation_records');a.equal(db.prepare('SELECT COUNT(*) AS n FROM entities').get().n,2);
});
test('workspace CAS and per-sheet version conflicts leave no partial save',t=>{
 const {db,store,sheet,load}=fixture(t),first=store.save({projectId:'p',revision:0,sheet});
 a.throws(()=>store.save({projectId:'p',revision:0,sheet:first.sheet}),/STALE_REVISION/);
 a.throws(()=>store.save({projectId:'p',revision:1,sheet}),/SHEET_VERSION_CONFLICT/);
 const future={...first.sheet,version:8};a.throws(()=>store.save({projectId:'p',revision:1,sheet:future}),/SHEET_VERSION_CONFLICT/);
 a.equal(load().revision,1);a.equal(store.list('p').length,1);a.equal(db.prepare('SELECT COUNT(*) AS n FROM change_sets').get().n,1);
});
test('saved run/model/template identity cannot be repointed across projects or models',t=>{
 const {store,sheet,p}=fixture(t),first=store.save({projectId:'p',revision:0,sheet});p.entities.push({id:'part-b',type:'Part'});
 for(const patch of [{partId:'part-b'},{runName:'Different run'},{templateVersion:'future'}])a.throws(()=>store.save({projectId:'p',revision:1,sheet:{...first.sheet,...patch}}),/identity|template/i);
 a.throws(()=>store.save({projectId:'other',revision:1,sheet:first.sheet}),/project|identity/i);a.equal(store.list('p').length,1);a.deepEqual(store.list('other'),[]);
});
test('invalid answers, non-sample and archived projects cannot save',t=>{
 const {store,sheet,p,load}=fixture(t),bad=structuredClone(sheet);bad.answers[0].status='verified';
 a.throws(()=>store.save({projectId:'p',revision:0,sheet:bad}),/evidence/i);a.equal(load().revision,0);
 p.projectType='program';a.throws(()=>store.save({projectId:'p',revision:0,sheet}),/sample/i);p.projectType='sample';p.status='archived';
 a.throws(()=>store.save({projectId:'p',revision:0,sheet}),/archived|read.only/i);a.equal(store.list('p').length,0);a.equal(load().revision,0);
});
test('audit failure rolls back record insertion and revision CAS',t=>{
 const {db,store,sheet,load}=fixture(t);db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON change_sets BEGIN SELECT RAISE(ABORT,'audit unavailable');END;");
 a.throws(()=>store.save({projectId:'p',revision:0,sheet}),/audit unavailable/);a.equal(load().revision,0);a.deepEqual(store.list('p'),[]);
});
test('a second run starts version 1 independently and never overwrites another model',t=>{
 const {S,store,sheet,p,load}=fixture(t),first=store.save({projectId:'p',revision:0,sheet});p.entities.push({id:'part-b',type:'Part'});
 const second=store.save({projectId:'p',revision:1,sheet:S.create(p,{partId:'part-b',runName:'Trial 2'})});
 a.equal(second.sheet.version,1);a.equal(S.latest(store.list('p')).length,2);a.equal(load().revision,2);
 a.throws(()=>store.save({projectId:'p',revision:2,sheet:{...S.create(p,{partId:'part-a',runName:'Unsaved'}),version:4}}),/SHEET_VERSION_CONFLICT/);
 a.equal(store.list('p')[0].id,first.sheet.id);a.equal(store.list('p').length,2);
});
test('all answered checks including P0 not applicable preserve unknown gate and existing routes/stocks',t=>{
 const {store,sheet,load,db}=fixture(t),before=load();sheet.answers.forEach(x=>Object.assign(x,{status:'verified',note:'Reviewed approved requirement.'}));
 Object.assign(sheet.answers.find(x=>x.questionId==='traceability'),{status:'not_applicable',note:'This reviewed isolated trial has no QR tracking.'});
 const result=store.save({projectId:'p',revision:0,sheet});a.equal(result.sheet.answers[4].status,'not_applicable');a.deepEqual(load().library,before.library);a.deepEqual(load().projects,before.projects);a.equal(db.prepare('SELECT quantity FROM wip_counts').get().quantity,7);
});
test('v2 print metadata and a legacy v1 sheet round-trip without rewriting old snapshots',t=>{
 const {S,store,sheet,p,db}=fixture(t);Object.assign(sheet,{sampleDate:'2026-10-15',sampleQuantity:120,memo:'Fixture confirmation pending.'});
 const saved=store.save({projectId:'p',revision:0,sheet});a.equal(saved.sheet.sampleQuantity,120);a.equal(store.list('p')[0].sampleDate,'2026-10-15');
 const legacy={id:'legacy-sheet',partId:'part-a',runName:'Legacy trial',templateVersion:'sample-preparation-v1',version:0,answers:S.QUESTIONS.map(q=>({questionId:q.id,status:'unknown',note:'',ownerId:null,referenceIds:[]}))};
 const first=store.save({projectId:p.id,revision:1,sheet:legacy});a.equal(first.sheet.answers.length,14);
 const edit={...first.sheet,sampleDate:'2026-10-14',sampleQuantity:50,memo:'Old run reviewed.'};store.save({projectId:p.id,revision:2,sheet:edit});
 const versions=db.prepare("SELECT data_json FROM sample_preparation_records WHERE sheet_id='legacy-sheet' ORDER BY version").all().map(r=>JSON.parse(r.data_json));
 a.equal(versions[0].sampleDate,undefined);a.equal(versions[1].sampleQuantity,50);a.equal(versions[1].answers.length,14);a.equal(versions[1].profile,undefined);
});
