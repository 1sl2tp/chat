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

## 5. Quy tắc hai lượt đọc — FIRST-READ / TARGETED-RECOVERY
- Lượt 1: dùng ảnh gốc, phân loại bill/nhật ký/thông báo/khác, xác định các vùng và chép ngay các trường nhìn rõ trong cùng một phản hồi. Mỗi trường lưu role, literal, region, row_id, state: clear/unclear/missing/ambiguous. "clear" chỉ là nhận định OCR, không thay thế kiểm tra hợp lệ hoặc đối soát. Không gọi riêng AI cho mỗi trường.
- Giữ trường đã đạt, không đọc lại toàn bộ để ghi đè. Nếu đủ trường cần thiết và bằng chứng đạt: kết thúc sau lượt 1. Nếu ảnh không phải bill: kết thúc; không ép nhận diện.
- Lượt 2: một yêu cầu bổ sung chứa ảnh gốc và các vùng chưa đạt được cắt/phóng to từ đúng ảnh. Nếu không định vị được vùng, chữ nhỏ toàn ảnh hoặc bố cục không rõ, có thể thêm phiên bản phóng to toàn ảnh hoặc các ô ảnh chồng mép, với biến đổi tọa độ xác định, giới hạn pixel/bytes và deadline cha; chỉ chọn một chiến lược phù hợp, không gửi mọi biến thể. Phóng to không tạo thông tin mới; không dùng AI vẽ lại nét số. Ưu tiên pixel gốc, không giảm chất lượng ảnh nguồn.
- Lượt 2 không nhận giá trị kỳ vọng từ thông báo ngân hàng; chỉ nhận loại trường/nhãn/row_id cần tìm. Khi kết quả mâu thuẫn, giữ cả bằng chứng và trạng thái review; không tự sửa trường rõ. Nếu thiếu giờ thực sự hoặc ảnh không có trường, giữ missing; ngân hàng xác minh là nguồn riêng.
- Hai lượt là mục tiêu của luồng đọc chính mới, chưa thay đổi ngân sách runtime hiện hành (main max 3, focused max 2). Không tự động tạo lượt 3, không tự reset retry; lỗi transport/JSON theo chính sách giới hạn hiện có đến khi hợp đồng mới được nghiệm thu. Không mở rộng quyền ghi thu.
- Test: 1 request đủ trường; 2 requests chỉ trường thiếu; vùng chưa có -> phóng to toàn ảnh; nhiều vùng thiếu -> một batch; toàn ảnh phóng to vẫn mờ -> review; không ghi đè trường rõ; sai row/role -> review; không tự bù chữ số; bất biến ledger và keyboard.
