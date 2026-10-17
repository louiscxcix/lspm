# SMT review — 2026-10-12

## Confirmed structure

SMT is the parent production line, with Line 1 and Line 2 as Resource/line children. The reference IMG_4149.HEIC lists Line 2: JP-RH and G65; Line 1: LQ2-HB and LQ2-LH/RH. The user confirmed these are PCB outputs. Canonical Components are G65 PCB, JP-RH PCB, LQ2-HB PCB, LQ2-LH PCB and LQ2-RH PCB. Existing G65 PCB identity is reused, not duplicated. JP-RH is not automatically equated to G65 Jewelry Piece; downstream LDM product mappings are deferred.

Resource `part_of` links line hierarchy; `produces` links line to its PCB outputs. Existing people, supervisor/leader/technician organizations, reporting and escalation relationships remain on the overall SMT line. No individual Line 1/2 or machine assignment is inferred. Starpro SMT is a separate supplier-side line, not merged with internal SMT.

The previous renderer hid outputs lacking stored_at relationships and hourly mode then removed people/resources. Produced PCB nodes are now retained regardless of storage mapping. Hourly mode keeps the full SMT graph and contacts. Physical machines and detailed process order are not present in the current DB/reference; they remain unconfirmed rather than being synthesized.

## Production day and targets

Chart production day is America/Mexico_City 07:00–next day 07:00. 2026-10-11 06:00 belongs to production day 2026-10-10. Input retains the actual calendar observation/report date; production-day display is derived without rewriting timestamps.

Model standards reference the canonical Part ID and effective production date. Unit Time is seconds per produced PCB, not per unspecified panel or batch. UPH = 3600 / Unit Time. Hourly target = floor(3600 / Unit Time * 0.85). The user confirmed 15% output reduction. Other units such as boxes/pallets are not converted to PCB counts. No numeric standards were seeded because the reference cells are blank.

Standards append versions in project settings with revision validation. Local changes have a change-set audit; cloud changes use owner-only immutable observation envelopes. Original actual quantities and original reported targets remain preserved; the chart applies the effective model standard as a calculated planning view. Missing Unit Time is displayed explicitly. Owner uses Unit Time · 목표 설정 to enter a measured standard and effective date. Reader mode cannot save it.

Hourly sample observations stay synthetic and memory-only but reference real registered PCB objects. They do not add Parts, machines or production observations to the DB. Owner Unit Time/real hourly saves also refresh the sanitized viewer publication without changing its password. A failed view refresh is reported separately from a successful database save. Teams workbook ingestion is not implemented here.
