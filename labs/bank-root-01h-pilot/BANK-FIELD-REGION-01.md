# BANK-FIELD-REGION-01 — đề xuất API cha định vị toàn bộ trường bill

Status: design only. Independent from BANK-ACCOUNT-ROOT-01h/v77; no runtime, database or financial rule changes.

## 1. Classify before locating
- successful_transfer_receipt: printed success evidence, sender/recipient roles, transfer amount and actual transaction datetime.
- transaction_journal: one row per transaction; preserve row boundary; distinguish debit (minus) and credit (plus); never combine fields from different rows. If multiple eligible rows cannot isolate one, mark ambiguous; do not auto-collect.
- bank_credit_notification / sender_debit_notification: distinguish direction and owner; require actual transfer event, not balance/fee/limit.
- non_bill / unknown: no guessed field or automatic collection.
Currency anchors: VND, VNĐ, VND with punctuation, đ, ₫; +, -, Unicode minus, Nợ/Có, ghi nợ/ghi có; signs can be absent on receipt. Currency/sign alone is never proof of transfer.

## 2. One parent field map
Locate all visible fields in one structured response, using original encoded-image coordinates normalized 0..1000, [ymin,xmin,ymax,xmax]. Each field returns role, state (located/missing/unclear/ambiguous), box or null, row_id for journal. Do not put expected account, amount or bank notification into locator prompt.
Fields: amount, currency/direction, transaction_date, transaction_time, recipient_name, recipient_account, sender_name/account (if visible and needed), transfer_memo (multiple ordered boxes), transaction_reference, success_marker. Amount may include +/− in same box; date/time may share region. Exclude balance, fee, phone status clock, chat timestamps, sender account when reading recipient account.
Bank profiles are hints for labels/relative placement, never fixed pixel coordinates, never synthesized evidence. Unknown layouts use generic locator. For journal, identify row first, then children; no cross-row join. For receipt, identify success and participant roles first, then children.
Normalize MIME/hash/orientation in existing ImageIdentity; geometry bounds, original/crop relationship and codec guard remain centralized. Missing/ambiguous region -> keep state and use original only within budget. No fabricated region.

## 3. Reading and evidence
First pass returns literal transcription with field roles and evidence regions in a single structured response where feasible; avoid one AI call per field. Crop only unresolved fields, batch them in one bounded follow-up; original + crop(s) identify field and row; cap total requests and parent deadline. Separate literal from normalized value, never fill missing seconds or date. Memo keeps line order then normalized one line for existing comparison. Amount retains sign and currency; parse separators separately. Signed debit in sender journal is not incoming bank credit. Name/account role must match evidence; repeating digits still use strict independent proof. Existing 10-field validation, bank reconciliation, idempotency and missing-clock policy remain unchanged.
Cache only geometry keyed by receipt + original SHA-256 + algorithm version; do not treat cached coordinates as confirmed digits. Write only after successful evidence, invalidate stale or contradictory boxes. Multi-field cache is a future schema/version, not reuse of single-account v1.
Trace only reason, field category, elapsed, count, no images, account, memo, secrets or customer data in logs.

## 4. Acceptance
Receipt with no sign; journal +/−; VND/VNĐ/đ/₫; fee/balance distractors; sender vs recipient; split date/time and multiline memo; repeated digits; missing date/time; multiple rows; no account; nonbill; EXIF/alias, stale hash/lease; invalid coordinates; malformed JSON/timeouts; cold/warm cache. Require real images after fixture CI, measure total calls/bytes/time and prove ledger hashes unchanged. No AUTO expansion, no keyboard edits.
