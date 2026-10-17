'use strict';
const fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto');
const {withVerifiedBackup}=require('./inspect-encrypted-backup');
const {createManagementApi}=require('./supabase-management');
const {TABLES}=require('../import-backup');
const CORE_TABLES=Object.values(TABLES);
const identifier=name=>'"'+name.replaceAll('"','""')+'"';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";

function readBackup(options){
  return withVerifiedBackup(options,(db,report)=>{
    const rows=[];
    for(const table of Object.keys(report.tables)){
      for(const [index,row] of db.prepare('SELECT * FROM '+identifier(table)+' ORDER BY rowid').all().entries()){
        for(const [key,value] of Object.entries(row))if(value instanceof Uint8Array)row[key]=Buffer.from(value).toString('base64');
        const text=JSON.stringify(row);
        rows.push({table_name:table,row_index:index,row_text:text,row_hash:createHash('md5').update(text).digest('hex')});
      }
    }
    return {report,rows};
  });
}

async function restoreBackup({query,backup,backupSha256,onStage=()=>{}}){
  const {report,rows}=backup;
  if(!/^[a-f0-9]{64}$/.test(backupSha256)||!Number.isSafeInteger(report.revision))throw Error('INVALID_BACKUP');
  for(const table of CORE_TABLES)if(!report.tables[table])throw Error('MISSING_BACKUP_TABLE');
  onStage('check-target');
  let [recovery]=await query('SELECT id,owner_id,state FROM pm.backup_recovery WHERE backup_sha256=$1',[backupSha256]);
  if(!recovery){
    const [publication]=await query('SELECT owner_id FROM pm.publication WHERE singleton=true');
    if(!publication)throw Error('PUBLIC_WORKSPACE_NOT_CONFIGURED');
    // An existing record in any account requires review instead of a duplicate import.
    const [counts]=await query('SELECT '+CORE_TABLES.map(table=>'(SELECT count(*) FROM pm.'+table+')').join('+')+' AS count');
    if(Number(counts.count)!==0)throw Error('SUPABASE_ALREADY_HAS_RECORDS');
    const id=randomUUID();
    await query("INSERT INTO pm.backup_recovery(id,backup_sha256,owner_id,revision,state,manifest) VALUES($1,$2,$3,$4,'staging',$5::jsonb) ON CONFLICT(backup_sha256) DO NOTHING",[id,backupSha256,publication.owner_id,report.revision,JSON.stringify(report)]);
    [recovery]=await query('SELECT id,owner_id,state FROM pm.backup_recovery WHERE backup_sha256=$1',[backupSha256]);
  }
  const id=recovery.id;
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('INVALID_RECOVERY_ID');
  if(recovery.state!=='committed'){
    onStage('stage-original-rows');
    let batch=[],bytes=0;
    const flush=async()=>{
      if(!batch.length)return;
      await query(`INSERT INTO pm.backup_recovery_rows(recovery_id,table_name,row_index,row_text,row_hash)
        SELECT $1::uuid,x.table_name,x.row_index,x.row_text,x.row_hash
        FROM jsonb_to_recordset($2::jsonb) x(table_name text,row_index integer,row_text text,row_hash text)
        ON CONFLICT(recovery_id,table_name,row_index) DO UPDATE SET row_text=excluded.row_text,row_hash=excluded.row_hash`,[id,JSON.stringify(batch)]);
      batch=[];bytes=0;
    };
    for(const row of rows){const size=Buffer.byteLength(JSON.stringify(row));if(bytes+size>250000)await flush();batch.push(row);bytes+=size;}
    await flush();
    onStage('commit-application-records');
    const columns=await query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='pm' AND table_name=ANY($1::text[]) ORDER BY ordinal_position",[CORE_TABLES]);
    let sql=`BEGIN; SET CONSTRAINTS ALL DEFERRED;
DO $guard$ DECLARE target UUID; expected INTEGER; actual INTEGER; item RECORD; BEGIN
  SELECT owner_id INTO target FROM pm.backup_recovery WHERE id=${literal(id)}::uuid FOR UPDATE;
  IF (SELECT state FROM pm.backup_recovery WHERE id=${literal(id)}::uuid)<>'staging' THEN RAISE EXCEPTION 'RECOVERY_STATE_CHANGED'; END IF;
  PERFORM owner_id FROM pm.publication WHERE singleton=true AND owner_id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_WORKSPACE_CHANGED'; END IF;
  PERFORM value FROM pm.meta WHERE owner_id=target AND key='revision' FOR UPDATE;
  IF (SELECT value FROM pm.meta WHERE owner_id=target AND key='revision')<>'0' THEN RAISE EXCEPTION 'TARGET_REVISION_CHANGED'; END IF;
  IF (${CORE_TABLES.map(table=>'(SELECT count(*) FROM pm.'+table+')').join('+')})<>0 THEN RAISE EXCEPTION 'SUPABASE_ALREADY_HAS_RECORDS'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each((SELECT manifest->'tables' FROM pm.backup_recovery WHERE id=${literal(id)}::uuid)) LOOP
    expected:=(item.value->>'count')::integer;
    SELECT count(*) INTO actual FROM pm.backup_recovery_rows WHERE recovery_id=${literal(id)}::uuid AND table_name=item.key;
    IF actual<>expected THEN RAISE EXCEPTION 'STAGED_ROW_COUNT_MISMATCH'; END IF;
  END LOOP;
END $guard$;\n`;
    for(const table of CORE_TABLES){
      const names=columns.filter(c=>c.table_name===table&&!['owner_id','rowid'].includes(c.column_name)).map(c=>c.column_name);
      if(!names.length||names.some(name=>!report.tables[table].columns.includes(name)))throw Error('BACKUP_COLUMN_MISMATCH');
      const expressions=names.map(name=>table==='sources'&&name==='content'?"decode(r.row_text::jsonb->>'content','base64')":'(jsonb_populate_record(NULL::pm.'+table+',r.row_text::jsonb)).'+identifier(name));
      sql+='INSERT INTO pm.'+table+'(owner_id,'+names.map(identifier).join(',')+') SELECT b.owner_id,'+expressions.join(',')+' FROM pm.backup_recovery_rows r JOIN pm.backup_recovery b ON b.id=r.recovery_id WHERE r.recovery_id='+literal(id)+"::uuid AND r.table_name="+literal(table)+' ORDER BY r.row_index;\n';
    }
    sql+=`INSERT INTO pm.meta(owner_id,key,value) SELECT b.owner_id,r.row_text::jsonb->>'key',r.row_text::jsonb->>'value' FROM pm.backup_recovery_rows r JOIN pm.backup_recovery b ON b.id=r.recovery_id WHERE b.id=${literal(id)}::uuid AND r.table_name='meta' AND r.row_text::jsonb->>'key'<>'schema_version' ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value;\n`;
    for(const table of CORE_TABLES)sql+=`DO $check$ BEGIN IF (SELECT count(*) FROM pm.${table} WHERE owner_id=(SELECT owner_id FROM pm.backup_recovery WHERE id=${literal(id)}::uuid))<>${report.tables[table].count} THEN RAISE EXCEPTION 'IMPORTED_ROW_COUNT_MISMATCH'; END IF; END $check$;\n`;
    sql+=`UPDATE pm.backup_recovery SET state='committed',committed_at=now() WHERE id=${literal(id)}::uuid; COMMIT;`;
    try{await query(sql);}catch(error){await query('ROLLBACK').catch(()=>{});throw error;}
  }
  onStage('verify-imported-counts');
  const [counts]=await query(`SELECT (SELECT count(*)::integer FROM pm.entities WHERE owner_id=b.owner_id) AS objects,(SELECT count(*)::integer FROM pm.relations WHERE owner_id=b.owner_id) AS relations,(SELECT count(*)::integer FROM pm.projects WHERE owner_id=b.owner_id) AS projects,(SELECT count(*)::integer FROM pm.sources WHERE owner_id=b.owner_id) AS sources,jsonb_array_length(public.pm_public_read('workspace')->'library'->'entities') AS public_objects,(SELECT count(*)::integer FROM pm.backup_recovery_rows WHERE recovery_id=b.id) AS archived_rows FROM pm.backup_recovery b WHERE id=$1`,[id]);
  if(!counts||counts.public_objects===0)throw Error('PUBLIC_OBJECTS_UNAVAILABLE');
  return {status:'restored',revision:report.revision,counts,previouslyCommitted:recovery.state==='committed',additionalTablesPreserved:Object.keys(report.tables).filter(t=>!CORE_TABLES.includes(t)&&t!=='meta')};
}

