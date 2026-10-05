# Highlight Part audit — LS

Scope: local SQLite revision 9; 17 product Parts, 62 projected production nodes, 45 machine/component satellite occurrences. Read-only investigation; no app or database fixes applied.

## Confirmed findings

1. Satellite nodes and their connecting lines test only `relation.routePartId`. Machine `requires` relations have no such field, so unrelated machine occurrences remain undimmed. Materials without routePartId behave the same way. The correct scope must also include the owning production step (`item.stepId`) and that step's route membership. With G65 main highlighted, 27 unrelated satellite occurrences remain undimmed.
2. Changing Highlight Part preserves the previously selected object and open inspector. Main nodes combine route highlighting with the selected object's neighborhood. A correct G65 step can therefore be faded by an unrelated prior selection. The `selected` class also remains on every occurrence of the selected shared machine. These are different states that currently compete visually.
3. Seven product Parts have no recorded production steps. Highlighting them fades all process nodes while leaving 32 unrelated satellite occurrences undimmed. Missing routes need an explicit empty-state message; no route should be inferred from name similarity.
4. Cards display only the generic productionStage and route count. Ten separate Visual inspection steps, ten EOL steps, and ten Packing steps have identical visible labels. Full Part names exist in titles/accessibility labels but are absent from the visible cards, making route identification difficult.

## Screenshot claim

`ls-step-lq2-primary-visual` belongs only to `LQ2 primary light source`. It is not assigned to G65 main in the DB or production projection and should receive `route-muted` when G65 main is highlighted. No G65-to-LQ2 `applies_to` or `precedes` relation was found. The supplied screenshot does not establish that this main step was incorrectly classified; the confirmed satellite/selection-state issues explain unreliable visual emphasis. Browser-state reproduction would be needed to attribute that exact observed card.

## All Part highlight states

Counts below are distinct recorded normal steps and unrelated satellite occurrences that the current render predicate leaves undimmed. Satellite occurrences are counted by their placement next to a step, not unique machine assets.

| Part | Normal steps | Unrelated satellites left undimmed |
|---|---:|---:|
| LQ2 LWR | 7 | 28 |
| LQ2 OPT | 7 | 27 |
| LQ2 primary light source | 6 | 30 |
| LQ2 STD | 4 | 30 |
| T1-2 Base | 3 | 31 |
| T1-2 Uplevel | 6 | 29 |
| T1XL | 8 | 26 |
| G65 Cornering | 5 | 30 |
| G65 Jewelry Piece | 0 | 32 |
| G65 Lower LH | 0 | 32 |
| G65 Lower RH | 0 | 32 |
| G65 main (route label) | 9 | 27 |
| G65 Side Marker | 5 | 30 |
| G65 SL Lower | 0 | 32 |
| G65 SL Upper | 0 | 32 |
| G65 Upper LH | 0 | 32 |
| G65 Upper RH | 0 | 32 |

Single-Part projections and all-Part node memberships agree for every recorded route. Shared NG storage and Scrap are legitimate members of the ten existing routes. Their return edges must remain tied to the original failed step; a shared NG object does not make other Parts' production steps part of the selected route.

## Recommended correction

- Use one route-membership predicate for activities, satellite occurrences, and connecting edges in both production views.
- Scope a satellite first by its owner step, then by material routePartId when present. A shared machine may belong to several routes, but each on-map occurrence belongs to its owner step.
- Make object selection and Part highlighting visually distinct. Clear unrelated object selection when switching Part, or keep it without suppressing the selected Part's route.
- Show a short Part identifier on generic process cards, retaining the full name in details.
- Show “No recorded route” for the seven Parts without steps. Do not invent routes.
- Verify all 17 highlight states with both maps, shared/dedicated machines, component layers, no-route Parts, and prior object selections.
