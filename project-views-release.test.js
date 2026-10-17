const {test}=require('node:test'),a=require('node:assert/strict');
test('snapshot refresh preserves cloud observations and latest checksheet independently',()=>{
 const {preserveProduction}=require('./publish-project-views'),old={hourly:[{actual:400}],progress:{rows:[1]},samplePreparation:[{id:'run',version:2,answers:[]}]},local={hourly:[{actual:0}],samplePreparation:[{id:'run',version:1,answers:[]},{id:'new',version:1,answers:[]}]};
 const next=preserveProduction(local,old);a.deepEqual(next.hourly,old.hourly);a.deepEqual(next.progress,old.progress);a.equal(next.samplePreparation.find(s=>s.id==='run').version,2);a.equal(next.samplePreparation.length,2);a.equal(old.samplePreparation.length,1);
});
test('private scopes are compressed even below the legacy size threshold',async()=>{
 const V=require('./project-view'),w={projects:[{id:'p',entities:[],relations:[]}],library:{entities:[],relations:[]},viewSettings:{}},docs=await require('./private-seed').documents({workspace:w,production:{},eventDetails:{}});
 a(docs.every(d=>JSON.parse(d.payload).encoding==='gzip-base64'));a.equal((await V.decode(docs[1].payload)).workspace.projects[0].id,'p');
});
