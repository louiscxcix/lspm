const M=require('./ontology-model');
function apply(p){
  const before=JSON.stringify(p);
  const ensure=(id,input,codes)=>{let e=M.byId(p,id);if(!e){e=M.addEntity(p,input);e.id=id;}(p.workstreams ||= {})[e.id]=codes;return e;};
  const storage=ensure('ls-material-storage',{type:'Resource',name:'Material / intermediate Storage',resourceKind:'facility',storageRole:'material_intermediate',site:'Factory · exact location unconfirmed',context:'User confirmed: shared factory storage for Starpro supplied material and internally SMT-produced intermediate components awaiting downstream production. Not SMT input waiting, finished goods or NG storage. Item-specific routes, quantities and lots are unknown. Record sourceEntityId, lotCode, quantityUnit and occurredAt on inventory Events; never infer quantities or suppliers for particular components.'},['production','purchasing','logistics']);
  const staging=ensure('ls-packed-dispatch-storage',{type:'Resource',name:'Packed goods · dispatch staging',resourceKind:'facility',storageRole:'packed_dispatch',context:'Separate space after Packing: packaged finished goods wait here for outbound logistics. Not the Packing operation, material storage or NG storage. Manager, exact location, stock and shipping route unconfirmed.'},['production','logistics']);
  const starpro=ensure('ls-supplier-starpro',{type:'Organization',name:'Starpro',context:'User-confirmed supplier name. Supplies material received into shared material storage; specific item codes and lots not yet given.'},['purchasing','production','logistics']);
  const madian=ensure('ls-storage-madian',{type:'Person',name:'Madian',title:'Storage manager',department:'Factory / Storage',context:'User-confirmed manager of material/intermediate storage. No assignment to packed dispatch space confirmed.'},['production','logistics']);
  const smt=p.entities.find(e=>e.type==='Resource'&&e.resourceKind==='line'&&e.name==='SMT')||ensure('ls-smt-source-line',{type:'Resource',name:'SMT',resourceKind:'line',context:'Internal line produces intermediate components which can enter shared material storage. Detailed route not supplied.'},['production']);
  const link=(from,type,to,evidence)=>{if(!p.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(p,{from,type,to,evidence,scopeProjectId:null});};
  link(storage.id,'receives_from',starpro.id,'User-confirmed external supply origin; specific items unknown');
  link(storage.id,'receives_from',smt.id,'User-confirmed SMT output, not SMT input waiting');
  link(madian.id,'manages',storage.id,'User-confirmed material storage manager');
  const output=ensure('ls-smt-output-component',{type:'Part',name:'SMT output · component identity pending',itemKind:'component',context:'User distinguishes internal SMT line from its produced output. This is a provisional output category, not a confirmed item code, SKU, lot or quantity. Replace with actual component identities when supplied; do not infer which LDM/TEM Part consumes it.'},['production','logistics','purchasing']);
  link(smt.id,'produces',output.id,'User-confirmed SMT produces intermediate output; detailed process and identity pending');
  link(output.id,'stored_at',storage.id,'User-confirmed SMT-produced output is stored here; no quantity assertion');
  for(const step of p.entities.filter(e=>e.type==='Production Step'&&e.status!=='archived'&&/^packing$/i.test(e.productionStage||e.name)))link(step.id,'transfers_to',staging.id,'User-confirmed Packing output goes to separate packed dispatch staging; no quantity assertion');
  M.validateStore(p);return JSON.stringify(p)!==before;
}
module.exports={apply};
if(require.main===module){const db=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const w=db.load(),p=w.projects.find(p=>p.name==='LS');if(!p)throw Error('LS missing');console.log(apply(p)?'Saved revision '+db.save(w,p.id,w.revision).revision:'Already applied');}finally{db.close();}}
