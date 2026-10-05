# Production component lineage — design draft

Status: implemented locally, 2026-10-04. G65 sample records are appended to the existing LS project, not a replacement database. This document records the approved design and its remaining uncertainties.

## Decision

Keep one `Part` identity model. Add `itemKind: product | component`. The UI displays `P` for product and `C` for component; a subassembly such as `G65 Upper RH main` is still a component. A separate `Component` entity type would duplicate the current Part workflow, import, revision, and relationship code. Text-only component lists cannot show production transformation.

The physical BOM and the process flow are distinct:

- `Part → part_of → Part` means a verified physical constituent relationship. Do not use it just to group names, or for router output whose disposition is unknown.
- `Production Step → consumes → Part` records material entering an operation.
- `Production Step → produces → Part` records the material or assembly leaving an operation. This relation already exists; it must support quantity metadata.
- `Production Step → applies_to → Part` scopes an operation to a product route. `precedes` keeps the normal step sequence; `on_failure` stays a lateral exception.
- `Production Step → requires → Resource` connects a confirmed machine or resource. Shared machine family is not proof of the same asset.

Each Part or component can carry production line (`productionFamily`), product family (`productFamily`), side (`LH`, `RH`, unknown), vertical position (`Upper`, `Lower`, unknown), and piece index. Original labels remain in the existing name/context until reviewed; do not claim an automatic alias registry. Existing object IDs stay stable. The correct displayed line name is `Nexlide`.

Material-flow relations support `quantity`, `unit`, `basis` (for example per one router input or per finished assembly), `routePartId`, evidence, and `reviewState`. Unknown quantity is blank, never zero. Material quantities are positive whole-piece counts in this first implementation. Form, CSV, reviewed AI input, SQLite persistence, and change history preserve these fields. `routePartId` ties material use to an exact product route when an operation serves multiple products.

## G65 example: facts and limits

Confirmed from PM clarification: one `G65 Main Plate RH` enters Router and yields nine physical pieces:

| Router output | Reported quantity per Main Plate RH |
| --- | ---: |
| G65 Outer | 1 |
| G65 Upper RH 1 | 2 |
| G65 Upper RH 2 | 2 |
| G65 Lower RH 1 | 2 |
| G65 Lower RH 2 | 2 |

`G65 Upper RH main` is a **component (C)**: an LED-bearing semiconductor panel. Integration joins Upper RH 1, Connector and Upper RH 2 to make this component. LAM assembly adds Black Plastic and Crystal Plastic, yielding a finished product (P); its exact part code/name is not yet identified. Integration is described by the PM but absent from the photographed G65 reference route. Keep the existing Router → LAM order; show Integration and its materials with unconfirmed order/proposed links, rather than inserting an invented sequence. The named inputs are composition, not automatically confirmed one-piece quantities.

Do not infer LH yields from RH. Do not infer what G65 Outer is used for, where the Lower RH outputs go, exact Connector identity, or current machine asset. Do not assume the unnamed finished Upper RH product is the existing `G65 main (route label)` Part record; map it only after exact SKU/variant confirmation. Existing WIP snapshots count observed units and must never be computed from the nine-piece theoretical router yield.

## Production map and controls

Keep the large, continuous process canvas and the SMT / LDM / Nexlide / TEM line selector. The Part picker is a hierarchical multi-select, grouped by line and product family. Part selection/highlight persist per project and line; layer visibility, zoom and number mode persist per project/view. `See Machines` and `See Components` default on in Production and the main process map. `Show numbers` offers None, Parts, Workers and Pending time.

Normal `precedes` steps form the prominent blue spine. Every physical input/output is an individual Component node beside its operation. Machine resources sit nearby with dashed links. These satellite nodes and their links are muted by default, becoming clearer on hover/focus/selection; they never compete with the main route. Red failure branches leave the spine sideways. Layer toggles affect only visibility and layout, never the stored process order. Canvas spacing adjusts to visible context so labels do not collide.

Machines must distinguish a reusable machine family from a dedicated asset. Show `Common` or `Dedicated` only when the Resource record establishes that mode; otherwise show `Unconfirmed`. A shared machine family may connect several routes, but it must not be displayed as one physical machine without a verified asset ID. No machine is inferred from a process name alone.

