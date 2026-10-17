const {test}=require('node:test'),a=require('node:assert/strict'),H=require('./hourly'),M=require('./ontology-model');
const project={id:'p',status:'active',entities:[],relations:[]};
const part=M.addEntity(project,{id:'model-a',type:'Part',name:'Model A',itemKind:'product'});
const row=(hour,target,actual,extra={})=>({measurementKind:'model',partId:part.id,unit:'pcs',start:`2026-10-09T${String(hour).padStart(2,'0')}:00:00-06:00`,end:`2026-10-09T${String(hour+1).padStart(2,'0')}:00:00-06:00`,target,actual,...extra});
test('model records need no process and cannot mix model output with step output',()=>{
 const [r]=H.validate(project,[row(9,240,220)]);a.equal(r.measurementKind,'model');a.equal(r.stepId,'');
 a.throws(()=>H.validate(project,[row(9,240,220,{stepId:'a-step'})]),/공정/);
});
test('model series use varying hourly targets, cumulative sums and exclude legacy step counts',()=>{
 const rows=[row(9,240,220),row(10,300,280),row(11,200,160),{...row(9,999,999),measurementKind:undefined,stepId:'legacy'}];
 const s=H.modelSeries(rows,part.id,'pcs');a.equal(s.rows.length,3);a.equal(s.actual,660);a.equal(s.target,740);a.equal(s.shortfall,80);a.equal(s.timeline.at(-1).cumulativeTarget,740);a.equal(s.timeline.at(-1).cumulativeActual,660);
 a.throws(()=>H.modelSeries([row(9,240,220),{...row(9,240,220),start:'2026-10-09T09:30:00-06:00'}],part.id,'pcs'),/겹/);
});
test('zero target is unscheduled, missing stays missing, ratios are weighted by comparable targets',()=>{
 const s=H.modelSeries([row(9,240,220),row(10,0,40)],part.id,'pcs');a.equal(s.actual,260);a.equal(s.target,240);a.equal(s.unscheduledActual,40);a.equal(s.ratio,220/240*100);
 const missing=H.modelSeries([row(9,240,220),row(10,null,40)],part.id,'pcs');a.equal(missing.target,null);a.equal(missing.ratio,null);a.equal(missing.timeline.at(-1).cumulativeTarget,null);
});
test('gaps and different line streams are never silently added together',()=>{
 const s=H.modelSeries([row(9,240,220),row(11,200,160)],part.id,'pcs');a.equal(s.gaps,true);a.equal(s.actual,null);a.equal(s.target,null);
 a.throws(()=>H.modelSeries([row(9,240,220),row(10,300,280,{lineId:'other'})],part.id,'pcs'),/라인/);
});
test('SQLite model plans append corrections without deleting legacy observations or creating History',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{openStore}=require('./local-store'),P=require('./projects'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-model-hourly-')),db=openStore(path.join(dir,'db.sqlite'));
 try{const p=P.create('SMT'),part=M.addEntity(p,{type:'Part',name:'Board model',itemKind:'product'}),w=db.load();w.projects.push(p);let saved=db.save(w,null,w.revision);saved=db.save({...saved,projects:[p]},p.id,saved.revision);
  const record={...row(9,240,220),partId:part.id};const first=db.hourlySave({projectId:p.id,revision:saved.revision,rows:[record]});
  a.throws(()=>db.hourlySave({projectId:p.id,revision:first.revision,rows:[{...record,target:260,planVersion:'2'}]}),/정정/);
  const second=db.hourlySave({projectId:p.id,revision:first.revision,rows:[{...record,target:260,planVersion:'2'}],confirmCorrections:true});
  const records=db.listHourly(p.id);a.equal(records.length,2);a.equal(records[0].target,240);a.equal(records[1].target,260);a.equal(records[1].supersedesId,records[0].id);a.equal(H.modelSeries(records,part.id,'pcs').target,260);
  a.equal(db.historyList({scope:p.id}).totalDistinct,0);a.equal(db.listProgress(p.id).rows.length,0);a.equal(db.hourlySave({projectId:p.id,revision:second.revision,rows:[{...record,target:260,planVersion:'2'}]}).duplicate,true);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
