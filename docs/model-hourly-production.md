# SMT model hourly production

Approved change: model output, not quantities at every process. Open Production → 시간별 실적 immediately below History. Select Mexico date and one or more models. Hourly paired bars compare each interval's independently stored target and actual; cumulative mode adds the recorded quantities over the selected day. Click or keyboard-select a time for recorded causes, verification state, responses and related process context. Use start/end sliders or drag chart intervals for a range comparison. Disable the mode to restore the normal map.

The model references its existing canonical Part ID. New JSON records in hourly_records have measurementKind=model and an empty stepId. No confirmed production route is required to record model output, and machine/step quantities are rejected in model mode. Different line/unit streams remain separate. Existing process-specific records stay in the DB but are not used as model output. No migration or inferred aggregation was performed.

Targets vary per interval. Missing quantities are not zero. Missing interior intervals suppress complete totals and cumulative values after the gap. Target zero has no hourly attainment ratio; its actual quantity is separately identified as unscheduled production and excluded from comparable attainment. Net shortfall uses the available complete target and actual totals; hourly misses can still exist even when later production offsets the daily total. Day totals cover recorded intervals, not an inferred shift schedule.

Saved corrections require explicit confirmation and append a superseding record; original values, recorded timestamp and plan versions remain preserved. These records are separate from WIP and business History. Existing revision checks, transaction boundaries and owner-only API access are unchanged.

Two synthetic models each have twelve hourly records on 2026-10-09. Model A has target 3,420, actual 3,140 and 91.8% comparable attainment. Samples stay in memory and never create Parts, processes or records in SQLite. SMT's unconfirmed model identities, route and actual-count definition were not invented.

## End-of-hour report input

Owner mode has an 실적 입력 button. Select the registered model once, then paste one or more lines:

```text
9am 500 400 자재 부족
10am 450 450
11am 600 520 설비 정지
```

The report time is the interval end: 9am means 08:00–09:00. The report date defaults to America/Mexico_City and can be edited for late reports. Midnight means the previous day's 23:00–00:00. Targets vary by hour; `-` means missing, not zero. Save directly; only corrections to existing records require confirmation.

G65 PCB is a shared Component produced by the internal SMT line and used in the G65 family. Its exact SKU, variants, machines and route remain unconfirmed. Components can be tracked as model output without reclassifying them as finished products.

Reasons appear beside their time intervals in a visible list; amber marks identify intervals with a recorded reason. Actual quantities remain blue and targets gray. Desktop charts fit the panel; long mobile charts scroll inside it.

Local saves retain raw input in source records. Owner-only cloud saves retain it in immutable upload envelopes with revision checks, deduplication and superseding corrections. They do not create WIP or business History Events. Guest access remains unchanged. Teams Excel ingestion and scheduled chat ingestion are not connected to this input feature.