async function main(){
  process.umask(0o077);let stage='verify-backup';
  const output=process.argv[3];
  try{
    const directory=process.argv[2];
    const backup=readBackup({directory,key:process.env.LSPM_DB_BACKUP_KEY});
    const manifest=JSON.parse(fs.readFileSync(directory+'/ontology-2026-10-16.manifest.json','utf8'));
    const token=process.env.SUPABASE_ACCESS_TOKEN?.trim();if(!token)throw Error('MISSING_SUPABASE_ACCESS_TOKEN');
    const api=createManagementApi({project:'ahzpuefosoajwwgbfhng',token});
    const query=(sql,parameters=[])=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql,...(parameters.length?{parameters}:{})})});
    const result=await restoreBackup({query,backup,backupSha256:manifest.plaintextSha256,onStage:value=>{stage=value;console.log('Original backup recovery: '+stage);}});
    fs.writeFileSync(output,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(result));
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## Original objects restored\n\nVerified Supabase record counts: '+JSON.stringify(result.counts)+'. Additional tables remain in the private recovery archive.\n');
  }catch(error){
    // SQL errors may contain failing business records. Emit only controlled codes.
    const code=/^[A-Z_]+$/.test(error.message)?error.message:'RECOVERY_STAGE_FAILED';
    const result={status:'failed',stage,code};
    if(output&&!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
    console.error(JSON.stringify(result));process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={readBackup,restoreBackup};
