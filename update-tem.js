const M=require('./ontology-model'),P=require('./projects');
const evidence='TEM Production PM Master Note v0.1; user confirmation 2026-10-06';
function helpers(p){
  p.workstreams ||= {};
  return {
    object(id,input,codes=['production']){let e=M.byId(p,id);if(!e){e=M.addEntity(p,{status:'planned',...input});e.id=id;}p.workstreams[id]=codes;return e;},
    link(a,type,b,extra={}){if(!p.relations.some(r=>r.from===a.id&&r.to===b.id&&r.type===type))M.addRelation(p,{from:a.id,type,to:b.id,evidence,scopeProjectId:p.id==='library'?null:p.id,...extra});}
  };
}
function knowledge(p){
  const {object:o,link:l}=helpers(p);
  const source=o('tem-source-note',{type:'Evidence',name:'TEM process field note v0.1',context:'Observed route knowledge; explicit TBD retained. User confirmed sample date year 2026 and Starpro SMT source. No raw attachment made public.'});
  const tem=p.entities.find(e=>e.type==='Resource'&&e.resourceKind==='line'&&e.name==='TEM')||o('tem-area',{type:'Resource',name:'TEM',resourceKind:'line',context:'Production area, not a customer project.'});
  for(const n of [1,2,3])o('tem-line-'+n,{type:'Resource',name:'TEM · Line '+n,resourceKind:'line',site:'TEM',context:n===1?'Mobis sample allocation; readiness needs SMT confirmation.':n===2?'HELLA sample allocation; setup in progress.':'New project not named; no product or route inferred.'});
  const starpro=p.entities.find(e=>e.type==='Organization'&&e.name==='Starpro')||o('tem-starpro',{type:'Organization',name:'Starpro'},['purchasing']);
  const smt=o('tem-starpro-smt',{type:'Resource',name:'Starpro SMT',resourceKind:'line',site:'Starpro',context:'User confirmed supply source: Starpro SMT. Separate from internal factory SMT; exact physical identity, ownership and route applicability need verification.'},['production','purchasing','logistics']);
  for(const name of ['HELLA','Mobis','Flex-N-Gate']){const id='tem-customer-'+name.toLowerCase();if(!p.entities.some(e=>e.type==='Organization'&&e.name===name))o(id,{type:'Organization',name,context:'Customer named in source note.'},['commercial']);}
  const customer=name=>p.entities.find(e=>e.type==='Organization'&&e.name===name);
  const hella=o('tem-part-p768-a2',{type:'Part',name:'P768 A-2',itemKind:'product',productionFamily:'TEM',productFamily:'P768',customerId:customer('HELLA').id,context:'HELLA sample model. Exact drawing/revision not supplied.'});
  const mobis=o('tem-part-bl7m',{type:'Part',name:'BL7m PE P',itemKind:'product',productionFamily:'TEM',productFamily:'BL7m',customerId:customer('Mobis').id});
  const biled=o('tem-part-biled',{type:'Part',name:'Flex-N-Gate BiLED',itemKind:'product',productionFamily:'TEM',productFamily:'BiLED',customerId:customer('Flex-N-Gate').id,context:'Field-observed separate product route. Production line unconfirmed. Not attached to HELLA or Mobis.'});
  for(const part of [hella,mobis,biled])l(part,'supported_by',source);
  const component=(id,name,note='')=>o('tem-component-'+id,{type:'Part',name,itemKind:'component',productionFamily:'TEM',context:note||'Observed material category; SKU/specification/quantity not supplied.'});
  const pcb=component('external-pcb','Starpro SMT supplied PCB / material','Supplier source confirmed as Starpro SMT. Item code, state and sample-specific BOM remain unknown. Not automatically equated to bare PCB or internal SMT output.');l(starpro,'supplies',pcb);l(smt,'produces',pcb,{evidence:evidence+'; supply category only, no yield'});
  const solder=component('solder-paste','TEM · Solder paste'),mount=component('mounting','TEM · SMT mounting components'),output=component('smt-finished','TEM SMT route · finished PCB','Generic route output category; applicability to HELLA/Mobis and exact connection to Starpro SMT not confirmed.');
  const smtNames=['Material Input','QR Marking','Solder Paste Printing','SPI','Pick & Place','MOI','Conveyor / Distribution','Reflow Oven','Conveyor / Buffer + Cooling','AOI'];
  function route(prefix,names,part){
    const steps=names.map((name,i)=>o(prefix+'-'+i,{type:'Production Step',name:(prefix.includes('biled')?'BiLED':'TEM SMT template')+' · '+name,productionStage:name,processLevel:'main',context:prefix.includes('biled')?'Observed route; exact criteria and asset identity unknown.':'Provisional current-understanding template; full sequence and application to specific sample lines require verification.'}));
    for(let i=1;i<steps.length;i++)l(steps[i-1],'precedes',steps[i],{evidence:evidence+(part?' · observed BiLED route':' · provisional SMT route; verify sequence')});
    for(const step of steps){l(step,'supported_by',source);if(part)l(step,'applies_to',part);}
    return steps;
  }
  const sr=route('tem-smt-step',smtNames);
  l(sr[0],'consumes',pcb,{reviewState:'unverified'});l(sr[2],'consumes',solder,{reviewState:'unverified'});l(sr[4],'consumes',mount,{reviewState:'unverified'});l(sr[9],'produces',output,{reviewState:'unverified'});
  const bn=['Magazine','ICT','Automatic Router','Automatic Tray Loading','Remove PCB from Tray','BiLED Heatsink Assembly','Section 1 Inspection','Bolt Attachment','Laser Etching / Cleaning','Tray Change','Remove from Stack','LED Bonding','Horno','Cooling','Section 3','Plasma','Wire Bonding','EOL Inspection','Final Area','Automatic Packing'];
  const br=route('tem-biled-step',bn,biled);
  const big=component('biled-big-pcb','BiLED · Big PCB'),small=component('biled-small-pcb','BiLED · Routed small PCB'),tape=component('double-tape','BiLED · Double tape'),sink=component('heatsink','BiLED · Metal heatsink'),bolts=component('bolts','BiLED · Bolts','Count/torque/tool unknown.'),led=component('led','BiLED · LED / bonding input','Exact LED/main-assembly BOM boundary unknown.'),wire=component('wire','BiLED · Bonding wire');
  for(const c of [big,small,tape,sink,bolts,led,wire])l(c,'part_of',biled);
  l(br[2],'consumes',big);l(br[2],'produces',small);for(const c of [small,tape,sink])l(br[5],'consumes',c);l(br[7],'consumes',bolts);l(br[11],'consumes',led);l(br[16],'consumes',wire);
  for(const [i,family,shared] of [[1,'ICT',false],[2,'Router',false],[3,'Tray loader',false],[8,'Laser etching / cleaning',false],[11,'LED bonding',false],[12,'Horno',true],[13,'Cooling',true],[15,'Plasma',false],[16,'Wire bonding',false],[17,'EOL',false],[19,'Automatic packing',false]]){
    const machine=o('tem-biled-equipment-'+i,{type:'Resource',name:'BiLED · '+family+(shared?' · shared':''),resourceKind:[1,17].includes(i)?'test_equipment':'machine',machineFamily:family,...(shared?{machineMode:'shared_pool'}:{}),context:'Equipment family requirement only; asset ID/model/count unconfirmed. '+(i===12?'Observed approx. 2h, fixed time/temperature/purpose unknown.':i===13?'Observed approx. 30min; not confirmed fixed cycle time.':i===19?'Observed 5 trays/cycle; parts per tray unknown.':'')});l(br[i],'requires',machine);
  }
  M.validateStore(p);return {hella:hella.id,mobis:mobis.id,pcb:pcb.id,smt:smt.id};
}
function campaign(p,library,kind){
  const {object:o,link:l}=helpers(p),isH=kind==='hella',partId=isH?'tem-part-p768-a2':'tem-part-bl7m',lineId=isH?'tem-line-2':'tem-line-1';
  const part=M.byId(library,partId),customer=M.byId(library,part.customerId);
  const ids=[partId,lineId,customer.id,'tem-starpro-smt','tem-component-external-pcb'];
  const starpro=library.entities.find(e=>e.type==='Organization'&&e.name==='Starpro');if(starpro)ids.push(starpro.id);
  P.attachMembers(p,library,ids.filter(id=>!p.entities.some(e=>e.id===id)));
  for(const r of library.relations)if(ids.includes(r.from)&&ids.includes(r.to)&&!p.relations.some(x=>x.id===r.id))p.relations.push({...r,projectId:p.id});
  for(const id of ids)p.workstreams[id]=library.workstreams?.[id]||(id===customer.id?['commercial']:['production']);
  const prefix='tem-'+kind+'-',line=M.byId(p,lineId),product=M.byId(p,partId);
  const build=o(prefix+'build',{type:'Build',name:part.name+' · sample production',customerId:customer.id,due:isH?'2026-10-20':'2026-10-23',context:'Planned sample quantity: '+(isH?75:600)+' pcs. Not produced quantity, available stock or WIP.'});
  const stages=isH?[['setup','Line 2 Setup',null,null],['main','Main Process','2026-10-12','2026-10-17'],['inspection','Inspection',null,null],['shipment','Shipment','2026-10-20','2026-10-20']]:[['smt','Starpro SMT supply preparation','2026-10-12','2026-10-16'],['main','Main Process','2026-10-17','2026-10-21'],['inspection','Inspection',null,null],['shipment','Shipment','2026-10-23','2026-10-23']];
  const activities=stages.map(([id,name,start,end])=>o(prefix+id,{type:'Work Item',name:part.name+' · '+name,...(start?{plannedStart:start,plannedEnd:end}:{}),context:id==='setup'?'Setup ongoing; completion date unconfirmed. Must be ready before 2026-10-12.':id==='smt'?'Source confirmed Starpro SMT; readiness still requires confirmation. Must finish by 2026-10-16.':id==='inspection'?'Inspection required before shipment; separate inspection date not supplied.':'Planned activity; physical operation details and actual completion unknown.'},id==='shipment'?['logistics']:id==='inspection'?['quality']:['production']));
  for(const a of activities){l(build,'scopes',a);l(a,'applies_to',product);}
  for(let i=1;i<activities.length;i++)l(activities[i-1],'precedes',activities[i]);l(activities[0],'requires',isH?line:M.byId(p,'tem-starpro-smt'));l(activities[1],'requires',line);
  const gates=['Data Ready','Material Ready','Machine / Line Ready','Sample Run','Planned Production'].map((name,i)=>o(prefix+'gate-'+i,{type:'Gate',name:part.name+' · '+name,context:'Readiness template; no approval or completion asserted.'},['production','quality']));
  for(const [i,name] of ['Drawing','CAD','BOM','Production data','Machine program','Inspection specification','Reference sample'].entries()){const d=o(prefix+'deliverable-'+i,{type:'Deliverable',name:part.name+' · '+name,context:'Required input; file/location/revision/approver not supplied.'},['engineering','quality']);l(d,'required_for',gates[i<5?0:3]);}
  const risk=o(prefix+'readiness-risk',{type:'Risk',name:part.name+' · '+(isH?'Line 2 setup readiness':'SMT delivery readiness'),context:isH?'Line 2 still setting; production planned 2026-10-12. Not a recorded production failure.':'Confirm SMT readiness. Completion by 2026-10-16 is prerequisite to Main Process start 2026-10-17. No actual delay asserted.'});l(risk,'potentially_affects',activities[1]);l(gates[2],'condition_target',activities[1]);
  P.validate(p);
}
module.exports={knowledge,campaign};
if(require.main===module){
  const fs=require('node:fs'),d=require('./local-store').openStore('../.local-data/ontology.sqlite');
  try{
    fs.copyFileSync('../.local-data/ontology.sqlite','../.local-data/ontology-before-tem-import-'+Date.now()+'.sqlite');
    let w=d.load();knowledge(w.library);d.save(w,'library',w.revision);w=d.load();
    for(const name of ['HELLA · P768 A-2','Mobis · BL7m PE P'])if(!w.projects.some(p=>p.name===name))w.projects.push(P.create(name));
    d.save(w,null,w.revision);
    for(const [name,kind] of [['HELLA · P768 A-2','hella'],['Mobis · BL7m PE P','mobis']]){w=d.load();const p=w.projects.find(p=>p.name===name);campaign(p,w.library,kind);d.save(w,p.id,w.revision);}
    w=d.load();const old=w.projects.find(p=>p.name==='TEM');if(old&&old.status!=='archived'){if(old.entities.length)throw Error('TEM no longer empty; archive requires review');old.status='archived';d.save(w,old.id,w.revision);}
    w=d.load();console.log(JSON.stringify({revision:w.revision,projects:w.projects.map(p=>({id:p.id,name:p.name,status:p.status,objects:p.entities.length}))}));
  }finally{d.close();}
}
