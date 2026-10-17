'use strict';
// The owner mapping is server configuration. Never derive it from browser input or user_metadata.
async function resolveWorkspaceId(user,{ownerEmail='',loadPublishedOwner}={}){
 if(!user?.id)throw Error('Authentication required.');
 if(!ownerEmail||typeof user.email!=='string'||user.email.trim().toLowerCase()!==ownerEmail.trim().toLowerCase())return user.id;
 if(!user.email_confirmed_at)throw Error('Verify your owner email before opening the migrated workspace.');
 const owner=await loadPublishedOwner();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner||''))throw Error('Migrated workspace is not configured.');
 return owner;
}
module.exports={resolveWorkspaceId};
