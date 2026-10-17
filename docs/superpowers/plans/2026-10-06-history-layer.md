# Meaningful Event History and Process Map Layers — Design and Implementation Plan

> **For agentic workers:** Use executing-plans to implement the approved design task-by-task in the current workspace. Checkboxes below track independently reviewable deliverables. This document is planning only; it does not authorize deployment or changes to existing records.

**Goal:** Preserve daily work sources, capture meaningful business events, and show when/where they happened on existing maps without automatically changing the current operational ontology.

**Architecture:** Keep the current shared SQLite ontology as the structural source of truth. Reuse Evidence, Event, sources and ingestion_jobs for reviewed history. Add one transactional change-proposal table for explicit current-state updates. Query events separately and overlay badges on the existing graph layout.

**Tech Stack:** Existing Node.js HTTP server, node:sqlite, vanilla JavaScript, SVG map renderer and current AI extraction integration. No new database, graph engine, job queue, UI framework or scheduled collection required.

## 1. User outcome and recording policy

The PM should answer: What changed? What needs attention? Who reported/performed it? Which part, process, machine or organization does it concern? What happened next? The product is not a diary of every message or every worker action.

### Default: meaningful changes

Create a candidate Event when a source contains at least one of:

- A stop, failure, shortage, quality anomaly or material impact on output, delivery or staffing.
- A changed commitment, date, quantity, specification, allocation or process method.
- An actionable request, instruction, decision or approval affecting work.
- A significant milestone or result: validation complete, dispatch, receipt, restart, repair, resolution or cancellation.
- A meaningful observation that changes understanding, such as physical stock disagreeing with the system.

Keep greetings, acknowledgements, repeated unchanged status, duplicate forwards and system notifications in source history without making separate business Events. An acknowledgement accepting an actionable commitment can be meaningful; literal word matching is insufficient.

Routine successful scans and hourly measurements remain in production logs/WIP snapshots. A shift/day summary or a noteworthy exception can produce an Event linked to those records; do not render every scan on the map. Existing log import and pending-time calculations must continue to work.

Three extraction presets: `key_changes` (default), `daily_summary` (also one reviewed summary per relevant subject/day), `detailed` (explicitly selected for a period or investigation). These affect new extraction, not deletion or visibility of previously saved records. Save the chosen policy and version per extraction job. Allow manual inclusion/exclusion with a reason.

Do not enforce a fixed quota. Review UI reports N source records, N proposed Events, N duplicate suggestions, N source-only records and N unresolved items. Every source gets a disposition; skipped material remains searchable and can be reprocessed.

### Event granularity

One coherent update per subject/episode/report is usually enough. “Router failed, G65 stopped, technician requested” can be one disruption Event with these details and several targets. Split only when facts have independently meaningful subjects, times, decisions or follow-up outcomes. A subsequent restart is a new Event connected to that disruption.

Grouping three facts into one Event must not assert that the same sender performed all three actions. Preserve explicit actor roles and unknowns. Do not infer causal links beyond what the source states.

## 2. Ontology: structure, evidence, events and state changes

### Existing structural layer

Parts/components and their tiers; Production Steps and routes; machines/resources/spaces; people/organizations; assignments; schedules; risks/issues. These describe the currently accepted model. Existing entity IDs stay stable.

### Evidence and sources

Evidence is the source reference. sources stores the retained content. A source can be a text note, file, chat message, meeting transcript or existing production log reference.

Metadata: source kind, provider, conversation ID, external message ID as a string, sender account ID/display name at capture, sentAt, receivedAt, content hash, original filename/MIME, timezone, privacy and source revision. Preserve external numeric IDs as strings to avoid JavaScript precision loss.

Each Event can cite multiple Evidence objects. A source can support multiple Events. Source excerpts and paragraph/page/message references accompany supported_by edges. Structured role attribution keeps each sender associated with the specific source, even if several reports are consolidated.

