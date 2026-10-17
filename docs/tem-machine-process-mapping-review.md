# TEM machine/process mapping and equipment Risk review

Source: `TEM_Machine_Process_Mapping.md`, working field-note draft. User approved retaining existing steps/order and aligning equipment/process names on 2026-10-13.

## Mapping

| Document equipment | Displayed process | Existing route treatment |
| --- | --- | --- |
| Loading Machine 1 | Loading Process 1 | Unplaced TEM reference; not assumed to be Magazine |
| Rivet Machine | Rivet Process | Unplaced TEM reference; not merged with Bolt Attachment |
| Laser Machine | Laser Process | Existing step 8, original Laser Etching / Cleaning detail and stage key retained; function unresolved in new note |
| BESI Machine | LED Bonding | Existing step 11; actual asset/model/customer allocation unconfirmed |
| Loading Machine 2 | Loading Process 2 | Separate unplaced TEM reference; no guessed transfer destination |
| Plasma Machine | Plasma Process | Existing step 15 |
| Wire Bonding Machine | Wire Bonding | Existing step 16 |
| AOI Machine | AOI Inspection | Unplaced TEM reference; not substituted for Section 1 Inspection or SMT AOI |
| EOL Machine | EOL Inspection | Existing step 17; test criteria remain unknown |
| Packing Machine / Station | Packing | Existing step 19; Automatic Packing detail and stage key retained, machine/station ambiguity recorded |

Each existing BiLED/customer Part route retains all 20 step IDs and 19 normal sequence edges. No `precedes` edge anywhere in the DB was added, removed or changed. The document's 10-row order was not promoted to a standard route.

`displayProcessName` separates a consistent map label from the stable `productionStage` key used by quantity/log imports. Existing names and new labels both resolve to the same step. The basic-view allowlist includes only this safe display field; private context, History and Risk remain private.

Equipment family requirements keep their existing IDs and `requires` relations; equipment names/tiers are aligned with the note. Matching names do not merge physical equipment across BiLED, MOBIS and HELLA. No asset ID, capacity, cycle time, operator assignment or actual availability was invented.

TEM remains the existing production area/line context, not a newly invented separate building or child-line assignment. Four unplaced references are shown in full TEM views, without model or sequence links. They are hidden from Part-only views and never included in Progress quantities. Existing TEM teams and named personnel remain side context, not newly assigned station operators.

## Equipment Risk candidates

LS and MOBIS + HELLA each own 13 equipment Risk candidates and planned mitigation Work Items:

1. Breakdown / unavailable sample slot.
2. Spare-part supply / repair delay.
3. Subpart / jig / fixture mismatch.
4. Wrong program / recipe / changeover.
5. Loading / transfer motion and positioning faults.
6. Rivet feeding / tooling wear / attachment defects.
7. Laser optics / focus / program drift.
8. LED pickup / placement / tooling / bonding deviations.
9. Plasma treatment / recipe / utility deviations.
10. Wire feeding / tool wear / electrical-connection defects.
11. AOI optics / model recipe / false acceptance.
12. EOL fixture contacts / measurement verification / false pass.
13. Packing handling / container / label mismatch.

Each is directly connected to relevant equipment references/requirements and a planned mitigation. These are review candidates, not confirmed incidents. Specific installed subparts are only registered after identification; no fictitious nozzle, capillary, sensor or replacement spare was created. Scores, owners, deadlines, cleaning chemicals, settings and acceptance thresholds remain unknown.

## Press cleanliness correction

`risk-ls-press-cleanliness` directly affects only `t1-2-uplevel-press-3` and `t1-2-uplevel-press-4`. Old direct links to machines 1/2/5 and the whole Pressing process were removed. Mitigation wording/evidence now refers to 3/4.

Process details aggregate Risks from their immediate required Resources. A machine does not inherit sibling-machine Risks through its shared process. Thus Pressing details show the cleanliness Risk, machines 3/4 show it, and machines 1/2/5 do not. Absence of this registered Risk does not certify other machines risk-free.

## Local verification and rollback

DB revision after migration: 259. Pre-change backup:
`/Users/louis/Desktop/lg/mex/.local-data/ontology-before-tem-machine-mapping-1791946563953.sqlite`.

Retry leaves revision unchanged. Canonical/project validation and foreign-key checks pass. Ten non-graph data tables, existing Event/Evidence/Person/Organization/Part objects and all normal sequence edges match the backup. Layout rectangle checks find zero chip overlaps in LS/TEM and customer/TEM views.

Full-suite file-address browser startup failure was already observed before this task and is not claimed repaired. The new task tests check mapping preservation, unplaced references, old/new import labels, precise equipment Risk scope, and safe basic-view labels. Separate Chrome/local HTTP checks verify actual UI behavior against a temporary DB clone.

Existing user changes and source context remain preserved; each save is revision-checked and transactional per scope. Resolve any reported conflict before retrying. For rollback, first inspect newer user changes; use selective reversal or an explicitly authorized stopped-server restore of the named backup, never overwrite a live/newer DB blindly.

No Firebase deployment, GitHub push, private cloud upload, inventory update or actual incident/completion record performed.
