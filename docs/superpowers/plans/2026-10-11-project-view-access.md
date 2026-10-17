# Project viewer access and production-day implementation plan

> Execute inline with executing-plans. Preserve unrelated workspace changes.

**Goal:** 07:00–07:00 production-day charts, faster project list loading, and password-only project viewers with no write permissions.

**Architecture:** Separate small public project metadata from protected project view payloads. Firebase password accounts use generated non-personal login aliases hidden by the UI; owner-managed viewer UID grants are enforced by Firestore. Existing owner authentication remains unchanged. Shared views exclude private chat/History sources.

**Tech stack:** Existing JavaScript, Firebase Authentication/Firestore, SQLite, Node and Chrome tests. No new dependency or billing service.

- [x] Test productionDay and 24 hourly slots; implement 07–19 / 19–07 charts and missing-data labels without synthetic counts.
- [x] Public artifact is catalog-only, 703 bytes instead of 1,107,272 bytes. Project list renders before private data; unchanged cloud revision skips repeat uploads reads.
- [x] Project-view projection strips private Event/Evidence data. Cloud project creation and owner access settings publish a sanitized read-only payload; passwords go only to Firebase Authentication.
- [x] Rule compilation and live Firebase checks: own project allowed; anonymous, cross-project, private seed, viewer writes, grant escalation and revoked UID denied. Synthetic fixtures and test account removed.
- [x] Create/settings password UI and unlock dialog added. Existing shared LS production view stays unlocked; SMT/MOBIS require owner to assign a viewer password before sharing.
- [x] 142 regression tests pass. Desktop/mobile screenshots inspected. Hosting and Firestore Rules deployed. Live scripts match build hashes; fresh browser lists three projects in 2.59 seconds, and public LS renders 352 nodes without runtime errors.

Viewer data is an explicitly refreshed read-only publication, not a live read of the entire private DB. External Teams ingestion is not implemented. Password rotation revokes the former viewer UID; old downloaded content cannot be recalled.

Cloud project creation lives in the catalog/view store and joins the owner's shared workspace on load. It does not silently migrate or write the local SQLite DB. Existing local owner access is unchanged. Live owner-password UI creation was not tested using the owner's personal credentials; adapter tests and a disposable live viewer account cover the new access path.
