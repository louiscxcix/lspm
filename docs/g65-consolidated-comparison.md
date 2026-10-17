# G65 consolidated notes comparison — 2026-10-04

Source: `G65_Process_Ontology_Consolidated.md`. Existing local ontology is authoritative wherever duplicated or conflicting.

## Existing facts retained

| Subject | Existing ontology retained | Document difference not imported as fact |
| --- | --- | --- |
| LS hierarchy | LS Project; SMT/LDM/Nexlide/TEM production lines | LS/LDM/Nexlide described as modules/components |
| G65 route | ICT, FW download, Router, Integration, LAM assembly, Stacking, EOL, Visual, Packing | Earlier incomplete routes and ICT1/ICT2 references |
| RH Router outputs | Outer ×1; Upper Plate 1/2 and Lower Plate 1/2 ×2 each; 9 Components total | Approximately 10 pieces / two circular pieces |
| Integration | Plate 1 + Connector + Plate 2; intermediate Component | Bracket + reflector + PCB attributed to Integration |
| LAM | Manual attachment of black and crystal plastics | Assembly equipment inferred from process name |
| NG disposition | Universal NG storage, fixed return to origin, unrecoverable Scrap | Incomplete disposition notes |
| T1 identity | Existing distinct product identities | Ambiguous T1 not equated with T1XL/T1-2 |

## Additive capture

Six G65 steps and universal NG storage receive source-linked observation context. Four Issue objects capture historical failure modes, not active production incidents: Router orientation/technical fault, Integration positioning, Stacking/EOL QR identification, EOL positioning/cleaning recovery.

Alexis and Marta are added as observed people without invented titles, employers, access rights or station assignments. Four Evidence objects preserve provenance and unresolved station/product references. Existing exact-name objects are reused.

Stacking approximately 20 seconds and EOL approximately 12 seconds remain historical cycle observations in context. They do not populate pending-time, WIP, yield or staffing metrics. The separate <6-second / 99%-GOOD observation is not assigned to G65 EOL.

## Deliberately unresolved

Pin specifications; bracket/reflector aliases; three-variant simultaneous assembly; manual QR approval; cleaning target; first-piece trigger; High Beam connection point; T1 identity and colors; STD/EOL equivalence; G55 identity; NG ticket/stacking/authority; actual person allocations. Line-release sample testing is retained as an unassigned observation, not a new gate imposed on every route.

## Safety and verification

Importer appends context and relations without replacing BOM, route edges, existing fields or machines. It is idempotent. SQLite backup is created before application; the normal database change-set mechanism records the update for review/revert. Checks verify route/material/machine relations are unchanged, existing entities retain all fields except appended context, the store validates, and a second import is a no-op.

## Follow-up: Production scope, revision 11

The four historical failure-mode Issues were archived and replaced with linked Risk objects; these are potential recurring failures, not current incidents. The observed NG handling/disposition gap is a separate linked Issue. Alexis remains a Production stakeholder. Marta was detached from LS only, retaining the canonical Library object. The original importer describes revision 10 and must not be reapplied to reverse these later user decisions.

Production-only record menus use bounded workstream/typed-link filtering. Risks are shown in related object details, never as main process-map nodes. Whole-project Process map and Timeline are separate full-width views. Live Firebase browser verification confirmed revision 11 and all these navigation/detail behaviors.
