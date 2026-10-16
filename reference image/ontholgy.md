# WIP and production monitoring — ontology and feature draft

Status: **new proposed feature; reference only, not implemented**.

Owner-editable notes based on the two screenshots supplied in chat. Related existing implementation: [`ontology-model.js`](../ontology-model.js), [`wip.js`](../wip.js), [`production-logs.js`](../production-logs.js), and [production component design](../docs/production-components-design-draft.md).

## Purpose

Show what each production line is doing, where material is waiting, how much has been produced against plan, and whether the shift is likely to meet its target. Keep observations, plans and predictions distinct.

## Proposed screens

### 1. Operations overview

- A grid of production-line cards, with a consistent summary and drill-down into the line's processes.
- Line summaries for observed WIP, target/actual production, attainment and forecast where sources support those metrics.
- Process cards showing recorded status, production counts and relevant material observations.
- Recorded loss categories for people, machine, material and method; no category inferred solely from an output shortfall.
- Visible snapshot/source identifier, capture time, freshness and language selection.
- Navigation references: operations overview, process WIP, WIP surplus/idle forecast, material balance, recheck, daily production, hourly production, target attainment and production loss.

The reference labels AA1 Line, Bottom TLA 1Line, EOL Test 1Line and Vehicle TLA 1Line are examples from the screenshot, not confirmed mappings to existing ontology IDs.

### 2. Hourly production

- Filters for production date/shift, line, process and a specific machine or the whole process.
- Summary cards: actual output, target through the observation time, difference and attainment.
- Separate summary cards: forecast end-of-shift output, full-shift target, forecast difference and forecast attainment.
- Hourly actual-output bars with an hourly target line.
- Cumulative actual and target curves; a forecast curve beginning at the observation cutoff.
- A clear distinction between completed intervals, an incomplete current interval and future intervals.

Do not copy the screenshot's future zero bars into stored actual observations. Future output is unknown until measured.

## Existing ontology to reuse

| Concept | Existing representation | Meaning |
| --- | --- | --- |
| Project | Project plus selected library objects | Scope of the monitoring view |
| Product/component | Part or Part Revision | Exact product identity; retain variant and component distinctions |
| Operation | Production Step | Reusable operation definition, not an individual scan |
| Production line | Resource with `resourceKind: line` | A recorded line identity; no inferred physical layout |
| Machine | Resource | Distinguish machine families/shared pools from specific assets |
| Operator | Person and Assignment | A recorded role/assignment; not an inferred headcount |
| Process order | `precedes` between Production Steps | Confirmed route order |
| Product route | Production Step `applies_to` Part | Product-specific operation membership |
| Equipment needed | Production Step `requires` Resource | Confirmed equipment relationship |
| Material transformation | `consumes` / `produces` | Inputs/outputs with quantity and basis; theoretical yield is not WIP |
| Process occurrence | Event with `records_on` links | Arrived/started/completed/failed/held/released observation |
| Source | Evidence and retained source records | Workbook, log or reviewed note supporting a fact |
| WIP snapshot | Existing WIP snapshot/count tables | Observed units at a dated Part/process mapping |
| Worker observation | Existing staffing tables | Recorded/planned headcount for a Part, Step or Resource |

The current model does not yet define a complete hourly production-target, shift-calendar, downtime or forecast schema. The candidate records below require implementation and validation before they can be saved as supported ontology objects.

## Proposed records to add

### Production output observation

Record project, source identifier, date/shift, interval start/end with timezone, Part, Production Step and optional exact machine ID. Include quantity, unit, measurement basis and recorded time.

The measurement basis must identify whether the source is an interval quantity or a cumulative counter. Record counter resets/replacements explicitly before calculating interval output. Distinguish good output, rejected output and total processed units when available. Never add machine totals and process totals together if they describe the same production.

### Production target

Record project, product/process scope, optional line or exact machine scope, applicable shift/interval, quantity, unit, version and source. Process targets stay at process scope unless an explicit machine allocation is supplied.

The hourly target and full-shift target must come from the same reviewed plan/version, or the UI must identify their different bases. Retain earlier plans for historical comparisons.

### Shift calendar

Record the site's timezone, shift start/end, working intervals, breaks and exceptions. Support shifts crossing midnight. Use a stable production-date convention; do not assign an overnight interval to a different shift merely because the calendar date changed.

### Status/loss observation

Record resource/process, observed start/end or capture time, status/reason, source, quantity/duration where measured, and review state. Unknown or stale status stays unknown. Missing scans do not prove downtime, idle equipment or material shortage.

### Forecast result

Record calculation method/version, observation cutoff, input source IDs, calendar/target version and predicted output. A forecast is derived information, not an actual production Event.

An initial pace forecast could use observed output divided by elapsed working time, multiplied by total shift working time. Implement it only after defining how partial intervals, stops, breaks, missing data and changing product mix are handled. Missing inputs produce an unavailable forecast instead of an invented value.

## Metric definitions for review

| Metric | Proposed definition |
| --- | --- |
| Actual output | Validated interval output summed within the selected scope; state whether good or total units |
| Elapsed target | Reviewed planned quantity through the observation cutoff, using the selected shift calendar |
| Actual difference | Actual output minus elapsed target |
| Actual attainment | Actual output / elapsed target × 100; unavailable when target is absent or zero |
| Full-shift target | Planned quantity over the complete selected shift |
| Forecast difference | Predicted end-of-shift output minus full-shift target |
| Forecast attainment | Predicted end-of-shift output / full-shift target × 100; unavailable when target is absent or zero |
| WIP | Observed units at a specific Part/Step and capture time; not cumulative completed production |
| Pending time | Existing measured arrival-to-start basis, or explicitly identified inter-operation gap; not a live waiting clock |
| Material balance | Requires a defined boundary and compatible opening/closing inventory and input/output quantities; unresolved until source and units are specified |

## Reference discrepancies to resolve

The hourly screenshot's summary shows a full-day target of **17,300**, while the cumulative chart labels the target **19.8K**. Do not pick one silently. Confirm whether this is a different scope, plan version, calculation or a reference-screen defect.

The screenshot says process-level Excel targets are not distributed to individual machines. Preserve this rule unless the owner supplies explicit per-machine plans.

Screenshots do not establish actual source column names, freshness guarantees, production calendars, loss rules or a reliable forecast method. Transcribe no small/unclear labels as verified facts.

## Acceptance checklist for future implementation

- [ ] Confirm source workbook/log samples, identifiers and authoritative target plan.
- [ ] Map Part, process, line and machine identities without merging similarly named objects.
- [ ] Define quantities, units, scope and whether observations are interval or cumulative.
- [ ] Define shift timezone, breaks, overnight dates and observation cutoff.
- [ ] Resolve the screenshot's target discrepancy.
- [ ] Keep observations, targets and forecasts separate in storage and UI.
- [ ] Preserve blank/unknown versus recorded zero.
- [ ] Prevent double-counting across Parts, process totals and machines.
- [ ] Retain source references, revisions and historical snapshots.
- [ ] Support project access controls and safe change review/import behavior.
- [ ] Verify whole-process versus machine filtering and large-screen/mobile layouts.
- [ ] Verify hourly bars, cumulative curves and forecasts against a reviewed dataset.

## Owner updates

Add the confirmed data source, desired navigation location, metric definitions and implementation priority here. This draft is intentionally editable and does not alter existing production records.
