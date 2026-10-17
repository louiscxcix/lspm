# Process map readability review — 2026-10-14

## Implemented

- Global, whole-project and both production maps reuse family/team grouping and existing chips.
- Teams come from explicit confirmed membership. Proposed/unverified and ambiguous memberships do not imply assignment.
- Whole-project maps initially fold product families and teams; production maps fold teams. Group toggles retain connections and recompute non-overlapping bounds.
- Parts filter is available in whole/global views too. “Only” or checkbox selection projects only selected routes and directly relevant context.
- Selected Parts have independent horizontal normal-process rows. Unknown order and exception/rework branches remain separate. Shared steps preserve each Part's own order status.
- Shared storage does not pull in unrelated materials or other line teams. Confirmed component/storage links remain visible even when components are satellite cards.
- History aggregates canonical subjects through collapsed groups. Progress/hourly projections, canonical detail IDs and existing selection behavior remain intact.
- Ontology entities and production relations were not changed by this UI work.

## Verification

- 70 targeted unit/integration tests passed.
- Four real HTTP/headless-browser tests passed: whole/global/production grouping and filtering, quality expansion, History scope/badges, Progress restoration, AI drawer/fullscreen/mobile regression.
- Independent read-only review found three edge cases; each reproduced by regression test and fixed: shared-order leakage, lost satellite-storage edge, proposed team membership.
- Full legacy suite was not a release gate; existing unrelated failures were not repaired.

## Deployment and data compatibility

- Firebase Hosting includes code and a project catalog only, never SQLite or Kakao source files.
- Private baseline publication preserves cloud-created projects, uploads and credentials. Existing 311 History records were synced privately; no new chat ingestion was performed.
- Viewer snapshots preserve existing passwords, lock settings and cloud production observations.
- LS exceeded the 900 KB viewer-document guard. Large sanitized snapshots now use a gzip/base64 envelope; all browser/admin readers accept both legacy JSON and compressed envelopes. Reader rollout precedes compressed data publication. Decompression is bounded at 16 MiB and malformed payloads fail closed.
- No Firestore access-rule changes, password reset, GitHub push or public History publication.
- Existing open tabs should reload to use the new reader before opening refreshed snapshots.
- Final live check opened the refreshed compressed LS view with its existing project password; G65-only filtering, quality chips and whole-map group controls passed with zero runtime errors. Independent re-review found no material issues in the map fixes. Local DB revision remains 303.
