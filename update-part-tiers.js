const M=require('./ontology-model');
function apply(p){
  const before=JSON.stringify(p);
  for(const family of ['G65','LQ2','T1XL']){
    const id='ls-family-'+family.toLowerCase();
    let root=M.byId(p,id);
    if(!root){root=M.addEntity(p,{type:'Part',name:family,itemKind:'product',productionFamily:'LDM',productFamily:family,context:'Classification only. Not a physical stock item; do not aggregate inventory on this node.'});root.id=id;}
    p.workstreams[id]=['production'];
    const parts=p.entities.filter(e=>M.isProductPart(e)&&e.id!==id&&(e.productFamily===family||e.name.startsWith(family+' ')));
    for(const part of parts){
      if(part.productFamily!==family)M.updateEntity(p,part.id,{productFamily:family});
      const hasParent=p.relations.some(r=>r.from===part.id&&r.type==='part_of'&&M.isProductPart(M.byId(p,r.to)));
      if(!hasParent)M.addRelation(p,{from:part.id,type:'part_of',to:id,evidence:'User approved product family tiers 2026-10-05'});
    }
  }
  for(const id of ['ls-part-g65-sl-upper','ls-part-g65-sl-lower']){
    const e=M.byId(p,id);if(e)M.updateEntity(p,id,{name:e.name.replace(' SL ',' ')});
  }
  M.validateStore(p);return before!==JSON.stringify(p);
}
module.exports={apply};
if(require.main===module){const d=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const w=d.load(),p=w.projects.find(x=>x.name==='LS');require('node:fs').copyFileSync('../.local-data/ontology.sqlite','../.local-data/ontology-before-part-tiers-'+Date.now()+'.sqlite');console.log(apply(p)?'Saved revision '+d.save(w,p.id,w.revision).revision:'Already applied');}finally{d.close();}}
