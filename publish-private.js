'use strict';
// Private baseline only; scheduled runs require the same explicit confirmation.
const {openStore}=require('./local-store'),{DatabaseSync}=require('node:sqlite'),auth=require('firebase-tools/lib/auth'),crypto=require('node:crypto');
function merge(previous,local){
 const data=structuredClone(local),remote=(previous?.workspace.projects||[]).filter(p=>!data.workspace.projects.some(x=>x.id===p.id));
 for(const p of remote){data.workspace.projects.push(structuredClone(p));data.workspace.viewSettings||={};data.workspace.viewSettings[p.id]=structuredClone(previous.workspace.viewSettings?.[p.id]||{});data.production[p.id]=structuredClone(previous.production?.[p.id]||{});
  for(const key of ['entities','relations']){const ids=new Set(data.workspace.library[key].map(x=>x.id));data.workspace.library[key].push(...structuredClone(p[key]).filter(x=>!ids.has(x.id)));}
  for(const e of p.entities)if(previous.eventDetails?.[e.id])data.eventDetails[e.id]=structuredClone(previous.eventDetails[e.id]);
 }
 return data;
}
function assertCompatible(data,types){const known=new Set(types);if([data.workspace.library,...data.workspace.projects].some(g=>(g.relations||[]).some(r=>!known.has(r.type))))throw Error('Private publication blocked: deploy a compatible ontology client first.');}
module.exports={merge,assertCompatible};
async function main(){
  if(!process.argv.includes('--confirm-private-cloud'))throw Error('Explicit --confirm-private-cloud required.');
  const account=auth.selectAccount('delaserre1314@gmail.com',__dirname),token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const root='https://firestore.googleapis.com/v1/projects/ontho-166a6/databases/(default)/documents';
  async function call(url,body){const response=await fetch(url,{signal:AbortSignal.timeout(30000),method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(response.status===404)return null;if(!response.ok)throw Error('Private publish request failed: '+response.status);return response.json();}
  const metadata=await call(root+'/privatePM/seed');let previous=null;
  if(metadata){const chunks=[];let next='';do{const page=await call(root+'/privatePM/seed/versions/'+metadata.fields.version.stringValue+'/chunks?pageSize=1000'+(next?'&pageToken='+encodeURIComponent(next):''));chunks.push(...page.documents||[]);next=page.nextPageToken||'';}while(next);previous=JSON.parse(chunks.sort((a,b)=>a.name.localeCompare(b.name)).map(d=>d.fields.text.stringValue).join(''));}
  const store=openStore(require('node:path').join(__dirname,'..','.local-data','ontology.sqlite'));let data;
  try{const workspace=store.load();workspace.pendingChange=null;const production={},eventDetails={};for(const p of workspace.projects){const wip=store.listWip(p.id);production[p.id]={hourly:store.listHourly(p.id),wip,history:Object.fromEntries(wip.snapshots.map(s=>[s.id,store.listWip(p.id,s.id)])),progress:store.listProgress(p.id),staffing:store.listStaffing(p.id),productionStaffing:store.listProductionStaffing(p.id),samplePreparation:require('./sample-preparation').isSample(p)?store.samplePreparationList(p.id):[]};}for(const event of workspace.library.entities.filter(e=>e.eventRecord))eventDetails[event.id]=store.history.detail(event.id,'library');data=merge(previous,{workspace,production,eventDetails});}finally{store.close();}
  const text=JSON.stringify(data),contentHash=crypto.createHash('sha256').update(text).digest('hex');
  if(metadata?.fields.contentHash?.stringValue===contentHash&&metadata?.fields.format?.stringValue==='scoped-v1'){console.log(JSON.stringify({privateSeedPublished:false,unchanged:true}));return;}
  const client=await fetch('https://louis-lgls-pm.web.app/ontology-model.js?compat='+Date.now(),{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!client.ok)throw Error('Deployed ontology compatibility could not be verified.');
  const context={module:{exports:{}}};require('node:vm').runInNewContext(await client.text(),context,{timeout:1000});assertCompatible(data,context.module.exports.RELATION_TYPES||[]);
  const version='seed-'+crypto.randomUUID(),pieces=text.match(/[\s\S]{1,120000}/g)||[],prefix='projects/ontho-166a6/databases/(default)/documents',writes=pieces.map((text,index)=>({update:{name:prefix+'/privatePM/seed/versions/'+version+'/chunks/'+String(index).padStart(5,'0'),fields:{text:{stringValue:text}}},currentDocument:{exists:false}}));
  const scoped=await require('./private-seed').documents(data);
  writes.push(...scoped.map(d=>({update:{name:prefix+'/privatePM/seed/versions/'+version+'/'+d.path,fields:{payload:{stringValue:d.payload}}},currentDocument:{exists:false}})));
  if(writes.length>2000)throw Error('Seed exceeds safe version size.');
  // Publish the pointer last; interrupted chunk uploads never become readable.
  for(let i=0;i<writes.length;i+=25)await call(root+':commit',{writes:writes.slice(i,i+25)});
  const final=[{update:{name:prefix+'/privatePM/seed',fields:{version:{stringValue:version},format:{stringValue:'scoped-v1'},contentHash:{stringValue:contentHash},chunkCount:{integerValue:String(pieces.length)},publishedAt:{timestampValue:new Date().toISOString()}}},currentDocument:metadata?{updateTime:metadata.updateTime}:{exists:false}}];
  if(!await call(root+'/privatePM/state'))final.push({update:{name:prefix+'/privatePM/state',fields:{revision:{integerValue:'0'},updatedAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});
  await call(root+':commit',{writes:final});if((await call(root+'/privatePM/seed')).fields.version.stringValue!==version)throw Error('Seed changed during publication verification.');
  console.log(JSON.stringify({privateSeedPublished:true,chunks:pieces.length,historyRecords:Object.keys(data.eventDetails).length,progressRows:Object.values(data.production).reduce((n,p)=>n+(p.progress?.rows?.length||0),0),cloudUploadsAndCredentialsUnchanged:true,localDatabaseUnchanged:true}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
