(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.APQP=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PHASES=[['1','Plan & define'],['2','Product design'],['3','Process design'],['4','Validation'],['5','Launch & feedback']];
  function starter(){
    const entities=PHASES.flatMap(([id,name])=>[
      {id:`apqp-gate-${id}`,type:'Gate',name:`APQP ${id} gate · ${name}`,status:'planned',framework:'APQP',apqpPhase:id,completionState:'not_started',readiness:'unknown',decision:'not_decided',templateItemId:`gate-${id}`,templateVersion:'1.0'},
      {id:`apqp-deliverable-${id}`,type:'Deliverable',name:`Phase ${id} evidence pack`,status:'planned',framework:'APQP',apqpPhase:id,completionState:'not_started',applicability:'pending_review',templateItemId:`evidence-pack-${id}`,templateVersion:'1.0'}
    ]);
    return {entities,relations:PHASES.map(([id])=>({id:`apqp-required-${id}`,from:`apqp-deliverable-${id}`,type:'required_for',to:`apqp-gate-${id}`,evidence:'APQP starter linkage'}))};
  }
  function apqpItems(project){return project.entities.filter(e=>e.framework==='APQP'||e.apqpPhase);}
  function dashboard(project){const items=apqpItems(project);return {phases:PHASES.map(([id,name])=>{const rows=items.filter(e=>e.apqpPhase===id);return {id,name,total:rows.length,approved:rows.filter(e=>e.completionState==='approved').length,blocked:rows.filter(e=>e.completionState==='blocked'||e.status==='blocked').length,missingOwner:rows.filter(e=>!project.relations.some(r=>r.type==='assignment_scope'&&r.to===e.id)).length};})};}
  function gateReviews(project){return project.entities.filter(e=>e.type==='Gate').map(g=>({...g,required:project.relations.filter(r=>r.type==='required_for'&&r.to===g.id).map(r=>project.entities.find(e=>e.id===r.from)).filter(Boolean)}));}
  function partReadiness(project){return project.entities.filter(e=>['Part','Part Revision'].includes(e.type)).map(part=>{
    const partIds=new Set([part.id]);if(part.type==='Part')project.relations.filter(r=>r.type==='revision_of'&&r.to===part.id).forEach(r=>partIds.add(r.from));
    const related=new Set(project.relations.filter(r=>partIds.has(r.to)||partIds.has(r.from)).flatMap(r=>[r.from,r.to]));
    const steps=new Set(project.relations.filter(r=>['applies_to','produces'].includes(r.type)&&partIds.has(r.to)).map(r=>r.from));
    for(const r of project.relations)if(steps.has(r.from)||steps.has(r.to)){related.add(r.from);related.add(r.to);}
    const items=project.entities.filter(e=>related.has(e.id)&&(e.type==='Production Step'||e.type==='Gate'||e.framework==='APQP'||e.apqpPhase));
    return {part,items,blocked:items.filter(e=>e.completionState==='blocked'||e.status==='blocked').length};
  });}
  function traceability(project){const required=project.entities.filter(e=>['Requirement','Characteristic'].includes(e.type));const linked=new Set(project.relations.filter(r=>['satisfies','verifies','controls'].includes(r.type)).map(r=>r.to));return {total:required.length,covered:required.filter(e=>linked.has(e.id)),broken:required.filter(e=>!linked.has(e.id))};}
  function applyStarter(project){if(apqpItems(project).length)throw Error('APQP records already exist.');const data=starter();for(const e of data.entities)project.entities.push({...e,projectId:project.id});for(const r of data.relations)project.relations.push({...r,projectId:project.id});return data.entities.length;}
  return {PHASES,starter,dashboard,gateReviews,partReadiness,traceability,applyStarter};
});
