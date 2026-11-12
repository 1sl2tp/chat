# Hướng dẫn triển khai duy nhất — BANK-287 và các bản OCR bill ngân hàng

> **Đọc trước mỗi lần phát hành OCR/đối soát/thu tự động. Không đoán nhánh, repo, project hoặc tạo token mới chỉ vì một workflow báo thiếu secret.**

## BANK-301 · Gemini 503 mitigation v43 ACTIVE (12/11/2026)

- Source verified: `1sl2tp/chat:main` PR #265, commit `d5f05f344ed36c7a60f16d8cdef7fa02383f0955`, Verify V21 PR run `43205958414` PASS + main `43206212684` PASS.
- Existing connected Supabase connector deployed ONLY `v21-bank-bill-event v43 ACTIVE` to project `vtqhbhrkdxirqeqkgylo`, `verify_jwt=false`. Production readback **9/9 exact source file parity**; **one changed file** `bill-gemini-failover.mjs`. `v21-agribank-notification-ingest v2` unchanged. GitHub Actions runner lacks separate `SUPABASE_ACCESS_TOKEN` but connected Supabase can deploy without new token; never deploy other repo/branch to bypass.
- Model logic: Lite → if 502/503/504, 800ms → Flash → if same class failure, 1400ms → Lite once. Max three requests under pre-existing 30s per-image deadline; no 400/401/403/404/429 fallback, no infinite retry, unchanged SQL cron code matching `gemini_http_5xx`.
- Safe model status diagnostics only; NEVER log transfer memo/customer, image contents or API key. Does not relax bill recognition, date, clock, account, proof from independently ingested Agribank, uniqueness, RPC or ledger. User-facing stale iOS failure notifications should be read against current receipt+ledger, not treated as current truth.
- Read-only after deployment 18:09 VN: bank notices #269/#270/#271 each have exactly 1 matching ledger link (#849/#850/#852), 0 manual duplicate, 0 failed bill in last 24h, retry cron active/succeeded.
- `docs/BANK_298_EVIDENCE_PIPELINE.md §8` holds the permanent rule. **E5 not yet measured:** no new customer receipt after release to prove real-world 503 reduction or iOS notification update behavior.



## BANK-301 · Chống quá tải Gemini 502/503/504 (đang kiểm thử)

- Trình tự tối đa: `gemini-3.5-flash-lite` → 800ms → `gemini-3.5-flash` → 1400ms → `gemini-3.5-flash-lite`, chỉ khi trước đó HTTP 502/503/504. Toàn bộ dưới timeout 30 giây của worker; không vòng lặp, không fallback 429/401/403, giữ `gemini_http_<status>` khi thất bại để cron nhận.
- Telemetry mỗi API call chỉ stage/model/status/elapsed_ms; không log key, customer hay OCR. Tên model cần được kiểm tra trước khi thay bằng model khác; không tùy tiện đổi model do "có bản mới".
- Giữ 9 bước rule BANK-298 và BANK-299: HTTP error chưa phải bill sai, không đủ điều kiện ghi tiền nếu chỉ dựa OCR; RPC độc lập chỉ ghi với bank proof + uniqueness. Không sửa DB production, không dùng giao dịch thật để thử.
- Nguồn kiểm thử `1sl2tp/chat:main` sau CI Verify V21 PASS, đúng project `vtqhbhrkdxirqeqkgylo`; deploy chỉ `v21-bank-bill-event`, đọc lại đủ 9 tệp, để ingest v2 nguyên. Không tạo token mới.
- Rule source: `docs/BANK_298_EVIDENCE_PIPELINE.md §8`.



## BANK-299 E4 · Tiêu chuẩn chẩn đoán bill và retry, production v42 (12/11/2026)

