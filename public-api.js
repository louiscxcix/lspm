(function(root){
  const snapshot=fetch('public-workspace.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Published workspace unavailable.');return response.json();});
  const readOnly=async()=>{throw Error('Public view is read-only. Edit the local app and publish again.');};
  root.PUBLIC_READ_ONLY=true;
  const api={};for(const key of Object.keys(root.LocalAPI))api[key]=readOnly;
  api.load=async()=>structuredClone((await snapshot).workspace);
  api.health=async()=>({ok:true,aiConfigured:false});
  api.settings=async(projectId,viewKey,data)=>data;
  api.changes=async()=>({changes:[],more:false});
  api.wipList=async(id,snapshotId='')=>{const p=(await snapshot).production[id];return snapshotId?p?.history[snapshotId]||p?.wip:p?.wip;};
  api.staffingList=async id=>(await snapshot).production[id]?.staffing||[];
  api.productionStaffingList=async id=>(await snapshot).production[id]?.productionStaffing||[];
  root.LocalAPI=api;
  const style=document.createElement('style');style.textContent='#projectForm,#addFromLibrary,#renameProject,#archiveProject,#openDailyInput,#lensAddUpdate,#savedChangeReview,[data-tab="Input"]{display:none!important}';document.head.appendChild(style);
})(window);
