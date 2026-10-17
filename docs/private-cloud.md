# Private History and Progress

Only verified Google identity `delaserre1314@gmail.com` may read `privatePM` or append observations. The public LS graph remains a sanitized Hosting snapshot. The old `7777` menu key no longer grants hosted private access; local password behavior is unchanged.

`privatePM/seed` points to a versioned, admin-published SQLite baseline. Chunk documents contain private workspace data and History provenance and are never copied into Hosting. Initial seed includes 176 History records, with source-only records retained separately from meaningful business Event listing.

`privatePM/records/uploads/{hash}` is an immutable envelope containing reviewed input text, Part/step mappings and WIP quantities. Its Firestore server timestamp supplies observation and recorded times. A transaction creates the envelope and increments `privatePM/state.revision`. History Event and WIP are projections of this same saved envelope; ontology structure is not changed. Retry of the same reviewed input is idempotent. Reload includes previous cloud records.

Cloud records are separate from local SQLite. They are not automatically downloaded into SQLite. `publish-private.js --confirm-private-cloud` explicitly republishes a local baseline without deleting cloud Progress observations; local automations do not invoke it.

Current scope: existing History query/detail and Progress upload/save/playback. General ontology edits, AI extraction/Copilot, state-change proposals and generic History ingestion remain local. The History generic-input button is disabled in cloud mode.

Rules assumptions: verified email is the only owner authority, not a client menu setting or mutable role document. Seed is client-read-only, observations are create-only, and timestamps/owner identity/envelope size and revision increments are checked in Rules. Observation domain parsing uses the shared validated PM model; payload is an owner-only bounded JSON envelope, not a multi-user editable record.

Attack review: anonymous and wrong-email users cannot list/get/write private data; forged owner UID, extra fields, oversized payloads and client timestamps fail observation validators. Updates/deletes of saved envelopes and client seed writes are denied. A record append requires a same-transaction revision increment. Existing legacy `/users/{uid}` rules are unchanged and do not overlap `privatePM`. Rules compilation and unauthenticated production reads were checked; broader rollout needs review and emulator coverage, especially if multi-user permissions are introduced.
