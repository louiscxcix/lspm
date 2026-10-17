# Project types and T1-2 sample implementation

Implemented the assigned slice of `docs/superpowers/plans/2026-10-14-project-types-sample-preparation.md`. No commits, real database writes, cloud writes, Firestore changes, deployment or Kakao access were performed. Existing unrelated edits, including the prior edits in `local-store.js`, were preserved.

## Files changed

- `projects.js`: optional project type validation and backward-compatible `create(name, type?)`. The browser resolves `ProjectTypes` at call time, so the helper may load after `projects.js`, provided it loads before typed creation/validation.
- `local-store.js`: additive nullable `projects.project_type` column with an enum constraint; load/save/export preservation; metadata scope enforcement; Sample Preparation factory initialization and method exports.
- `project-types.js`: canonical browser/CommonJS helper.
- `update-project-types.js`: idempotent migration with a default dry-run, backup before real schema/data writes, revision checks and a bounded T1-2 sample graph.
- `project-types.test.js`: ten focused tests, written and run failing before their corresponding implementations.
- `docs/project-types-implementation.md`: this handoff report.

No membership indexing refactor was needed. The real database dry-run completed in about 0.3 seconds before preparation integration.

## Integration interfaces

`require('./project-types')` and browser `globalThis.ProjectTypes` expose:

```js
{
  TYPES: [
    {id: 'program', label: 'Program'},
    {id: 'sample', label: 'Sample'},
    {id: 'npi', label: 'NPI'},
    {id: 'improvement', label: 'Improvement'},
    {id: 'shared', label: 'Shared'}
  ],
  kind(project),
  validate(type)
}
```

`validate(type)` returns a valid enum unchanged, allows `undefined` for legacy records, and throws for other values, including `null` and an empty string. `kind(project)` gives an explicit valid enum priority. Without one, trimmed, case-insensitive exact names resolve as follows: LS → program; MOBIS + HELLA, SMT, T1-2 and T1-2 Sample → sample; Knowledge 360 and Knowledge360 → shared. Unknown names resolve to improvement. Invalid explicit values throw.

`ProjectStore.create(name, type?)` / `require('./projects').create(name, type?)` preserves the existing one-argument behavior: omitted types remain absent. `validate`, workspace validation and imports reject invalid types and preserve valid ones.

The existing local store interfaces remain unchanged:

```js
const store = require('./local-store').openStore(databasePath);
const workspace = store.load(); // projects may contain projectType
store.save(workspace, projectId, workspace.revision);
```

Saving a type change requires that project's scope; `null`, `library` and another project cannot change existing project metadata. Project creation still uses a `null` scope. Existing revision checks, change review/revert and legacy projects remain supported. SQL exports include `project_type`; legacy SQL NULL values load with no `projectType` property. The column is additive and does not increase the existing schema-version ceiling.

Per the integration request, `local-store.js` now initializes the real factory with `require('./sample-preparation-store')(db, load)` and exposes:

```js
store.samplePreparationList(projectId);
store.samplePreparationSave({projectId, revision, sheet}); // {workspace, sheet}
```

The factory retains its own append-only records, workspace CAS and sheet-version checks. No stub was introduced. Main owns HTTP routes, browser assets, type UI, cloud/catalog propagation and preservation of the existing cloud Knowledge 360 identity. This migration never creates a Knowledge 360 project.

## Sample graph

The new project is `project-t1-2-sample`, named `T1-2 Sample`, with type `sample`. An existing unique empty project with that name is reused with its original ID. Conflicting, archived or populated unrecognized sample identities require review. An already seeded sample retains manual graph/workstream edits on retries.

The graph reuses only `ls-part-t1-2-uplevel` and the six canonical normal steps: ICT, Pressing, Connector fastening, EOL, Visual inspection and Packing. Canonical route links and objects are copied without edits. The five canonical Pressing resources are reused, alongside the existing ICT and EOL machines. Missing canonical objects, sequence links or a changed five-machine allocation fail preflight.

Existing LDM line contacts, their confirmed teams and escalation links are references. No new named assignment, station assignment, staffing observation or approval is inferred. Existing generic before-run sample requirements, LDM checks and role definitions are reused where present; TEM/SMT equipment checks, during/after-run groups and raw source Evidence are excluded.

