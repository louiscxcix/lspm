'use strict';
const fs=require('node:fs'),path=require('node:path');

async function applyMigrations(query,directory,log=console.log){
  const files=fs.readdirSync(directory).filter(name=>/^\d{12,}_[a-zA-Z0-9_-]+\.sql$/.test(name)).sort();
  if(!files.length)throw Error('No Supabase SQL migrations found.');
  const versions=files.map(name=>name.split('_')[0]);
  if(new Set(versions).size!==versions.length)throw Error('Duplicate SQL migration versions.');
  const state=await query("SELECT to_regnamespace('pm') IS NOT NULL AS has_schema, to_regclass('pm.meta') IS NOT NULL AS has_meta, to_regclass('pm.migration_version') IS NOT NULL AS has_ledger");
  if((state[0]?.has_schema&&!state[0]?.has_ledger)||(state[0]?.has_ledger&&!state[0]?.has_meta))throw Error('Unrecognized existing pm schema. Review it before migration.');
  const applied=state[0]?.has_ledger?(await query('SELECT version FROM pm.migration_version ORDER BY version')).map(row=>row.version):[];
  if(applied.some(version=>!versions.includes(version)))throw Error('Database contains migration versions absent from this checkout.');
  for(let i=0;i<versions.length;i++){
    const version=versions[i];
    if(applied.includes(version))continue;
    if(applied.some(existing=>existing>version))throw Error('Out-of-order migration '+version+'. Review it before deployment.');
    log('Applying PostgreSQL migration '+version+'…');
    const sql=fs.readFileSync(path.join(directory,files[i]),'utf8');
    // Versions are validated digits; migration contents are reviewed repository code.
    await query('BEGIN;\n'+sql+"\nINSERT INTO pm.migration_version(version) VALUES ('"+version+"') ON CONFLICT DO NOTHING;\nCOMMIT;");
    applied.push(version);
  }
  log('PostgreSQL schema is up to date ('+applied.length+' migrations).');
}
module.exports={applyMigrations};