- **Nguồn duy nhất** `1sl2tp/chat:main`: PR #264, tested merge commit `f5f17d2683b6684867bd70038cd204dcb43deb8a`; PR Verify #43201013276 + main Verify #43201256680 **PASS**; Chat Pages #43201256773 PASS. Commit Pages sau đó `b107b6785573ba5e91fd3224745eea1bb61cdad3` chỉ cập nhật `index.html/version.json`, không đổi source Edge.
- Supabase connector đã có quyền phát hành `v21-bank-bill-event v42 ACTIVE` tại `vtqhbhrkdxirqeqkgylo`, `verify_jwt=false`. Sau deploy readback **9/9 tệp trùng mã main**. v41→v42 chỉ đổi `index.ts` và thêm `bill-decision-policy.mjs`. `v21-agribank-notification-ingest v2` không đổi. Không tạo token, không áp dụng SQL migration, không thu thử.
- **Quy tắc trung tâm** tại `docs/BANK_298_EVIDENCE_PIPELINE.md §6`: `received` phải có ledger; `amount_read` không đồng nghĩa đã khớp ngân hàng. Chẩn đoán phân biệt waiting_bank / missing_evidence / evidence_conflict / technical_block / pending_financial_rpc / duplicate / collected. Không lưu derived status lâu dài vì preview có thể cũ sau khi ledger posted.
- **Retry:** một hàm `isRetryableBillScanReason` chung cho classify error và attempted retry. Đối chiếu cron prod #21: không hỗ trợ `hash_registry_lookup_failed` nên loại trừ auto retry, Admin manual check. 429/5xx/timeout/JSON lỗi/storage_download_failed/hash_registry_unavailable vẫn retry có giới hạn. Lỗi cấu hình không lặp vô tận.
- Bank #269→ledger #849, #270→ledger #850 read-only vẫn received, mỗi cái 1 bank link, 0 manual duplicate (17:36:11 VN). 4 bill amount_read chưa tự thu và nguyên nhân preview được ghi trong CURRENT_WORK.md, không tự ghi bù hay giả định đã còn nợ.
- **Còn giới hạn:** giao diện Chat có phân loại lỗi kỹ thuật theo reason, nhưng report backend chưa đưa `match_preview.reason` chi tiết cho mọi bill, vì vậy không cam kết 4 lý do chờ đã hiển thị tường minh trong danh sách; nâng contract báo cáo phải được review riêng, không tự nới RLS/DB production. E5 ảnh thật mới và iPhone/PWA chưa chứng minh.



## BANK-299 — Lựa chọn xử lý 9 bước, lỗi kỹ thuật và preview không phải ledger
- Quy tắc chính thức: `docs/BANK_298_EVIDENCE_PIPELINE.md §6`.
- Không bao giờ xem `amount_read` là `received`. Khi hiển thị, cần phân biệt `match_preview.reason`: chờ NH, thiếu giờ/reference/memo, cạnh tranh giao dịch, lỗi truy vấn, `candidate_unique` chờ RPC.
- Chỉ `received` + ledger/link đủ và chống trùng mới xác nhận thu; trạng thái dẫn xuất tính lại trên dữ liệu thực, không ghi cứng `raw_read` cũ.
- Thống nhất predicate lỗi retry ở worker lúc bắt lỗi và lúc cron retry. Lỗi API key/401 không thử vô hạn. Label admin phân biệt lỗi kỹ thuật với OCR sai.
- Nguồn `1sl2tp/chat:main` sau Verify PASS, project `vtqhbhrkdxirqeqkgylo`. Không sửa SQL, không replay #849/#850, không tạo token, không deploy ingest v2 nếu không đổi.



## BANK-298 E4 — VN calendar, own transfer, Gemini technical failures, production v41 ACTIVE
- Source strictly `1sl2tp/chat:main` commit `5437e7bb8a859c482647c616fe0a2049cfb1aef1`, PR #263; Verify V21 PR run 43197457928 + main 43197698578 both PASS.
- Correct project `vtqhbhrkdxirqeqkgylo`; existing Supabase connector deployed only `v21-bank-bill-event v41 ACTIVE` with `verify_jwt=false`, 8/8 byte-for-byte source parity. Agribank ingest v2 unchanged; GitHub Actions runner secret separate, not evidence of missing user token.
- Guards: strict calendar date for bank evidence, accented QR/MB own transfer, 30s OCR response JSON deadline, malformed HTTP200 JSON retried as technical not OCR review, quota uses VN midnight and fails closed on DB query failure. Financial SQL RPC, amount/clock/recipient account/memo anti-dup remain unchanged.
- Retained #269/ledger #849 and #270/ledger #850 with one auto link each, zero manual duplicate (read-only). 9-stage decisions and future two-pass/gold-set plan: `docs/BANK_298_EVIDENCE_PIPELINE.md`; no actual new customer picture or device E5 proof in this release.