`t1-2-sample-internal-pcb` is a new component reference. The LG Innotek Mexico Organization supplies it through a relation scoped to this sample. Its component/ICT input links are also scoped. Exact PCB identity, revision, LOT, availability and producing SMT line/asset remain unconfirmed. No Starpro source or exact internal SMT line is attached.

The existing Uplevel quality-policy Requirement and its defect-definition Requirements are reusable references. Their LS-owned response Work Items, cases, Risks, Assignments and scoped relations are not attached. New sample-scoped policy/reference relations do not alter LS.

`t1-2-sample-press-cleanliness` is a new unknown Risk with a new planned mitigation action. The Risk's only affected targets are `t1-2-uplevel-press-3` and `t1-2-uplevel-press-4`. Existing project-owned Risks remain exclusive to their original project. The sample contains no Base route, repair/NG branch steps, History Event memberships, imported quantities or fabricated approvals.

## Migration commands for main

```sh
node update-project-types.js --dry-run
node update-project-types.js /path/to/database.sqlite --apply
```

Without `--apply`, the migration reads the source through a read-only SQLite connection, creates a disposable snapshot, and runs schema initialization/preflight only on that snapshot. The source database remains byte-for-byte unchanged. Conflicting/unknown flags fail without opening the database for migration.

For an actual apply, it first creates a SQLite backup named `ontology-before-project-types-<timestamp>.sqlite` beside the target database, then opens the real store. Thus the backup precedes even the additive schema initialization. Existing projects receive their inferred type only when no explicit enum exists. Metadata/project writes use ordinary revision-checked scoped saves. A new project is created empty, then its graph is saved atomically; an interrupted empty creation can be resumed. Already-applied retries do not write or create another backup. The migration uses several scoped transactions, not one transaction for the entire run.

## Verification results

- Initial TDD run: six expected failures for the missing helper/migration/type behavior; the existing cross-project Risk rejection already passed. Additional empty-project resume, preparation integration and late browser-helper tests were observed failing before their fixes.
- `node --test project-types.test.js`: 10 passed, 0 failed.
- `node --test project-types.test.js local-store.test.js sample-preparation-store.test.js project-consolidation.test.js production-scope.test.js quality-routing.test.js smt-return-press-risk.test.js people-sample-controls.test.js`: 67 passed, 0 failed.
- `node --test project-types.test.js local-store.test.js sample-preparation-store.test.js sample-preparation.test.js project-consolidation.test.js production-scope.test.js quality-routing.test.js smt-return-press-risk.test.js people-sample-controls.test.js`: final run 79 passed, 0 failed, including the other agent's latest browser/view updates.
- `node test.js`: all existing model, project, workflow and UI contract checks passed.
- `node update-project-types.js --dry-run`: passed against the real read-only source at revision 315; proposed types plus one T1-2 Sample project; no Knowledge 360 duplication.
- `node --check` for `projects.js`, `local-store.js`, `project-types.js` and `update-project-types.js`: passed. `git diff --check`: passed.

A disposable copy of the real database was migrated and checked: revision 315 → 322; sample has 54 entities, six normal steps, seven machines, 16 existing people and one new Risk/action pair. All five existing project graphs and every prior row in the checked entities, relations, memberships, assessments, schedules, workstreams, view settings, hourly, change, source, ingestion, proposal, WIP and staffing tables were preserved. No Event was inserted or selected into the sample. Sample WIP/hourly/preparation records remain empty. A second apply was unchanged. SHA-256 of the real source database was unchanged throughout. Disposable copies and their backups were cleaned up.

## History visibility concern for main

The existing History reader still shows 13 preexisting shared business events for the new sample because their subjects overlap its reused canonical objects. This is a read-time projection in `history.js` (`visible`) and `history-store.js` (`list`/`detail`), not an import, copied membership or changed event scope. Explicit LS events remain scoped according to the existing reader.

If the new sample's History must start visually empty, main must coordinate a shared-event visibility rule across local/cloud readers and views. Those files are outside this ownership slice. No source events were deleted, rewritten or reassigned to hide them. The migration's no-import/no-quantity requirement is satisfied; an empty shared-History projection is not claimed.
