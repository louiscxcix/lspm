# Sample Worksheet Builder and Reporting Entry Implementation Plan

**Goal:** Use simple, model-aware preparation worksheets across sample projects; show preparation versus planned sample dates; route production problems first to each line's Leader/Supervisor; simplify the header.

**Architecture:** Keep immutable v1/v2 checksheets readable. Add v3 prospective preparation questions with a shared worksheet presenter used by the app and print. Reuse the append-only local/cloud checksheet stores. Derive current line/source references only from explicit scoped graph relationships. Add an idempotent, audited reporting-entry migration, preserving manager/reporting facts and process order.

**Tech stack:** Existing plain JavaScript, SQLite, existing Firestore adapters, headless Chrome regression tests. No new dependencies or AI calls.

## Constraints

- Model/date/quantity/memo remain. Preparation date and planned sample date are different; today's date uses America/Mexico_City. Do not default the planned date to today.
- Printed Status cells are blank for handwriting; no saved answers, evidence dumps or raw messages are printed.
- New questions describe preparation before the run, not production already completed. Keep 15 plain-English questions.
- Unknown PCB source, machine identity or on-duty contact stays unknown. Internal SMT and Starpro are not interchangeable.
- Existing saved answers, process routes, stock, assignments, passwords and cloud uploads remain unchanged.
- Leader and Supervisor are equivalent first reporting options, managers later escalation. Support all recorded production areas and sublines without inserting people into the process sequence.
- No GitHub push or Hosting deployment is authorized by this task. Do not run scheduled chat ingestion as part of app feature implementation.

## Tasks

- [x] Add failing shared-question, prospective-date, scope/source and v1/v2 compatibility tests.
- [x] Add v3 question definitions and shared worksheet context/timing helpers in `sample-preparation.js`; preserve legacy definitions and validation.
- [x] Make `sample-preparation-view.js` show metadata plus simple question/blank Status table. Keep previous online answers in a collapsed optional section; use the same presenter for PDF. Add responsive CSS and browser tests.
- [x] Preserve preparation metadata through local/cloud save and viewer projection; test round trips without mutating old snapshots.
- [x] Implement/test line reporting helper and idempotent migration in `workflow.js`, `update-reporting-entry.js`, `reporting-entry.test.js` (delegated, no live DB writes by the worker).
- [x] Integrate reporting contacts into the inspector. Back up and apply the reviewed graph-only migration with revision validation, then verify all process order edges and unrelated entity data unchanged.
- [x] Rename header/title to `Louis Kim LGLS`, remove storage subtitle and Export all data UI and dead handlers. Keep access controls working.
- [x] Run focused domain/store/cloud/browser/map/access gates, inspect app and print rendering, request independent review, fix important findings.
- [x] Prepare local implementation handoff and remaining deployment note; do not imply a live release.

## Progress

Initial investigation complete. Existing contact groups and named members exist in the organization source; current inspector follows only the first matching edge. Existing app and PDF have separate question labels. Current new-run sample date incorrectly defaults to today for pre-run planning.

Completed: local revision 327 to 330 using normal audited saves in Library, SMT and T1-2 Sample. Added eight relationships (five direct Supervisor entry choices and three canonical TEM subline parents) and three project memberships. All existing entity/relation/membership/workstream rows, project metadata, production/history records, checksheets and ingestion checkpoints preserved. Existing pending technical change acknowledgement follows the normal save mechanism; no Event recordedAt was changed. Backup: `.local-data/ontology-before-reporting-1792125386133.sqlite` in the repository parent.

Final integration gate: 109 passed, 0 failed, 0 skipped; `node test.js`, syntax checks and `git diff --check` also passed. Independent reviewers' important findings were fixed with red/green regression tests: preserve uncertainty through model context paths, keep assembled PCB producers separate from incoming suppliers even when a known model lacks productionFamily, and never add contact-derived Part memberships to production process nodes. Re-reviews clean.

Representative TEM, SMT and T1-2 print documents were rendered and visually inspected, one A4 page each. No Hosting deploy, private cloud publication, GitHub push, credential change or new chat ingestion performed.
