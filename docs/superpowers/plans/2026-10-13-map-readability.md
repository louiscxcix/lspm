# Process map readability implementation plan

**Goal:** Fold related product families and teams in whole maps; show only selected Part routes in independent straight rows.

**Architecture:** Reuse MapGroups and the existing SVG chips. Keep grouping and filtering as view projections, not ontology mutations. Recompute group bounds after toggles; preserve recorded cross-group relations and canonical detail IDs.

**Tech Stack:** Existing browser JavaScript, SVG, node:test, headless Chrome. No new dependencies.

## Constraints

- No database entity/relation changes or Git push. User subsequently authorized Firebase deployment and existing private/scoped snapshot synchronization.
- Group people using confirmed member_of relations; ambiguous memberships stay outside a team group.
- Keep unknown sequence separate, never invent precedes relations.
- Preserve quality expansion, multi-selection, details, History and Progress/hourly projections.
- Whole project, Global Library and both production renderers must use consistent group controls.

## Tasks

- [x] Add failing fixtures in map-readability.test.js: selected G65 does not pull an unrelated Part from shared Storage, unrelated line staff is absent, shared machine does not add other routes, team folding preserves external links, group rectangles and chips do not overlap, selected routes have horizontal main spines.
- [x] Restrict workflow.js productionNetwork context for an explicit Part subset: derive lines from selected routes, add only route-related storage/materials and bounded stakeholder relationships. Preserve full-line references when no strict subset is selected.
- [x] Extend map-groups.js with confirmed team grouping, grouped network layout and selected-Part row layout. Keep canonical IDs for selection/detail, occurrence IDs for repeated shared steps.
- [x] Integrate existing app.js renderers and delegated group toggles, scoped view settings, frame rendering and horizontal edge ports. Keep Progress and hourly mode unchanged.
- [x] Run node --test map-readability.test.js plus existing map-groups, components, production-scope, quality-map, process-side-layout and progress tests.
- [x] Exercise whole/project/production maps in a real HTTP browser fixture: fold/reopen, only-Part filter, shared machines, quality expansion, details and multi-selection. Check runtime errors and overlap.
- [x] Document verified scope, deploy Hosting, synchronize private/scoped snapshots, verify live password-protected LS view. Preserve credentials and no GitHub push.
