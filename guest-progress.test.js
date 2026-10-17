const {test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('guest observations are memory-only, append multiple uploads, validate routes and disappear with a new view',()=>{
  const M=require('./ontology-model'),G=require('./progress'),p=require('./projects').create('LS'),part=M.addEntity(p,{type:'Part',name:'G65',itemKind:'product'}),step=M.addEntity(p,{type:'Production Step',name:'ICT',productionStage:'ICT'});M.addRelation(p,{type:'applies_to',from:step.id,to:part.id});
  let writes=0;const window={ProductionProgress:G,OntologyModel:M,LocalAPI:{progressSave(){writes++;throw Error('No write allowed');}},PUBLIC_READ_ONLY:true};
  vm.runInNewContext(fs.readFileSync('./progress-view.js','utf8'),{window,Intl,Date,Set,Map,crypto:require('node:crypto').webcrypto});const view=new window.ProgressView(()=>{},()=>{});view.ctx={basic:true,store:p};
  const row={partId:part.id,stepId:step.id,quantity:12,unit:'pcs',capturedAt:new Date().toISOString()};view.addTemporary([row]);view.addTemporary([{...row,quantity:20}]);a.equal(view.temporary.get(p.id).rows.length,2);a.equal(view.temporary.get(p.id).snapshots.length,2);a.equal(writes,0);a.throws(()=>view.addTemporary([{...row,quantity:-1}]),/quantity/);a.equal(new window.ProgressView(()=>{},()=>{}).temporary.size,0);
});
