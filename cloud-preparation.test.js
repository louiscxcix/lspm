'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('./sample-preparation'),V=require('./project-view'),Types=require('./project-types');
const source=fs.readFileSync(require.resolve('./cloud-api'),'utf8').replaceAll('import(','sdk(');
const owner=()=>({uid:'owner',email:'delaserre1314@gmail.com',emailVerified:true});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const stamp={toDate:()=>new Date('2026-10-14T18:00:00Z')};
function fixture({viewerAdapter=false}={}){
 const p={id:'p',name:'Sample P',projectType:'sample',status:'active',entities:[{id:'part-p',type:'Part',name:'Model P'},{id:'part-p2',type:'Part',name:'Alternate P'}],relations:[]};
 const q={id:'q',name:'Sample Q',projectType:'sample',status:'active',entities:[{id:'part-q',type:'Part',name:'Model Q'}],relations:[]};
 const docs=new Map([['privatePM/seed',{version:'v1',format:'scoped-v1'}],['privatePM/state',{revision:0}],... [p,q].map(project=>['projectCatalog/'+project.id,{name:project.name,status:'active',projectType:'sample',locked:true,viewerUid:'viewer-'+project.id,loginAlias:'viewer-'+project.id+'@example.test'}])]);
 const auth={currentUser:owner(),async authStateReady(){}};
 const waits=[],reads=[],commits=[],staged=[],refreshes=[],invalidations=[];let runtime;
 const snap=(id,value)=>({id,exists:()=>value!==undefined,data:()=>value});
 async function intercept(kind,ref){const wait=waits.find(w=>!w.used&&w.kind===kind&&w.matches(ref));if(wait){wait.used=true;wait.started.resolve();await wait.release.promise;}}
 const hold=(kind,matches=()=>true)=>{const wait={kind,matches,used:false,started:deferred(),release:deferred()};waits.push(wait);return wait;};
 function seed(version='v1',scope='p',{revision=7,sheets=[],marker=version+'-'+scope}={}){
  const project=scope==='p'?p:q,other=scope==='p'?q:p;
  const data={workspace:{revision,projects:[structuredClone(project),{...structuredClone(other),entities:[],relations:[],viewPending:true}],library:{id:'library',entities:[...structuredClone(project.entities),{id:'marker-'+marker,type:'Requirement',name:marker}],relations:[]},viewSettings:{}},production:{[scope]:{samplePreparation:structuredClone(sheets)}},eventDetails:{}};
  docs.set('privatePM/seed/versions/'+version+'/scopes/'+scope,{payload:JSON.stringify(data)});return data;
 }
 seed();seed('v1','q');
 const F={getFirestore:()=>({}),doc:(_, ...parts)=>parts.join('/'),collection:(_, ...parts)=>parts.join('/'),query:ref=>ref,orderBy:()=>null,serverTimestamp:()=>stamp,
  async getDoc(ref){reads.push(ref);const value=docs.get(ref);await intercept('read',ref);return snap(ref,value);},
  async getDocs(ref){reads.push(ref);const rows=[...docs].filter(([key])=>ref==='projectCatalog'?key.startsWith('projectCatalog/'):ref==='privatePM/records/uploads'?key.startsWith(ref+'/'):false).map(([key,value])=>snap(key.split('/').at(-1),value));await intercept('scan',ref);return {docs:rows};},
  async runTransaction(_,run){await intercept('transaction','begin');const writes=[];await run({async get(ref){const value=docs.get(ref);await intercept('transaction-read',ref);return snap(ref,value);},set(ref,value){staged.push([ref,value]);writes.push([ref,value]);}});for(const [ref,value]of writes)docs.set(ref,value);commits.push(writes);}
 };
 const A={getAuth:()=>auth,async signOut(){auth.currentUser=null;},async signInWithEmailAndPassword(){auth.currentUser=owner();return {user:auth.currentUser};}};
 const window={LocalAPI:{load:async()=>({revision:0,projects:[],library:{entities:[],relations:[]},access:{enabled:true,mode:'basic'}})},SamplePreparation:S,ProjectTypes:Types,ProjectView:V,EventHistory:require('./history'),CloudDomain:require('./cloud-domain'),ProjectAccessCloud:{install(g){runtime=g;}}};
 const context={window,location:{hash:'#/projects/p'},structuredClone,TextEncoder,localStorage:{removeItem(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},crypto:{subtle:{async digest(...args){await intercept('digest','SHA-256');return require('node:crypto').webcrypto.subtle.digest(...args);}}},sdk:async url=>url.includes('firebase-app')?{initializeApp:()=>({})}:url.includes('firebase-auth')?A:F};
 if(viewerAdapter)vm.runInNewContext(fs.readFileSync(require.resolve('./project-access-cloud'),'utf8'),context);
 vm.runInNewContext(source,context);
 if(!viewerAdapter){window.LocalAPI.projectRefresh=async id=>{refreshes.push(id);};window.LocalAPI.invalidateProjectCatalog=()=>invalidations.push(true);}
 const api=window.LocalAPI;
 const input=(revision=7,project=p)=>({projectId:project.id,revision,sheet:S.create(project,{partId:project.entities[0].id,runName:'Trial '+project.id})});
 const uploads=()=>[...docs].filter(([ref])=>ref.startsWith('privatePM/records/uploads/')).map(([ref,value])=>({ref,...value,payload:JSON.parse(value.payload)}));
 return {p,q,docs,auth,api,window,context,hold,seed,input,uploads,reads,commits,staged,refreshes,invalidations,get runtime(){return runtime;}};
}

test('preparation saves append private immutable versions, reload latest and preserve other production data',async()=>{
 const f=fixture();let w=await f.api.load();const initial=f.input(w.revision),before=structuredClone(initial);
 const first=await f.api.samplePreparationSave(initial);a.equal(first.sheet.version,1);a.equal(first.workspace.revision,8);a.deepEqual(initial,before);
 const edited=structuredClone(first.sheet);Object.assign(edited.answers[0],{status:'verified',note:'Drawing revision B reviewed.'});
 const second=await f.api.samplePreparationSave({projectId:'p',revision:8,sheet:edited});a.equal(second.sheet.version,2);a.equal(second.workspace.revision,9);
 w=await f.api.load();const listed=await f.api.samplePreparationList('p');a.ok(Array.isArray(listed));a.equal(listed.length,1);a.equal(listed[0].version,2);a.equal(listed[0].answers[0].status,'verified');a.equal(w.library.entities.some(e=>e.type==='Event'),false);
 const uploads=f.uploads();a.equal(uploads.length,2);a.ok(uploads.every(row=>row.payload.kind==='sample-preparation'&&row.payload.projectId==='p'&&row.ownerUid==='owner'));
 a.equal(uploads[0].payload.sheet.answers[0].status,'unknown');a.equal(uploads[0].payload.recordRevision,8);a.equal(uploads[1].payload.recordRevision,9);a.deepEqual(f.refreshes,['p','p']);
 listed[0].answers[0].note='Local mutation';a.equal((await f.api.samplePreparationList('p'))[0].answers[0].note,'Drawing revision B reviewed.');
});
test('cloud replay preserves v2 PDF metadata and legacy v1 question identity',async()=>{
 const f=fixture();await f.api.load();const input=f.input();Object.assign(input.sheet,{sampleDate:'2026-10-15',sampleQuantity:120,memo:'Preflight review only.'});
 await f.api.samplePreparationSave(input);await f.api.load();let list=await f.api.samplePreparationList('p');a.equal(list[0].sampleQuantity,120);a.equal(list[0].memo,'Preflight review only.');a.equal(list[0].answers.length,15);
 const legacy={...f.input(8).sheet,id:'legacy-cloud-run',templateVersion:'sample-preparation-v1',version:0};delete legacy.profile;legacy.answers=legacy.answers.filter(x=>x.questionId!=='closeout');
 await f.api.samplePreparationSave({projectId:'p',revision:8,sheet:legacy});await f.api.load();list=await f.api.samplePreparationList('p');
 a.equal(list.find(s=>s.id==='legacy-cloud-run').answers.length,14);a.equal(list.find(s=>s.id==='legacy-cloud-run').profile,undefined);a.equal(f.uploads().length,2);
});
test('cloud v3 preserves preparation and planned dates and replays old v2 without upgrading its answers',async()=>{
 const f=fixture();await f.api.load();const input=f.input();Object.assign(input.sheet,{preparationDate:'2026-10-15',sampleDate:'2026-10-18'});
 await f.api.samplePreparationSave(input);await f.api.load();const fresh=(await f.api.samplePreparationList('p'))[0];
 a.equal(fresh.templateVersion,'sample-preparation-v3');a.equal(fresh.preparationDate,'2026-10-15');a.equal(fresh.sampleDate,'2026-10-18');
 const old={...f.input(8).sheet,id:'old-v2',templateVersion:'sample-preparation-v2'};delete old.preparationDate;
 const saved=await f.api.samplePreparationSave({projectId:'p',revision:8,sheet:old});const prior=JSON.stringify(f.uploads().find(r=>r.payload.sheet.id==='old-v2'));
 await f.api.load();const list=await f.api.samplePreparationList('p');a.equal(list.find(s=>s.id==='old-v2').templateVersion,'sample-preparation-v2');a.equal(S.questions(saved.sheet)[1].question.includes('BOM'),true);
 a.equal(JSON.stringify(f.uploads().find(r=>r.payload.sheet.id==='old-v2')),prior);
});
test('preparation rejects stale input and server CAS without appending or changing revision',async()=>{
 const f=fixture();await f.api.load();await a.rejects(()=>f.api.samplePreparationSave(f.input(6)),/STALE_REVISION/);
 f.docs.set('privatePM/state',{revision:1});await a.rejects(()=>f.api.samplePreparationSave(f.input()),/STALE_REVISION/);a.equal(f.uploads().length,0);a.equal(f.staged.length,0);a.equal(f.docs.get('privatePM/state').revision,1);
});
test('preparation rejects stale per-sheet version and immutable run/model identity',async()=>{
 const f=fixture();await f.api.load();const input=f.input(),saved=await f.api.samplePreparationSave(input);
 await a.rejects(()=>f.api.samplePreparationSave({...input,revision:8}),/SHEET.*VERSION|VERSION.*CONFLICT/);
 for(const patch of [{partId:'part-p2'},{runName:'Different run'},{templateVersion:'future'}])await a.rejects(()=>f.api.samplePreparationSave({projectId:'p',revision:8,sheet:{...saved.sheet,...patch}}),/identity|template/i);
 a.equal(f.uploads().length,1);a.equal(f.docs.get('privatePM/state').revision,1);
});
test('preparation rejects invalid evidence and archived samples before writing',async()=>{
 const f=fixture();await f.api.load();const input=f.input();input.sheet.answers[0].status='verified';await a.rejects(()=>f.api.samplePreparationSave(input),/evidence/i);a.equal(f.staged.length,0);
 const archived=fixture();archived.p.status='archived';archived.seed();await archived.api.load();await a.rejects(()=>archived.api.samplePreparationSave(archived.input()),/active|archived/i);a.equal(archived.staged.length,0);
});
test('non-owner and unverified owner cannot list/save preparation or save project type',async()=>{
 for(const user of [null,{uid:'viewer',email:'viewer@example.test',emailVerified:true},{...owner(),emailVerified:false}]){
  const f=fixture();await f.api.load();f.auth.currentUser=user;
  await a.rejects(()=>f.api.samplePreparationList('p'));await a.rejects(()=>f.api.samplePreparationSave(f.input()));await a.rejects(()=>f.api.projectTypeSave({projectId:'p',revision:7,projectType:'npi'}));a.equal(f.staged.length,0);
 }
});
test('project viewer reads only its published preparation and is denied both save methods',async()=>{
 const f=fixture({viewerAdapter:true}),sheet={...f.input().sheet,version:1};f.docs.set('projectViews/p',{payload:await V.encode(V.publish(f.p,{samplePreparation:[S.sanitize(sheet)]}))});f.auth.currentUser={uid:'viewer-p',email:'viewer-p@example.test',emailVerified:true};
 const w=await f.api.load();a.equal(w.access.mode,'project');a.equal((await f.api.samplePreparationList('p'))[0].version,1);
 await a.rejects(()=>f.api.samplePreparationList('q'),/scope/i);await a.rejects(()=>f.api.samplePreparationSave(f.input()),/조회 전용/);await a.rejects(()=>f.api.projectTypeSave({projectId:'p',revision:7,projectType:'npi'}),/조회 전용/);a.equal(f.staged.length,0);
});
test('project type save preserves catalog credentials and returns refreshed type/revision',async()=>{
 const f=fixture();await f.api.load();const before=structuredClone(f.docs.get('projectCatalog/p')),w=await f.api.projectTypeSave({projectId:'p',revision:7,projectType:'npi'});
 a.equal(w.projects.find(p=>p.id==='p').projectType,'npi');a.equal(w.revision,8);a.equal(f.docs.get('privatePM/state').revision,1);a.equal(f.invalidations.length,1);
 const profile=f.docs.get('projectCatalog/p');for(const key of ['locked','viewerUid','loginAlias','name','status'])a.equal(profile[key],before[key]);a.equal(f.uploads().length,0);
});
test('project type validation, workspace CAS and server CAS never partially write',async()=>{
 const f=fixture();await f.api.load();await a.rejects(()=>f.api.projectTypeSave({projectId:'p',revision:7,projectType:'bogus'}),/type/i);
 await a.rejects(()=>f.api.projectTypeSave({projectId:'p',revision:6,projectType:'npi'}),/STALE_REVISION/);
 f.docs.set('privatePM/state',{revision:1});await a.rejects(()=>f.api.projectTypeSave({projectId:'p',revision:7,projectType:'npi'}),/STALE_REVISION/);a.equal(f.staged.length,0);a.equal(f.docs.get('projectCatalog/p').projectType,'sample');
});
test('changing sample project type still reloads retained checksheets without partial success',async()=>{
 const f=fixture();await f.api.load();await f.api.samplePreparationSave(f.input());
 const result=await Promise.allSettled([f.api.projectTypeSave({projectId:'p',revision:8,projectType:'npi'})]);
 a.equal(f.docs.get('projectCatalog/p').projectType,'npi');a.equal(f.docs.get('privatePM/state').revision,2);
 a.equal(result[0].status,'fulfilled','Changing type must not commit then fail while replaying the existing preparation upload: '+(result[0].reason?.message||''));
 a.equal(result[0].value.projects.find(p=>p.id==='p').projectType,'npi');a.equal(f.uploads().length,1);
});
test('logout during preparation hashing prevents staging or committing the old save',async()=>{
 const f=fixture();await f.api.load();const hold=f.hold('digest'),saving=f.api.samplePreparationSave(f.input()),settled=Promise.allSettled([saving]);await hold.started.promise;
 await f.window.PublicMenuAccess('logout');hold.release.resolve();const [result]=await settled;
 a.equal(f.staged.length,0,'No private upload/state writes may be staged after logout');a.equal(f.uploads().length,0);a.equal(result.status,'rejected');
});
test('logout and same-owner login still invalidate a preparation save from the old session',async()=>{
 const f=fixture();await f.api.load();const hold=f.hold('digest'),saving=f.api.samplePreparationSave(f.input()),settled=Promise.allSettled([saving]);await hold.started.promise;
 await f.window.PublicMenuAccess('logout');await f.window.PublicMenuAccess('login',{password:'fixture-only'});hold.release.resolve();const [result]=await settled;
 a.equal(f.staged.length,0,'Restoring the same owner must not revive a save captured before logout');a.equal(f.uploads().length,0);a.equal(result.status,'rejected');
});
test('logout during project type transaction reads prevents old catalog/state writes',async()=>{
 const f=fixture();await f.api.load();const hold=f.hold('transaction-read',ref=>ref==='privatePM/state'),saving=f.api.projectTypeSave({projectId:'p',revision:7,projectType:'npi'}),settled=Promise.allSettled([saving]);await hold.started.promise;
 await f.window.PublicMenuAccess('logout');hold.release.resolve();const [result]=await settled;
 a.equal(f.staged.length,0,'No catalog/state writes may be staged after logout');a.equal(f.docs.get('projectCatalog/p').projectType,'sample');a.equal(result.status,'rejected');
});
test('scope/version change while preparation hashes cannot reuse the newer global CAS revision',async()=>{
 const f=fixture();await f.api.load();const hold=f.hold('digest'),saving=f.api.samplePreparationSave(f.input()),settled=Promise.allSettled([saving]);await hold.started.promise;
 f.docs.set('privatePM/state',{revision:1});f.seed('v2','q',{revision:20});f.docs.set('privatePM/seed',{version:'v2',format:'scoped-v1'});await f.runtime.reload('q');hold.release.resolve();const [result]=await settled;
 a.equal(f.staged.length,0,'A stale save must compare its captured revision, not the newly loaded global cloudRevision');a.equal(result.status,'rejected');a.equal(f.uploads().length,0);
});
test('late old scope list returns its requested sheets without reading the newer scope globals',async()=>{
 const f=fixture(),sheetP={...f.input().sheet,version:1},sheetQ={...f.input(7,f.q).sheet,version:1};f.seed('v1','p',{sheets:[sheetP]});f.seed('v1','q',{sheets:[sheetQ]});
 const hold=f.hold('scan',ref=>ref==='privatePM/records/uploads'),old=f.api.samplePreparationList('p'),settled=Promise.allSettled([old]);await hold.started.promise;await f.runtime.reload('q');hold.release.resolve();
 const [result]=await settled;if(result.status==='fulfilled')a.deepEqual(Array.from(result.value,s=>s.id),[sheetP.id],'An old p read must use its loaded p snapshot, never seed.production from current q');else a.match(result.reason.message,/access|scope|stale|supersed|changed/i);
 a.equal(f.runtime.workspace().library.entities.some(e=>e.id==='marker-v1-q'),true,'Late p response must not replace active q');
 a.equal((await f.api.samplePreparationList('q'))[0].id,sheetQ.id);
});
test('logout during a cold private scope read rejects its response and clears current state',async()=>{
 const f=fixture(),hold=f.hold('read',ref=>ref.endsWith('/scopes/p')),loading=f.api.load(),settled=Promise.allSettled([loading]);await hold.started.promise;
 await f.window.PublicMenuAccess('logout');hold.release.resolve();const [result]=await settled;a.equal(result.status,'rejected');a.equal(f.runtime.workspace(),null);a.equal(f.staged.length,0);
});
test('late older seed manifest cannot clear a completed newer version from current state',async()=>{
 const f=fixture(),hold=f.hold('read',ref=>ref==='privatePM/seed');
 const loading=f.api.load(),settled=Promise.allSettled([loading]);await hold.started.promise;
 f.seed('v2','q',{revision:20});f.docs.set('privatePM/seed',{version:'v2',format:'scoped-v1'});await f.runtime.reload('q');a.equal(f.runtime.workspace().revision,20);
 hold.release.resolve();await settled;
 a.ok(f.runtime.workspace(),'Late v1 manifest must not clear current v2 state');a.equal(f.runtime.workspace().revision,20);a.equal(f.runtime.workspace().library.entities.some(e=>e.id==='marker-v2-q'),true);
});
test('cached reload cannot return private state after owner auth changes while metadata is pending',async()=>{
 const f=fixture();await f.api.load();const hold=f.hold('read',ref=>ref==='privatePM/state'),loading=f.api.load(),settled=Promise.allSettled([loading]);await hold.started.promise;
 f.auth.currentUser={uid:'viewer-p',email:'viewer-p@example.test',emailVerified:true};hold.release.resolve();const [result]=await settled;
 a.equal(result.status,'rejected','The cached-current fast path must recheck auth before returning private state');a.equal(f.staged.length,0);
});
test('external baseline publication without state revision still blocks a stale checksheet save',async()=>{
 const f=fixture();await f.api.load();f.docs.set('privatePM/seed',{version:'v2',format:'scoped-v1'});
 await a.rejects(()=>f.api.samplePreparationSave(f.input()),/STALE_REVISION/);a.equal(f.staged.length,0);
});
