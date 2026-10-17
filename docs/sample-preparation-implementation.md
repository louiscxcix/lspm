# Sample Preparation Checksheet implementation

## V2 update - 2026-10-15

New runs use `sample-preparation-v3` with 15 simple English questions about preparation before the planned sample day. Both v1 (14 questions) and v2 (15 questions) definitions remain unchanged and readable/editable; there is no bulk migration or production approval. All callers must use `questions(sheet)` for saved answer identity and `worksheet(project,sheet)` for the shared app/print presentation.

## v3 worksheet builder

- The main app is a paper-style question/blank Status table, not a long online evidence form. Existing online answers remain in a collapsed optional section; printing never copies their status, notes or private links.
- `create` sets `preparationDate` to the Mexico City calendar date. `sampleDate` is the separate planned sample date, initially blank, never silently today. Both optional date fields survive local/cloud append-only saves and viewer projection.
- `worksheet(project,sheet,now)` returns shared plain-English `questions`, scoped current `context` and calendar-day `timing`. It shows today, days until the planned date, past-date warnings and preparation-after-sample warnings. A passed date is not evidence production occurred.
- Confirmed model IDs select T1-2, TEM or SMT profiles; new explicitly registered TEM/SMT `productionFamily` values are supported. Model name guesses do not assign a profile. Existing v2 profile validation keeps its original ID rules.
- T1-2 uses the user-confirmed in-house PCB source. SMT worksheets describe PCB output builds, not finished LDM product output. TEM supplier availability must be checked for the selected model; the template does not assume every TEM model is supplied by Starpro.
- Line references follow scoped `applies_to`/`operated_in` or direct `produces` links. PCB source references follow scoped component `part_of` and `supplies`/`produces` paths. SMT output producers and incoming material suppliers are separate lists, with producer/supplier roles. Unknown sources remain unknown; storage-origin and generic graph neighbors are not proof of a model source.
- Route assumptions and unverified links propagate through the whole path and remain marked unconfirmed. These current references are not saved proof of readiness or station assignments.
- Future question wording/meaning changes require a new immutable template version. Edit profile rules and focused tests together; do not rewrite v1/v2/v3 definitions already used by saved records. No external AI request is needed to generate a worksheet.

`profileFor(project, partId)` selects `tem`, `smt`, `t1-2` or `general` from confirmed canonical model IDs, not name guesses. TEM guidance addresses actual equipment, subparts/tooling, recipe revisions, material readiness and source repair. SMT guidance treats G65/JP-RH/LQ2 variants as PCB outputs. T1-2 explicitly uses an internally produced PCB and restricts the known cleaning risk to Pressing 3 and 4. A fifteenth closeout review covers quantities, evidence and unresolved follow-up. Additional suggestions are preparation checks, not newly observed incidents.

Metadata: `sampleDate` is an optional ISO calendar date (new-run default: current America/Mexico_City date); `sampleQuantity` is null or a positive safe integer in pieces; `memo` is up to 1,000 characters. These fields survive existing JSON-based local/cloud append-only storage and viewer projection. Legacy records without them keep their original shape.

`riskReview(project, partId)` follows explicit model, applicable Production Step/Work Item, component and required-equipment relationships. Linked risks and mitigation references are presented as current ontology context, not saved verification evidence. Other project risks are separately marked applicability-unconfirmed. A current graph change does not rewrite a saved answer or count as an incident.

The existing form design is retained. Choosing the first model preserves typed answers; switching between concrete models keeps separate in-tab drafts so verified evidence is not silently transferred. Same-project refreshes retain dirty drafts. If a newer saved version exists, the original draft version and CAS protections remain in place and a conflict message is shown. Changing project/access scope clears the visible draft rather than leaking it into another scope.

`Print / Save PDF` creates a temporary same-origin, read-only print document, reusing `sample-preparation.css`. It contains model, project, run, date, quantity, memo, statuses and evidence, with a draft label for unsaved content. Raw chat and private source contents are not embedded. Printing never saves a record. Use the browser's Save as PDF destination. A4 print cards use ordinary sections rather than fragmented fieldsets, and long evidence wraps without textarea clipping. Viewer printing stays read-only.

Verification: domain/store/cloud/browser tests cover both template versions, metadata, explicit risk scope, model switching, refresh preservation, escaping, print snapshot and absence of print writes. Generated A4 output is reviewed with Poppler, PDFium and text extraction, including close inspection of page boundaries and evidence fields.

The original v1 implementation notes below describe the historical contract; the v2 section supersedes new-run defaults and question dispatch.

Scope: the domain, local storage factory, standalone Risk-area view, stylesheet and their tests. App, API, server, cloud, build and publication integration belong to the parent task. This slice does not perform cloud operations, production database writes, deployments, Kakao reads or commits.

## Domain contract

