'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createManagementApi}=require('./supabase-management');
const tables=new Set(['projects','entities','relations','project_memberships','project_assessments','project_schedules','project_workstreams','project_view_settings','sources','ingestion_jobs','wip_snapshots','wip_counts','hourly_records','sample_preparation_records']);
async function verifyFirebaseMigration(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../backups/firebase-latest.manifest.json'))),snapshot=manifest.sha256;
 if(!/^[a-f0-9]{64}$/.test(snapshot))throw Error('INVALID_FIREBASE_MANIFEST');
 const api=createManagementApi({project:'ahzpuefosoajwwgbfhng',token:process.env.SUPABASE_ACCESS_TOKEN});
 const query=sql=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:true})});
 const [archive]=await query(`SELECT e.status,count(d.path)::integer documents,count(d.path) FILTER(WHERE encode(extensions.digest(d.document_json,'sha256'),'hex')<>d.sha256)::integer invalid_hashes FROM pm.firebase_exports e LEFT JOIN pm.firebase_documents d ON d.snapshot_hash=e.snapshot_hash WHERE e.snapshot_hash='${snapshot}' GROUP BY e.status`);
 if(archive?.status!=='committed'||archive.documents!==manifest.retainedDocuments||archive.invalid_hashes)throw Error('FIREBASE_ARCHIVE_NOT_VERIFIED');
 const selected=Object.keys(manifest.candidatesByTable);if(selected.some(t=>!tables.has(t)))throw Error('UNSUPPORTED_CANDIDATE_TABLE');
 const sql=selected.map(table=>{
  const row=table==='sources'?"(to_jsonb(t)-'owner_id'-'rowid'-'content')||jsonb_build_object('content',replace(encode(t.content,'base64'),E'\\n',''))":"to_jsonb(t)-'owner_id'-'rowid'";
  return `SELECT '${table}' table_name,count(*)::integer candidates,count(*) FILTER(WHERE actual.value IS NULL)::integer missing,count(*) FILTER(WHERE actual.value IS NOT NULL AND actual.value<>c.row_json AND NOT EXISTS(SELECT 1 FROM pm.firebase_conflicts f WHERE f.snapshot_hash=c.snapshot_hash AND f.table_name=c.table_name AND f.key_json=c.key_json))::integer differences FROM pm.firebase_candidates c JOIN pm.firebase_exports e ON e.snapshot_hash=c.snapshot_hash LEFT JOIN LATERAL (SELECT ${row} value FROM pm.${table} t WHERE t.owner_id=e.owner_id AND to_jsonb(t)@>c.key_json LIMIT 1) actual ON true WHERE c.snapshot_hash='${snapshot}' AND c.table_name='${table}'`;
 }).join(' UNION ALL ');
 const candidates=await query(sql);
 if(candidates.some(t=>t.candidates!==manifest.candidatesByTable[t.table_name]||t.missing||t.differences))throw Error('FIREBASE_APPLICATION_ROWS_REQUIRE_REVIEW');
 const [counts]=await query(`SELECT (SELECT value::integer FROM pm.meta m WHERE m.owner_id=e.owner_id AND m.key='revision') revision,(SELECT count(*)::integer FROM pm.projects WHERE owner_id=e.owner_id) projects,(SELECT count(*)::integer FROM pm.entities WHERE owner_id=e.owner_id) objects,(SELECT count(*)::integer FROM pm.relations WHERE owner_id=e.owner_id) relations,(SELECT count(*)::integer FROM pm.sources WHERE owner_id=e.owner_id) sources,(SELECT count(*)::integer FROM pm.wip_snapshots WHERE owner_id=e.owner_id) progress_snapshots,(SELECT count(*)::integer FROM pm.wip_counts WHERE owner_id=e.owner_id) progress_counts,(SELECT count(*)::integer FROM pm.sample_preparation_records WHERE owner_id=e.owner_id) preparation_records,(SELECT count(*)::integer FROM pm.firebase_conflicts WHERE snapshot_hash=e.snapshot_hash) preserved_conflicts,pg_database_size(current_database()) database_bytes FROM pm.firebase_exports e WHERE snapshot_hash='${snapshot}'`);
 const report={status:'verified',exportedAt:manifest.readTime,documents:archive.documents,invalidHashes:archive.invalid_hashes,candidateRows:candidates.reduce((n,t)=>n+t.candidates,0),candidates,...counts};
 console.log(JSON.stringify(report));return report;
}
if(require.main===module)verifyFirebaseMigration().catch(e=>{console.error(/^[A-Z_0-9]+$/.test(e.message)?e.message:'FIREBASE_MIGRATION_VERIFICATION_FAILED');process.exitCode=1;});
module.exports={verifyFirebaseMigration};
