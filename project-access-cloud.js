(function(root){
 root.ProjectAccessCloud={install(g){
  const api=root.LocalAPI,load=api.load,methods={};let view=null,catalog=null;
  const reader=()=>view&&view.project.id,deny=async()=>{throw Error('프로젝트 조회 전용입니다. 저장은 내 전용에서만 가능합니다.');};
  const metadata=async()=>{
   const c=await g.ready,key=JSON.stringify([c.auth.currentUser?.uid,c.auth.currentUser?.email]);
   if(!catalog||catalog.key!==key||catalog.expires<=Date.now()){
    const entry={key,expires:Infinity};catalog=entry;
    entry.promise=(async()=>{try{const rows=await c.F.getDocs(c.F.collection?c.F.collection(c.db,'projectCatalog'):'projectCatalog');entry.expires=Date.now()+30000;return rows.docs.map(d=>({id:d.id,...d.data()}));}catch(e){if(catalog===entry)catalog=null;throw e;}})();
   }
   return structuredClone(await catalog.promise);
  };
  api.projectCatalog=metadata;
  api.invalidateProjectCatalog=()=>{catalog=null;};
  api.projectRefresh=async id=>{const c=await g.owner(),profile=await c.F.getDoc(c.F.doc(c.db,'projectCatalog',id));if(!profile.exists())return;const w=g.workspace(),p=w.projects.find(p=>p.id===id);if(!p)throw Error('Unknown project.');const [hourly,progress,wip,staffing,productionStaffing,samplePreparation]=await Promise.all([methods.hourlyList(id),methods.progressList(id),methods.wipList(id),methods.staffingList(id),methods.productionStaffingList(id),methods.samplePreparationList?.(id)||[]]);const production={hourly,progress,wip:wip||{counts:[],snapshots:[]},staffing,productionStaffing,samplePreparation},payload=await root.ProjectView.encode(root.ProjectView.publish(p,production,w.viewSettings?.[id]||{}));await c.F.runTransaction(c.db,async t=>{const current=await t.get(c.F.doc(c.db,'privatePM','state'));if((current.exists()?current.data().revision:0)!==g.revision())throw Error('STALE_REVISION');t.set(c.F.doc(c.db,'projectViews',id),{payload,updatedAt:c.F.serverTimestamp()});});};
  api.projectOpen=async id=>{
   const c=await g.ready;if(c.auth.currentUser?.email==='delaserre1314@gmail.com'&&c.auth.currentUser.emailVerified){view=null;root.PUBLIC_READ_ONLY=false;return structuredClone(await g.reload(id));}const profile=await c.F.getDoc(c.F.doc(c.db,'projectCatalog',id));if(!profile.exists())throw Error('프로젝트 공개 설정을 확인하세요.');
   const data=profile.data();if(data.locked&&c.auth.currentUser?.uid!==data.viewerUid)throw Error('PROJECT_PASSWORD_REQUIRED');
   const saved=await c.F.getDoc(c.F.doc(c.db,'projectViews',id));if(!saved.exists())throw Error('프로젝트 조회 데이터가 준비되지 않았습니다.');
   view=await root.ProjectView.decode(saved.data().payload);if(view.project.id!==id)throw Error('Project scope mismatch.');if(data.projectType)view.project.projectType=data.projectType;root.PUBLIC_READ_ONLY=true;sessionStorage.setItem('pm-view-project',id);
   const w=root.ProjectView.workspace(view);if(!data.locked&&view.project.name==='LS')w.access.mode='basic';w.projects.push(...(await metadata()).filter(p=>p.id!==id&&p.status==='active').map(p=>({id:p.id,name:p.name,status:p.status,projectType:p.projectType,entities:[],relations:[],viewPending:true,locked:p.locked})));return w;
  };
  api.projectLogin=async(id,password)=>{const c=await g.ready,profile=await c.F.getDoc(c.F.doc(c.db,'projectCatalog',id));if(!profile.exists()||!profile.data().locked)throw Error('프로젝트 잠금 설정이 없습니다.');try{await c.A.signInWithEmailAndPassword(c.auth,profile.data().loginAlias,root.ProjectPassword(id,password));}catch{throw Error('비밀번호가 맞지 않거나 연결할 수 없습니다.');}return api.projectOpen(id);};
  api.projectAccessSave=async({projectId,password='',newProject=null})=>{
   const c=await g.owner();if(!g.workspace())await g.reload();const w=g.workspace(),p=newProject||w.projects.find(p=>p.id===projectId);if(!p||p.id!==projectId)throw Error('프로젝트를 확인하세요.');
   if(password)root.ProjectPassword(projectId,password);
   if(newProject){root.ProjectStore.validate(p);if(p.entities.length||p.relations.length||w.projects.some(x=>x.id===p.id))throw Error('새 빈 프로젝트만 생성할 수 있습니다.');}
   const production={hourly:newProject?[]:await methods.hourlyList(p.id),progress:newProject?{rows:[],snapshots:[]}:await methods.progressList(p.id),wip:newProject?{counts:[],snapshots:[]}:await methods.wipList(p.id)||{counts:[],snapshots:[]},staffing:newProject?[]:await methods.staffingList(p.id),productionStaffing:newProject?[]:await methods.productionStaffingList(p.id),samplePreparation:newProject?[]:await methods.samplePreparationList?.(p.id)||[]};
   const projected=root.ProjectView.publish(p,production,w.viewSettings?.[p.id]||{features:root.HourlyProduction.defaults(p)}),payload=await root.ProjectView.encode(projected);
   let viewerUid='',loginAlias='';if(password){const app=c.App.initializeApp(c.app.options,'viewer-'+crypto.randomUUID()),secondary=c.A.getAuth(app);try{loginAlias='viewer-'+crypto.randomUUID()+'@pm-view.invalid';viewerUid=(await c.A.createUserWithEmailAndPassword(secondary,loginAlias,root.ProjectPassword(projectId,password))).user.uid;}finally{await c.A.signOut(secondary);await c.App.deleteApp(app);}}
   const state=c.F.doc(c.db,'privatePM','state');await c.F.runTransaction(c.db,async t=>{const meta=await t.get(state);if((meta.exists()?meta.data().revision:0)!==g.revision())throw Error('STALE_REVISION');t.set(c.F.doc(c.db,'projectCatalog',p.id),{name:p.name,status:p.status,...(p.projectType?{projectType:p.projectType}:{}),locked:!!password,viewerUid,loginAlias,updatedAt:c.F.serverTimestamp()});t.set(c.F.doc(c.db,'projectViews',p.id),{payload,updatedAt:c.F.serverTimestamp()});t.set(state,{revision:g.revision()+1,updatedAt:c.F.serverTimestamp()});});
   catalog=null;return g.reload();
  };
  for(const key of ['hourlyList','progressList','wipList','staffingList','productionStaffingList','samplePreparationList']){methods[key]=api[key];api[key]=async(id,...args)=>{if(reader()){if(id!==reader())throw Error('Project scope denied');return structuredClone(view.production[{hourlyList:'hourly',progressList:'progress',wipList:'wip',staffingList:'staffing',productionStaffingList:'productionStaffing',samplePreparationList:'samplePreparation'}[key]]||[]);}return methods[key](id,...args);};}
  for(const key of ['save','hourlySave','hourlyRateSave','progressSave','samplePreparationSave','projectTypeSave','staffingSave','productionStaffingSave','featureSave','wipImport','wipPreview','historySource','historyAction','extract','copilot','mapAssistant','keepChange','revertChange']){const previous=api[key];api[key]=(...args)=>reader()?deny():previous(...args);}
  for(const key of ['hourlyRateSave','hourlySave','progressSave']){const save=api[key];api[key]=async input=>{const result=await save(input);try{await api.projectRefresh(input.projectId);}catch{result.viewPublishError=true;}return result;};}
  const historyQuery=api.historyQuery,historyJobs=api.historyJobs;api.historyQuery=q=>reader()?Promise.resolve({items:[],counts:{},priorities:{},totalDistinct:0,unmatchedCount:0}):historyQuery(q);api.historyJobs=scope=>reader()?Promise.resolve([]):historyJobs(scope);
  api.load=async()=>{
   const c=await g.ready,id=typeof location==='undefined'?null:location.hash.match(/^#\/projects\/([^/?]+)/)?.[1];view=null;
   if(c.auth.currentUser?.email!=='delaserre1314@gmail.com'&&id){try{return await api.projectOpen(id);}catch(e){if(e.message!=='PROJECT_PASSWORD_REQUIRED')throw e;}}
   if(c.auth.currentUser?.email==='delaserre1314@gmail.com')sessionStorage.removeItem('pm-view-project');
   const w=await load();if(w.access?.mode!=='owner'||w.catalogOnly)w.projects=(await metadata()).filter(p=>p.status==='active').map(p=>({id:p.id,name:p.name,status:p.status,projectType:p.projectType,version:2,entities:[],relations:[],viewPending:true,locked:p.locked}));return w;
  };
  const logout=root.PublicMenuAccess;root.PublicMenuAccess=async(action,input)=>{if(action==='logout'){view=null;catalog=null;sessionStorage.removeItem('pm-view-project');}return logout(action,input);};
 }};
})(window);