An unprocessed photo remains an attachment reference. Never infer its contents from the filename or neighbouring message.

### Business Event

Reuse entity type Event; validate a nested `eventRecord` object instead of squeezing all new fields into 120-character TEXT_FIELDS.

```json
{
  "schemaVersion": 1,
  "recordClass": "business",
  "kind": "disruption",
  "title": "G65 Router stop reported",
  "summary": "Router stopped; technician support requested.",
  "occurredAt": null,
  "occurredDate": null,
  "reportedAt": "2026-10-06T10:32:00-06:00",
  "recordedAt": "2026-10-06T11:00:00-06:00",
  "timePrecision": "unknown",
  "timezone": "America/Mexico_City",
  "effectiveAt": null,
  "statementMode": "reported_fact",
  "verification": "reported",
  "lifecycle": "active",
  "importance": "normal",
  "visibility": "local_only",
  "scope": {"kind": "unassigned", "projectIds": []},
  "facets": ["production", "technical"],
  "episodeId": null,
  "observations": [],
  "unresolved": ["Exact physical Router asset not confirmed"]
}
```

The example is a schema illustration, not a new claim about a particular source.

Enums:

- recordClass: business / source_report / production_log. Existing productionEventKind remains compatible.
- kind: disruption / change / request / decision / progress / observation / communication / other. Subtypes/facets express detail without multiplying the top-level taxonomy.
- statementMode: reported_fact / observed_fact / requested / planned / decided. Planned work is still a real planning Event; it is not a completed operation.
- verification: reported / verified / disputed. User accepting extraction proves the extraction was reviewed, not that the reported fact is independently verified.
- lifecycle: active / superseded / retracted. This is the validity of the historical record, not whether the underlying machine is running.
- timePrecision: exact / date / approximate / unknown. Approximate text is retained in unresolved/context, never invented as an exact minute.
- importance: normal / attention / critical. User-editable and distinct from extraction confidence.
- scope.kind: explicit_projects / shared / unassigned. explicit_projects requires existing project IDs. shared must be explicitly reviewed, not inferred from a common asset.

An observation has metric, value, unit, basis (requested/planned/observed/reported_system/reported_physical), target ID if known, and source reference. A reported quantity is not automatically a WIP snapshot. Pallets/boxes/EA stay separate unless an explicit conversion is recorded.

### Relationships and participants

- Event records_on target: expand valid targets to include existing Person, Organization, Build, Deliverable, Requirement and Decision as well as current supported types. Project visibility uses eventRecord.scope, not an ambiguous Project entity.
- Event reported_by Person: reuse; preserve source-level sender attribution in Evidence metadata.
- Event performed_by Person/Organization and requested_from Person/Organization: new typed links. Absence means unknown, not the sender.
- Event supported_by Evidence: reuse; source locations and excerpts stored in relation metadata.
- Event follows_up Event: chronology/business follow-up; not proof of causality.
- Event supersedes Event: explicit corrected/replaced report. Preserve the superseded record.

records_on relation metadata includes `role: subject|context` and `linkBasis: explicit|reviewed`. Badge attribution uses subject links; a person merely mentioned as context does not acquire an incident badge. AI-suggested unresolved links stay in the draft until reviewed.

Use existing Issue/Work Item/Decision as episode anchors when appropriate; do not create a new Issue for every Event. Lightweight episodeId groups related business Events without requiring a new domain entity. Uncertain grouping is presented for review, never merged by matching a Part name alone.

## 3. Strong separation: record history versus apply current state

“Save Events” may persist Evidence, Events, their provenance/participants/subject links, source dispositions and draft change proposals. It must not update any existing operational object, assignment, route, machine requirement, WIP count or schedule. Creating a new machine/person/Issue is also a structural action requiring a separate reviewed proposal; an Event can retain an unresolved name meanwhile.

UI actions:

