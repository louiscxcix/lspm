# Model hourly production implementation

Goal: Apply the approved variable-target mockup to SMT, retaining project-level feature settings and existing process maps.

Architecture: Reuse hourly_records JSON storage, revision transactions and correction history. New records use measurementKind=model and partId; old step records remain readable but excluded from model analysis. No ontology routes or WIP/History are changed.

Stack: Existing vanilla JS/SVG, Node.js and SQLite. No new dependency.

- [x] Test model-only validation, variable targets, missing versus zero, overlap, cumulative totals, legacy isolation and correction persistence.
- [x] Add model-only validation and model-series aggregation to hourly.js. Keep legacy interfaces for old records.
- [x] Replace process-chip quantity overlays with a model/day analysis above the unchanged context map: paired hourly bars, cumulative lines, model selection, time/range selection and inline reason detail.
- [x] Keep sample models in memory, with varied targets and explicit synthetic labels. No new input structure or production records inserted.
- [x] Verify browser interactions, mobile overflow, feature toggles, restoration, empty/loading/error states and serial regression suite. No deployment requested.

Data rules: target 0 has no ratio; missing is not 0. Totals require complete comparable records. Unscheduled production is shown separately from comparable attainment. Reported reasons are never inferred. New model records cannot carry process-specific quantities. Corrections append and preserve superseded plans.
