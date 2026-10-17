'use strict';
// Read-only diagnostics. No migrations, importer, store initialization, or publication.
const path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..'),M=require(path.join(root,'ontology-model'));
const db=new DatabaseSync(process.argv[2]||path.join(root,'..','.local-data','ontology.sqlite'),{readOnly:true});
try {
  const entityRows=db.prepare('SELECT id,type,data_json FROM entities').all();
  const relationRows=db.prepare('SELECT id,type,from_id,to_id,scope_project_id,data_json FROM relations').all();
  const graph={version:1,entities:entityRows.map(r=>JSON.parse(r.data_json)),relations:relationRows.map(r=>JSON.parse(r.data_json))};
  const byId=new Map(graph.entities.map(e=>[e.id,e]));
  let schemaError=null;try{M.validateStore(graph);}catch(e){schemaError=e.message;}
  const duplicateEdges=db.prepare("SELECT type,from_id,to_id,coalesce(scope_project_id,'') scope,count(*) n FROM relations GROUP BY type,from_id,to_id,coalesce(scope_project_id,'') HAVING count(*)>1").all();
  const mismatches=entityRows.filter(r=>{const e=JSON.parse(r.data_json);return r.id!==e.id||r.type!==e.type;}).length+relationRows.filter(r=>{const e=JSON.parse(r.data_json);return r.id!==e.id||r.type!==e.type||r.from_id!==e.from||r.to_id!==e.to||(r.scope_project_id||null)!==(e.scopeProjectId||null);}).length;
  const ls=db.prepare("SELECT id FROM projects WHERE name='LS' AND status='active'").get();
  const members=new Set(db.prepare('SELECT entity_id FROM project_memberships WHERE project_id=?').all(ls.id).map(r=>r.entity_id));
  const project={id:ls.id,name:'LS',version:2,status:'active',entities:graph.entities.filter(e=>members.has(e.id)),relations:graph.relations.filter(r=>(!r.scopeProjectId||r.scopeProjectId===ls.id)&&members.has(r.from)&&members.has(r.to))};
  const G=require(path.join(root,'progress')),P=require(path.join(root,'projects'));
  const variants=project.entities.filter(e=>/^G65 (Upper|Lower) (LH|RH)$/.test(e.name)).map(e=>({id:e.id,name:e.name,steps:G.steps(project,e.id).length,parents:graph.relations.filter(r=>r.type==='part_of'&&r.from===e.id).map(r=>byId.get(r.to)?.name)}));
  const attach=P.membershipCandidates(graph,P.create('Read-only audit'),['ls-part-g65-main'],true);
  const materialScopeMismatch=graph.relations.filter(r=>r.routePartId&&['consumes','produces'].includes(r.type)&&byId.get(r.from)?.type==='Production Step'&&!graph.relations.some(a=>a.type==='applies_to'&&a.from===r.from&&a.to===r.routePartId));
  const latest=graph.entities.filter(e=>e.type==='Event'&&e.eventRecord?.recordedAt>'2026-10-13T03:00:00Z');
  const noReporter=latest.filter(e=>!graph.relations.some(r=>r.from===e.id&&r.type==='reported_by'));
  const followUpExample=latest.find(e=>e.name==='Push pin 220V 패널 작업 정지 후속');
  const example=followUpExample&&{id:followUpExample.id,subjects:graph.relations.filter(r=>r.from===followUpExample.id&&r.type==='records_on').map(r=>byId.get(r.to)?.name),predecessors:graph.relations.filter(r=>r.from===followUpExample.id&&r.type==='follows_up').map(r=>({id:r.to,name:byId.get(r.to)?.name,subjects:graph.relations.filter(x=>x.from===r.to&&x.type==='records_on').map(x=>byId.get(x.to)?.name)}))};
  console.log(JSON.stringify({revision:db.prepare("SELECT value FROM meta WHERE key='revision'").get().value,entities:graph.entities.length,relations:graph.relations.length,foreignKeys:db.prepare('PRAGMA foreign_key_check').all(),schemaError,duplicateEdges,jsonColumnMismatches:mismatches,variants,routeAttachment:{objects:attach.length,steps:attach.filter(id=>byId.get(id)?.type==='Production Step').length,archived:attach.filter(id=>byId.get(id)?.status==='archived').length,productParts:attach.map(id=>byId.get(id)).filter(e=>M.isProductPart(e)).map(e=>e.name)},materialScopeMismatch:materialScopeMismatch.map(r=>r.id),latestHistory:{events:latest.length,missingReporterLinks:noReporter.length,wrongLineExample:example},pendingReview:db.prepare("SELECT count(*) n FROM ingestion_jobs WHERE status='ready_for_review'").get().n},null,2));
} finally {db.close();}
