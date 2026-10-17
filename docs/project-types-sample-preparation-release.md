# Project types and Sample Preparation release — 2026-10-14 (Mexico City)

Deployed to https://louis-lgls-pm.web.app/. Firebase Hosting and Firestore rules were released before the new scoped private seed. Existing credentials, cloud observations/uploads, and Knowledge 360 content were verified unchanged after publication.

## Delivered

- Program: LS. Sample: MOBIS + HELLA, SMT, new T1-2 Sample. Shared: existing Knowledge 360. Additional creation/edit choices: NPI and Improvement. Classification does not change authorization.
- T1-2 uses canonical Uplevel steps and equipment; LGIT internal PCB source is sample-scoped, with exact producing SMT asset/code/lot unknown. It does not reuse a Starpro source. Cleaning risk references Pressing 3 and 4 only. Existing LS route and people remain unchanged; no sample-specific operator assignment is inferred.
- New sample History uses explicit project membership, not unrelated shared LS Events matching a canonical Part. Existing source Events are retained untouched.
- Sample Risk / Issues has Sample Preparation Checksheet: 14 English questions, independent model/run snapshots, Unknown defaults, visible evidence notes, substantive notes for Verified and reasons for N/A. Owners edit; project viewers read only. Answers do not approve a start or modify gates, routes, stock, observations or business History. Related explicitly linked issues appear in map object detail, not extra map nodes.
- Private owner reads fetch one compressed project scope, not all raw source chunks. Original Event detail is fetched on demand. Legacy chunks remain for old tabs. Auth generation, scope/version, workspace revision and server baseline/state checks prevent late reads or writes from crossing navigation/logout/republication boundaries.

## Data and preservation

- Project migration: local revision 315 → 323, including isolated sample History setting. Repeat dry-run reports unchanged.
- Reviewed Kakao: 125 missed originals (LS 49, SMT 29, NEXLIDE MQ 47, Lee verified DM 0), 24 coherent business Events, 2 newly deferred context cases. Thirty attachment references remain uninspected. Old pending sources retained. Original author IDs, aliases, timestamps, exact text and dispositions retained; no quantity inferred from photos, no route/stock/current-state updates.
- Original-source and Event/evidence verification succeeded before checkpoints advanced. Rehearsal replay was a no-op. Final local revision 325; prior Events/entities and existing relations were compared unchanged. All new records local_only and published only to owner privatePM seed, never public Hosting snapshots or project views.
- Private publisher: 342 Event detail records, 54 legacy chunks plus compressed scoped/detail documents. Catalog, public build and viewer data contain no raw Kakao content. Existing 3 cloud uploads and project production projections were compared intact. Knowledge 360 retained its cloud identity and unchanged viewer payload.
- New T1-2 viewer uses the requested 0000 PIN policy; existing credentials untouched. A shared short PIN remains weak and should not be treated as strong identity assurance. Viewer notes are intentionally shared with authorized project viewers; never paste private raw messages into them.

## Verification

- Focused new/relevant suite: 73 tests passed, including browser app integration, save/reload, viewer lock, mobile, CAS, auth/scope/version races, safe projection and publication preservation. Additional post-build loading/cloud/projection checks: 27 passed. `node test.js`, syntax and whitespace checks passed. Firestore rule compilation dry-run and actual release passed.
- Full discovery: 259/262 passed. The three failures also reproduce against the pre-change revision-315 backup: old TEM test forbids later-confirmed operated_in links; old customer test forbids all Person assigned_to links; old Kakao test forbids private project memberships. These baseline assertions were not weakened or used to change user-approved ontology.
- Live clean browser: 5 projects grouped Program 1 / Sample 3 / Shared 1, first list ~794 ms in that run; new PIN login, internal PCB, read-only checksheet, mobile no-overflow and zero uncaught errors. This is a single observed load, not a latency guarantee.
- Live deployed Firestore checks: new viewer can read its own view; another project, private seed and anonymous access to its locked view return denied. Authenticated administrative reads verified published baseline. This scoped validation is not a comprehensive security audit.

Private backups and review artifacts are outside the repository under `.local-data`; do not publish them. No GitHub push, Teams ingestion or automation schedule change was performed.