1. `Save history`: records reviewed Events only.
2. `Review current-state changes (N)`: optional before/after proposal list.
3. `Apply selected changes`: explicit transaction after precondition checking.

Proposals use lifecycle draft / ready / applied / dismissed / conflict / reversed. Verification of an Event does not apply its proposal. Future effectiveAt does not authorize an automatic change.

Example: today a source says “Use machine B tomorrow.” Save a planned change Event today, with tomorrow as effectiveAt if the date/time interpretation is confirmed. Store an A-to-B proposal. Today the route still uses A. Tomorrow the proposal becomes eligible for manual review; there is no timer that switches the machine. Actual execution needs confirmation. Approval of the plan and confirmation of execution are separate facts.

Applying a proposal must:

1. Resolve and validate exact target IDs, scope and allowed field/relationship operations on the server.
2. Check expected DB revision and exact before value/endpoints against current state.
3. Reject future/not-yet-effective changes and return a human-readable conflict if the before state changed.
4. Apply all selected operations atomically, record reviewer/apply time and link to supporting Events.
5. Reuse change_sets for the before/after audit. The proposal outcome and audit record commit in the same transaction.

Do not accept arbitrary JSON Patch, SQL or model-generated field paths. Initially support whitelisted scalar changes to Work Item scheduling/status and explicit relationship replacement for machine requirements/assignments. Other proposal types remain readable but cannot be applied until a dedicated validated handler exists. WIP still uses its reviewed snapshot import.

Reversal restores state only when the post-apply values still match. It records a compensating change; original Events and sources remain. A later changed state requires a new reviewed correction, not a blind undo.

## 4. Date semantics and project scope

Default history date = occurredAt/date when known, else reportedAt, else recordedAt with a visible basis label. A planning decision made today has today's Event date and a separate future effective date. Users can switch date basis to reported or recorded.

Use the selected IANA timezone, initially America/Mexico_City. Build [local start midnight, midnight after end date) boundaries, convert to UTC instants and filter there. Do not compare UTC string prefixes to local dates or invent midnight timestamps for date-only events.

Older unresolved episodes appear in a separate `Carried over` section. They do not inflate the selected-period Event count. “No resolution report” is not evidence that a machine is still stopped. Only the last applied current-state change determines accepted current state; latest report is separately labelled.

Scope rules:

- Global: all locally accessible history, including unassigned and unmatched.
- Project: explicit_projects containing that project; or explicitly shared Events with confirmed subject overlap in the project's objects.
- Unassigned: Global only, until reviewed. A shared Part name is insufficient to attach supplier-side or other-project Events.
- Workstream/production line: start from project visibility, then confirmed subject/line links; no unrestricted graph traversal through shared machines or generic people.
- A direct subject match gets a direct badge. A roll-up to a Part family or collapsed group shows descendant attribution distinctly. Do not propagate family Events down to every leaf route.
- Unknown physical asset remains linked at the known Part/line level. “Router” alone must not choose a specific machine.

Current Event/Evidence types have project-ownership restrictions. Keep canonical history in Library and query scoped history separately rather than copying one Event into several project memberships or weakening all ownership rules.

## 5. Daily input, growing history and deduplication

### Unified entry

`Add daily update` accepts text, supported files, selected read-only chat imports or manual Event entry. The user selects an intended project/line or Global; explicit source information can flag a conflict with this choice. Reuse existing source and extraction infrastructure.

Flow: persist source → create extraction job → generate candidates → resolve subject/actor/episode matches → review → save selected Events → optionally review separate current-state proposals.

Persist source before the AI call. Current /api/extract saves it after successful extraction; change that so timeout, failure or server restart does not lose the upload. Manual Event creation works with no AI key. Use the existing configured AI provider; changing providers/models is outside this feature.

AI receives the selected source plus a bounded relevant object/alias index and candidate existing episodes. It returns draft Events, supporting excerpts, unresolved references, source dispositions and optional proposals. Server verifies IDs, types, source references and value/unit constraints; model output never directly calls state mutation.

