'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {openStore} = require('./local-store.js');
const Ingest = require('./ingestion.js');
const Model = require('./ontology-model.js');
const WIP = require('./wip.js');

const ASSETS = new Set(['index.html','styles.css','ontology-model.js','projects.js','import-resolver.js','ingestion.js','workflow.js','production-logs.js','analysis-views.js','apqp.js','local-api.js','app.js']);
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const EXTRACTION_SCHEMA={
  type:'object',properties:{
    summary:{type:'string'},
    objects:{type:'array',items:{type:'object',properties:{
      candidateId:{type:'string'},suggestedAction:{type:'string',enum:['create','link_existing']},
      type:{type:'string',enum:Model.ENTITY_TYPES.filter(type=>type!=='Project')},name:{type:'string'},sourceExcerpt:{type:'string'},confidence:{type:'number'},
      status:{type:'string'},context:{type:'string'},
      ...Object.fromEntries([...Model.DATE_FIELDS,...Model.TEXT_FIELDS].map(field=>[field,{type:'string'}]))
    },required:['candidateId','suggestedAction','type','name','sourceExcerpt']}},
    relationships:{type:'array',items:{type:'object',properties:{
      candidateId:{type:'string'},type:{type:'string',enum:Model.RELATION_TYPES},from:{type:'string'},to:{type:'string'},
      sourceExcerpt:{type:'string'},confidence:{type:'number'},evidence:{type:'string'},quantity:{type:'integer'},unit:{type:'string'},basis:{type:'string'},routePartId:{type:'string'},reviewState:{type:'string',enum:['confirmed','proposed','unverified']}
    },required:['candidateId','type','from','to','sourceExcerpt']}},
    unresolved:{type:'array',items:{type:'object',properties:{text:{type:'string'},reason:{type:'string'}},required:['text','reason']}}
  },required:['summary','objects','relationships','unresolved']
};
function createServer({dbPath=path.join(__dirname,'..','.local-data','ontology.sqlite'),port=4173,geminiKey=process.env.GEMINI_API_KEY||'',geminiFetch=globalThis.fetch}={}) {
  const store = openStore(dbPath);
  const json = (res,status,value) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const readJson = async req => {
    if (!String(req.headers['content-type']||'').startsWith('application/json')) throw Error('Use application/json.');
    let text='';
    for await (const chunk of req) {
      text += chunk;
      if (text.length>16_000_000) throw Error('Request exceeds 16 MB.');
    }
    return JSON.parse(text);
  };
  const server = http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'");
    const currentPort=server.address()?.port;
    const host=String(req.headers.host||'');
    if (!["127.0.0.1:"+currentPort,"localhost:"+currentPort].includes(host)) {json(res,403,{error:'Local host only.'});return;}
    const origin=req.headers.origin;
    if (origin && !["http://127.0.0.1:"+currentPort,"http://localhost:"+currentPort].includes(origin)) {json(res,403,{error:'Foreign origin blocked.'});return;}
    const url=new URL(req.url,'http://127.0.0.1'),pathname=url.pathname;
    try {
      if (req.method==='GET' && pathname==='/api/health') {json(res,200,{ok:true,aiConfigured:Boolean(geminiKey)});return;}
      if (req.method==='GET' && pathname==='/api/workspace') {json(res,200,store.load());return;}
      if(req.method==='GET'&&pathname==='/api/wip'){
        json(res,200,store.listWip(url.searchParams.get('project')||'',url.searchParams.get('snapshot')||''));return;
      }
      if(req.method==='GET'&&pathname==='/api/staffing'){
        json(res,200,store.listStaffing(url.searchParams.get('project')||''));return;
      }
      if(req.method==='POST'&&pathname==='/api/staffing'){
        json(res,200,store.saveStaffing(await readJson(req)));return;
      }
      if(req.method==='GET'&&pathname==='/api/production-staffing'){
        json(res,200,store.listProductionStaffing(url.searchParams.get('project')||''));return;
      }
      if(req.method==='POST'&&pathname==='/api/production-staffing'){
        json(res,200,store.saveProductionStaffing(await readJson(req)));return;
      }
      if(req.method==='POST'&&['/api/wip/preview','/api/wip'].includes(pathname)){
        const input=await readJson(req),project=store.load().projects.find(item=>item.id===input.projectId);
        if(!project||project.status==='archived')throw Error('Open an active project.');
        if(!/\.xlsx$/i.test(input.filename||'')||typeof input.base64!=='string'||input.base64.length>14_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)||input.base64.length%4!==0)throw Error('Upload an .xlsx workbook up to 10 MB.');
        const content=Buffer.from(input.base64,'base64');
        if(!content.length||content.length>10_000_000)throw Error('Upload an .xlsx workbook up to 10 MB.');
        const parsed=await WIP.previewWorkbook(content,{sheetName:input.sheetName,headerRow:input.headerRow,partColumn:input.partColumn,codeColumn:input.codeColumn});
        if(req.method==='POST'&&pathname==='/api/wip/preview'){json(res,200,parsed);return;}
        if(parsed.warnings.length)throw Error('Workbook has invalid count cells. Correct the source file before saving.');
        const partMappings=input.partMappings||{},stepMappings=input.stepMappings||{},parts=project.entities.filter(item=>['Part','Part Revision'].includes(item.type));
        if(!stepMappings||typeof stepMappings!=='object'||Array.isArray(stepMappings)||Object.values(stepMappings).some(value=>typeof value!=='string'))throw Error('Invalid Step mapping choices.');
        const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
        const stageKey=value=>normalize(value).replace(/\(ls\)/g,'').replace(/[^a-z0-9가-힣]/g,'');
        const rows=parsed.rows.flatMap(row=>{
          const explicit=Object.hasOwn(partMappings,row.row),matches=parts.filter(item=>normalize(item.name)===normalize(row.partName));
          const partId=explicit?partMappings[row.row]||'':matches.length===1?matches[0].id:'';
          return row.counts.map(count=>{
            const candidates=partId?project.relations.filter(relation=>['applies_to','produces'].includes(relation.type)&&relation.to===partId).map(relation=>project.entities.find(item=>item.id===relation.from)).filter(step=>step?.type==='Production Step'&&stageKey(step.productionStage||step.name.split('·').at(-1))===stageKey(count.stage)):[];
            const key=partId+':'+count.column,explicit=Object.hasOwn(stepMappings,key);
            return {...count,row:row.row,code:row.code,partName:row.partName,partId,stepId:explicit?stepMappings[key]:candidates.length===1?candidates[0].id:''};
          });
        });
        const usedKeys=new Set(rows.filter(row=>row.partId).map(row=>row.partId+':'+row.column));
        if(Object.keys(stepMappings).some(key=>!usedKeys.has(key)))throw Error('Step mapping does not match a reviewed Part and process column.');
        json(res,200,store.saveWip({projectId:project.id,revision:input.revision,capturedAt:input.capturedAt,filename:input.filename,sheet:parsed.sheet,rows}));return;
      }
      if (req.method==='GET' && pathname==='/api/export') {
        res.setHeader('Content-Disposition','attachment; filename="pm-process-twin-backup.json"');
        json(res,200,store.exportAll());return;
      }
      if(req.method==='GET'&&pathname==='/api/changes'){
        json(res,200,store.listChanges(url.searchParams.get('scope')||'',Number(url.searchParams.get('offset')||0),url.searchParams.get('date')||''));return;
      }
      const changeRoute=pathname.match(/^\/api\/changes\/(change-[A-Za-z0-9-]+)\/(keep|revert)$/);
      if(req.method==='POST'&&changeRoute){
        json(res,200,changeRoute[2]==='keep'?store.keepChange(changeRoute[1]):store.revertChange(changeRoute[1],(await readJson(req)).revision));return;
      }
      const settingsRoute=pathname.match(/^\/api\/settings\/([A-Za-z0-9_-]+)\/(overview|production|stakeholders|library|lens-(?:commercial|engineering|purchasing|production|quality|logistics))$/);
      if (req.method==='PUT' && settingsRoute) {
        json(res,200,store.putSettings(settingsRoute[1],settingsRoute[2],await readJson(req)));return;
      }
      if (req.method==='POST' && pathname==='/api/workspace') {
        const {workspace,scope,revision,ingestionCommit}=await readJson(req);
        json(res,200,store.save(workspace,scope,revision,ingestionCommit));return;
      }
      if (req.method==='POST' && pathname==='/api/extract') {
        if (!geminiKey) {const error=Error('AI not configured. Set GEMINI_API_KEY on the local server.');error.status=503;throw error;}
        const input=await readJson(req),workspace=store.load();
        const scope=input.scope==='library'?workspace.library:workspace.projects.find(p=>p.id===input.scope);
        if(!scope||scope.status==='archived')throw Error('Open an active project or Library.');
        const filename=String(input.filename||'pasted-notes.txt').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
        const mimeType=input.mimeType||'text/plain';
        if(!['text/plain','text/markdown','text/csv','application/pdf'].includes(mimeType))throw Error('Use TXT, Markdown, CSV, or PDF.');
        if((typeof input.text==='string')===(typeof input.base64==='string'))throw Error('Send text or one file, not both.');
        if(input.base64 && (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)||input.base64.length%4!==0))throw Error('Invalid file data.');
        const content=typeof input.text==='string'?Buffer.from(input.text,'utf8'):Buffer.from(input.base64,'base64');
        if(!content.length||content.length>10_000_000)throw Error('Source must be between 1 byte and 10 MB.');
        const prompt=Ingest.buildPrompt({entities:[]},{filename,mimeType})+'\nExtract only supported facts. Use candidate IDs for references. Unknown facts belong in unresolved.';
        const parts=[{text:prompt}];
        if(mimeType==='application/pdf')parts.push({inlineData:{mimeType,data:content.toString('base64')}});
        else parts.push({text:'SOURCE CONTENT:\n'+content.toString('utf8')});
        const upstream=await geminiFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{
          method:'POST',headers:{'x-goog-api-key':geminiKey,'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseFormat:{text:{mimeType:'application/json',schema:EXTRACTION_SCHEMA}}}}),
          signal:AbortSignal.timeout(120000)
        });
        if(!upstream.ok)throw Error('AI provider rejected extraction ('+upstream.status+').');
        const response=await upstream.json();
        const answer=(response.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('');
        if(!answer)throw Error('AI provider returned no draft.');
        const output=JSON.parse(answer);
        const normalized=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
        for(const candidate of output.objects||[]) {
          delete candidate.matchedObjectId;
          delete candidate.possibleMatches;
          const matches=workspace.library.entities.filter(e=>e.type===candidate.type&&normalized(e.name)===normalized(candidate.name));
          candidate.suggestedAction=matches.length===1?'link_existing':'create';
          if(matches.length===1)candidate.matchedObjectId=matches[0].id;
          if(matches.length)candidate.possibleMatches=matches.map(e=>({id:e.id,name:e.name,type:e.type}));
        }
        const draft=Ingest.validateDraft(workspace.library,output);
        if(draft.errors.length)throw Error('AI draft needs correction: '+draft.errors.join(' '));
        json(res,200,store.saveIngestion({filename,mimeType,content,draft,scope:scope.id}));return;
      }
      const asset=pathname==='/'?'index.html':pathname.slice(1);
      if (req.method==='GET' && !asset.includes('/') && ASSETS.has(asset)) {
        const file=path.join(__dirname,asset);
        if (!fs.existsSync(file)) {json(res,404,{error:'Not found.'});return;}
        res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
        fs.createReadStream(file).pipe(res);return;
      }
      json(res,404,{error:'Not found.'});
    } catch (error) {
      json(res,error.status|| (error.message==='STALE_REVISION'||/latest saved change|already reviewed|Saved data changed/.test(error.message)?409:400),{error:error.message});
    }
  });
  return {
    listen:() => new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',() => {server.off('error',reject);resolve('http://127.0.0.1:'+server.address().port);});}),
    close:() => new Promise((resolve,reject) => server.close(error => {store.close();error?reject(error):resolve();}))
  };
}

if (require.main===module) {
  createServer({port:Number(process.env.PORT)||4173,dbPath:process.env.PM_DB_PATH||undefined}).listen()
    .then(url => process.stdout.write('PM Process Twin local: '+url+'\n'))
    .catch(error => {process.stderr.write(error.message+'\n');process.exitCode=1;});
}

module.exports = {createServer};
