'use strict';
// Explicit reviewed identities only. Never rename, merge, or rewrite historical reporters.
const M=require('./ontology-model'),{isDeepStrictEqual}=require('node:util');
const REVIEW='kakao-identity-review-20261015';
function apply(graph,review,sourceIds=[]){
 if(!Array.isArray(review.mappings))throw Error('Identity review mappings are required.');
 const byId=new Map(graph.entities.map(e=>[e.id,e])),proof=new Set([...byId.keys(),...sourceIds]),updates=new Map();
 for(const row of review.mappings.filter(r=>r.status==='confirmed')){
  const account=byId.get(row.accountId),person=byId.get(row.personId);
  if(person?.type!=='Person'||person.status==='archived')throw Error('Unverified Kakao identity endpoints.');
  if(!row.reason||!row.evidenceSourceIds?.length||row.evidenceSourceIds.some(id=>!proof.has(id)))throw Error('Identity confirmation needs retained evidence.');
  // A verified DM already uses the canonical person; record proof without creating a duplicate account.
  if(row.accountId===null&&row.alreadyCanonical&&row.matchKind==='verified_dm_direct_canonical')continue;
  if(account?.type!=='Person'||account.privacy!=='local_only'||String(account.kakaoAuthorId)!==String(row.authorId))throw Error('Unverified Kakao identity endpoints.');
  if(account.identityMatch?.status==='confirmed'&&account.identityMatch.personId!==person.id||updates.has(account.id)&&updates.get(account.id).personId!==person.id)throw Error('Conflicting Kakao identity confirmation.');
  updates.set(account.id,{status:'confirmed',personId:person.id,authorId:String(row.authorId),evidenceSourceIds:[...new Set(row.evidenceSourceIds)],reason:row.reason});
 }
 const next=structuredClone(graph);
 for(const [id,match]of updates)next.entities.find(e=>e.id===id).identityMatch=match;
 const old=next.entities.find(e=>e.id===REVIEW);
 if(old&&(old.type!=='Evidence'||old.privacy!=='local_only'))throw Error('Identity review ID conflicts with an existing object.');
 const record={id:REVIEW,projectId:graph.id,type:'Evidence',name:'Kakao / DB person identity review',status:'active',privacy:'local_only',context:'Confirmed identities are linked without merging. Similar names remain review candidates; original authors and timestamps are unchanged.',identityReview:structuredClone(review)};
 if(old)Object.assign(old,record);else next.entities.push(record);
 M.validateStore(next);if(isDeepStrictEqual(next,graph))return false;
 graph.entities=next.entities;return true;
}
module.exports={apply,REVIEW};
