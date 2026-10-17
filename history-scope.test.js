'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('./ontology-model'),P=require('./projects'),H=require('./history'),C=require('./cloud-domain'),{openStore}=require('./local-store'),migration=require('./update-project-types');
const SAMPLE=migration.SAMPLE_ID,PART=migration.PART;
function fixture(includeSample=true){
 const g={id:'library',name:'Global Library',version:2,status:'active',entities:[],relations:[]};
 const add=(id,data)=>{const e=M.addEntity(g,data);e.id=id;return e;};
 const link=(from,type,to,extra={})=>Object.assign(M.addRelation(g,{from,type,to,scopeProjectId:null,evidence:'Existing source reference.'}),extra);
 add(PART,{type:'Part',name:'T1-2 Uplevel',productionFamily:'LDM'});add('ls-org-lg-innotek-mexico',{type:'Organization',name:'LG Innotek Mexico'});
 for(const [i,id]of migration.STEPS.entries()){
  add(id,{type:'Production Step',name:id,processLevel:'main',productionStage:['ICT','Pressing','Connector fastening','EOL','Visual inspection','Packing'][i]});link(id,'applies_to',PART);if(i)link(migration.STEPS[i-1],'precedes',id);
 }
 for(let n=1;n<=5;n++){const id='t1-2-uplevel-press-'+n;add(id,{type:'Resource',name:id,resourceKind:'machine'});link(migration.STEPS[1],'requires',id);}
 for(const [id,kind,projectIds,role]of [
  ['shared-old','shared',[],'subject'],['ls-only','explicit_projects',['ls'],'subject'],
  ['sample-explicit','explicit_projects',[SAMPLE],'subject'],['both-explicit','explicit_projects',['ls',SAMPLE],'subject'],
  ['sample-unlinked','explicit_projects',[SAMPLE],null],['unassigned','unassigned',[],'subject'],['context-only','shared',[],'context']
 ]){
  const eventRecord=H.validateEvent({schemaVersion:1,recordClass:'business',kind:'disruption',statementMode:'reported_fact',verification:'reported',lifecycle:'active',timePrecision:'exact',importance:'normal',reportedAt:'2026-10-13T15:00:00Z',recordedAt:'2026-10-13T15:05:00Z',scope:{kind,projectIds},facets:[],observations:[],unresolved:[]});
  add(id,{type:'Event',name:id,eventRecord});if(role)link(id,'records_on',PART,{historyRole:role});
 }
 const ls={...P.create('LS','program'),id:'ls'},other={...P.create('Legacy sample','sample'),id:'legacy-sample'};
 const projects=[ls,other];if(includeSample)projects.push({...P.create('T1-2 Sample','sample'),id:SAMPLE});
 for(const p of projects)P.attachMembers(p,g,[PART]);
 return {version:2,revision:0,library:g,projects,viewSettings:{}};
}
function seed(s,w){let saved=s.load();saved.projects=w.projects.map(p=>({...p,entities:[],relations:[]}));saved=s.save(saved,null,saved.revision);saved.library=w.library;saved=s.save(saved,'library',saved.revision);for(const p of w.projects){saved.projects[saved.projects.findIndex(x=>x.id===p.id)]=p;saved=s.save(saved,p.id,saved.revision);}return saved;}
const ids=result=>result.items.map(e=>e.id).sort();
const EXPECTED=['both-explicit','sample-explicit','sample-unlinked'];

