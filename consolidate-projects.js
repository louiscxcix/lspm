'use strict';
const path=require('node:path'),{openStore}=require('./local-store'),P=require('./projects'),M=require('./ontology-model');
async function main(){
  const dbPath=process.env.PM_DB_PATH||path.join(__dirname,'..','.local-data','ontology.sqlite'),s=openStore(dbPath);
  try{
    const backup=path.join(path.dirname(dbPath),'ontology-before-project-consolidation-'+Date.now()+'.sqlite');await s.backup(backup);
    let w=s.load(),ls=w.projects.find(p=>p.name==='LS'),mobis=w.projects.find(p=>p.name==='Mobis · BL7m PE P'||p.name==='MOBIS + HELLA'),hella=w.projects.find(p=>p.name==='HELLA · P768 A-2'),tem=w.projects.find(p=>p.name==='TEM');
    if(!ls||!mobis)throw Error('Expected LS and Mobis projects not found.');
    if(hella)w=s.mergeProject(hella.id,mobis.id,'MOBIS + HELLA',w.revision);
    if(tem)w=s.mergeProject(tem.id,ls.id,'LS',w.revision);
    const target=w.projects.find(p=>p.id===ls.id),ids=w.library.entities.filter(e=>!e.eventRecord&&!['Work Item','Build','Gate','Deliverable','Risk','Issue'].includes(e.type)&&(e.id.startsWith('tem-')&&!/^tem-(hella|mobis)-/.test(e.id)||e.productionFamily==='TEM'||e.site==='TEM'||e.name==='TEM'||e.name.startsWith('TEM ·'))).map(e=>e.id);
    const safeIds=ids.filter(id=>!M.PROJECT_OWNED_TYPES.has(w.library.entities.find(e=>e.id===id).type)||!w.projects.some(p=>p.id!==target.id&&p.entities.some(e=>e.id===id)));
    const added=P.membershipCandidates(w.library,target,safeIds);P.attachMembers(target,w.library,added);
    for(const id of added){const e=target.entities.find(e=>e.id===id);target.workstreams[id]=e.type==='Organization'&&['HELLA','Mobis','Flex-N-Gate'].includes(e.name)?['commercial']:e.type==='Organization'&&e.name==='Starpro'?['purchasing']:['production'];}
    const members=new Set(target.entities.map(e=>e.id));for(const r of w.library.relations)if(!r.scopeProjectId&&members.has(r.from)&&members.has(r.to)&&!target.relations.some(x=>x.id===r.id))target.relations.push({...r,projectId:target.id});
    if(added.length)w=s.save(w,target.id,w.revision);
    console.log(JSON.stringify({backup,revision:w.revision,projects:w.projects.filter(p=>!w.projectAliases[p.id]).map(p=>({id:p.id,name:p.name,status:p.status,objects:p.entities.length})),temObjectsAttached:added.length}));
  }finally{s.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
