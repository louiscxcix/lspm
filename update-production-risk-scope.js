const M=require('./ontology-model');
function apply(p){
  const before=JSON.stringify(p);
  const notes=p.entities.filter(e=>e.type==='Issue'&&e.context.includes('G65_Process_Ontology_Consolidated.md')&&e.context.includes('Historical failure mode'));
  for(const old of notes){
    let risk=p.entities.find(e=>e.type==='Risk'&&e.name===old.name);
    if(!risk)risk=M.addEntity(p,{type:'Risk',name:old.name,status:'unknown',context:old.context.replace('Historical failure mode, not a live incident.','Potential recurring failure derived from historical observation; not a live incident.')});
    for(const r of p.relations.filter(r=>r.from===old.id&&r.type==='potentially_affects')){
      if(!p.relations.some(link=>link.from===risk.id&&link.type===r.type&&link.to===r.to))M.addRelation(p,{from:risk.id,type:r.type,to:r.to,evidence:r.evidence,scopeProjectId:null});
    }
    M.updateEntity(p,old.id,{status:'archived'});
    (p.workstreams ||= {})[risk.id]=['production'];
  }
  const ng=p.entities.find(e=>e.type==='Production Step'&&e.productionStage==='NG storage');
  if(!ng)throw Error('Canonical NG storage missing');
  let issue=p.entities.find(e=>e.type==='Issue'&&e.name==='NG storage · handling / disposition gap');
  if(!issue)issue=M.addEntity(p,{type:'Issue',name:'NG storage · handling / disposition gap',status:'unknown',context:'Source: G65_Process_Ontology_Consolidated.md. Observed uncertainty about stacking NG material brought by Quality. Current unresolved gap: ticket fields, safe stacking method, limits and disposition authority need confirmation. Existing fixed-return and unrecoverable-Scrap rules remain unchanged. Not a count of NG units or a new manufacturing step.'});
  if(!p.relations.some(r=>r.from===issue.id&&r.type==='potentially_affects'&&r.to===ng.id))M.addRelation(p,{from:issue.id,type:'potentially_affects',to:ng.id,evidence:'Consolidated floor observations: Quality / NG handling',scopeProjectId:null});
  p.workstreams[issue.id]=['production'];
  const integration=p.entities.find(e=>e.id==='obj-muufiui4-lsdkh');
  if(!integration)throw Error('Canonical G65 Integration missing');
  let connectionRisk=p.entities.find(e=>e.type==='Risk'&&e.name==='G65 Integration · system connection not visually distinguishable');
  if(!connectionRisk)connectionRisk=M.addEntity(p,{type:'Risk',name:'G65 Integration · system connection not visually distinguishable',status:'unknown',context:'User observation 2026-10-04: Integration requires both physical connection and system association. Visually identical objects cannot be distinguished as system-connected versus not system-connected. Risk: an unassociated object may proceed despite appearing physically assembled, creating traceability or association gaps. Actual affected units, verification method, system identity and recovery owner not yet supplied. This is a potential failure, not a recorded NG incident.'});
  if(!p.relations.some(r=>r.from===connectionRisk.id&&r.type==='potentially_affects'&&r.to===integration.id))M.addRelation(p,{from:connectionRisk.id,type:'potentially_affects',to:integration.id,evidence:'User-confirmed Integration requires physical and system connections; visual distinction unavailable (2026-10-04)',scopeProjectId:null});
  p.workstreams[connectionRisk.id]=['production'];
  for(const e of p.entities.filter(e=>e.name==='Alexis'||e.type==='Evidence'&&e.context.includes('G65_Process_Ontology_Consolidated.md')))p.workstreams[e.id]=['production'];
  const marta=p.entities.find(e=>e.type==='Person'&&e.name==='Marta');
  if(marta){
    // Detach from LS only; the canonical Library object and history remain recoverable.
    p.entities=p.entities.filter(e=>e.id!==marta.id);
    p.relations=p.relations.filter(r=>r.from!==marta.id&&r.to!==marta.id);
    delete p.workstreams[marta.id];
  }
  M.validateStore(p);
  return JSON.stringify(p)!==before;
}
module.exports={apply};
if(require.main===module){
  const db=require('./local-store').openStore(process.env.PM_DB_PATH||'../.local-data/ontology.sqlite');
  try{const w=db.load(),p=w.projects.find(p=>p.name==='LS');if(!p)throw Error('LS project missing');console.log(apply(p)?'Saved revision '+db.save(w,p.id,w.revision).revision:'Already updated');}finally{db.close();}
}
