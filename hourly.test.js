const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),M=require('./ontology-model'),P=require('./projects');
test('hourly quantities preserve missing/zero and compare only the same measurement',()=>{
 const H=require('./hourly');a.equal(H.metrics(null,300).ratio,null);a.equal(H.metrics(0,300).ratio,0);a.equal(H.metrics(220,300).shortfall,80);a.equal(H.metrics(220,0).ratio,null);
 const rows=[{partId:'p',stepId:'s',unit:'pcs',start:'2026-10-09T09:00:00-06:00',end:'2026-10-09T10:00:00-06:00',actual:270,target:300},{partId:'p',stepId:'s',unit:'pcs',start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:220,target:300},{partId:'p',stepId:'other',unit:'pcs',start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:999,target:1000}];
 a.equal(H.aggregate(rows,'p','s','pcs').actual,490);a.equal(H.day(rows[0].start),'2026-10-09');a.throws(()=>H.aggregate([rows[0],{...rows[0],start:'2026-10-09T09:30:00-06:00'}],'p','s','pcs'),/겹/);
});
test('hourly DB persists features and versioned production without changing WIP/history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-hourly-')),file=path.join(dir,'db.sqlite'),{openStore}=require('./local-store');let d=openStore(file);
 try{let w=d.load(),p=P.create('SMT'),part=M.addEntity(p,{type:'Part',name:'Test board',itemKind:'product',productionFamily:'SMT'}),step=M.addEntity(p,{type:'Production Step',name:'Test operation'});M.addRelation(p,{type:'applies_to',from:step.id,to:part.id});w.projects.push(p);w=d.save(w,null,w.revision);w.projects[0]=p;w=d.save(w,p.id,w.revision);
 a.equal(typeof d.hourlySave,'function');d.featureSave({projectId:p.id,revision:w.revision,features:{wip:false,hourly:true}});w=d.load();a.equal(w.viewSettings[p.id].features.hourly,true);
 const row={partId:part.id,stepId:step.id,start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:220,target:300,unit:'pcs',reasons:[{category:'material',text:'Delayed material',response:'Requested delivery',verification:'reported'}]};
 const saved=d.hourlySave({projectId:p.id,revision:w.revision,rows:[row]});a.equal(d.listHourly(p.id).length,1);a.equal(d.historyList({scope:p.id}).totalDistinct,0);a.equal(d.listProgress(p.id).rows.length,0);
 a.throws(()=>d.hourlySave({projectId:p.id,revision:w.revision,rows:[row]}),/STALE/);
 const duplicate=d.hourlySave({projectId:p.id,revision:saved.revision,rows:[row]});a.equal(duplicate.duplicate,true);
 a.throws(()=>d.hourlySave({projectId:p.id,revision:saved.revision,rows:[{...row,actual:230}]}),/정정/);
 const corrected=d.hourlySave({projectId:p.id,revision:saved.revision,rows:[{...row,actual:230}],confirmCorrections:true});a.equal(d.listHourly(p.id).length,2);a.equal(corrected.revision,saved.revision+1);
 d.close();d=openStore(file);a.equal(d.listHourly(p.id).at(-1).actual,230);a.equal(d.load().viewSettings[p.id].features.hourly,true);
 }finally{d.close();fs.rmSync(dir,{recursive:true,force:true});}
});