## BANK-298 · Kiểm toán nhất quán logic, chưa phát hành
- 9 giai đoạn và lỗi kỹ thuật / OCR / bank mismatch / SQL guard: `docs/BANK_298_EVIDENCE_PIPELINE.md`.
- Source duy nhất `1sl2tp/chat:main` **sau Verify V21 PASS**; `v21-bank-bill-event` trong project `vtqhbhrkdxirqeqkgylo`, `verify_jwt=false`; giữ nguyên ingest v2.
- Chỉnh: bank own-transfer memo `Bùi Xuân Tùng` có dấu, QR/MB prefix; thời gian bank là lịch thật; 30s timeout bao gồm parse JSON, HTTP 200 JSON lỗi là sự cố kỹ thuật retryable; quota reset 00:00 VN chứ không phải 07:00 VN.
- Không đổi status tài chính, rule_version, SQL RPC, khớp STK, số tiền, biên 60 giây, memo, khóa & chống trùng. Không gõ lại bất kỳ khoản đã `received`.
- Bài test `test_bank298_evidence_clock_retry_quota_20261112.mjs` trong Verify V21 và Edge workflow. Deploy chỉ từ commit main đã kiểm thử, connector Supabase hiện có; GitHub Actions secret riêng có thể vắng, không tạo token mới.




## BANK-297 — Thống nhất tên người thụ hưởng, Edge v40 ACTIVE (12/11/2026)

- Source exact: `1sl2tp/chat:main`, BANK-297 PR #262 merged at `2a5e81e1e85895521647c9051163bb5cf37f2fb8`, Verify PR run `43193785600` PASS, Verify main run `43194022382` PASS.
- Release: existing Supabase connector → `vtqhbhrkdxirqeqkgylo` → **only** `v21-bank-bill-event v39→v40 ACTIVE` (`verify_jwt=false`), all 7/7 source files read back byte-for-byte. `v21-agribank-notification-ingest v2` unchanged. GitHub Actions runner still separately lacks `SUPABASE_ACCESS_TOKEN`; no new token or cross-repo deployment.
- Rule: read payee name only from beneficiary field of the SAME transfer, not from sender, transfer memo or Chat nickname. Exact normalized `Bùi Xuân Tùng`, `BÙI XUÂN TÙNG`, `BUI XUAN TUNG` all become `BUI XUAN TUNG` after accent/case/whitespace normalization. Extra/missing/misordered names cause review; do not infer if unreadable. Raw OCR payee field preserved in `raw_read.recipient_name_printed`; canonical `receiving_name` is written by Edge before current financial RPC. All bank amount/clock/account/memo/uniqueness/duplicate guards unchanged.
- DB **not modified**. Production `chat_bank_app_collect` continues its strict uppercase/whitespace predicate and remains callable only by `service_role`; Edge canonicalization keeps new OCR bills aligned with it. A fuller unaccent SQL correction for previously stored accented payees is staged **outside** executable migrations at `docs/proposed-sql/BANK_297_strict_unaccent_beneficiary_name_NOT_APPLIED.sql`. Apply only with separately authorized DB change review; never silently via an OCR release.
- Existing valid #269→ledger #849 and #270→ledger #850 remain `received`, one link each and no manual duplicate. Do not replay for testing. E4 runtime parity verified; E5 new accented customer photo and iPhone/PWA user interaction not yet tested.
- Full rulebook: `docs/BANK_297_RECIPIENT_NAME_RULES.md`.



## BANK-297 — Chuẩn hóa tên người nhận có dấu (source pending)
- Quy tắc: tên chỉ lấy từ trường Người nhận/Người thụ hưởng của chính bill; tên khác rõ ràng phải review. Canonical `BÙI XUÂN TÙNG`/ `Bùi Xuân Tùng`/ `BUI XUAN TUNG` → `BUI XUAN TUNG` sau bỏ dấu, gộp whitespace, uppercase **đúng toàn chuỗi**. Không fuzzy/substring, không lấy người gửi hoặc nội dung chuyển khoản để gán tên.
- Edge JS đọc ảnh và bộ match dùng chung helper. Tên in nguyên văn lưu riêng để audit; tên đúng không thay cho STK, bank confirmation, clock, memo, RPC.
- SQL nguồn `docs/proposed-sql/BANK_297_strict_unaccent_beneficiary_name_NOT_APPLIED.sql` được **staged, không áp dụng database production**; chỉ thay predicate tên, giữ toàn bộ idempotency/financial guards và service_role.
- Xem `docs/BANK_297_RECIPIENT_NAME_RULES.md`. Trước khi phát hành phải Verify PASS, release đúng `chat:main`, ghi rõ Edge version và đọc lại tệp. Không sửa production DB, không thu/gửi trùng.



## BANK-295/296 — OCR Gemini 503 + Agribank MB memo, production v39 verified (12/11/2026)

