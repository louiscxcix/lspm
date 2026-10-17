'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {DatabaseSync} = require('node:sqlite');
const Projects = require('./projects.js');
const Model = require('./ontology-model.js');
const Ingest = require('./ingestion.js');
const ASSESSMENT_FIELDS = new Set(['power','influence','currentRole','desiredRole','currentEngagement','desiredEngagement','assessmentNote','assessedOn']);
const PROJECT_SCHEDULE_FIELDS = new Set(['status',...Model.DATE_FIELDS.filter(field=>field!=='assessedOn')]);
const CORE_CHANGE_TABLES={projects:['id'],entities:['id'],project_memberships:['project_id','entity_id'],project_assessments:['project_id','entity_id'],project_schedules:['project_id','entity_id'],project_workstreams:['project_id','entity_id','code'],project_view_settings:['project_id','view_key'],relations:['id'],entity_changes:['id'],ingestion_jobs:['id']};
const CHANGE_TABLES={...CORE_CHANGE_TABLES,wip_snapshots:['id'],wip_counts:['id'],staffing_counts:['id'],production_staffing_counts:['id'],hourly_records:['id']};

function openStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), {recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_memberships (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_assessments (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), data_json TEXT NOT NULL, PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_schedules (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), data_json TEXT NOT NULL, PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_workstreams (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), code TEXT NOT NULL, PRIMARY KEY(project_id, entity_id, code));
    CREATE TABLE IF NOT EXISTS relations (id TEXT PRIMARY KEY, type TEXT NOT NULL, from_id TEXT NOT NULL REFERENCES entities(id), to_id TEXT NOT NULL REFERENCES entities(id), scope_project_id TEXT REFERENCES projects(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_view_settings (project_id TEXT NOT NULL, view_key TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(project_id, view_key));
    CREATE TABLE IF NOT EXISTS entity_changes (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), project_id TEXT REFERENCES projects(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ingestion_jobs (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), status TEXT NOT NULL, draft_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS change_sets (id TEXT PRIMARY KEY, scope TEXT, recorded_at TEXT NOT NULL, revision INTEGER NOT NULL, items_json TEXT NOT NULL, rows_json TEXT NOT NULL, acknowledged_at TEXT, reverted_at TEXT, revert_of TEXT);
    CREATE TABLE IF NOT EXISTS wip_snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), captured_at TEXT NOT NULL, filename TEXT NOT NULL, sheet TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wip_counts (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES wip_snapshots(id), source_row INTEGER NOT NULL, source_column INTEGER NOT NULL, product_code TEXT NOT NULL, part_label TEXT NOT NULL, part_id TEXT REFERENCES entities(id), stage_label TEXT NOT NULL, step_id TEXT REFERENCES entities(id), quantity INTEGER NOT NULL CHECK(quantity>=0));
    CREATE INDEX IF NOT EXISTS wip_counts_snapshot ON wip_counts(snapshot_id,source_row,source_column);
    CREATE TABLE IF NOT EXISTS staffing_counts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), part_id TEXT NOT NULL REFERENCES entities(id), captured_at TEXT NOT NULL, shift TEXT NOT NULL, basis TEXT NOT NULL, count INTEGER NOT NULL CHECK(count>=0), note TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS production_staffing_counts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), target_id TEXT NOT NULL REFERENCES entities(id), target_type TEXT NOT NULL CHECK(target_type IN ('Production Step','Resource')), captured_at TEXT NOT NULL, shift TEXT NOT NULL, basis TEXT NOT NULL CHECK(basis IN ('observed','planned')), count INTEGER NOT NULL CHECK(count>=0), note TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS production_staffing_project ON production_staffing_counts(project_id,captured_at);
    INSERT OR IGNORE INTO meta(key,value) VALUES ('revision','0'),('schema_version','2');
    UPDATE meta SET value='2' WHERE key='schema_version' AND value='1';
    UPDATE meta SET value='3' WHERE key='schema_version' AND value='2';
    UPDATE meta SET value='4' WHERE key='schema_version' AND value='3';
  `);
  if(Number(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value)>5)throw Error('Database was created by a newer app version.');
  if(!db.prepare('PRAGMA table_info(projects)').all().some(column=>column.name==='project_type'))db.exec("ALTER TABLE projects ADD COLUMN project_type TEXT CHECK(project_type IS NULL OR project_type IN ('program','sample','npi','improvement','shared'))");
  db.exec('CREATE TABLE IF NOT EXISTS hourly_records(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),data_json TEXT NOT NULL,recorded_at TEXT NOT NULL,revision INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS hourly_project ON hourly_records(project_id,revision)');
  const history=require('./history-store')(db,load);
  const hourly=require('./hourly-store')(db,load,history);
  const preparation=require('./sample-preparation-store')(db,load);
  db.prepare("UPDATE meta SET value='5' WHERE key='schema_version'").run();
  const read = (sql, ...params) => db.prepare(sql).all(...params);
  const rowKey=(table,row)=>JSON.stringify(CHANGE_TABLES[table].map(column=>row[column]));
  const snapshot=()=>Object.fromEntries(Object.keys(CORE_CHANGE_TABLES).map(table=>[table,read('SELECT * FROM '+table)]));
  function rowDiff(before,after){
    const rows=[];
    for(const table of Object.keys(before)){
      const left=new Map(before[table].map(row=>[rowKey(table,row),row]));
      const right=new Map(after[table].map(row=>[rowKey(table,row),row]));
      for(const key of new Set([...left.keys(),...right.keys()])){
        const prior=left.get(key)||null,next=right.get(key)||null;
        if(!isDeepStrictEqual(prior,next))rows.push({table,key:JSON.parse(key),before:prior,after:next});
      }
    }
    return rows;
  }
  function changeItems(rows,before,after){
    const entities=new Map([...before.entities,...after.entities].map(row=>[row.id,JSON.parse(row.data_json)]));
    const name=id=>entities.get(id)?.name||id;
    const fields=(prior,next)=>[...new Set([...Object.keys(prior||{}),...Object.keys(next||{})])].filter(key=>key!=='projectId'&&!isDeepStrictEqual(prior?.[key],next?.[key])).map(key=>({key,before:prior?.[key]??null,after:next?.[key]??null}));
    const items=[];
    for(const row of rows){
      if(row.table==='entity_changes')continue;
      const action=!row.before?'Added':!row.after?'Removed':'Updated';
      if(row.table==='entities'){
        const prior=row.before?JSON.parse(row.before.data_json):null,next=row.after?JSON.parse(row.after.data_json):null,entity=next||prior;
        items.push({action,label:entity.type+' · '+entity.name,fields:row.before&&row.after?fields(prior,next):[]});
      }else if(row.table==='relations'){
        const relation=row.after||row.before;
        items.push({action,label:'Connection · '+name(relation.from_id)+' '+relation.type+' '+name(relation.to_id)});
      }else if(row.table==='project_memberships'){
        const member=row.after||row.before;
        items.push({action,label:'Project selection · '+name(member.entity_id)});
      }else if(row.table==='project_workstreams'){
        const lane=row.after||row.before,code=Model.WORKSTREAMS.find(item=>item.code===lane.code)?.label||lane.code;
        items.push({action,label:'Workstream · '+code+' · '+name(lane.entity_id)});
      }else if(['project_assessments','project_schedules'].includes(row.table)){
        const record=row.after||row.before,prior=row.before?JSON.parse(row.before.data_json):null,next=row.after?JSON.parse(row.after.data_json):null;
        items.push({action,label:(row.table==='project_assessments'?'Stakeholder assessment':'Schedule')+' · '+name(record.entity_id),fields:fields(prior,next)});
      }else if(row.table==='projects'){
        const prior=row.before,next=row.after,changed=prior&&next?fields(prior,next).filter(field=>!['id','created_at','updated_at'].includes(field.key)):[];
        if(changed.length||!prior||!next)items.push({action,label:'Project · '+(next||prior).name,fields:changed});
      }else if(row.table==='ingestion_jobs')items.push({action:'Saved',label:'Reviewed AI extraction'});
    }
    return items.length?items:[{action:'Saved',label:'Project update'}];
  }
  const publicChange=row=>row?{id:row.id,scope:row.scope,recordedAt:row.recorded_at,revision:row.revision,items:JSON.parse(row.items_json),acknowledgedAt:row.acknowledged_at,revertedAt:row.reverted_at,revertOf:row.revert_of}:null;
  function listChanges(scope,offset=0,date=''){
    if(scope!=='library'&&!db.prepare('SELECT id FROM projects WHERE id=?').get(scope))throw Error('Unknown project.');
    if(!Number.isInteger(offset)||offset<0||offset>100000||date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid history filter.');
    const rows=scope==='library'
      ?read("SELECT * FROM change_sets WHERE (?='' OR substr(recorded_at,1,10)=?) ORDER BY rowid DESC LIMIT 51 OFFSET ?",date,date,offset)
      :read("SELECT * FROM change_sets WHERE scope=? AND (?='' OR substr(recorded_at,1,10)=?) ORDER BY rowid DESC LIMIT 51 OFFSET ?",scope,date,date,offset);
    return {changes:rows.slice(0,50).map(publicChange),more:rows.length>50};
  }
  function pendingChange(){
    return publicChange(db.prepare('SELECT * FROM change_sets WHERE acknowledged_at IS NULL AND reverted_at IS NULL AND revert_of IS NULL ORDER BY rowid DESC LIMIT 1').get());
  }
  function load() {
    const revision = Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value);
    const entities = read('SELECT data_json FROM entities ORDER BY rowid').map(row => JSON.parse(row.data_json));
    const relations = read('SELECT data_json,scope_project_id FROM relations ORDER BY rowid').map(row => ({...JSON.parse(row.data_json),scopeProjectId:row.scope_project_id}));
    const changes = read('SELECT project_id,data_json FROM entity_changes ORDER BY rowid').map(row => ({scope:row.project_id,change:JSON.parse(row.data_json)}));
    const library = {id:'library', name:'Global Library', status:'active', version:2, entities:entities.map(e => ({...e, projectId:'library'})), relations:relations.map(r => ({...r,projectId:'library'})), changes:changes.filter(c => !c.scope).map(c => c.change)};
    const memberships = read('SELECT project_id, entity_id FROM project_memberships');
    const assessments = new Map(read('SELECT project_id,entity_id,data_json FROM project_assessments').map(row => [row.project_id+':'+row.entity_id, JSON.parse(row.data_json)]));
    const schedules = new Map(read('SELECT project_id,entity_id,data_json FROM project_schedules').map(row => [row.project_id+':'+row.entity_id, JSON.parse(row.data_json)]));
    const lanes=read('SELECT project_id,entity_id,code FROM project_workstreams');
    const projects = read('SELECT * FROM projects ORDER BY rowid').map(row => ({
      id:row.id, name:row.name, status:row.status, createdAt:row.created_at, updatedAt:row.updated_at, version:2,
      ...(row.project_type==null?{}:{projectType:row.project_type}),
      entities:entities.filter(e => memberships.some(m => m.project_id===row.id && m.entity_id===e.id)).map(e => ({...e, ...assessments.get(row.id+':'+e.id), ...schedules.get(row.id+':'+e.id), projectId:row.id})),
      relations:relations.filter(r => (!r.scopeProjectId || r.scopeProjectId===row.id) && memberships.some(m => m.project_id===row.id && m.entity_id===r.from) && memberships.some(m => m.project_id===row.id && m.entity_id===r.to)).map(r => ({...r,projectId:row.id})),
      changes:changes.filter(c => (!c.scope || c.scope===row.id) && memberships.some(m => m.project_id===row.id && m.entity_id===c.change.entityId)).map(c => c.change),
      workstreams:Object.fromEntries([...new Set(lanes.filter(item=>item.project_id===row.id).map(item=>item.entity_id))].map(id=>[id,lanes.filter(item=>item.project_id===row.id&&item.entity_id===id).map(item=>item.code)]))
    }));
    const viewSettings = {};
    for (const row of read('SELECT project_id,view_key,data_json FROM project_view_settings')) {
      (viewSettings[row.project_id] ||= {})[row.view_key] = JSON.parse(row.data_json);
    }
    const projectAliases=Object.fromEntries(Object.entries(viewSettings).filter(([,settings])=>settings.overview?.mergedInto).map(([id,settings])=>[id,settings.overview.mergedInto]));
    return {revision, library, projects, viewSettings,projectAliases,pendingChange:pendingChange()};
  }
  function putSettings(projectId, viewKey, data) {
    if (projectId!=='library' && !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId)) throw Error('Unknown project.');
    if (!['overview','production','stakeholders','library','universalGroups','eventHistory',...Model.WORKSTREAMS.map(item=>'lens-'+item.code)].includes(viewKey) || !data || Array.isArray(data) || typeof data!=='object') throw Error('Invalid view settings.');
    const value=JSON.stringify(data);
    if (value.length>16000) throw Error('View settings exceed 16 KB.');
    db.prepare('INSERT INTO project_view_settings(project_id,view_key,data_json) VALUES (?,?,?) ON CONFLICT(project_id,view_key) DO UPDATE SET data_json=excluded.data_json').run(projectId,viewKey,value);
    return data;
  }
  function exportAll() {
    return {
      format:'pm-process-twin-local', version:1, exportedAt:new Date().toISOString(),
      revision:load().revision,
      projects:read('SELECT * FROM projects'),
      entities:read('SELECT * FROM entities'),
      relations:read('SELECT * FROM relations'),
      memberships:read('SELECT * FROM project_memberships'),
      assessments:read('SELECT * FROM project_assessments'),
      projectSchedules:read('SELECT * FROM project_schedules'),
      workstreams:read('SELECT * FROM project_workstreams'),
      viewSettings:read('SELECT * FROM project_view_settings'),
      hourlyRecords:read('SELECT * FROM hourly_records'),
      changes:read('SELECT * FROM entity_changes'),
      changeSets:read('SELECT * FROM change_sets'),
      sources:read('SELECT * FROM sources').map(row => ({...row,content:Buffer.from(row.content).toString('base64')})),
      ingestionJobs:read('SELECT * FROM ingestion_jobs'),
      eventChangeProposals:read('SELECT * FROM event_change_proposals'),
      wipSnapshots:read('SELECT * FROM wip_snapshots'),
      wipCounts:read('SELECT * FROM wip_counts'),
      staffingCounts:read('SELECT * FROM staffing_counts'),
      productionStaffingCounts:read('SELECT * FROM production_staffing_counts')
    };
  }
  function listWip(projectId,snapshotId='') {
    if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw Error('Unknown project.');
    const snapshots=read('SELECT id,captured_at,filename,sheet,created_at FROM wip_snapshots WHERE project_id=? ORDER BY captured_at DESC,created_at DESC LIMIT 100',projectId).map(row=>({id:row.id,capturedAt:row.captured_at,filename:row.filename,sheet:row.sheet,createdAt:row.created_at}));
    const selected=snapshotId||snapshots[0]?.id||'';
    if(selected&&!db.prepare('SELECT id FROM wip_snapshots WHERE id=? AND project_id=?').get(selected,projectId))throw Error('Unknown WIP snapshot.');
    const counts=selected?read('SELECT source_row,source_column,product_code,part_label,part_id,stage_label,step_id,quantity FROM wip_counts WHERE snapshot_id=? ORDER BY source_row,source_column',selected).map(row=>({row:row.source_row,column:row.source_column,code:row.product_code,partName:row.part_label,partId:row.part_id||'',stage:row.stage_label,stepId:row.step_id||'',quantity:row.quantity})):[];
    return {snapshots,selected,counts};
  }
  function listProgress(projectId){
    if(!load().projects.some(p=>p.id===projectId))throw Error('Unknown project.');
    const snapshots=read('SELECT id,captured_at,filename,sheet,created_at FROM wip_snapshots WHERE project_id=? ORDER BY captured_at,created_at LIMIT 2000',projectId).map(r=>({id:r.id,capturedAt:r.captured_at,createdAt:r.created_at,unit:r.sheet.startsWith('Progress · ')?r.sheet.slice(11):'pcs'}));
    const ids=new Set(snapshots.map(s=>s.id)),byId=new Map(snapshots.map(s=>[s.id,s]));
    for(const job of read("SELECT draft_json FROM ingestion_jobs WHERE status='committed' AND json_extract(draft_json,'$.scope')=?",projectId)){const saved=JSON.parse(job.draft_json).committed;for(const id of saved?.snapshotIds||[]){const snapshot=byId.get(id);if(snapshot)snapshot.eventId=saved.eventIds?.[0]||'';}}
    const rows=read('SELECT c.* FROM wip_counts c JOIN wip_snapshots s ON s.id=c.snapshot_id WHERE s.project_id=? ORDER BY s.captured_at,s.created_at LIMIT 100000',projectId).filter(r=>ids.has(r.snapshot_id)&&r.part_id&&r.step_id).map(r=>({...byId.get(r.snapshot_id),snapshotId:r.snapshot_id,partId:r.part_id,stepId:r.step_id,code:r.product_code,partName:r.part_label,stage:r.stage_label,row:r.source_row,column:r.source_column,quantity:r.quantity}));
    return {snapshots,rows};
  }
  function saveProgress(input){
    const G=require('./progress'),w=load(),p=w.projects.find(p=>p.id===input.projectId);
    if(!p||p.status==='archived')throw Error('Open an active project.');if(input.revision!==w.revision)throw Error('STALE_REVISION');
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>200000)throw Error('Paste 1–200,000 characters.');G.validate(p,input.rows);
    const normalized=input.rows.map(r=>({partId:r.partId,stepId:r.stepId,capturedAt:G.timestamp(r.capturedAt),quantity:r.quantity,unit:G.unitKey(r.unit),code:Model.byId(p,r.partId).modelCode||'',row:Number.isSafeInteger(r.row)?r.row:1,column:Number.isSafeInteger(r.column)?r.column:1,stage:Model.byId(p,r.stepId).productionStage||Model.byId(p,r.stepId).name}));
    const key=require('node:crypto').createHash('sha256').update(JSON.stringify(normalized)).update(input.text).digest('hex');
    const source=history.source({scope:p.id,text:input.text,filename:'Production Progress · WIP',metadata:{provider:'progress',externalId:key,workstream:'production'}});
    const old=db.prepare("SELECT draft_json FROM ingestion_jobs WHERE source_id=? AND status='committed'").get(source.sourceId);if(old)return {...JSON.parse(old.draft_json).committed,duplicate:true,workspace:load()};
    if(input.uploadTime===true){const uploadedAt=new Date().toISOString();for(const row of normalized)row.capturedAt=uploadedAt;}
    const job=history.newJob(source.sourceId,p.id),ready=history.finishJob(job.jobId,{events:[{title:'WIP 관측 · '+new Set(normalized.map(r=>r.capturedAt)).size+' 시점 / '+new Set(normalized.map(r=>r.partId)).size+' Part',summary:'Reviewed '+normalized.length+' WIP observations. Counts are observations, not production output. Existing process structure unchanged.',kind:'observation',statementMode:'observed_fact',verification:'reported',reportedAt:normalized.at(-1).capturedAt,subjectIds:[...new Set(normalized.flatMap(r=>[r.partId,r.stepId]))],sourceExcerpt:input.text.slice(0,4000),facets:['production'],proposals:[]}],dispositions:[{action:'event',text:'Reviewed WIP input; original source retained.'}]});
    const result=history.commit({jobId:ready.jobId,selectedCandidateIds:ready.draft.events.map(e=>e.candidateId),revision:input.revision,progressRows:normalized,confirmCorrections:input.confirmCorrections===true});return {...result,workspace:load()};
  }
  function saveWip({projectId,revision,capturedAt,filename,sheet,rows}) {
    if(revision!==load().revision)throw Error('STALE_REVISION');
    const project=load().projects.find(item=>item.id===projectId);
    if(!project||project.status==='archived')throw Error('Open an active project.');
    if(typeof capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(capturedAt)||!Number.isFinite(Date.parse(capturedAt)))throw Error('Choose snapshot date and time.');
    if(!filename||String(filename).length>200||!sheet||String(sheet).length>120)throw Error('Invalid workbook name or sheet.');
    if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('WIP upload must contain 1–10,000 counts.');
    const members=new Map(project.entities.map(entity=>[entity.id,entity])),seen=new Set();
    for(const row of rows){
      if(!Number.isInteger(row.row)||row.row<1||!Number.isInteger(row.column)||row.column<1||!Number.isSafeInteger(row.quantity)||row.quantity<0||!String(row.partName||'').trim()||!String(row.stage||'').trim())throw Error('Invalid WIP count row.');
      const key=row.row+':'+row.column;if(seen.has(key))throw Error('Duplicate worksheet cell.');seen.add(key);
      if(row.partId&&!['Part','Part Revision'].includes(members.get(row.partId)?.type))throw Error('Part mapping must select a project Part.');
      if(row.stepId){
        if(!row.partId||members.get(row.stepId)?.type!=='Production Step'||!project.relations.some(relation=>['applies_to','produces'].includes(relation.type)&&relation.from===row.stepId&&relation.to===row.partId))throw Error('Step mapping must belong to the selected Part.');
      }
    }
    const id='wip-'+randomUUID(),now=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      const inserted=[];
      const snap={id,project_id:projectId,captured_at:capturedAt,filename:String(filename),sheet:String(sheet),created_at:now};
      db.prepare('INSERT INTO wip_snapshots(id,project_id,captured_at,filename,sheet,created_at) VALUES (?,?,?,?,?,?)').run(...Object.values(snap));
      inserted.push({table:'wip_snapshots',key:[id],before:null,after:snap});
      const statement=db.prepare('INSERT INTO wip_counts(id,snapshot_id,source_row,source_column,product_code,part_label,part_id,stage_label,step_id,quantity) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for(const row of rows){
        const count={id:'count-'+randomUUID(),snapshot_id:id,source_row:row.row,source_column:row.column,product_code:String(row.code||''),part_label:String(row.partName).trim(),part_id:row.partId||null,stage_label:String(row.stage).trim(),step_id:row.stepId||null,quantity:row.quantity};
        statement.run(...Object.values(count));inserted.push({table:'wip_counts',key:[count.id],before:null,after:count});
      }
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare('UPDATE change_sets SET acknowledged_at=? WHERE acknowledged_at IS NULL AND reverted_at IS NULL AND revert_of IS NULL').run(now);
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at,reverted_at,revert_of) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)').run('change-'+randomUUID(),projectId,now,revision+1,JSON.stringify([{action:'Imported',label:'WIP · '+filename+' · '+rows.length+' counts'}]),JSON.stringify(inserted));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return load();
  }
  function listStaffing(projectId) {
    if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw Error('Unknown project.');
    return read('SELECT * FROM staffing_counts WHERE project_id=? ORDER BY captured_at DESC,created_at DESC LIMIT 200',projectId).map(row=>({id:row.id,partId:row.part_id,capturedAt:row.captured_at,shift:row.shift,basis:row.basis,count:row.count,note:row.note}));
  }
  function saveStaffing({projectId,revision,partId,count,capturedAt,shift='',basis='observed',note=''}) {
    if(revision!==load().revision)throw Error('STALE_REVISION');
    const project=load().projects.find(item=>item.id===projectId);
    if(!project||project.status==='archived')throw Error('Open an active project.');
    if(!project.entities.some(item=>item.id===partId&&['Part','Part Revision'].includes(item.type)))throw Error('Choose a project Part.');
    if(!Number.isSafeInteger(count)||count<0||count>100000)throw Error('Worker count must be a non-negative whole number.');
    if(typeof capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(capturedAt)||!Number.isFinite(Date.parse(capturedAt)))throw Error('Choose snapshot date and time.');
    if(!['observed','planned'].includes(basis)||String(shift).length>40||String(note).length>1000)throw Error('Invalid worker count details.');
    const row={id:'staff-'+randomUUID(),project_id:projectId,part_id:partId,captured_at:capturedAt,shift:String(shift),basis,count,note:String(note),created_at:new Date().toISOString()};
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO staffing_counts(id,project_id,part_id,captured_at,shift,basis,count,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare('UPDATE change_sets SET acknowledged_at=? WHERE acknowledged_at IS NULL AND reverted_at IS NULL AND revert_of IS NULL').run(row.created_at);
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at,reverted_at,revert_of) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)').run('change-'+randomUUID(),projectId,row.created_at,revision+1,JSON.stringify([{action:'Recorded',label:'Workers · '+project.entities.find(item=>item.id===partId).name+' · '+count+' '+basis}]),JSON.stringify([{table:'staffing_counts',key:[row.id],before:null,after:row}]));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return load();
  }
  function listProductionStaffing(projectId) {
    if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw Error('Unknown project.');
    return read('SELECT * FROM production_staffing_counts WHERE project_id=? ORDER BY captured_at DESC,created_at DESC LIMIT 500',projectId).map(row=>({id:row.id,targetId:row.target_id,targetType:row.target_type,capturedAt:row.captured_at,shift:row.shift,basis:row.basis,count:row.count,note:row.note}));
  }
  function saveProductionStaffing({projectId,revision,targetId,targetType,count,capturedAt,shift='',basis='observed',note=''}) {
    if(revision!==load().revision)throw Error('STALE_REVISION');
    const project=load().projects.find(item=>item.id===projectId);
    if(!project||project.status==='archived')throw Error('Open an active project.');
    const target=project.entities.find(item=>item.id===targetId);
    if(!['Production Step','Resource'].includes(targetType)||target?.type!==targetType)throw Error('Choose a project Production Step or Resource.');
    if(!Number.isSafeInteger(count)||count<0||count>100000)throw Error('Worker count must be a non-negative whole number.');
    if(typeof capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(capturedAt)||!Number.isFinite(Date.parse(capturedAt)))throw Error('Choose observation date and time.');
    if(!['observed','planned'].includes(basis)||String(shift).length>40||String(note).length>1000)throw Error('Invalid worker count details.');
    const row={id:'prod-staff-'+randomUUID(),project_id:projectId,target_id:targetId,target_type:targetType,captured_at:capturedAt,shift:String(shift),basis,count,note:String(note),created_at:new Date().toISOString()};
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO production_staffing_counts(id,project_id,target_id,target_type,captured_at,shift,basis,count,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare('UPDATE change_sets SET acknowledged_at=? WHERE acknowledged_at IS NULL AND reverted_at IS NULL AND revert_of IS NULL').run(row.created_at);
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at,reverted_at,revert_of) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)').run('change-'+randomUUID(),projectId,row.created_at,revision+1,JSON.stringify([{action:'Recorded',label:'Production workers · '+target.name+' · '+count+' '+basis}]),JSON.stringify([{table:'production_staffing_counts',key:[row.id],before:null,after:row}]));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return load();
  }
  function saveIngestion({filename,mimeType,content,draft,scope}) {
    const sourceId='source-'+randomUUID(),jobId='job-'+randomUUID(),now=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO sources(id,kind,filename,mime_type,content,created_at) VALUES (?,?,?,?,?,?)').run(sourceId,mimeType==='application/pdf'?'file':'text',filename,mimeType,content,now);
      db.prepare('INSERT INTO ingestion_jobs(id,source_id,status,draft_json,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(jobId,sourceId,'ready_for_review',JSON.stringify({scope,draft}),now,now);
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
    return {source:{sourceId,filename,mimeType,size:content.length},jobId,draft};
  }
  function save(next, scope, revision, ingestionCommit=null) {
    const previous = load();
    if (revision !== previous.revision) throw Error('STALE_REVISION');
    Projects.validateWorkspace({version:2, projects:next.projects});
    const active = scope==='library' ? next.library : next.projects.find(p => p.id===scope);
    if (scope && !active) throw Error('Unknown save scope.');
    if (active) Projects.validate(active);
    const projectIds = new Set(next.projects.map(p => p.id));
    if (previous.projects.some(p => !projectIds.has(p.id))) throw Error('Project deletion is not supported.');
    for (const project of next.projects) {
      const before=previous.projects.find(p=>p.id===project.id);
      if (!before) {
        if (scope!==null) throw Error('Project creation is outside the save scope.');
        continue;
      }
      if (project.id!==scope && ['name','status','createdAt','updatedAt','projectType'].some(key=>project[key]!==before[key])) throw Error('Project metadata changed outside the save scope.');
      if (project.id===scope && (before.status==='archived'||project.status==='archived') &&
          !isDeepStrictEqual([project.entities,project.relations,project.changes||[],project.workstreams||{}],[before.entities,before.relations,before.changes||[],before.workstreams||{}])) throw Error('Archived project is read only.');
    }
    if (scope==='library') {
      const ids = new Set(active.entities.map(e => e.id));
      if (previous.library.entities.some(e => !ids.has(e.id))) throw Error('Global deletion requires impact review.');
    }
    if(active && scope!=='library'){
      const memberIds=new Set(active.entities.map(entity=>entity.id));
      const codes=new Set(Model.WORKSTREAMS.map(item=>item.code));
      for(const [entityId,selected] of Object.entries(active.workstreams||{})){
        if(!memberIds.has(entityId)||!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(code=>!codes.has(code)))throw Error('Invalid workstream membership.');
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const beforeRows=snapshot();
      let reviewedJob=null;
      if (ingestionCommit) {
        const {jobId,selectedIds,draft}=ingestionCommit;
        const row=db.prepare('SELECT status,draft_json FROM ingestion_jobs WHERE id=?').get(jobId);
        if(!row)throw Error('Ingestion job not found.');
        if(row.status!=='ready_for_review')throw Error('Ingestion job already committed.');
        const saved=JSON.parse(row.draft_json);
        if(saved.scope!==scope)throw Error('Ingestion job belongs to another scope.');
        const allowed=new Set([...(saved.draft.objects||[]),...(saved.draft.relationships||[])].map(item=>item.candidateId));
        if(!Array.isArray(selectedIds)||!selectedIds.length||new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!allowed.has(id)))throw Error('Invalid selected candidate IDs.');
        const checked=Ingest.validateDraft(previous.library,draft);
        if(checked.errors.length)throw Error('Invalid reviewed AI draft: '+checked.errors.join(' '));
        const reviewedIds=new Set([...checked.objects,...checked.relationships].map(item=>item.candidateId));
        if(reviewedIds.size!==allowed.size||[...allowed].some(id=>!reviewedIds.has(id)))throw Error('Reviewed AI candidate IDs changed.');
        reviewedJob={jobId,saved,selectedIds,draft:checked};
      }
      const known = new Set(read('SELECT id FROM projects').map(row => row.id));
      for (const project of next.projects) {
        if (project.id!==scope && previous.projects.some(p=>p.id===project.id)) continue;
        if (known.has(project.id)) {
          db.prepare('UPDATE projects SET name=?, status=?, updated_at=?, project_type=? WHERE id=?').run(project.name,project.status,project.updatedAt||new Date().toISOString(),project.projectType??null,project.id);
        } else {
          const now = new Date().toISOString();
          db.prepare('INSERT INTO projects(id,name,status,created_at,updated_at,project_type) VALUES (?,?,?,?,?,?)').run(project.id,project.name,project.status,project.createdAt||now,project.updatedAt||now,project.projectType??null);
        }
      }
      if (active) {
        const upsert = db.prepare('INSERT INTO entities(id,type,data_json) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,data_json=excluded.data_json');
        const member = db.prepare('INSERT OR IGNORE INTO project_memberships(project_id,entity_id) VALUES (?,?)');
        const assessmentUpsert = db.prepare('INSERT INTO project_assessments(project_id,entity_id,data_json) VALUES (?,?,?) ON CONFLICT(project_id,entity_id) DO UPDATE SET data_json=excluded.data_json');
        const assessmentDelete = db.prepare('DELETE FROM project_assessments WHERE project_id=? AND entity_id=?');
        const scheduleUpsert = db.prepare('INSERT INTO project_schedules(project_id,entity_id,data_json) VALUES (?,?,?) ON CONFLICT(project_id,entity_id) DO UPDATE SET data_json=excluded.data_json');
        const scheduleDelete = db.prepare('DELETE FROM project_schedules WHERE project_id=? AND entity_id=?');
        for (const item of active.entities) {
          const entity = {}, assessment = {}, schedule = {};
          const prior = db.prepare('SELECT type,data_json FROM entities WHERE id=?').get(item.id);
          for (const [key,value] of Object.entries(item)) {
            if (key==='projectId') continue;
            if (ASSESSMENT_FIELDS.has(key)) { if (value!=='' && value!=null) assessment[key]=value; }
            else if (scope!=='library' && item.type==='Production Step' && PROJECT_SCHEDULE_FIELDS.has(key)) { if(value!==''&&value!=null)schedule[key]=value; }
            else entity[key]=value;
          }
          if (scope==='library' && item.type==='Production Step' && [...PROJECT_SCHEDULE_FIELDS].some(key=>key!=='status'&&item[key])) throw Error('Production Step dates belong to a project.');
          if (scope!=='library' && item.type==='Production Step') entity.status=prior?JSON.parse(prior.data_json).status:'active';
          if (scope==='library' && Object.keys(assessment).length) throw Error('Stakeholder assessment needs a project.');
          if (Object.keys(assessment).length && !['Person','Organization'].includes(entity.type)) throw Error('Assessment target must be a stakeholder.');
          if (prior && prior.type!==entity.type) throw Error('Canonical object type cannot change.');
          if (scope!=='library' && prior) {
            const wasMember = previous.projects.find(p=>p.id===scope)?.entities.some(e=>e.id===entity.id);
            if (!wasMember && !isDeepStrictEqual(entity,JSON.parse(prior.data_json))) throw Error('Attached object conflicts with global facts; choose the existing Library object.');
            if (Model.PROJECT_OWNED_TYPES.has(entity.type) && previous.projects.some(p=>p.id!==scope && p.entities.some(e=>e.id===entity.id))) throw Error('This project-owned object already belongs to another project.');
          }
          upsert.run(entity.id, entity.type, JSON.stringify(entity));
          if (scope!=='library') {
            member.run(scope, entity.id);
            if (Object.keys(assessment).length) assessmentUpsert.run(scope,entity.id,JSON.stringify(assessment));
            else assessmentDelete.run(scope,entity.id);
            if (entity.type==='Production Step') {
              if(schedule.status===entity.status)delete schedule.status;
              if(Object.keys(schedule).length)scheduleUpsert.run(scope,entity.id,JSON.stringify(schedule));
              else scheduleDelete.run(scope,entity.id);
            }
          }
        }
        const relationUpsert = db.prepare('INSERT INTO relations(id,type,from_id,to_id,scope_project_id,data_json) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,from_id=excluded.from_id,to_id=excluded.to_id,scope_project_id=excluded.scope_project_id,data_json=excluded.data_json');
        for (const item of active.relations) {
          const {projectId, ...relation} = item;
          const old = db.prepare('SELECT scope_project_id,data_json FROM relations WHERE id=?').get(relation.id);
          const scopeProjectId = old ? old.scope_project_id : (Object.hasOwn(relation,'scopeProjectId') ? relation.scopeProjectId : Model.defaultRelationScope(active,relation,scope));
          if (scopeProjectId && scopeProjectId!==scope) {
            if (scope!=='library' || !old) throw Error('Relationship belongs to another project.');
          }
          if (scope==='library' && scopeProjectId && old) continue;
          relation.scopeProjectId=scopeProjectId;
          if (scope!=='library' && old && !old.scope_project_id && !isDeepStrictEqual(relation,JSON.parse(old.data_json))) throw Error('Global relationship must be edited in Library.');
          relationUpsert.run(relation.id,relation.type,relation.from,relation.to,scopeProjectId,JSON.stringify(relation));
        }
        for (const change of active.changes || []) {
          if (db.prepare('SELECT id FROM entity_changes WHERE id=?').get(change.id)) continue;
          const fields = new Set([...Object.keys(change.before||{}),...Object.keys(change.after||{})]);
          const altered = [...fields].filter(key => JSON.stringify(change.before?.[key])!==JSON.stringify(change.after?.[key]));
          const privateChange = altered.some(key => ASSESSMENT_FIELDS.has(key) || active.entities.find(e=>e.id===change.entityId)?.type==='Production Step' && PROJECT_SCHEDULE_FIELDS.has(key));
          const changeScope = privateChange && scope!=='library' ? scope : null;
          db.prepare('INSERT INTO entity_changes(id,entity_id,project_id,data_json) VALUES (?,?,?,?)').run(change.id,change.entityId,changeScope,JSON.stringify(change));
        }
        const previousGraph = scope==='library' ? previous.library : previous.projects.find(p => p.id===scope);
        const incomingRelationIds = new Set(active.relations.map(r => r.id));
        const incomingEntityIds = new Set(active.entities.map(e => e.id));
        for (const relation of previousGraph?.relations || []) {
          if (incomingRelationIds.has(relation.id)) continue;
          if (scope==='library' && relation.scopeProjectId) continue;
          if (relation.scopeProjectId===scope || (incomingEntityIds.has(relation.from) && incomingEntityIds.has(relation.to))) {
            db.prepare('DELETE FROM relations WHERE id=?').run(relation.id);
          }
        }
        if (scope!=='library') {
          for (const row of read('SELECT entity_id FROM project_memberships WHERE project_id=?',scope)) {
            if (incomingEntityIds.has(row.entity_id)) continue;
            db.prepare('DELETE FROM relations WHERE scope_project_id=? AND (from_id=? OR to_id=?)').run(scope,row.entity_id,row.entity_id);
            assessmentDelete.run(scope,row.entity_id);
            scheduleDelete.run(scope,row.entity_id);
            db.prepare('DELETE FROM project_workstreams WHERE project_id=? AND entity_id=?').run(scope,row.entity_id);
            db.prepare('DELETE FROM project_memberships WHERE project_id=? AND entity_id=?').run(scope,row.entity_id);
          }
          db.prepare('DELETE FROM project_workstreams WHERE project_id=?').run(scope);
          const laneInsert=db.prepare('INSERT INTO project_workstreams(project_id,entity_id,code) VALUES (?,?,?)');
          for(const [entityId,codes] of Object.entries(active.workstreams||{}))for(const code of codes)laneInsert.run(scope,entityId,code);
        }
      }
      if (reviewedJob) {
        const now=new Date().toISOString();
        const content={...reviewedJob.saved,reviewedDraft:reviewedJob.draft,selectedIds:reviewedJob.selectedIds,committedAt:now};
        db.prepare('UPDATE ingestion_jobs SET status=?,draft_json=?,updated_at=? WHERE id=?').run('committed',JSON.stringify(content),now,reviewedJob.jobId);
      }
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));
      const afterRows=snapshot(),rows=rowDiff(beforeRows,afterRows);
      if(rows.length){
        const now=new Date().toISOString();
        db.prepare('UPDATE change_sets SET acknowledged_at=? WHERE acknowledged_at IS NULL AND reverted_at IS NULL AND revert_of IS NULL').run(now);
        const newProject=next.projects.find(project=>!previous.projects.some(old=>old.id===project.id));
        db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at,reverted_at,revert_of) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)').run('change-'+randomUUID(),scope||newProject?.id||null,now,revision+1,JSON.stringify(changeItems(rows,beforeRows,afterRows)),JSON.stringify(rows));
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return load();
  }
  function mergeProject(sourceId,targetId,name,revision){
    const w=load();if(revision!==w.revision)throw Error('STALE_REVISION');
    const source=w.projects.find(p=>p.id===sourceId),target=w.projects.find(p=>p.id===targetId);
    if(w.projectAliases[sourceId]===targetId&&!source?.entities.some(e=>Model.PROJECT_OWNED_TYPES.has(e.type)))return w;
    if(!source||!target||sourceId===targetId||target.status!=='active')throw Error('Invalid project merge.');
    if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('Invalid project name.');
    const capture=()=>({...snapshot(),wip_snapshots:read('SELECT * FROM wip_snapshots'),staffing_counts:read('SELECT * FROM staffing_counts'),production_staffing_counts:read('SELECT * FROM production_staffing_counts')});
    db.exec('BEGIN IMMEDIATE');
    try{
      const before=capture(),now=new Date().toISOString();
      for(const table of ['project_memberships','project_assessments','project_schedules','project_workstreams']){
        const columns=Object.keys(db.prepare('SELECT * FROM '+table+' LIMIT 1').get()||{}).filter(c=>c!=='project_id');
        if(columns.length)db.prepare('INSERT OR IGNORE INTO '+table+' (project_id,'+columns.join(',')+') SELECT ?,'+columns.join(',')+' FROM '+table+' WHERE project_id=?').run(targetId,sourceId);
      }
      for(const e of source.entities.filter(e=>Model.PROJECT_OWNED_TYPES.has(e.type)))for(const table of ['project_assessments','project_schedules','project_workstreams','project_memberships'])db.prepare('DELETE FROM '+table+' WHERE project_id=? AND entity_id=?').run(sourceId,e.id);
      for(const row of read('SELECT * FROM relations WHERE scope_project_id=?',sourceId)){
        const data={...JSON.parse(row.data_json),scopeProjectId:targetId};db.prepare('UPDATE relations SET scope_project_id=?,data_json=? WHERE id=?').run(targetId,JSON.stringify(data),row.id);
      }
      for(const e of w.library.entities){const ids=e.eventRecord?.scope?.projectIds;if(!ids?.includes(sourceId)||ids.includes(targetId))continue;const data=JSON.parse(db.prepare('SELECT data_json FROM entities WHERE id=?').get(e.id).data_json);data.eventRecord.scope.projectIds.push(targetId);db.prepare('UPDATE entities SET data_json=? WHERE id=?').run(JSON.stringify(data),e.id);}
      for(const table of ['wip_snapshots','staffing_counts','production_staffing_counts'])db.prepare('UPDATE '+table+' SET project_id=? WHERE project_id=?').run(targetId,sourceId);
      const settings={...(w.viewSettings[sourceId]?.overview||{}),mergedInto:targetId};db.prepare("INSERT INTO project_view_settings VALUES (?,'overview',?) ON CONFLICT(project_id,view_key) DO UPDATE SET data_json=excluded.data_json").run(sourceId,JSON.stringify(settings));
      db.prepare('UPDATE projects SET name=?,updated_at=? WHERE id=?').run(name.trim(),now,targetId);db.prepare("UPDATE projects SET status='archived',updated_at=? WHERE id=?").run(now,sourceId);
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));const after=capture(),rows=rowDiff(before,after);
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at) VALUES (?,?,?,?,?,?,?)').run('change-'+randomUUID(),targetId,now,revision+1,JSON.stringify(changeItems(rows,before,after)),JSON.stringify(rows),now);
      db.exec('COMMIT');return load();
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function keepChange(id){
    const current=pendingChange();
    if(!current||current.id!==id)throw Error('Change already reviewed or no longer latest.');
    db.prepare('UPDATE change_sets SET acknowledged_at=? WHERE id=?').run(new Date().toISOString(),id);
    return load();
  }
  function revertChange(id,revision){
    const row=db.prepare('SELECT * FROM change_sets WHERE id=?').get(id);
    if(!row)throw Error('Change not found.');
    if(row.acknowledged_at||row.reverted_at)throw Error('Change already reviewed or reverted.');
    if(row.revision!==revision||load().revision!==revision||pendingChange()?.id!==id)throw Error('Only the latest saved change can be reverted. Reload and review current data.');
    const rows=JSON.parse(row.rows_json),now=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const item of rows){
        const where=CHANGE_TABLES[item.table].map(column=>column+'=?').join(' AND ');
        const current=db.prepare('SELECT * FROM '+item.table+' WHERE '+where).get(...item.key)||null;
        if(!isDeepStrictEqual(current?{...current}:null,item.after))throw Error('Saved data changed after this update. Reload before reverting.');
      }
      db.exec('PRAGMA defer_foreign_keys=ON');
      for(const item of rows){
        const where=CHANGE_TABLES[item.table].map(column=>column+'=?').join(' AND ');
        if(item.after)db.prepare('DELETE FROM '+item.table+' WHERE '+where).run(...item.key);
      }
      for(const item of rows){
        if(!item.before)continue;
        const columns=Object.keys(item.before);
        db.prepare('INSERT INTO '+item.table+'('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...columns.map(column=>item.before[column]));
      }
      db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare('UPDATE change_sets SET acknowledged_at=?,reverted_at=? WHERE id=?').run(now,now,id);
      db.prepare('INSERT INTO change_sets(id,scope,recorded_at,revision,items_json,rows_json,acknowledged_at,reverted_at,revert_of) VALUES (?,?,?,?,?,?,?,?,?)').run('change-'+randomUUID(),row.scope,now,revision+1,JSON.stringify([{action:'Reverted',label:'Saved change from '+row.recorded_at,fields:[]}]),JSON.stringify(rows.map(item=>({...item,before:item.after,after:item.before}))),now,null,id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return load();
  }
  return {history,load, save, mergeProject, putSettings, exportAll, saveIngestion, listChanges, listWip, saveWip, listProgress,saveProgress,listHourly:hourly.list,hourlySave:hourly.save,hourlyRateSave:hourly.rateSave,featureSave:hourly.featureSave,samplePreparationList:preparation.list,samplePreparationSave:preparation.save,listStaffing, saveStaffing, listProductionStaffing, saveProductionStaffing, keepChange, revertChange, backup:filename=>require('node:sqlite').backup(db,filename),close:() => db.close()};
}

module.exports = {openStore, ASSESSMENT_FIELDS, PROJECT_SCHEDULE_FIELDS};
