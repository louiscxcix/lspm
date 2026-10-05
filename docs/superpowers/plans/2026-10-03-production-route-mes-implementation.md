# Production route and MES overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every recorded production route and workstream process on readable canvases, then overlay reviewed Excel WIP and directly observed worker counts.

**Architecture:** Keep the local SQLite/server and plain JS/SVG app. Add pure lane projections in `workflow.js`; both map surfaces consume those projections. Extend existing WIP preview/save and change-set paths, not a second importer. Store Step/Resource staffing observations separately from Part staffing.

**Tech Stack:** Node.js, `node:sqlite`, ExcelJS 4.4.0, plain JavaScript, SVG/CSS, `node --test`.

## Global Constraints

- Local-only; do not deploy or write Firestore.
- No actual workbook has been supplied. Screenshot values must not become data.
- No invented production sequence, unit count, machine occupancy, or worker attribution.
- Blank means unknown; numeric zero means measured zero.
- All selected Parts render together; all recorded steps remain visible by default.
- Preserve existing SQLite data, revision checks, review/revert, exports, and keyboard access.
- No Git repository exists in this workspace; omit commit commands.

---

### Task 1: Pure process-lane projections

**Files:** Modify `workflow.js`; test `test.js`.

**Interfaces:** Add `productionLanes(project,{partIds,query,start,end}) -> {lanes,edges,stepIds,unlinked}` and `workstreamLanes(project,options) -> {lanes,edges,entities}`. `lanes[].items[]` retains canonical `id`, `lane`, and `orderKnown`; a shared Step can appear in multiple Part lanes without creating an object.

- [ ] Write failing assertions in `test.js` using a two-Part fixture: shared Step appears twice, sub/failure children are present, only explicit `precedes`/`on_failure`/`rework_of` edges appear, isolated Step has `orderKnown:false`, Part without route is present. Add all-workstream/Unassigned assertions.
- [ ] Run `node test.js`; require failure on missing projection behavior.
- [ ] Implement minimal projections. For example, derive selected Part memberships from `applies_to`/`produces`; sort only connected normal steps topologically, keep unconnected steps in an unconfirmed group, attach child steps by `parentWorkId`; filter edges to recorded relation endpoints. Workstream assignment uses `project.workstreams[id]`, with Unassigned fallback.
- [ ] Run `node test.js`; require exit 0.

### Task 2: All-visible maps, selection, and metric controls

**Files:** Modify `app.js`, `index.html`, `styles.css`; test `browser-smoke.test.js`.

**Interfaces:** `renderMap` and `renderProductionMap` consume Task 1 projections. Existing `data-select`/inspector remains canonical. Persist `mapPartIds`, Production Part IDs, and metric mode via existing view settings.

- [ ] Add failing browser checks: Production lens and Production tab show multiple selected Part lanes simultaneously; no Previous/Next requirement; all child/failure steps visible; whole and Logistics show real objects, not summary nodes; switching metric mode leaves coordinates stable. Check text labels remain at least 11px and keyboard-selection works.
- [ ] Run `node --test browser-smoke.test.js`; require feature assertions to fail.
- [ ] Add SVG Part/workstream lanes, explicit sequence/failure edges, unconfirmed strip, fixed-size node cards, shared resource/worker annotations, a visible legend and search highlighting. Keep other relation detail in inspector to avoid hairball. Replace single-Part controls with multi-select and add `Show numbers` beside `Focus`, a snapshot picker, and `Add Excel data` jump to existing WIP tab.
- [ ] Run browser smoke and visual captures at desktop/mobile widths; correct clipping, contrast, and map labels.

### Task 3: Reviewed MES stage mapping and saved overlays

**Files:** Modify `app.js`, `server.js`, possibly `wip.js`; test `server.test.js`, `browser-smoke.test.js`.

**Interfaces:** Existing `/api/wip/preview` returns sheet/header/Part-column choices. `/api/wip` accepts `partMappings` and `stepMappings` keyed by source row and column; stores selected `stepId` in existing `wip_counts` after Part/Step membership validation in `local-store.js`.

- [ ] Add failing API test: an ambiguous Excel stage remains unmapped without review; explicit Step choice maps only to a Step linked to that Part; invalid choice creates no snapshot. Add zero-versus-blank and old-snapshot selection checks.
- [ ] Run `node --test server.test.js`; require expected failure.
- [ ] Extend WIP preview to show source row/column, proposed unique exact match, and per-Part/stage Step selector; allow unresolved save with raw labels. Add snapshot selector in map toolbar. Render metric label as `WIP at step`, or `WIP at linked step` for a uniquely attributable machine; never call this physical machine stock.
- [ ] Run `node --test server.test.js browser-smoke.test.js`; require exit 0.

### Task 4: Direct Step/Resource worker observations

**Files:** Modify `local-store.js`, `server.js`, `local-api.js`, `app.js`, `index.html`, `styles.css`; test `local-store.test.js`, `server.test.js`.

**Interfaces:** Add `production_staffing_counts` with `target_id`, `target_type` (`Production Step` or `Resource`), `captured_at`, `shift`, `basis`, `count`, `note`. API `GET/POST /api/production-staffing`; include in JSON export and change-set revert. Existing Part staffing stays separate.

- [ ] Add failing DB/API tests: direct Step 0 renders as recorded zero, Resource count remains separate, invalid target/stale revision writes nothing, latest save is reversible, export includes rows.
- [ ] Run `node --test local-store.test.js server.test.js`; require expected failure.
- [ ] Add the table, validation, transaction, API, and small Production form/history. Show latest applicable observed/planned number only on matching target; `—` elsewhere. Preserve date/shift/basis in label and tooltip.
- [ ] Run DB/API tests; require exit 0.

### Task 5: End-to-end verification and documentation

**Files:** Modify `README.md`, tests as needed.

- [ ] Run `node test.js` and `node --test *.test.js`; require 0 failures.
- [ ] Run browser smoke with desktop/mobile captures and inspect both. Run Impeccable detector once on changed UI files; fix true positives, no blanket ignores.
- [ ] Open local app against its existing DB; verify recorded LS Part and Step counts, multi-Part routes, preview without a real workbook only via synthetic fixture, and saved/reverted observations.
- [ ] Update README: local launch, map controls, Excel input/mapping, zero/unknown semantics, staffing basis, DB backup.