- Nguồn duy nhất: 1sl2tp/chat:main, OCR worker commit BANK-295 2a8574ee9b8efa4a0f8fc41c3afc4ea2a6ad6b52 và BANK-296 073e46b8f818cfcdcb32529c5cb6df6b2426b817. Không lấy từ TAPHOA, 1988 hay nhánh fix để deploy.
- Verify V21: BANK-295 PR 43185913546 và main 43186192451 PASS; BANK-296 PR 43187746210 và main 43187968816 PASS. Sử dụng đúng project vtqhbhrkdxirqeqkgylo.
- Token/kết nối Supabase **có sẵn** đã deploy riêng function v21-bank-bill-event v37→v38→v39 ACTIVE, verify_jwt=false, 7/7 tệp readback bằng mã main đã qua kiểm thử; **không phải GitHub Actions**. GitHub runner báo thiếu SUPABASE_ACCESS_TOKEN trong môi trường job, chỉ phản ánh kênh GitHub Actions; không tạo token mới hoặc đoán nhánh. Theo dõi riêng issue #260.
- Không deploy lại v21-agribank-notification-ingest: v2 ACTIVE không đổi mã. Không chỉnh schema hoặc sổ thu bằng SQL trực tiếp.
- Quy tắc mới: Gemini chính bị HTTP 503 được gọi dự phòng tối đa một lần, cùng API key/prompt, tổng timeout; giữ nguyên backoff cron. Ngân hàng có thể gắn cấu trúc toàn bộ MB(6 chữ số)(NỘI DUNG GỐC). Chỉ bỏ vỏ phía Agribank để so nội dung bên trong đúng tuyệt đối với OCR bill. Cấm bỏ tùy ý tiền tố, bỏ bớt chữ, suy diễn ngày, bỏ kiểm tra số tiền/tài khoản/thời điểm/memo/duy nhất/RPC.
- Giao dịch thực chứng E5: Cô Ngọc tt +3.000.000đ 12/11/2026 15:33:28, official Agribank notification #270, bill receipt 57ed7476-e435-4091-89a6-041bd3079bdc. Sau preflight read-only (0 competing notice/bill, 0 prior links/collections, enabled+ready), một lần gọi worker hiện có bằng secret nội bộ server-side, request 15388 HTTP 200; receipt received và ledger #850 lúc 16:05:42 VN, duy nhất một auto link, amount -3000 nghìn, dư 98 triệu→95 triệu. Bank #269/ledger #849 thu 2 triệu trước đó giữ nguyên. Chưa xác minh giao diện thiết bị thực tế.
- Khôi phục/đảo mã phải qua main + Verify; không rollback bằng sửa/xóa ledger hoặc thử gửi tin thật cho khách.


## BANK-295 · 12/11/2026 · Gemini 503 hai lần trên bill 3.000.000đ (chưa triển khai)

- Cô Ngọc tt gửi bill Agribank 3.000.000đ lúc 15:33, **notification #270** nhận 15:39:22, bill receipt `57ed7476-e435-4091-89a6-041bd3079bdc` lỗi Gemini HTTP 503 hai lần, chưa ghi thu. Không nhầm với bill 2.000.000đ đã thu ở ledger #849.
- Source chuẩn `1sl2tp/chat:main`, không phải repo TAPHOA hay 1988. Patch BANK-295 thêm **một** model Gemini dự phòng chỉ khi HTTP 503: `gemini-3.5-flash-lite` → `gemini-3.5-flash`, trễ 800ms cùng timeout tổng 30s; giữ nguyên OCR strict/giờ/ngày/bank evidence/RPC. Test mô phỏng không dùng giao dịch production.
- **Đây là kế hoạch sửa E1, chưa phải E3 deploy.** Sau Verify PASS và merge vào main mới phát hành theo workflow/đúng project `vtqhbhrkdxirqeqkgylo`, đọc ngược nguồn code và rà sổ không trùng. Nếu secret Actions thiếu thì báo rõ, không đoán token, không sửa database production để ép số liệu. Ingest Agribank chỉ redeploy nếu source ingest đổi.



## E4 BANK-294 — Bộ đọc cấu trúc ngày/ký tự/tháng đã chạy trên production v37

