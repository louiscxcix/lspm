'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SESSION_MS=30*24*60*60*1000;
const pick=(object,keys)=>Object.fromEntries(keys.filter(k=>object[k]!==undefined).map(k=>[k,object[k]]));
const ENTITY_FIELDS=['id','type','name','status','projectId','role','title','processLevel','parentWorkId','branchKind','phase','apqpPhase','operationCode','productionStage','displayProcessName','workCenter','resourceKind','machineMode','machineFamily','assetId','tier','site','workerRole','workArea','department','productionFamily','productFamily','itemKind','side','verticalPosition','pieceIndex','storageRole','modelCode','codeNamespace','sourcePartName','mappingState'];
const RELATION_FIELDS=['id','type','from','to','scopeProjectId','projectId','quantity','unit','basis','routePartId','reviewState'];
ENTITY_FIELDS.push('qualityKind','qualityCode','qualityColor','qualityDisposition','qualityGroup','qualityFamily','qualityPlan','qualityCC','qualityDocument','applicability','mappingState');
function basicWorkspace(workspace){
  const project=workspace.projects.find(p=>p.id==='project-e35a946f-5e00-42b3-a76d-7158a2f395e1'&&p.status!=='archived')||workspace.projects.find(p=>p.name==='LS'&&p.status!=='archived');
  const entities=(project?.entities||[]).filter(e=>!['Risk','Issue','Event','Evidence','Stakeholder Assessment'].includes(e.type)&&e.privacy!=='local_only').map(e=>pick(e,ENTITY_FIELDS)),ids=new Set(entities.map(e=>e.id));
  const relations=(project?.relations||[]).filter(r=>ids.has(r.from)&&ids.has(r.to)).map(r=>pick(r,RELATION_FIELDS));
  const graph={id:project?.id||'',name:'LS',status:'active',version:2,entities,relations,changes:[],workstreams:Object.fromEntries(Object.entries(project?.workstreams||{}).filter(([id])=>ids.has(id)))};
  return {revision:0,library:{id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[],changes:[]},projects:project?[graph]:[],viewSettings:{},pendingChange:null,access:{enabled:true,mode:'basic',projectId:graph.id}};
}
function basicMetrics(store,pathname,projectId){
  const ids=new Set(basicWorkspace(store.load()).projects[0]?.entities.map(e=>e.id)||[]);
  if(pathname==='/api/progress'){const data=store.listProgress(projectId);for(const r of [...data.snapshots,...data.rows])delete r.eventId;return {...data,rows:data.rows.filter(r=>ids.has(r.partId)&&ids.has(r.stepId))};}
  if(pathname==='/api/wip'){
    const data=store.listWip(projectId),latest=data.snapshots[0];
    return {selected:latest?.id||'',snapshots:latest?[{id:latest.id,capturedAt:latest.capturedAt}]:[],counts:data.counts.filter(row=>ids.has(row.partId)&&(!row.stepId||ids.has(row.stepId))).map(row=>pick(row,['partId','stepId','stage','quantity']))};
  }
  const rows=pathname==='/api/staffing'?store.listStaffing(projectId):store.listProductionStaffing(projectId),seen=new Set();
  return rows.filter(row=>{const id=row.targetId||row.partId,key=id+'|'+row.basis;if(!ids.has(id)||seen.has(key))return false;seen.add(key);return true;}).map(row=>pick(row,['id','partId','targetId','targetType','capturedAt','basis','count']));
}
function createAccess(filename,{initialPassword}={}){
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  const save=data=>{fs.writeFileSync(filename+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(filename+'.tmp',filename);fs.chmodSync(filename,0o600);};
  const credentialFile=path.join(path.dirname(filename),'owner-access.txt');
  const hash=(password,salt)=>crypto.scryptSync(password,salt,32).toString('hex');
  if(!fs.existsSync(filename)){
    const password=initialPassword||crypto.randomBytes(18).toString('base64url'),salt=crypto.randomBytes(16).toString('hex');
    save({salt,hash:hash(password,salt),sessions:[]});
    if(!initialPassword)fs.writeFileSync(credentialFile,'PM Process Twin · 로컬 내 전용 접속\n\n초기 비밀번호: '+password+'\n\n앱 상단 내 전용 → 로그인 → 비밀번호 변경에서 원하는 비밀번호로 바꾸세요.\n비밀번호 변경 후 이 초기 비밀번호는 사용할 수 없습니다.\n',{mode:0o600});
  }
  const load=()=>JSON.parse(fs.readFileSync(filename,'utf8'));
  const attempts=new Map();
  const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
  const token=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pm_owner='))?.slice(9)||'';
  const authenticated=req=>{const value=token(req);return value.length===64&&load().sessions.some(s=>s.hash===digest(value)&&s.expires>Date.now());};
  const cookie=(res,value,maxAge)=>res.setHeader('Set-Cookie','pm_owner='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge);
  const verify=(password,data)=>typeof password==='string'&&password.length<=256&&crypto.timingSafeEqual(Buffer.from(hash(password,data.salt),'hex'),Buffer.from(data.hash,'hex'));
  function resetPassword(password,keepToken=''){
    if(typeof password!=='string'||password.length<4||password.length>256)throw Error('새 비밀번호는 4~256자로 입력하세요.');
    const data=load();data.salt=crypto.randomBytes(16).toString('hex');data.hash=hash(password,data.salt);data.sessions=keepToken?data.sessions.filter(s=>s.hash===digest(keepToken)):[];save(data);
    if(fs.existsSync(credentialFile))fs.writeFileSync(credentialFile,'비밀번호가 변경되었습니다. 앱에서 지정한 새 비밀번호를 사용하세요.\n',{mode:0o600});
  }
  async function handle(req,res,url,readJson,json){
    if(!url.pathname.startsWith('/api/access/'))return false;
    if(req.method==='GET'&&url.pathname==='/api/access/status'){json(res,200,{enabled:true,mode:authenticated(req)?'owner':'basic'});return true;}
    if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return true;}
    const key=req.socket.remoteAddress||'local',failure=attempts.get(key);
    if(url.pathname==='/api/access/login'){
      if(failure?.until>Date.now()){json(res,429,{error:'로그인 시도가 많습니다. 5분 후 다시 시도하세요.'});return true;}
      const input=await readJson(req),data=load();
      if(!verify(input.password,data)){
        const count=(failure?.window>Date.now()?failure.count:0)+1;attempts.set(key,{count,window:Date.now()+300000,until:count>=5?Date.now()+300000:0});json(res,401,{error:'비밀번호가 맞지 않습니다.'});return true;
      }
      attempts.delete(key);const value=crypto.randomBytes(32).toString('hex');data.sessions=data.sessions.filter(s=>s.expires>Date.now()).slice(-63);data.sessions.push({hash:digest(value),expires:Date.now()+SESSION_MS});save(data);cookie(res,value,SESSION_MS/1000);json(res,200,{mode:'owner'});return true;
    }
    if(url.pathname==='/api/access/logout'){
      const data=load();data.sessions=data.sessions.filter(s=>s.hash!==digest(token(req)));save(data);cookie(res,'',0);json(res,200,{mode:'basic'});return true;
    }
    if(url.pathname==='/api/access/password'){
      if(!authenticated(req)){json(res,401,{error:'내 전용 로그인이 필요합니다.'});return true;}
      const input=await readJson(req),data=load();if(!verify(input.currentPassword,data)){json(res,401,{error:'현재 비밀번호가 맞지 않습니다.'});return true;}
      resetPassword(input.password,token(req));
      json(res,200,{mode:'owner'});return true;
    }
    json(res,404,{error:'Not found.'});return true;
  }
  return {authenticated,handle,basicWorkspace,resetPassword};
}
module.exports={createAccess,basicWorkspace,basicMetrics};
