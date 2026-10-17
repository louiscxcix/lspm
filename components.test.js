const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Model = require('./ontology-model.js');
const Flow = require('./workflow.js');
const Projects = require('./projects.js');
const {openStore} = require('./local-store.js');
const {applyG65Sample} = require('./seed-g65-components.js');

function fixture() {
  const project = Projects.create('G65 materials');
  const product = Model.addEntity(project,{type:'Part',name:'G65 main route',itemKind:'product',productionFamily:'LDM',productFamily:'G65'});
  const plate = Model.addEntity(project,{type:'Part',name:'G65 Main Plate RH',itemKind:'component',productionFamily:'LDM',productFamily:'G65',side:'RH'});
  const outer = Model.addEntity(project,{type:'Part',name:'G65 Outer',itemKind:'component',productionFamily:'LDM',productFamily:'G65'});
  const upper1 = Model.addEntity(project,{type:'Part',name:'G65 Upper RH 1',itemKind:'component',productionFamily:'LDM',productFamily:'G65',side:'RH',verticalPosition:'Upper',pieceIndex:'1'});
  const upper2 = Model.addEntity(project,{type:'Part',name:'G65 Upper RH 2',itemKind:'component',productionFamily:'LDM',productFamily:'G65',side:'RH',verticalPosition:'Upper',pieceIndex:'2'});
  const lower1 = Model.addEntity(project,{type:'Part',name:'G65 Lower RH 1',itemKind:'component',productionFamily:'LDM',productFamily:'G65',side:'RH',verticalPosition:'Lower',pieceIndex:'1'});
  const lower2 = Model.addEntity(project,{type:'Part',name:'G65 Lower RH 2',itemKind:'component',productionFamily:'LDM',productFamily:'G65',side:'RH',verticalPosition:'Lower',pieceIndex:'2'});
  const router = Model.addEntity(project,{type:'Production Step',name:'G65 · Router'});
  const integration = Model.addEntity(project,{type:'Production Step',name:'G65 · Integration',status:'unknown'});
  const visual = Model.addEntity(project,{type:'Production Step',name:'G65 · Visual'});
  const ng = Model.addEntity(project,{type:'Production Step',name:'G65 · NG storage',processLevel:'sub',parentWorkId:visual.id,branchKind:'exception'});
  const machine = Model.addEntity(project,{type:'Resource',name:'Shared Router machine family',resourceKind:'machine',machineMode:'shared_pool',machineFamily:'Router'});
  const area = Model.addEntity(project,{type:'Resource',name:'Router room',resourceKind:'facility'});
  for(const step of [router,integration,visual,ng])Model.addRelation(project,{from:step.id,type:'applies_to',to:product.id});
  Model.addRelation(project,{from:router.id,type:'precedes',to:visual.id});
  Model.addRelation(project,{from:visual.id,type:'on_failure',to:ng.id});
  Model.addRelation(project,{from:router.id,type:'requires',to:machine.id});
  Model.addRelation(project,{from:router.id,type:'requires',to:area.id});
  return {project,product,plate,outer,upper1,upper2,lower1,lower2,router,integration,visual,ng,machine,area};
}

test('Part role and discrete material quantities validate without changing existing Parts',()=>{
  const f=fixture();
  assert.equal(Model.isProductPart(f.product),true);
  assert.equal(Model.isProductPart(f.plate),false);
  assert.equal(Model.isProductPart({type:'Part',name:'legacy'}),true);
  assert.equal(Model.isComponentPart(f.plate),true);
  assert.throws(()=>Model.addEntity(f.project,{type:'Part',name:'Bad role',itemKind:'random'}),/item kind/i);
  assert.throws(()=>Model.addEntity(f.project,{type:'Person',name:'Bad side',side:'RH'}),/Part/);
  const input=Model.addRelation(f.project,{from:f.router.id,type:'consumes',to:f.plate.id,quantity:1,unit:'piece',basis:'per Main Plate RH',routePartId:f.product.id,evidence:'PM note'});
  assert.equal(input.quantity,1);
  assert.equal(input.basis,'per Main Plate RH');
  assert.equal(input.routePartId,f.product.id);
  assert.throws(()=>Model.addRelation(f.project,{from:f.router.id,type:'produces',to:f.outer.id,quantity:0}),/quantity/i);
  assert.throws(()=>Model.addRelation(f.project,{from:f.router.id,type:'produces',to:f.outer.id,quantity:1.5}),/quantity/i);
  assert.throws(()=>Model.addRelation(f.project,{from:f.router.id,type:'produces',to:f.outer.id,routePartId:f.plate.id}),/route Part/i);
  assert.equal(Model.validateStore(f.project).relations.find(r=>r.id===input.id).quantity,1);
});

