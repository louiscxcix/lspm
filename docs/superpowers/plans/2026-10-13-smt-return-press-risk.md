# SMT-origin return and T1-2 press Risk implementation plan

**Goal:** Preserve normal production routes; add conditional source-SMT rework, five T1-2 Uplevel press machines and actionable sample-readiness Risks.

**Architecture:** Reuse Production Step exception/rework branches, Resource equipment, project-owned Risk and Work Item → mitigates. Shared physical/process facts stay canonical; Risks and actions remain project-specific. No inventory changes or fabricated incidents.

**Tech stack:** Existing Node.js, SQLite revision-checked store, ontology validator and SVG map.

## Constraints

- T1-2 Uplevel: one Pressing operation and five machine resources, not five assumed sequential operations. Base unchanged.
- SMT return requires confirmed SMT-origin cause and original producer/lot. Internal SMT and Starpro SMT are separate conditional alternatives; never assign an unknown PCB to either.
- Repair requires reinspection and return to the original failed downstream step. Existing local repair and Scrap disposition remain.
- Sample candidates apply to MOBIS + HELLA jointly, not proven incidents. Owners, deadlines, probabilities, scores, specific tooling and cleaning limits remain unknown.
- Backup before DB updates; deterministic IDs and no-op retries; retain previous equipment-set identity and source context. No History/WIP mutation, cloud upload or deployment.

## Tasks

- [x] Write failing tests in `smt-return-press-risk.test.js`: five machine resources, unchanged normal routes/Base, conditional provenance, project-owned Risks, idempotence, SQLite persistence and map branch placement.
- [x] Add `update-smt-return-press-risk.js`: canonical shared graph migration; project membership and Risk/action migration; backup and revision-checked saves.
- [x] Extend `ontology-model.js` only for Risk → Resource. Update `workflow.js` to expose source rework in SMT views and keep NG/rework in a collision-free side area. Reuse existing chips and selection behavior. `app.js` shows ordinal tier labels and conditional source-return labels.
- [x] Run `node --test smt-return-press-risk.test.js`, then serial regression tests. Apply to local DB, rerun to prove no revision change. Validate canonical and all project graphs. Full suite has one file-address browser startup failure; local HTTP feature checks pass, documented separately.
- [x] Document conditions, unknowns and backup location in `docs/smt-return-press-risk.md`. Hand off local result; do not deploy without a request.