### Review UI

One card per meaningful update: type, one-line summary, time/basis, reported by, subjects, existing/new episode and source excerpt. Default grouping by day and episode. Expand for details. Buttons: include, edit, group with existing episode, keep source only.

Unknown participants remain textual unresolved references. Source nickname does not silently merge with an existing employee. Several reports of one accepted Event can be consolidated while preserving every source and sender. Contradictory reports stay separate, linked and visibly disputed until reviewed.

### Identity and retries

- Chat exact identity: provider + account namespace + conversation ID + external message ID; all IDs strings. Content hash differentiates edited versions under the same identity.
- File upload: SHA-256 content hash; scope/policy/reprocessing choices are separate from source identity.
- Pasted notes: hash detects exact reuploads, with an explicit “separate occurrence” choice; identical text can describe a different day's event.
- Store immutable candidate IDs in the saved draft. Commit uses extractionJobId + candidateId idempotency so a repeated click/retry cannot create duplicate Events/proposals.
- Semantic similarity proposes a match. Only exact source retry is automatically deduplicated; recurring breakdowns on different dates remain separate.
- Corrected reports produce a new Event and supersedes relation. Never rewrite the old report to make the new statement appear historical.
- Re-extraction of an existing source creates a new job and review diff, not an overwrite of committed history.

For future chat intake, a user-initiated `Read new messages` imports only the three authorized rooms. Use a stored cursor plus overlapping read window and source deduplication so late/edited records can be detected. Mark gaps in locally available history explicitly. Do not schedule collection or send messages as part of this feature.

## 6. Map and history UX

Toolbar: `History ON/OFF` · `Today / 7 days / Custom` · `Filters`. Default ON when opening History intentionally; otherwise remember the last setting per map. Event categories and actor/date-basis filters live in the filter popover. Explicit clear/reset restores defaults.

History range must not reuse or modify the existing process schedule filters. History OFF returns the same structural graph, positions, pan, zoom and selection. Events and their raw Evidence are excluded from normal structural layout in this layer mode. Existing production-log processing is unaffected.

Map overlay:

- At most one compact badge per visible node: distinct Event count and attention indicator. Empty nodes receive no badge.
- Text category labels accompany colour. Routine progress is not red. Badge size does not scale with count.
- Badge positions use reserved corner space and screen-space hit targets. At very low zoom render group totals or rely on the panel, never enlarge nodes until they overlap.
- When density is high, show one-line event text only on selected/hovered nodes. Always expose counts and details by keyboard as well.
- Collapsed group totals deduplicate Event IDs across its descendants; expanded nodes may each show the same shared Event, but page total stays distinct.
- Only confirmed subject links contribute direct badges. Derived roll-up badges expose their derivation.

Right panel (desktop), bottom sheet (mobile): `Period history` / `Selected objects`. Default multi-selection means union, explicitly labelled; no surprise intersection. List groups by day/episode with chronological order, 50-item cursor pagination and lightweight summaries.

Event click highlights visible direct subjects and their relevant existing connections. Temporarily draw stronger history-to-subject connectors only for the selected Event. It never inserts people or Event nodes into the production sequence. Subjects hidden by current Part/line filters appear as a list with an explicit `Show related subject` action, not an automatic filter reset.

Detail includes: summary, kind/mode, occurred/reported/recorded dates, source-specific reporter, performers/recipients, subjects, observations, evidence, previous/follow-up Events and proposed/applied changes. The existing map object selection and ? detail control remain usable.

No matched subject: include Event under `Link needed` in the panel. No records in range: retain the full map with a clear empty history message. No records is not a claim of healthy production.

## 7. Concrete persistence and API design

### UI concept review — 2026-10-06

