# SIN LOTE — Risk Management & Ontology Draft

**Status:** Draft based on the handwritten flow, verbal transcript, and user-confirmed classification. This document is not a live MES/database update.

## 1. Classification

Parent category: **SIN LOTE**

Use exactly these three operational categories:

1. **LOT 생성 완료** — LOT exists, but MES process history may be incorrect.
2. **LOT 미생성** — the required LOT has not been created.
3. **아예 잘못된 공정** — actual physical process position does not match MES process history.

LOT existence and process-history correctness are separate checks. These categories classify the case; they do not establish root cause. If more than one condition appears to apply, record the observed facts and follow the site's classification rule rather than guessing.

## 2. Risk 01 — SIN LOTE: LOT 생성 완료

**Definition:** A LOT has been created, but its MES process history may not match the actual physical processing.

- **Failure Mode:** LOT exists, but the recorded operation/route is incorrect.
- **Potential Effect:** Incorrect routing, skipped or duplicated operations, unreliable traceability, unnecessary rework.
- **Root Cause hypotheses — unconfirmed:** Wrong LOT level scanned; transaction attached to another LOT; missed/incorrect scan; process update not recorded.
- **Prevention:** Verify product identity, LOT, and QR before each relevant transaction; clarify individual LOT versus representative LOT instructions.
- **Detection:** Compare MES history with physical product condition and scan/transaction logs.
- **Containment:** Hold further progression while the actual completed operation is uncertain.
- **Recovery:** Establish the last physically verified operation. Use an approved MES correction/rollback procedure only after authorization. Resume at the correct next operation; repeat a process only if the approved procedure requires it.
- **Evidence:** MES history, scan log, physical inspection, operator/engineering confirmation, approved correction record.
- **Unresolved:** Allowed rollback steps, authorizing role, and when reprocessing is required.

## 3. Risk 02 — SIN LOTE: LOT 미생성

**Definition:** The required LOT has not been created or associated with the physical product.

### Full array scenario described
The transcript describes an array with six individual LOTs. When all six are available, the representative-LOT flow can proceed as described. Confirm whether this six-item rule applies to all relevant products/routes.

### Partial array scenario described
If only two, three, four, or five of the expected six items are available, the transcript describes an exception flow involving individual LOT creation/handling, Router, creation of the representative LOT using its QR code, and completion. **The exact sequence was not confirmed.**

- **Failure Mode:** Required LOT is absent; wrong LOT level is used; or individual/representative LOT linkage is incomplete.
- **Potential Effect:** Processing blocked; only some items progress; other items remain behind; traceability becomes inconsistent.
- **Root Cause hypotheses — unconfirmed:** Array incomplete; LOT creation step missed; scan/creation instructions unclear; MES validation gap.
- **Prevention:** Document full-array and partial-array flows separately; identify the required LOT level and QR; train operators using practical examples.
- **Detection:** Verify physical quantity/array membership, individual LOTs, representative LOT QR, MES lookup, and LOT linkage.
- **Containment:** Do not bypass missing LOT validation by scanning a different code. Keep affected items identifiable until identity and linkage are confirmed.
- **Recovery:** Follow the approved creation/linking procedure, then verify all individual LOTs and the representative LOT in MES before downstream progression.
- **Evidence:** Array count, individual LOT list, representative LOT QR, MES lookup, scan/transaction logs.
- **Unresolved:** Exact partial-array sequence; whether six is mandatory or product-specific; the exact point where representative LOT QR is created; who authorizes exceptional creation.

## 4. Risk 03 — SIN LOTE: 아예 잘못된 공정

**Definition:** The actual physical operation/location and MES process history do not match.

- **Failure Mode:** MES shows an earlier/different operation than the one physically completed, or the product was routed through an incorrect process.
- **Potential Effect:** Skipped or duplicated operations, incorrect restart point, unreliable traceability, quality risk, unnecessary rework.
- **Root Cause hypotheses — unconfirmed:** Incorrect LOT association; missed transaction; process history attached to another LOT; recovery performed without checking physical state.
- **Prevention:** Confirm correct LOT and transaction at process handoffs; use a recovery checklist that requires physical-process confirmation.
- **Detection:** Compare product condition/location with MES history and evidence of completed operations.
- **Containment:** Stop progression until the actual completed operation is established.
- **Recovery:**
  1. Identify affected product and LOT.
  2. Verify actual physical processing and available operation evidence.
  3. Compare with MES history and scan logs.
  4. Obtain authorization for MES rollback/correction.
  5. Return the product to the correct next operation based on verified physical progress.
  6. Repeat Router/ICT/another operation only if the approved procedure requires it.
  7. Verify physical state and MES history agree before release.