At five or six selected products, keep line/product-family routes adjacent and reserve room for the materials. Routes are never merged by similar step names or machine families. An exact Step ID appears once with all its selected Part memberships. The same Component/Resource may appear beside several operations as contextual instances of the same ID; this is not extra inventory or a claim of multiple physical assets. All five Router output types remain visible individually, including their respective ×1/×2 yield. Fit and zoom remain optional; the default does not shrink all Parts into unreadable text. Machine-overlap ordering is a future refinement, not an implemented fact.

Part/Component details expose a Workflow with input/output objects, machines, workers, quantities, basis and review state, plus a relationship map. Opening a Component traces its producing/consuming operations; opening its production map uses a recorded product route reference. A Component without that reference is not silently assigned to a product route.

## Input and review journey

1. Add or import Part records as products or components into the shared local ontology. Subassemblies remain components. Search should resolve aliases without merging distinct LH/RH or Upper/Lower records.
2. Connect each operation to material inputs and outputs; record quantity basis and evidence. Preview the transformation and reject a missing or invalid side/part match before saving.
3. Review the resulting route and component lineage. Only reviewed facts enter the DB. Local change history shows newly added items and relationships, with keep/revert support.
4. Open Production → LDM, select `G65 main (route label)`, and inspect its machines and individual Router outputs. Integration stays off the confirmed spine until its route order is verified. Other selected routes remain visible.

## Production ontology review and pending time

The current separation is appropriate: product/component identity, reusable operation definition, resource definition, worker/role assignment, and observed events remain different objects. Do not store machines in the Part tree, workers as Resource, router yield as WIP, or scanned occurrences as new operation definitions. The map is a projection of these typed relationships, not the database itself.

The source facts are incomplete. New RH/LH Upper/Lower product placeholders have no fabricated routes; G65 Outer disposition, LH yield, Lower assembly route, exact final SKU and dedicated machine asset IDs remain unresolved. No factory floor positions, live machine utilization or confirmed staffing count can be derived from those labels alone.

`Production → Process logs` adds a minimal paste/review/save adapter; a final vendor log format is deliberately not fixed. Existing Evidence and Event objects are used instead of a separate unsynchronized database:

- Evidence: `rawLog`, `recordedAt`, name/context. The original pasted text is retained locally, attached to its Part with `supported_by`.
- Event: `productionEventKind` (`arrived`, `started`, `completed`, `failed`, `held`, `released`), `occurredAt` with timezone, `traceId`, `traceKind` (`unit` or `batch`). A reviewed Event records_on exactly one Part and one Production Step and is supported_by its source Evidence. Additional machine links are allowed but do not define the Part/Step pair.
- A temporary CSV/Excel-paste adapter recognizes `trace_id, step, event, timestamp`. Unique Part-specific operation names, stages or IDs can match; ambiguous operations and invalid timestamps require review. Any other text can be saved raw without invented events. The adapter can later be replaced with the real format.
- Saving appends reviewed rows, skips exact duplicate events, and uses the existing SQLite transaction/history/Continue/Revert mechanism. Detailed scan Events do not flood the main process map or Gantt. They remain visible in Records, sources and relationship details.

Pending time means a **measured closed interval**, not a live stopwatch: arrival → start for the same Part, trace kind, trace ID and operation. If arrival is absent, a recorded previous-operation completion → next start can be used only across a confirmed `precedes` link. That fallback is an inter-operation gap and may include transport; its basis remains visible, not misrepresented as pure queue time. The map displays the median and the number/source basis in the tooltip/details. Open waits, missing IDs/timestamps, unconfirmed order and negative/reversed pairs do not produce guessed durations. Repeated arrival scans do not shorten the first recorded wait; failed retries do not reuse an old completion twice. Date filters currently use the ending event's normalized UTC date.

This first version is not a MES replacement: no serial-to-batch split/merge inference, component-to-finished-unit trace conversion, shift calendar subtraction, downtime categorization, live elapsed time, or automatic unstructured-text extraction is claimed. These can be added after real logs and identity rules are supplied.

## Verification targets

1. Extend Part classification and material-flow relations, validators, import format and change history without migrating or replacing existing IDs.
2. Preserve the existing G65 route and individual RH material links; keep final SKU and Integration order unresolved.
3. Extend the current map projection with optional component and machine satellites. Add the two controls and persist them per project/line.
4. Extend Part/component details and verify: nine theoretical RH router outputs; no invented LH or asset links; five/six selected routes still readable; normal route stays straight; NG storage stays lateral; WIP is not confused with output yield; settings survive re-entry; undo/history remains safe.

Mockup: [large component map](production-components-map-mockup.svg).
