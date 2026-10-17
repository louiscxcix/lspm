const Assistant=require('./map-assistant');
async function answer({scope,input,key,fetchImpl=fetch}){
 if(!key){const e=Error('Gemini 미연결: 서버 GEMINI_API_KEY를 설정하세요.');e.status=503;throw e;}
 const context=Assistant.context(scope,input.visibleIds),body=Assistant.request(context,input);
 const r=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const data=await r.json();if(!r.ok){const e=Error(r.status===429?'Gemini 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요.':'Gemini 응답 오류입니다. 연결 설정을 확인하세요.');e.status=r.status===429?429:502;throw e;}
 return Assistant.result(context,(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(''));
}
module.exports={answer};
