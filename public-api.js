(function(root){
  const snapshot=fetch('public-workspace.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Published workspace unavailable.');return response.json();});
  const readOnly=async()=>{throw Error('Public view is read-only. Edit the local app and publish again.');};
  root.PUBLIC_READ_ONLY=true;
  // Temporary menu lock only; published snapshot data remains public.
  const unlockKey='pm-public-menu-until';
  const unlocked=()=>Number(localStorage.getItem(unlockKey)||0)>Date.now();
  root.PublicMenuAccess=async(action,input={})=>{
    if(action==='login'){
      if(input.password!=='7777')throw Error('비밀번호가 맞지 않습니다.');
      localStorage.setItem(unlockKey,String(Date.now()+30*24*60*60*1000));return {mode:'owner'};
    }
    if(action==='logout'){localStorage.removeItem(unlockKey);return {mode:'basic'};}
    throw Error('공개판 비밀번호는 배포 설정에서 관리합니다.');
  };
  const api={};for(const key of Object.keys(root.LocalAPI))api[key]=readOnly;
  api.load=async()=>{
    const workspace=structuredClone((await snapshot).workspace),mode=unlocked()?'owner':'basic';
    const ls=workspace.projects.find(p=>p.id==='project-e35a946f-5e00-42b3-a76d-7158a2f395e1')||workspace.projects.find(p=>p.name==='LS');
    workspace.access={enabled:true,mode,projectId:ls?.id||''};
    if(mode==='basic'){workspace.library={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[],changes:[]};workspace.pendingChange=null;}
    return workspace;
  };
  api.health=async()=>({ok:true,aiConfigured:false});
  api.settings=async(projectId,viewKey,data)=>data;
  api.changes=async()=>({changes:[],more:false});
  api.wipList=async(id,snapshotId='')=>{const p=(await snapshot).production[id];return snapshotId?p?.history[snapshotId]||p?.wip:p?.wip;};
  api.progressList=async id=>(await snapshot).production[id]?.progress||{snapshots:[],rows:[]};
  api.staffingList=async id=>(await snapshot).production[id]?.staffing||[];
  api.productionStaffingList=async id=>(await snapshot).production[id]?.productionStaffing||[];
  root.LocalAPI=api;
  const style=document.createElement('style');style.textContent='body:not([data-access="owner"]) :is(#projectForm,#addFromLibrary,#renameProject,#archiveProject,#openDailyInput,#lensAddUpdate,#savedChangeReview,[data-tab="Input"],#projectFeatures,[data-hourly-input]){display:none!important}body:not([data-access="owner"]) .library-link{display:none!important}';document.head.appendChild(style);
})(window);