- **Evidence:** MES operation history, scan logs, physical inspection, operation/test records, approved recovery and verification record.
- **Unresolved:** Who authorizes the restart point; which steps can be rolled back or repeated; required release evidence.

## 5. Common response workflow

1. Identify the product, individual LOT(s), representative LOT (if applicable), QR, array membership, and physical location.
2. Read current MES LOT status and process history.
3. Compare MES history with actual physical processing.
4. Classify the case under one or more of the three categories using observed facts.
5. Contain the product if identity, genealogy, or completed process is uncertain.
6. Use only the approved MES LOT creation, linking, rollback, and reprocessing procedure.
7. Verify LOT links, physical quantity/location, process history, and required inspection/test evidence.
8. Record an actual occurrence and response in Business History separately from the enduring Risk.

## 6. Ontology modelling proposal

Reuse existing canonical objects and supported types; do not create duplicates.

### Risk objects
- `Risk`: SIN LOTE — LOT 생성 완료
- `Risk`: SIN LOTE — LOT 미생성
- `Risk`: SIN LOTE — 아예 잘못된 공정

Use the application's existing grouping/project convention for the parent category SIN LOTE. Do not invent a new entity type unless the current schema supports it.

### Related objects / Work Items
- `Production Step`: Router (resolve and reuse the existing canonical ID).
- Other `Production Step` objects only after the affected route is confirmed.
- `Part`: exact product/PCB/array definition only after identity is confirmed.
- `Resource`: MES/scan station only if the actual resource is known and relevant.
- `Work Item`: Define full-array and partial-array LOT creation instructions.
- `Work Item`: Verify representative LOT QR and individual LOT linkage.
- `Work Item`: Test MES wrong-LOT-level detection/interlock.
- `Work Item`: Define and validate the approved SIN LOTE recovery/restart procedure.
- `Evidence`: MES history, scan logs, QR lookup, physical reconciliation, inspection/test results. Create evidence records only when actual evidence exists.

### Relationship suggestions — validate before saving
- `Risk potentially_affects Production Step / Part / Resource`, only where the model permits the endpoint types.
- `Work Item mitigates Risk`.
- `Work Item applies_to Production Step`, where valid.
- An actual incident `Event records_on` the relevant Risk or subject.
- `Event supported_by Evidence` when evidence exists.
- `Event reported_by` / `performed_by Person` only for confirmed identities.

The installed ontology model is authoritative for endpoint types, scope, and duplicate checks. Do not invent IDs, root-cause facts, owners, due dates, severity scores, or completion status.

## 7. Verification and status

Use supported existing fields. Until verified, keep:
- Root cause: **unconfirmed**
- MES detection/interlock: **not verified**
- Corrective action: **proposed**
- Recovery: **not verified**
- Evidence: only artifacts actually collected
- Severity/likelihood, owner, and due date: **unknown unless confirmed**

## 8. Open questions

1. Does the six-individual-LOT rule apply to every product/route or only a specific model?
2. For partial arrays, what is the exact order of individual LOT creation, Router, representative LOT QR creation, and completion?
3. At what exact point is the representative LOT QR created?
4. Which MES role can authorize LOT creation, rollback, relinking, and reprocessing?
5. What evidence proves the last physically completed operation?
6. Which existing project, Part, Router, and process-step IDs should these Risks link to?

## 9. Implementation boundary

This is a structured change proposal, not a live MES/database update. Before applying it to the ontology: inspect the current app/database, resolve canonical IDs and duplicates, validate relationship endpoint types, back up the existing database, use the existing ingestion/store workflow, and verify saved scope, relationships, evidence, and graph integrity. Publish to Firebase only when explicitly requested and authorized.
