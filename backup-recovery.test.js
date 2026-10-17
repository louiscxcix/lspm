const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {inspectEncryptedBackup}=require('./scripts/inspect-encrypted-backup');

test('encrypted recovery verifies real SQLite bytes and reports only schema and counts',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-backup-fixture-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'fixture.sqlite'),key='test-only-backup-key';
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO meta VALUES('revision','338'),('schema_version','5'); CREATE TABLE entities(id TEXT PRIMARY KEY,data_json TEXT); INSERT INTO entities VALUES('original-id','private original text'); CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE relations(id TEXT PRIMARY KEY); CREATE TABLE additional_history(id TEXT PRIMARY KEY,entity_id TEXT REFERENCES entities(id)); INSERT INTO additional_history VALUES('history-id','original-id')");db.close();
  const encrypted=path.join(dir,'ontology-2026-10-16.sqlite.enc');
  const encryptedResult=spawnSync('openssl',['enc','-aes-256-cbc','-pbkdf2','-iter','200000','-in',file,'-out',encrypted,'-pass','env:LSPM_DB_BACKUP_KEY'],{env:{...process.env,LSPM_DB_BACKUP_KEY:key}});assert.equal(encryptedResult.status,0);
  const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const manifest={format:'pm-local-sqlite-encrypted-v1',databaseRevision:338,encryption:{cipher:'aes-256-cbc',kdf:'PBKDF2',iterations:200000},encryptedSha256:hash(encrypted),plaintextSha256:hash(file),counts:{entities:1,relations:0,projects:0}};
  const manifestFile=path.join(dir,'ontology-2026-10-16.manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  const inspect=backupKey=>inspectEncryptedBackup({directory:dir,key:backupKey});
  const report=inspect(key+'\n');assert.equal(report.revision,338);assert.equal(report.schemaVersion,5);assert.equal(report.tables.entities.count,1);assert.equal(report.tables.additional_history.count,1);assert.ok(!JSON.stringify(report).includes('private original text'));assert.ok(!JSON.stringify(report).includes('original-id'));
  assert.throws(()=>inspect(''),/repository secret/);
  assert.throws(()=>inspect('wrong-key'),/decryption failed/);
  fs.writeFileSync(manifestFile,JSON.stringify({...manifest,plaintextSha256:'0'.repeat(64)}));assert.throws(()=>inspect(key),/Decrypted database checksum/);
  fs.writeFileSync(manifestFile,JSON.stringify({...manifest,counts:{entities:9}}));assert.throws(()=>inspect(key),/Record count differs/);
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.appendFileSync(encrypted,'changed');assert.throws(()=>inspect(key),/Encrypted backup checksum/);
});