Load `sample-preparation.js` before `sample-preparation-view.js`. The domain exports the same API as CommonJS (`require('./sample-preparation')`) and browser global `SamplePreparation`. It does not depend on `OntologyModel`, `Projects` or other type globals. The view exports only `SamplePreparationView`; existing type globals and their ordering remain unchanged. `LocalAPI` must exist before calling `update`, and the browser must provide `crypto.randomUUID` and `structuredClone`.

Exports: `QUESTIONS`, `TEMPLATE_VERSION`, `STATUSES`, `isSample(project)`, `create(project,input?)`, `validate(project,sheet)`, `normalize(project,sheet)`, `summary(sheet)`, `latest(records)`, `sanitize(sheet)`. `normalize` is the same function as `validate`; successful validation returns a new canonical object and failures throw an Error. Inputs are not mutated.

`create(project,{partId,runName})` generates a unique sheet ID with version 0. Both input fields are optional and default to an empty string, so a draft does not infer a model or run. All 14 answers start unknown, with blank notes and no owners/references. Save requires a Part from the project and a nonblank run name.

```js
{
  id: 'sample-preparation-<uuid>',
  partId: '<project Part ID>',
  runName: 'Trial 1',
  templateVersion: 'sample-preparation-v1',
  version: 0,
  answers: [
    {
      questionId: 'product',
      status: 'unknown',
      note: '',
      ownerId: null,
      referenceIds: []
    }
    // All 14 question IDs, exactly once, in the canonical output.
  ]
}
```

Question IDs, in order: `product`, `approved-definition`, `pcb-provenance`, `materials`, `traceability`, `program-settings`, `equipment`, `tooling`, `line-clearance`, `first-piece`, `ng-response`, `roles-support`, `escalation-route`, `packing-release`.

Definitions are frozen independently of run answers. `QUESTIONS` contains frozen objects with `id`, `group`, `question`, `guidance` and `priority` (`null` except `traceability: P0`). `templateVersion` binds each run to these definitions. Preserve v1 definitions if a subsequent template version is introduced; extend version dispatch rather than rewriting historical meaning. No template editor is included.

Validation rules:

- Status is `unknown`, `in_progress`, `verified`, `issue` or `not_applicable`. Omitted/null status defaults to unknown; other values fail.
- Verified requires a trimmed evidence note of at least 10 characters; punctuation-only and bare confirmation labels fail. N/A requires a trimmed reason of at least 5 characters; bare N/A, none and not-applicable labels fail. These checks do not establish that evidence is true or reviewed by an authorized approver.
- Notes have a maximum of 4,000 characters; run names 180. IDs match `[A-Za-z0-9][A-Za-z0-9._:-]{0,119}`. Versions are nonnegative safe integers. Unsupported template versions, unknown/duplicate question IDs, incomplete answer arrays and invalid types fail.
- Owner is null or a Person/Organization in this project. References are at most 20 IDs from this project and are deduplicated. No names or assignments are inferred. Blank owner becomes null; omitted note/references become blank/empty. Unknown object properties and record metadata are omitted from canonical output.
- All 14 answers are required on save. This is a full snapshot, not a partial update.

`isSample` honors an explicit project type first. Without a type (missing/null), only the exact confirmed legacy names `MOBIS + HELLA`, `SMT` and `T1-2` qualify. No fuzzy matching or LS fallback.

`summary` returns `{total,unknown,in_progress,verified,issue,not_applicable,complete,p0Status}`. `complete` means all questions have status verified/N/A; it is not a readiness decision. P0 N/A requires its reason but never approves production start, waives a gate or grants release. The UI displays status counts, not a production approval indicator.

`latest(records)` accepts a plain array and returns one sheet per sheet ID, choosing the highest sheet version; `recordRevision` breaks equal-version ties. Input ordering is retained for the first occurrence of each sheet ID. Separate runs/models have separate IDs and independent versions.

`sanitize(sheet)` returns only the canonical identity/version fields and `{questionId,status,note}` answers. It removes owner/reference IDs, source IDs, raw logs, private payloads and arbitrary metadata. Notes deliberately remain visible to project viewers. It does not redact sensitive text typed into a note or replace project authorization. Parent publication must select the authorized project's sheets before projection. The view explains note visibility before editing, and escapes every dynamic HTML value; markup in a note renders as text.

## Local store and cloud parity

Factory: `require('./sample-preparation-store')(db,load)`. It expects the existing SQLite connection, `projects`, `meta` revision and `change_sets` tables, plus the synchronous workspace loader. Initialization only adds `sample_preparation_records` and its project index. The parent exposes the returned `list`/`save` methods in local-store and server/API wiring.

