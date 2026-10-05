const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('./ontology-model.js'),P=require('./projects.js'),F=require('./workflow.js'),Logs=require('./production-logs.js');
const {openStore}=require('./local-store.js');
function fixture(){
  const project=P.create('Production logs');
  const part=M.addEntity(project,{type:'Part',name:'G65',itemKind:'product'});
  const router=M.addEntity(project,{type:'Production Step',name:'G65 · Router',productionStage:'Router'});
  const lam=M.addEntity(project,{type:'Production Step',name:'G65 · LAM',productionStage:'LAM'});
  for(const step of [router,lam])M.addRelation(project,{from:step.id,type:'applies_to',to:part.id});
  M.addRelation(project,{from:router.id,type:'precedes',to:lam.id});
  return {project,part,router,lam};
}
function ingest(f,lines,traceKind='unit'){
  const text='trace_id,step,event,timestamp\n'+lines.join('\n'),draft=Logs.preview(f.project,f.part.id,text);
  return Logs.append(f.project,{partId:f.part.id,text,rows:draft.rows,traceKind});
}
test('CSV/TSV previews preserve raw text and require explicit timestamps and Part-specific operations',()=>{
  const f=fixture(),source='serial\tprocess\tstatus\ttime\nABC\tRouter\tstart\t2026-10-04T09:12:00-06:00';
  const draft=Logs.preview(f.project,f.part.id,source);
  assert.equal(draft.rows[0].stepId,f.router.id);assert.equal(draft.rows[0].kind,'started');assert.equal(draft.rows[0].error,'');
  assert.equal(f.project.entities.filter(e=>e.type==='Event').length,0);
  assert.match(Logs.rowError(f.project,f.part.id,{...draft.rows[0],occurredAt:'2026-10-04T09:12:00'}),/timezone/);
  assert.match(Logs.rowError(f.project,f.part.id,{...draft.rows[0],traceId:2}),/identifier/);
  assert.equal(M.isTimestamp('2026-02-30T09:00:00Z'),false);
  assert.equal(M.isTimestamp('2026-10-04T25:00:00Z'),false);
  const result=Logs.append(f.project,{partId:f.part.id,text:source,rows:draft.rows});
  assert.equal(result.evidence.rawLog,source);assert.equal(result.added,1);
  assert.equal(Logs.linkedEvents(f.project)[0].event.occurredAt,'2026-10-04T15:12:00.000Z');
});
test('unknown format can be retained without inventing event rows; excluded invalid rows do not commit',()=>{
  const f=fixture(),text='Marta reports a stoppage; exact time is unknown.';
  assert.equal(Logs.preview(f.project,f.part.id,text).rawOnly,true);
  const result=Logs.append(f.project,{partId:f.part.id,text});
  assert.equal(result.added,0);assert.equal(Logs.pending(f.project).length,0);
  const before=f.project.entities.length;
  assert.throws(()=>Logs.append(f.project,{partId:f.part.id,text,rows:[{traceId:'X',stepId:f.router.id,kind:'started',occurredAt:'invalid'}]}),/Row/);
  assert.equal(f.project.entities.length,before);
  assert.equal(Logs.append(f.project,{partId:f.part.id,text,rows:[{include:false}]}).added,0);
});
test('pending measures earliest arrival to start; deduplicates, isolates serials and retains provenance',()=>{
  const f=fixture(),lines=['A,Router,arrived,2026-10-04T09:00:00-06:00','A,Router,arrived,2026-10-04T09:05:00-06:00','A,Router,started,2026-10-04T09:12:00-06:00','A,Router,started,2026-10-04T09:13:00-06:00','B,Router,arrived,2026-10-04T09:00:00-06:00','C,Router,started,2026-10-04T09:15:00-06:00'];
  const first=ingest(f,lines);assert.equal(first.added,6);
  assert.equal(ingest(f,lines).duplicates,6);
  const intervals=Logs.pending(f.project);assert.equal(intervals.length,1);assert.equal(intervals[0].seconds,720);
  assert.equal(intervals[0].basis,'arrival → start');assert.deepEqual(intervals[0].sourceIds,[first.evidence.id]);
  assert.equal(Logs.metric(f.project,f.router.id).seconds,720);
  assert.equal(Logs.pending(f.project,{partIds:[]}).length,0);
  assert.equal(Logs.pending(f.project,{start:'2026-10-05'}).length,0);
  assert.equal(F.workstreamLanes(f.project).lanes.some(lane=>lane.items.some(node=>node.entity.productionEventKind)),false);
});
test('previous completion fallback requires confirmed adjacency and cannot count a failed retry twice',()=>{
  const f=fixture();
  ingest(f,['A,Router,completed,2026-10-04T09:00:00Z','A,LAM,started,2026-10-04T09:20:00Z','A,LAM,failed,2026-10-04T09:21:00Z','A,LAM,started,2026-10-04T09:25:00Z']);
  assert.equal(Logs.pending(f.project).length,1);assert.equal(Logs.pending(f.project)[0].seconds,1200);
  assert.equal(Logs.pending(f.project)[0].basis,'previous completion → start');
  f.project.relations=f.project.relations.filter(r=>r.type!=='precedes');assert.equal(Logs.pending(f.project).length,0);
});
test('batch and unit IDs remain separate, and reversed timestamps do not produce negative durations',()=>{
  const f=fixture();
  ingest(f,['X,Router,arrived,2026-10-04T10:00:00Z'],'batch');
  ingest(f,['X,Router,started,2026-10-04T10:30:00Z'],'unit');
  ingest(f,['Y,Router,started,2026-10-04T10:00:00Z','Y,Router,arrived,2026-10-04T10:05:00Z']);
  assert.equal(Logs.pending(f.project).length,0);
  ingest(f,['X,Router,started,2026-10-04T10:40:00Z'],'batch');
  assert.equal(Logs.pending(f.project)[0].seconds,2400);
});
test('blank operation labels never match an operation with no recorded stage',()=>{
  const f=fixture();delete f.router.productionStage;
  const draft=Logs.preview(f.project,f.part.id,'trace_id,step,event,timestamp\nA,,arrived,2026-10-04T09:00:00Z');
  assert.equal(draft.rows[0].stepId,'');assert.match(draft.rows[0].error,/operation/);
});
test('unknown trace kind is neither paired with unit events nor treated as an import duplicate',()=>{
  const f=fixture();
  ingest(f,['X,Router,arrived,2026-10-04T09:00:00Z','X,Router,started,2026-10-04T09:12:00Z']);
  const arrival=f.project.entities.find(e=>e.productionEventKind==='arrived');delete arrival.traceKind;
  assert.equal(Logs.pending(f.project).length,0);
  assert.equal(ingest(f,['X,Router,arrived,2026-10-04T09:00:00Z']).added,1);
  assert.equal(Logs.pending(f.project)[0].seconds,720);
});
test('date filters use actual UTC day even for manually edited offset timestamps',()=>{
  const f=fixture();
  ingest(f,['X,Router,arrived,2026-10-05T04:00:00Z','X,Router,started,2026-10-05T05:00:00Z']);
  f.project.entities.find(e=>e.productionEventKind==='started').occurredAt='2026-10-04T23:00:00-06:00';
  assert.equal(Logs.pending(f.project,{start:'2026-10-05',end:'2026-10-05'}).length,1);
  assert.equal(Logs.pending(f.project,{end:'2026-10-04'}).length,0);
  assert.equal(Logs.pending(f.project)[0].endedAt,'2026-10-05T05:00:00.000Z');
});
test('shared SQLite retains source/events and supports reverting the whole reviewed append',()=>{
  const f=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'production-logs-')),db=openStore(path.join(dir,'ontology.sqlite'));
  try {
    let ws=db.load();ws.projects.push(f.project);ws=db.save(ws,null,ws.revision);
    ws.projects[ws.projects.findIndex(project=>project.id===f.project.id)]=f.project;
    ws=db.save(ws,f.project.id,ws.revision);
    const project=ws.projects.find(p=>p.id===f.project.id),text='trace_id,step,event,timestamp\nA,Router,arrived,2026-10-04T09:00:00Z\nA,Router,started,2026-10-04T09:12:00Z';
    Logs.append(project,{partId:f.part.id,text,rows:Logs.preview(project,f.part.id,text).rows});
    ws=db.save(ws,f.project.id,ws.revision);
    const loaded=db.load().projects.find(p=>p.id===f.project.id);
    assert.equal(Logs.metric(loaded,f.router.id).seconds,720);
    assert.equal(loaded.entities.find(e=>e.rawLog)?.rawLog,text);
    assert.ok(db.load().library.entities.some(e=>e.rawLog===text));
    db.revertChange(ws.pendingChange.id,ws.revision);
    const reverted=db.load().projects.find(p=>p.id===f.project.id);
    assert.equal(Logs.pending(reverted).length,0);assert.equal(reverted.entities.filter(e=>e.rawLog).length,0);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
