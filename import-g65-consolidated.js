// Append observations only. Existing entities, BOM, machines and route edges win.
const Model = require('./ontology-model');
const SOURCE = 'G65_Process_Ontology_Consolidated.md';
function apply(project) {
  const before = JSON.stringify(project);
  const entity = (type, name, context, extra = {}) => project.entities.find(e => e.type === type && e.name === name) || Model.addEntity(project, {type,name,context,status:'unknown',...extra});
  const evidence = entity('Evidence','G65 consolidated floor observations',`Source: ${SOURCE}. Historical observations, not a released work instruction. Existing ontology takes precedence. Observation dates, station allocations and applicability require confirmation.`);
  const link = (from,type,to) => {
    if (!project.relations.some(r=>r.from===from.id && r.type===type && r.to===to.id)) Model.addRelation(project,{from:from.id,type,to:to.id,evidence:SOURCE,scopeProjectId:null});
  };
  const note = (id,text) => {
    const e=project.entities.find(e=>e.id===id);
    if (!e) throw Error(`Missing canonical object: ${id}`);
    const entry=`[${SOURCE}] ${text}`;
    if (!e.context.includes(entry)) Model.updateEntity(project,e.id,{context:`${e.context}\n${entry}`});
    link(e,'supported_by',evidence);
    return e;
  };
  const router=note('ls-step-g65-main-router','Observed loading: place, close, scan, press start, automatic cut, separate outputs into trays. Front/back loading errors and technical problems reported. Lower 5-pin / Upper 4-pin preparation is an observation; connector specification and applicability remain unconfirmed. Existing RH yield of 9 Components is unchanged.');
  const integration=note('obj-muufiui4-lsdkh','Observed identification: scan each of two pieces once. Incorrect positioning reported. Existing Plate 1 + Connector + Plate 2 inputs retained; bracket/reflector/PCB terminology does not replace this BOM.');
  note('ls-step-g65-main-lam','Black and clear plastics are attached to the intermediate panel. Bracket/reflector names are possible descriptions, not confirmed aliases. Manual assembly retained; no machine inferred.');
  const stacking=note('ls-step-g65-main-stacking','Historical observed cycle approximately 20 seconds, not measured waiting time or a production KPI. Integration defects may require return to Integration; exact approved rework rule unconfirmed. Unreadable QR may need controlled manual identification; approval procedure unknown.');
  const eol=note('ls-step-g65-main-eol','Historical observed cycle approximately 12 seconds, not pending time. Load correctly, scan, run functional test, inspect PASS/NG result. Mispositioning may require correction and retry. Cleaning-related recovery reported; cleaned item and cause unknown.');
  note('ls-step-g65-main-visual','Visual/appearance inspection is distinct from electrical functional testing. Inspection standards and limits not supplied.');
  const ng=project.entities.find(e=>e.type==='Production Step' && e.productionStage==='NG storage');
  if (ng) note(ng.id,'NG identification/ticket and segregation prevent accidental reuse. Ticket fields, stacking method, capacity and disposition authority remain unknown. Existing fixed-return and unrecoverable-Scrap rules retained.');
  const issue=(name,context,classification,targets)=>{
    const i=entity('Issue',name,`Source: ${SOURCE}. Category: ${classification}. Historical failure mode, not a live incident. ${context}`);
    targets.forEach(t=>link(i,'potentially_affects',t));
  };
  issue('G65 Router · orientation / technical failure','Front/back reversal or machine technical fault reported; specific cause, technician ownership and disposition require confirmation.','Orientation / Technical',[router]);
  issue('G65 Integration · incorrect positioning','Component positioning defect observed; approved correction method and variant applicability unknown.','Positioning',[integration]);
  issue('G65 Stacking / EOL · unreadable QR','Manual identification mentioned; do not assume bypass permission. QR contents, history system and authorization unknown.','Traceability',[stacking,eol]);
  issue('G65 EOL · positioning / cleaning recovery','Correction and retry reported. Cleaning target and root cause unknown; contamination is not a confirmed diagnosis.','Positioning / Unknown',[eol]);
  entity('Person','Alexis','Observed production support and Korean/Spanish communication or translation. Official title, department, employer, station assignments and access rights unconfirmed.');
  entity('Person','Marta','Observed final-check machine worker. Exact product/station, title, department, employer and access rights unconfirmed.');
  const unresolved=[
    ['Final function test / line release','Unassigned historical station: four-piece loading, scan/button, less than approximately 6 seconds and approximately 99% GOOD. Not G65 EOL metrics. Known-good and known-NG sample validation before release; failed equipment validation requires technician/engineer. Wrong-order scanning is traceability error; premature hand insertion causes safety alarm, not product defect. Station and responsible people require confirmation.'],
    ['First-piece / High Beam / T1 inspection','Primera vez: code/history/process/function check, trigger unknown. High Beam: automatic camera/photo inspection with manual confirmation and connection issue of unknown location. T1: white, small-part and orange checks; identity and meaning unknown. Do not merge with T1XL or T1-2 or create machine assignments.'],
    ['Unconfirmed product and configuration references','G55 border-like item is unconfirmed; no BOM relation inferred. RH Upper/RH Lower/LH simultaneous requirement unconfirmed. LS remains Project; LDM and Nexlide remain production lines. Earlier ICT1/ICT2 route and STD/EOL equivalence are historical unresolved references, not current routing.']
  ];
  for(const [name,text] of unresolved) entity('Evidence',`G65 notes · ${name}`,`Source: ${SOURCE}. Pending confirmation. ${text}`);
  Model.validateStore(project);
  return JSON.stringify(project)!==before;
}
module.exports={apply};
if(require.main===module){
  const {openStore}=require('./local-store');
  const db=openStore(process.env.PM_DB_PATH || '../.local-data/ontology.sqlite');
  try{
    const workspace=db.load();const project=workspace.projects.find(p=>p.name==='LS');
    if(!project) throw Error('LS project not found');
    if(apply(project)) console.log('Saved revision',db.save(workspace,project.id,workspace.revision).revision);
    else console.log('Already imported; no changes');
  }finally{db.close();}
}
