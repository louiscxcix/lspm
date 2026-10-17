'use strict';
const M=require('./ontology-model'),P=require('./projects'),path=require('node:path');
const evidence='User confirmation 2026-10-08: TEM shared with LS and customer project; Jose Luis belongs to TEM engineering. Development liaison identified as 이정호 in retained source. No station assignment.';
function apply(w){
 const g=w.library,tem=g.entities.find(e=>e.name==='TEM'&&e.resourceKind==='line');if(!tem)throw Error('TEM missing.');
 const ids=new Set([tem.id]);
 const object=(id,input)=>{let e=M.byId(g,id);if(!e){e=M.addEntity(g,{...input,status:'active'});e.id=id;}ids.add(e.id);return e;};
 const link=(from,type,to,note=evidence)=>{if(!g.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(g,{from,type,to,evidence:note,scopeProjectId:null});};
 const production=object('tem-team-production',{type:'Organization',name:'TEM · Production team',context:'Production department group, not another employer. Named manager, supervisor, leaders and technicians reused. Operators are staffing counts, not fabricated named workers.'});
 const engineering=object('tem-team-engineering',{type:'Organization',name:'TEM · Engineering team',context:'TEM technical support. Jose Luis confirmed by user. Direct manager, station ownership and contact details unknown.'});
 const development=object('tem-team-development',{type:'Organization',name:'LG Innotek · 개발팀',context:'Development liaison for TEM customer samples. Not factory operator allocation or approval authority.'});
 const jose=object('tem-person-jose-luis',{type:'Person',name:'Jose Luis',title:'TEM engineering',department:'Factory / TEM Engineering',workArea:'factory',context:'User confirmed TEM engineering. Full legal name, title, email, direct manager and specific machine/Part assignments not supplied. Not José Cruz or another Luis.'});
 const lee=object('tem-person-lee-jeongho',{type:'Person',name:'이정호',title:'개발팀 연락 담당',department:'Engineering / Development',workArea:'unknown',context:'User-requested development stakeholder; retained source identifies 이노텍 이정호 개발팀. No assumed seniority, factory residency or station assignment. Kakao account identities remain separate.'});
 link(jose.id,'member_of',engineering.id);link(lee.id,'member_of',development.id);
 for(const team of [production,engineering,development])link(team.id,'supports_line',tem.id);
 for(const r of [...g.relations])if(['works_on','manages'].includes(r.type)&&r.to===tem.id&&M.byId(g,r.from)?.type==='Person'){ids.add(r.from);link(r.from,'member_of',production.id);}
 for(const e of g.entities)if(e.type==='Organization'&&e.name.startsWith('TEM ·'))ids.add(e.id);
 for(const e of g.entities)if(e.id.startsWith('customer-tem-')||['tem-part-bl7m','tem-part-p768-a2','tem-line-1','tem-line-2','tem-starpro-smt','tem-component-external-pcb'].includes(e.id))ids.add(e.id);
 for(let pass=0;pass<4;pass++)for(const r of g.relations)if(ids.has(r.from)&&['reports_to','reports_via','member_of','escalates_to','works_at'].includes(r.type)&&M.byId(g,r.to))ids.add(r.to);
 for(const name of ['LS','MOBIS + HELLA']){
  const p=w.projects.find(p=>p.name===name);if(!p)throw Error('Project missing: '+name);
  const safe=[...ids].filter(id=>!M.PROJECT_OWNED_TYPES.has(M.byId(g,id)?.type));P.attachMembers(p,g,safe.filter(id=>!p.entities.some(e=>e.id===id)));
  p.workstreams||={};for(const id of safe)p.workstreams[id]=[...new Set([...(p.workstreams[id]||[]),'production',...(id===lee.id||id===development.id||id===engineering.id||id===jose.id?['engineering']:[])])];
  const members=new Set(p.entities.map(e=>e.id));for(const r of g.relations)if((!r.scopeProjectId||r.scopeProjectId===p.id)&&members.has(r.from)&&members.has(r.to)&&!p.relations.some(x=>x.id===r.id))p.relations.push({...r,projectId:p.id});P.validate(p);
 }
 M.validateStore(g);
}
module.exports={apply};
if(require.main===module)(async()=>{
 const file=path.join(__dirname,'..','.local-data','ontology.sqlite'),s=require('./local-store').openStore(file);
 try{const backup=path.join(path.dirname(file),'ontology-before-tem-stakeholders-'+Date.now()+'.sqlite');await s.backup(backup);let w=s.load();apply(w);s.save(w,'library',w.revision);for(const name of ['LS','MOBIS + HELLA']){w=s.load();apply(w);s.save(w,w.projects.find(p=>p.name===name).id,w.revision);}w=s.load();console.log(JSON.stringify({backup,revision:w.revision,projects:w.projects.filter(p=>['LS','MOBIS + HELLA'].includes(p.name)).map(p=>({name:p.name,people:p.entities.filter(e=>e.type==='Person').length,customerTEMSteps:p.entities.filter(e=>e.id.startsWith('customer-tem-')&&e.type==='Production Step').length}))}));}finally{s.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
