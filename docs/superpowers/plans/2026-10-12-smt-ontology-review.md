# SMT hourly and ontology review implementation

Approved: production day 07:00–next 07:00; remove range/narrative/empty map clutter; reuse canonical G65 PCB in simulated observations; show full SMT relationship map with people/equipment; targets are floor(3600 / seconds-per-PCB * 0.85).

- [x] Regression tests for canonical demo identity, retained contacts/equipment and 06:00 previous-day grouping.
- [x] Versioned model Unit Time standards saved through local/cloud revision transactions. Original observations and input targets remain unchanged; calculated goal is a separate display. Missing Unit Time stays unknown. Test covers cloud 6→7→6 correction and future effective dates.
- [x] Unwanted range, generic narrative, extra table and map footer hidden. Full SMT relationship map remains below charts. G65 PCB sample uses its canonical ID, not a fabricated Part.
- [x] Confirmed Line 1/2 and five PCB identities registered from IMG_4149.HEIC. Existing stakeholders retained. No machine, process order, cycle-time value or downstream finished-product mapping fabricated.
- [x] 146 tests pass; desktop/mobile screenshots inspected. Scoped SMT baseline and viewer graph refreshed while preserving existing viewer passwords and published observations. Hosting deployed; live hourly.js/hourly-view.js hashes match the build. Private chat records not uploaded.
