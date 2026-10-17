'use strict';

async function verifyBackend({baseUrl='https://ahzpuefosoajwwgbfhng.supabase.co',origin='https://louiscxcix.github.io',fetchImpl=globalThis.fetch,attempts=5,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const endpoint=baseUrl+'/functions/v1/ontology/api/health';
  let failure='No response.';
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const response=await fetchImpl(endpoint,{headers:{Origin:origin},signal:AbortSignal.timeout(15000)});
      const body=await response.json().catch(()=>({}));
      if(response.status===401&&body.error==='Sign in to open your workspace.'){
        if(response.headers.get('Access-Control-Allow-Origin')!==origin)throw Error('The deployed function does not allow the frontend origin.');
        const publicResponse=await fetchImpl(baseUrl+'/functions/v1/ontology/api/public/health',{headers:{Origin:origin},signal:AbortSignal.timeout(15000)});
        const publicBody=await publicResponse.json().catch(()=>({}));
        if(publicResponse.status!==200||publicBody.ok!==true||publicBody.readOnly!==true)throw Error('The public workspace is not ready.');
        const preflight=await fetchImpl(endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'},signal:AbortSignal.timeout(15000)});
        if(preflight.status!==204||preflight.headers.get('Access-Control-Allow-Origin')!==origin)throw Error('Frontend CORS preflight was rejected.');
        console.log('Public workspace and database reads are ready; private endpoints require authentication.');
        console.log('Authenticated database write verification still requires an editor sign-in.');
        return;
      }
      failure='Expected the application authentication response; received HTTP '+response.status+'.';
    }catch(error){failure=error.message;}
    if(attempt+1<attempts)await pause(2000);
  }
  throw Error('Supabase release check failed: '+failure+' Frontend publication stopped.');
}
if(require.main===module)verifyBackend().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verifyBackend};