- **Release source:** `1sl2tp/chat:main` commit `b6305ba3d501bffd799e5b151c9b9476fc14e817`, PR #257, cả Verify V21 trên PR và `main` PASS. Deploy riêng `v21-bank-bill-event v36→v37 ACTIVE` tại project `vtqhbhrkdxirqeqkgylo`, `verify_jwt=false`; 6/6 tệp đọc ngược khớp byte-for-byte với commit nguồn. `v21-agribank-notification-ingest v2` không đổi 3/3.
- **Provenance:** Workflow GitHub Actions vẫn không truy cập `SUPABASE_ACCESS_TOKEN` trong job (thiếu secret trong runner), nhưng kết nối Supabase có sẵn đã được dùng làm **ngoại lệ triển khai trực tiếp, có xác minh từ main**; không tạo token hoặc đọc secret ra ngoài, không triển khai từ nhánh fix, không thay database production.
- **Quy tắc bảo vệ:** Chữ/dấu giữa hai số ngày/tháng là ký tự nối đã biết, không được coi như số; giờ phút chỉ đọc khi ảnh có in, kể cả cùng dòng ngày. Thiếu năm/ngày vô lý/chữ lạ → review; thiếu giờ không gán `00:00` hoặc giờ Chat. Vẫn yêu cầu bằng chứng Agribank duy nhất và RPC chống trùng để thu. Đã có ledger Ngọc #849 và Hà Trang #848, **không chạy lại**.
- **Giới hạn:** CI + 6/6 source parity E4 VERIFIED, nhưng chưa có trường hợp bank bill mới sau release hoặc tương tác iPhone/PWA E5 được quan sát. Không cần redeploy v37 nếu không có mã thay đổi.

## BANK-294 — Quy tắc ngày / tháng và thời gian (bill có hoặc không in giờ)

- Nguyên tắc chung: **[ngày] [ký tự/chữ phân cách] [tháng] [phân cách] [năm]**, tuyệt đối không đảo ngày–tháng theo kiểu Mỹ. Dấu nối có thể là `/`, `.`, `-`, `tháng`, `thg`, `th.`, `th`, `t`; chữ lạ hoặc năm không nhìn thấy **không** đủ bằng chứng tự thu. Bộ parser kiểm tra đúng ngày trong lịch, tháng 1–12, năm hợp lệ. Luôn đọc từ dòng thời gian GIAO DỊCH trên bill, không dùng đồng hồ điện thoại hay thời điểm gửi Chat.
- Giờ/phút **chỉ có nếu ảnh in**: tách `09:17`, `9h17`, `9 giờ 17 phút`, hoặc `09:17:32` (giây chỉ khi in). Giờ trong cùng dòng `Ngày thực hiện: 12 thg 11, 2026 lúc 9:17` có thể phục hồi khi AI không tách được `transfer_time_printed_vn`. Nếu riêng giờ và giờ cùng dòng khác nhau, hoặc khác giờ chuẩn hóa model, **review**, không thu. Nếu chỉ in ngày không có giờ, không gán `00:00` hoặc giờ Chat; bill giữ `bill_printed_time_missing` cho tự động.
- Các từ/ký tự ở giữa **chỉ là dấu phân cách, không phải giá trị tháng/ngày**. Không dùng regex tràn lan khớp mọi chữ trên ảnh; unknown token vẫn là `printed_date_invalid`, yêu cầu kiểm tra thủ công. Không nới điều kiện đối chiếu số tiền, account, unique Agribank notification, phút giao dịch và exact bank memo, giữ RPC chống trùng.
- Chỉ cập nhật `supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs` và bài kiểm thử; **không** redeploy `v21-agribank-notification-ingest` nếu source không đổi. Nguồn duy nhất `1sl2tp/chat:main` → project `vtqhbhrkdxirqeqkgylo`. Merge sau Verify V21 PASS; đọc lại 6/6 Edge files. Không chạy lại bill Cô Ngọc tt #269/ledger #849 hoặc C Hà Trang #268/ledger #848 đã thu.
- Khi Actions thiếu secret trong ngữ cảnh runner, đã có Supabase connector được cấp quyền nhưng không tự động coi nó là Actions secret. Nếu phải triển khai qua connector theo ngoại lệ đã ghi, chỉ dùng đúng mã `main`, kiểm chứng phiên bản và ghi rõ cách triển khai, không tạo token mới, không thay DB production.

## E5 BANK-293 — Hoàn tất ghi thu 2.000.000đ Cô Ngọc tt, 12/11/2026

