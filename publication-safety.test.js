'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{inspectFile}=require('./scripts/check-publication-safety');
test('publication gate rejects private exports and credentials, permits encrypted backups and public Supabase keys',()=>{
 assert.ok(inspectFile('backups/export.sqlite',Buffer.from('SQLite format 3')).length);
 assert.ok(inspectFile('.env.production',Buffer.from('VALUE=x')).length);
 assert.ok(inspectFile('legacy.js',Buffer.from('AIza'+'a'.repeat(35))).includes('Google API key'));
 assert.ok(inspectFile('config.js',Buffer.from('sbp_'+'b'.repeat(30))).includes('Supabase personal token'));
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 assert.ok(inspectFile('config.js',Buffer.from(jwt)).includes('Supabase service-role token'));
 assert.deepEqual(inspectFile('backups/database.sqlite.enc',Buffer.from('Encrypted bytes')),[]);
 assert.deepEqual(inspectFile('supabase-config.js',Buffer.from('sb_publishable_'+'p'.repeat(30))),[]);
 assert.deepEqual(inspectFile('.env.example',Buffer.from('API_KEY=')),[]);
});
