# Hourly report input implementation plan

> Execute in this chat using executing-plans, preserving unrelated workspace edits.

**Goal:** Paste end-of-hour model reports and expose reasons without clicking.
**Architecture:** Shared HourlyProduction parser and correction checks feed SQLite and owner-only cloud observation envelopes. Existing charts retain gray target/blue actual, with amber reason marks and an always-visible reason list.
**Tech stack:** Existing JavaScript, SQLite, Firebase SDK, Node tests and Chrome browser tests. No new dependencies.

## Constraints

- Mexico date defaults at input creation; editable for late reports. 9am means 08:00–09:00. Midnight report belongs to the preceding production interval.
- One explicit registered model per paste; never infer model identity from text. G65 PCB is a Component and can have model-level output records.
- Hourly quantities are output, not WIP. No automatic History Event, assignment or route changes.
- Same input is idempotent; changed existing quantities require correction confirmation and retain originals.
- No Teams integration, Kakao scheduler changes or fabricated real production quantities.

## Tasks

- [x] Parser: hourly.js parseInput(project,{partId,date,text,unit}) → validate normalized model rows. Tests: am/pm, 24h, midnight, zero/missing, invalid date/count/time, duplicates and component models.
- [x] Shared changes(existing,rows,confirmCorrections) reused by hourly-store.js and cloud-api.js. Tests preserve old records and overlapping interval rejection.
- [x] Input dialog in hourly-view.js: model/date/unit/text, save without mandatory review, confirmation only for corrections. Cloud hourly envelopes reuse existing owner-only immutable uploads and revision transactions; never create Progress/History from them.
- [x] Charts: contained chart/summary panel, scaled desktop SVG, aligned mobile scrolling, reason marks plus visible time/reason rows. Browser tests cover reason visibility, keyboard and mobile overflow; screenshots inspected.
- [x] Register confirmed G65 PCB Component and SMT line produces link in shared DB, attach it to SMT/LS without invented machine/process steps; back up before updating.
- [x] Full regression: 138 tests pass. Scoped SMT baseline and Hosting published; live hourly-view.js/cloud-api.js hashes match the build, site responds HTTP 200. Owner-only cloud access verified with adapter tests; live owner login not exercised.
