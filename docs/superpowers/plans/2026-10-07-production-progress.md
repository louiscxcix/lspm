# Production Progress Implementation Plan

> **For agentic workers:** Execute inline with executing-plans; test each deliverable before deployment.

**Goal:** Reuse Production maps for selected-Part WIP observations, History-linked input and recorded-time playback.

**Architecture:** A shared pure Progress module handles parsing, validation, projection filtering and last-observation comparisons. Existing SQLite WIP tables retain counts; History commit saves the source-linked Event and WIP snapshots atomically. A small UI controller adds a Production-only toggle and playback controls to both existing map surfaces.

**Tech Stack:** Existing JavaScript/SVG, Node.js, SQLite, Firebase static Hosting. No AI calls or new dependencies.

## Release status

Implemented and deployed to https://louis-lgls-pm.web.app/. Production-only toggle, source-linked atomic WIP/History input, record selection, held-observation playback and original-map restoration verified in model, HTTP and browser tests. No sample WIP inserted into the real database.

Local database integrity: OK. Allowed Kakao rooms contain 175 saved sources (67 LS Production 1, 98 SMT, 10 NEXLIDE MQ); no new messages on the final refresh. Private Kakao records excluded from the public build. Deployed JavaScript hashes match the build.

Regression caveat: `production-organization.test.js` expects 16 LDM people but the existing organization projection returns 17. Organization data was not changed for this feature. The browser smoke test passes after restarting the outdated local server.

## Global Constraints

- Progress is only available on Production maps; turning it off restores the original controls and map viewport.
- Hide people, machines, components, storage and exception paths in Progress. Keep the selected Part routes and recorded normal order.
- No invented intermediate values or production output. Missing observations are not zero. Variants and units remain separate.
- Preserve source text, Mexico observation timestamp, actual saved timestamp and private History evidence.
- Public Hosting remains read-only, excludes Kakao/private History; only approved production counts are published.

## Task 1: Model and atomic persistence

- [ ] Add `progress.test.js`: parser (wide/long input, timestamps, variants, zero/missing), projection exclusions, repeated accumulation, between-record playback, duplicate/conflict and rollback assertions.
- [ ] Run `node --test progress.test.js`; observe failing new API assertions.
- [ ] Add `progress.js` pure helpers; reuse `workflow.js` routes and exact/alias matching, reject ambiguous matches and invalid quantities.
- [ ] Extend `history-store.js` commit with validated WIP snapshots in the same SQLite transaction and audited rows.
- [ ] Extend `local-store.js` with `saveProgress(input)` and `listProgress(projectId)`; expose protected `/api/progress` and `LocalAPI` methods.
- [ ] Run model/storage tests, asserting no structural changes, idempotence and zero applied proposals.

## Task 2: Existing map UI

- [ ] Add `progress-view.js`, mounted above existing maps beside History; available only in Production context.
- [ ] Add text/TXT review dialog with time, Part, unit, editable per-row mapping and correction acknowledgement.
- [ ] Filter the existing projection during Progress, remove satellites and contextual/exception edges; decorate existing chips with Part-specific observation badges.
- [ ] Add record selection, bounds, slider, previous/next/play and count-detail popup; restore normal preferences/viewport on exit.
- [ ] Add browser test for visibility, multi-Part values, time gaps, ON/OFF restoration and no console exceptions.

## Task 3: Data refresh and release

- [ ] Read only LS Production 1, SMT, NEXLIDE MQ; compare source IDs/committed jobs and process only new records with reviewed provenance.
- [ ] Verify DB integrity and all relevant regressions; do not seed invented WIP counts into the real database.
- [ ] Extend static build/public adapter for read-only Progress data, preserving private-source exclusions.
- [ ] Build, run privacy checks, deploy only Hosting to `louis-lgls-pm`, verify deployed assets.