- Mã nguồn nguồn duy nhất `1sl2tp/chat:main` commit `764be518ddcefec5e6cd71ba93ba8b36d22b5558` sau PR #255 + Verify V21 PASS. Bản deploy connector Supabase có kiểm chứng **`v21-bank-bill-event v36 ACTIVE`**, mã tệp **6/6 khớp main**; `v21-agribank-notification-ingest v2` vẫn đúng **3/3** và không được deploy lại chỉ để tăng phiên bản. Không dùng token mới hoặc nguồn nhánh feature.
- **Đã tự thu đúng một lần:** Agribank notice **#269** +2.000.000đ lúc **09:17**, bill Cô Ngọc tt `ad364b30-9d8b-4e87-b642-83a36ab647b1` được xử lý worker v36 thành `received`, OCR literal date `12 thg 11, 2026`, `printed_date_invalid=false`, ledger **#849** lúc **10:39:30 VN**. Tổng AI attempts=**3**, không tiếp tục quét.
- **Số dư nợ:** 100.000.000đ trước thu → **98.000.000đ sau thu**; ledger `amount_vnd=-2000` tính theo nghìn đồng, một app collection link từ bill đến #269, 0 manual link. Không tạo hoặc gửi một khoản thu, tin Chat/Zalo khác để kiểm tra. Không rollback khoản tiền hợp lệ.
- Các ghi chú *chưa thu* phía dưới là trạng thái cũ trước 10:39 ngày 12/11, không còn là chỉ thị tiếp tục thu. **CẤM gọi lại worker/retry/thu thủ công đối với notice #269 hoặc bill đã `received`**.
- Giữ mọi chính sách ngày giờ Việt Nam, bank memo/account/uniqueness/RPC chống trùng, và sổ thu production; E5 được chứng minh bằng Supabase canonical, chưa xác minh tương tác giao diện iPhone/PWA trực tiếp.

## BANK-293 — Chữ viết tắt “thg” trên bill Techcombank

- Ảnh thực sự in `12 thg 11, 2026 lúc 9:17` (ngày đầy đủ, `thg` = tháng), không phải chữ “tháng” như nhận định đầu tiên. Parser mới phải phân biệt ngày có dấu phẩy, tháng viết tắt và hậu tố giờ; đồng thời **so sánh lại giờ in với thời gian giao dịch**. Ngày không hợp lệ hoặc giờ mâu thuẫn vẫn phải về `review`.
- Sau khi cập nhật BANK-291/292 lên production, bill Cô Ngọc tt 2.000.000đ đã được tái đọc **một lần**, nhưng bị `printed_date_invalid` và vẫn **chưa thu**. Tại thời điểm này `attempt_count=2`, bill `review`, ledger NULL, Agribank #269 chưa gắn bill. Mở rộng ngân sách tối đa **3 lần AI tổng cộng** cho *chính* bằng chứng đã đối chiếu với một bank credit độc lập: không gọi lần thứ tư, không biến số tiền trong ảnh thành bằng chứng ngân hàng.
- Khi hoàn tất CI, chỉ có worker `v21-bank-bill-event` cần cập nhật thêm parser/guard; `v21-agribank-notification-ingest v2` đã chứa cơ chế đánh thức và không đổi source. Nếu GitHub Actions thiếu secret, ghi rõ và không làm nhầm source/branch. Trước một lần thử lại bill cũ, kiểm tra ngân hàng, khách, ledger/link và ngày VN một lần nữa. Không ghi thu thủ công bằng SQL, không gửi tin nhắn thử.

## BANK-291/292 — Techcombank comma date và Agribank đến sau

- Source duy nhất `1sl2tp/chat:main` và project `vtqhbhrkdxirqeqkgylo`; code của **hai** Edge function `v21-bank-bill-event` và `v21-agribank-notification-ingest` phải cùng release BANK-291/292, `verify_jwt=false`. Không lấy từ repo TAPHOA hoặc 1988, không thay token/secret và không deploy branch fix trực tiếp.
- Chữ bill Techcombank `12 tháng 11, 2026` là ngày **DD tháng MM, YYYY** đầy đủ; parser không được gọi đây là `printed_date_invalid` khi ngày hợp lệ. Luồng ngân hàng có thể đến chậm vài phút: event mới phải đánh thức đúng worker, không thêm cron/polling.
- Retry một lần cho `review/bill_printed_datetime_conflict` chỉ để **đọc lại ảnh gốc** sau khi kiểm chứng **một** Agribank credit đúng số tiền/phút/tài khoản/nội dung, trong ngày VN và trước khi có bất kỳ link thu nào. Không dùng trạng thái OCR cũ để tự ghi tiền. Bill `amount_read` có thể khớp lại bằng OCR đã lưu và không gọi Gemini.
- Chỉ đánh dấu `ĐÃ THU` sau khi kiểm tra RPC ngân hàng chuẩn đã tạo đúng một ledger/link, không tự sửa `raw_read`, số dư, `status` bằng SQL hoặc gửi thông báo khách trong tests. Giao dịch BANK-290 #268 đã thu: tuyệt đối không lặp.
- Chạy BANK-291/292 và Verify V21, phát hành qua workflow có khóa `main` sau khi CI PASS; đọc lại cả hai Edge versions/hashes. Nếu Actions không có secret trong ngữ cảnh runner, chỉ dùng ngoại lệ deploy trực tiếp có đối chiếu nguồn `main` và phải ghi nhật ký, không khởi tạo token mới.

## BANK-290 — Giao dịch C Hà Trang #268 đã thu, CẤM ghi thu trùng

