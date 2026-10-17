'use strict';
const M=require('./ontology-model'),P=require('./projects'),path=require('node:path');
const assumption='User approved temporary reuse of the observed BiLED sequence for Mobis and HELLA. Customer-specific BOM, sequence, equipment identity and readiness are unverified; no actual production or inventory asserted.';
function apply(w){
  const g=w.library,p=w.projects.find(p=>p.name==='MOBIS + HELLA');if(!p)throw Error('Merged customer project not found.');
  const tem=g.entities.find(e=>e.name==='TEM'&&e.resourceKind==='line');if(!tem)throw Error('TEM organization missing.');
  const ids=new Set([tem.id,'tem-starpro-smt','tem-component-external-pcb']);
  const object=(id,input)=>{let e=M.byId(g,id);if(!e){e=M.addEntity(g,{...input,status:'planned',projectId:'library'});e.id=id;e.routeAssumption=!!input.routeAssumption;}ids.add(id);return e;};
  const link=(from,type,to,extra={})=>{if(!g.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(g,{from,type,to,scopeProjectId:null,evidence:assumption,...(['consumes','produces'].includes(type)?{reviewState:'unverified'}:{}),...extra});};
  for(const [kind,partId,lineId] of [['mobis','tem-part-bl7m','tem-line-1'],['hella','tem-part-p768-a2','tem-line-2']]){
    const part=M.byId(g,partId);if(!part||!M.byId(g,lineId))throw Error('Customer Part or line missing.');ids.add(partId);ids.add(lineId);
    const prefix='customer-tem-'+kind+'-',mapped=new Map();
    const steps=Array.from({length:20},(_,i)=>{
      const template=M.byId(g,'tem-biled-step-'+i);if(!template)throw Error('BiLED route template missing.');
      const e=object(prefix+'step-'+i,{type:'Production Step',name:part.name+' · '+template.productionStage,productionStage:template.productionStage,processLevel:'main',routeAssumption:true,context:assumption});mapped.set(template.id,e.id);
      link(e.id,'applies_to',partId);link(e.id,'operated_in',lineId);link(e.id,'operated_in',tem.id);link(e.id,'supported_by','tem-source-note');return e;
    });
    for(let i=1;i<steps.length;i++)link(steps[i-1].id,'precedes',steps[i].id);
    for(const r of [...g.relations]){
      if(!mapped.has(r.from)||!['requires','consumes','produces'].includes(r.type))continue;
      const source=M.byId(g,r.to);if(!source)throw Error('Missing template input.');
      // Requirements are not physical assets or confirmed customer BOM entries.
      const resource=object(prefix+source.id,{type:source.type,name:part.name+' · '+(source.machineFamily||source.name.replace(/^BiLED · /,'')),...(source.type==='Resource'?{resourceKind:source.resourceKind,machineFamily:source.machineFamily}:{itemKind:'component',productionFamily:'TEM'}),routeAssumption:true,context:assumption+' '+source.context});
      link(mapped.get(r.from),r.type,resource.id);
      if(resource.type==='Part')link(resource.id,'part_of',partId);
    }
    link(steps[0].id,'consumes','tem-component-external-pcb');
    link(steps.at(-1).id,'produces',partId);
  }
  // Reuse confirmed TEM people and role teams, never invent station assignments.
  for(const e of g.entities)if(e.type==='Organization'&&e.name.startsWith('TEM ·'))ids.add(e.id);
  for(const r of g.relations)if(['works_on','manages'].includes(r.type)&&r.to===tem.id&&M.byId(g,r.from)?.type==='Person')ids.add(r.from);
  for(let i=0;i<4;i++)for(const r of g.relations)if(ids.has(r.from)&&['reports_to','reports_via','member_of','escalates_to','works_at'].includes(r.type)&&M.byId(g,r.to))ids.add(r.to);
  P.attachMembers(p,g,[...ids].filter(id=>!p.entities.some(e=>e.id===id)));
  p.workstreams||={};for(const id of ids)p.workstreams[id]=['production'];
  const members=new Set(p.entities.map(e=>e.id));for(const r of g.relations)if((!r.scopeProjectId||r.scopeProjectId===p.id)&&members.has(r.from)&&members.has(r.to)&&!p.relations.some(x=>x.id===r.id))p.relations.push({...r,projectId:p.id});
  M.validateStore(g);P.validate(p);return p.id;
}
module.exports={apply};
if(require.main===module)(async()=>{
  const dbPath=path.join(__dirname,'..','.local-data','ontology.sqlite'),s=require('./local-store').openStore(dbPath);
  try{const backup=path.join(path.dirname(dbPath),'ontology-before-customer-tem-'+Date.now()+'.sqlite');await s.backup(backup);let w=s.load();const id=apply(w);s.save(w,'library',w.revision);w=s.load();apply(w);w=s.save(w,id,w.revision);const p=w.projects.find(p=>p.id===id);console.log(JSON.stringify({backup,revision:w.revision,project:p.name,steps:p.entities.filter(e=>e.type==='Production Step').length,people:p.entities.filter(e=>e.type==='Person').length}));}finally{s.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
