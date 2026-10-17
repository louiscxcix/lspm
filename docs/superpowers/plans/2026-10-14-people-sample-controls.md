# People and sample control document import

Goal: Add the supplied LGIT people/risk reference to existing ontology data without changing application behavior or current operational facts.

Architecture: Reuse Requirement/Evidence for grouped document references, existing role-team Organization descriptions, Risk/Work Item for missing customer-sample controls, and existing typed relations. No schema or UI changes. Apply only to active LS, SMT and MOBIS + HELLA scopes; keep sample-specific gates and risk additions in MOBIS + HELLA.

## Constraints

- Preserve exact source text and SHA-256; a source document is not evidence that a checklist passed.
- Keep all individual checklist statements inside phase/category/area groups; retain explicit P0 only, no invented priorities.
- Keep people, reporting lines, production routes, machine requirements, quantities, History and approvals unchanged.
- Existing team descriptions may receive generic role guidance, never a new individual task allocation.
- Existing equipment/material risks and mitigations must be reused. Add only missing traceability, staffing/coverage, containment and closure candidates.
- Deterministic IDs, source mismatch guard, transaction/revision checks, pre-import SQLite backup and no-op retry.
- No Hosting deploy, public data publication, credentials, Kakao reads or loading optimization in this request.

## Execution

- [x] Add `people-sample-controls.test.js`: lossless grouped checklist coverage, scope, idempotence/manual edits, valid connections and operational preservation.
- [x] Run tests before implementation; observed missing importer failure.
- [x] Add `update-people-sample-controls.js` using existing `Model.addEntity`, `Model.addRelation`, `Projects.attachMembers` and revision-checked `store.save`.
- [x] Run focused tests plus organization, contact, TEM machine, quality and sample-risk regressions (42 passed).
- [x] Backup actual DB, run importer, verify unchanged prior operational records and integrity, retry with zero writes (revision 315).
- [x] Record results and local-only publication status in `docs/people-sample-controls-review.md`.
