(function(root){
  const OWNER='delaserre1314@gmail.com',base={...root.LocalAPI};root.CLOUD_BACKEND=true;root.CLOUD_OWNER_LOGIN=true;
  const ready=(async()=>{
    const v='11.10.0',[App,A,F]=await Promise.all([import('https://www.gstatic.com/firebasejs/'+v+'/firebase-app.js'),import('https://www.gstatic.com/firebasejs/'+v+'/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/'+v+'/firebase-firestore.js')]);
    const app=App.initializeApp({apiKey:'REMOVED_GOOGLE_API_KEY',authDomain:'ontho-166a6.firebaseapp.com',projectId:'ontho-166a6',appId:'1:857703572607:web:8c8f4b81fa9ebfe57d4b4a'}),auth=A.getAuth(app),db=F.getFirestore(app);
    await auth.authStateReady();return {App,A,F,auth,db,app};
  })();
  let seed=null,seedVersion='',current=null,logs=[],hourlyLogs=[],preparationRecords=[],cloudRevision=0,seedInfo=null,currentScope='',generation=0,loadSequence=0;
  const scopeCache=new Map(),detailCache=new Map(),inflight=new Map();
  const requestedScope=()=>typeof location==='undefined'?'library':location.hash.match(/^#\/projects\/([^/?]+)/)?.[1]||'library';
  const isOwner=u=>u?.email===OWNER&&u.emailVerified;
  async function owner(){const c=await ready;if(!isOwner(c.auth.currentUser))throw Error('내 전용 비밀번호로 로그인하세요.');return c;}
  const session=c=>({uid:c.auth.currentUser?.uid,generation});
  function assertSession(c,s){if(s.generation!==generation||!isOwner(c.auth.currentUser)||c.auth.currentUser.uid!==s.uid)throw Error('Access changed. Reload this page.');}
  function assertWrite(c,s){assertSession(c,s);if(seedVersion!==s.version||currentScope!==s.scope||cloudRevision!==s.cloudRevision||current?.revision!==s.revision)throw Error('STALE_REVISION');}
  async function seedData(c,scope=requestedScope(),s=session(c)){
    const ref=c.F.doc(c.db,'privatePM','seed'),m=await c.F.getDoc(ref);if(!m.exists())throw Error('Private database seed not ready.');const info=m.data();
    assertSession(c,s);
    const key=info.version+'|'+(info.format==='scoped-v1'?scope:'legacy');
    if(!scopeCache.has(key)){const promise=(async()=>{if(info.format==='scoped-v1'){const saved=await c.F.getDoc(c.F.doc(c.db,'privatePM','seed','versions',info.version,'scopes',scope));if(saved.exists())return root.ProjectView.decode(saved.data().payload);if(scope!=='library'){const d=await c.F.getDoc(c.F.doc(c.db,'projectViews',scope));if(d.exists()){const v=await root.ProjectView.decode(d.data().payload);if(v.project.id!==scope)throw Error('Project scope mismatch.');return {workspace:{...root.ProjectView.workspace(v),revision:0,library:{id:'library',entities:v.project.entities,relations:v.project.relations}},production:{[scope]:v.production},eventDetails:{}};}}throw Error('Private project scope not ready.');}const chunks=await c.F.getDocs(c.F.collection(ref,'versions',info.version,'chunks'));return JSON.parse(chunks.docs.sort((a,b)=>a.id.localeCompare(b.id)).map(d=>d.data().text).join(''));})();scopeCache.set(key,promise);promise.catch(()=>{if(scopeCache.get(key)===promise)scopeCache.delete(key);});}
    const data=await scopeCache.get(key);assertSession(c,s);return {data,info};
  }
  async function reload(scope=requestedScope()){
    const c=await owner(),uid=c.auth.currentUser.uid,key=uid+'|'+scope;if(inflight.has(key))return inflight.get(key);
    const s=session(c),sequence=++loadSequence,guard=()=>{assertSession(c,s);if(sequence!==loadSequence)throw Error('Scope request superseded.');},task=(async()=>{const [loaded,meta]=await Promise.all([seedData(c,scope,s),c.F.getDoc(c.F.doc(c.db,'privatePM','state'))]),{data,info}=loaded,revision=meta.exists()?meta.data().revision:0;
    guard();if(current&&seedVersion===info.version&&cloudRevision===revision&&currentScope===scope)return current;
    const records=await c.F.getDocs(c.F.query(c.F.collection(c.db,'privatePM','records','uploads'),c.F.orderBy('createdAt','asc')));
    guard();
    const next=structuredClone(data.workspace),nextLogs=[],nextHourly=[],nextPreparation=[];
    if(root.ProjectAccessCloud){const catalog=await c.F.getDocs(c.F.collection(c.db,'projectCatalog'));for(const d of catalog.docs){const profile=d.data(),p=next.projects.find(p=>p.id===d.id);if(p){if(profile.projectType)p.projectType=profile.projectType;continue;}if(info.format==='scoped-v1'){next.projects.push({id:d.id,name:profile.name,status:profile.status,projectType:profile.projectType,version:2,entities:[],relations:[],viewPending:true});continue;}const saved=await c.F.getDoc(c.F.doc(c.db,'projectViews',d.id));if(saved.exists()){const view=await root.ProjectView.decode(saved.data().payload);next.projects.push(view.project);next.viewSettings||={};next.viewSettings[d.id]=view.settings;}}}
    for(const d of records.docs){const s=d.data(),payload=JSON.parse(s.payload),p=next.projects.find(p=>p.id===(next.projectAliases?.[payload.projectId]||payload.projectId));if(!p)throw Error('Cloud record project missing.');if(p.viewPending)continue;const recordedAt=s.createdAt.toDate().toISOString();
      if(payload.kind==='sample-preparation'){
        const sheet=root.SamplePreparation.validate({...p,projectType:'sample'},payload.sheet);if(!Number.isSafeInteger(payload.recordRevision)||payload.recordRevision<1||sheet.version<1)throw Error('Invalid checksheet revision.');nextPreparation.push({...sheet,projectId:p.id,recordedAt,recordRevision:payload.recordRevision});
      }else if(payload.kind==='hourly-rate'){
        const rate=root.HourlyProduction.rate(p,payload.rate);if(!Number.isSafeInteger(payload.recordRevision)||payload.recordRevision<1)throw Error('Invalid model time revision.');next.viewSettings||={};next.viewSettings[p.id]||={};(next.viewSettings[p.id].hourlyRates||=[]).push({...rate,recordedAt,recordRevision:payload.recordRevision});
      }else if(payload.kind==='hourly'){
        if(!Number.isSafeInteger(payload.recordRevision)||payload.recordRevision<1)throw Error('Invalid hourly revision.');
        const rows=root.HourlyProduction.validate(p,payload.rows).map((r,i)=>({...r,id:'cloud-hourly-'+d.id+'-'+i,recordedAt,recordRevision:payload.recordRevision,sourceId:'cloud-hourly-source-'+d.id,...(typeof payload.rows[i].supersedesId==='string'?{supersedesId:payload.rows[i].supersedesId}:{})}));
        nextHourly.push({projectId:p.id,rows});
      }else nextLogs.push({...root.CloudDomain.upload(p,{...payload,projectId:p.id},recordedAt,d.id),id:d.id});
    }
    for(const record of nextLogs){next.library.entities.push(record.event);next.library.relations.push(...record.links);}next.revision=data.workspace.revision+revision;next.access={enabled:true,mode:'owner',projectId:next.projects.find(p=>p.name==='LS')?.id||''};next.pendingChange=null;guard();if(seedVersion!==info.version){detailCache.clear();if(scopeCache.size>32)scopeCache.clear();}seedVersion=info.version;seedInfo=info;seed=data;cloudRevision=revision;currentScope=scope;current=next;logs=nextLogs;hourlyLogs=nextHourly;preparationRecords=nextPreparation;return next;})();inflight.set(key,task);try{return await task;}finally{if(inflight.get(key)===task)inflight.delete(key);}
  }
  root.PublicMenuAccess=async(action,input={})=>{
    const c=await ready;
    if(action==='logout'){generation++;await c.A.signOut(c.auth);seed=null;current=null;scopeCache.clear();detailCache.clear();inflight.clear();logs=[];hourlyLogs=[];preparationRecords=[];return;}
    try{
      if(action==='reset'){await c.A.sendPasswordResetEmail(c.auth,OWNER,{url:'https://louis-lgls-pm.web.app/'});return {message:'비밀번호 설정 안내를 delaserre1314@gmail.com으로 요청했습니다. 메일함·스팸함을 확인하세요.'};}
      if(action!=='login')throw Error('지원하지 않는 접속 요청입니다.');
      if(typeof input.password!=='string'||input.password.length<6||input.password.length>256)throw Error('비밀번호는 6자 이상 입력하세요.');
      const result=await c.A.signInWithEmailAndPassword(c.auth,OWNER,input.password);
      if(!isOwner(result.user)){await c.A.signOut(c.auth);throw Error('허용된 계정: '+OWNER);}
      return {mode:'owner'};
    }catch(e){const messages={'auth/invalid-credential':'비밀번호가 맞지 않습니다. 처음이라면 비밀번호 설정을 누르세요.','auth/wrong-password':'비밀번호가 맞지 않습니다.','auth/user-not-found':'비밀번호 설정을 먼저 진행하세요.','auth/too-many-requests':'시도가 너무 많습니다. 잠시 후 다시 시도하세요.','auth/operation-not-allowed':'비밀번호 로그인이 아직 활성화되지 않았습니다.','auth/network-request-failed':'연결을 확인하고 다시 시도하세요.'};throw Error(messages[e.code]||e.message);}
  };
  const api=root.LocalAPI;
  api.samplePreparationList=async id=>{await owner();if(!current||current.projects.find(p=>p.id===id)?.viewPending)await reload(id);if(currentScope!==id&&seedInfo?.format==='scoped-v1')throw Error('Scope changed. Reload this project.');return structuredClone(root.SamplePreparation.latest([...(seed.production[id]?.samplePreparation||[]),...preparationRecords.filter(r=>r.projectId===id)]));};
  api.samplePreparationSave=async input=>{
    const c=await owner();if(!current)await reload(input.projectId);if(input.revision!==current.revision)throw Error('STALE_REVISION');const request={...session(c),version:seedVersion,scope:currentScope,revision:current.revision,cloudRevision},p=current.projects.find(p=>p.id===input.projectId);if(!p||p.status==='archived'||p.viewPending)throw Error('Choose an active sample project.');
    const checked=root.SamplePreparation.validate(p,input.sheet),old=(await api.samplePreparationList(p.id)).find(s=>s.id===checked.id);assertWrite(c,request);if((old?.version||0)!==checked.version)throw Error('STALE_SHEET_VERSION');if(old&&['partId','runName','templateVersion'].some(k=>old[k]!==checked[k]))throw Error('Run/model/template identity cannot change. Create a new run.');
    const sheet={...checked,version:checked.version+1},payload=JSON.stringify({kind:'sample-preparation',projectId:p.id,recordRevision:current.revision+1,sheet});if(new TextEncoder().encode(payload).length>500000)throw Error('Checksheet exceeds 500 KB.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join(''),ref=c.F.doc(c.db,'privatePM','records','uploads',hash),state=c.F.doc(c.db,'privatePM','state');
    assertWrite(c,request);await c.F.runTransaction(c.db,async t=>{const [saved,meta,baseline]=await Promise.all([t.get(ref),t.get(state),t.get(c.F.doc(c.db,'privatePM','seed'))]);assertWrite(c,request);if(!baseline.exists()||baseline.data().version!==request.version)throw Error('STALE_REVISION');if(saved.exists())return;if((meta.exists()?meta.data().revision:0)!==request.cloudRevision)throw Error('STALE_REVISION');t.set(ref,{schemaVersion:1,ownerUid:request.uid,payload,createdAt:c.F.serverTimestamp()});t.set(state,{revision:request.cloudRevision+1,updatedAt:c.F.serverTimestamp()});});assertSession(c,request);const result={workspace:await reload(p.id),sheet};try{await api.projectRefresh(p.id);}catch{result.viewPublishError=true;}return result;
  };
  api.projectTypeSave=async({projectId,projectType,revision})=>{const c=await owner();if(!current)await reload(projectId);root.ProjectTypes.validate(projectType);if(!projectType||revision!==current.revision)throw Error('STALE_REVISION');const request={...session(c),version:seedVersion,scope:currentScope,revision,cloudRevision},ref=c.F.doc(c.db,'projectCatalog',projectId),state=c.F.doc(c.db,'privatePM','state');await c.F.runTransaction(c.db,async t=>{const [profile,meta,baseline]=await Promise.all([t.get(ref),t.get(state),t.get(c.F.doc(c.db,'privatePM','seed'))]);assertWrite(c,request);if(!baseline.exists()||baseline.data().version!==request.version)throw Error('STALE_REVISION');if(!profile.exists())throw Error('Project catalog missing.');if((meta.exists()?meta.data().revision:0)!==request.cloudRevision)throw Error('STALE_REVISION');t.set(ref,{...profile.data(),projectType,updatedAt:c.F.serverTimestamp()});t.set(state,{revision:request.cloudRevision+1,updatedAt:c.F.serverTimestamp()});});assertSession(c,request);api.invalidateProjectCatalog?.();return reload(projectId);};
  api.hourlyRateSave=async input=>{
    const c=await owner();if(!current)await reload();if(input.revision!==current.revision)throw Error('STALE_REVISION');const p=current.projects.find(p=>p.id===input.projectId),rate=root.HourlyProduction.rate(p,input),payload=JSON.stringify({kind:'hourly-rate',projectId:p.id,rate,recordRevision:current.revision+1});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join(''),ref=c.F.doc(c.db,'privatePM','records','uploads',hash),state=c.F.doc(c.db,'privatePM','state');
    await c.F.runTransaction(c.db,async t=>{const [old,meta]=await Promise.all([t.get(ref),t.get(state)]);if(old.exists())return;if((meta.exists()?meta.data().revision:0)!==cloudRevision)throw Error('STALE_REVISION');t.set(ref,{schemaVersion:1,ownerUid:c.auth.currentUser.uid,payload,createdAt:c.F.serverTimestamp()});t.set(state,{revision:cloudRevision+1,updatedAt:c.F.serverTimestamp()});});return {workspace:await reload()};
  };
  api.hourlyList=async id=>{await owner();if(!current)await reload();return structuredClone([...(seed.production[id]?.hourly||[]),...hourlyLogs.filter(l=>l.projectId===id).flatMap(l=>l.rows)]);};
  api.hourlySave=async input=>{
    const c=await owner();if(!current)await reload();if(input.revision!==current.revision)throw Error('STALE_REVISION');
    const p=current.projects.find(p=>p.id===input.projectId);if(!p)throw Error('Unknown project.');
    if(typeof(input.text||'')!=='string'||(input.text||'').length>100000)throw Error('입력 원문을 확인하세요.');
    const rows=root.HourlyProduction.changes(await api.hourlyList(p.id),root.HourlyProduction.validate(p,input.rows),input.confirmCorrections===true);
    if(!rows.length)return {workspace:structuredClone(current),duplicate:true};
    const payload=JSON.stringify({kind:'hourly',projectId:p.id,recordRevision:current.revision+1,text:input.text||'',rows});if(new TextEncoder().encode(payload).length>500000)throw Error('Upload exceeds 500 KB. Split this input.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join(''),ref=c.F.doc(c.db,'privatePM','records','uploads',hash),state=c.F.doc(c.db,'privatePM','state');
    await c.F.runTransaction(c.db,async t=>{const [old,meta]=await Promise.all([t.get(ref),t.get(state)]);if(old.exists())return;if((meta.exists()?meta.data().revision:0)!==cloudRevision)throw Error('STALE_REVISION');t.set(ref,{schemaVersion:1,ownerUid:c.auth.currentUser.uid,payload,createdAt:c.F.serverTimestamp()});t.set(state,{revision:cloudRevision+1,updatedAt:c.F.serverTimestamp()});});
    return {workspace:await reload()};
  };
  api.featureSave=async()=>{await owner();throw Error('기능 설정은 현재 로컬 DB에서 변경하세요.');};
  api.load=async()=>{const c=await ready;root.PUBLIC_READ_ONLY=!isOwner(c.auth.currentUser);if(!root.PUBLIC_READ_ONLY){if(typeof location!=='undefined'&&(!location.hash||location.hash==='#/projects')){const w=await base.load();w.catalogOnly=true;w.access={...w.access,mode:'owner'};return w;}return structuredClone(await reload());}localStorage.removeItem('pm-public-menu-until');return base.load();};
  api.health=async()=>({ok:true,aiConfigured:false,copilotConfigured:false,mapAssistantConfigured:isOwner((await ready).auth.currentUser)});
  let mapAI=null,mapAIBusy=false;
  api.mapAssistant=async input=>{
    const c=await owner();if(input.consent!==true)throw Error('Gemini 데이터 전송 승인이 필요합니다.');if(mapAIBusy)throw Error('AI 답변 중입니다.');
    if(!current)await reload();const scope=input.scopeId==='library'?current.library:current.projects.find(p=>p.id===input.scopeId);const context=root.MapAssistant.context(scope,input.visibleIds),body=root.MapAssistant.request(context,input);
    mapAIBusy=true;try{
      if(!mapAI){const [AI,Check]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js')]);
        Check.initializeAppCheck(c.app,{provider:new Check.ReCaptchaEnterpriseProvider('6LcVU-YtAAAAANabpTgdqmea8NkW7Oemdw8L5bqp'),isTokenAutoRefreshEnabled:true});
        mapAI={AI,ai:AI.getAI(c.app,{backend:new AI.GoogleAIBackend()})};
      }
      const model=mapAI.AI.getGenerativeModel(mapAI.ai,{model:'gemini-3.8-flash',systemInstruction:body.systemInstruction,generationConfig:body.generationConfig});
      const response=await model.generateContent({contents:body.contents});return root.MapAssistant.result(context,response.response.text());
    }catch(e){if(e.message?.includes('AI 답변 형식'))throw e;throw Error('Gemini 연결 실패: '+(e.code?.includes('appCheck')||e.code?.includes('app-check')?'브라우저 보호 검증을 완료하지 못했습니다. 새로고침 후 다시 시도하세요.':'연결 설정 또는 사용 한도를 확인하고 다시 시도하세요.'));}finally{mapAIBusy=false;}
  };
  api.historyQuery=async q=>{await owner();if(!current)await reload();return root.CloudDomain.query(current,q);};
  api.historyJobs=async()=>{await owner();return [];};
  api.historyDetail=async(id,scope='library')=>{
    const c=await owner();if(!current||scope!=='library'&&current.projects.find(p=>p.id===scope)?.viewPending)await reload(scope);
    const request=session(c),version=seedVersion,{event,links}=root.CloudDomain.detail(current,id,scope),log=logs.find(r=>r.event.id===id);
    if(log)return {event,links,sources:[{name:'Progress upload',text:log.text,metadata:{provider:'cloud-progress'}}],proposals:[]};
    if(seedInfo?.format!=='scoped-v1')return structuredClone(seed.eventDetails[id]||{event,links,sources:[],proposals:[]});
    const key=version+'|'+id;if(!detailCache.has(key)){const task=(async()=>{const d=await c.F.getDoc(c.F.doc(c.db,'privatePM','seed','versions',version,'events',id));return d.exists()?root.ProjectView.decode(d.data().payload):{event,links,sources:[],proposals:[]};})();detailCache.set(key,task);task.catch(()=>{if(detailCache.get(key)===task)detailCache.delete(key);});}
    const detail=await detailCache.get(key);assertSession(c,request);if(seedVersion!==version)throw Error('History version changed. Reload this record.');return structuredClone(detail);
  };
  api.progressList=async id=>{if(root.PUBLIC_READ_ONLY)return base.progressList(id);await owner();if(!current)await reload();const saved=structuredClone(seed.production[id]?.progress||{snapshots:[],rows:[]});for(const log of logs.filter(l=>l.projectId===id)){saved.rows.push(...log.rows);for(const unit of new Set(log.rows.map(r=>r.unit))){const r=log.rows.find(r=>r.unit===unit);saved.snapshots.push({id:r.snapshotId,capturedAt:r.capturedAt,createdAt:r.createdAt,unit,eventId:log.event.id});}}return saved;};
  api.progressSave=async input=>{const c=await owner();if(!current)await reload();if(input.revision!==current.revision)throw Error('STALE_REVISION');const p=current.projects.find(p=>p.id===input.projectId);if(!p)throw Error('Unknown project.');const checked=root.CloudDomain.upload(p,input,new Date().toISOString(),'review');const payload=JSON.stringify({projectId:p.id,text:input.text,rows:input.rows.map(r=>({partId:r.partId,stepId:r.stepId,quantity:r.quantity,unit:r.unit,capturedAt:r.capturedAt,...(Number.isSafeInteger(r.row)?{row:r.row}:{}),...(Number.isSafeInteger(r.column)?{column:r.column}:{}),...(r.code?{code:r.code}:{})}))});if(new TextEncoder().encode(payload).length>500000)throw Error('Upload exceeds 500 KB. Split this input.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join(''),ref=c.F.doc(c.db,'privatePM','records','uploads',hash),state=c.F.doc(c.db,'privatePM','state');await c.F.runTransaction(c.db,async t=>{const [old,meta]=await Promise.all([t.get(ref),t.get(state)]);if(old.exists())return;if((meta.exists()?meta.data().revision:0)!==cloudRevision)throw Error('STALE_REVISION');t.set(ref,{schemaVersion:1,ownerUid:c.auth.currentUser.uid,payload,createdAt:c.F.serverTimestamp()});t.set(state,{revision:cloudRevision+1,updatedAt:c.F.serverTimestamp()});});const workspace=await reload();return {workspace,eventIds:['cloud-event-'+hash]};};
  for(const key of ['wipList','staffingList','productionStaffingList'])api[key]=async(id,...args)=>{if(root.PUBLIC_READ_ONLY)return base[key](id,...args);await owner();if(!current||current.projects.find(p=>p.id===id)?.viewPending)await reload(id);const p=seed.production[id];return key==='wipList'?(args[0]?p?.history?.[args[0]]:p?.wip):p?.[key==='staffingList'?'staffing':'productionStaffing']||[];};
  api.catalog=()=>base.load();
  root.ProjectAccessCloud?.install({ready,owner,workspace:()=>current,revision:()=>cloudRevision,reload});
})(window);
