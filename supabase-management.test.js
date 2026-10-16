const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createManagementApi}=require('./scripts/supabase-management');

test('deployment diagnostics expose the failed stage without exposing credentials',async()=>{
  const token='a-private-token-value';
  const api=createManagementApi({project:'example',token,fetchImpl:async()=>new Response(JSON.stringify({message:'Cannot bundle entrypoint. '+token+' sbp_abcdef1234 postgresql://user:password@db.example/db'}),{status:400})});
  await assert.rejects(api('/functions/deploy?slug=ontology',{method:'POST'}),error=>{
    assert.match(error.message,/POST \/functions\/deploy.*400.*Cannot bundle entrypoint/);
    for(const secret of [token,'sbp_abcdef1234','password','user:'])assert.ok(!error.message.includes(secret));
    return true;
  });
  const denied=createManagementApi({project:'example',token,fetchImpl:async()=>new Response('Forbidden',{status:403})});
  await assert.rejects(denied('/database/query',{method:'POST'}),/403.*permission/);
});
