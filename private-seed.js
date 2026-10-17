'use strict';
// Versioned read projections; the legacy full seed remains available to older open tabs.
function scopeData(data,scope){
 const w=data.workspace,p=w.projects.find(p=>p.id===scope);if(scope!=='library'&&!p)throw Error('Private project scope missing.');
 const metadata=p=>({...Object.fromEntries(['id','name','status','version','createdAt','updatedAt','projectType'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),entities:[],relations:[],changes:[],viewPending:true});
 const ids=new Set(p?.entities.map(e=>e.id)||[]);
 const entities=scope==='library'?w.library.entities:w.library.entities.filter(e=>ids.has(e.id)||e.type==='Event'&&e.eventRecord||['Person','Organization'].includes(e.type));
 const visible=new Set(entities.map(e=>e.id)),library={...w.library,entities,relations:w.library.relations.filter(r=>visible.has(r.from)&&visible.has(r.to)),changes:[]};
 return {workspace:{...w,projects:w.projects.map(x=>x.id===scope?{...x,changes:[]}:metadata(x)),library,viewSettings:scope==='library'?w.viewSettings:{[scope]:w.viewSettings?.[scope]||{}},pendingChange:null},production:scope==='library'?{}:{[scope]:data.production?.[scope]||{}},eventDetails:{}};
}
async function documents(data){
 const encode=require('./project-view').encode,out=[];
 for(const scope of ['library',...data.workspace.projects.map(p=>p.id)])out.push({path:'scopes/'+scope,payload:await encode(scopeData(data,scope),{compress:true})});
 for(const [id,detail]of Object.entries(data.eventDetails||{}))out.push({path:'events/'+id,payload:await encode(detail,{compress:true})});
 return out;
}
module.exports={scopeData,documents};
