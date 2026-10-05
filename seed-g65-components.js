'use strict';

const Model = require('./ontology-model.js');

// PM-confirmed material facts. This appends to one project; it never replaces existing records.
function applyG65Sample(project) {
  for(const entity of project.entities) {
    if(entity.type==='Part'&&entity.name.endsWith(' (route pending)'))Model.updateEntity(project,entity.id,{name:entity.name.replace(' (route pending)','')});
    if(entity.type==='Production Step'&&entity.productionStage==='Integration'&&entity.name.includes('G65'))Model.updateEntity(project,entity.id,{name:'G65 · Integration',processLevel:'main',context:'PM-confirmed order: Router → Integration → LAM assembly.'});
  }
  const required=['ls-part-g65-main','ls-step-g65-main-ict','ls-step-g65-main-download','ls-step-g65-main-router','ls-step-g65-main-lam','ls-resource-download'];
  for(const id of required)if(!Model.byId(project,id))throw Error('G65 sample requires existing LS route object: '+id);
  const counts={objects:0,relations:0,updated:0};
  project.workstreams ||= {};
  const ensure=(type,name,fields={})=>{
    let entity=project.entities.find(item=>item.type===type&&item.name===name);
    if(!entity){
      entity=Model.addEntity(project,{type,name,context:'G65 PM material-flow sample · confirm against current work instruction before operational use.',...fields});
      project.workstreams[entity.id]=['production'];counts.objects++;
    }else{
      const missing=Object.fromEntries(Object.entries(fields).filter(([key,value])=>value&&!entity[key]));
      if(Object.keys(missing).length){entity=Model.updateEntity(project,entity.id,missing);counts.updated++;}
    }
    return entity;
  };
  const link=(from,type,to,fields={})=>{
    if(project.relations.some(relation=>relation.from===from.id&&relation.type===type&&relation.to===to.id))return;
    Model.addRelation(project,{from:from.id,type,to:to.id,scopeProjectId:null,...fields});counts.relations++;
  };
  const product=Model.byId(project,'ls-part-g65-main');
  if(!product.itemKind||!product.productFamily){Model.updateEntity(project,product.id,{...(!product.itemKind?{itemKind:'product'}:{}),...(!product.productFamily?{productFamily:'G65'}:{})});counts.updated++;}
  for(const name of ['G65 Jewelry Piece','G65 SL Upper','G65 SL Lower','G65 Side Marker','G65 Cornering']){
    const part=project.entities.find(item=>item.type==='Part'&&item.name===name);
    if(part&&(!part.itemKind||!part.productFamily)){Model.updateEntity(project,part.id,{...(!part.itemKind?{itemKind:'product'}:{}),...(!part.productFamily?{productFamily:'G65'}:{})});counts.updated++;}
  }
  const variant=(name,side,verticalPosition)=>ensure('Part',name,{itemKind:'product',productionFamily:'LDM',productFamily:'G65',side,verticalPosition,status:'unknown',context:'G65 route variant placeholder · exact operation route and finished SKU not confirmed.'});
  variant('G65 Upper RH','RH','Upper');
  variant('G65 Upper LH','LH','Upper');
  variant('G65 Lower RH','RH','Lower');
  variant('G65 Lower LH','LH','Lower');
  const component=(name,fields={})=>ensure('Part',name,{itemKind:'component',productionFamily:'LDM',productFamily:'G65',...fields});
  const input=component('G65 Main Plate RH',{side:'RH'});
  component('G65 Main Plate LH',{side:'LH',context:'LH input exists; Router yield and downstream route not yet confirmed.'});
  const outer=component('G65 Outer (RH Router output)');
  const upper1=component('G65 Upper RH Plate 1',{side:'RH',verticalPosition:'Upper',pieceIndex:'1'});
  const upper2=component('G65 Upper RH Plate 2',{side:'RH',verticalPosition:'Upper',pieceIndex:'2'});
  const lower1=component('G65 Lower RH Plate 1',{side:'RH',verticalPosition:'Lower',pieceIndex:'1'});
  const lower2=component('G65 Lower RH Plate 2',{side:'RH',verticalPosition:'Lower',pieceIndex:'2'});
  const connector=component('G65 Upper RH Connector',{side:'RH',verticalPosition:'Upper'});
  const upperMain=component('G65 Upper RH main',{side:'RH',verticalPosition:'Upper',context:'Intermediate LED panel, not a finished route Part. Plastics are attached later.'});
  const black=component('G65 Upper RH Black Plastic',{side:'RH',verticalPosition:'Upper'});
  const crystal=component('G65 Upper RH Crystal Plastic',{side:'RH',verticalPosition:'Upper'});
  const ict=Model.byId(project,'ls-step-g65-main-ict'),download=Model.byId(project,'ls-step-g65-main-download'),router=Model.byId(project,'ls-step-g65-main-router'),lam=Model.byId(project,'ls-step-g65-main-lam');
  const ictMachine=ensure('Resource','Shared ICT machine family (asset unknown)',{resourceKind:'machine',machineMode:'shared_pool',machineFamily:'ICT'});
  const routerMachine=ensure('Resource','Shared Router machine family (asset unknown)',{resourceKind:'machine',machineMode:'shared_pool',machineFamily:'Router'});
  const currentDownload=Model.byId(project,'ls-resource-download');
  if(!currentDownload.machineMode||!currentDownload.machineFamily){Model.updateEntity(project,currentDownload.id,{...(!currentDownload.machineMode?{machineMode:'shared_pool'}:{}),...(!currentDownload.machineFamily?{machineFamily:'FW download'}:{})});counts.updated++;}
  link(ict,'requires',ictMachine,{evidence:'LDM line reference · orange ICT = common machine family; asset not confirmed.'});
  link(router,'requires',routerMachine,{evidence:'LDM line reference · orange Router = common machine family; asset not confirmed.'});
  const confirmed={routePartId:product.id,unit:'piece',basis:'per 1 G65 Main Plate RH',reviewState:'confirmed',evidence:'PM clarification: RH Router input 1 plate; output Outer ×1 and four Plate types ×2 each (9 pieces total).'};
  link(router,'consumes',input,{...confirmed,quantity:1});
  for(const [item,quantity] of [[outer,1],[upper1,2],[upper2,2],[lower1,2],[lower2,2]])link(router,'produces',item,{...confirmed,quantity});
  const integration=ensure('Production Step','G65 · Integration',{productionStage:'Integration',processLevel:'main',status:'unknown',operatorAction:'Join G65 Upper RH Plate 1 and Plate 2 with Connector.',context:'PM-confirmed order: Router → Integration → LAM assembly.'});
  project.relations=project.relations.filter(relation=>!(relation.type==='precedes'&&relation.from===router.id&&relation.to===lam.id));
  link(router,'precedes',integration,{evidence:'PM confirmed Router → Integration → LAM assembly, 2026-10-04.'});
  link(integration,'precedes',lam,{evidence:'PM confirmed Router → Integration → LAM assembly, 2026-10-04.'});
  link(integration,'applies_to',product,{evidence:'PM-confirmed G65 main route.'});
  const proposed={routePartId:product.id,reviewState:'proposed',evidence:'PM description of Upper RH intermediate assembly; current work instruction/order unverified.'};
  for(const item of [upper1,upper2,connector])link(integration,'consumes',item,proposed);
  link(integration,'produces',upperMain,proposed);
  for(const item of [upperMain,black,crystal])link(lam,'consumes',item,{...proposed,evidence:'PM description: Upper RH LED panel + black plastic + crystal plastic at LAM; exact finished SKU unconfirmed.'});
  // Shared families express eligibility; they do not invent a physical asset assignment.
  const shared={ICT:ictMachine,Router:routerMachine,'FW download':Model.byId(project,currentDownload.id)};
  for(const step of project.entities.filter(item=>item.type==='Production Step')) {
    const machine=shared[step.productionStage];
    if(machine) {
      project.relations=project.relations.filter(relation=>!(relation.type==='requires'&&relation.from===step.id&&['ls-resource-ict-area','ls-resource-router-room'].includes(relation.to)));
      link(step,'requires',machine,{evidence:'LDM reference: orange operation = shared machine family; physical asset allocation unconfirmed.'});
    } else if(['EOL','Coating','Coating inspection','Vision inspection','Array cutting','Stacking','Screw assembly','Screw 1 Assembly (box 1)','Screw 1 Assembly (box 2)','Press bending #1–#5'].includes(step.productionStage)) {
      const dedicated=ensure('Resource',step.name+' · dedicated machine',{resourceKind:'machine',machineMode:'specific_asset',machineFamily:step.productionStage,context:'White operation in LDM reference: dedicated equipment. Asset ID and exact allocation not yet supplied.'});
      link(step,'requires',dedicated,{evidence:'LDM reference: white operation = dedicated equipment; asset ID unconfirmed.'});
    }
  }
  return counts;
}

module.exports={applyG65Sample};
