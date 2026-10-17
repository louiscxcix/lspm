const {test}=require('node:test'),assert=require('node:assert/strict');
let context;try{context=require('./people-context').peopleContext;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('people context keeps same-name accounts separate and never infers affiliation from names',()=>{
 assert.equal(typeof context,'function');
 const graph={entities:[{id:'p1',type:'Person',name:'LG Innotek Luis',status:'active'},{id:'p2',type:'Person',name:'Luis',status:'active'},{id:'org',type:'Organization',name:'LG Innotek'}],relations:[]};
 const rows=context(graph);assert.equal(rows.length,2);assert.deepEqual(rows[0].affiliations,[]);assert.notEqual(rows[0].id,rows[1].id);
});
test('people context exposes recorded roles and evidence-verified account mapping only',()=>{
 assert.equal(typeof context,'function');
 const graph={entities:[{id:'p',type:'Person',name:'Confirmed person',status:'active',title:'Development contact',department:'Development'},{id:'org',type:'Organization',name:'LG Innotek'},{id:'account',type:'Person',name:'Display alias',status:'active',privacy:'local_only',kakaoAuthorId:'123',identityMatch:{status:'confirmed',personId:'p',authorId:'123',evidenceSourceIds:['s']}}],relations:[{id:'r',type:'member_of',from:'p',to:'org',sourceId:'s'}]};
 const rows=context(graph),person=rows.find(p=>p.id==='p'),account=rows.find(p=>p.id==='account');assert.equal(person.title,'Development contact');assert.equal(person.affiliations[0].name,'LG Innotek');assert.equal(account.canonicalId,'p');
 graph.entities[2].identityMatch.status='candidate';assert.equal(context(graph).find(p=>p.id==='account').canonicalId,undefined);
});
