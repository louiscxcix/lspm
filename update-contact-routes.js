const M=require('./ontology-model'),{areas}=require('./update-production-organization');
function apply(p){const before=JSON.stringify(p);const link=(a,type,b,evidence)=>{if(!p.relations.some(r=>r.from===a.id&&r.type===type&&r.to===b.id))M.addRelation(p,{from:a.id,type,to:b.id,evidence,scopeProjectId:null});};
for(const [name,a] of Object.entries(areas)){const line=p.entities.find(e=>e.type==='Resource'&&e.name===name&&e.resourceKind==='line'),manager=p.entities.find(e=>e.name===a.manager&&e.type==='Person');if(!line||!manager)throw Error('Missing line organization');
const groups={};for(const role of ['Leader','Supervisor','Maintenance Technician']){if(role==='Maintenance Technician'&&!a.counts[2])continue;const groupName=name+' · '+role+' team';let group=p.entities.find(e=>e.type==='Organization'&&e.name===groupName);if(!group)group=M.addEntity(p,{type:'Organization',name:groupName,context:'Role group, not another employer or extra people. Line-level only. Individual boss, phone, Teams contact and on-duty availability unknown. 2026-10-05.'});p.workstreams[group.id]=['production'];groups[role]=group;
for(const [r,,...people] of a.groups)if(r===role)for(const n of people){const person=p.entities.find(e=>e.type==='Person'&&e.name===n);if(person)link(person,'member_of',group,'Named person belongs to area role group; no station assignment');}}
link(line,'escalates_to',groups.Leader,'Suggested operational contact entry: area Leader team; duty contact and approved procedure unconfirmed');
link(groups.Leader,'escalates_to',groups.Supervisor,'Suggested escalation by organizational role; not a time-based alert or approved emergency SOP');
link(groups.Supervisor,'escalates_to',manager,'Area Line Manager identified in organization chart');
for(const [role,,...people] of a.groups)if(role==='Maintenance Technician')for(const n of people){const person=p.entities.find(e=>e.type==='Person'&&e.name===n);if(person)link(person,'reports_via',groups.Leader,'User confirmed Tech is under Leader 2026-10-05; exact individual Leader unknown');}
}
M.validateStore(p);return JSON.stringify(p)!==before;}
module.exports={apply};
if(require.main===module){const db=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const w=db.load(),p=w.projects.find(p=>p.name==='LS');console.log(apply(p)?'Saved revision '+db.save(w,p.id,w.revision).revision:'Already applied');}finally{db.close();}}
