# Sample Checksheet PDF and Native Fullscreen Implementation Plan

**Goal:** Tailor English sample preparation to the selected model and existing risks, print the current checklist with model/date/quantity/notes, and provide actual browser fullscreen for both map views.

**Architecture:** Retain the immutable v1 questions and append-only preparation store. New v2 runs use a fixed, versioned 15-question profile selected from confirmed project/model IDs. Display current Risk references separately from saved evidence; distinguish directly linked risks from project-level references and additional review suggestions. Use an isolated print document with the same checksheet styles and the native Fullscreen API with an explicit viewport fallback.

**Tech Stack:** Existing vanilla JavaScript, Node test runner, SQLite JSON records, Chrome CDP, Firebase Hosting. No new dependencies.

## Global Constraints

- Keep existing saved v1 runs readable and editable without changing their questions.
- Keep project passwords, access rules, History, production uploads and all existing ontology connections unchanged.
- New evidence starts unknown; proposed risks are not incidents, assignments or production approvals.
- T1-2 uses internal PCB; cleaning risk applies only to Pressing 3 and 4.
- SMT PCB models are not finished products; unidentified equipment and source links stay unconfirmed.
- Keep the current visual design; allow A4 PDF output with model, Mexico City date, sample quantity, short notes and answer evidence.
- Native fullscreen must synchronize Escape/browser exit, restore zoom and keep the relevant map controls usable. Only a map and its controls are shown.
- Do not commit/push the dirty checkout or publish private data to public Hosting assets.

## Task 1: Versioned model-specific checksheets (main agent)

Files: `sample-preparation.js`, `sample-preparation-view.js`, `sample-preparation.css`, associated domain/store/cloud tests.

- [ ] Add failing tests for v1 compatibility, 15-question profiles, confirmed model IDs, metadata validation/sanitization and risk applicability without graph mutation.
- [ ] Add `questions(sheet)`, `profileFor(project, partId)` and `riskReview(project, partId)` to the existing domain. V2 optional metadata is `sampleDate` (ISO date), `sampleQuantity` (null or positive safe integer), and `memo` (at most 1000 characters). Validate both template versions and preserve v1 output shape when metadata is absent.
- [ ] Select the profile on a new unsaved run's model change, preserve answers by stable question ID and forbid changing saved run/model/profile identity in both local and cloud stores.
- [ ] Show 15 English questions, current linked/project-reference risks, additional review labels, and model/date/quantity/memo fields using the existing form design. Add a closing reconciliation question; do not auto-complete answers.
- [ ] Run `node --test sample-preparation.test.js sample-preparation-store.test.js cloud-preparation.test.js`.

## Task 2: Printable checklist (main agent)

Files: `sample-preparation-view.js`, `sample-preparation.css`, browser test extensions.

- [ ] Test isolated print output, escaped text, full multiline evidence, selected statuses, viewer read-only printing and no database writes from printing.
- [ ] Add a Print / Save PDF button. Build a read-only print document in a temporary same-origin iframe using the checksheet stylesheet, not the full application page; include a draft marker if unsaved. Use browser Save as PDF and remove the iframe after printing.
- [ ] Render representative output through Chrome printToPDF, render pages as PNG and inspect layout and metadata.

## Task 3: Native map fullscreen (delegated, disjoint files)

Files owned by implementer: `app.js` fullscreen controller section only, `styles.css` fullscreen rules only, `map-fullscreen.test.js` (new); helper script only if needed. Do not edit the checklist or asset build pipeline.

- [ ] Write a failing test that the actual map panel becomes `document.fullscreenElement`; include native exit, failure/unsupported fallback, zoom restoration and both overview/production panels.
- [ ] Replace CSS-only toggling with native `requestFullscreen()` / `document.exitFullscreen()` and `fullscreenchange` synchronization; preserve a clearly labelled viewport fallback and show an exit control. Do not swallow failures silently.
- [ ] Keep all map functionality and selected objects available; restore prior zoom after exit and clear fullscreen if navigating away from its panel. Browser Escape must not also open/close unrelated UI.
- [ ] Run focused tests and report paths, commands, test counts and any unsupported-browser limitation. No commits, deploys or DB writes.

## Task 4: Integration, review and deployment (main agent)

- [ ] Update all callers of versioned question lookup, including inspector issue labels, and ensure new fields survive local save, cloud replay and viewer projection.
- [ ] Run focused regression suites plus build tests and smoke tests. Independently review changes before release.
- [ ] Build public assets with the existing sanitized builder. Verify no private source or raw chat was introduced.
- [ ] Deploy Hosting to `ontho-166a6` / `louis-lgls-pm` using the configured authorized account, without resetting access or production data.
- [ ] Verify deployed asset content and report the live link and actual checks run.

## Verification ledger

- Model-specific v2 and legacy v1 domain/local/cloud round trips pass; metadata persists without altering production routes, inventory or History.
- Initial-model selection preserves answers. Switching concrete models retains separate drafts and does not transfer verified evidence. Same-project refresh retains dirty input and disables edits/saves until loading completes; the delayed-list regression passes.
- Existing model-specific Work Item risks are included through explicit `applies_to` links; unrelated project references remain separately labelled.
- Generated four-page A4 print output includes model/date/quantity/memo, all 15 statuses and multiline notes. Pages rendered and inspected, including page boundaries.
- Final integration run: `node --test sample-preparation*.test.js cloud-preparation.test.js build-public.test.js project-view.test.js browser-smoke.test.js access-browser.test.js map-fullscreen.test.js map-readability.test.js process-side-layout.test.js`: 87 passed, 0 failed, 0 skipped.
- Separate access/catalog/publication/privacy regressions: 31 passed; private loading/History/publication scope: 11 passed. `node test.js` passed. Source syntax and `git diff --check` passed.
- Production local DB remains at revision 325. No business records, passwords, private seed or production uploads modified by this feature work.
- Both task reviews passed after draft-refresh, model applicability, inspector/dropdown and hash-navigation fixes. Native fullscreen also keeps explicitly opened map History usable; AI and line selectors remain reachable.
- Firebase Hosting deployment completed for `ontho-166a6` / `louis-lgls-pm`. Hosting-only deployment; no Firestore rules, authentication, private seed, GitHub push or production records changed.
- Live post-deploy check: homepage HTTP 200; all five changed JS/CSS assets byte-match the verified build; release-versioned checksheet CSS present; five-project public catalog contains no private graph or production records.
