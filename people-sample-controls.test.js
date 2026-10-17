const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('./ontology-model'),P=require('./projects'),F=require('./workflow');
const roleFixtures=[
 ['Supervisor --- Unit Leader / 반장','Monitor production, manpower and material status; provide operating direction and coordination with related departments. Preserve approval and coverage evidence.'],
 ['Leader --- Shift Leader / 조장','Compare hourly actual with target; direct shop-floor work and perform first-level analysis. Escalate major delays to Supervisor and report response results.'],
 ['Technician --- Maintenance / MT','Equipment/technical execution, inspection and authorized troubleshooting under Leader/Supervisor instructions. Report abnormalities and technical status updates.'],
 ['Operator / 작업자','Execute assigned standard production work, identify material shortages and request replenishment through the confirmed material-responsible route. Report abnormalities.']
];
const beforeFixtures=[['A. Product definition',4],['B. LOT, QR and traceability --- P0',8],['C. Materials and small parts',6],['D. Machine, program and tooling',9],['TEM',10],['SMT',11],['LDM',5],['E. Process and quality',7],['F. People and coordination',6],['Final start gate',5]];
const bullets=(name,n,escaped=false)=>Array.from({length:n},(_,i)=>'- '+(escaped?'\\[ \\]':'[ ]')+' '+name+' check '+(i+1)+'.');
const source=['# LGIT test reference',...roleFixtures.map(([title,body])=>'### '+title+'\n\n**Purpose:** '+body),'## 2. Suggested ontology','### Phase 1 --- BEFORE production',...beforeFixtures.map(([title,n])=>['TEM','SMT','LDM'].includes(title)?'**'+title+' checks** '+bullets(title,n,true).join(' '):'#### '+title+'\n\n'+bullets(title,n).join('\n')),'### Phase 2 --- DURING production',...['First-piece validation','Ongoing monitoring','Abnormality and containment'].map((title,i)=>'#### '+title+'\n\n'+bullets(title,[5,9,8][i]).join('\n')),'### Phase 3 --- AFTER the sample run',bullets('Closure',7).join('\n'),'## 5. PM rules'].join('\n\n');
const migration=()=>require('./update-people-sample-controls');
function fixture(){
 const g={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]};
 const add=(id,data)=>{const e=M.addEntity(g,data);e.id=id;return e;};
 for(const [id,name]of [['ldm-leaders','LDM · Leader team'],['tem-supervisors','TEM · Supervisor team'],['tem-techs','TEM · Maintenance Technician team'],['smt-leaders','SMT · Leader team']])add(id,{type:'Organization',name,context:'Previously verified area membership.'});
 add('person',{type:'Person',name:'Existing technician'});add('supervisor',{type:'Person',name:'Existing supervisor'});
 M.addRelation(g,{from:'person',type:'reports_to',to:'supervisor',evidence:'Previously verified'});
 for(const id of ['tem-part-bl7m','tem-part-p768-a2'])add(id,{type:'Part',name:id,itemKind:'product',productionFamily:'TEM'});
 for(const id of ['customer-tem-mobis-step-1','customer-tem-mobis-step-17']){add(id,{type:'Production Step',name:id,productionStage:'ICT'});M.addRelation(g,{from:id,type:'applies_to',to:'tem-part-bl7m'});}
 M.addRelation(g,{from:'customer-tem-mobis-step-1',type:'precedes',to:'customer-tem-mobis-step-17'});
 add('machine',{type:'Resource',name:'Existing machine',resourceKind:'machine'});M.addRelation(g,{from:'customer-tem-mobis-step-1',type:'requires',to:'machine'});
 const w={version:2,revision:0,library:g,projects:[],viewSettings:{}};
 for(const name of ['LS','SMT','MOBIS + HELLA']){const p=P.create(name);P.attachMembers(p,g,g.entities.map(e=>e.id));p.relations=g.relations.map(r=>({...r,projectId:p.id}));w.projects.push(p);}
 const customer=w.projects.find(p=>p.name==='MOBIS + HELLA');
 for(const id of ['tem-mobis-gate-3','tem-hella-gate-3']){const e=M.addEntity(customer,{type:'Gate',name:id,status:'in_progress',readiness:'unknown',decision:'not_decided'});e.id=id;}
 const risk=M.addEntity(customer,{type:'Risk',name:'Sample · setup / program revision mismatch',status:'unknown'});risk.id='sample-common-risk-settings';
 const action=M.addEntity(customer,{type:'Work Item',name:'Existing setup mitigation',status:'in_progress',context:'Manual control remains.'});action.id=risk.id+'-mitigation';M.addRelation(customer,{from:action.id,type:'mitigates',to:risk.id});
 return w;
}
test('document checklist parsing retains every checkbox, grouping, explicit priority and exact source',()=>{
 const m=migration(),parsed=m.parse(source),expected=(source.replaceAll('\\[','[').replaceAll('\\]',']').match(/\[ \]/g)||[]).length;
 a.equal(parsed.groups.flatMap(g=>g.items).length,expected);a(expected>80);
 a.equal(parsed.groups.length,14);a.deepEqual([...new Set(parsed.groups.map(g=>g.phase))],['before','during','after']);
 a.equal(parsed.groups.find(g=>g.key==='traceability').priority,'P0');a.equal(parsed.groups.find(g=>g.key==='materials').priority,null);
 a.equal(parsed.groups.find(g=>g.area==='SMT').items.length,11);a(parsed.roles.every(r=>r.text.length>100));
 const w=fixture();m.applyShared(w.library,source);const ev=w.library.entities.find(e=>e.id===m.SOURCE_ID);a.equal(ev.rawLog,source);a.match(ev.context,/SHA-256: [a-f0-9]{64}/);
 for(const group of parsed.groups){const e=M.byId(w.library,m.groupId(group.key));a.equal(e.status,'unknown');a.equal(e.applicability,'pending_review');for(const item of group.items)a(e.context.includes(item));a(w.library.relations.some(r=>r.type==='supported_by'&&r.from===e.id&&r.to===ev.id));}
});
test('roles are guidance only; no HR hierarchy, named assignment, process order or machine changes',()=>{
 const m=migration(),w=fixture(),original=structuredClone(w.library),beforeTeams=new Map(w.library.entities.filter(e=>e.type==='Organization').map(e=>[e.id,e.context]));m.applyShared(w.library,source);
 a.match(M.byId(w.library,'tem-techs').context,/technical execution|Equipment\/technical/i);
 a.match(M.byId(w.library,'ldm-leaders').context,/first-level|hourly/i);a.match(M.byId(w.library,'tem-supervisors').context,/manpower|coordination/i);
 a(w.library.entities.filter(e=>e.type==='Organization').every(e=>e.context.startsWith(beforeTeams.get(e.id))));
 for(const e of original.entities.filter(e=>e.type!=='Organization'))a.deepEqual(M.byId(w.library,e.id),e);
 const operational=r=>['reports_to','reports_via','assigned_to','precedes','requires','qualified_for'].includes(r.type);
 a.deepEqual(w.library.relations.filter(operational),original.relations.filter(operational));
 a.equal(w.library.entities.filter(e=>e.type==='Person').length,2);a.equal(w.library.entities.filter(e=>e.type==='Assignment'||e.type==='Event').length,0);
});
test('project scope reuses risks, preserves gate state, and connects sample controls to process details',()=>{
 const m=migration(),w=fixture();m.applyShared(w.library,source);
 for(const p of w.projects){const before=structuredClone(p);m.applyProject(p,w.library,source);P.validate(p);
  const steps=graph=>F.productionNetwork(graph,{}).nodes.filter(n=>n.entity.type==='Production Step').map(n=>n.id).sort();
  a.deepEqual(steps(p),steps(before));
  a(!F.workstreamLanes(p).entities.some(e=>e.id.startsWith('people-sample-risk-')&&e.type==='Work Item'));
  for(const e of before.entities.filter(e=>e.type!=='Organization'))a.deepEqual(M.byId(p,e.id),e);
  a(!p.relations.some(r=>r.type==='assigned_to'));a.equal(p.entities.filter(e=>e.type==='Event').length,0);
  if(p.name==='MOBIS + HELLA'){
   a.equal(p.entities.filter(e=>e.type==='Risk'&&e.id.startsWith('people-sample-risk-')).length,4);
   a(p.relations.some(r=>r.type==='requires'&&r.from==='tem-mobis-gate-3'&&r.to===m.groupId('traceability')));
   a(!p.relations.some(r=>r.type==='requires'&&r.to===m.groupId('closure')));
   for(const area of ['smt','ldm'])a(!p.relations.some(r=>r.type==='requires'&&r.to===m.groupId(area)||r.type==='applies_to'&&r.from===m.groupId(area)));
   a(p.entities.filter(e=>e.id.startsWith('people-sample-risk-')&&e.type==='Work Item').every(e=>e.qualityKind==='action'));
   a(p.relations.some(r=>r.type==='quality_reference'&&r.from===m.groupId('machine')&&r.to==='sample-common-risk-settings-mitigation'));
   a(F.relatedRisks(p,'customer-tem-mobis-step-1').some(e=>e.id==='people-sample-risk-traceability'));
  }else a.equal(p.entities.filter(e=>e.id.startsWith('people-sample-risk-')).length,0);
  if(p.name==='SMT'){a(M.byId(p,m.groupId('smt')));a(!M.byId(p,m.groupId('tem')));a(!M.byId(p,m.groupId('ldm')));}
 }
 const saved=JSON.stringify(w);a.equal(m.applyShared(w.library,source),false);for(const p of w.projects)a.equal(m.applyProject(p,w.library,source),false);a.equal(JSON.stringify(w),saved);
 const customer=w.projects.find(p=>p.name==='MOBIS + HELLA');customer.workstreams['people-sample-risk-coverage-mitigation']=['logistics'];delete customer.workstreams[m.groupId('materials')];customer.workstreams[m.groupId('people')]=[];
 const manualMemberships=JSON.stringify(customer.workstreams);a.equal(m.applyProject(customer,w.library,source),false);a.equal(JSON.stringify(customer.workstreams),manualMemberships);
 const removed=customer.relations.findIndex(r=>r.type==='quality_reference'&&r.from===m.groupId('traceability'));a(removed>=0);customer.relations.splice(removed,1);const edited=JSON.stringify(customer);a.equal(m.applyProject(customer,w.library,source),false);a.equal(JSON.stringify(customer),edited);
 const manual=M.byId(w.library,m.groupId('materials'));manual.context+='\nManual reviewer note.';a.equal(m.applyShared(w.library,source),false);a.match(manual.context,/Manual reviewer/);
 a.throws(()=>m.applyShared(w.library,source+'\nChanged source.'),/Source changed/);
});
test('revision-checked persistence leaves historical events and observations untouched and retries without writes',async()=>{
 const m=migration(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-people-controls-')),dbPath=path.join(dir,'db.sqlite'),s=require('./local-store').openStore(dbPath);
 try{let w=s.load(),f=fixture();w.projects=f.projects.map(p=>({...p,entities:[],relations:[]}));w=s.save(w,null,w.revision);w.library=f.library;w=s.save(w,'library',w.revision);
  for(const p of f.projects){w=s.load();w.projects[w.projects.findIndex(x=>x.id===p.id)]=p;w=s.save(w,p.id,w.revision);}
  const rev=w.revision;await s.backup(path.join(dir,'before.sqlite'));
  w=s.load();m.applyShared(w.library,source);s.save(w,'library',w.revision);
  for(const name of ['LS','SMT','MOBIS + HELLA']){w=s.load();const p=w.projects.find(x=>x.name===name);if(m.applyProject(p,w.library,source))s.save(w,p.id,w.revision);}
  w=s.load();a.equal(w.revision,rev+4);a.equal(m.applyShared(w.library,source),false);for(const p of w.projects){a.equal(m.applyProject(p,w.library,source),false);a.equal(s.listProgress(p.id).rows.length,0);a.equal(s.listHourly(p.id).length,0);a.equal(s.history.list({scope:p.id}).totalDistinct,0);}a.equal(s.load().revision,w.revision);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
