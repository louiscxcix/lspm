(function(root){
  const config=root.PM_SUPABASE_CONFIG,query=new URLSearchParams(location.search);
  const local=['localhost','127.0.0.1'].includes(location.hostname);
  if(!config?.publicView||query.get('edit')==='1'||(local&&!query.has('cloud')))return;
  const base=new URL(config.url);
  if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.pathname!=='/')throw Error('Invalid Supabase project URL.');
  root.PUBLIC_READ_ONLY=true;root.CLOUD_BACKEND=true;
  const badge=document.createElement('span');badge.id='storageNote';badge.textContent='Public workspace · read only';document.querySelector('.header-actions').append(badge);
  const readOnly=async()=>{throw Error('Public workspace is read-only.');};
  const request=async path=>{
    const response=await fetch(base.origin+'/functions/v1/ontology/api/public/'+path,{headers:{apikey:config.publishableKey}});
    const value=await response.json();if(!response.ok)throw Error(value.error||'Public workspace is unavailable.');return value;
  };
  const api={};for(const key of Object.keys(root.LocalAPI))api[key]=readOnly;
  Object.assign(api,{
    load:()=>request('workspace'),health:()=>request('health'),
    settings:async(_project,_view,data)=>data,
    changes:async()=>({changes:[],more:false}),
    wipList:(project,snapshot='')=>request('wip?'+new URLSearchParams({project,snapshot})),
    staffingList:project=>request('staffing?'+new URLSearchParams({project})),
    productionStaffingList:project=>request('production-staffing?'+new URLSearchParams({project})),
    progressList:project=>request('progress?'+new URLSearchParams({project})),
    hourlyList:project=>request('hourly?'+new URLSearchParams({project})),
    samplePreparationList:project=>request('sample-preparation?'+new URLSearchParams({project})),
    exportBackup:readOnly
  });
  root.LocalAPI=api;
  const style=document.createElement('style');
  style.textContent='#projectFeatures,.project-access-settings,[data-hourly-input],[data-hourly-unit-time],[data-progress-add],[data-progress-model],.wip-import,#wipSave,#wipPreviewResult,#productionLogsView,[data-production-view="Process logs"],#projectForm,#addFromLibrary,#renameProject,#archiveProject,#openDailyInput,#lensAddUpdate,#savedChangeReview,#recordsAdd,#productionConnect,#addEntityButton,#addRelationButton,#editEntity,#removeFromProject,#addProductionExcel,#addProductionLogs,#exportButton,#previewLogs,#saveLogs,#staffingForm,#productionStaffingForm,[data-tab="Input"],[data-tab="History"]{display:none!important}';
  document.head.appendChild(style);
})(window);
