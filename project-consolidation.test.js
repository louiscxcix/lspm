const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('./local-store'),P=require('./projects'),M=require('./ontology-model');
test('project consolidation preserves global objects, unions memberships, archives source and redirects old links',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-merge-')),s=openStore(path.join(dir,'db.sqlite'));
  try {
    let w=s.load();const source=P.create('HELLA'),target=P.create('Mobis');w.projects.push(source,target);s.save(w,null,w.revision);
    w=s.load();const p=w.projects.find(p=>p.id===source.id),part=M.addEntity(p,{type:'Part',name:'P768',itemKind:'product'}),step=M.addEntity(p,{type:'Production Step',name:'Main'});M.addRelation(p,{type:'applies_to',from:step.id,to:part.id});p.workstreams={[part.id]:['production'],[step.id]:['production']};s.save(w,p.id,w.revision);
    w=s.load();assert.throws(()=>s.mergeProject(source.id,target.id,'MOBIS + HELLA',w.revision-1),/STALE/);
    w=s.mergeProject(source.id,target.id,'MOBIS + HELLA',w.revision);
    assert.equal(w.projects.find(p=>p.id===source.id).status,'archived');assert.equal(w.projectAliases[source.id],target.id);
    const merged=w.projects.find(p=>p.id===target.id);assert.equal(merged.name,'MOBIS + HELLA');assert.equal(merged.entities.length,2);assert.equal(merged.relations.length,1);assert.deepEqual(merged.workstreams[part.id],['production']);assert.equal(w.library.entities.length,2);
    assert(s.listChanges(target.id).changes[0].items.some(i=>i.label.includes('Project')));const revision=w.revision;assert.equal(s.mergeProject(source.id,target.id,'MOBIS + HELLA',revision).revision,revision);
  }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('project-owned records move instead of creating cross-project conflicts, and the merged project stays editable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-owned-merge-')),s=openStore(path.join(dir,'db.sqlite'));
  try{let w=s.load();const a=P.create('HELLA'),b=P.create('Mobis');w.projects.push(a,b);s.save(w,null,w.revision);w=s.load();const p=w.projects.find(p=>p.id===a.id),work=M.addEntity(p,{type:'Work Item',name:'Sample coordination'});s.save(w,a.id,w.revision);w=s.mergeProject(a.id,b.id,'MOBIS + HELLA',s.load().revision);assert(!w.projects.find(p=>p.id===a.id).entities.some(e=>e.id===work.id));assert(w.projects.find(p=>p.id===b.id).entities.some(e=>e.id===work.id));assert.doesNotThrow(()=>s.save(w,b.id,w.revision));}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
