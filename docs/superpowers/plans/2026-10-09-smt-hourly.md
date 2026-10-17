# SMT hourly implementation

Approved design, adjusted scope: no Excel/text parser or data-entry wizard in this release. Implement inline using executing-plans and TDD. Preserve dirty workspace; no unrelated commits, deployment or private transcript publication.

- [x] Shared metrics, strict scoped record validation and latest-version aggregation tests.
- [x] SQLite hourly records and revision-safe feature settings, local APIs, persistence tests.
- [x] Existing map overlay, date/time/Part selectors, hourly table and reason detail; temporary clearly synthetic preview, not ontology objects.
- [x] Independent SMT project reusing existing SMT line; LS/MOBIS Progress settings.
- [ ] Cloud read/write adapters and owner rules: blocked this turn by Firebase database inspection HTTP 403. No rules changed or deployed; Hosting adapters explicitly reject new writes rather than accidentally calling local /api endpoints. Build includes new scripts. No cloud/public publication.
- [x] Browser desktop/mobile checks, feature toggle restore, regression tests and handoff. Full serial regression suite: 125 passed. Parallel suite initially hit existing shared-DB locking and a live-server stale asset allowlist; server restarted and serial suite passed. Synthetic preview IDs are cached per project; no sample records persisted.

Local DB backed up before independent SMT creation; active project IDs and existing LS SMT line remain distinct. No Firebase publish, Git push, source transcript upload, or data-input parser this turn. Cloud persistence is explicitly unfinished (403 inspection blocker); a Hosting build is not claimed as a working cloud rollout.
