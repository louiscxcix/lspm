'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {DatabaseSync} = require('node:sqlite');
const {createStore,ASSESSMENT_FIELDS,PROJECT_SCHEDULE_FIELDS}=require('./store-core');

function openStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), {recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_memberships (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_assessments (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), data_json TEXT NOT NULL, PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_schedules (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), data_json TEXT NOT NULL, PRIMARY KEY(project_id, entity_id));
    CREATE TABLE IF NOT EXISTS project_workstreams (project_id TEXT NOT NULL REFERENCES projects(id), entity_id TEXT NOT NULL REFERENCES entities(id), code TEXT NOT NULL, PRIMARY KEY(project_id, entity_id, code));
    CREATE TABLE IF NOT EXISTS relations (id TEXT PRIMARY KEY, type TEXT NOT NULL, from_id TEXT NOT NULL REFERENCES entities(id), to_id TEXT NOT NULL REFERENCES entities(id), scope_project_id TEXT REFERENCES projects(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_view_settings (project_id TEXT NOT NULL, view_key TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(project_id, view_key));
    CREATE TABLE IF NOT EXISTS entity_changes (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), project_id TEXT REFERENCES projects(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ingestion_jobs (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), status TEXT NOT NULL, draft_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS change_sets (id TEXT PRIMARY KEY, scope TEXT, recorded_at TEXT NOT NULL, revision INTEGER NOT NULL, items_json TEXT NOT NULL, rows_json TEXT NOT NULL, acknowledged_at TEXT, reverted_at TEXT, revert_of TEXT);
    CREATE TABLE IF NOT EXISTS wip_snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), captured_at TEXT NOT NULL, filename TEXT NOT NULL, sheet TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wip_counts (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES wip_snapshots(id), source_row INTEGER NOT NULL, source_column INTEGER NOT NULL, product_code TEXT NOT NULL, part_label TEXT NOT NULL, part_id TEXT REFERENCES entities(id), stage_label TEXT NOT NULL, step_id TEXT REFERENCES entities(id), quantity INTEGER NOT NULL CHECK(quantity>=0));
    CREATE INDEX IF NOT EXISTS wip_counts_snapshot ON wip_counts(snapshot_id,source_row,source_column);
    CREATE TABLE IF NOT EXISTS staffing_counts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), part_id TEXT NOT NULL REFERENCES entities(id), captured_at TEXT NOT NULL, shift TEXT NOT NULL, basis TEXT NOT NULL, count INTEGER NOT NULL CHECK(count>=0), note TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS production_staffing_counts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), target_id TEXT NOT NULL REFERENCES entities(id), target_type TEXT NOT NULL CHECK(target_type IN ('Production Step','Resource')), captured_at TEXT NOT NULL, shift TEXT NOT NULL, basis TEXT NOT NULL CHECK(basis IN ('observed','planned')), count INTEGER NOT NULL CHECK(count>=0), note TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS production_staffing_project ON production_staffing_counts(project_id,captured_at);
    INSERT OR IGNORE INTO meta(key,value) VALUES ('revision','0'),('schema_version','2');
    UPDATE meta SET value='2' WHERE key='schema_version' AND value='1';
    UPDATE meta SET value='3' WHERE key='schema_version' AND value='2';
    UPDATE meta SET value='4' WHERE key='schema_version' AND value='3';
  `);
  if(Number(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value)>4)throw Error('Database was created by a newer app version.');
  const methods=createStore(db);
  return Object.fromEntries(Object.entries(methods).map(([name,method])=>[name,(...args)=>{
    const iterator=method(...args); let step=iterator.next();
    while(!step.done) step=iterator.next(step.value);
    return step.value;
  }]));
}
module.exports={openStore,ASSESSMENT_FIELDS,PROJECT_SCHEDULE_FIELDS};
