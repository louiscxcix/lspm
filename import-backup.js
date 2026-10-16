'use strict';
const Projects=require('./projects');
const TABLES={projects:'projects',entities:'entities',memberships:'project_memberships',assessments:'project_assessments',projectSchedules:'project_schedules',workstreams:'project_workstreams',relations:'relations',viewSettings:'project_view_settings',changes:'entity_changes',sources:'sources',ingestionJobs:'ingestion_jobs',changeSets:'change_sets',wipSnapshots:'wip_snapshots',wipCounts:'wip_counts',staffingCounts:'staffing_counts',productionStaffingCounts:'production_staffing_counts'};

// Run only inside withPostgresStore, so import is atomic, owner-scoped and locked.
async function importBackup(store,client,backup) {
  if(backup?.format!=='pm-process-twin-local'||backup.version!==1||!Number.isSafeInteger(backup.revision)||backup.revision<0)throw Error('Unsupported backup format.');
  if(!Array.isArray(backup.entities)||!Array.isArray(backup.projects))throw Error('Missing backup records.');
  const existing=await store.exportAll();
  if(existing.revision!==0||Object.keys(TABLES).some(key=>existing[key]?.length))throw Error('Import requires an empty account. Existing data will not be replaced.');
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for(const [key,table] of Object.entries(TABLES)){
    const rows=backup[key]||[];
    if(!Array.isArray(rows))throw Error('Invalid backup table: '+key);
    const result=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='pm' AND table_name=$1",[table]);
    const allowed=new Set(result.rows.map(row=>row.column_name).filter(name=>!['owner_id','rowid'].includes(name)));
    for(const source of rows){
      if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Invalid backup row.');
      const row={...source};
      if(table==='sources'){
        if(typeof row.content!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.content))throw Error('Invalid source bytes.');
        row.content=Buffer.from(row.content,'base64');
      }
      const columns=Object.keys(row);
      if(!columns.length||columns.some(column=>!allowed.has(column)))throw Error('Unsupported backup columns in '+key);
      await client.query('INSERT INTO pm.'+table+'('+columns.join(',')+') VALUES ('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(column=>row[column]));
    }
  }
  await client.query("UPDATE pm.meta SET value=$1 WHERE key='revision'",[String(backup.revision)]);
  const workspace=await store.load();
  Projects.validateWorkspace({version:2,projects:workspace.projects});
  Projects.validate(workspace.library);
  return workspace;
}
module.exports={importBackup,TABLES};