Preview image: `/Users/louis/.codex/generated_images/01a0a663-9be4-75f3-93e6-dbce960f8bb9/exec-316a3b9e-1683-4886-a9ad-660f5b40bc5b.png`. Generated with the built-in image tool as an illustrative concept, not a screenshot or source of ontology facts. Design brief: existing white/cyan process map, two unboxed routes, compact History/date controls, Event-count badges and a right-hand selected-event panel. Example identities, times and links must not be imported.

Interaction contract:

1. Keep production-line/Part/machine/component/worker controls and existing route design. The mockup's decorative per-process icons are not a requirement to redesign those chips.
2. Put History toggle in the map toolbar. With History OFF, hide its date/filter row and panel. With ON, show one compact row for history dates, presets and filters; do not open a panel until a badge or `History list` is selected.
3. History toggle never changes process filters or graph layout. Closing the panel keeps badges enabled. Turning History OFF clears Event highlight only and preserves existing object multi-selection.
4. Node body clicks retain multi-selection behaviour; the existing ? control opens object details. A distinct count badge opens that object's history and stops event propagation, so it does not also toggle the node selection.
5. Selecting an Event highlights visible subject nodes and explicitly linked participants/resources. Reporter attribution is labelled as a report relationship, not an inferred operating assignment. Restore previous object highlights on Event deselection.
6. Desktop detail panel is about 360 px wide and resizable/collapsible. It reduces the visible viewport without recomputing graph coordinates or auto-fitting. Keep the selected anchor visible using the minimum pan only if it becomes occluded. Fullscreen supports the same panel; mobile uses a bottom sheet.
7. Panel tabs: Period / Selected. Show date, category, summary and reporter in the list. Expand selected Event inline for evidence, dates, verification and related objects. Keep a visible close control and keyboard focus return to the badge.
8. Proposal review action is present only if proposals exist; opening it shows before/after/effective-time details. It is never an implicit apply action.
9. Filters popover contains event kinds, reporter/performer, verification and date basis. Show the active filter count and Clear filters. History date range is distinct from schedule dates.
10. `Add update` opens source/manual entry using the current project/line and selected subject as editable suggestions. It never silently commits or assumes the selected machine is the event subject.

Mockup qualifications: the History OFF miniature is explanatory, not an actual map widget. The illustration combines `Plate 1 + Plate 2` in one context label; implementation must render them as distinct Component objects, consistent with the existing universal input/output rule. Actual NG links, asset assignments and reporter relationships come only from recorded/reviewed ontology. The map examples show two routes for legibility; verify six concurrent routes without overlapping chips/badges before release.

Keep Event and Evidence JSON in entities; relationships stay in relations. Extend Model.addEntity/update/export/import whitelisting to preserve validated eventRecord and typed relation metadata. Empty optional values serialize as null or are omitted; never undefined.

Add sources.metadata_json (JSON with source identity/hash/revision/privacy) and an index on canonical source identity + hash. Existing sources remain valid with empty metadata. Reuse ingestion_jobs.draft_json with draft schemaVersion 2 containing events, proposals, dispositions and committed IDs; existing version 1 structural extraction remains compatible.

Add only one new primary table:

```sql
CREATE TABLE event_change_proposals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES entities(id),
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX proposal_event ON event_change_proposals(event_id);
CREATE INDEX relation_target_type ON relations(to_id, type, from_id);
CREATE INDEX entity_type ON entities(type);
```

data_json contains whitelisted operation list, expected before values, review identity/timestamps, applied change-set ID and reversal reference. Proposal scope is exactly `library` or an existing project ID, never an inferred free-text project name. SQL CHECK constraints and server validators enforce enums and scopes. A dedicated historyEvent filter can initially use JSON extraction; measure with synthetic 10k/100k Events before adding an expression index or derived index table.

