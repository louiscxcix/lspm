const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('./hourly'),M=require('./ontology-model');
const date='2026-10-09';
const part=(id,itemKind='product',extra={})=>({id,type:'Part',name:id,itemKind,...extra});
const project=(name,entities)=>({id:name,name,status:'active',entities,relations:[]});
const row=(partId,actual=20,extra={})=>({measurementKind:'model',partId,unit:'pcs',start:date+'T10:00:00-06:00',end:date+'T11:00:00-06:00',actual,target:30,reasons:[],...extra});
function setup(store,rows=[],options={}){
 const root={HourlyProduction:H,OntologyModel:M,ProductionProgress:require('./progress'),...options};
 vm.runInNewContext(fs.readFileSync(require.resolve('./hourly-view'),'utf8'),{globalThis:root,Intl,Date,Map,Set,document:{createElement(){throw Error('Read-only action opened a dialog');}}});
 const view=new root.HourlyView(()=>{},()=>{}),elements=new Map(),classes={remove(){},toggle(){}};
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{hidden:false,disabled:false,innerHTML:'',textContent:'',setAttribute(){}});return elements.get(selector);};
 view.bar={querySelector:element,querySelectorAll:()=>[],hidden:false};view.toggleButton=element('[data-hourly-toggle]');view.table={hidden:false};view.container={parentElement:{classList:classes}};view.mount=()=>{};
 view.ctx={store,workspace:{revision:1,viewSettings:{},access:{enabled:true,mode:'owner'}}};view.rows=rows;view.date=date;view.active=true;
 return {view,element,root};
}
test('hourly defaults enable LS and SMT only',()=>{
 for(const name of ['LS','SMT'])a.equal(H.defaults({name}).hourly,true,name);
 for(const name of ['MOBIS + HELLA','unknown'])a.equal(H.defaults({name}).hourly,false,name);
});
test('LS finished Parts and SMT PCBs use one radio group without mutating records',()=>{
 for(const name of ['LS','SMT']){
  const kind=name==='SMT'?'component':'product',p=project(name,[part('first',kind),part('second',kind),part('archived',kind,{status:'archived'}),{id:'machine',type:'Resource'}]);
  if(name==='LS')p.entities.push(part('material','component'));
  const rows=[row('first',20),row('second',900)],before=JSON.stringify({p,rows}),{view,element}=setup(p,rows);
  view.selectedParts=['first','second'];view.controls();
  a.deepEqual(Array.from(view.selectedParts),['first']);
  const html=element('[data-hourly-models]').innerHTML;
  a.equal((html.match(/type="radio"/g)||[]).length,2);a.equal((html.match(/checked/g)||[]).length,1);a(!html.includes('checkbox'));a(!html.includes('archived'));a(!html.includes('material'));
  a.equal(H.modelSeries(view.dayRows(),'first','pcs').actual,20);
  view.selectedParts=['second'];view.controls();a.equal(view.groups().length,1);a.equal(view.groups()[0].part.id,'second');a.equal(H.modelSeries(view.dayRows(),'second','pcs').actual,900);
  a.equal(JSON.stringify({p,rows}),before);
 }
});
test('stale or unknown Parts cannot reach charts; empty projects stay empty',()=>{
 const {view,element}=setup(project('LS',[part('valid'),part('old','product',{status:'archived'})]),[row('unknown'),row('old'),row('valid')]);
 view.selectedParts=['unknown','valid'];view.range={from:1,through:3};view.selected={group:'old',index:2};view.controls();
 a.deepEqual(Array.from(view.selectedParts),['valid']);a.equal(view.range,null);a.equal(view.selected,null);a.equal(view.groups()[0].part.id,'valid');
 view.ctx.store.entities=[];view.controls();a.equal(view.selectedParts.length,0);a.equal(view.dayRows().length,0);a.equal(view.groups().length,0);a(element('[data-hourly-models]').innerHTML.includes('등록된 생산 모델 없음'));
 a.equal(element('[data-hourly-input]').disabled,true);a.equal(element('[data-hourly-unit-time]').disabled,true);
});
test('public and project/basic viewers cannot open hourly write dialogs',()=>{
 for(const options of [{PUBLIC_READ_ONLY:true},{mode:'project'},{mode:'basic'}]){
  const {view,element}=setup(project('LS',[part('valid')]),[],options);if(options.mode)view.ctx.workspace.access.mode=options.mode;
  view.controls();a.equal(element('[data-hourly-input]').disabled,true);a.equal(element('[data-hourly-unit-time]').disabled,true);
  a.doesNotThrow(()=>view.input());a.doesNotThrow(()=>view.unitTime());
 }
});
test('switching project while a load is pending discards the old rows and selection',async()=>{
 let resolve;const {view}=setup(project('SMT',[part('pcb','component')]),[],{LocalAPI:{hourlyList:()=>new Promise(r=>{resolve=r;})}});
 const pending=view.load();view.selectedParts=['pcb'];view.range={from:1,through:2};view.selected={group:'pcb',index:1};
 view.update({...view.ctx,store:project('LS',[part('finished')])});resolve([row('pcb')]);await pending;
 a.equal(view.rows.length,0);a.equal(view.loading,false);a.equal(view.selectedParts.length,0);a.equal(view.range,null);a.equal(view.selected,null);
 view.active=true;view.controls();a.deepEqual(Array.from(view.selectedParts),['finished']);
});
test('load date fallback clears old interval and model selection',async()=>{
 const p=project('SMT',[part('first','component'),part('second','component')]),{view}=setup(p,[],{LocalAPI:{hourlyList:async()=>[row('second')]}});
 view.date='2026-10-08';view.selectedParts=['first'];view.selected={group:'old',index:1};view.range={from:1,through:2};await view.load();
 a.equal(view.date,date);a.equal(view.range,null);a.equal(view.selected,null);a.deepEqual(Array.from(view.selectedParts),['second']);
});
