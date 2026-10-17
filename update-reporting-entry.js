'use strict';
/**
 * Add report-first choices without rewriting organizational reporting or route chronology.
 * apply(graph), applyProject(project, library), applyWorkspace(workspace) return a changed boolean.
 * Only existing identities are reused. Project attachment follows explicit line membership.
 * No database is opened. CLI accepts the load() graph shape {library,projects},
 * not the raw exportAll() database backup, and exclusively creates a new JSON:
 * node update-reporting-entry.js --input /tmp/workspace.json --output /tmp/workspace-reporting.json
 * Review that output before using the application's normal audited save/import workflow.
 */
const M=require('./ontology-model'),P=require('./projects'),F=require('./workflow');
const {areas}=require('./update-production-organization'),{createHash}=require('node:crypto');
const SOURCE='reporting-entry-v1';
// Canonical IDs from update-tem.js and update-smt-models.js; Starpro SMT is separate.
const SUBLINES={'tem-line-1':'TEM','tem-line-2':'TEM','tem-line-3':'TEM','smt-line-1':'SMT','smt-line-2':'SMT'};
const isLine=e=>e?.type==='Resource'&&e.resourceKind==='line';
const visible=(g,r)=>!r.scopeProjectId||r.scopeProjectId===g.id;
function unique(g,type,name){
 const matches=g.entities.filter(e=>e.type===type&&e.name===name&&e.status!=='archived'&&(type!=='Resource'||isLine(e)));
 if(matches.length>1)throw Error('Ambiguous reporting identity: '+name);
 return matches[0];
}
function link(g,from,type,to,evidence){
 if(g.relations.some(r=>visible(g,r)&&r.from===from&&r.type===type&&r.to===to))return;
 const scope=g.id&&g.id!=='library'?g.id:null;
 const id=SOURCE+'-'+createHash('sha256').update(JSON.stringify([from,type,to,scope])).digest('hex').slice(0,24);
 if(g.relations.some(r=>r.id===id))throw Error('Reporting relation ID conflict: '+id);
 const r=M.addRelation(g,{from,type,to,scopeProjectId:scope,evidence:SOURCE+' · '+evidence});r.id=id;
}
function apply(g){
 if(g.status==='archived')return false;
 const before=JSON.stringify(g);
 for(const name of Object.keys(areas)){
  const line=unique(g,'Resource',name);if(!line)continue;
  for(const role of ['Leader','Supervisor']){
   const group=unique(g,'Organization',name+' · '+role+' team');if(!group)continue;
   link(g,line.id,'escalates_to',group.id,'Report a line problem first to either Leader or Supervisor, equivalent entry choices. Managers are later escalation. Reuses the supplied organization chart and existing role groups; duty availability, contact details and station ownership remain unknown.');
  }
 }
 for(const [id,name] of Object.entries(SUBLINES)){
  const child=M.byId(g,id),parent=unique(g,'Resource',name);
  if(!isLine(child)||child.status==='archived'||!parent)continue;
  const parents=g.relations.filter(r=>visible(g,r)&&r.type==='part_of'&&r.from===id&&isLine(M.byId(g,r.to)));
  if(parents.some(r=>r.to!==parent.id))throw Error('Conflicting canonical parent for '+id);
  link(g,id,'part_of',parent.id,'Canonical subline belongs to '+name+' per existing production-area definitions. Inherit area report-first choices; no individual station assignment or new process sequence.');
 }
 M.validateStore(g);return before!==JSON.stringify(g);
}
function applyProject(p,g){
 if(p.status==='archived')return false;
 const before=JSON.stringify(p),existing=new Set(p.entities.map(e=>e.id)),ids=new Set(),relations=new Map();
 for(const line of p.entities.filter(e=>isLine(e)&&e.status!=='archived')){
  const contact=F.reportingContacts(g,line.id);if(!contact.firstContacts.length)continue;
  for(const r of contact.relations){relations.set(r.id,r);ids.add(r.from);ids.add(r.to);}
 }
 P.attachMembers(p,g,[...ids].filter(id=>!existing.has(id)));
 const members=new Set(p.entities.map(e=>e.id));
 for(const r of relations.values())if(members.has(r.from)&&members.has(r.to)&&visible(p,r)&&!p.relations.some(old=>old.id===r.id||old.from===r.from&&old.type===r.type&&old.to===r.to&&(old.scopeProjectId??null)===(r.scopeProjectId??null)))p.relations.push({...r,projectId:p.id});
 const added=[...ids].filter(id=>!existing.has(id));
 if(added.length){p.workstreams||={};for(const id of added)p.workstreams[id]=['production'];}
 apply(p);P.validate(p);return before!==JSON.stringify(p);
}
function applyWorkspace(w){
 P.validateWorkspace({version:2,projects:w.projects});M.validateStore(w.library);
 const before=JSON.stringify(w);apply(w.library);
 for(const p of w.projects)applyProject(p,w.library);
 P.validateWorkspace({version:2,projects:w.projects});return before!==JSON.stringify(w);
}
module.exports={apply,applyProject,applyWorkspace};
if(require.main===module){
 try{
  const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('Usage: node update-reporting-entry.js --input workspace.json --output new-workspace.json (exports only; no database access)');
  const input=path.resolve(args[1]),output=path.resolve(args[3]);
  if(input===output||!input.endsWith('.json')||!output.endsWith('.json'))throw Error('Choose separate input and new output JSON files.');
  const w=JSON.parse(fs.readFileSync(input,'utf8')),changed=applyWorkspace(w);
  fs.writeFileSync(output,JSON.stringify(w,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({changed,output,revision:w.revision}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