test('each Router output is a separate Component node, not a text bundle',()=>{
  const f=fixture();
  Model.addRelation(f.project,{from:f.router.id,type:'consumes',to:f.plate.id,quantity:1,basis:'per Main Plate RH',routePartId:f.product.id});
  for(const [component,quantity] of [[f.outer,1],[f.upper1,2],[f.upper2,2],[f.lower1,2],[f.lower2,2]])
    Model.addRelation(f.project,{from:f.router.id,type:'produces',to:component.id,quantity,basis:'per Main Plate RH',routePartId:f.product.id});
  Model.addRelation(f.project,{from:f.integration.id,type:'consumes',to:f.upper1.id,routePartId:f.product.id});
  Model.addRelation(f.project,{from:f.integration.id,type:'consumes',to:f.upper2.id,routePartId:f.product.id});
  const projection=Flow.productionNetwork(f.project);
  assert.deepEqual(projection.parts.map(p=>p.id),[f.product.id],'Component Parts are not selectable product routes by default');
  const layout=Flow.productionContextLayout(f.project,projection);
  const routerOutputs=layout.satellites.filter(item=>item.stepId===f.router.id&&item.direction==='output');
  assert.deepEqual(routerOutputs.map(item=>item.entity.id),[f.outer,f.upper1,f.upper2,f.lower1,f.lower2].map(item=>item.id));
  assert.equal(routerOutputs.reduce((sum,item)=>sum+item.relation.quantity,0),9);
  assert.equal(layout.satellites.filter(item=>item.stepId===f.router.id&&item.kind==='machine').length,1,'Facility is not drawn as a machine');
  assert.ok(layout.positions[f.router.id].y<layout.positions[f.visual.id].y,'Normal process remains straight');
  assert.ok(layout.positions[f.ng.id].x>layout.positions[f.visual.id].x,'NG path is lateral');
  assert.ok(layout.satellites.every(item=>item.x>=0&&item.y>=0));
  assert.ok(layout.width>Math.max(...layout.satellites.map(item=>item.x+198)),'Every Component card fits the SVG canvas');
  const componentRoute=Flow.partWorkflow(f.project,f.upper1.id);
  assert.ok(componentRoute.some(row=>row.step.id===f.router.id));
  assert.ok(componentRoute.some(row=>row.step.id===f.integration.id));
});

