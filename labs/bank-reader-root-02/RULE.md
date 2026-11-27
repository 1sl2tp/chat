# BANK-READER-ROOT-02 — RULE cha v1

Status: isolated lab, no production release.

## Contract
P1 classify transaction and layout, choose one explicit transaction, otherwise ambiguous.
P2 identify semantic label/value regions; original supplied image coordinates [ymin,xmin,ymax,xmax], integer 0..1000. Boxes are candidate geometry, not visual proof.
P3 transcribe the ten fields literally. Multiple boxes for multiline memo, maintain line order. Preserve signs, masks, separators, diacritics. Never supply configured recipient or external bank values to the model.
P4 model self-check, then separate deterministic validator; account forward/reverse/count consensus is not independent image truth. Independent bank mismatch after inference triggers review, never modifies literal. Missing date/time remains missing, never infer from bank timestamps.
P5 schema-validated JSON; reject malformed/missing keys and invalid region. Raw output stays immutable. Derived/normalized values and external evidence belong to a different layer.

## Request policy
One initial image inference with all P1–P5. Use native image bytes where supported and confirm encoded-image orientation and coordinate frame. No hardcoded bank examples containing real values. On unresolved fields plan one targeted second read (crop original regions if valid, otherwise original/full-image enhancement). The second call implementation and shared wall-clock/request budget are pending integration; do not silently make extra provider calls. Explicitly validate the response against the schema. No automatic overwrites: later results are review proposals. For a receipt require consistent transaction anchors before proposing a correction; journals and notices stay review-only when identity is uncertain. No financial writer, database changes, customer messages or keyboard changes.

## Bank profile registry (provisional layout hints, not hard-coded coordinates)
These cues derive from existing v76 regional guide and stored labels, not a fresh pixel-by-pixel review of all images. Each profile is subordinate to P1–P5 and must be checked on independently annotated originals.
- VietinBank: large amount, smaller date/time underneath, recipient block after arrow, multiline memo.
- Vietcombank/VCB Digibank: check account/name/beneficiary bank group and smaller time line; stop memo at next field.
- Techcombank: success block, Tới, Lời nhắn, Ngày thực hiện. Do not confuse notification overlay.
- BIDV: receipt Đến/Tài khoản/Tại; journal payment account belongs to source, not recipient. Memo-only record does not establish recipient.
- MB/MBBank: GD transaction, SD balance (exclude), DEN destination, ND memo; other receipt layouts use explicit labels.
- Agribank, VPBank, LPBank, MSB, SHB, Co-opBank, Sacombank, TPBank, ACB, wallets and unknown: generic label/role reading until actual visual templates are annotated. No guessed positions. Bank names are provisional OCR labels, aliases normalized in a separate layer.

## Dataset and acceptance
Snapshot 27 Nov 2026: 656 records, 635 valid unique SHA-256, all 635 have matching media metadata; 19 repeated-hash groups, 390 hashes with received, 173 with non_bill, no hash both received and non_bill. A media row does not establish accessible original bytes or correctness. Layout counts from stored OCR, not independent visual labels: 235 unknown-layout successful receipts, 138 screenshot successful receipts, 61 paper-photo successful receipts, 12 rotated-photo successful receipts, 4 screenshot credit notifications, 4 multiple-transaction records, 173 not_transfer_receipt records, 29 unknown-type records. Status and image_type are separate.
Provisional hash split: 505 development / 130 holdout. Before freezing, group variants of same transaction and near-duplicate images, keep them together and stratify by bank/layout/error. Avoid test leakage: do not use holdout labels in prompt construction. Raw OCR is weak annotation; amount reconciled by bank is independent bank evidence but not a gold image label. Each of ten fields needs verified literal + region or verified absence from original (with hash, orientation, reviewer), not inferred truth.
Metrics: first-pass exact match by field and role, missed/false fields, field-region IoU against gold, classification and ambiguous cases, false accepts for non-bills, repeated-digit accuracy, request count, latency and token usage; report separately by bank and layout. Compare against v76 on identical frozen samples with no financial action. Release gates: independently verified test labels, no critical false accept or regression in tested cases, verified runtime provider compatibility, two-call cap, no ledger changes. Neither this lab nor synthetic assertions establish real-image acceptance.
