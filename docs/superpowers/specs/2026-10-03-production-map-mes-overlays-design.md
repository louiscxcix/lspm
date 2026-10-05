# Production map and MES count overlays — design

Date: 2026-10-03. Scope: local PM Process Twin only. Status: proposed for user review.

## Job and current state

One PM needs to read an LS project's complete production route, compare several Parts at once, see failure paths and dependencies, and check current unit and worker counts without confusing unknown data with zero. The existing LS project has 13 Parts and 69 Production Steps. The Production lens currently reduces Parts to summary nodes and switches to one Part route; the separate Production map hides subprocesses until expanded. Both defaults conflict with this job.

The screenshot is a MES-style matrix: each row identifies a product/model and each process column contains a WIP unit count. It is an example of shape, not an attached workbook or a verified live inventory. It contains no worker allocation or machine occupancy records.

## Decisions and alternatives

Use one all-visible, structured canvas with metric overlays. A raw ontology graph would show every object/edge but become illegible. Separate Part pages would be legible but hide shared equipment and cross-Part dependencies. The selected design preserves all relevant nodes on one page, while controlling *which relationship lines and metrics are emphasized*.

Celonis separates activity and connection coverage and offers a multi-object subway-style projection. Camunda uses lanes for responsibility and path highlighting for navigation. Adapt those display ideas, not Celonis's event-frequency or throughput metrics: this app has planned routes and occasional MES snapshots, not a complete event log. Sources: [Celonis Process Explorer](https://help.celonis.com/cpm46/en/process-explorer), [Celonis multi-object update](https://community.celonis.com/product-updates/support-for-object-centric-process-mining-in-process-explorer-2023-08-11-3447), [Camunda lanes](https://camunda.com/bpmn/reference/), [Camunda landscape navigation](https://docs.camunda.io/docs/components/modeler/web-modeler/process-landscape-visualization/).

## Canvas behavior

### Production view

- The default shows every project Part, including Parts with no linked route; no summary-card prerequisite. Multi-selecting Parts keeps **all selected routes on the same canvas**, never a Previous/Next carousel. A fixed left rail labels each Part; a route-less lane says “No linked steps”. Normal stages run left to right within each recorded route. Substeps remain visible beneath their parent stage; exception and rework routes sit in a separate tinted strip within that same Part lane. Unsequenced steps remain in an explicit “Order unconfirmed” strip rather than being placed into an invented route.
- A Production Step shared by multiple Parts may have multiple *visual instances* in their lanes, each referencing one canonical object ID. The detail panel names all linked Parts. No new ontology object is created by the projection.
- Parts, stage names, normal `precedes` arrows, `on_failure` and `rework_of` branches remain visible. Resource and worker/role associations appear as compact, readable step annotations. Selecting a step or machine highlights its full recorded neighborhood and dims unrelated annotations/lines; it does not delete or fold process nodes. A shared machine is displayed once in a shared-resource rail or detail view, with links to its steps on selection.
- The toolbar has Part multi-select, search, a process-path Focus control, and an adjacent **Show numbers** control: `None`, `WIP at process steps`, `WIP at linked machine steps`, `Workers at process steps`, `Workers at machines`. This keeps topology focus and metrics distinct while placing both together. All Parts selected by default in the Production lens. View choice, selected Parts, zoom, date, and snapshot persist per project.
- Metric labels include unit, snapshot date/shift and provenance. `—` means unrecorded; `0` means measured zero. A machine linked to a counted step can display “WIP at linked step”, **not** “units inside machine”. Do not total the same units across several steps or assign a stage's WIP to every compatible machine. Where the machine cannot be identified uniquely, show the step count and “machine attribution unknown”.

### Whole-project and other workstream views

- Replace summary-only default with an all-visible workstream canvas. The six existing workstreams become clearly named lanes. Sequence/dependency lines cross lanes where recorded. Objects assigned to multiple workstreams remain one canonical object; the view marks secondary memberships. An explicit Unassigned lane prevents silent omission.
- Keep the same model for Commercial, Engineering, Purchasing, Quality/APQP and Logistics. These lanes show their actual process objects and context, not empty template steps. Filters may dim unrelated links or select a subset on request, but the starting view shows all recorded process nodes. Context-heavy relationships such as stakeholder affiliation are revealed on selection or via a connection layer; normal sequence and risk/blocking links remain legible.
- Fixed node positions across metric/filter changes, search-to-highlight, fit/zoom, visible legend, and a compact overview/mini-map prevent disorientation. On narrow screens the map scrolls horizontally; labels remain readable instead of shrinking the entire graph to fit. Keyboard selection and a text list provide access to the same objects.

## Production Excel input

- Add a clearly labeled **Add Excel data** action in Production. It opens the existing WIP snapshot flow; no duplicate import engine. Only production MES unit counts are supported now. Other workstreams and ontology-structure Excel imports are out of scope.
- Accept `.xlsx` up to the current 10 MB limit. Detect sheet and header from the product/Part column (including `PJT명`) and process columns; allow manual sheet/header/Part-column correction. Preview row count, stage columns, product codes, quantities, zero versus blank, invalid cells, and match confidence before Save. Do not infer a Part or Step match from a similar name alone when more than one candidate exists.
- Map source product row to a project Part and source process column to that Part's Production Step. Provide explicit per-Part/stage review for ambiguous or unmatched mapping. Exact unique matches may be proposed, but the PM must confirm the preview. Keep raw row/column labels and unresolved counts in the snapshot; unresolved counts appear in an “Unmapped MES data” list, not on a guessed step.
- Save a new dated, immutable snapshot in the local SQLite DB. Do not overwrite earlier snapshots or modify ontology route objects. The map defaults to the newest saved snapshot, with a selector for older dates. Preserve source filename, sheet, row and column references so a displayed metric can be traced back. The current JSON export includes normalized counts; raw `.xlsx` bytes are not archived.
- Invalid workbook, non-whole or negative counts, stale revision, and bad mappings fail without partial writes. Blank stays unknown; numeric zero stays zero. The existing latest-save review/revert behavior covers the import.

## Worker counts

The existing `staffing_counts` records dated observed/planned workers per Part. It is **not** evidence of workers per Step or machine. Add dated manual observations targeted to a Production Step or Resource, with count, shift, observed/planned basis and note. Display each target's latest matching observation; do not sum Part, Step and machine observations or count named stakeholders as shift headcount. Until entered, show `—`/“not recorded”. A future worker-allocation Excel can use a separate reviewed import; the MES screenshot alone does not authorize such counts.

## Acceptance checks

1. Opening LS Production immediately shows all 13 recorded Parts and all linked normal/sub/problem steps on one canvas; selecting three Parts shows all three routes together. Unknown sequence is labeled, never guessed.
2. Whole-project and Logistics views show their recorded process nodes by default, not only summary cards. Cross-workstream links remain traceable.
3. Uploading a synthetic MES workbook produces a preview before DB write. A saved value of `0` displays as `0`; a blank displays `—`; an ambiguous stage stays unmapped until reviewed. Old snapshots remain selectable and reversible through the existing latest-save flow.
4. Focus/Show numbers switches between route and WIP/worker overlays without moving nodes. Step WIP, machine-linked step WIP and direct machine worker counts are labeled distinctly. Missing worker data never appears as zero.
5. Desktop and mobile browser checks cover large routes, scrolling, search, selection, keyboard access, and local DB persistence. No Firebase deployment or real MES numbers are implied.
