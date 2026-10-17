# TEM production ontology review

Reviewed: 2026-10-06 (America/Mexico_City).
Source: TEM_Production_Process_PM_Master_Note_v0.1.md.
State: applied to the local shared database on 2026-10-06. HELLA and Mobis are separate projects; the empty TEM project is archived. BiLED and the provisional SMT knowledge route remain Library-only.

## 1. Boundary and shared database

HELLA · P768 A-2 and Mobis · BL7m PE P use the existing shared SQLite workspace, not separate databases. Their models, customer, allocated line and planning activities are attached explicitly. LS memberships remain unchanged. The earlier empty TEM project is archived, not deleted.

The new project is not an ontology object. Future approved objects will live in the shared Library; project membership will decide what TEM displays. Production route knowledge is reusable. Quantity, delivery target, readiness and project-specific scheduling belong to the production campaign/project context, not to the reusable route itself.

## 2. Candidate objects

| Concept | Existing ontology type | Modeling rule |
|---|---|---|
| TEM production area | Resource, resourceKind=line | Review existing TEM identity before reuse; no automatic link now |
| TEM Line 1 / Line 2 / Line 3 | Resource, resourceKind=line | Children of TEM; keep separate from top-level factory SMT line |
| Mobis / HELLA / Flex-N-Gate | Organization | Customer candidates; reconcile existing IDs before adding |
| P768 A-2 / BL7m PE P / BiLED | Part, itemKind=product | Distinct products; no invented revisions or LH/RH variants |
| Purchased PCB, small routed PCB, solder paste, mounting components, double tape, metal heatsink, LED, wire, bolts | Part, itemKind=component | Exact specifications, counts and BOM remain unknown unless stated |
| Material states after routing, heatsink attachment or bonding | Part, itemKind=component | Add separately only where actual tracked identity is established; do not invent intermediate SKUs |
| QR marking / SPI / Router / Reflow / EOL etc. | Production Step | Process identity is separate from physical equipment |
| Equipment for verified automated operations | Resource, resourceKind=machine or test_equipment | Machine family requirement initially; asset/model/number unknown |
| Shared BiLED Horno and Cooling | Resource | Shared use recorded; exact physical equipment count unknown |
| CAD, drawing, BOM, production data, program, inspection specification | Deliverable | No file attachments, revisions or approvals assumed |
| Five readiness reviews | Gate | Planned gate templates, not passed gates |
| Schedule activity | Work Item | Project-scoped activity, separate from reusable step definition |
| Planned sample quantity | Build | 75 pcs / 600 pcs are planned quantities, not WIP or completed output |
| Setup/readiness and traceability uncertainty | Risk / Requirement | Potential concern, not an incident or confirmed defect |
| Source note and user confirmations | Evidence | Track provenance and confirmed/observed/verify status |

No workers or supervisors are named in this note. Do not assign existing TEM personnel to stations without confirmation.

## 3. Candidate typed relationships

- `part_of`: line hierarchy and confirmed product/component hierarchy. Not a substitute for BOM quantity.
- `applies_to`: Production Step to relevant product.
- `precedes`: recorded route order. A planning dependency does not prove a physical machine connection.
- `consumes` / `produces`: step to input/output Component or finished Part; quantities only when explicitly known.
- `requires`: step to equipment requirement; manual operations are not assigned a fictitious machine.
- `operated_in`: step to confirmed production line. Flex-N-Gate BiLED line allocation remains unassigned.
- `controls` / `characteristic_of`: reuse only after the actual inspection characteristic is defined.
- `potentially_affects`: candidate risk to affected step or planning activity.
- Evidence links must preserve the source statement and its uncertainty.

Before import, validate each relation against the current model's allowed source/target types. Do not introduce new relation types just to copy the source diagram.

## 4. TEM SMT route draft

External PCB (C) → Material Input → QR Marking → Solder Paste Printing → SPI → Pick & Place → MOI → Conveyor / Distribution → Reflow Oven → Conveyor / Buffer + Cooling → AOI → SMT Finished PCB (C).

The source presents this as current understanding and also asks to verify the standard sequence. Keep the route provisional; do not label all edges confirmed.

