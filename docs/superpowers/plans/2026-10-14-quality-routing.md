# Part quality routing implementation plan

**Goal:** Show collapsed per-Part defect groups and conditional disposition paths, with family-level Visual review followed by Storage handling/Madian.

**Architecture:** Add reusable quality Requirements and project-owned response Work Items using typed relations. A pure quality-map projection adds side cards without changing production steps, process metrics or recorded routes. Existing people, NG/Scrap and source-SMT repair policies are reused. No actual incident is invented.

**Tech stack:** Existing plain JavaScript, SVG, node:test, SQLite revision-checked saves.

## Constraints

- Main Production Step IDs, sequence and machine allocations remain unchanged.
- Red/yellow identification is independent of disposition. Every unmapped defect remains on hold.
- LQ2 reference codes must not be certified for G65/TEM by inference.
- Visual review is shared by major family; existing inspection operations remain separate.
- Storage is a handling Work Item until its physical location is confirmed; do not repurpose material storage or dispatch staging.
- Park Jongmyeong is a confirmed foreman and LOT-creation inquiry contact. Kim Younghan is the existing confirmed Julián account; retain privacy and source history. Madian handles Storage, not automatically every disposition approval.
- No deployment, messages, automatic LOT restoration, real stock change or completed repair occurs in this implementation.
- Backup first, additive migration, revision guards, idempotent retry. Preserve old Events and evidence.

## Tasks

1. `quality-routing.test.js`: fixtures asserting 35 reference definitions, red/yellow independence, three LOT cases, six routes, family Visual, named contacts, unchanged production edges and idempotence.
2. `ontology-model.js`: additive quality fields and typed `quality_reference` / `quality_case_of` relations; validate enums and object types. Preserve older stores.
3. `quality-routing.js`: `applyShared(library)` and `applyProject(project,library)`, with a guarded migration entrypoint and snapshot backup. Use existing `Model.addEntity`, `addRelation`, `ProjectStore.attachMembers`, `store.save`.
4. `quality-map.js`: `augment(project,network,layout,expanded)` returns side-only nodes/edges/positions. Six routes expand to applicable definitions and conditional targets; unique occurrence IDs prevent cross-Part placement bleed. `modelId` retains canonical detail/selection identity.
5. `app.js`, `styles.css`, `index.html`, `server.js`, `build-public.js`: use existing chips, selection and detail buttons; add quality toggles and side edges in both Production-map presentations. Progress/hourly projections stay unchanged. Shared people and Storage appear only in expanded handling context. Recompute bounds on every toggle.
6. Verify focused regressions, real HTTP browser toggle/detail/overlap/Progress isolation, migration on a backup and then real DB. Compare previous Production Step edges and Events; retry must keep revision unchanged.

**Acceptance:** Each selected LDM/TEM route has one collapsed group. Expansion shows family Visual then Storage handling, and six conditional dispositions. Clicking a route reveals problem definitions; collapse preserves main routes and shared connections. No evidence-free scrap/supplier assignments, no fabricated incident counts, no chip overlaps.
