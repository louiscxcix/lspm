# Production scope and separate timeline implementation plan

**Goal:** Expose production-only records, contextual risks in details, and separate full-width project map/timeline views.

**Architecture:** Reuse project workstream membership and typed relationships. The database remains shared; filtering is a view, not data duplication. Existing ontology wins over consolidated observations.

**Tech Stack:** Browser JavaScript, Node.js, SQLite, Firebase Hosting.

## Tasks

- [x] Add and test workflow helpers for bounded production record scope and related risk/issue details. Unrelated commercial records stay excluded even when they share a machine or person.
- [x] Update app navigation: keep Production scope while switching Parts, Risk / Issues, Resources, Stakeholders and Records; show Process map as the overview label. Separate Timeline for all projects, not just Library. Use the existing single-panel class for full width.
- [x] Display related risk/issue cards in object Overview details and Part Workflow details, not the process canvas. Part and machine details inherit risks from their directly linked production steps.
- [x] Back up SQLite. Classify imported historical failure modes as Risk rather than live Issue, add the observed NG handling gap as Issue, assign source records and Alexis to Production, detach Marta from LS while retaining library history.
- [x] Run model/workflow regressions and live browser checks for scoped menus, Router details and independent timeline/map panels. Build the public snapshot, deploy Hosting and verify the published revision.

## Acceptance checks

Production menus retain their scope after navigation; whole-project menus reset scope. Risk nodes never appear in the main map. Existing manufacturing route, BOM quantities, machine allocation and NG disposition edges do not change. Reapplying database edits is a no-op. No source files or SQLite database are published.
