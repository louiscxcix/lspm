'use strict';
const M=require('./ontology-model');
function reviseProduction(p){
  const lam=new Set(p.entities.filter(e=>e.productionStage==='LAM assembly').map(e=>e.id));
  const machines=new Set(p.relations.filter(r=>r.type==='requires'&&lam.has(r.from)&&M.byId(p,r.to)?.resourceKind==='machine').map(r=>r.to));
  p.relations=p.relations.filter(r=>!(r.type==='requires'&&lam.has(r.from)&&machines.has(r.to)));
  for(const id of lam)M.updateEntity(p,id,{operatorAction:'Worker manually assembles the components; no machine required.'});
  const old=p.entities.filter(e=>e.type==='Production Step'&&/NG storage/.test(e.name));
  const ensure=(name)=>p.entities.find(e=>e.name===name&&e.type==='Production Step')||M.addEntity(p,{type:'Production Step',name,productionStage:name,processLevel:'sub',branchKind:'exception',context:name==='Scrap'?'Terminal disposition for unrepaired units.':'Shared NG holding. Repaired units return to their originating failed step; unrepaired units go to Scrap.'});
  const ng=ensure('NG storage'),scrap=ensure('Scrap'),retired=new Set(old.filter(e=>e.id!==ng.id).map(e=>e.id));
  const link=(from,type,to,evidence)=>{if(!p.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(p,{from,type,to,evidence,scopeProjectId:null});};
  for(const r of p.relations.filter(r=>r.type==='on_failure'&&retired.has(r.to))){
    const part=p.relations.find(a=>a.from===r.to&&a.type==='applies_to')?.to;
    link(r.from,'on_failure',ng.id,'Failed check: move to NG storage.',part);
    link(ng.id,'rework_of',r.from,'Fixed: return only to the originating failed step for retest.',part);
    if(part){link(ng.id,'applies_to',part,'Shared NG disposition.');link(scrap.id,'applies_to',part,'Shared scrap disposition.');}
  }
  link(ng.id,'on_failure',scrap.id,'Not fixed: Scrap.');
  p.relations=p.relations.filter(r=>!retired.has(r.from)&&!retired.has(r.to));
  for(const id of machines)if(!p.relations.some(r=>r.from===id||r.to===id))retired.add(id);
  // Detach superseded route observations; the global Library retains their history.
  p.entities=p.entities.filter(e=>!retired.has(e.id));
  for(const id of retired)delete p.workstreams[id];
  p.workstreams[ng.id]=['production','quality'];p.workstreams[scrap.id]=['production','quality'];
  return {retired:[...retired],ng:ng.id,scrap:scrap.id};
}
module.exports={reviseProduction};
