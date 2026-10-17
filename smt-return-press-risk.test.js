const {test}=require('node:test'),a=require('node:assert/strict'),M=require('./ontology-model'),F=require('./workflow'),P=require('./projects');
const migration=()=>require('./update-smt-return-press-risk');
function fixture(){
 const g={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]};
 const add=(id,input)=>{const e=M.addEntity(g,input);e.id=id;return e;};
 add('ls-smt-source-line',{type:'Resource',name:'SMT',resourceKind:'line'});
 add('tem-starpro-smt',{type:'Resource',name:'Starpro SMT',resourceKind:'line'});
 add('obj-muuj7txx-793y1',{type:'Production Step',name:'NG storage',productionStage:'NG storage',processLevel:'sub',branchKind:'exception'});
 add('obj-muuj7txx-18p2g',{type:'Production Step',name:'Scrap',productionStage:'Scrap',processLevel:'sub',branchKind:'exception'});
 add('ls-part-t1-2-uplevel',{type:'Part',name:'T1-2 Uplevel',itemKind:'product',productionFamily:'LDM'});
 add('ls-part-t1-2-base',{type:'Part',name:'T1-2 Base',itemKind:'product',productionFamily:'LDM'});
 add('ls-step-t1-2-uplevel-bending',{type:'Production Step',name:'Press bending #1–#5',productionStage:'Press bending #1–#5'});
 add('obj-muuhrk68-l9oj9',{type:'Resource',name:'Press bending #1–#5 · dedicated machine',resourceKind:'machine',machineMode:'specific_asset'});
 add('eol',{type:'Production Step',name:'EOL',productionStage:'EOL'});
 add('base-eol',{type:'Production Step',name:'Base EOL'});
 for(const [from,type,to] of [['ls-step-t1-2-uplevel-bending','applies_to','ls-part-t1-2-uplevel'],['ls-step-t1-2-uplevel-bending','requires','obj-muuhrk68-l9oj9'],['ls-step-t1-2-uplevel-bending','precedes','eol'],['eol','applies_to','ls-part-t1-2-uplevel'],['base-eol','applies_to','ls-part-t1-2-base'],['obj-muuj7txx-793y1','applies_to','ls-part-t1-2-uplevel'],['eol','on_failure','obj-muuj7txx-793y1'],['obj-muuj7txx-793y1','rework_of','eol'],['obj-muuj7txx-793y1','on_failure','obj-muuj7txx-18p2g']])M.addRelation(g,{from,type,to,scopeProjectId:null});
 return g;
}
test('migration has exactly five press machines, unchanged Base and normal sequence, and is idempotent',()=>{
 const g=fixture(),base=JSON.stringify(M.byId(g,'ls-part-t1-2-base')),normal=g.relations.filter(r=>r.type==='precedes');
 a.equal(migration().applyShared(g),true);
 a.equal(M.byId(g,'ls-step-t1-2-uplevel-bending').productionStage,'Pressing');
 const machines=g.relations.filter(r=>r.type==='requires'&&r.from==='ls-step-t1-2-uplevel-bending').map(r=>M.byId(g,r.to));
 a.equal(machines.length,5);a(machines.every(e=>e.resourceKind==='machine'&&!e.assetId));
 a.deepEqual(machines.map(e=>e.tier),Array.from({length:5},(_,i)=>'T1-2 Uplevel / Pressing '+(i+1)));
 a.equal(M.byId(g,'obj-muuhrk68-l9oj9').resourceKind,'other');
 a.equal(JSON.stringify(M.byId(g,'ls-part-t1-2-base')),base);
 a.deepEqual(g.relations.filter(r=>r.type==='precedes'&&!M.byId(g,r.from).parentWorkId),normal);
 a.equal(migration().applyShared(g),false);M.validateStore(g);
});
test('source-SMT return is conditional, separates external origin and cannot bypass retest or count as Progress',()=>{
 const g=fixture();migration().applyShared(g);
 for(const [prefix,line] of [['smt-origin-internal','ls-smt-source-line'],['smt-origin-starpro','tem-starpro-smt']]){
  const repair=M.byId(g,prefix+'-repair'),check=M.byId(g,prefix+'-reinspection');
  a.equal(repair.branchKind,'rework');a(g.relations.some(r=>r.type==='operated_in'&&r.from===repair.id&&r.to===line));
  a.match(g.relations.find(r=>r.from==='obj-muuj7txx-793y1'&&r.to===repair.id).evidence,/confirmed.*origin/i);
  a(g.relations.some(r=>r.type==='precedes'&&r.from===repair.id&&r.to===check.id));
  a(!g.relations.some(r=>r.from===repair.id&&r.to==='eol'));
  a(g.relations.some(r=>r.type==='rework_of'&&r.from===check.id&&r.to==='eol'));
 }
 a(!g.relations.some(r=>['consumes','produces'].includes(r.type)&&r.from.startsWith('smt-origin-')));
 a.match(g.relations.find(r=>r.from==='obj-muuj7txx-793y1'&&r.type==='rework_of').evidence,/SMT-origin/);
 const graph=F.productionNetwork(g,{line:'LDM',partIds:['ls-part-t1-2-uplevel']}),layout=F.productionContextLayout(g,graph);
 a(graph.nodes.some(n=>n.id==='smt-origin-internal-repair'));
 for(const id of ['smt-origin-internal-repair','smt-origin-starpro-repair'])a(layout.positions[id].x>layout.positions.eol.x+194);
 const rectangles=graph.nodes.filter(n=>n.entity.type==='Production Step').map(n=>({...layout.positions[n.id],w:194,h:60,id:n.id}));
 for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){const x=rectangles[i],y=rectangles[j];a(!(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y),x.id+' overlaps '+y.id);}
 a(!require('./progress').projection(graph).nodes.some(n=>n.entity.id.startsWith('smt-origin-')));
 a(F.productionNetwork(g,{line:'SMT'}).nodes.some(n=>n.id==='smt-origin-internal-repair'));
});
test('project Risk actions link equipment/process without fabricated owners or completed evidence',()=>{
 const g=fixture();migration().applyShared(g);const p=P.create('LS');P.attachMembers(p,g,['ls-part-t1-2-uplevel','ls-step-t1-2-uplevel-bending','eol','obj-muuj7txx-793y1']);
 a.equal(migration().applyProject(p,g),true);
 const risk=p.entities.find(e=>e.type==='Risk'&&e.id.includes('press-cleanliness'));
 a(risk);a.deepEqual(p.relations.filter(r=>r.from===risk.id&&M.byId(p,r.to)?.resourceKind==='machine').map(r=>r.to),['t1-2-uplevel-press-3','t1-2-uplevel-press-4']);
 a(!p.relations.some(r=>r.from===risk.id&&r.to==='ls-step-t1-2-uplevel-bending'));
 a(p.relations.some(r=>r.type==='mitigates'&&r.to===risk.id));
 a.equal(p.entities.filter(e=>['Event','Assignment','Evidence'].includes(e.type)).length,0);
 a(F.relatedRisks(p,'ls-step-t1-2-uplevel-bending').some(e=>e.id===risk.id));
 a.equal(migration().applyProject(p,g),false);P.validate(p);
});
test('sample common Risk actions are project-specific candidates and preserve existing readiness',()=>{
 const g=fixture();migration().applyShared(g);const p=P.create('MOBIS + HELLA');
 for(const id of ['tem-mobis-main','tem-hella-main']){const e=M.addEntity(p,{type:'Work Item',name:id,status:'planned'});e.id=id;}
 migration().applyProject(p,g);
 a.equal(p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('sample-common-risk-')).length,8);
 for(const risk of p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('sample-common-risk-'))){a.equal(risk.status,'unknown');a(p.relations.some(r=>r.type==='mitigates'&&r.to===risk.id));}
 a.equal(p.entities.filter(e=>e.type==='Assignment'||e.type==='Event').length,0);
 a.equal(M.byId(p,'tem-mobis-main').status,'planned');P.validate(p);
});
test('revision-checked persistence preserves other records and retry does not write',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-press-risk-'));
 const s=require('./local-store').openStore(path.join(dir,'db.sqlite'));
 try{
  let w=s.load();w.projects.push(P.create('LS'),P.create('SMT'),P.create('MOBIS + HELLA'));w=s.save(w,null,w.revision);
  w.library=fixture();w=s.save(w,'library',w.revision);
  const part=M.byId(w.library,'ls-part-t1-2-base');P.attachMembers(w.projects[0],w.library,[part.id]);w=s.save(w,w.projects[0].id,w.revision);
  migration().applyShared(w.library);w=s.save(w,'library',w.revision);
  for(const name of ['LS','SMT','MOBIS + HELLA']){w=s.load();const p=w.projects.find(p=>p.name===name);migration().applyProject(p,w.library);w=s.save(w,p.id,w.revision);}
  const revision=w.revision;w=s.load();a.equal(migration().applyShared(w.library),false);
  for(const p of w.projects)a.equal(migration().applyProject(p,w.library),false);
  a.equal(s.load().revision,revision);a.equal(s.listProgress(w.projects[0].id).snapshots.length,0);
  a.equal(s.history.list({scope:w.projects[0].id}).totalDistinct,0);
  a.equal(M.byId(w.projects[0],part.id).name,part.name);
  for(const p of w.projects)P.validate(p);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