test('CSV material metadata and local SQLite round-trip preserve quantities',()=>{
  const f=fixture();
  const csv='id,type,from,to,quantity,unit,basis,routePartId,evidence\nrouter-output,produces,'+f.router.id+','+f.outer.id+',1,piece,per Main Plate RH,'+f.product.id+',PM note';
  const preview=Flow.previewCSV(f.project,csv,'relations');
  assert.deepEqual(preview.errors,[]);
  assert.equal(preview.project.relations.find(r=>r.id==='router-output').quantity,1);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g65-components-'));
  const db=openStore(path.join(dir,'ontology.sqlite'));
  try {
    const workspace=db.load(),next=structuredClone(workspace);
    next.projects.push(preview.project);
    const created=db.save(next,null,workspace.revision);
    const selected=structuredClone(created);
    selected.projects[selected.projects.findIndex(project=>project.id===f.project.id)]=preview.project;
    db.save(selected,f.project.id,created.revision);
    const loaded=db.load().projects.find(project=>project.id===f.project.id);
    assert.equal(loaded.relations.find(r=>r.id==='router-output').quantity,1);
    assert.equal(loaded.entities.find(e=>e.id===f.upper1.id).itemKind,'component');
  } finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('a single isolated Router still reserves full width for output Component cards',()=>{
  const f=fixture();
  f.project.entities=f.project.entities.filter(item=>[f.product.id,f.outer.id,f.router.id].includes(item.id));
  f.project.relations=f.project.relations.filter(item=>item.type==='applies_to'&&item.from===f.router.id);
  Model.addRelation(f.project,{from:f.router.id,type:'produces',to:f.outer.id,quantity:1,basis:'per plate',routePartId:f.product.id});
  const layout=Flow.productionContextLayout(f.project,Flow.productionNetwork(f.project));
  assert.ok(layout.width>=layout.satellites[0].x+198+20);
});

test('machine and Component layers can be hidden independently and release map space',()=>{
  const f=fixture();
  Model.addRelation(f.project,{from:f.router.id,type:'produces',to:f.outer.id,quantity:1,basis:'per plate',routePartId:f.product.id});
  const projection=Flow.productionNetwork(f.project);
  const all=Flow.productionContextLayout(f.project,projection);
  const noMachines=Flow.productionContextLayout(f.project,projection,{showMachines:false});
  const noComponents=Flow.productionContextLayout(f.project,projection,{showComponents:false});
  const bare=Flow.productionContextLayout(f.project,projection,{showMachines:false,showComponents:false});
  assert.equal(noMachines.satellites.some(item=>item.kind==='machine'),false);
  assert.equal(noComponents.satellites.some(item=>item.kind==='part'),false);
  assert.equal(bare.satellites.length,0);
  assert.ok(all.width>bare.width);
});

test('production UI exposes material classification, quantity entry, and independent context layers',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert.match(html,/id="itemKind"/);
  assert.match(html,/id="relationQuantity"/);
  assert.match(html,/id="productionSeeMachines"/);
  assert.match(html,/id="productionSeeComponents"/);
  assert.match(app,/id="productionLine"/);
  assert.match(app,/Flow\.productionContextLayout\(store,(?:projection|shown)/);
  assert.match(app,/layout\.satellites/);
});

test('G65 sample append is idempotent, keeps the confirmed route, and never invents LH yield',()=>{
  const p=Projects.create('LS');
  for(const [id,name,type] of [
    ['ls-part-g65-main','G65 main (route label)','Part'],
    ['ls-step-g65-main-ict','G65 main (route label) · ICT','Production Step'],
    ['ls-step-g65-main-download','G65 main (route label) · FW download','Production Step'],
    ['ls-step-g65-main-router','G65 main (route label) · Router','Production Step'],
    ['ls-step-g65-main-lam','G65 main (route label) · LAM assembly','Production Step'],
    ['ls-resource-download','Common download machine','Resource']
  ])p.entities.push({id,name,type,status:'active',context:'',projectId:p.id,productionFamily:type==='Part'?'LDM':undefined,resourceKind:id==='ls-resource-download'?'machine':undefined});
  Model.byId(p,'ls-resource-download').machineMode='specific_asset';
  p.relations.push({id:'confirmed-route',from:'ls-step-g65-main-router',type:'precedes',to:'ls-step-g65-main-lam',evidence:'Photo',projectId:p.id});
  const first=applyG65Sample(p);
  assert.equal(Model.byId(p,'ls-resource-download').machineMode,'specific_asset','Missing family must not overwrite recorded machine use');
  assert.ok(first.objects>0&&first.relations>0);
  const count=[p.entities.length,p.relations.length];
  const second=applyG65Sample(p);
  assert.deepEqual([second.objects,second.relations],[0,0]);
  assert.deepEqual([p.entities.length,p.relations.length],count);
  assert.ok(!p.relations.some(r=>r.id==='confirmed-route'),'Direct Router → LAM shortcut is replaced by Integration');
  const outputs=p.relations.filter(r=>r.from==='ls-step-g65-main-router'&&r.type==='produces');
  assert.equal(outputs.length,5);
  assert.equal(outputs.reduce((sum,r)=>sum+r.quantity,0),9);
  assert.ok(outputs.every(r=>Model.isComponentPart(Model.byId(p,r.to))));
  assert.ok(!p.relations.some(r=>r.from==='ls-step-g65-main-router'&&r.type==='produces'&&Model.byId(p,r.to)?.side==='LH'));
  const integration=p.entities.find(e=>e.type==='Production Step'&&e.productionStage==='Integration');
  assert.equal(p.relations.filter(r=>(r.from===integration.id||r.to===integration.id)&&r.type==='precedes').length,2);
  assert.ok(p.relations.some(r=>r.from==='ls-step-g65-main-router'&&r.to===integration.id&&r.type==='precedes'));
  assert.ok(p.relations.some(r=>r.from===integration.id&&r.to==='ls-step-g65-main-lam'&&r.type==='precedes'));
  assert.doesNotThrow(()=>Projects.validate(p));
});
