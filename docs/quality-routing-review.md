# Quality response ontology and Part map

Local implementation, 2026-10-14. Existing production routes and evidence are retained. No cloud publication is included in this change.

Private publication checks the deployed ontology relation vocabulary before writing chunks. Until the compatible UI is deployed, scheduled publication must fail safely and retain the existing cloud seed rather than upload a mixed-version graph. Ingestion/local History commits remain independent and retryable.

## Confirmed workflow

Each product Part has a reusable quality policy Requirement. Major product families share a Visual-review Work Item, referencing existing Visual operations without merging physical assets. Abnormal items proceed to Storage handling by the existing canonical Madian Soto person. Storage's exact physical location is unresolved, so neither the material warehouse nor packed dispatch staging is repurposed. Six alternative Work Items represent hold, approved local repair, internal-SMT origin repair, confirmed Starpro origin return, approved Scrap, and LOT recovery.

## Identification is not disposition

The two supplied LQ2 PDFs contain 35 reference definitions: 27 red and eight yellow; the highlighted comparison marks 17 as LQ2-only references. Source revision 107_2, date 31/03/2026, OP labels, the L* reaction-plan 3 and CC k are retained. These numbers are not quantities. All definitions remain pending applicability review; highlighted or unhighlighted entries do not certify a TEM/G65 rule. Unknown code-to-disposition mappings stay on hold; red never automatically creates a Scrap or supplier-return decision.

The references are registered once and linked to LQ2 policy views. G65/TEM get the common response framework and confirmed LOT/QR definitions; other defect criteria are not copied across products by guess. Existing G65 traceability/integration Risks and historical Issues remain separate references, not fabricated active cases.

## LOT / contacts

- QR readable / MES LOT missing: ask Park Jongmyeong or the confirmed existing Kim Younghan Julián identity for LOT-creation guidance; create the correct LOT, verify MES lookup, then process input.
- LOT deleted: restore the existing LOT and its trace/history, verify lookup, then input. This is not replacement by a fresh LOT.
- QR unreadable: identification/recovery approval and method are unresolved. No manual bypass or label-reprint authorization is inferred.

Park is registered once, title 반장. Kim reuses kakao-person-9230063; original privacy and reporting provenance remain intact. Contacts are C/inquiry, not inferred MES approvers. Madian is the existing ls-storage-madian entity, not another similarly named Kakao account.

## Map / records

Part quality cards default collapsed. Expanding shows Visual, Storage, contact and six route cards; routes expand into categorized reference definitions and conditional targets. Presentation occurrence IDs are unique, while detail/selection identities remain canonical. Layout reserves entire block bounds and is recalculated on each toggle without moving the main production route. Links are faint until selected; source colors remain on reference cards.

The two Production-map presentations and whole-project process view reuse existing chips. Progress and hourly quantity modes exclude quality cards. Actual incidents use Issue + qualityKind=case, quality_case_of to their Part policy/definition, and History/Event records separately. Current definitions do not assert incidents, stock, completed repairs or live MES operations. Counts show linked unresolved cases only; no source code counts are disguised as incident counts.

## Verification / rollback

Backup: ../.local-data/ontology-before-quality-routing-1791956373856.sqlite. DB revision 300 to 303; re-running the importer leaves revision 303 unchanged. Compare prior production steps, Parts, Events/Evidence and old relation rows; foreign-key check must remain clear. The saved change history is available for review. A database backup can recover the prior state; do not replace an active database with it after subsequent user writes without reviewing those writes.

Focused tests cover catalogue integrity, conditional routes, canonical contacts, project isolation, idempotent saves, UI keyboard/click detail behavior, chip bounds, both map presentations and Progress restoration. The existing global family grouping remains unchanged; generic Global Library nodes still expose the typed ontology relationships rather than this production-specific overlay.
