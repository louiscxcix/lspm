const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Projects = require('./projects.js');
const {openStore} = require('./local-store.js');
const {buildLsProject, applyLsImport} = require('./import-ls-observations.js');

test('LS ontology keeps route products and G65 parts separate, with NG storage off the good path', () => {
  const project = buildLsProject(Projects.create('LS'));
  Projects.validate(project);
  const byId = new Map(project.entities.map(item => [item.id, item]));
  assert.equal(project.entities.filter(item => item.type === 'Part').length, 13);
  for (const id of ['ls-part-g65-jewelry', 'ls-part-g65-sl-upper', 'ls-part-g65-sl-lower']) {
    assert.equal(byId.get(id)?.type, 'Part');
  }
  assert.notEqual(byId.get('ls-part-lq2-opt').id, byId.get('ls-part-lq2-lwr').id);
  assert.equal(project.relations.some(item => item.type === 'part_of' || item.type === 'reports_to'), false);
  assert.equal(project.entities.filter(item => item.type === 'Production Step' && item.branchKind === 'exception').length, 10);
  assert.equal(project.relations.filter(item => item.type === 'on_failure').length, 10);
  assert.equal(project.relations.some(item => item.type === 'precedes' && byId.get(item.to)?.branchKind === 'exception'), false);
  assert.equal(byId.get('ls-step-g65-main-eol')?.status, 'unknown');
  assert.equal(byId.get('ls-ng-g65-main')?.parentWorkId, 'ls-step-g65-main-eol');
  assert.ok(project.relations.some(item => item.type === 'on_failure' && item.from === 'ls-step-g65-main-eol' && item.to === 'ls-ng-g65-main'));
  assert.ok(project.relations.some(item => item.type === 'precedes' && item.from === 'ls-step-t1-2-uplevel-bending' && item.to === 'ls-step-t1-2-uplevel-connector'));
  assert.deepEqual(project.entities.filter(item => item.type === 'Person').map(item => item.name).sort(), ['김정열', '성기철', '홍순경'].sort());
  assert.ok(project.entities.some(item => item.type === 'Evidence' && /counts in units/i.test(item.context)));
  assert.ok(project.entities.some(item => /LQ2 LWR \(T1-2 Stacking\)/.test(item.context)));
  assert.equal(project.relations.some(item => /LQ2 LWR \(T1-2 Stacking\)/.test(item.evidence)), false);
});

test('LS import adds one project and global records without touching existing G65 project', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ls-import-'));
  const db = openStore(path.join(dir, 'ontology.sqlite'));
  t.after(() => { db.close(); fs.rmSync(dir, {recursive:true, force:true}); });
  let workspace = db.load();
  workspace.projects.push(Projects.create('G65'));
  workspace = db.save(workspace, null, workspace.revision);
  db.keepChange(workspace.pendingChange.id);

  const result = applyLsImport(db);
  workspace = db.load();
  assert.equal(workspace.projects.length, 2);
  assert.equal(workspace.projects.find(item => item.name === 'G65').entities.length, 0);
  const ls = workspace.projects.find(item => item.name === 'LS');
  assert.equal(ls.id, result.projectId);
  assert.equal(workspace.library.entities.length, ls.entities.length);
  assert.equal(workspace.library.relations.length, ls.relations.length);
  assert.ok(ls.workstreams['ls-step-g65-main-eol'].includes('quality'));
  assert.equal(workspace.pendingChange.scope, ls.id);
  assert.throws(() => applyLsImport(db), /already populated/);
});