- Printing requires CAD/program data and consumes solder paste; pattern details unknown.
- Pick & Place consumes mounting Components; component identity/count unknown.
- MOI abbreviation, criteria and difference from AOI unknown. Do not expand the abbreviation.
- Reflow joins mounted Components to PCB; temperature/time/profile unknown.
- QR contents and later scan points unknown.
- SPI/AOI thresholds and NG destinations unknown. Do not add an automatic NG Storage/Scrap route.
- Line 1 and Line 2 may use a similar template, but equipment interchangeability is not established.
- TEM SMT output must remain distinguishable from the existing factory SMT output placeholder until identity is reviewed.

## 5. Flex-N-Gate BiLED route draft

Magazine → ICT → Automatic Router → Automatic Tray Loading → Remove PCB from Tray → BiLED Heatsink Assembly → Section 1 Inspection → Bolt Attachment → Laser Etching / Cleaning → Tray Change → Remove from Stack → LED Bonding → Horno → Cooling → Section 3 → Plasma → Wire Bonding → EOL Inspection → Final Area → Automatic Packing.

Recorded material transformations:

1. Router consumes Big PCB and produces smaller PCB. No yield/count is provided.
2. Heatsink Assembly uses small PCB + double tape + metal heatsink. No adhesive specification or quantity is provided.
3. Bolt Attachment consumes bolts, quantity and torque unknown.
4. LED Bonding uses the LED/BiLED input and main assembly. The exact naming/BOM boundary must be confirmed before generating component IDs.
5. Wire Bonding adds electrical wires/connections; counts unknown.

Keep Laser Etching / Cleaning as one provisional observed label until it is known whether these are separate operations. Section 3 and Final Area are observed route labels, not invented tests.

Horno ~2 hours and Cooling ~30 minutes are observed nominal durations. They are not measured pending time, fixed cycle time or release specifications. Shared Horno/Cooling are confirmed shared resources; do not merge the BiLED Horno with the SMT Reflow Oven.

Automatic Packing: observed 5 trays per cycle. Record unit=tray/cycle, not five products; parts per tray unknown.

## 6. Sample-production planning draft

| Campaign | Product | Customer | Planned quantity | Line | Planning sequence |
|---|---|---|---|---|---|
| HELLA sample | P768 A-2 | HELLA | 75 pcs | TEM Line 2 | Setup → Main Process 10/12–10/17 → Inspection → Shipment 10/20 |
| Mobis sample | BL7m PE P | Mobis | 600 pcs | TEM Line 1 | SMT 10/12–10/16 → Main Process 10/17–10/21 → Inspection → Shipment 10/23 |

User confirmed 2026 on 2026-10-06. Planning dates now use ISO year 2026. Inspection/shipment wording does not establish a separate inspection start date or time of day. Planned quantities remain explicitly labeled in Build records, not represented as live WIP.

Mobis SMT completion by 10/16 is the stated prerequisite for 10/17 Main Process. HELLA Line 2 setup is the stated prerequisite for 10/12 production. Neither status establishes actual completion, capacity or acceptance.

Line 1: readiness unverified, action=confirm with SMT. Line 2: setup still in progress. Line 3: unnamed new project, no fabricated route/product/customer. Earlier Magna/Flex-N-Gate line allocations remain separate unresolved statements.

## 7. Readiness templates

Data Ready; Material Ready; Machine / Line Ready; Sample Run; Planned Production.

All start as unchecked/planned, not failed or approved. Drawing/CAD/BOM/program/inspection specification and reference sample are required evidence candidates. Approval authority, storage location, program owner and final release authority are unknown.

## 8. Map behavior after future approved attachment

TEM project: two distinct knowledge routes (SMT and BiLED), with sample planning activities separated from physical flow. Normal routes are clear; machines and Components beside their steps. Shared resources remain single objects. No speculative failure/return paths or worker assignments.

Global Library: approved objects become available to all projects. TEM-specific line labels must not collide with factory SMT. Existing groups, Parts and routes are unchanged now.

## 9. Next confirmations before connecting data

1. Date year confirmed as 2026.
2. Supplier source confirmed as Starpro SMT; stored as a distinct source line, not merged with internal factory SMT. Applicability of the detailed SMT template to the supplier's actual route still requires verification.
3. BiLED product code and production-line allocation.
4. MOI meaning and verified SMT route.
5. Equipment identity/shared-pool membership and exact inspection requirements.
6. Material specifications/yields, NG disposition and named role assignments.

Unresolved questions block asserting the corresponding facts as confirmed, not the recorded planning dates or separate customer campaigns.
