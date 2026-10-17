const{test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function loadingFixture(hash='#/projects',payload=null){
 const p=require('./projects').create('LS'),V=require('./project-view'),reads=[],auth={currentUser:null};let remembered=p.id,fail=false,now=1000;
 const rows=[{id:p.id,name:'LS',status:'active',locked:false}],snap=x=>({exists:()=>!!x,data:()=>x});
 const F={doc:(_,c,id)=>c+'/'+id,getDoc:async ref=>{reads.push(ref);return snap(ref.startsWith('projectCatalog/')?rows.find(r=>r.id===ref.split('/')[1]):{payload:payload||JSON.stringify(V.publish({...p,id:ref.split('/')[1]}, {}, {}))});},getDocs:async()=>{reads.push('catalog');if(fail){fail=false;throw Error('offline');}return{docs:rows.map(r=>({id:r.id,data:()=>r}))};}};
 const window={LocalAPI:{load:async()=>({access:{mode:'basic'},projects:[]})},ProjectView:V,PublicMenuAccess:async()=>{}};
 const context={window,location:{hash},sessionStorage:{getItem:()=>remembered,setItem:(_,v)=>remembered=v,removeItem:()=>remembered=null},structuredClone,Date:{now:()=>now}};
 vm.runInNewContext(fs.readFileSync('./project-access-cloud.js','utf8'),context);window.ProjectAccessCloud.install({ready:Promise.resolve({F,auth,db:{}})});
 return{api:window.LocalAPI,window,reads,auth,rows,context,p,failNext:()=>fail=true,advance:()=>now+=31000};
}
test('list load does not hydrate remembered project',async()=>{
 const f=loadingFixture();await f.api.load();a.deepEqual(f.reads,['catalog']);
});
test('detail load selects URL project instead of remembered project',async()=>{
 const f=loadingFixture('#/projects/other');f.rows.push({id:'other',name:'Other',status:'active',locked:false});await f.api.load();a(f.reads.includes('projectViews/other'));a(!f.reads.includes('projectViews/'+f.p.id));
});
test('catalog shares concurrent requests and expires',async()=>{
 const f=loadingFixture();await Promise.all([f.api.projectCatalog(),f.api.projectCatalog()]);a.equal(f.reads.length,1);await f.api.projectCatalog();a.equal(f.reads.length,1);f.advance();await f.api.projectCatalog();a.equal(f.reads.length,2);
});
test('failed catalog remains retryable',async()=>{
 const f=loadingFixture();f.failNext();await a.rejects(f.api.projectCatalog(),/offline/);await f.api.projectCatalog();a.equal(f.reads.length,2);
});
test('logout and identity change invalidate metadata',async()=>{
 const f=loadingFixture();await f.api.projectCatalog();await f.window.PublicMenuAccess('logout');await f.api.projectCatalog();a.equal(f.reads.length,2);f.auth.currentUser={uid:'viewer'};await f.api.projectCatalog();a.equal(f.reads.length,3);
});
test('locked detail returns pending catalog so existing password dialog can open',async()=>{
 const f=loadingFixture();Object.assign(f.rows[0],{locked:true,viewerUid:'authorized-viewer'});f.context.location.hash='#/projects/'+f.p.id;const w=await f.api.load();a.equal(w.projects[0].viewPending,true);a(!f.reads.some(r=>r.startsWith('projectViews/')));
});
test('owner opens pending project through private loader, not sanitized viewer',async()=>{
 const f=loadingFixture();f.auth.currentUser={email:'delaserre1314@gmail.com',emailVerified:true};
 let reloads=0;f.window.ProjectAccessCloud.install({ready:Promise.resolve({auth:f.auth}),reload:async()=>{reloads++;return{access:{mode:'owner'}};}});
 const w=await f.api.projectOpen(f.p.id);a.equal(w.access.mode,'owner');a.equal(reloads,1);a.equal(f.reads.length,0);
});
test('scoped project reader decodes large compressed views and remains read-only',async()=>{
 const V=require('./project-view'),view={schemaVersion:1,project:{id:'large',name:'Large',entities:Array.from({length:6000},(_,i)=>({id:'p'+i,type:'Part',name:'PCB '+i,context:'Confirmed context '.repeat(20)})),relations:[]},production:{hourly:[{partId:'p0',actual:123}],progress:{rows:[],snapshots:[]}},settings:{}};
 const f=loadingFixture('#/projects/large',await V.encode(view));f.rows.push({id:'large',name:'Large',status:'active',locked:false});const w=await f.api.load();a.equal(w.projects[0].entities.length,6000);a.equal(w.access.mode,'project');a.equal((await f.api.hourlyList('large'))[0].actual,123);await a.rejects(f.api.hourlySave({}),/조회/);await a.rejects(f.api.hourlyList('other'),/scope/i);
});
for(const password of ['test-password','0000'])test('project password '+password.length+' characters creates scoped viewer without replacing owner; viewer writes denied',async()=>{
 const P=require('./projects'),V=require('./project-view'),p=P.create('SMT'),auth={currentUser:{uid:'owner'}},docs=new Map(),calls=[];
 const snap=x=>({exists:()=>x!=null,data:()=>x});const F={doc:(_,collection,id)=>collection+'/'+id,getDoc:async ref=>snap(docs.get(ref)),getDocs:async()=>({docs:[...docs].filter(([k])=>k.startsWith('projectCatalog/')).map(([k,data])=>({id:k.split('/')[1],data:()=>data}))}),serverTimestamp:()=>new Date(),runTransaction:async(_,fn)=>fn({get:async ref=>snap(docs.get(ref)),set:(ref,data)=>docs.set(ref,data)})};docs.set('privatePM/state',{revision:0});
 let w={revision:1,projects:[p],viewSettings:{},library:{entities:[],relations:[]}};const A={getAuth:app=>app.secondary?{currentUser:null}:auth,createUserWithEmailAndPassword:async(_,alias,password)=>{calls.push({alias,password});return{user:{uid:'viewer'}};},signOut:async()=>{},signInWithEmailAndPassword:async(_,alias,credential)=>{a.equal(alias,calls[0].alias);a.equal(credential,calls[0].password);a(credential.length>=6);auth.currentUser={uid:'viewer'};}};
 const window={LocalAPI:{load:async()=>w,hourlyList:async()=>[],progressList:async()=>({rows:[],snapshots:[]}),wipList:async()=>({counts:[],snapshots:[]}),staffingList:async()=>[],productionStaffingList:async()=>[]},ProjectView:V,ProjectStore:P,ProjectPassword:require('./project-password'),HourlyProduction:require('./hourly')};
 const c={F,A,App:{initializeApp:()=>({secondary:true}),deleteApp:async()=>{}},app:{options:{}},db:{},auth},context={window,structuredClone,crypto:require('node:crypto').webcrypto,TextEncoder,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
 vm.runInNewContext(fs.readFileSync('./project-access-cloud.js','utf8'),context);window.ProjectAccessCloud.install({ready:Promise.resolve(c),owner:async()=>{if(auth.currentUser.uid!=='owner')throw Error('Owner required');return c;},workspace:()=>w,revision:()=>0,reload:async()=>w});
 await window.LocalAPI.projectCatalog();await window.LocalAPI.projectAccessSave({projectId:p.id,password});a.equal((await window.LocalAPI.projectCatalog())[0].locked,true);a.equal(auth.currentUser.uid,'owner');a.equal(docs.get('projectCatalog/'+p.id).viewerUid,'viewer');a(!JSON.stringify([...docs.values()]).includes(password));
 await window.LocalAPI.projectLogin(p.id,password);const view=await window.LocalAPI.projectOpen(p.id);a.equal(view.access.mode,'project');await a.rejects(()=>window.LocalAPI.hourlySave({}),/조회/);await a.rejects(()=>window.LocalAPI.projectAccessSave({projectId:p.id,password:'another-password'}),/Owner/);a.equal((await window.LocalAPI.hourlyList(p.id)).length,0);
});
