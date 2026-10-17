const assert = require('node:assert/strict');
const {openStore} = require('./local-store');
const {apply} = require('./import-g65-consolidated');
const db = openStore(process.env.PM_DB_PATH || '../.local-data/ontology.sqlite');
try {
  const p = db.load().projects.find(p=>p.name==='LS');
  const before = structuredClone(p);
  apply(p);
  for (const old of before.entities) {
    const current = p.entities.find(e=>e.id===old.id);
    for (const [key,value] of Object.entries(old)) if (key !== 'context') assert.deepEqual(current[key],value);
    assert.ok(current.context.startsWith(old.context));
  }
  for (const old of before.relations) assert.deepEqual(p.relations.find(r=>r.id===old.id),old);
  assert.equal(apply(p),false);
  console.log('PASS: existing facts/relations preserved; valid, idempotent import');
} finally { db.close(); }