- Xác minh trực tiếp ngày **12/11/2026 lúc khoảng 07:45 VN**: khách C Hà Trang, ngân hàng Agribank **#268** (10.157.000đ, 21:53 ngày 11/11) có **một** `chat_bank_manual_collections` mode `collected`, ledger **#848** lúc **07:43:27 ngày 12/11**, amount `-10157` (đơn vị 1.000đ) và **một** tin xác nhận trong Chat với client ID `taphoa:bank-manual:268:collection`. Tin xác nhận báo nợ sau thu **0**.
- Bill ảnh `88706591-590e-4acb-8911-338ac1cd0ef7` vẫn `amount_read`, `ledger_id=NULL` vì đã ghi thu theo **manual bank link**, không phải auto receipt link. **Không được tự thu lần hai, gọi lại RPC thu, ép chuyển trạng thái receipt thành `received`, backfill auto link, gửi lại tin Chat/Zalo hoặc chỉnh ledger #848.**
- Các đoạn phía dưới mô tả khoản “chưa thu” là lịch sử **trước 07:43 ngày 12/11**, đã được mục BANK-290 và đầu `CURRENT_WORK.md` thay thế. Nếu hiển thị UI khác ledger, điều tra ở chế độ read-only; bút toán tài chính và thông báo khách đã có thật.
- E4 ledger và tin xác nhận Chat đã xác minh; E5 iPhone/PWA và Zalo **chưa được xác minh** trong đợt rà soát này. Không triển khai lại v34 chỉ vì đối soát giao dịch cũ.

## Đích triển khai cố định

| Thành phần | Giá trị chuẩn |
|---|---|
| GitHub repository | `1sl2tp/chat` |
| Source branch được phép triển khai | `main` (sau PR và Verify V21 PASS) |
| Source Edge Function | `supabase/functions/v21-bank-bill-event/` từ **chính commit main đã kiểm thử** |
| Supabase project ref | `vtqhbhrkdxirqeqkgylo` (`chat-bh-get`) |
| Supabase functions | `v21-bank-bill-event` và `v21-agribank-notification-ingest` (BANK-291 event wake) |
| GitHub release workflow | `.github/workflows/deploy-bank-bill-edge.yml` (`Deploy Bank Bill OCR Edge`) |
| Runtime JWT mode | `verify_jwt=false` (giữ nguyên xác thực riêng bằng `x-internal-dispatch-key`) |
| Backend SQL ghi thu | `public.chat_bank_app_collect` — giữ các điều kiện chống thu trùng/ngày hiện tại |

**Không** triển khai từ `1sl2tp/taphoaxyz`, `1sl2tp/1988`, nhánh tính năng, bản sao lưu hoặc file đã trích từ lịch sử. Nhánh sửa chỉ được merge vào `1sl2tp/chat:main` sau khi kiểm thử. Không thay đổi Supabase project, không tự đẩy thủ công, không chỉnh DB production hoặc ghi thu để thử deploy.

## Trạng thái triển khai đã xác minh (12/11/2026)

- Function `v21-bank-bill-event` tại đúng project `vtqhbhrkdxirqeqkgylo` đã nâng **v33 → v34 ACTIVE** từ mã nguồn đã merge của `1sl2tp/chat:main`; độc lập xác minh mọi file **5/5 khớp byte-for-byte** với GitHub main, JWT mode giữ `false`, BANK-287 có trong runtime `bill-app-preview.mjs`.
- Bản v34 được phát hành **trực tiếp qua kết nối Supabase đã được cấp quyền** theo yêu cầu tiếp tục sửa của chủ sở hữu, **không phải** job deploy GitHub Actions. Phải nêu rõ ngoại lệ này trong báo cáo; không xem đây là cơ chế tự động thường xuyên, không dùng việc này để che giấu thiếu secret Actions.
- Trong các lần sửa kế tiếp, **không redeploy v34 nếu không có mã thay đổi**. Ưu tiên phát hành qua workflow trên `main`; khi GitHub job không nhận `SUPABASE_ACCESS_TOKEN`, chỉ rà soát secret/permission tại đúng repo và không tự tạo/chép token.
- **Cập nhật BANK-290 lúc 07:43 ngày 12/11:** Khoản C Hà Trang **ĐÃ THU THỦ CÔNG** tại Agribank #268, ledger #848, đã có một tin xác nhận Chat. Ảnh bill vẫn `amount_read` là do liên kết receipt chưa xác minh, **không phải còn nợ**. Không thu hoặc gửi xác nhận lần hai.

## Ghi chú về token/credential (12/11/2026)

