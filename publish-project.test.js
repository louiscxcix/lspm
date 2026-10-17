const {test}=require('node:test'),assert=require('node:assert/strict');
test('scoped project publication adds SMT without replacing other projects or private history',()=>{
 const {projectSeed}=require('./publish-project');
 const previous={workspace:{revision:2,projects:[{id:'ls',name:'LS'}],library:{entities:[{id:'private-event',privacy:'local_only'}],relations:[]},viewSettings:{ls:{features:{wip:true}}}},production:{ls:{progress:{rows:[1]}}},eventDetails:{private:1}};
 const local={revision:5,projects:[{id:'smt',name:'SMT',status:'active',entities:[{id:'line'}],relations:[]}],library:{entities:[{id:'line'},{id:'new-private',privacy:'local_only'}],relations:[]},viewSettings:{smt:{features:{wip:false,hourly:true}}}};
 const result=projectSeed(previous,local,'smt',{hourly:[]});
 assert.equal(result.workspace.projects[1].name,'SMT');assert.deepEqual(result.workspace.projects[0],previous.workspace.projects[0]);
 assert.deepEqual(result.eventDetails,previous.eventDetails);assert.deepEqual(result.production.ls,previous.production.ls);
 assert.deepEqual(result.workspace.viewSettings.smt.features,{wip:false,hourly:true});
 assert.equal(result.workspace.library.entities.some(e=>e.id==='new-private'),false);
 assert.equal(result.workspace.library.entities.some(e=>e.id==='private-event'),true);
 assert.equal(previous.workspace.projects.length,1);
});
test('scoped publication rejects unknown or archived projects',()=>{
 const {projectSeed}=require('./publish-project'),previous={workspace:{projects:[],library:{entities:[],relations:[]}}};
 assert.throws(()=>projectSeed(previous,{projects:[]},'missing',{}),/active/i);
 assert.throws(()=>projectSeed(previous,{projects:[{id:'smt',status:'archived'}]},'smt',{}),/active/i);
});
