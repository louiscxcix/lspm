# LGIT people / sample-control ontology review

Source: `LG_Innotek_Ontology_People_Risk_Management_Update.md` (user-supplied reference, not an approved plant SOP).

## Mapping

- Reuse existing Requirement objects for four role definitions, six response guides and fourteen phase/area checklist groups. All 100 source checkboxes remain individually readable inside their groups.
- Preserve the exact Markdown text and SHA-256 in Evidence. Evidence records are project-owned; each project therefore has its own provenance record, not a shared cross-project Evidence membership.
- Reference requirements are `unknown` / `pending_review`. Only the LOT/QR section is explicitly P0; other individual priorities are not invented. No checkbox is marked verified, no test result, training completion or start approval is asserted.
- Existing Leader/Supervisor/Maintenance Technician team descriptions receive generic responsibilities only. Existing people, membership, reporting chains, station assignments and stop-production authority remain unchanged. No Operator names or Operator team are fabricated.
- Active LS and MOBIS + HELLA receive the complete reference. SMT receives generic and SMT references, excluding TEM/LDM equipment check groups. Conditional checklist scope never establishes actual line capability or machine availability.
- LS references its existing TEM machine risks and mitigations. The confirmed Pressing cleanliness risk remains limited to machines 3 and 4.
- MOBIS + HELLA reuse existing equipment, tooling, settings, material, trial and delivery risks/actions. Four missing sample-common candidates cover LOT/QR/MES traceability, role/coverage, first-piece/containment/restart controls and post-run reconciliation/closure. Controls are proposed Work Items, not executed production steps.
- Existing production steps expose the new sample-common risk candidates through `potentially_affects`; the source checklist references the risks and mitigations through existing `quality_reference` links. No new manufacturing sequence, machine allocation or automatic quality disposition is introduced.
- Existing TEM sample gates receive generic/TEM reference readiness conditions; their stored status, readiness, decision and approval remain unchanged. Conditional SMT/LDM check groups have no asserted TEM Part applicability or gate prerequisite. During/after-run checks are not prerequisites for the start gate.
- Mitigation Work Items use the existing `qualityKind: action` classification, keeping them outside the manufacturing process spine. Source stamps are committed atomically with each scope; repeat imports preserve subsequent manual notes, memberships and relationship deletions rather than reconstructing them.

## Preservation proof before actual application

Migration tested on a disposable copy of the actual SQLite database: revision 311 → 315, 36 new canonical objects and 14 role-team annotations. Existing object fields (except appended team context), existing relationship records, all people/gates and History/observation tables compare unchanged. Foreign-key violations: zero. Reapplication: no changes / no new revision.

Focused regression runs pass: document grouping, typed relations, project ownership, manual-note preservation, changed-source rejection, idempotence, revision-checked persistence, map Part isolation/grouping, compression/public privacy, organization/contact routes, TEM machine risks and SMT-return/Pressing rules.

## Actual application

- Source SHA-256: `d4fb49a1edddf498603986424e4551c01e14c258c9cdcb8e5f32c531aab6070b`.
- DB revision 311 → 315. Added canonical objects: 36. Role-team descriptions annotated: 14. LS has 25 imported references, MOBIS + HELLA 33, SMT 23; shared Requirement identities are not duplicated across projects.
- Pre-import backup: `/Users/louis/Desktop/lg/mex/.local-data/ontology-before-people-sample-controls-1792031874138.sqlite`.
- Actual DB vs backup: every existing entity field preserved except appended role-team context; every existing relationship retained exactly. History source/jobs/proposals, observations, project schedules and assessments unchanged. History Event count remains 318. SQLite integrity `ok`; foreign-key violations zero.
- Repeated CLI import returned `changed:false`, revision 315.
- Final focused regression suite: 42 passed, zero failures. Independent review findings were reproduced and fixed: manual workstream preservation, mitigation-map exclusion and conditional area scoping. Re-review found no material remaining issue.
- Local DB only. No cloud publication, public snapshot, Hosting deploy, password change or GitHub push was performed in this request. Project loading optimization remains outside this document import.

## Limits

No new Role entity type, checklist editor, alert engine, automatic assignment, AI inference, loading optimization or production-state update. Existing UI renders these as reference objects, related risks/mitigations and team detail text. Deployment/publication status is recorded after application.

Rollback: preserve the timestamped pre-import SQLite backup. Use the existing reviewed change-set reversal workflow or restore that explicit backup only after reviewing newer writes; never overwrite subsequent observations/History blindly.
