'use strict';
const P=require('./projects'),H=require('./hourly');
function setup(db){
 let w=db.load(),p=w.projects.find(p=>p.name==='SMT'&&p.status==='active');
 if(!p){const line=w.library.entities.find(e=>e.id==='ls-smt-source-line'&&e.resourceKind==='line');if(!line)throw Error('기존 내부 SMT 라인을 확인해야 합니다.');p=P.create('SMT');P.attachMembers(p,w.library,[line.id]);p.workstreams={[line.id]:['production']};w.projects.push(p);w=db.save(w,null,w.revision);const i=w.projects.findIndex(x=>x.id===p.id);w.projects[i]=p;w=db.save(w,p.id,w.revision);}
 const byId=new Map(w.library.entities.map(e=>[e.id,e])),ids=new Set(['ls-smt-source-line']);
 // Follow evidenced material/line relationships, never a name match to TEM or supplier SMT templates.
 for(let pass=0;pass<6;pass++)for(const r of w.library.relations){
  if(r.scopeProjectId&&r.scopeProjectId!==p.id)continue;
  let id='';
  if(r.type==='produces'&&ids.has(r.from)&&byId.get(r.from)?.resourceKind==='line')id=r.to;
  if(r.type==='stored_at'&&ids.has(r.from))id=r.to;
  if(r.type==='receives_from'&&ids.has(r.from)&&byId.get(r.from)?.storageRole==='material_intermediate')id=r.to;
  if(['works_on','manages','supports_line'].includes(r.type)&&ids.has(r.to))id=r.from;
  if(['member_of','reports_via','reports_to','escalates_to'].includes(r.type)&&ids.has(r.from)&&(byId.get(r.to)?.name.startsWith('SMT ·')||ids.has(r.to)))id=r.to;
  const e=byId.get(id);if(e&&e.status!=='archived'&&!e.historySource&&!e.eventRecord&&r.reviewState!=='proposed'&&r.reviewState!=='rejected')ids.add(id);
 }
 const additional=[...ids].filter(id=>!p.entities.some(e=>e.id===id));
 if(additional.length){P.attachMembers(p,w.library,additional);p.workstreams||={};for(const id of additional)p.workstreams[id]=['production'];w.projects[w.projects.findIndex(x=>x.id===p.id)]=p;w=db.save(w,p.id,w.revision);p=w.projects.find(x=>x.id===p.id);}
 for(const project of w.projects.filter(p=>p.status==='active'&&['SMT','LS','MOBIS + HELLA'].includes(p.name))){const wanted=H.defaults(project),saved=w.viewSettings[project.id]?.features;if(!saved){db.featureSave({projectId:project.id,revision:w.revision,features:wanted});w=db.load();}}
 db.putSettings(p.id,'production',{...(w.viewSettings[p.id]?.production||{}),line:'SMT'});
 return db.load();
}
function addG65PCB(db){
 const M=require('./ontology-model');let w=db.load();
 const smt=w.projects.find(p=>p.name==='SMT'&&p.status==='active'),ls=w.projects.find(p=>p.name==='LS'&&p.status==='active');
 if(!smt||!ls||!M.byId(w.library,'ls-smt-source-line')||!M.byId(w.library,'ls-family-g65'))throw Error('Confirmed SMT line and G65 family are required.');
 const before=JSON.stringify(w.library);let pcb=w.library.entities.find(e=>e.name==='G65 PCB'&&e.status!=='archived');
 if(pcb&&!M.isComponentPart(pcb))throw Error('Existing G65 PCB identity requires review.');
 if(!pcb){pcb=M.addEntity(w.library,{type:'Part',name:'G65 PCB',itemKind:'component',productionFamily:'SMT',productFamily:'G65',context:'User confirmed 2026-10-11: SMT output PCB used to build G65. Exact manufacturer model code, variant, route, machines and quantities are not supplied.'});pcb.id='smt-g65-pcb';}
 for(const [from,type,to] of [['ls-smt-source-line','produces',pcb.id],[pcb.id,'part_of','ls-family-g65']])if(!w.library.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(w.library,{from,type,to,scopeProjectId:null,evidence:'User confirmation 2026-10-11: G65 PCB is SMT output used in G65.'});
 if(JSON.stringify(w.library)!==before)w=db.save(w,'library',w.revision);
 for(const id of [smt.id,ls.id]){const p=w.projects.find(p=>p.id===id);if(!p.entities.some(e=>e.id===pcb.id)){P.attachMembers(p,w.library,[pcb.id]);(p.workstreams||={})[pcb.id]=['production'];w=db.save(w,id,w.revision);}}
 return w;
}
module.exports={setup,addG65PCB};
if(require.main===module){(async()=>{const path=require('node:path'),fs=require('node:fs'),{openStore}=require('./local-store'),file=process.env.PM_DB_PATH||path.join(__dirname,'..','.local-data','ontology.sqlite'),db=openStore(file);try{const dir=path.join(path.dirname(file),'backups');fs.mkdirSync(dir,{recursive:true});await db.backup(path.join(dir,'before-smt-hourly-'+Date.now()+'.sqlite'));const w=setup(db);console.log(JSON.stringify({revision:w.revision,projects:w.projects.filter(p=>p.status==='active').map(p=>({id:p.id,name:p.name,features:w.viewSettings[p.id]?.features})),hourlySampleRecords:0}));}finally{db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});}