Initial scalar whitelist: Work Item `status`, `plannedStart`, `plannedEnd`, `forecastStart`, `forecastEnd`, `due`, using existing model validators and project schedule overrides where applicable. Relationship handlers operate only on `requires` (Production Step to Resource) and `assigned_to` (Assignment to Person/Organization), validate role and scope, and require exact old/new endpoints. New entity creation is a separate reviewed structural action through the existing object form; the initial proposal apply endpoint does not accept arbitrary entity creation.

Proposed API contracts:

- POST /api/history/sources: {scope, kind, text|base64, metadata}; persist source, return {sourceId, duplicate, revision}.
- POST /api/history/extractions: {sourceIds, scope, policy}; persist pending job, return reviewed-draft data or durable failed status. On restart mark interrupted jobs retryable; no external queue.
- POST /api/history/commit: {jobId, selectedCandidateIds, edits, revision, idempotencyKey}; transactional history-only writes; return {eventIds, proposalIds, revision}.
- GET /api/history/events: {scope, workstream, lineId, start, end, timezone, dateBasis, kinds, subjectIds, cursor, limit}; return {items, nextCursor, totalDistinct, unmatchedCount, carriedOver}.
- POST /api/history/map-summary: {scope, visibleSubjectIds, groupMembers, filters}; return subject/group distinct counts for the entire filtered period, independent of list pagination. Validate all IDs/scopes on server.
- GET /api/history/events/:id: full Event detail and permitted source references.
- POST /api/history/proposals/:id/review: accept/dismiss/correct a draft without changing the operational model.
- POST /api/history/proposals/apply: {proposalIds, revision, confirmedEffectiveAt, confirmationNote}; atomic exact-before-state check and apply.
- POST /api/history/proposals/:id/reverse: checked compensating state update.

All writes stay localhost-only under existing server policy. GET/export paths must respect local_only provenance. Error contracts: 400 invalid input, 404 missing source/Event, 409 stale revision or before-value conflict, 503 extraction unavailable. No partly committed Event batch on failure.

Workspace load currently returns all entities including source-heavy records. Avoid making map render loops parse that growing history: provide a lightweight workspace projection for map clients while retaining a complete internal/export load. Existing generic /api/save must merge against the canonical server workspace and must never interpret absent history as deletion. Introduce this projection only with the preservation tests in Task 2; until then retain full load and paginate History queries.

Backup/export/restore include sources metadata, proposal rows, jobs and events. Register proposals in change tracking. Source bytes are immutable retained provenance; reverting a history save retracts its Events and marks the commit reversed, rather than deleting source bytes. Reapplying a reversed batch requires an explicit new reviewed job.

Public build exclusion must cover source-derived Events, Evidence, proposals, cached summaries, source excerpts, search indexes and public Copilot context. Keep private history local-only by default. The current privacy filter reads top-level `privacy`; derive that field from the most restrictive contributing source and retain `privacy: local_only` on Event/Evidence records, even though eventRecord also exposes visibility. A user cannot make private source text public merely by changing the Event label. No deployment is part of this plan.

## 8. Existing 102-record migration

Take a SQLite backup using the database backup API, including live WAL safely; do not copy an open main DB file alone.

Existing Kakao Event IDs remain stable as `recordClass=source_report`. Transfer the stored message sent timestamp to reportedAt; clear the misleading occurredAt/occurredDate for these records unless separately confirmed by source review. Preserve legacy original values in migration metadata and audit. Existing Evidence/raw text and reporter links remain.

Create new reviewed business Event candidates from those retained sources. Do not delete the source-report Events or recalculate them into production timing logs. Existing 11 Issues and 10 Work Items are match candidates, not automatically validated operational truth; retain them and avoid duplicate creations. Manual review decides which Event/episode each supports.

Run a dry-run inventory before writing: affected IDs, retained records, proposed Events, matched episodes, unresolved people/parts, no-change target count. User-selected commit changes only reviewed history. Migration is idempotent, not dependent on hardcoded message IDs/counts for future imports.

## 9. Files and implementation tasks

Root for every file below: `/Users/louis/Desktop/lg/mex/ontology-app/`.