- `list(projectId)` returns a plain array of **latest sheets**, with `recordedAt` and `recordRevision` metadata on each. Unknown and non-sample projects fail; archived samples remain readable.
- `save({projectId,revision,sheet})` returns exactly `{workspace:load(),sheet}`. The returned sheet is canonical, with the newly saved version. It has no technical record ID or extra audit fields.
- Incoming `sheet.version` is the expected previous version, not the next version. A new sheet sends 0 and saves as 1. An existing sheet sends N and saves as N+1. Domain `validate` only checks the version's type/range; storage compares it with the latest persisted version and throws `SHEET_VERSION_CONFLICT` on mismatch. Unknown sheets with a nonzero expected version also conflict.
- Workspace `revision` must match current metadata; mismatch throws `STALE_REVISION`. The local store checks both conflicts inside `BEGIN IMMEDIATE`, uses revision CAS, and rolls back insertion/revision changes if the audit fails.
- Existing sheet project, Part, run name and template version cannot change. Create a new run to change identity. Sheet ID and append-only technical record ID are distinct.
- Every successful save appends a row; no previous row is updated or deleted. The table stores `id`, `project_id`, `sheet_id`, `version`, `data_json`, `recorded_at`, `revision`, with unique `(project_id,sheet_id,version)`. Full history remains in SQLite even though list projects latest snapshots.
- Each append creates an acknowledged technical `change_sets` audit entry with its inserted row. It is acknowledged immediately to avoid presenting destructive undo for append-only records. No Event, Evidence, business History, route, gate, stock or production observation is created or changed.

Cloud parent implementation should use the same normalizer and expected-version contract, append a private immutable payload of kind `sample-preparation`, and select latest sheets with `latest`. Preserve all historical payloads. Do not replace the sheet ID with a cloud record ID. Local normalization intentionally strips transport metadata before save.

## View integration

```js
const preparation = new SamplePreparationView(async result => {
  // Refresh parent workspace after save; result is {workspace,sheet}.
});
await preparation.update({workspace,store:project,container,readOnly});
// When leaving Risk/project scope:
await preparation.update(null);
```

Load the stylesheet `sample-preparation.css`. Mount in the sample project's existing Risk area. The view calls `LocalAPI.samplePreparationList(projectId)` and `LocalAPI.samplePreparationSave({projectId,revision,sheet})`; the parent supplies those adapters. `update` returns a Promise for initial loading, while UI event handlers manage their own save/refresh work.

Owners can select a saved run, create a blank run, select a model and edit answers/notes/owners/references. Saved run identity fields are disabled. All 14 questions, status choices and notes are visible, grouped under text headings; no icons, chips or map are added. Viewer notes/statuses are ordinary text; create/save controls are absent. `readOnly`, `PUBLIC_READ_ONLY`, archived project state and enabled non-owner access all enforce view-only presentation. The parent server/cloud must enforce authorization independently.

Requests capture project/revision/container/access scope. Late list/save responses and errors cannot populate another project, restore an abandoned view, refresh after losing owner access, or replace another scope. Revision changes on the same workspace object trigger a fresh load. Same-scope updates preserve unsaved fields. Save errors preserve the draft and re-enable save; revision conflicts are shown without silently merging or overwriting. A successful save refreshes the parent; a refresh failure reports that the save already succeeded.

## Sources and verification

Questions condense the existing people/sample checklist references and sample risk guidance in `update-people-sample-controls.js`, `docs/people-sample-controls-review.md`, `update-smt-return-press-risk.js` and the approved plan. User-confirmed Pressing 3/4 cleanliness scope is retained. Only LOT/MES/first QR scan receives the source's explicit P0. Internal/supplier PCB provenance and conditional source repair/reinspection remain distinct. No role becomes an assumed named person, no unverified approval is asserted, and no during/after-run checklist is introduced.

Verification command:

```sh
node --test sample-preparation.test.js sample-preparation-store.test.js
```

The tests began red before module implementation. Domain/storage tests cover frozen definitions, unknown defaults, normalized boundaries, invalid evidence/IDs/statuses/oversize, owner/reference scope, safe viewer projection, independent runs, expected-version conflicts, workspace CAS, atomic rollback and operational preservation. Storage tests use SQLite `:memory:` only. Browser coverage uses an isolated localhost fixture and a temporary Chrome profile; it exercises owner creation/save, visible notes, mobile overflow, viewer restrictions, script escaping, failure preservation and stale asynchronous scopes. Chrome-dependent coverage is explicitly skipped if Chrome is unavailable.

Final focused verification: 20 tests passed, 0 failed, 0 skipped, including the real Chrome fixture. Syntax and whitespace checks cover the seven owned files. Self-review confirmed P0 N/A does not grant approval and the parent HTML loads the domain before the view. The parent's cloud adapter now rejects immutable run/model identity changes; its conflict code remains `STALE_SHEET_VERSION`, while local storage uses `SHEET_VERSION_CONFLICT`. Both errors are displayed by this view. Parent files were not edited here. Production database, cloud, deployment and full app access-rule tests remain with the parent task.
