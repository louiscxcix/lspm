'use strict';

// Transcription of PM TOOL/production-observation-notes.md (2026-10-02).
// Photo routes are historical/unverified-current; they are not work instructions.
const fs = require('node:fs');
const path = require('node:path');
const Projects = require('./projects.js');
const {openStore} = require('./local-store.js');

const ROUTES = [
  {code:'lq2-primary',part:'LQ2 primary light source',stages:[['tim','TIM'],['harness','Wire harness'],['eol','EOL'],['vision','Vision inspection'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'lq2-opt',part:'LQ2 OPT',stages:[['ict','ICT'],['coating','Coating'],['coating-inspection','Coating inspection'],['router','Router'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'lq2-std',part:'LQ2 STD',stages:[['router','Router'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'lq2-lwr',part:'LQ2 LWR',stages:[['array-cutting','Array cutting'],['lam','LAM assembly'],['stacking','Stacking'],['screw','Screw assembly'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'t1xl',part:'T1XL',stages:[['ict','ICT'],['download','FW download'],['router','Router'],['screw-a','Screw 1 Assembly (box 1)'],['screw-b','Screw 1 Assembly (box 2)'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'g65-main',part:'G65 main (route label)',stages:[['ict','ICT'],['download','FW download'],['router','Router'],['lam','LAM assembly'],['stacking','Stacking'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'g65-side-marker',part:'G65 Side Marker',stages:[['lam','LAM assembly'],['stacking','Stacking'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'g65-cornering',part:'G65 Cornering',stages:[['ict','ICT'],['lam','LAM assembly'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'t1-2-uplevel',part:'T1-2 Uplevel',stages:[['ict','ICT'],['bending','Press bending #1–#5'],['connector','Connector fastening'],['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]},
  {code:'t1-2-base',part:'T1-2 Base',stages:[['eol','EOL'],['visual','Visual inspection'],['packing','Packing']]}
];

function buildLsProject(project) {
  if (project.name !== 'LS' || project.entities.length || project.relations.length) throw Error('Expected an empty LS project.');
  const add = (id,type,name,context,extra={}) => {
    project.entities.push({id,type,name,context,status:'unknown',projectId:project.id,...extra});
    return id;
  };
  const link = (id,type,from,to,evidence) => project.relations.push({id,type,from,to,evidence,projectId:project.id});
  const lane = (id,codes) => { (project.workstreams ||= {})[id]=codes; };
  const routeEvidence=add('ls-evidence-route-chart','Evidence','LS production route chart · IMG_3913/3919',
    'Historical photographed process/staffing chart. Issue date, revision and current applicability unverified.');
  add('ls-evidence-mes','Evidence','LS MES/WIP snapshot · IMG_3897–3901',
    'Historical screenshot; MES stage counts in units, not trays/lots. Snapshot cut-off and SKU-to-route mapping unknown.');
  add('ls-evidence-ramp','Evidence','LS ramp-up report · IMG_3912',
    'Historical 9/20 as-of staffing figures (156 needed, 90 available). Current staffing, bottleneck and report issue date unverified.');
  lane(routeEvidence,['production']);

  const org=add('ls-org-lg-innotek-mexico','Organization','LG Innotek Mexico',
    'Workplace named by PM; exact legal entity name unverified.');
  for (const [id,name,title,note] of [
    ['ls-person-seong-gicheol','성기철','법인장','User-confirmed title; other reporting lines unverified.'],
    ['ls-person-kim-jeongyeol','김정열','생산총괄','User-confirmed title; PM says directly assigned to him, not necessarily a formal reporting line.'],
    ['ls-person-hong-sungkyung','홍순경','지원총괄','User-confirmed title; other reporting lines unverified.']
  ]) {
    add(id,'Person',name,'User confirmation 2026-10-02. '+note,{title});
    link('ls-rel-'+id+'-workplace','works_at',id,org,'User-confirmed workplace and role context; exact legal employer unverified.');
  }
  lane('ls-person-kim-jeongyeol',['production']);

  for (const [id,name,context] of [
    ['ls-part-g65-jewelry','G65 Jewelry Piece','User-confirmed separate Part. MES photo mentions Jewelry Piece LH; exact SKU/assembly link unknown.'],
    ['ls-part-g65-sl-upper','G65 SL Upper','User-confirmed separate Part. Photo was previously read as SI Upper; equivalence unverified.'],
    ['ls-part-g65-sl-lower','G65 SL Lower','User-confirmed separate Part. Photo was previously read as SI Lower; equivalence unverified.']
  ]) { add(id,'Part',name,context); lane(id,['production']); }

  for (const [id,name,kind,context] of [
    ['ls-resource-ict-area','Common ICT area','facility','IMG_3917 shows two ICT machines in a common area; IDs, fixtures and current availability unknown.'],
    ['ls-resource-download','Common download machine','machine','IMG_3917 shows one download machine; ID and current availability unknown.'],
    ['ls-resource-router-room','Common router room','facility','IMG_3917 shows a common routing room; individual machine/fixture assignments unknown.'],
    ['ls-resource-semi-storage','LDM/TEM semi-finished storage','facility','IMG_3918. Not identified as NG storage.'],
    ['ls-resource-material-waiting','Product/material waiting area','facility','IMG_3918. Not identified as NG storage.']
  ]) { add(id,'Resource',name,context,{resourceKind:kind}); lane(id,['production']); }

  const resources={ict:'ls-resource-ict-area',download:'ls-resource-download',router:'ls-resource-router-room'};
  const quality=new Set(['ict','eol','vision','visual','coating-inspection']);
  for (const route of ROUTES) {
    const partId='ls-part-'+route.code;
    add(partId,'Part',route.part,
      'Route product label in IMG_3913/3919; exact part number/revision and current applicability unknown.'+
      (route.code==='g65-main'?' Not equated with earlier “Main G65 part” field-note item.':''));
    lane(partId,['production']);
    route.stages.forEach(([key,label],index) => {
      const id='ls-step-'+route.code+'-'+key;
      const source=route.code==='t1-2-uplevel'&&key==='connector'?'IMG_3915':'IMG_3913/3919';
      let context='Shown route box in '+source+'; sequence is historical, current work instruction unverified.';
      if (route.code==='lq2-lwr'&&key==='stacking') context+=' Caption “LQ2 LWR (T1-2 Stacking)” is unresolved; no shared-equipment link asserted.';
      if (route.code==='t1xl'&&key.startsWith('screw-')) context+=' Two boxes carry the same printed label; distinct operation versus duplicate label unknown.';
      if (route.code==='t1-2-base') context+=' Earlier upstream work may exist but is not shown.';
      add(id,'Production Step',route.part+' · '+label,context,{processLevel:'main',productionStage:label});
      lane(id,quality.has(key)?['production','quality']:key==='packing'?['production','logistics']:['production']);
      link('ls-rel-'+route.code+'-'+key+'-part','applies_to',id,partId,'Shown route in '+source+'; current applicability unverified.');
      if(index) link('ls-rel-'+route.code+'-seq-'+index,'precedes','ls-step-'+route.code+'-'+route.stages[index-1][0],id,
        'Order shown in '+source+'; current work instruction unverified.');
      else link('ls-rel-'+route.code+'-source','supported_by',id,routeEvidence,'Route sequence transcribed from IMG_3913/3919.');
      if(resources[key]) link('ls-rel-'+route.code+'-'+key+'-resource','requires',id,resources[key],
        'Common area shown in IMG_3917; exact machine/fixture allocation unverified.');
    });
    const eol='ls-step-'+route.code+'-eol', ng='ls-ng-'+route.code;
    add(ng,'Production Step',route.part+' · NG storage',
      'User-described off-line failure buffer, not normal production or a Part. Exact storage area and disposition authority unknown.',
      {processLevel:'sub',parentWorkId:eol,branchKind:'exception',failureAction:'Minor issue: possible clean/retry. Severe issue: scrap. Return station and approval rules unknown.'});
    lane(ng,['production','quality']);
    link('ls-rel-'+route.code+'-ng-part','applies_to',ng,partId,'General NG path described by user; exact part-specific procedure unverified.');
    link('ls-rel-'+route.code+'-failure','on_failure',eol,ng,
      'Representative branch for user-described NG storage; station-specific failure/return rules unverified.');
  }
  return Projects.validate(project);
}

function applyLsImport(db) {
  let workspace=db.load();
  const matches=workspace.projects.filter(item=>item.name==='LS');
  if (matches.length>1) throw Error('Multiple LS projects exist; choose an exact target.');
  let project=matches[0];
  if (project && (project.entities.length||project.relations.length)) throw Error('LS project already populated; no duplicate import made.');
  if (!project) {
    project=Projects.create('LS');
    workspace.projects.push(project);
    workspace=db.save(workspace,null,workspace.revision);
    db.keepChange(workspace.pendingChange.id);
  }
  project=buildLsProject(workspace.projects.find(item=>item.id===project.id));
  workspace=db.save(workspace,project.id,workspace.revision);
  return {projectId:project.id,objects:project.entities.length,relations:project.relations.length,revision:workspace.revision};
}

if (require.main===module) {
  const mode=process.argv[2]||'--dry-run';
  if (!['--dry-run','--apply'].includes(mode)) throw Error('Use --dry-run or --apply.');
  if (mode==='--dry-run') {
    const project=buildLsProject(Projects.create('LS'));
    console.log(JSON.stringify({mode,projectName:project.name,objects:project.entities.length,relations:project.relations.length}));
  } else {
    const dbPath=process.env.PM_DB_PATH||path.join(__dirname,'..','.local-data','ontology.sqlite');
    if(!fs.existsSync(dbPath)) throw Error('Local database not found: '+dbPath);
    const db=openStore(dbPath);
    try { console.log(JSON.stringify({mode,...applyLsImport(db)})); }
    finally { db.close(); }
  }
}

module.exports={buildLsProject,applyLsImport};
