'use strict';
function createPublicDataStore({url,apiKey,fetchImpl=globalThis.fetch}){
  const read=async(operation,project='',snapshot='',production=false)=>{
    const response=await fetchImpl(url+'/rest/v1/rpc/'+(production?'pm_public_production_read':'pm_public_read'),{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify({operation,project_id:project,...(production?{}:{snapshot_id:snapshot})}),signal:AbortSignal.timeout(15000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error('Public Data API query failed.');error.code=result.code||'PUBLIC_DATA_API_'+response.status;error.publicStage='supabase-data-api';throw error;}
    return result;
  };
  return {listProgress:project=>read('progress',project,'',true),listHourly:project=>read('hourly',project,'',true),samplePreparationList:project=>read('sample-preparation',project,'',true),load:()=>read('workspace'),health:()=>read('health'),listWip:(project,snapshot='')=>read('wip',project,snapshot),listStaffing:project=>read('staffing',project),listProductionStaffing:project=>read('production-staffing',project)};
}
module.exports={createPublicDataStore};
