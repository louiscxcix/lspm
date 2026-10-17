# Local Event History — 2026-10-07

## Available now

- Global and project process maps have an independent History toggle, date range, kind/person/verification filters and occurrence/report/entry date basis.
- Directly linked objects and collapsed groups show deduplicated event-count badges. Clicking opens the history panel; selecting an event highlights its related objects without recomputing map layout. Selected-object queries are separately paginated, including events outside the first period page. Mobile uses a bottom sheet.
- Add work updates from text, TXT/MD/CSV/PDF, or manual entry. Source is retained before extraction. AI drafts require user selection/review before commit. Failed jobs can retry. Exact source retries and committed-job retries do not duplicate events; distinct repeated occurrences require explicit selection.
- Global Library can read new local messages from the three authorized Kakao rooms. No sending, background monitoring or automatic state edits.
- History records retain reporter, source, time certainty, subjects and follow-up relationships. Saving a history event does not change operational objects.
- A separate proposal workflow supports explicit schedule/status and existing machine/assignee relationship changes. Review, current-value/revision checks, effective-date blocking, application and checked reversal are separate operations. Shared relationship changes affect the shared Library, not only the project view.
- OpenAI is used when configured; Gemini remains a fallback. No API key reaches the browser. Actual company data was not sent to AI during verification; HTTP tests use mocked responses.

## Existing data

- Before conversion, a SQLite backup was made at `/Users/louis/Desktop/lg/mex/.local-data/ontology-before-history-1791377678270.sqlite`.
- 102 retained Kakao records are classified as source reports, with message time represented as reported time rather than an assumed occurrence time. IDs, senders and original evidence remain.
- 21 existing findings are prepared as review candidates, not accepted business facts. Open Global Library → History ON → 검토 대기 21건. Existing Issue/Work Item records remain unchanged.
- Project memberships were not reassigned. Private history remains local-only and excluded from public exports. No hosting deployment was performed.

## Verification

Passed: history model/store tests, mocked extraction failure/retry tests, browser desktop/mobile manual-entry and badge tests, legacy ontology suite, 33 local-store tests, map grouping tests, Kakao migration/privacy tests, 9 production-log tests and TEM scope tests.

Synthetic full-period counts plus first-page queries: 10,000 events approximately 197 ms; 100,000 approximately 1,293 ms on this machine. These are query timings, not complete browser-render timings. The server still loads the full workspace; a lightweight map projection is not enabled.

## Deliberate first-version limits

- Events are shown chronologically; an episode-grouped list and separate carried-over unresolved-case section are not implemented.
- Existing subject links and follow-ups are supported; no automatic incident merging, factual verification or historical map reconstruction.
- Change proposals are made one at a time. Conflict checks reject unsafe writes; the draft does not gain a persisted conflict status automatically.
- History-source correction/retraction has no dedicated review UI yet. Raw sources remain retained. The general database-change log is distinct from business Event History.
- Extraction requests are synchronous with durable jobs. Interrupted work remains available for retry, but there is no background queue or automatic restart.
- No separate authenticated-user authorization layer is added to this localhost application. Project-scoped history filtering is visibility scoping, not a multi-user security boundary.

## Implementation mapping

The approved plan's interfaces were consolidated into `history.js`, `history-store.js`, `history-http.js`, and `history-view.js`, rather than adding separate files for every proposal/query operation. Tests live in `history.test.js`, `history-http.test.js`, `history-performance.test.js` and the existing browser smoke suite. Endpoint contracts are in `history-http.js`; the planning document is the original design, not an assertion that every extended UI item shipped.