### Task 1 — Event model and meaningful-event extraction contract

Files: modify ontology-model.js, ingestion.js; create history.js and history.test.js.

Interfaces: History.validateEvent(eventRecord), History.effectiveHistoryTime(eventRecord,basis,timezone), History.validateDraft(draft,library), History.visibleInScope(event,scope,subjectIds). Functions are pure and must not mutate supplied workspace data.

- [ ] Add nested schema, relationship endpoints/roles, legacy classification and preserved JSON export/import.
- [ ] Define version-2 extraction JSON with the three recording presets and explicit source-only/unresolved dispositions.
- [ ] Add fixtures for grouped Router report, routine acknowledgement, independently actionable acceptance, future machine change, contradictory report and exact source retry.
- [ ] Verify reviewed extraction != verified fact, date-only/unknown-time retention, no automatically invented performer or leaf Part.
- [ ] Run `node history.test.js` and `node test.js`; expected model compatibility and semantic assertions pass.

### Task 2 — Durable intake and history-only transactions

Files: modify local-store.js, server.js, local-api.js, public-privacy.js; create history-store.test.js.

Interfaces on store: putHistorySource(input), createHistoryExtraction(input), commitHistory(input), listHistory(query), summarizeHistory(query), historyDetail(id,scope). Existing revision checking is retained.

- [ ] Migrate source metadata and proposal table atomically; update schema version, export/restore and change tracking.
- [ ] Save source before extraction, persist failed/interrupted jobs and enable retry/manual entry.
- [ ] Commit only Events/Evidence/history links/proposals; reject operational object edits embedded in a history payload.
- [ ] Implement stable cursor paging, scoped queries and unique counts across all matched Events.
- [ ] Test idempotent commit, failed extraction retained source, edited source versions, Unicode notes and large external IDs.
- [ ] Assert structural digest before/after history commit is identical, excluding new history records/provenance links only.
- [ ] Test explicit HELLA versus Mobis isolation on a shared machine and Global-only unmatched records.
- [ ] If introducing slim workspace projection, prove normal save cannot remove private history, raw sources or Event relations.
- [ ] Run `node history-store.test.js`, `node test.js` and `node tem.test.js`.

### Task 3 — Separate current-state proposal workflow

Files: modify local-store.js, server.js, local-api.js; create event-changes.js and event-changes.test.js.

Interfaces: EventChanges.validateOperations(operations,workspace,scope); store.reviewEventProposal(input), store.applyEventProposals(input), store.reverseEventProposal(input).

- [ ] Implement explicit whitelisted operation handlers for scalar scheduling/status and machine/assignment relationship replacement.
- [ ] Preview target/scope/current/desired/effective date/source Event before applying.
- [ ] Validate future effective dates, stale revision, exact before value and cross-project restrictions inside transaction.
- [ ] Link successful application/reversal to change_sets and update proposal status atomically.
- [ ] Test “tomorrow B” leaves today's A unchanged after extraction, commit, verification and proposal review.
- [ ] Test apply at eligible date, concurrent conflicting edit, retry/no double apply, reverse without conflict and refusal to overwrite later edits.
- [ ] Run `node event-changes.test.js` and `node history-store.test.js`.

### Task 4 — Reusable map overlay and History panel

Files: modify app.js, index.html, styles.css, workflow.js, map-groups.js, local-store.js settings validation; create history-view.js and history-map.test.js. Add static asset references/allowlists in server.js and build-public.js.

Interfaces: HistoryView.projectBadges(events,graph,groups), HistoryView.renderOverlay(svg,positions,badges,selection), HistoryView.renderPanel(container,result,selection). app.js owns selection/fetch wiring; HistoryView never calls layout.

