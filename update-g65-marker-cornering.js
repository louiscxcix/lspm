const M=require('./ontology-model');
function apply(p){const before=JSON.stringify(p);const ensure=(id,input)=>{let e=M.byId(p,id);if(!e){e=M.addEntity(p,input);e.id=id;}p.workstreams[e.id]=['production'];return e;};
const link=(a,type,b,extra={})=>{if(!p.relations.some(r=>r.from===a.id&&r.type===type&&r.to===b.id&&r.routePartId===extra.routePartId))M.addRelation(p,{from:a.id,type,to:b.id,evidence:'IMG_3977 + user confirmation 2026-10-05. Local-only confidential source.',scopeProjectId:null,...extra});};
const smt=p.entities.find(e=>e.type==='Resource'&&e.resourceKind==='line'&&e.name==='SMT');
for(const [key,label,stages] of [['side-marker','G65 Side Marker',['lam','stacking','eol','visual','packing']],['cornering','G65 Cornering',['ict','lam','eol','visual','packing']]]){
const parent=M.byId(p,'ls-part-g65-'+key);if(!parent)throw Error('Missing existing product');
const steps=Object.fromEntries(stages.map(s=>[s,M.byId(p,'ls-step-g65-'+key+'-'+s)]));if(Object.values(steps).some(e=>!e))throw Error('Missing existing route');
M.updateEntity(p,steps.lam.id,{operatorAction:'Manual attachment of one PCB and one variant-specific bracket. No LAM machine assigned.'});
if(steps.stacking)M.updateEntity(p,steps.stacking.id,{operatorAction:'Load the manually joined plastic/bracket assembly into the Stacking machine; machine presses/seats it firmly together. Exact joining technology, settings and acceptance criteria unconfirmed.'});
for(const side of ['LH','RH']){
const prefix='ls-g65-'+key+'-'+side.toLowerCase();const part=ensure(prefix,{type:'Part',name:label+' '+side,itemKind:'product',side,productionFamily:'LDM',productFamily:'G65',context:'Confirmed LH/RH variants share the existing route. Actual dedicated-machine asset allocation unknown. IMG_3977 confidential; local use only.'});link(part,'part_of',parent);
const pcb=ensure(prefix+'-pcb',{type:'Part',name:label+' '+side+' PCB',itemKind:'component',side,productionFamily:'LDM',productFamily:'G65',context:'One PCB per assembly confirmed. SMT origin is user estimate, not confirmed supplier/source. Part number unknown.'});
const bracket=ensure(prefix+'-bracket',{type:'Part',name:label+' '+side+' Bracket',itemKind:'component',side,productionFamily:'LDM',productFamily:'G65',context:'One variant-specific bracket per assembly confirmed. No extra screws, glue or connector inferred. Material specification and supplier unknown.'});
const assembled=ensure(prefix+'-bracket-assembly',{type:'Part',name:label+' '+side+' bracket assembly',itemKind:'component',side,productionFamily:'LDM',productFamily:'G65',context:'Intermediate assembly from manual LAM; distinct from finished product and input PCB.'});
for(const component of [pcb,bracket,assembled])link(component,'part_of',part);
for(const step of Object.values(steps))link(step,'applies_to',part);
const fields={quantity:1,unit:'pcs',basis:'per assembly',routePartId:part.id,reviewState:'confirmed'};
link(steps.lam,'consumes',pcb,fields);link(steps.lam,'consumes',bracket,fields);link(steps.lam,'produces',assembled,fields);
let testInput=assembled;
if(steps.stacking){const secured=ensure(prefix+'-secured-assembly',{type:'Part',name:label+' '+side+' secured assembly',itemKind:'component',side,productionFamily:'LDM',productFamily:'G65',context:'Stacking output: manually attached plastic/bracket assembly firmly seated by machine. No additional component inferred.'});link(secured,'part_of',part);link(steps.stacking,'consumes',assembled,fields);link(steps.stacking,'produces',secured,fields);testInput=secured;}
link(steps.eol,'consumes',testInput,fields);link(steps.packing,'produces',part,fields);
if(steps.ict)link(steps.ict,'consumes',pcb,fields);
if(smt)link(smt,'produces',pcb,{routePartId:part.id,reviewState:'proposed',basis:'source hypothesis',evidence:'User says PCB likely comes from SMT; unconfirmed, not an inventory or production record.'});
}
}
M.validateStore(p);return JSON.stringify(p)!==before;}
module.exports={apply};
if(require.main===module){const d=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const w=d.load(),p=w.projects.find(p=>p.name==='LS');console.log(apply(p)?'Saved local revision '+d.save(w,p.id,w.revision).revision:'Already applied');}finally{d.close();}}
