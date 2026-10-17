# Identity Review, LS Hourly View and Unbounded History Release

## Scope

- Match retained authorized Kakao sender identities to canonical people using explicit human confirmation or retained independent identity proof. Similar names only produce review candidates. Preserve account IDs, originals, old Event authors and timestamps; never merge people or infer roles.
- Enable hourly model performance beside Progress on LS production maps, retaining SMT support. One Part/model at a time, existing 07:00 production day and 24-hour chart. No synthetic values saved or cross-project observations copied.
- Start Event History without a default date restriction; clear the exact persisted LS October 1-7 demo range, preserve deliberate unrelated filters and explicit filtering.
- Include the preceding local sample-builder/reporting-entry/header work in the requested Hosting release. Preserve passwords, project grants, cloud-created projects and uploaded observations. Publish private identity/history only to owner-private seed; project views must strip private matching details.

## Implementation and gates

- [x] Read-only identity audit: classify confirmed mappings vs ambiguous candidates; record private evidence, no name-only merge.
- [x] Add reversible private mapping representation and UI reference without changing existing reporters or employment.
- [x] Existing HourlyView single-select model control; regression tests for LS/SMT, changing model/day/project and stale async responses.
- [x] Enable LS hourly feature and colocate its toggle beside Progress; mode switches must not hide either entry permanently or duplicate toolbars.
- [x] Remove the exact legacy History range and add unbounded/reset regression proof.
- [x] Back up the local DB; audited/revision-safe apply; prove original Events, sources, production records and identity nodes preserved.
- [x] Run focused domain/browser/access/privacy/publication gates plus prior checklist/map gates; review important findings.
- [x] Build catalog-only static release, deploy Hosting only, publish owner-private data and refreshed sanitized relevant project views while preserving remote observations/grants.
- [x] Verify live asset versions, header, script compatibility, private seed/project views, and report remaining uncertain identities.

## Verified application

- Local revision 330 to 333. Backup: `../.local-data/ontology-before-identity-hourly-1792154276944.sqlite`.
- 52 retained accounts: two already-canonical confirmed identities, 19 candidate accounts, 31 unresolved accounts. No distinct account/person merge was confirmed or performed. Candidate rows can refer to multiple possible people; they are not assignments.
- Original Event objects, sources, relationship rows, memberships and production tables preserved. LS features now enable WIP and hourly together; only the exact unversioned demo date range was cleared.
- Browser test selects the asserted model explicitly: equal-time observation ordering is not a default-selection contract.
- 133 checklist/map/history/access gates and 54 cloud/hourly/identity gates passed; `node test.js`, syntax and whitespace checks passed.
- Hosting released; all five sanitized project views verified. Catalog credentials/grants and owner upload state were not modified during release; production payload/rate hashes match their pre-release values.
- Private seed publication completed: revision 333, 58 chunks, 359 retained History details. Library, LS and SMT owner scopes verified from the published version. Knowledge 360 remains in its unchanged cloud catalog/view and is hydrated by the existing owner reader, not invented as a local DB project.
- Live application scripts and public root verified against the release. Static catalog contains five projects and no private graph or observations. Local server restored on port 4173.
