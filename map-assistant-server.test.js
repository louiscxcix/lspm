const {test}=require('node:test'),a=require('node:assert/strict'),{answer}=require('./map-assistant-server');
const scope={id:'library',name:'Global Library',entities:[{id:'s',name:'Router',type:'Production Step'}],relations:[]};
test('Gemini map answer sends server-side key and validates returned IDs',async()=>{
 let calls=0;const result=await answer({scope,input:{question:'Router?'},key:'private-test-key',fetchImpl:async(url,options)=>{calls++;a(url.includes('gemini-3.8-flash'));a.equal(options.headers['x-goog-api-key'],'private-test-key');a(!options.body.includes('private-test-key'));return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"answer":"Router","objectIds":["s","fake"]}'}]}}]})};}});a.equal(calls,1);a.equal(result.references.length,1);
});
test('missing key and invalid input never send requests; quota returns recoverable error',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return {ok:false,status:429,json:async()=>({})};};
 await a.rejects(()=>answer({scope,input:{question:'ok'},key:'',fetchImpl}),/미연결/);await a.rejects(()=>answer({scope,input:{question:''},key:'key',fetchImpl}),/질문/);a.equal(calls,0);
 await a.rejects(()=>answer({scope,input:{question:'ok'},key:'key',fetchImpl}),/한도/);
});
