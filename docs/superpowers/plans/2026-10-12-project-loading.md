# Project Loading Implementation Plan

**Goal:** Remove unnecessary project payload reads and duplicate catalog queries.

**Architecture:** Keep access checks and protected view loading unchanged. Select detail data from the current route; share catalog reads in memory for 30 seconds, scoped to the current authentication identity.

**Tech Stack:** Browser JavaScript, Firebase SDK, Node test runner.

## Tasks

- [x] Add regression tests in `project-access-cloud.test.js` for remembered-project list loading, route-selected detail, concurrent metadata, failure retry, expiry and logout invalidation.
- [x] Run `node --test project-access-cloud.test.js` and confirm regression failures before editing implementation.
- [x] Modify `project-access-cloud.js`: replace session-driven hydration with route-driven hydration; cache catalog promises for 30 seconds by authentication identity; clear after failed reads, logout and catalog mutations.
- [x] Run focused cloud/access/startup tests and inspect the final diff. Preserve all pre-existing edits.
- [x] Do not deploy or publish database data; hand off verified local changes.

## Results

Focused tests: 18 passed. Full suite: 152 passed using `node --test --test-concurrency=1 *.test.js`. Concurrent full-suite execution encountered shared SQLite locking; serial execution passed. Syntax and whitespace checks passed. Live post-change timing and owner login were not measured because this change has not been deployed. No database records or authentication settings were changed by this implementation.
