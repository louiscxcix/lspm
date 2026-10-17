(function(root){
 function publish(project,production={},settings={}){
  const p=structuredClone(project);p.entities=p.entities.filter(e=>e.privacy!=='local_only'&&!['Event','Evidence'].includes(e.type));
  const ids=new Set(p.entities.map(e=>e.id));p.relations=p.relations.filter(r=>ids.has(r.from)&&ids.has(r.to));p.changes=[];
  if(p.workstreams)p.workstreams=Object.fromEntries(Object.entries(p.workstreams).filter(([id])=>ids.has(id)));
  const data=structuredClone(production);data.hourly=(data.hourly||[]).filter(r=>ids.has(r.partId));for(const r of data.hourly)delete r.sourceId;
  data.progress||={snapshots:[],rows:[]};data.progress.rows=data.progress.rows.filter(r=>ids.has(r.partId)&&ids.has(r.stepId));for(const r of [...data.progress.rows,...data.progress.snapshots])delete r.eventId;
  if(data.samplePreparation){const S=typeof module==='object'?require('./sample-preparation'):root.SamplePreparation;data.samplePreparation=S.latest(data.samplePreparation).filter(s=>ids.has(s.partId)).map(s=>S.sanitize(s));}
  return {schemaVersion:1,project:p,production:data,settings:structuredClone(settings)};
 }
 function workspace(view){return {version:2,revision:0,projects:[view.project],library:{id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[],changes:[]},viewSettings:{[view.project.id]:view.settings},pendingChange:null,access:{enabled:true,mode:'project',projectId:view.project.id}};}
 const viewLimit=900000,expandedLimit=16*1024*1024;
 async function encode(view,{compress=false}={}){
  const text=JSON.stringify(view),bytes=new TextEncoder().encode(text);if(bytes.length>expandedLimit)throw Error('Project view exceeds safe expanded size.');if(!compress&&bytes.length<=viewLimit)return text;
  const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let binary='';
  for(let i=0;i<compressed.length;i+=32768)binary+=String.fromCharCode(...compressed.subarray(i,i+32768));
  const payload=JSON.stringify({encoding:'gzip-base64',schemaVersion:1,data:btoa(binary)});if(new TextEncoder().encode(payload).length>viewLimit)throw Error('Project view exceeds 900 KB after compression.');return payload;
 }
 async function decode(payload){
  if(typeof payload!=='string'||new TextEncoder().encode(payload).length>viewLimit)throw Error('Project view exceeds safe stored size.');const envelope=JSON.parse(payload);if(!envelope.encoding)return envelope;
  if(envelope.encoding!=='gzip-base64'||envelope.schemaVersion!==1||typeof envelope.data!=='string')throw Error('Unsupported project view encoding.');
  const bytes=Uint8Array.from(atob(envelope.data),c=>c.charCodeAt(0)),reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expandedLimit){await reader.cancel();throw Error('Project view exceeds safe expanded size.');}chunks.push(value);}}finally{reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(output));
 }
 const api={publish,workspace,encode,decode};if(typeof module==='object')module.exports=api;else root.ProjectView=api;
})(globalThis);
