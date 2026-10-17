'use strict';
const V=require('./project-view'),S=require('./sample-preparation'),T=require('./project-types');
function preserveProduction(local,remote){
 // Cloud observations remain authoritative. Only the new append-only checksheet is merged.
 if(!remote)return local;
 return {...remote,samplePreparation:S.latest([...(local.samplePreparation||[]),...(remote.samplePreparation||[])])};
}
module.exports={preserveProduction};
async function main(){
 if(!process.argv.includes('--confirm-project-views'))throw Error('Explicit --confirm-project-views required.');
 const auth=require('firebase-tools/lib/auth'),account=auth.selectAccount('delaserre1314@gmail.com',__dirname),token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 const prefix='projects/ontho-166a6/databases/(default)/documents',root='https://firestore.googleapis.com/v1/'+prefix;
 async function call(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(!r.ok)throw Error('Project view publication failed ('+r.status+').');return r.json();}
 const profiles=await call(root+'/projectCatalog?pageSize=1000'),known=new Map((profiles.documents||[]).map(d=>[d.name.split('/').at(-1),d])),state=await call(root+'/privatePM/state');
 const refresh=process.argv.find(x=>x.startsWith('--refresh-project='))?.split('=')[1],all=process.argv.includes('--refresh-all'),syncTypes=process.argv.includes('--sync-types');
 const db=require('./local-store').openStore(require('node:path').join(__dirname,'..','.local-data','ontology.sqlite')),writes=[],now=new Date().toISOString();
 try{const w=db.load();for(const p of w.projects.filter(p=>p.status==='active')){
   const previous=known.get(p.id);if(previous&&!all&&refresh!==p.id)continue;
   const publicLS=p.name==='LS'&&(!previous||previous.fields.locked.booleanValue===false),project=publicLS?require('./access').basicWorkspace(w).projects[0]:p;
   const local={hourly:db.listHourly(p.id),progress:db.listProgress(p.id),wip:db.listWip(p.id),staffing:db.listStaffing(p.id),productionStaffing:db.listProductionStaffing(p.id),samplePreparation:S.isSample(p)?db.samplePreparationList(p.id):[]};
   const oldView=previous?await call(root+'/projectViews/'+p.id):null,old=oldView?await V.decode(oldView.fields.payload.stringValue):null;
   const data=V.publish(project,preserveProduction(local,old?.production),w.viewSettings[p.id]||{});
   if(old?.settings?.hourlyRates)data.settings.hourlyRates=old.settings.hourlyRates;
   const type=previous?.fields.projectType?.stringValue;data.project.projectType=syncTypes||!type?T.kind(p):type;
   const payload=await V.encode(data,{compress:true});
   writes.push({update:{name:prefix+'/projectViews/'+p.id,fields:{payload:{stringValue:payload},updatedAt:{timestampValue:now}}},currentDocument:oldView?{updateTime:oldView.updateTime}:{exists:false}});
   if(previous){if(syncTypes||!type)writes.push({update:{name:previous.name,fields:{...previous.fields,projectType:{stringValue:T.kind(p)},updatedAt:{timestampValue:now}}},currentDocument:{updateTime:previous.updateTime}});}
   else{
    let viewerUid=publicLS?'':'disabled',loginAlias=publicLS?'':'viewer-disabled@pm-view.invalid';
    if(!publicLS&&process.argv.includes('--initialize-sample-viewers')&&T.kind(p)==='sample'){
      loginAlias='viewer-'+p.id+'@pm-view.invalid';
      const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=REMOVED_GOOGLE_API_KEY',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:loginAlias,password:require('./project-password')(p.id,'0000'),returnSecureToken:false}),signal:AbortSignal.timeout(20000)});
      const result=await r.json();if(!r.ok||!result.localId)throw Error('New project viewer creation failed; existing credentials unchanged.');viewerUid=result.localId;
    }
    writes.push({update:{name:prefix+'/projectCatalog/'+p.id,fields:{name:{stringValue:p.name},status:{stringValue:p.status},projectType:{stringValue:T.kind(p)},locked:{booleanValue:!publicLS},viewerUid:{stringValue:viewerUid},loginAlias:{stringValue:loginAlias},updatedAt:{timestampValue:now}}},currentDocument:{exists:false}});
   }
 }
 // Knowledge 360 was created in the cloud. Classify its existing identity, never replace its content.
 if(syncTypes)for(const d of known.values())if(!w.projects.some(p=>p.id===d.name.split('/').at(-1))&&/^Knowledge\s*360$/i.test(d.fields.name?.stringValue||''))writes.push({update:{name:d.name,fields:{...d.fields,projectType:{stringValue:'shared'},updatedAt:{timestampValue:now}}},currentDocument:{updateTime:d.updateTime}});
 }finally{db.close();}
 if(writes.length){if(state)writes.unshift({verify:state.name,currentDocument:{updateTime:state.updateTime}});await call(root+':commit',{writes});}
 console.log(JSON.stringify({writtenDocuments:writes.length,refreshedProject:all?'all':refresh||null,existingPasswordGrantsPreserved:true,cloudObservationsPreserved:true,privateHistoryUploaded:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
