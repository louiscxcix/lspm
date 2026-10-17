'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
function fixture(){return {id:'library',entities:[{id:'account',type:'Person',name:'Chat name',privacy:'local_only',kakaoAuthorId:'123',status:'active'},{id:'person',type:'Person',name:'DB name',status:'active'},{id:'proof',type:'Evidence',name:'User confirmation',status:'active'}],relations:[]};}
const mapping={accountId:'account',personId:'person',authorId:'123',status:'confirmed',evidenceSourceIds:['proof'],reason:'Explicit user identity confirmation'};
test('identity update adds private evidence, preserves original nodes and authors, and is idempotent',()=>{
 const U=require('./update-kakao-identity'),g=fixture(),before=structuredClone(g),review={mappings:[mapping,{...mapping,status:'candidate',accountId:'unresolved'}]};
 U.apply(g,review);a.equal(g.entities[0].name,before.entities[0].name);a.equal(g.entities[1].name,before.entities[1].name);a.deepEqual(g.relations,[]);a.equal(g.entities[0].identityMatch.personId,'person');
 a.deepEqual(g.entities[1],before.entities[1]);a.equal(g.entities.at(-1).privacy,'local_only');a.equal(g.entities.at(-1).projectId,'library');a.equal(g.entities.at(-1).identityReview.mappings.length,2);
 const once=JSON.stringify(g);a.equal(U.apply(g,review),false);a.equal(JSON.stringify(g),once);
});
test('identity update fails closed before any mutation on missing proof, conflicting IDs, public accounts or duplicate claims',()=>{
 const U=require('./update-kakao-identity');
 for(const patch of [{authorId:'999'},{personId:'missing'},{evidenceSourceIds:[]},{evidenceSourceIds:['missing']}]){const g=fixture(),before=JSON.stringify(g);a.throws(()=>U.apply(g,{mappings:[mapping,{...mapping,...patch}]}));a.equal(JSON.stringify(g),before);}
 const g=fixture();g.entities[0].privacy='public';a.throws(()=>U.apply(g,{mappings:[mapping]}));
 const h=fixture();h.entities[0].identityMatch={status:'confirmed',personId:'different'};a.throws(()=>U.apply(h,{mappings:[mapping]}));
});
test('verified direct canonical DM adds no duplicate account and review stays private',()=>{
 const U=require('./update-kakao-identity'),g=fixture();
 U.apply(g,{mappings:[{...mapping,accountId:null,alreadyCanonical:true,matchKind:'verified_dm_direct_canonical'}]});
 a.equal(g.entities.filter(e=>e.type==='Person').length,2);a.equal(g.entities[1].identityMatch,undefined);
 a.equal(require('./public-privacy').removePrivateRecords({library:g,projects:[]}).library.entities.some(e=>e.identityReview),false);
});
