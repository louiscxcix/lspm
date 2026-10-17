'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveWorkspaceId}=require('./workspace-auth');
const owner='d629ba18-2539-4274-b8dd-4dd04466a56c';
test('only the configured verified owner is connected to the migrated workspace',async()=>{
 const config={ownerEmail:'owner@example.com',loadPublishedOwner:async()=>owner};
 assert.equal(await resolveWorkspaceId({id:'actual-auth-id',email:'Owner@example.com',email_confirmed_at:'2026-10-17'},config),owner);
 await assert.rejects(resolveWorkspaceId({id:'actual-auth-id',email:'owner@example.com'},config),/Verify/);
 assert.equal(await resolveWorkspaceId({id:'another-user',email:'other@example.com',email_confirmed_at:'2026-10-17',user_metadata:{email:'owner@example.com',workspaceId:owner}},config),'another-user');
 assert.equal(await resolveWorkspaceId({id:'actual-auth-id',email:'owner@example.com'},{loadPublishedOwner:()=>{throw Error('must not query');}}),'actual-auth-id');
 await assert.rejects(resolveWorkspaceId({id:'actual-auth-id',email:'owner@example.com',email_confirmed_at:'2026-10-17'},{...config,loadPublishedOwner:async()=>null}),/not configured/);
});
