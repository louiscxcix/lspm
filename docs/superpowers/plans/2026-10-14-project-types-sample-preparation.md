# Project types, sample preparation and incremental release

Approved scope: implement the prior consolidated proposal, reduce Risk Preparation Checksheet to 10–15 English questions, read only unprocessed Kakao in the four already authorized chats, deploy code and private data. No password reset, raw chat public release, GitHub push, AI reports, Teams ingestion or during/after-run checklist UI.

## Contracts and constraints

- `project.projectType`: program | sample | npi | improvement | shared. Optional on legacy data; persist new selections locally and through cloud catalog/view. LS=program; MOBIS + HELLA/SMT/T1-2=sample; existing cloud Knowledge 360=shared, preserve its identity/content.
- T1-2 project reuses canonical Uplevel Part/steps/machines, no Base, historical events or counts. Internal PCB source scoped to the sample; never modify LS or infer a specific SMT asset. Cleanliness risk references only Pressing 3/4. Existing credentials unchanged; new viewer uses the previously requested 0000 policy.
- Sample Preparation: 14 English reference questions, per sample run/model, unknown initial answers. Separate shared definitions from project/run results. Verified requires a substantive evidence note; N/A requires reason; edits tracked, revision/CAS checked. Saving does not approve production, change gate/route/stock or create routine History.
- Existing role/reference source and four sample risk candidates remain preserved. New checklist UI in sample project's Risk area only; existing project viewers remain read-only.
- Domain `sample-preparation.js`, store factory `sample-preparation-store.js(db,load)` exposing list/save, view `SamplePreparationView(refresh)` with update({workspace,store,container,readOnly}). LocalAPI methods samplePreparationList(projectId), samplePreparationSave({projectId,revision,sheet}). Cloud append-only kind `sample-preparation`; preserve cloud observations and passwords.
- Split private seed into lightweight manifest + compressed graph baseline + on-demand private Event details, with legacy compatibility and version invalidation. Do not persist private payloads in public browser storage. Owner graph first, independent reads parallel, in-flight cache tied to auth/version.
- Kakao only LS Production 1 / SMT / NEXLIDE MQ / verified Lee DM. Verify DM authors 3389141 and 55304262 before reading text. Dedup chatId/logId, retry pending; record sources/provenance and meaningful events only. Source plans never become actual state.
- Build and rules/readers deploy before publishing new record kinds. Version chunks then CAS seed pointer. Public catalog excludes raw/private content; project snapshots preserve uploads/password grants and contain only the relevant viewer data.

## Tasks

- [x] Project type persistence + T1-2 idempotent migration and regression tests.
- [x] Sample-preparation domain/store/view and tests (14 English questions).
- [x] Incremental Kakao read, review, commit with checkpoints after success.
- [x] Main: cloud adapters, manifest/detail loading, project/Risk UI, asset/server integration, compatible rules.
- [x] Integration/browser/privacy/CAS tests; back up and apply DB migrations. Independent agent tests found race issues, now fixed; separate final reviewer unavailable due usage limit, so main performed final review.
- [x] Build/Hosting + rules rollout; private baseline/metadata/project snapshots publication; live viewer and authenticated administrative data validation. Live owner password not used or reset.

All existing unrelated dirty files belong to the user. Modify only task integration seams, never reset the checkout. Read-only inspection and backup are normal workflow; preserve old rows and use explicit revision checks for each write.