test('local list excludes subject-only shared history for explicit-only project, preserving legacy and library behavior',()=>{
 const s=openStore(':memory:');try{seed(s,fixture());const before=s.load();
  a(ids(s.history.list({scope:SAMPLE})).includes('shared-old'));
  s.putSettings(SAMPLE,'overview',{historyScope:'explicit_projects',manualNote:'Keep this note'});
  const result=s.history.list({scope:SAMPLE});a.deepEqual(ids(result),EXPECTED);a.equal(result.totalDistinct,3);a.equal(result.counts[PART].length,2);
  a.deepEqual(ids(s.history.list({scope:'ls'})),['both-explicit','ls-only','shared-old']);a.deepEqual(ids(s.history.list({scope:'legacy-sample'})),['shared-old']);a.equal(s.history.list({scope:'library'}).totalDistinct,7);
  a.deepEqual(s.load().library,before.library);a.equal(s.load().revision,before.revision);
 }finally{s.close();}
});
test('local detail applies the same guard and keeps explicitly assigned events even without a subject link',()=>{
 const s=openStore(':memory:');try{seed(s,fixture());s.putSettings(SAMPLE,'overview',{historyScope:'explicit_projects'});
  for(const id of ['shared-old','ls-only','unassigned','context-only'])a.throws(()=>s.history.detail(id,SAMPLE),/outside this scope/);
  for(const id of EXPECTED)a.equal(s.history.detail(id,SAMPLE).event.id,id);
  a.equal(s.history.detail('shared-old','ls').event.id,'shared-old');a.equal(s.history.detail('shared-old','library').event.id,'shared-old');
 }finally{s.close();}
});
test('cloud query matches local scope, pagination, counts and legacy behavior without altering source events',()=>{
 const s=openStore(':memory:');try{seed(s,fixture());s.putSettings(SAMPLE,'overview',{historyScope:'explicit_projects'});const w=s.load(),before=JSON.stringify(w);
  for(const scope of [SAMPLE,'ls','legacy-sample','library'])a.deepEqual(C.query(w,{scope}),s.history.list({scope}));
  a.deepEqual(ids(C.query(w,{scope:SAMPLE})),EXPECTED);
  const page=C.query(w,{scope:SAMPLE,limit:1});a.equal(page.totalDistinct,3);a.equal(page.items.length,1);a.equal(page.nextCursor,'1');a.equal(C.query(w,{scope:SAMPLE,cursor:page.nextCursor,limit:1}).items.length,1);
  a.equal(JSON.stringify(w),before);
 }finally{s.close();}
});
test('cloud detail guard rejects shared and other-project events before source lookup and preserves explicit membership',()=>{
 const w=fixture();w.viewSettings[SAMPLE]={overview:{historyScope:'explicit_projects'}};a.equal(typeof C.detail,'function');const before=JSON.stringify(w);
 for(const id of ['shared-old','ls-only','unassigned','context-only'])a.throws(()=>C.detail(w,id,SAMPLE),/outside this scope/);
 for(const id of EXPECTED){const result=C.detail(w,id,SAMPLE);a.equal(result.event.id,id);a(result.links.every(r=>r.from===id||r.to===id));}
 a.equal(C.detail(w,'shared-old','ls').event.id,'shared-old');a.equal(C.detail(w,'shared-old','library').event.id,'shared-old');a.throws(()=>C.detail(w,'context-only','ls'),/outside this scope/);a.throws(()=>C.detail(w,'missing',SAMPLE),/outside this scope/);a.throws(()=>C.detail(w,'shared-old','missing'),/outside this scope/);
 a.equal(JSON.stringify(w),before);
});
test('migration sets only T1-2 overview history scope, preserves manual settings and remains idempotent',()=>{
 const w=fixture(false);w.viewSettings={ls:{overview:{manualNote:'LS unchanged'}},[SAMPLE]:{overview:{manualNote:'Keep sample note'},production:{folded:true}}};const events=structuredClone(w.library.entities.filter(e=>e.type==='Event'));
 a.equal(migration.applyWorkspace(w),true);a.equal(w.viewSettings[SAMPLE].overview.historyScope,'explicit_projects');a.equal(w.viewSettings[SAMPLE].overview.manualNote,'Keep sample note');a.equal(w.viewSettings[SAMPLE].production.folded,true);a.deepEqual(w.viewSettings.ls,{overview:{manualNote:'LS unchanged'}});a(!w.viewSettings['legacy-sample']);a.deepEqual(w.library.entities.filter(e=>e.type==='Event'),events);
 const saved=JSON.stringify(w);a.equal(migration.applyWorkspace(w),false);a.equal(JSON.stringify(w),saved);
 for(const historyScope of ['shared',null,'']){w.viewSettings[SAMPLE].overview.historyScope=historyScope;const manual=JSON.stringify(w);a.equal(migration.applyWorkspace(w),false);a.equal(JSON.stringify(w),manual);}
 delete w.viewSettings[SAMPLE].overview.historyScope;const graph=JSON.stringify(w.projects);a.equal(migration.applyWorkspace(w),true);a.equal(w.viewSettings[SAMPLE].overview.historyScope,'explicit_projects');a.equal(JSON.stringify(w.projects),graph);a.equal(migration.applyWorkspace(w),false);
});
test('migration persists missing scope for seeded sample, retains manual settings and retries without writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-history-scope-')),file=path.join(dir,'db.sqlite');let s;
 try{s=openStore(file);seed(s,fixture(false));s.putSettings('ls','overview',{manualNote:'Keep LS note'});const events=s.exportAll().entities.filter(e=>e.type==='Event');s.close();s=null;
  await migration.migrate(file,{apply:true});s=openStore(file);let w=s.load();a.equal(w.viewSettings[SAMPLE]?.overview.historyScope,'explicit_projects');a.deepEqual(ids(s.history.list({scope:SAMPLE})),EXPECTED);a.deepEqual(s.exportAll().entities.filter(e=>e.type==='Event'),events);
  s.putSettings(SAMPLE,'overview',{manualNote:'Manual project note'});const revision=w.revision;s.close();s=null;
  const upgrade=await migration.migrate(file,{apply:true});a.equal(upgrade.changed,true);a(upgrade.revision>revision);s=openStore(file);w=s.load();a.deepEqual(w.viewSettings[SAMPLE].overview,{manualNote:'Manual project note',historyScope:'explicit_projects'});a.equal(w.viewSettings.ls.overview.manualNote,'Keep LS note');s.close();s=null;
  const before=fs.readFileSync(file);a.equal((await migration.migrate(file,{apply:true})).changed,false);a.deepEqual(fs.readFileSync(file),before);
  s=openStore(file);s.putSettings(SAMPLE,'overview',{historyScope:'shared',manualNote:'User override'});s.close();s=null;const manual=fs.readFileSync(file);a.equal((await migration.migrate(file,{apply:true})).changed,false);a.deepEqual(fs.readFileSync(file),manual);
 }finally{s?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
