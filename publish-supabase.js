'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {redact}=require('./firebase-transfer');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const configPath=path.resolve(__dirname,'../.local-data/supabase-publisher.json');
const cachePath=path.resolve(__dirname,'../.local-data/supabase-publish-state.json');
function changesFrom(db,cache={}){
  const rows=[];
  for(const table of ['sources','entities','relations','project_memberships'])for(const raw of db.prepare('SELECT * FROM '+table).all()){
    const row={...raw};
    if(table==='sources'){
      if(row.mime_type==='application/pdf')continue; // Original attachment transfer has its own verified migration.
      const text=Buffer.from(row.content).toString('utf8');row.content=Buffer.from(typeof redact(text)==='string'?redact(text):text).toString('base64');
      row.metadata_json=redact(row.metadata_json);
    }
    const id=table==='project_memberships'?JSON.stringify([row.project_id,row.entity_id]):row.id,key=table+':'+id,fingerprint=hash(row);
    if(cache[key]?.hash===fingerprint)continue;
    rows.push({table,id,row,...(table==='entities'&&cache[key]?.row?{before:cache[key].row}:{}),fingerprint,key});
  }
  return rows;
}
async function publish({fetchImpl=fetch,configFile=configPath,stateFile=cachePath,dbFile=process.env.PM_DB_PATH||path.resolve(__dirname,'../.local-data/ontology.sqlite'),statusOnly=false}={}){
  if(!fs.existsSync(configFile))throw Error('SUPABASE_PUBLISHER_NOT_CONFIGURED');
  const config=JSON.parse(fs.readFileSync(configFile)),base='https://ahzpuefosoajwwgbfhng.supabase.co/rest/v1/rpc/';
  async function rpc(name,input){
    const r=await fetchImpl(base+name,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_token:config.token,...input}),signal:AbortSignal.timeout(60000)});
    if(!r.ok)throw Error('SUPABASE_PUBLISH_FAILED_'+r.status);return r.json();
  }
  if(statusOnly)return rpc('pm_history_sync_status',{});
  const cache=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};
  const db=new DatabaseSync(dbFile,{readOnly:true});let rows;
  try{rows=changesFrom(db,cache.records||{});}finally{db.close();}
  if(!rows.length)return {unchanged:true,pendingConflicts:cache.pendingConflicts||0};
  cache.records||={};let changed=0,conflicts=0,revision;let batch=[];
  async function flush(){
    if(!batch.length)return;const changes=batch.map(({table,id,row,before})=>({table,id,row,...(before?{before}:{})})),result=await rpc('pm_ingest_local_history',{p_batch:{key:hash(changes),changes}}),accepted=new Set(result.accepted.map(x=>x.table+':'+x.id));
    for(const item of batch)if(accepted.has(item.key))cache.records[item.key]={hash:item.fingerprint,...(item.table==='entities'?{row:item.row}:{})};
    changed+=result.changed;conflicts+=result.conflicts.length;revision=result.revision;cache.lastConfirmedAt=new Date().toISOString();cache.remoteRevision=revision;cache.pendingConflicts=conflicts;
    const temp=stateFile+'.pending';fs.writeFileSync(temp,JSON.stringify(cache),{mode:0o600});fs.renameSync(temp,stateFile);batch=[];
  }
  for(const row of rows){if(Buffer.byteLength(JSON.stringify(row.row))>380000)throw Error('PUBLISH_RECORD_REQUIRES_ATTACHMENT_TRANSFER');if(batch.length>=200||Buffer.byteLength(JSON.stringify(batch))+Buffer.byteLength(JSON.stringify(row))>390000)await flush();batch.push(row);}await flush();
  return {changed,conflicts,revision,recordsConsidered:rows.length};
}
if(require.main===module)publish({statusOnly:process.argv.includes('--status')}).then(result=>{console.log(JSON.stringify(result));if(result.conflicts)process.exitCode=2;}).catch(e=>{console.error(/^[A-Z_0-9]+$/.test(e.message)?e.message:'SUPABASE_PUBLISH_FAILED');process.exitCode=1;});
module.exports={changesFrom,publish};
