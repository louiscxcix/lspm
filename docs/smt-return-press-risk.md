# SMT return / T1-2 Pressing Risk review — 2026-10-13

## Confirmed structure

- T1-2 Uplevel retains one Pressing operation in the existing ICT → Pressing → Connector fastening route. Pressing 1–5 are five Resource machines, not five assumed sequential Production Steps. Their ordinal labels are not actual asset IDs. Base was not changed.
- The previous aggregate equipment identity is retained as an equipment set (`resourceKind: other`). The process requires five distinct machines; it no longer requires the aggregate as a sixth machine. Individual machines are `part_of` this set. Earlier references and change history remain recoverable.
- Shared NG storage keeps local non-SMT repair/return and unrecoverable Scrap disposition. A confirmed SMT-origin defect branches to original-source repair → source reinspection → originating downstream failed process, with no repair-to-production bypass.
- Internal factory SMT and Starpro SMT have separate conditional branches. Exact child line, repair asset and operator are unknown until case evidence identifies them. Unknown origin remains held; no SKU-to-source hypothesis was promoted to fact.
- Rework branches appear alongside normal routes, not in the normal spine. Source-SMT policy can appear in the SMT map before its detailed production route exists. Existing map chips, machine/component toggles and selection/details behavior are reused. Progress excludes these exception/rework operations.

## Risk and mitigation

- LS: SMT-origin return/traceability/delay Risk, and T1-2 press-cleanliness Risk directly affecting the Pressing operation and five machines.
- SMT: its own project-owned origin-return Risk and mitigation work.
- MOBIS + HELLA: its own origin-return Risk plus eight shared sample-readiness candidates: equipment/factory availability, tooling/subpart compatibility, settings/revision mismatch, trial acceptance, Starpro supply timing, material code/revision/lot mismatch, trial/rework consumption, packing/transfer readiness.
- Each candidate has a planned Work Item → `mitigates` → Risk. Existing two customer readiness Risks now have verification actions. Gate decisions, campaign completion, current settings and inventories remain unchanged.
- Risk is visible in object details and the Risk menu, not added as a chip on the production spine. Risk → Resource is now a validated relation; no arbitrary new relation type was introduced.

No probability/severity scores, owners, due dates, confirmed incident counts, actual tooling IDs, cleaning intervals/chemicals/limits, approved test criteria, or packing quantities were invented. Named line contacts remain contacts, not newly assigned Risk owners. The sample candidates are review proposals, not live defects.

## Future case recording

An actual return case needs the affected PCB/component identity, unit/lot trace, confirmed producing line, original failed downstream step, cause confirmation, repair record, inspection acceptance and return record. Reuse Event timestamps, `traceId`/`traceKind`, and `records_on` links to Part, Resource and Production Step; attach actual evidence. Never interpret the two possible origin branches as simultaneous requirements. Event recording still does not change inventory, process route, assignments or present state automatically.

## Verification / rollback

Local revision: 256. First pre-change SQLite backup:
`/Users/louis/Desktop/lg/mex/.local-data/ontology-before-smt-return-press-risk-1791944975504.sqlite`.

- Migration retry leaves revision unchanged.
- Schema and project validation pass. Actual LS/LDM, SMT and customer/TEM node/satellite rectangle checks find no overlapping chips.
- SQLite source/ingestion, Event/Evidence/Person/Organization/Part objects, WIP, staffing, hourly records and change proposals match the pre-change backup.
- Chrome against the local HTTP server verifies distinct Pressing 1–5 labels, press-cleanliness Risk in details, conditional source repair edges, internal/external separation and no runtime errors.
- Full serial suite: 157 passed, 1 failed. The existing browser-smoke file-address startup check times out before app navigation; separate local HTTP feature checks pass. This file-address test is not claimed fixed.

The migration is revision-checked and saves each scope in a transaction. If one scope fails, rerun after resolving the reported conflict; completed scopes are idempotent. No DB overwrite/rollback was performed. For rollback, stop the server and restore the explicit backup only after checking for newer user records; otherwise reverse this change set selectively to avoid losing newer data.

No Firebase deployment, GitHub push or private cloud upload performed.
