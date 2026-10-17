'use strict';
function projectSeed(previous,workspace,projectId,production){
 const original=workspace.projects.find(p=>p.id===projectId&&p.status==='active');
 if(!original)throw Error('An active project is required.');
 const result=structuredClone(previous),local=require('./public-privacy').removePrivateRecords(structuredClone(workspace)),project=local.projects.find(p=>p.id===projectId);
 const index=result.workspace.projects.findIndex(p=>p.id===projectId);
 if(index<0)result.workspace.projects.push(project);else result.workspace.projects[index]=project;
 for(const key of ['entities','relations']){const ids=new Set(result.workspace.library[key].map(x=>x.id));result.workspace.library[key].push(...project[key].filter(x=>!ids.has(x.id)));}
 result.workspace.viewSettings||={};result.workspace.viewSettings[projectId]=structuredClone(local.viewSettings?.[projectId]||{});
 result.workspace.revision=Math.max(result.workspace.revision||0,local.revision||0);
 result.production||={};result.production[projectId]=structuredClone(production);
 return result;
}
module.exports={projectSeed};
async function main(){
 if(!process.argv.includes('--confirm-private-cloud'))throw Error('Explicit --confirm-private-cloud required.');
 const projectId=process.argv.find(x=>x.startsWith('project-'));if(!projectId)throw Error('Project ID required.');
 const auth=require('firebase-tools/lib/auth'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
 const account=auth.selectAccount('delaserre1314@gmail.com',__dirname),token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 const prefix='projects/ontho-166a6/databases/(default)/documents',root='https://firestore.googleapis.com/v1/'+prefix;
 function call(url,body){
  const config='header = "Authorization: Bearer '+token.access_token+'"\nurl = "'+url+'"\n'+(body?'header = "Content-Type: application/json"\nrequest = "POST"\ndata = '+JSON.stringify(JSON.stringify(body))+'\n':'');
  try{return JSON.parse(execFileSync('curl',['-fsS','--config','-'],{input:config,encoding:'utf8',maxBuffer:16000000,timeout:30000,stdio:['pipe','pipe','pipe']}));}catch{throw Error('Private project publication request failed.');}
 }
 const metadata=call(root+'/privatePM/seed'),version=metadata.fields.version.stringValue,chunks=[];let next='';
 do{const page=call(root+'/privatePM/seed/versions/'+version+'/chunks?pageSize=1000'+(next?'&pageToken='+encodeURIComponent(next):''));chunks.push(...page.documents||[]);next=page.nextPageToken||'';}while(next);
 const previous=JSON.parse(chunks.sort((a,b)=>a.name.localeCompare(b.name)).map(d=>d.fields.text.stringValue).join(''));
 const store=require('./local-store').openStore(require('node:path').join(__dirname,'..','.local-data','ontology.sqlite'));let data;
 try{const workspace=store.load(),wip=store.listWip(projectId);data=projectSeed(previous,workspace,projectId,{wip,history:Object.fromEntries(wip.snapshots.map(s=>[s.id,store.listWip(projectId,s.id)])),progress:store.listProgress(projectId),staffing:store.listStaffing(projectId),productionStaffing:store.listProductionStaffing(projectId),hourly:store.listHourly(projectId)});}finally{store.close();}
 const newVersion='seed-'+randomUUID(),pieces=JSON.stringify(data).match(/[\s\S]{1,120000}/g)||[];
 if(pieces.length>450)throw Error('Seed exceeds safe single-commit size.');
 const writes=pieces.map((text,index)=>({update:{name:prefix+'/privatePM/seed/versions/'+newVersion+'/chunks/'+String(index).padStart(5,'0'),fields:{text:{stringValue:text}}}}));
 writes.push({update:{name:prefix+'/privatePM/seed',fields:{version:{stringValue:newVersion},chunkCount:{integerValue:String(pieces.length)},publishedAt:{timestampValue:new Date().toISOString()}}},currentDocument:{updateTime:metadata.updateTime}});
 call(root+':commit',{writes});
 if(call(root+'/privatePM/seed').fields.version.stringValue!==newVersion)throw Error('Published seed changed during verification.');
 console.log(JSON.stringify({projectPublished:projectId,chunks:pieces.length,previousVersion:version,otherProjectsAndHistoryPreserved:true,cloudUploadsUnchanged:true}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
