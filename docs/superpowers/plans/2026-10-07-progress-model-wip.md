# Model WIP Progress Implementation Plan

Goal: existing process chips, coded Excel WIP input, independent model routes and observation playback.
Architecture: extend existing ontology fields/parser and project projection; reuse existing SQLite/Firestore observation stores and SVG renderer. No new dependencies or icons.

- [x] Test coded TSV, repair exclusion, duplicate names, shared-step projection.
- [x] Extend Part code fields and parser; preserve source columns/code through local/cloud saves.
- [x] Clone display nodes per Part without cloning database Steps; horizontal routes, original chips.
- [x] Add metric/comparison controls, model selection, observation/range playback and change feedback.
- [x] Run parser/store/cloud/browser tests; inspect desktop/mobile with temporary sample DB.
- [x] Document actual-code onboarding and local result; no deployment unless requested.

Actual model codes require supplied readable Excel data. Do not invent mapping or alter existing real observations. Unknown input requires explicit mapping before save.
