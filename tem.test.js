const assert=require('node:assert/strict'),M=require('./ontology-model'),U=require('./update-tem');
const d=require('./local-store').openStore('../.local-data/ontology.sqlite');
try{
  const w=d.load(),merged=w.projects.find(p=>p.name==='MOBIS + HELLA'),ls=w.projects.find(p=>p.name==='LS');
  assert(merged&&ls&&merged.id!==ls.id);
  assert.equal(w.projects.find(p=>p.name==='TEM').status,'archived');
  assert.equal(w.projectAliases[w.projects.find(p=>p.name==='TEM').id],ls.id);
  assert(ls.entities.some(e=>e.id==='tem-biled-step-0'));
  for(const kind of ['hella','mobis']){const p=merged;
    assert(!p.entities.some(e=>e.id.startsWith('tem-biled')));
    assert(!p.entities.some(e=>e.id.startsWith('tem-smt-step')));
    assert(p.relations.some(r=>r.type==='applies_to'&&r.to===(kind==='hella'?'tem-part-p768-a2':'tem-part-bl7m')));
    assert(p.entities.filter(e=>e.type==='Work Item'&&e.plannedStart).every(e=>e.plannedStart.startsWith('2026-')));
    M.validateStore(p);
    const old=JSON.stringify(p);U.campaign(p,w.library,kind);assert.equal(JSON.stringify(p),old);
  }
  assert.equal(w.library.entities.filter(e=>e.id.startsWith('tem-biled-step-')).length,20);
  assert.equal(w.library.entities.filter(e=>e.id.startsWith('tem-smt-step-')).length,10);
  assert(!w.library.relations.some(r=>r.type==='operated_in'&&r.from.startsWith('tem-biled')));
  assert(M.byId(w.library,'tem-starpro-smt').id!=='ls-smt-source-line');
  const before=w.library.entities.length;U.knowledge(w.library);assert.equal(w.library.entities.length,before);
  console.log('TEM in LS, merged customer project, distinct campaign routes, shared IDs and repeat-import checks passed');
}finally{d.close();}
