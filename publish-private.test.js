const{test}=require('node:test'),a=require('node:assert/strict');
test('private publication rejects new ontology relationships until deployed client supports them',()=>{
 const {assertCompatible}=require('./publish-private'),data={workspace:{library:{relations:[{type:'quality_reference'}]},projects:[]}};
 a.throws(()=>assertCompatible(data,['precedes']),/compatible.*deploy|deploy.*compatible/i);a.doesNotThrow(()=>assertCompatible(data,['quality_reference']));
});
test('private publication keeps cloud-created projects, production and their graph without restoring removed local relationships',()=>{
 const merge=require('./publish-private').merge;
 const prior={workspace:{projects:[{id:'local',entities:[],relations:[]},{id:'cloud',entities:[{id:'remote'}],relations:[]}],library:{entities:[{id:'removed'},{id:'remote'}],relations:[{id:'old',from:'removed',to:'remote'}]},viewSettings:{cloud:{x:1}}},production:{cloud:{hourly:[{actual:3}]}},eventDetails:{old:{}}};
 const local={workspace:{projects:[{id:'local',entities:[{id:'new'}],relations:[]}],library:{entities:[{id:'new'}],relations:[]},viewSettings:{}},production:{local:{hourly:[]}},eventDetails:{fresh:{}}};
 const result=merge(prior,local);a.equal(result.workspace.projects.length,2);a.deepEqual(result.workspace.library.entities.map(e=>e.id),['new','remote']);a.equal(result.workspace.library.relations.length,0);a.equal(result.production.cloud.hourly[0].actual,3);a.equal(result.workspace.viewSettings.cloud.x,1);a.equal(result.eventDetails.old,undefined);a(prior.workspace.library.entities.some(e=>e.id==='removed'));
});
