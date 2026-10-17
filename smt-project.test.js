const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),M=require('./ontology-model'),P=require('./projects'),F=require('./workflow'),{openStore}=require('./local-store'),{setup}=require('./setup-smt');
test('SMT attaches confirmed shared material and staff graph without borrowing TEM routes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-smt-link-')),db=openStore(path.join(dir,'db.sqlite'));
 try{let w=db.load(),ls=P.create('LS');const add=(id,type,name,more={})=>{const e=M.addEntity(ls,{type,name,...more});e.id=id;return e;};
 const line=add('ls-smt-source-line','Resource','SMT',{resourceKind:'line'}),output=add('ls-smt-output-component','Part','SMT output',{itemKind:'component'}),storage=add('ls-material-storage','Resource','Material Storage',{resourceKind:'facility',storageRole:'material_intermediate'}),supplier=add('ls-supplier-starpro','Organization','Starpro'),manager=add('smt-manager','Person','Supervisor'),team=add('smt-team','Organization','SMT · Supervisor team'),storageManager=add('ls-storage-madian','Person','Madian');
 add('tem-smt-step-0','Production Step','TEM SMT template');add('tem-starpro-smt','Resource','Starpro SMT',{resourceKind:'line'});
 for(const [type,from,to] of [['produces',line.id,output.id],['stored_at',output.id,storage.id],['receives_from',storage.id,line.id],['receives_from',storage.id,supplier.id],['works_on',manager.id,line.id],['member_of',manager.id,team.id],['manages',storageManager.id,storage.id]])M.addRelation(ls,{type,from,to,scopeProjectId:null});
 w.projects.push(ls);w=db.save(w,null,w.revision);w.projects[0]=ls;w=db.save(w,ls.id,w.revision);const before=JSON.stringify(w.projects[0]);w=setup(db);const smt=w.projects.find(p=>p.name==='SMT');
 a(smt.entities.some(e=>e.id===output.id));a(smt.entities.some(e=>e.id===manager.id));a(smt.entities.some(e=>e.id===storageManager.id));a(smt.entities.some(e=>e.id===team.id));a(!smt.entities.some(e=>e.id==='tem-smt-step-0'||e.id==='tem-starpro-smt'));a.equal(JSON.stringify(w.projects.find(p=>p.id===ls.id)),before);
 const graph=F.productionNetwork(smt,{line:'SMT',showStakeholders:true});a(graph.nodes.some(n=>n.id===output.id));a(graph.nodes.some(n=>n.id===storage.id));a(graph.nodes.some(n=>n.id===storageManager.id));a(graph.edges.some(e=>e.type==='produces'&&e.from===line.id&&e.to===output.id));
 a(F.productionNetwork(smt,{line:'SMT',showStakeholders:false}).nodes.some(n=>n.id===output.id));const revision=w.revision,w2=setup(db);a.equal(w2.revision,revision);a.equal(w2.projects.find(p=>p.id===smt.id).entities.length,smt.entities.length);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('confirmed G65 PCB is shared SMT output and G65 component, without an invented route',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-smt-pcb-')),db=openStore(path.join(dir,'db.sqlite'));
 try{let w=db.load(),ls=P.create('LS');for(const [id,input] of [['ls-smt-source-line',{type:'Resource',name:'SMT',resourceKind:'line'}],['ls-family-g65',{type:'Part',name:'G65',itemKind:'product'}]]){M.addEntity(ls,input).id=id;}
 w.projects.push(ls);w=db.save(w,null,w.revision);w.projects[0]=ls;w=db.save(w,ls.id,w.revision);setup(db);
 w=require('./setup-smt').addG65PCB(db);const pcb=w.library.entities.find(e=>e.name==='G65 PCB');a(M.isComponentPart(pcb));a(w.library.relations.some(r=>r.type==='produces'&&r.from==='ls-smt-source-line'&&r.to===pcb.id));a(w.library.relations.some(r=>r.type==='part_of'&&r.from===pcb.id&&r.to==='ls-family-g65'));
 for(const name of ['SMT','LS'])a(w.projects.find(p=>p.name===name).entities.some(e=>e.id===pcb.id));a.equal(w.library.entities.filter(e=>e.type==='Production Step').length,0);a.equal(require('./setup-smt').addG65PCB(db).revision,w.revision);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