- Chủ sở hữu xác nhận **đã có token/cấu hình kết nối**; không yêu cầu phát hành token khác, không đưa bất kỳ token/secret nào vào commit, log, tài liệu hay hội thoại.
- **Hai nguồn xác thực khác nhau:** Supabase connector trong ChatGPT có thể đã được cấp quyền truy cập, còn GitHub Actions yêu cầu một secret tên `SUPABASE_ACCESS_TOKEN` **trong repo GitHub**. Có connector **không chứng minh** secret Actions đã được cấu hình. Lỗi `Missing GitHub Actions secret SUPABASE_ACCESS_TOKEN` chỉ chứng minh secret không có mặt trong **ngữ cảnh job đó**, không có nghĩa là chủ sở hữu thiếu token.
- Nếu Actions fail tại gate này, **không** khởi tạo token mới, không sao chép bí mật ra giao diện, không tự chuyển nhánh/project hoặc bypass gate. Kiểm tra trạng thái secret/permission của đúng repo, workflow/event và tổ chức trước; chỉ cấp lại quyền cho đúng kênh theo quy trình được chủ sở hữu cho phép.
- Credential là thông tin bí mật: chỉ ghi lại **tên biến và nơi cấu hình**, tuyệt đối không ghi giá trị.

## Quy trình bắt buộc

1. Đọc `CURRENT_WORK.md`, `README_MAINTENANCE.md`, `README_RESOURCE_GUARDRAILS.md`, `README_NO_WAIT_WORKFLOW.md`. Kiểm tra không có một deploy/CI cùng incident đang chạy; không tạo job trùng.
2. Xác nhận repo chính xác `1sl2tp/chat`, nguồn `main`, commit HEAD dự kiến và PR đã merge. Workflow **fail-closed** nếu `GITHUB_REPOSITORY != 1sl2tp/chat` hoặc `GITHUB_REF != refs/heads/main`. Checkout phải trùng `GITHUB_SHA`, in repo/ref/SHA/project/function (không in token) vào GitHub Actions summary.
3. Chạy `Verify V21` và các kiểm thử hợp đồng `BANK-287`/OCR liên quan. Không bỏ qua lỗi test hoặc chạy thử trên giao dịch thật.
4. Chỉ dùng workflow triển khai hiện có từ `main`. Token dành cho GitHub Actions phải được cung cấp qua secrets của **chính** repo đó. Không dùng một connector session để âm thầm thay thế workflow không có credential; cần xác nhận rõ một ngoại lệ nếu muốn thay đổi cơ chế phát hành.
5. Đối chiếu kết quả deployment **ACTIVE**, version tăng, mã `bill-app-preview.mjs` trên production chứa logic `BANK-287`, trạng thái JWT không thay đổi. Tách bạch: GitHub merge/Verify PASS **không có nghĩa là Edge production đã cập nhật**.
6. Đọc log tối thiểu và xác minh mới không làm tăng ledger trùng, không thu sai khách, không phát tin thật trong test. E0–E5 đánh dấu riêng; chỉ báo xong khi đã kiểm chứng production.

## Giao dịch C Hà Trang 10.157.000đ ngày 11/11

Ảnh bill C Hà Trang chuyển **21:53 11/11/2026** và thông báo Agribank #268 đã nhận đúng tiền, nhưng OCR memo thiếu tiền tố `QR - ` mà Agribank tự thêm. PR [#248](https://github.com/1sl2tp/chat/pull/248) đã merge vào `main` và Verify PASS. Không dựa vào 08:00 để kích hoạt ghi thu. `public.chat_bank_app_collect` chỉ tự thu trong ngày giao dịch (giờ Việt Nam), nên đợt sửa mã hôm sau **không tự động ghi thu lại** khoản cũ.

**ĐÃ XỬ LÝ NGÀY 12/11:** Admin đã xác nhận thu thủ công qua luồng chuẩn; thông báo Agribank #268 đã liên kết ledger #848 và tạo đúng một tin xác nhận Chat. Đoạn hướng dẫn thu ở trạng thái cũ không còn áp dụng cho #268. Giữ nguyên `chat_bank_manual_collect` với kiểm tra quyền/khóa/chống thu trùng cho các giao dịch khác; không ghi thu lại khoản này, không gọi SQL `INSERT`/`UPDATE` lên sổ nợ và không sửa bill thành `received` để giả lập xác minh ảnh.

## Hoàn tác

Revert PR qua `main` theo cùng workflow, xác minh Edge version/mã nguồn sau phát hành. Không rollback bằng cách xóa ledger, bill, bank notice hoặc các chứng từ đã ghi nhận.