- [ ] Add independent History controls and settings under each existing map view's settings object.
- [ ] Exclude source-report/business history from structural node projection while preserving logs and existing Records access.
- [ ] Render compact badges without moving chips. Preserve zoom/pan/selection across toggles/date changes.
- [ ] Render day/episode list, Event detail, direct subject highlighting, hidden-target list and unmatched section.
- [ ] Fetch debounce/cancellation prevents earlier filter responses overwriting newer ones; badges use full range counts, list uses pagination.
- [ ] Test collapsed-group deduplication, union multi-selection, direct versus family roll-up and no shared-machine traversal leakage.
- [ ] Browser-check dense production, Global collapse/expand, mobile bottom sheet, keyboard access and History OFF identical positions.
- [ ] Run `node history-map.test.js`, `node map-groups.test.js` and `node browser-smoke.test.js`.

### Task 5 — Daily review entry and safe legacy conversion

Files: modify import-kakao-ontology.js and app.js input wiring; create migrate-history.js and history-migration.test.js; update kakao-ontology.test.js to assert a known fixture subset rather than permanently requiring exactly 102 rows.

- [ ] Replace hardcoded future finding generation with durable source intake plus reviewed meaningful-event extraction. Existing retained records remain readable.
- [ ] Add `Add daily update`, manual Event entry, extraction preset, inclusion review and separate proposal review action.
- [ ] Produce legacy dry-run, safe DB backup and idempotent source-report classification/time correction.
- [ ] Reprocess the 102 sources into candidates using key_changes; persist only after review; no forced project memberships.
- [ ] Test repeated import, later message, source edit, recurring failure on another day and re-extraction without rewriting old history.
- [ ] Run `node history-migration.test.js`, `node kakao-ontology.test.js`, `node production-logs.test.js` and local browser workflow.

## 10. Release acceptance and exclusions

Acceptance: Save a reviewed daily batch containing one meaningful breakdown, repeated acknowledgements, a future machine request and a repair follow-up. Source items all remain retrievable; only meaningful Events appear; map badge count matches distinct Events; future request leaves current machine unchanged. The repair links to the breakdown, reveals reporter/source, and never silently resolves the existing Issue. Explicit proposal apply changes only its selected target. HELLA/Mobis isolation and public private-data exclusion hold.

Use synthetic 10k and 100k business Events to measure query/render time separately. Aim for local first-page/badge responses within 500 ms at 10k and no layout recomputation on history toggles; report actual timings and add indexes only if needed. Render at most 50 list cards initially and at most one badge per visible node.

Critical invariant assertions for the planned test harness:

```js
// Structural state excludes Event/Evidence and edges originating at those records.
assert.deepEqual(structureAfterHistoryCommit, structureBeforeHistoryCommit);
assert.equal(machineRequiredAfterSavingTomorrowPlan, machineRequiredBeforePlan);
assert.deepEqual(nodePositionsWithHistory, nodePositionsWithoutHistory);
assert.equal(collapsedG65BadgeCount, new Set(g65DescendantEventIds).size);
assert.equal(secondCommit.eventIds.join(','), firstCommit.eventIds.join(','));
assert.equal(explicitHellaEventsShownInMobis.length, 0);
assert.equal(publicExportContainsPrivateSourceExcerpt, false);
```

Each fixture must include competing or conflicting data so these checks can fail meaningfully: another project's Event on the same machine, two nodes sharing one Event, a second report disagreeing with the first, a later state edit before reversal, and an unchanged acknowledgement beside a genuine commitment acceptance.

Not included: historical reconstruction of every past process-map version; automatic scheduled state activation; automatic Kakao monitoring or messaging; converting all production scans into visible cards; autonomous verification of reported facts; public hosting of private chat history; unrelated framework/provider migrations.

Implementation order: Tasks 1–2 establish reliable history, Task 3 enforces controlled state changes, Task 4 makes the history understandable on maps, Task 5 introduces daily use and the existing-source review. Each task must pass its acceptance checks before moving on. Do not add speculative infrastructure beyond these boundaries.
