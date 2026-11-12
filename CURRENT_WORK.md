## 2026-11-12 — BANK-295 · E2 PASS · E3 DEPLOY BLOCKED · E4/E5 CHƯA CÓ

- **Nguồn chính xác:** `1sl2tp/chat:main` squash commit `2a8574ee9b8efa4a0f8fc41c3afc4ea2a6ad6b52`, PR [#259](https://github.com/1sl2tp/chat/pull/259) MERGED. Verify V21 trên PR [43185913546](https://github.com/1sl2tp/chat/actions/runs/43185913546) SUCCESS và Verify `main` [43186192451](https://github.com/1sl2tp/chat/actions/runs/43186192451) SUCCESS. Mã có fallback Gemini HTTP 503 đúng một lần, giữ nguyên kiểm tra ngân hàng và RPC chống trùng.
- **E3 BLOCKED:** Release workflow từ chính SHA `main` [43186192458](https://github.com/1sl2tp/chat/actions/runs/43186192458) FAIL-CLOSED: `SUPABASE_ACCESS_TOKEN` rỗng trong **GitHub Actions runner**. Đây không phủ nhận token/kết nối Supabase đã có. **Không** tạo token khác, không bypass bằng nhánh khác, không sửa SQL hoặc phát hành Edge production thủ công. Đã mở [issue #260](https://github.com/1sl2tp/chat/issues/260) cho điểm chặn secret scope và đường phát hành chuẩn.
- **Production readback:** `v21-bank-bill-event v37 ACTIVE` (bản cũ), `v21-agribank-notification-ingest v2 ACTIVE` không đổi, project `vtqhbhrkdxirqeqkgylo`. Bản dự phòng BANK-295 chưa chạy ở production. Bill Cô Ngọc tt 3.000.000đ receipt `57ed7476-e435-4091-89a6-041bd3079bdc` còn `failed/amount_scan_gemini_http_503`, `attempt_count=2`, chưa có `ledger_id`; ngân hàng notice #270 +3.000.000đ đã có. Không thu trùng khoản 2.000.000đ ledger #849 đã ghi trước đó.
- **Bước tiếp:** Chỉ khi credential thực sự có mặt trong job `1sl2tp/chat`, dùng workflow cũ có khóa `main`; sau triển khai, xác minh function version, **7/7 source files**, 0 ghi trùng, và kiểm tra `receipt #270`/sổ thu ở chế độ read-only. Không tuyên bố tự thu trước khi có ledger + link chứng thực.

---

## 2026-11-12 — BANK-295 · Agribank #270 +3.000.000đ, Cô Ngọc tt — Gemini 503, E1 PATCH / E2 PENDING

- **Bằng chứng production CHỈ ĐỌC:** Khách Cô Ngọc tt gửi ảnh 15:33:44 VN, receipt `57ed7476-e435-4091-89a6-041bd3079bdc`, hai lần OCR 15:33:57 và 15:40:04 đều lỗi `amount_scan_gemini_http_503`, `ledger_id=NULL`. Agribank nguồn chính thức đã đẩy notification **#270 +3.000.000đ**, bank transfer 15:33, server nhận 15:39:22. Dù có bank evidence, KHÔNG ghi thu nếu chưa đủ OCR account/memo/time hoặc RPC `chat_bank_app_collect` trả kết quả hợp lệ. Không động vào bill 2m/ledger #849 trước đó.
- **E1 patch nguồn chuẩn:** `1sl2tp/chat`, nhánh fix từ `main` `576842671442acd78e9e934a68c05b59acd72f58`; bổ sung `bill-gemini-failover.mjs` để dùng cùng `GEMINI_API_KEY`, cùng ảnh + prompt, chỉ khi `gemini-3.5-flash-lite` trả HTTP 503 thì chờ 800ms rồi thử đúng một lần `gemini-3.5-flash`. Tổng deadline 30s, không thay DB retry budget, phân loại/ngày/giờ, bank matching hay RPC chống trùng; ghi `model_name` đúng model trả kết quả. Nếu cả hai lỗi thì vẫn `failed`, cron 5 phút với backoff sẵn có tiếp tục; 429/400 không đổi model.
- **E2 test:** `tests/test_bank295_gemini_503_fallback_20261112.mjs` mô phỏng thành công, 503→thành công, 503→503, 429, 400, abort, network failure, cùng payload/secret và không lặp vô hạn. Thêm vào Verify V21 và Edge workflow. Workflow chỉ deploy lại `v21-agribank-notification-ingest` nếu tệp của ingest thực sự đổi; không triển khai nhầm function.
- **E3/E4/E5 chưa xác nhận:** Chỉ merge sau Verify V21 PASS; deploy từ `1sl2tp/chat:main` vào `vtqhbhrkdxirqeqkgylo` theo quy trình duy nhất `DEPLOYMENT_BANK_BILL.md`; KHÔNG tự tạo token, không sửa SQL production, không gọi lại receipt đã thu. Ghi rõ nếu Actions thiếu `SUPABASE_ACCESS_TOKEN` trong job. Sau release xác minh Edge readback 7/7 tệp, bank #270 ↔ receipt ↔ ledger/link (nếu có), tránh ghi trùng.
- **Rollback:** Revert branch/PR qua `main` và dùng luồng release được kiểm soát, không xóa ledger/notification/receipt hợp lệ.

---

## 2026-11-12 — BANK-294 E4 VERIFIED · Date separator/optional clock Edge v37 production

- **Yêu cầu:** AI hiểu số ngày + chữ/ký tự dấu nối + số tháng + năm nhìn thấy, đọc giờ/phút nếu có (cả khi cùng dòng ngày) và không sử dụng thời gian điện thoại/Chat để bịa dữ liệu.
- **E1 source:** `supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs` nhận YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, `12 tháng 11 năm 2026`, `12 thg 11, 2026`, `12 th. 11`, `12 th 11`, `12 t 11` khi có năm. Phần chữ giữa là **separator**, không phải số tháng. Chỉ dấu nối trong whitelist được nhận: `tháng`, `thg`, `th`, `t`; chữ lạ, thiếu năm hoặc ngày không có thật không được tự hợp thức hóa. Giờ in trong cùng dòng được tách nếu AI bỏ trường giờ riêng (`9:17`, `9h17`, `9 giờ 17 phút`, giây nếu nhìn thấy), và so chéo với giờ riêng + model; thiếu giờ không được đoán, mâu thuẫn không ghi thu.
- **E2 PASS:** PR [#257](https://github.com/1sl2tp/chat/pull/257) Verify V21 [43153727704](https://github.com/1sl2tp/chat/actions/runs/43153727704) SUCCESS; merge source `main` commit `b6305ba3d501bffd799e5b151c9b9476fc14e817`; Verify V21 [43153876718](https://github.com/1sl2tp/chat/actions/runs/43153876718) SUCCESS. `tests/test_bank294_structural_vn_date_clock_20261112.mjs` + BANK-291 regression đã PASS. Không test bill production để tránh tiền thật.
- **E3 deployed:** GitHub Actions Deploy Edge [43153876740](https://github.com/1sl2tp/chat/actions/runs/43153876740) FAIL-closed tại `SUPABASE_ACCESS_TOKEN` không có trong **ngữ cảnh job GitHub**, không phải chưa tồn tại token trong tài khoản. Dùng **kết nối Supabase đã cấp quyền** theo ngoại lệ có đối chiếu đúng `1sl2tp/chat:main` (KHÔNG phải GitHub Actions, không tạo token) để phát hành duy nhất `v21-bank-bill-event` lên project `vtqhbhrkdxirqeqkgylo`, **v36 → v37 ACTIVE**, `verify_jwt=false`. Trước deploy: duy nhất `bill-amount-rules.mjs` khác v36; các tệp worker khác và toàn bộ ingest v2 khớp main. Không triển khai lại ingest.
- **E4 independently verified:** Supabase `get_edge_function` read-back v37 ACTIVE và **6/6 tệp trùng byte-for-byte với commit main `b6305ba3`**. Kiểm tra read-only canonical: Cô Ngọc tt Agribank #269 ↔ ledger #849 vẫn **một** auto link và một ledger `-2000` nghìn; C Hà Trang #268 ↔ ledger #848 vẫn một manual link và ledger `-10157` nghìn; bill Ngọc vẫn `received/ledger_id=849`. Không có SQL write, nhắn tin, OCR lại khách hay thu bổ sung trong BANK-294.
- **E5 on-device/next real bill:** Chưa thử trực tiếp iPhone/PWA hoặc bill mới sau v37. Không tuyên bố một chứng từ khác đã tự thu nếu chưa có evidence ledger/link. Không cần thay cache Chat/PWA vì đây là logic server-side; không đụng giao dịch đã thu.
- **Rollback:** Revert main và phát hành source đúng branch sau Verify, giữ nguyên bút toán hợp lệ. Tài liệu vận hành `DEPLOYMENT_BANK_BILL.md`.

---

## 2026-11-12 — BANK-294 · Nhận cấu trúc ngày–KÝ TỰ–tháng, giờ phút nếu có

- **Mục tiêu theo yêu cầu:** AI đọc ngày trên mọi bill theo **ngữ nghĩa ngày / tháng** của Việt Nam, coi chuỗi chữ/ký tự nằm giữa hai số là **dấu nối**, không phải ngày hoặc tháng. Đọc giờ/phút nếu thật sự được in trên chính bill, đọc giây chỉ khi ảnh in giây; tuyệt đối không lấy đồng hồ iPhone/Android, ngày Chat, thời gian push, giờ chụp hoặc suy đoán năm còn thiếu.
- **E0 prior production:** `v21-bank-bill-event v36 ACTIVE` tại project `vtqhbhrkdxirqeqkgylo` đã xử lý thành công khoản Techcombank của Cô Ngọc tt, Agribank #269, ledger #849, dư nợ 98 triệu. **Không tái chạy bill/thu lại khoản này.**
- **E1 AI instruction:** Trong `SYSTEM_PROMPT`, phân rã `[số ngày] [ký tự/chữ phân cách] [số tháng] [phân cách] [năm khi có]`. Chỉ chấp nhận tháng 1–12, năm đầy đủ và ngày hợp lệ. Ký tự `/`, `.`, `-`, chữ `tháng`, `thg`, `th.`, `th`, `t` là dấu nối. Không tùy tiện xem chữ OCR lạ là dấu nối hợp lệ; dữ liệu không đủ thì `null`/review. Không đảo ngày-tháng theo MM/DD của Mỹ. Giờ có thể `9:17`, `9h17`, `9 giờ 17 phút`, `09:17:35`; không chế thêm `:00` giây.
- **E1 deterministic parser:** `bill-amount-rules.mjs` tách `splitPrintedBillDateClock` để hiểu dòng có cả `Ngày thực hiện: 12 thg 11, 2026 lúc 9:17`. Nếu AI không trả `transfer_time_printed_vn` riêng nhưng có giờ in cùng dòng ngày thì chỉ lấy **giờ thấy rõ đó**. Nếu cả hai nguồn giờ có mặt phải nhất quán từng phút và từng giây nếu cả hai cùng in giây; sai khác → `time_date_conflict`, không tự thu. Nếu không có giờ, dù có ngày, `bill_printed_time_missing` và không tự thu. Nếu thiếu năm, ngày không có thật, ký tự lạ, giữ `printed_date_invalid` và không thu. Giữ `verifiedBillDate` để chống 31/02, 00/13 tháng.
- **E2 regression:** `tests/test_bank294_structural_vn_date_clock_20261112.mjs` kiểm đủ numeric, chữ giữa nhiều dạng, label, fullwidth, inline HH:mm/HH:mm:ss, thiếu giờ, thiếu năm, giây khác nhau, sai giờ/date, chữ lạ, ngày đảo; xác minh cần bank event duy nhất và memo khớp khi model sửa ngày. Đăng ký trong `tools/verify_current.py` và Edge release workflow; không test giao dịch thật.
- **E3:** Phát hành chỉ sau Verify V21 PASS và merge từ branch riêng vào **`1sl2tp/chat:main`**. Kiểm tra đúng project `vtqhbhrkdxirqeqkgylo`, function `v21-bank-bill-event`, `verify_jwt=false`; đây chỉ thay parser+prompt, không sửa `v21-agribank-notification-ingest v2`. Nếu GitHub Actions không thấy secret, dùng quy trình ngoại lệ kết nối Supabase **đã được cấp quyền**, đối chiếu SHA/6 tệp trước-sau và ghi rõ không phải workflow Actions; không tự tạo token mới.
- **E4/E5 PENDING:** Không tuyên bố quy trình thực tế mới đã chạy cho bill khác cho tới khi Edge read-back + dữ liệu giao dịch sau thay đổi có bằng chứng. Chỉ xác minh bằng bài test mô phỏng, không có OCR hồi tố, không sửa ledger/DB, không gửi tin Chat/Zalo thử. Các collection #268/#269 đã hoàn tất, **không động vào**.
- **Rollback:** Revert PR + phát hành lại parser từ đúng main; không xóa/đảo bút toán đã hợp lệ.

---

## 2026-11-12 — BANK-293 E5 VERIFIED · Cô Ngọc tt 2.000.000đ tự thu ledger #849

- **E0–E2 ảnh và nguyên nhân:** Chứng từ Techcombank in **`12 thg 11, 2026 lúc 9:17`**; parser cũ không hỗ trợ `thg`, nên hai lần Gemini trước đều `printed_date_invalid`. Agribank credit **#269**, +2.000.000đ, thời gian ngân hàng **09:17 12/11**, notification được nhận 09:19:38 sau khi bill đã scan. BANK-291/292 bổ sung event-driven wake, BANK-293 bổ sung parser abbreviated month + kiểm tra clock conflict + tối đa 3 OCR lần tổng.
- **E2 CI:** BANK-293 PR [#255](https://github.com/1sl2tp/chat/pull/255) Verify V21 [43149280336](https://github.com/1sl2tp/chat/actions/runs/43149280336) **SUCCESS**; merge `main` commit `764be518ddcefec5e6cd71ba93ba8b36d22b5558` và main Verify [43149406709](https://github.com/1sl2tp/chat/actions/runs/43149406709) **SUCCESS**. GitHub Actions deploy job bị chặn bởi `SUPABASE_ACCESS_TOKEN` không hiện diện trong ngữ cảnh job; **không** yêu cầu tạo token mới hoặc đổi nhánh/project.
- **E3 deployment verified:** Dùng kết nối Supabase đã có theo ngoại lệ có kiểm soát để phát hành riêng **`v21-bank-bill-event v35 → v36 ACTIVE`** trên project `vtqhbhrkdxirqeqkgylo`, `verify_jwt=false`, đọc lại **6/6 tệp byte-for-byte trùng source `1sl2tp/chat:main`**. `v21-agribank-notification-ingest v2` đã khớp **3/3** source, không deploy lại. Nêu rõ đây không phải GitHub Actions job.
- **E4/E5 tài chính VERIFIED:** Sau preflight account/customer/amount/time/memo/số notification/0 linked collection, gọi **một lần** worker hiện có qua `net.http_post` với `chat_customer_summary_runtime_config().scan_key` được dùng server-side, tuyệt đối không trả token. HTTP request id **15272**, status HTTP **200**: `{"ok":true,"status":"received","amount_vnd":2000000,"ai_called":true,"ledger_written":true,"ledger_id":849}`. OCR mới đọc literal date **`12 thg 11, 2026`**, `printed_date_invalid=false`, `match_preview.status=candidate_unique`, receipt `ad364b30-9d8b-4e87-b642-83a36ab647b1` → **`received`** `ledger_id=849`, **`attempt_count=3` (giới hạn cuối)**.
- **Đối chiếu độc lập canonical:** `chat_bank_app_collection_links` có **đúng một** row nối bank notice **#269** ↔ receipt trên ↔ ledger **#849**; `chat_bank_manual_collections` #269 **0**; sổ `taphoa_debt_ledger.id=849` có `entry_type=collection`, `amount_vnd=-2000` (**đơn vị 1.000đ**), đúng customer `08a572fe-96e1-4cfb-bc3a-a736a9d66134`, tại **10:39:30 VN 12/11**. `balance_before_thousands=100000` (100 triệu) → `balance_after_thousands=98000` (**98 triệu**), khớp tin nhắn khách nói còn nợ 98 triệu.
- **Kết luận:** **ĐÃ TỰ THU 2.000.000đ THÀNH CÔNG; KHÔNG THU LẠI #269**. Các ghi chú cũ ở dưới ghi `review/chưa thu` là lịch sử trước **10:39:30 ngày 12/11**, đã được mục E5 này thay thế. Không gọi lại OCR, SQL để ghi tiền, không gửi lại tin/Zalo thử. E5 trên thiết bị iPhone/PWA chưa thao tác trực tiếp, chỉ xác minh canonical Supabase ledger, bill và link. Không khẳng định đã gửi tin xác nhận qua Zalo.
- **Lưu ý chung:** Các bill Techcombank khác dùng `thg` phải qua `verifiedBillDate`, đối chiếu giờ in, unique official Agribank credit và RPC chống trùng. Không thay quy tắc ngày VN, không tự deploy sai nhánh; xem `DEPLOYMENT_BANK_BILL.md`.

---

## 2026-11-12 — BANK-293 · Techcombank viết “12 thg 11, 2026 lúc 9:17” · Đối soát Cô Ngọc tt

- **E0 ảnh thực tế:** Ảnh của **Cô Ngọc tt** ngày 12/11/2026 cho thấy rõ `Ngày thực hiện: 12 thg 11, 2026 lúc 9:17`, không phải “12 tháng 11, 2026”. `thg` là cách viết tắt **tháng** của Techcombank. Agribank đã báo +2.000.000đ lúc 09:17, notice #269 nhận vào 09:19:38, đúng tên nội dung chuyển `DINH THI TUYET chuyen tien`, đúng tài khoản nhận. OCR gốc `ad364b30-9d8b-4e87-b642-83a36ab647b1` đã bị `printed_date_invalid=true`.
- **E0 production sau BANK-291/292:** Verify V21 PR/main PASS và 2 Edge functions production `v21-bank-bill-event v35 ACTIVE` (6/6 tệp khớp main), `v21-agribank-notification-ingest v2 ACTIVE` (3/3 tệp khớp main). Vì bank notice #269 đến trước khi sửa mã, đã gọi **một lần** worker có kiểm tra nguồn bank/duplicate qua scan key hiện có để quét lại ảnh. HTTP 200, `ai_called=true`, nhưng AI vẫn trả `status=review`, `reason=bill_printed_datetime_conflict`, `printed_date_invalid=true`. `attempt_count=2`, **ledger=NULL, 0 manual/auto links**; hoàn toàn không ghi thu hoặc gửi tin khách. Không được mô tả là đã thu.
- **Nguyên nhân thực sự:** Parser chỉ hỗ trợ từ đầy đủ `tháng`, không hỗ trợ dạng `thg` in rõ. Dấu phẩy đã được hỗ trợ trong BANK-291, nhưng chữ viết tắt bị bỏ qua; OCR đọc đúng ISO date và giờ, chỉ literal date bị loại. Dòng in có thể chứa luôn `lúc 9:17` trong một trường. Không được cắt bỏ giờ một cách âm thầm nếu khác `transfer_time_printed_vn`.
- **E1 bản sửa hẹp:** Trong `bill-amount-rules.mjs`, chỉ chấp nhận literal date đầy đủ dạng `DD thg MM, YYYY`, `DD thg. MM, YYYY` cùng với `DD tháng MM, YYYY`; bỏ suffix `lúc HH:mm` **chỉ khi hoàn toàn đúng định dạng** và kiểm tra chéo với giờ in riêng + giờ giao dịch model. Giữ `verifiedBillDate` kiểm tra ngày có thật, không mượn thời gian Chat/push. Cập nhật OCR prompt để chép ngày/giờ `thg` chính xác.
- **E1 giới hạn xử lý thực tế:** Với bill `review/bill_printed_datetime_conflict` cụ thể đã được đọc lại một lần trước khi nhận diện `thg`, cho phép tối đa **một lần cuối** khi `attempt_count=2`, không bao giờ khi `attempt_count>=3`, và vẫn yêu cầu duy nhất Agribank credit chính xác **số tiền, phút, account, memo**, không có ledger/manual/auto link, trong ngày VN. Đây là chỉ quyền **đọc lại ảnh**, không cho phép tự hạch toán nếu model tiếp tục không nhận được chứng từ thật. RPC `chat_bank_app_collect` vẫn độc lập quyết định tài chính.
- **E2:** Mở rộng `test_bank291_techcombank_comma_date_20261112.mjs` bằng **ảnh thực tế dùng `thg` và inline clock**, biến thể tháng/Thg. và phản ví dụ sai giờ/ngày; BANK-292 xác minh chỉ cho thêm đúng một lượt đọc và chặn vòng thứ tư. Verify V21 + release checks bắt buộc PASS.
- **E3–E5:** Chỉ merge khi CI PASS, worker deploy từ **`1sl2tp/chat:main`**, kiểm tra lại version/source, không deploy nhầm repo; ingest đã hoạt động ở v2 không cần sửa lần hai. Trước khi gọi worker recheck một lần cuối, phải kiểm tra ngay production còn **0** manual/auto links và không có ledger trùng; nếu có, DỪNG. Chỉ báo “ĐÃ THU” khi có real ledger/receipt link, tuyệt đối không cập nhật số dư bằng SQL thủ công. Không gửi tin/Zalo để test, không tạo token, không sửa production DB.
- **Rollback:** Revert riêng parser/rescan policy; không xóa bất cứ bút toán thu hợp lệ nào.

---

## 2026-11-12 — BANK-291/292 · Techcombank 2.000.000đ, lỗi ngày có dấu phẩy + Agribank báo chậm

- **E0 production read-only:** Cô Ngọc tt (`08a572fe-96e1-4cfb-bc3a-a736a9d66134`) gửi bill Techcombank thành công **2.000.000đ, 09:17 ngày 12/11/2026** vào tài khoản nhận Agribank. Bill receipt `ad364b30-9d8b-4e87-b642-83a36ab647b1` được scan **09:17:53 VN**, có `status=review`, `reason=bill_printed_datetime_conflict`, `raw_read.printed_date_invalid=true`, `amount_vnd=2000000`, tài khoản/người nhận/giờ/transfer memo đúng, nhưng OCR literal date bị loại. Agribank **notification #269** xác nhận **09:17** đúng 2.000.000đ, nhận lúc **09:19:38 VN** (đến sau khi AI đã quét). Kiểm tra lúc điều tra: chưa có manual/auto link và chưa ghi thu 2.000.000đ trong ngày.
- **Root cause A:** Parser `parsePrintedBillDate` chỉ hiểu `12 tháng 11 năm 2026`, không hiểu kiểu Techcombank **`12 tháng 11, 2026`** in trên bill. Nó biến một ngày rõ ràng thành `printed_date_invalid`; AI đọc được ISO datetime, nhưng `requiredAutoCollectEvidence` đúng chính sách chặn thu khi literal date bị gắn invalid.
- **Root cause B:** Bill được quét lúc 09:17:53 trước khi ngân hàng báo lúc 09:19:38. Worker `v21-bank-bill-event` đã có nhánh `amount_read` tái khớp với bank **khi được gọi lại**, nhưng luồng `v21-agribank-notification-ingest` không đánh thức worker sau khi lưu credit, còn cron `chat_bank_auto_collect_retry` chỉ lấy `candidate_unique`. Do đó bill quét sớm có thể mắc kẹt mãi.
- **E1 parser:** Nhận đúng ngày đầy đủ `DD tháng MM, YYYY` như `DD tháng MM năm YYYY`; giữ kiểm tra ngày tháng thực, không dùng ngày giờ Chat, đồng hồ điện thoại, thời điểm nhận push hoặc số tiền đơn thuần để suy ra bill. Hướng dẫn OCR bổ sung kiểu ngày Techcombank.
- **E1 event-driven owner:** Khi ingest một thông báo Agribank **mới, hợp lệ, đúng tài khoản nhận**, dùng `EdgeRuntime.waitUntil` đánh thức đúng `v21-bank-bill-event` theo ngày/giờ **in trong thông báo**, cùng số tiền, trong cửa sổ hạn chế; tối đa 4 ảnh ứng viên, không thêm cron/polling. Worker tái khớp bill `amount_read` bằng OCR đã lưu **không tốn thêm AI**. Nếu bill có **đúng lỗi printed_date_invalid**, bill chưa ghi thu, trong ngày và có **một** bank credit đúng số tiền/phút/tài khoản/nội dung memo chính xác, worker được đọc lại **chính ảnh** bằng AI tối đa một lần (attempt_count=1→2). Chỉ sau kết quả OCR hợp lệ mới được gọi RPC `chat_bank_app_collect`, vẫn giữ khóa chống trùng, date current-day, account/customer checks.
- **E2:** Có `tests/test_bank291_techcombank_comma_date_20261112.mjs`, `tests/test_bank292_delayed_bank_credit_recheck_20261112.mjs` (bao gồm các ca sai ngày/năm, tài khoản, số tiền, nhiều credit, sai memo, review invalid, quá ngày, quá lượt). Đã đăng ký `tools/verify_current.py` và khóa trong workflow phát hành Edge. Không tự gửi tin thử cho khách.
- **E3/E4/E5 PENDING ở thời điểm ghi chú:** Merge chỉ sau Verify V21 PASS, phát hành **đúng hai** function từ `1sl2tp/chat:main` lên project `vtqhbhrkdxirqeqkgylo`, đọc lại version/mã nguồn Edge sau deploy. Không tuyên bố khoản 2.000.000đ đã thu cho đến khi xác minh `ledger_id`, `notification_id=269`, không có manual/auto duplicate. Tái kích hoạt một lần đã có bằng chứng ngân hàng có thể dùng luồng gọi worker nội bộ, không tự sửa raw_read hoặc sổ nợ bằng SQL trực tiếp.
- **Bảo vệ:** Không can thiệp cron, login, PWA, tập tin ảnh, source repo khác, không viết ledger trực tiếp, không làm mất xác thực admin; nếu không có bằng chứng độc lập hoặc đã có manual collection thì giữ `review`. Không chạm khoản C Hà Trang #268 đã thu.
- **Rollback:** Revert PR qua main và phát hành lại đúng hai Edge function (không sửa dữ liệu đã thu hợp lệ). Nguồn duy nhất `1sl2tp/chat:main`, đọc `DEPLOYMENT_BANK_BILL.md`.

---

## 2026-11-12 — BANK-290 · C Hà Trang 10.157.000đ ĐÃ THU THỦ CÔNG (PRODUCTION VERIFIED)

- **E0 thời điểm xác minh:** 12/11/2026 khoảng 07:45 (giờ Việt Nam) đọc trực tiếp canonical Supabase `vtqhbhrkdxirqeqkgylo`. Giao dịch ngân hàng Agribank **#268**, chuyển **21:53 ngày 11/11/2026**, số tiền **10.157.000đ**, khớp đúng khách **C Hà Trang** (`10ca2a81-0a93-4668-9682-31d8395c5770`).
- **E3 ghi thu đã tồn tại, KHÔNG PHẢI assistant ghi mới:** Admin đã xác nhận thu thông qua `public.chat_bank_manual_collect` lúc **07:43:27 VN ngày 12/11/2026**. Canonical `public.taphoa_debt_ledger.id=848` là `entry_type=collection`, `amount_vnd=-10157` (đơn vị sổ 1.000đ = **10.157.000đ**), `customer_account_id` đúng C Hà Trang, ghi chú có `Agribank #268 (11/11/2026 21:53)`. `chat_bank_manual_collections` có **1** liên kết `notification_id=268, ledger_id=848, mode=collected`; `chat_bank_app_collection_links` có **0**, do đây là **thu thủ công, không phải thu tự động**.
- **E4 độc lập đối chiếu an toàn:** Số tiền, khách hàng, ngày và phút chuyển trên bill `88706591-590e-4acb-8911-338ac1cd0ef7` trùng với thông báo Agribank #268; bút toán #848 có số âm đúng quy đổi, đúng khách, đúng `collection`. Chỉ có **một bút toán ledger** chứa `Thu Agribank #268`, một manual link và một notification Chat `client_id=taphoa:bank-manual:268:collection` lúc 07:43:27. Nội dung tin Chat cho C Hà Trang ghi **ĐÃ THU 10.157** (đơn vị 1.000đ), **nợ sau = 0**. Không có bằng chứng trong kiểm tra này rằng Zalo đã gửi; không tự gửi bổ sung.
- **E5 điều kiện UI:** Ảnh bill OCR vẫn `status=amount_read, ledger_id=NULL`, vì manual link là **đối soát bên Agribank/ledger**, KHÔNG phải liên kết receipt-to-ledger của chế độ auto. **Không được hiểu `amount_read` là chưa ghi thu và tuyệt đối không ghi thêm!** UI có `matchingManualCollectionForBill` hiển thị khoản thu tay cùng khách/số tiền/ngày, nêu rõ bill ảnh chưa liên kết; trường hợp này có đúng 1 bill và 1 bank manual link đủ điều kiện đối chiếu UI. Không tự đặt bill thành `received`, không tạo auto link/ACK giả; nếu cần xác minh bill sâu hơn thì dùng luồng chứng cứ riêng, không thu thêm.
- **QUY TẮC ƯU TIÊN CHO CÁC VÒNG SAU:** Khoản #268 **ĐÃ THU**, ledger **#848**, đã có tin xác nhận Chat; các ghi chú BANK-287/BANK-289 cũ ghi “chưa thu” là trạng thái **lịch sử trước 07:43 12/11** đã bị thay thế bằng mục BANK-290 này. Chỉ thực hiện read-only audit; không retry, backfill, manual collect hay gửi tin lần hai. Giữ nguyên token/kết nối, triển khai đúng `1sl2tp/chat:main` theo `DEPLOYMENT_BANK_BILL.md`.
- **Mức độ hoàn tất:** Financial ledger/Chat notification **E4 VERIFIED**. E5 iPhone/PWA hiển thị trên thiết bị thật và Zalo delivery **NOT VERIFIED**; không nói quá bằng chứng. Không cần deploy hay sửa production DB cho incident đã thu.

---

## 2026-11-12 — BANK-289 · Lựa chọn khách từ bill đúng phút trong đối soát khoản thu cũ

- **E0 production (read-only):** Agribank notice #268 C Hà Trang nhận **10.157.000đ lúc 21:53 VN ngày 11/11/2026**; ảnh bill OCR `88706591-590e-4acb-8911-338ac1cd0ef7` status `amount_read`, chưa có `ledger_id`, 0 manual/auto collection links. Edge `v21-bank-bill-event` v34 ACTIVE đã có BANK-287 nhưng không tự ghi thu bill cũ ngày 12/11 do DB guard chặn qua ngày.
- **E0 vấn đề UI:** `bank-report-dashboard.js` hiển thị ứng viên bill trong dòng tiền Agribank nhưng cửa sổ **Thu sau khi xác minh** bắt Admin tìm lại khách từ đầu, tăng rủi ro chọn nhầm khi nhiều tên gần giống.
- **E1 sửa nhỏ, một owner frontend:** `bankBillCustomerSuggestion` chỉ đưa ra **gợi ý duy nhất** khi (1) đúng một bill chưa liên kết, (2) cùng số tiền, (3) **cùng phút giao dịch in trên bill và ngân hàng**, (4) cùng ngày Việt Nam, (5) đuôi tài khoản nhận `99999`, (6) có customer/asset/receipt hợp lệ và không nghi đảo ngày. Không suy luận từ giờ gửi Chat hoặc số tiền đơn lẻ. Dòng Agribank chưa thu hiển thị rõ **đây không phải xác nhận thu**.
- **E1 Admin UI:** Hộp thoại thu mở gợi ý `Chọn khách theo bill` nhưng chỉ chọn khi **Admin nhấn nút** và khách vẫn có trong kết quả `chat_bank_manual_collection_prepare` từ phiên Admin hiện tại. Ghi chú chỉ thêm tham chiếu bill sau khi Admin nhấn gợi ý. Vẫn yêu cầu xác nhận đã kiểm tra chứng từ và `chat_bank_manual_collect` với session Admin + chống ledger trùng. Ứng viên không duy nhất/thiếu phút/sai ngày/sai tài khoản thì bỏ gợi ý, nhập khách như trước. Không tự thu, không tạo tin nhắn hay AI call, không thay SQL/cron/Edge.
- **E2/E3 verified 12/11:** `tests/test_bank289_historical_verified_bill_suggestion_20261112.cjs` kiểm thử trường hợp C Hà Trang và sai giờ/số tiền/ngày/tài khoản/khách/trạng thái/ứng viên trùng, khóa không có RPC ghi tiền trong helper, buộc click và checkbox Admin. Đã xử lý kiểm thử hồi quy BANK-194/222/232 để giữ hợp đồng cũ; PR [#251](https://github.com/1sl2tp/chat/pull/251) merge commit `062fb9d3af70c54bdcb2c180a7b08aa1220b6725`. PR Verify V21 [43128747439](https://github.com/1sl2tp/chat/actions/runs/43128747439) SUCCESS; main Verify V21 [43128915947](https://github.com/1sl2tp/chat/actions/runs/43128915947) SUCCESS; automatic Deploy Chat Pages [43128915842](https://github.com/1sl2tp/chat/actions/runs/43128915842) SUCCESS.
- **E4/E5 giới hạn:** CI trên PR/main và GitHub Pages job đã PASS, nhưng chưa điều khiển phiên iPhone PWA/Admin thực tế hoặc tải được asset công khai từ môi trường kiểm tra để xác nhận sự xuất hiện của nút trên thiết bị. Bút toán 10.157.000đ **vẫn chưa được ghi thu**; chủ sở hữu/Admin cần xác nhận trong Chat để hoàn tất, không bypass session Admin qua kết nối Supabase. Không manually deploy; không xóa cache/đăng xuất.
- **Rollback:** Revert thay đổi JS/UI + test từ `main`; dữ liệu tiền và receipt ngân hàng không bị thay đổi.

---

## 2026-11-12 — BANK-287 v34 · Production release verified; historical collection remains pending

- **Bối cảnh và yêu cầu phát hành:** Chủ sở hữu liên tục yêu cầu tiếp tục sửa lỗi và xác nhận token kết nối Supabase đã có. GitHub nguồn chuẩn là `1sl2tp/chat:main` (BANK-287 PR #248, BANK-288 runbook/CI PR #249; main release commit `97e63112462cbaea48df836a127e504d14b58ea8`). Workflow GitHub Actions vẫn phụ thuộc secret `SUPABASE_ACCESS_TOKEN` trong ngữ cảnh runner, không suy diễn từ việc kết nối Supabase của ChatGPT đã được cấp quyền. Không tạo hoặc ghi token mới.
- **E0/E1/E2:** OCR bill C Hà Trang 10.157.000đ ngày **11/11/2026 21:53 VN** đọc đúng tiền, bank credit #268 21:53 đúng tài khoản nhưng tiền tố định tuyến bank `QR - ` làm strict memo compare trả `ocr_date_corrected_bank_memo_unverified`. Sửa duy nhất `bill-app-preview.mjs` nhận đúng một prefix QR ở đầu bank memo và buộc phần còn lại khớp hoàn toàn, giữ RPC chống trùng. CI `Verify V21` cho PR #248 và #249 đều PASS; thử nghiệm BANK-287 fail-closed khi sai account/amount/time/memo.
- **E3 deployment:** Đã dùng **kết nối Supabase có sẵn** để thực hiện **một lần phát hành Edge trực tiếp, có đối chiếu tệp**, sau yêu cầu tiếp tục thực hiện; đây là ngoại lệ vận hành so với workflow GitHub Actions chuẩn và phải ghi rõ, không mô tả là GitHub Actions deploy. Chỉ đích `vtqhbhrkdxirqeqkgylo`, function `v21-bank-bill-event`, `verify_jwt=false`. Preflight: 4/5 tệp production v33 **giống hoàn toàn** với source `main`, đúng tệp `bill-app-preview.mjs` còn thiếu BANK-287. Triển khai đúng cả năm tệp `main` và nhận `ACTIVE version=34`, `ezbr_sha256=1a9a4611b6101537b71dbbf4f93d4c7eca2e3340b5edd92368d7ed87588ca4b6`. Không deploy nhầm repo/nhánh/project.
- **E4 read-back VERIFIED:** Supabase `get_edge_function` version **34 ACTIVE** và độc lập so sánh từng tệp sau triển khai **5/5 byte-for-byte giống main**, `bill-app-preview.mjs` chứa BANK-287, JWT mode vẫn `false`. Không thay đổi SQL, schema, cron, tài khoản, ledger hoặc gửi tin nhắn/Zalo trong lần phát hành.
- **E5 nghiệp vụ chưa kết thúc:** Dữ liệu vừa kiểm tra lại: receipt `88706591-590e-4acb-8911-338ac1cd0ef7` vẫn `amount_read`, `ledger_id=NULL`, notification #268 có **0** auto links và **0** manual links. Không có bút toán thu 10.157 trong sổ khách theo kiểm tra phạm vi ngày 11–12. Writer `chat_bank_app_collect` cấm thu tự động qua ngày; **v34 không được gọi ghi thu lại bill ngày hôm trước**. Admin cần đối chiếu và thao tác `Thu sau khi xác minh` trên giao dịch #268 cho **C Hà Trang** qua UI/RPC `chat_bank_manual_collect`. Không sửa trực tiếp production DB để bypass quyền Admin hoặc thay dấu vết chứng từ. Future real customer QR receipts/on-device E5 chưa kiểm thử.
- **Quy tắc tiếp tục:** Không redeploy v34 lần nữa chỉ để thử; phát hành sau này ưu tiên workflow GitHub Actions chính thức từ `1sl2tp/chat:main`. Nếu Actions thiếu secret trong job, kiểm tra quyền/ngữ cảnh secret, không tạo token mới, không âm thầm dùng connector thay thế. Bằng chứng v34 không chứng minh secret của Actions đã hoạt động. Xem [DEPLOYMENT_BANK_BILL.md](./DEPLOYMENT_BANK_BILL.md).

---

## 2026-11-12 — BANK-288 · Token có sẵn, khóa đích triển khai Edge OCR vào đúng chat/main

- **Yêu cầu mới của chủ sở hữu:** Token/kết nối đã có sẵn. Ghi quy tắc triển khai vào ghi chú dự án để sau này không báo thiếu token chung chung, không tạo token mới và nhất là không lấy nhầm source từ repo/nhánh khác.
- **Nguồn duy nhất:** `1sl2tp/chat:main`, chỉ sau PR + Verify V21 PASS; function `supabase/functions/v21-bank-bill-event/`, project `vtqhbhrkdxirqeqkgylo`, slug `v21-bank-bill-event`. KHÔNG dùng `1sl2tp/taphoaxyz`, `1sl2tp/1988`, nhánh fix/backup hoặc deploy thủ công để bù workflow. Hướng dẫn đầy đủ: [DEPLOYMENT_BANK_BILL.md](./DEPLOYMENT_BANK_BILL.md).
- **Phân biệt token:** Supabase connector của tài khoản đang được xác thực, nhưng GitHub Actions yêu cầu secret `SUPABASE_ACCESS_TOKEN` trong chính repo; không có bằng chứng job Actions đã truy cập được nó. Báo lỗi “secret chưa có trong job” không có nghĩa token không tồn tại ở nơi khác. Tuyệt đối không lưu giá trị token vào code/log/docs. Không đổi cơ chế deployment hoặc bypass gate.
- **E1 workflow guard:** Workflow `Deploy Bank Bill OCR Edge` reject mọi `GITHUB_REPOSITORY` khác `1sl2tp/chat`, mọi `GITHUB_REF` khác `refs/heads/main`, checkout đúng `GITHUB_SHA` và kiểm tra commit hash trước test/deploy. Đầu ra GitHub Actions summary chỉ gồm repo/ref/SHA/project/function; không in token. Cùng workflow phải chạy thêm regression BANK-287 (QR prefix) và BANK-288 (đích triển khai). Credential gate fail-closed trước khi gọi Supabase CLI.
- **E2/E3:** Nhánh thay đổi `fix/deploy-guard-main-only-bank287-20261112`, PR/CI theo workflow đang cập nhật; **chưa đánh dấu production deployed khi chưa kiểm tra Edge version + source thực tế**. Không sửa production DB hoặc ledger, không phát tin/Zalo để kiểm thử.
- **Giao dịch liên quan:** Khoản 10.157.000đ 11/11 của C Hà Trang vẫn cần xác nhận ghi thu thủ công qua Admin vì đã qua ngày; sửa QR memo không tự ghi bù theo chính sách ngày hiện tại. Không ép bút toán thủ công qua SQL.
- **Rollback:** Revert workflow/docs/test qua PR trên `main`, bảo toàn `verify_jwt`, không chạm dữ liệu tài chính.

---

## 2026-11-12 — BANK-287 · Agribank QR routing memo blocks C Hà Trang 10.157.000đ

- **E0 actual incident (read-only Supabase):** 11/11/2026 21:53 VN, C Hà Trang uploaded a successful VietinBank transfer bill **10.157.000đ** (receipt `88706591-590e-4acb-8911-338ac1cd0ef7`, `status=amount_read`, `ledger_id=NULL`). Official Agribank credit notification **#268** for the same amount/minute and destination account was received at 21:54. AI OCR memo `Ha Trang chuyen khoan nhanh qua Zalo` vs Agribank memo `QR - Ha Trang chuyen khoan nhanh qua Zalo`. The bill has a cropped recipient account and correctly requires independent bank memo evidence, but `match_preview.reason=ocr_date_corrected_bank_memo_unverified` prevented `candidate_unique`. `chat_auto_collect_settings.enabled/ready=true`, no app collection link, no manual collection link, and no same-amount ledger entry for that customer was present during investigation.
- **Root cause/owner:** `supabase/functions/v21-bank-bill-event/bill-app-preview.mjs::previewBillAppMatch` compared fully normalized bank/bill memos verbatim. The official bank adds an anchored QR routing marker absent from the payer's successful transfer receipt. This is **not** a 20:00/08:00 collection activation rule. `chat_bank_app_collect` intentionally denies cross-day auto-collection, while 08:05 VN cron is a separate yesterday-only notice sender.
- **E1 patch:** For the bank side only, strip **one leading** `QR - `, `QR: ` or `QR – ` (with spaces) before exact normalized memo comparison. Keep the original exact comparison as first option. Do not allow arbitrary prefix/suffix/substring matching; keep destination/account, bank package, amount, unique minute/event, evidence tier, anti-duplicate and DB financial RPC unchanged. No new polling, retries, AI call, DB mutation, customer message or manual deploy.
- **E2 tests:** Added `tests/test_bank287_agribank_qr_memo_20261112.mjs` to `tools/verify_current.py`, with real-shaped anonymized fixture and negative cases: wrong memo extension/recipient/bank/amount/minute/date/package, duplicate bank notifications and untrusted prefix. **Verify V21 PR run [43123885980](https://github.com/1sl2tp/chat/actions/runs/43123885980) SUCCESS** on code/test commit `ffa282da`; documentation-only follow-up requires fresh CI.
- **E3 source PR:** [#248](https://github.com/1sl2tp/chat/pull/248) in dedicated fix branch; **Edge code deployment separately pending**, not equivalent to GitHub Pages or source merge. Last known production bank-bill Edge was v33. Do not report live bill collection until actual deployed Edge is verified.
- **E4/E5 existing 11/11 transfer:** Source fix **cannot** retroactively auto-post #268 on 12/11 because the guarded financial writer requires today's date. The historic amount must be separately admin-confirmed using the existing `chat_bank_manual_collect` UI/RPC with double-entry checks and without direct production ledger edits, or remain pending review. No money/status changed in this patch; no real customer messages sent. Real future QR case and on-device E5 not yet observed.
- **Rollback:** Revert PR/source and its test registration using normal controlled release. Any manually confirmed financial ledger must **not** be rolled back by reverting code.

---

## 2026-11-11 — IMG-286 · Two verified sideways photos in the C Sâm pl gallery (CI / PAGES PASS)

- **E0 screenshot:** Desktop Chat photo route `#/photos` with C Sâm pl, album grouped by Asia/Ho_Chi_Minh dates. Two first 10/11 thumbnails visibly sideways (Excel green toolbar and a three-number grid), while the customer reported these two also wrong when opened in the viewer. Uploaded screenshot includes two sideways previews; enlarging/rotating those previews *counterclockwise 90°* makes the Excel toolbar and number rows readable. No original JPEG bytes accessed.
- **E0 independent source:** Read-only Supabase metadata query scoped to the conversation confirmed two different JPEG assets received **2026-11-10 22:26:53** and **22:26:06 VN**, both 864 × 1920 px. They align with the two newest 10/11 gallery thumbnails. A separate image from Hỗ trợ was sent on **2026-11-11 20:22:06 VN**, size 528 × 744 PNG, and does not need rotation. Other 11/11 customer images remain unchanged.
- **Root cause:** `chat-image-orientation.js::readRotation` persisted corrections only in localStorage per-device. Neither `customer-photo-library.js` square thumbnails nor another Web/PWA installation knew a rotation from the first device. Prior IMG-281 corrected per-image bubble geometry after a manual tap but did not preset these two sideways historical assets.
- **E1 patch:** Exactly two verified asset IDs now have a source-level `270° clockwise = 90° counterclockwise` display baseline in `VERIFIED_PHOTO_ROTATION_DEFAULTS`. Existing explicit per-device rotation choice takes priority and the native viewer still offers left/right buttons. `V21ImageOrientation.readRotation` is exposed to `customer-photo-library.js`, which applies the same angle to the two square thumbnails with `object-fit:contain`, updating only matching thumbnail when the user manually changes an angle. `sw.js` public shell epoch bumped `pwa-chat-two-photo-rotation-img286-20261111`. No original file/EXIF rewrite, no production DB write, no new RPC, polling, media fetch, message send or account/logout effect. Normal photos and album geometry are unchanged.
- **E2:** Added `tests/test_img286_two_verified_20261110_photo_rotations.cjs` wired into `tools/verify_current.py`. Runtime VM checks exactly two baseline rotations, no change to other media, explicit user override, localStorage-denied fallback, gallery thumbnail correction, event-driven single-tile sync, and viewer angle; existing IMG-281 geometry regression updated. [Verify V21 #43030171810](https://github.com/1sl2tp/chat/actions/runs/43030171810) **SUCCESS**.
- **E3:** [Deploy Chat Pages #43030171822](https://github.com/1sl2tp/chat/actions/runs/43030171822) **SUCCESS**, including canonical verification and custom-domain check. Web/PWA gets the source-level fix on next normal public-shell update; user should not need to clear private media/cache or sign in again.
- **E4/E5 pending:** Actual authenticated photo viewer on the user's desktop/iPhone PWA has not been controlled or visually checked after publishing. The two thumbnail pixels were verified from screenshot, but the viewer result must not be overstated as live-device tested. No automated native OCR or universal orientation guessing was added, consistent with F-135's no-guess policy.
- **Rollback:** Revert the two verified rotation baselines and gallery adapter plus the public-shell cache epoch via normal GitHub Pages, without touching original JPEGs, DB, or existing manual rotation preferences.

---

## 2026-11-11 — CHAT-UPDATE-MEDIA · Preserve active playback during updates

- **E0 SPEC:** Given a playing/buffering audio or video message, when the user taps Cập nhật, do not navigate or interrupt playback. Once paused or ended, allow explicit update if all other guards pass. Owner: `app-update-controller.js::safeToReload`. `app.js` renders message audio outside call/recording interaction modes; the updater previously allowed it. Reproduced with a failing actual-updater VM test before patch.
- **Patch:** Read native media paused/ended state before allowing reload; do not change playback or fetch media. Explain that ongoing tasks/media must finish or pause. Include existing manual-update regression in canonical verifier as well as CI.
- **MUST-STAY:** Draft, attachment, reply, recording, call, sync, interaction and authenticated automatic-reload guards unchanged; same release identity and polling cadence. No messages, DB writes, new network requests or cache purge.
- **E1/E2 PASS:** Full canonical verifier, TypeScript migration check, explicit update UI runtime, fresh-navigation/offline fallback and diff checks pass. Regression covers audio/video playing, buffering, paused, ended and update click while preserving draft/call protections.
- **E3 PASS:** [PR #247](https://github.com/1sl2tp/chat/pull/247) merged as `41d83558f9cd8cfb9a672a0a5d770a1c6225549c`. PR Verify [43006177865](https://github.com/1sl2tp/chat/actions/runs/43006177865), main Verify [43006343626](https://github.com/1sl2tp/chat/actions/runs/43006343626), automatic Pages [43006343266](https://github.com/1sl2tp/chat/actions/runs/43006343266) SUCCESS.
- **Live artifact PASS:** HTTPS HTML and version.json both match build `5aa70d908f54627814025bf58f07a84ed0d7f3e330a29ca143ec2a5d41e07cf2`; HTML SHA-256 matches manifest and contains the playback guard. No manual deploy or business data writes.
- **E4/E5 pending:** Actual authenticated browser/iPhone PWA playback plus update click not exercised; runtime VM tests and live artifact checks are not on-device behavior acceptance. Real traffic measurements pending.
- **Rollback:** Revert this guard/test change and regenerate canonical artifacts via existing workflow. Self-review only; no independent review claimed.

---

## 2026-11-11 — CHAT-UPDATE-TIMEOUT · Recover stalled release checks

- **E0 / SPEC:** Given a Web/PWA version request whose headers or JSON body never settle, when the 10-second deadline expires, release the single-flight check and allow the next existing foreground/online/interval event to check again. Owner: `app-update-controller.js`. Reproduced with two failing runtime tests before patch.
- **Patch:** Bound manifest fetch and JSON parsing together; abort obsolete network work, emit `version_timeout`, clear the deadline on all outcomes, ignore late responses. No immediate retry and no new polling owner.
- **MUST-STAY:** Draft/call/authenticated-session reload guards, visible update prompt, release identity and existing 45-second cadence unchanged. No business RPC, DB writes, message send or private cache deletion.
- **Tests:** Existing canonical suite passed before patch. Added hanging headers/body, concurrent-check coalescing, abort, next-trigger recovery, timer cleanup and late-response isolation. Full `python tools/verify_current.py` PASS after patch; updater suite 10/10 PASS. Self-review and `git diff --check` PASS. Build ID: `cd1e48cb3f041000baea261265b505603a34fdca2bd4ca7b1811bdee1f3242bd`.
- **E3 RELEASE PASS:** PR #246 merged as `4b7ca583b0ec1fdeee19f80399ccb02c068e5994`. PR Verify [43001875734](https://github.com/1sl2tp/chat/actions/runs/43001875734), main Verify [43002075692](https://github.com/1sl2tp/chat/actions/runs/43002075692), and automatic Pages [43002075607](https://github.com/1sl2tp/chat/actions/runs/43002075607) all SUCCESS. No manual production deploy or business data writes.
- **E4 scoped live proof:** HTTPS entry document and version.json both serve expected build `cd1e48cb3f041000baea261265b505603a34fdca2bd4ca7b1811bdee1f3242bd`; document SHA-256 matches manifest and deployed HTML contains the timeout patch. Cloud Chrome opens the guest login screen on that build; no application-origin console error observed (one unrelated browser-extension metadata error). This is not authenticated/iPhone acceptance.
- **E4/E5 remaining:** Stalled network recovery verified in deterministic runtime tests, not a live browser network-fault test. Local Chromium could not launch due environment socket restrictions. Physical iOS PWA, authenticated update banner and real traffic measurements remain PENDING. Existing cadence and no-immediate-retry behavior covered by source/tests.
- **Rollback:** Revert this updater change and its regression tests; rebuild canonical HTML/manifest through the existing workflow.

---

## 2026-11-11 — UI-285 · iPhone punctuation/soft-wrap Composer jitter (SOURCE / CI / PWA PUBLISH VERIFIED)

- **E0 screenshot:** iPhone PWA conversation E Quyên dv (06:13 VN) shows software keyboard and the normal native input accessory; user reports the Composer already wraps naturally but appears to shake/reposition after a period during long text entry. Screenshot alone cannot prove exact timing/frame jitter.
- **Root-cause evidence:** `index.source.html #measure` (the hidden line-count mirror) used `overflow-wrap:break-word`, while the actual mobile `#editor` used `overflow-wrap:anywhere`. `app.js::autoGrow` measured narrow one-row width and switched to full-width expanded rows, but only remeasured width during a **later** ResizeObserver frame, allowing an intermediate wrong-height paint. Unconditionally appending a U+200B sentinel and shrinking on any punctuation/predictive-text reflow further contributed to geometry changes.
- **E1 fix:** `#measure` now uses `overflow-wrap:anywhere`, and copies the editor's CSS `white-space/word-break/overflow-wrap/tab-size`. Only explicit trailing newlines get a zero-width sentinel. On initial expansion, the natural height is recomputed from the true wider textarea width **in the same turn**, before painting; no second corrective row height a frame later. Appending a character/punctuation or changing the last predictive/IME suffix cannot shrink an already expanded mobile textarea unless the real viewport cap changes. Explicit deletion/replacement, clearing the draft, and breakpoint changes can shrink normally. Keep native textarea value and caret, IME owners, buttons, 168px cap, keyboard owner and ScrollRoot intact.
- **E2:** New `tests/test_ui285_ios_composer_punctuation_stability_20261111.cjs` added to `tools/verify_current.py`. Regressions exercise original `autoGrow` with a narrow-to-wide textarea, punctuation after a multiline entry, height writes, true trailing newline, draft/caret preservation, reset and CSS parity. Existing UI-268/UI-273 and keyboard/ScrollController tests remain. [Verify V21 run 42922855598](https://github.com/1sl2tp/chat/actions/runs/42922855598) **SUCCESS**.
- **E3:** User-facing `app.js` + `index.source.html` published in [Deploy Chat Pages run 42922376532](https://github.com/1sl2tp/chat/actions/runs/42922376532) **SUCCESS**; `sw.js` bumped public shell epoch to `pwa-chat-composer-punctuation-ui285-20261111` to make installed iPhone PWAs receive the fresh public app shell without private data deletion or forced logout, [final Pages run 42922855489](https://github.com/1sl2tp/chat/actions/runs/42922855489) **SUCCESS**.
- **E4/E5 pending:** No controlled on-device iOS typing video/profiler; CI and Page publish cannot prove subjective physical smoothness. The iOS keyboard's native up/down/check accessory visible in the screenshot is not a Chat toolbar; leave native keyboard controls untouched.
- **Rollback:** revert the mobile auto-grow/punctuation mirror and shell cache epoch through canonical Pages workflow. No Supabase/RPC/DB/Realtime changes, extra polling or new network requests.

---

## 2026-11-11 — NAV-284 · Mobile chat back chevron returns directly to Danh bạ (SOURCE / CI / PAGES VERIFIED)

- **E0 screenshot:** In iPhone PWA, user taps the top-left visible **‹** inside a customer conversation (C Hà Trang), but the app opens an unrelated account menu (Danh bạ / Tài khoản / Cài đặt / Thoát) instead of going straight to the contact directory.
- **Root cause:** `mobile-ui-polish.css` draws a back chevron in place of the regular menu glyph whenever an authenticated contact is selected. The delegated mobile header handler in `work-customer-summary.js::bindMobileNavigationClicks` still unconditionally called `toggleMobileAccountMenu()` for the shared `[data-shell-command="sidebar.open"]` control. The visual action and runtime action were not the same.
- **E1 fix:** `mobileHeaderReturnsToDirectory()` gates on mobile + authenticated + Chat route + selected contact + directory not already visible. The same button then calls `showMobileDirectory('header-back')` and **never opens the account menu**; after returning to Danh bạ the control regains menu behavior. Preserve existing `navigation.clearActiveContact` and last selected contact memory; no conversation data is deleted, no sign-out or extra message request owner. Sync header `aria-label` and remove menu-only `aria-haspopup/aria-controls/aria-expanded` while it is a back control. `shell.js::renderMenuUnread` respects this label even after unread changes. On desktop, guest, Work route, or directory root, old button semantics remain.
- **E2:** Added `tests/test_nav284_mobile_back_to_directory_20261111.cjs` with real delegated click VM cases: authenticated customer Chat → Danh bạ, directory root → account menu, no contact → menu, Work → menu, guest fallback → menu, desktop remains unhandled by mobile owner; plus ARIA and no focus/menu mutation guards. Canonical [Verify V21 42918919510](https://github.com/1sl2tp/chat/actions/runs/42918919510) **SUCCESS**. While finishing, recovered a pre-existing TypeScript TS2339 from IMG-281 by giving the orientation Window bridge an optional JSDoc type; updated its locked regression.
- **E3:** User-visible JavaScript owner commits `66499068` and `97c4429a`, included in [Deploy Chat Pages 42918232530](https://github.com/1sl2tp/chat/actions/runs/42918232530) **SUCCESS**. Follow-up tests/typed annotation are source-only and do not alter the mobile back runtime; no database, Zalo, or ledger changes.
- **E4/E5 pending:** Test+GitHub Pages proves build/deploy, not an on-device manual click. No remote authenticated iPhone session was controlled. PWA shell should pick up the published source through its standard version detection; do not force refresh/logout or purge private cache.
- **Rollback:** Coordinate reverting the mobile delegated click and back trigger semantics, not just the visible chevron; preserve directory-state and account-menu focus ownership.

---

## 2026-11-11 — BANK-282 · Daily verified Agribank transfer summaries, ONLY real payers, 1,000-VND units (PROD SOURCE VERIFIED)

- **User specification:** Every morning after 08:00 VN, send ONE per-customer daily transfer-reconciliation notification **only to customers who actually transferred money yesterday and whose Agribank event has a valid linked collection ledger**. Customers without a transfer receive nothing, even if they owe money. **No .000đ suffix**: amounts are in **nghìn đồng**, so 400, 977, 5.634, 10.000. Do not include ordinary cash/manual cash collections. Multiple qualifying bank transfers for one customer appear as separate clock/amount lines in the same message, plus the sum.
- **E0 source discovery:** `public.chat_bank_app_collection_links` references `chat_bank_bill_receipts(status=received)` and `taphoa_debt_ledger(entry_type=collection)`; independently bank-linked manually confirmed transfers use `chat_bank_manual_collections(mode=collected/linked_existing)` referencing the same official bank notification and ledger. Existing `taphoa_chat_notify_customer` enforces global/typed/per-customer opt-in and Chat + linked-Zalo transport; use it unchanged. **10 Nov 2026** audited source had **19 verified bank transfers across 5 customers** including **2 manually verified bank transfers**; no cash entries, no unmatched bill, no unrelated debtor. Total exact 47,537,000 VND = 47.537 in reported thousand-unit format. All five were opted in during the audit.
- **E1/E3 Supabase:** Migration `20261110222651_bank282_yesterday_verified_transfer_customer_summary_0805`, corrected by `20261110223319_bank283_manual_historical_date_and_sum_of_displayed_thousands`, are applied and versioned under `supabase/migrations/`. Private `v21_private.taphoa_bank_daily_transfer_rows(date)` filters on bank `transfer_at` in Asia/Ho_Chi_Minh (not the ledger insertion date), official Agribank device/account, received bank event, one reconciled ledger matching the customer and amount, non-own transfer and live customer. No bank-only, unlinked, unrelated cash, or generic debt notices. `taphoa_bank_daily_fmt_thousands` drops sub-1,000 dong for display; totals add rounded-down per-event display units, while the underlying bank and ledger remain exact. Body explicitly identifies the selected day, does not falsely label arbitrary manual dates `hôm qua`. More than 60 bank events in one customer/day are summarized as a count plus first 60 lines.
- **Daily sender:** Private `v21_private.taphoa_bank_daily_dispatch()` scheduled by `cron.job` `taphoa-bank-prevday-confirmed-0805-vn` (job 32, active, `5 1 * * *` UTC = **08:05 ICT**). It passes `yesterday = current_vn_day - 1`, never sends outside **08:05–19:59**, and uses deterministic per-customer-per-date `client_id` and advisory lock to prevent repeat sends. Sender is the existing active Chat admin; `chat_outbound_allowed` revalidates the recipient before send; the existing `taphoa_chat_notify_customer` owns Chat/Zalo event propagation. No new network sender or frontend polling; just one database cron a day.
- **Admin manual control:** In `bank-report-dashboard.js`, `index.source.html`, and `bank-report-dashboard.css`, **Gửi đối soát CK** opens a focus-trapped preview per day/customer and shows the short amounts in nghìn đồng. An explicit `window.confirm` is required for each per-customer manual send. The two public RPCs `chat_bank_daily_transfer_preview` and `chat_bank_daily_transfer_send_manual` each require a valid Admin app session and allow only **completed** VN dates in the last 30 days. Sent/opted-out rows disable send. The manual button uses the **same private daily sender/client ID** as cron, so the auto schedule cannot send a second identical notice. `anon` access is revoked; the private queue/payer functions are revoked from `anon/authenticated`.
- **E2 proof:** Pure read-only production queries: 5 unique eligible customers, 19 transfers, all 5 generated bodies contain `Đơn vị: 1.000 đồng`, total heading and correct explicit date. No body used legacy full-dong sample `400.000đ` or `949.000đ`. Formatter renders `400`, `5.634`, `10.000`; source has zero sub-1,000 remainders for 10 Nov. Real private dispatch was invoked safely in quiet hours and returned `{status:quiet,sent:0}`; **0 daily messages were sent during tests**. Privileges read-back: `anon` cannot call preview/manual or private dispatch; authenticated has only gated Admin RPC access. New regression `tests/test_bank282_yesterday_transfer_summary_20261111.cjs` is in canonical `tools/verify_current.py`; **Verify V21 [42915894983](https://github.com/1sl2tp/chat/actions/runs/42915894983) SUCCESS**.
- **E3 frontend:** GitHub Pages [42915278012](https://github.com/1sl2tp/chat/actions/runs/42915278012) SUCCESS on UI CSS change commit `8dd8f41` (includes UI handler `b2ef619` and button markup `b94e548`). Later commits are database migration source and tests; no further UI runtime change.
- **E4/E5 pending:** Deployment is live, but **no scheduled 08:05 send has happened since the migration was created**. The next 08:05 VN cron should process **only yesterday's verified transfers**, e.g., 10 Nov's 5 customers if their opt-in and link status remain valid. Delivery through Chat/Zalo has not yet been observed; do not call it end-to-end confirmed.
- **Rollback:** `cron.unschedule('taphoa-bank-prevday-confirmed-0805-vn')` suspends new automatic summaries. The manual send RPC can be disabled with a separate privilege-restricting migration. Do not delete historic collection ledgers or confirmed messages. Reverting UI-only does not stop the backend cron.

---

## 2026-11-11 — IMG-281 · Rotated image must also rotate its message frame (SOURCE / CI / DEPLOY VERIFIED)

- **E0 complaint:** C Sâm pl → Hỗ trợ Chat desktop conversation screenshot shows two photo messages sent **10 Nov 2026 22:26 VN**, tall portrait bubbles despite landscape-oriented content. Supabase read-only query confirmed the two media assets both `image/jpg`, `864×1920` px. **No original JPEG bytes were read or altered**; user provided a Chat screenshot, not original image binaries.
- **Root cause:** `chat-image-orientation.js::applyTileRotation` already stored a manual clockwise angle per asset in localStorage, but only rotated the IMG while its bubble stayed a **portrait** ratio/width. Also, `index.source.html` already forces `width:100%!important;height:100%!important` for single-image IMG: the old plain inline width/height for 90° rotation was overridden. With zoomed images this resulted in a tall empty/cropped slot or incorrectly scaled picture. `app.js::patchMessageMediaShell` also recalculated shell width from original source aspect, undoing the corrected width during chat reconciliation.
- **E1 fix:** `chat-image-orientation.js` now provides `rotatedImagePresentation(sourceRatio,rotation)`. On each 90°/270° per-asset correction, the single-media frame aspect and width swap portrait↔landscape; the outer shell receives the **same** measured width. The original JPEG itself is not reencoded, resized, or changed. Inline `width`/`height`/`max-*` use `important` only on the rotated IMG to override the existing author CSS; reset at 0°/180°. A narrow one-owner adapter `window.V21ImageOrientation.applyTileRotation` is called after the `app.js` image-presentation patch; the media-shell patch preserves the rotated width. Gallery grids retain their existing layout. Viewer rotation recognizes `layoutZoomed=true` and does not clamp the original-pixel IMG introduced by IMG-275.
- **Honest limit:** The image file's reported **864×1920** ratio is portrait. The app's existing native `image-orientation:from-image` and upload `createImageBitmap({imageOrientation:'from-image'})` still handle *embedded EXIF* orientation. There is **no verified general-purpose OCR text direction detector in the Chat frontend**, and width/height alone cannot determine which way arbitrary digits/text should face; do not automatically force both images 90° without their original pixels. Existing per-image rotate controls and persisted correction are retained and now correctly update the surrounding frame. No customer media is sent to a new AI or external service.
- **E2:** Added `tests/test_img281_rotated_media_bubble_20261111.cjs` to canonical `tools/verify_current.py`; covers source **864×1920** rotating 90°/270° to a **360px landscape** bubble, back to **252px portrait** at 0°, a source landscape image rotated into portrait, gallery geometry untouched, parent shell width, and CSS `!important` override. [Verify V21 42911906756](https://github.com/1sl2tp/chat/actions/runs/42911906756) **SUCCESS**.
- **E3:** [Deploy Chat Pages 42911667410](https://github.com/1sl2tp/chat/actions/runs/42911667410) **SUCCESS** at `834299208e2c`, including the source rotation patch `8d4214a1661f`. Subsequent commits are regression tests and verifier only. No backend or production data writes.
- **E4/E5 pending:** No authorized browser session/asset bytes to visually confirm the exact two JPEGs after turning them. E0 metadata and static + runtime JS tests are not proof that content-side OCR chose a correct default clockwise direction. Preserve user asset data and original media orientation.
- **Rollback:** Restore prior `app.js` image shell width and `chat-image-orientation.js` layout in one coordinated patch through canonical Pages. No database/media correction required.

---

## 2026-11-11 — IMG-275 · Browser zoom rerasterizes the full original image instead of scaling a low-res texture

- **User symptom E0:** Screenshot of `chat.taphoa.xyz` desktop gallery, selected photo 84/94, zoom **330%**, handwritten notebook appears blurry; downloading the same photo is visibly clearer. Footer identifies stored file resolution **881 × 1920 px**. Uploaded evidence was a screenshot, not original media bytes.
- **Root cause in source:** `app.js::loadViewerAssetSource` already prioritizes the account-scoped full-resolution `V21MediaCache` Blob and falls back to lightweight preview only when unavailable. Download `mediaBlobForDescriptor` uses the same stored Blob. Viewer zoom previously applied `transform:scale(zoom)` to the already CSS-fit small image (and `index.source.html` forced `will-change:transform`), allowing Chrome GPU to magnify a rasterized small texture instead of displaying all native source detail. This is a **display/rasterization** defect, not a server recompression defect.
- **E1 owner patch:** In `app.js`, `imageViewerFittedOriginalSize()` derives the decoded intrinsic dimensions and main viewport's fit size, then zoomed viewer lays out **the IMG itself** at fitted CSS width/height × zoom with max constraints and flex shrink disabled; transform only pans/rotates, never applies `scale()` when source decode is ready. `clampImageViewerPan` knows layout already includes zoom so does not multiply pan bounds twice. Before decode, old transient `scale()` remains as a preview fallback; image `load` listener re-fits after the original image arrives. Existing viewer resize handler re-fits after desktop/mobile viewport changes. CSS removes forced `will-change:transform` raster preallocation.
- **No media-resource regression:** Same storage Blob, no image upload/edit, thumbnail changes, CDN request, extra media download, polling or background fetch. Existing viewer account/session fencing, zoom/pan/rotation/pinch/arrow/filmstrip behavior preserved. The source resolution (e.g. 881×1920) is still a physical limit: high zoom cannot invent image pixels absent from the photo.
- **E2 tests:** Added `tests/test_img275_viewer_native_zoom_20261111.cjs` wired into `tools/verify_current.py`. Runs actual production zoom functions in VM at 330% with 881×1920 image, verifies enlarged layout pixels, pan clamp, rotation, reset, late-decode fallback, same stored Blob, no network path introduced by zoom. Canonical Verify V21 [42905251863](https://github.com/1sl2tp/chat/actions/runs/42905251863); confirm final conclusion before claiming PASS.
- **E3 UI deploy:** GitHub Pages [42905062901](https://github.com/1sl2tp/chat/actions/runs/42905062901) **SUCCESS** on `index.source.html` change commit `0cfeae2`, containing the viewer `app.js` change at `9721eba`. Later commits add tests only; no backend or database change. Production actual image viewer at 330% has not yet been manually browser-inspected (E4 pending).
- **Rollback:** Revert owner-only `app.js` image zoom layout and `index.source.html` one CSS property through standard GitHub Pages build; no private data rollback.

---

## 2026-11-10 — PRICE-274 · Chỉ gửi nhóm Báo Giá khi có sản phẩm hoặc giá mới (PRODUCTION VERIFIED)

- **Yêu cầu:** Lịch app Chat lúc 06:00 giờ Việt Nam không được gửi lại bảng giá nếu không có thêm sản phẩm hoặc sửa giá bán. Không gửi chỉ vì có đơn tạm/đã giao trong 7 ngày. Giữ nhóm `Báo Giá - 0911479555`, không đụng lịch tư vấn sữa/tổng hợp cũ.
- **E0 nguyên nhân:** `cron.job` #30 `taphoa-price7d-advisory-0600-vn` (`0-44 23 * * *` UTC) luôn dựng `taphoa_price7d_text` từ đơn đã giao, đơn tạm và lịch sử giá 7 ngày, tạo batch mỗi ngày dù danh mục không thay đổi. Lượt ngày 10/11 đã gửi **4/4 phần**, `zalo_message_links.state=sent`, đều có `zalo_message_id`. Từ khi batch đó được tạo lúc 06:32 VN đến lần sửa, không có thay đổi giá bán hay cập nhật sản phẩm đủ điều kiện.
- **E1/E3 PROD:** Đã áp dụng Supabase migrations `20261110153141_price274_baseline_for_changed_group_quotes` và `20261110153235_price274_gate_daily_group_send_on_real_catalog_changes`, lưu bản SQL đúng bản đã chạy trong GitHub. Tạo snapshot JSONB `v21_private.taphoa_price7d_delivery_state` của **508 sản phẩm hợp lệ**, bao gồm mã sản phẩm, tên không dấu và giá bán. Lấy mốc từ batch cuối đã ACK đủ 4 phần. Khi 06:00 hôm sau, so sánh theo **mã + giá bán hiện tại**: mã mới hoặc giá mới là delta; chỉ các mặt hàng delta xuất hiện trong bản tin. Chênh lệch giá thường hiển thị `giá cũ -> mới (+/-)`; thay đổi lớn trên 30% chỉ hiện giá hiện tại; hàng mới đánh dấu `[MỚI]`.
- **E1 điều kiện không thay đổi:** Nếu không có sản phẩm mới và giá hiện tại không khác snapshot, ghi `v21_private.taphoa_price7d_skipped_days` cho ngày đó và trả `status=no_change`; không tạo batch, tin Chat, outbox hoặc gửi Zalo. Các lần cron tiếp theo trong cùng khung 06:00–06:44 đọc kết quả skip nhanh, không quét catalog nhiều lần. Đơn đã giao hoặc đơn tạm tự nó không tác động delta.
- **Bảo toàn gửi nhiều phần:** Giữ `client_id` theo ngày/phần và ACK Zalo `state=sent` + `zalo_message_id`, không xếp phần tiếp trước khi phần trước thành công. Chỉ nâng snapshot cơ sở khi **toàn bộ phần** đã ACK; nếu đợt ngày trước chưa hoàn thành, trả `prior_delivery_pending` để không âm thầm bỏ sót cập nhật.
- **E2 kiểm thử:** Không gửi tin thật trong test. Live pure function tests: 5/5 trường hợp PASS (giá không đổi -> NULL; giá 10k→11k; thêm hàng mới; giá bất thường không hiện giá cũ; đơn phát sinh nhưng giá không đổi -> NULL). Sender trả `outside_window` khi gọi ngoài giờ. No-change snapshot kiểm tra trực tiếp bằng DB: 508/508 sản phẩm đồng nhất; 0 skipped day mới, 1 batch ngày 10/11, 4 Chat message và 4 Zalo ACK, không có tin gửi bổ sung. Quyền EXECUTE của `anon`/`authenticated` cho hàm gửi/delta đều **false**. New regression `tests/test_chat_price7d_delta_only_20261110.cjs` trong `tools/verify_current.py`; [Verify V21 42846040394](https://github.com/1sl2tp/chat/actions/runs/42846040394) **SUCCESS**.
- **E3 giữ lịch cũ:** cron #30 active, schedule `0-44 23 * * *` UTC, `SELECT v21_private.taphoa_price7d_send_ordered(now())` — không tạo lịch ChatGPT, không chỉnh các lịch tư vấn 06:00/09:00 đã nghỉ. Không có tin/Zalo nào được gửi để kiểm thử.
- **E4/E5:** Đợi đợt 06:00 tiếp theo với thay đổi thật để xác nhận trong môi trường gửi Zalo thực tế; chưa tuyên bố đã quan sát một lần bỏ gửi tại 06:00. Rollback có kiểm soát bằng migration thay thế cho sender; không xoá batch, snapshot hoặc các tin đã gửi.

---

## 2026-11-10 — BANK-273 · v4/v5 financial auto-collection, 7 uniquely matched receipts (PRODUCTION VERIFIED)

- **User instruction / root cause E0:** Owner explicitly required that a correctly read and uniquely matched customer bill must be auto-collected. Production `chat_auto_collect_settings.enabled=true, ready=true`, but `public.chat_bank_app_collect` still rejected **every new OCR v5** receipt because it hard-coded `rule_version='bank_bill_amount_v4_20261018'`. New 517k bill was `v5`, `match_preview.status=candidate_unique`, but remained `amount_read`. Six prior v4 bills had verified timestamp corrections but were parked at `match_preview=review`.
- **E1 canonical finance guard patch:** Applied production migration `20261110134955_bank273_accept_bill_ocr_v5_and_verify_manual_bank_timestamps`; repository source `supabase/migrations/20261110134955_bank273_accept_bill_ocr_v5_and_verify_manual_bank_timestamps.sql`. The existing `SECURITY DEFINER` financial writer now accepts precisely **v4 or v5**. For manually bank-sourced historical timestamps, it additionally rechecks matching independent Agribank notification ID and normalization of **distinctive bank transfer memo** (exact, near-exact 90+ characters, or 20+ suffix with max 2-character bank prefix) using `extensions.unaccent`. ALL existing independent credit/account/device, 60-second clock, Vietnam current-day, customer/admin validity, settings enabled+ready, unique image/credit, manual-ledger exclusion, command idempotency, and per-customer financial locks remain intact. No anonymous or browser grant.
- **E2 verification:** Read-only preflight found 7 exact bank-account, same-day, same-minute, distinct-amount receipt/credit candidates with no existing auto or manual links, competing same-minute receipts, competing credits or matching manual ledger. Five old timestamp-corrected bills had exact/long near-exact official bank memos, one had 25-character exact suffix of a bank memo differing only by 2 prefixed characters, and the new v5 bill had exact memo. All had active bank ingest device and valid recipient/admin evidence. Verified configured auto-collection true and ready true.
- **E3 controlled finance collection:** In a single guarded DB transaction, promoted the six historically timestamp-corrected `match_preview` fields to `candidate_unique` only for the matching specific Agribank IDs; then called **existing** `public.chat_bank_app_collect(media_asset_id,notification_id)` for each of six old v4 plus one new v5. Required every result to be new `ok=true,status=received,replayed=false`, otherwise rollback all updates. The function wrote ledger via canonical `taphoa_debt_ledger` and `taphoa_command_log`, inserted one link per bank event, and set receipt status `received`. This was NOT a manual direct debt write nor a UI-only status change.
- **E4 independent production read-back:** **7/7 collected**, seven distinct bank notifications and seven distinct ledger IDs (809–815), each linked to matching receipt/amount and negative debt entry. **Total bank amount = total debt collected = 3,675,000 VND.** Breakdown: event #240 400k 09:19, #243 377k 14:38, #244 977k 17:28, #245 949k 17:42, #249 364k 18:06, #250 91k 18:06, #257 517k 20:31 (all 10 Nov 2026, Vietnam time). No double-collection. The six manual OCR corrections retained original AI timestamps in `raw_read.manual_datetime_correction`.
- **Remaining red cases:** Agribank event **#242 = 10,000,000 VND** 10:45 has **zero linked customer bill**; event **#253 = 718,000 VND** 20:03 has one uploaded image but no independently OCR-readable time or transfer memo. Both remain uncollected: assigning customer/debt just from bank amount or upload clock would be unsafe. Do not mark them green without independent customer-bill evidence.
- **E5 forward gate:** Later genuine v5 receipts will be eligible for the unchanged atomic writer when OCR and bank match identify a unique real transaction. New static test `tests/test_bank273_financial_rpc_ocr_v5_20261110.cjs` is wired into `tools/verify_current.py`; canonical Verify V21 run after docs commit should be checked. This is not a blanket retroactive auto-collect job.
- **Rollback and accounting:** No naive `DELETE` of the seven confirmed ledgers; if future bank evidence shows a genuinely wrong customer assignment, a separate audited offsetting correction is required. The database migration can be superseded via a new forward migration if needed, but never revert money records by reverting UI/code alone.

---

## 2026-11-10 — BANK-272 · Manual correction of six historical bill timestamps (PRODUCTION VERIFIED)

- **Owner instruction:** Explicit request to fix old AI-read bank receipts with wrong DD/MM or missing clock. Scope: `chat_bank_bill_receipts` records from 2026-11-10 Vietnam date, no customer-facing messages or new bank transfer.
- **E0 evidence:** Six specific `amount_read` receipts had unique same-amount official Agribank Plus credit notifications in a ±15-minute Chat-upload window, correct incoming bank account, no own-transfer flag, no duplicate same-amount bill in ±24h, no existing auto/manual link, and identifiable bank memo. Five had **exact normalized memo**; 977k had a **121-character official vs 120-character OCR memo with one-character difference**, long common prefix and same sender evidence. Original private bank images were not downloaded or visually inspected in this correction; **transaction minute comes from the bank's printed notice**, not a claim that AI saw it in the photo.
- **E1 targeted single atomic SQL update (6/6 eligible and updated):** 400k `5288f1f6` → **10/11 09:19** (Agribank notification 240); 377k `a7534c72` → **14:38** (243); 977k `16dad331` → **17:28** (244); 949k `dfa64a24` → **17:42** (245); 364k `b82336f2` → **18:06** (249); 91k `a6a72af7` → **18:06** (250). Fields only: `transfer_at_vn` and `raw_read` effective normalized date/time and time precision. Preserved old raw normalized values, previous precise OCR clock, independently matched bank notification ID, method, change timestamp and explicit note that image clock was not directly inspected in `raw_read.manual_datetime_correction`. `match_preview` is **review/pending financial guard**, never candidate_unique/received.
- **E2/PROD VERIFIED:** Read-only SQL returned 6 corrected records, all date **2026-11-10** with correct bank event minute, source `independent_agribank_credit_notification`; all still `status=amount_read`, `ledger_id=NULL`, and **zero auto collection links**. Relevant bank receipt triggers fire only on `UPDATE OF status`; this change did not update `status`, debt, ledger, customer, amount, notifications or sender. **No transaction was collected/posted by this timestamp repair.**
- **E0 unresolved exception:** 718k bill `fc7e5b3c` from 20:03 has no OCR clock, no OCR date, no OCR transfer memo; a same-amount bank event alone is insufficient to assert its identity. Leave timestamp NULL, audit intact and pending. 517k `b82e7728` already has correctly read **10/11 20:31** and was not changed; finance status still pending independently.
- **Rollback:** Exact prior normalized values are preserved under `raw_read.manual_datetime_correction.previous_*`; a vetted targeted reversal can restore those values without touching financial ledger. Do not silently auto-collect old images or invent original printed photo seconds. Further financial collection requires existing independent DB financial guard and live confirmation.

---

## 2026-11-10 — BANK-271 · Production Supabase Edge OCR v31 verified

- **User authorization:** Owner explicitly requested to publish the corrected AI bill reader to production for accurate automatic collection. Supabase's existing authorized connector was used; no GitHub token was created, exposed, or changed.
- **Before:** `v21-bank-bill-event` version **30**, `verify_jwt=false`. Existing Supabase file list: `index.ts`, `bill-amount-rules.mjs`, `bill-sms-preview.mjs`, `bill-app-preview.mjs`, `bill-transfer-identity.mjs`.
- **Source and gate:** Exact `main` commit `7c1d58ed434924c138c10f456eeb1a5470efe666`, `Verify V21` [42821914273](https://github.com/1sl2tp/chat/actions/runs/42821914273) **SUCCESS**. Source version `bank_bill_amount_v5_20261110` independently transcribes the literal date/time, normalizes DD/MM/YYYY in code and allows AI ISO correction only when both printed date + clock are present. The bank-credit match requires same minute, unique official credit, and exact memo when AI date conversion was corrected. Financial RPC/amount/duplicate guards were not modified.
- **Deployment E3:** First deployment package attempt was rejected because the prior function's ephemeral absolute entrypoint was unsuitable for upload; **no version change on failed attempt**. Retried with relative `entrypoint_path=index.ts`, all five exact source files and `verify_jwt=false`. Supabase returned `status=ACTIVE`, **version 31**. Independent read-back of `get_edge_function` confirmed version 31 ACTIVE, unchanged JWT setting, source `bank_bill_amount_v5_20261110`, `ocr_date_normalization_corrected`, bank matching `ocr_date_corrected_bank_memo_unverified`, and `chat_bank_app_collect` controlled writer.
- **Current historic data:** Production read-only SQL on Chat bill receipts sent 10/11 Vietnam shows 7 `amount_read` records still awaiting collection and 3 historical OCR timestamps on 11/10; no `rule_version=v5` receipt had yet been written during the check. **Deployment does not re-scan past images** and must not be reported as retrospective correction or validated end-to-end financial collection. Old bill images need independently verifiable source text and unique bank credit before any catch-up/replay.
- **Pending E4/E5:** New post-v31 bill scans and real Agribank credit matches are still unverified. Do not silently alter old ledger, transfer timestamps, receipt state, send Zalo, or trigger unreviewed financial transactions; maintain the strict bank transaction uniqueness check.
- **CI known issue:** GitHub Actions `Deploy Bank Bill OCR Edge` still fails its `SUPABASE_ACCESS_TOKEN` gate; it is a separate workflow introduced 10/11 and does not indicate the project's existing Supabase connector lacks auth. This incident's explicit owner-requested deployment used Supabase's connected official API, not the broken workflow. Fix/remove workflow independently rather than asking user to send secret material to Chat.

---

## 2026-11-10 — BANK-269 · Sửa hướng dẫn AI đọc ngày/giờ trên bill (source verified, Edge deployment blocked)

- **E0 user symptom:** Người dùng chỉ ra chức năng AI đọc bill trước vẫn hoạt động. Read-only production comparison: Gemini model `gemini-3.5-flash-lite` scanned 14 / received 13 on 08/11, scanned 10 / received 9 on 09/11, but scanned 12 / received 5 on 10/11. On 10/11, 4 raw OCR dates mismatched the Chat-upload day and 3 receipts had no usable transaction clock; this trend alone does not prove every older image had wrong OCR.
- **Root cause / source evidence:** The live v30 Edge prompt requires Gemini to normalize a bank timestamp directly and includes a concrete **October 18** date in the JSON example, potentially anchoring the date, while real Vietnamese DD/MM screenshots can be misinterpreted as MM/DD. Another case is a printed date and printed clock being independently readable but the combined ISO output missing. This is a plausible prompt-and-normalizer failure confirmed by raw field inconsistencies, **not direct visual verification of every original bill pixel**.
- **E1 source patch:** `supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs` RULE_VERSION bumped to `bank_bill_amount_v5_20261110`; Gemini is instructed to first transcribe the printed Vietnamese date and printed transaction clock independently, never use phone status-bar/Chat upload timestamps, enforce DD/MM/YYYY, never hallucinate seconds or dates, then convert to ISO only if both parts are certain and consistent. JSON no longer contains a fixed October transaction date. `readV4Fields` can form a transaction timestamp only from *both independently printed date and clock*, quarantines raw/ISO date conflicts and printed/ISO time contradictions. `index.ts` persists `transfer_time_printed_vn` and `clock_text_conflict` for audit. Existing unique Agribank bank-credit evidence, amount validation, idempotency, and financial write checks unchanged. No speculative old-bill replay.
- **E2:** New `tests/test_bank269_bill_literal_date_clock_20261110.mjs` covers correct 10/11 and 11/10 parsing, separated date+time recovery, date-only/time-only rejection, invalid clocks, wrong clock conflict, preserved genuine old bill, versioned prompt, and audit wiring. Wired into `tools/verify_current.py` and the scoped Edge GitHub Actions release test gate. **Canonical Verify V21:** [42819569421](https://github.com/1sl2tp/chat/actions/runs/42819569421) — check final status; target Edge workflow [42819568553](https://github.com/1sl2tp/chat/actions/runs/42819568553) tests PASS.
- **E3 BLOCKED:** Latest scoped GitHub Actions Edge deploy failed at `Require configured Supabase deployment credential` because repo secret `SUPABASE_ACCESS_TOKEN` is absent; deploy command skipped. Production `v21-bank-bill-event` still on version 30. User's prior constraint forbids ad-hoc manual production deployment; do not invoke direct Supabase deploy to bypass GitHub secret gate. To activate source fixes, an authorized owner must configure the repository secret and rerun the validated workflow.
- **E4/E5:** Until v5 Edge is deployed and real new image scans verified, do not assert OCR is fixed in production. No receipts, money, ledger, authentication or customer messages were changed. Original bad OCR historical rows remain unchanged.
- **Rollback:** Revert only `bank-amount-rules.mjs` / `index.ts` changes through canonical code review and automatic Edge workflow; no DB rollback, cron or schedulers required. Do not weaken bank evidence to improve headline auto-collection numbers.

---

## 2026-11-10 — BANK-268 · Sửa nhãn đỏ đối soát Agribank + thiết lập phát hành OCR (screenshot 19:27 ICT)

- **E0 screenshot/read-only DB:** Bank report for 10/11/2026 shows 12 Agribank credits totalling 20,615,000 VND, 5 bank-linked automatic collections, 7 unmatched (13,158,000 VND). Event IDs 240 (400k, bill missing reliable clock), 242 (10m, no corresponding customer-submitted bill), 243 (377k, bill clock missing), 244 (977k, date/clock unreadable), 245 (949k, OCR 11/10 instead of probable 10/11), 249 (364k, same), 250 (91k, same). Existing unlinked receipt rows all remain `amount_read`; no bank ledger link or bank manual collection row. Same-amount bank notification near upload is not proof of invoice identity or permission to post money.
- **E1 UI minimal patch:** `bank-report-dashboard.js::bankUnmatchedIssue` determines the honest failure state for each unmatched bank credit from existing, same-day/near-clock bill review candidates: `Chưa thu · Thiếu bill`, `Chưa thu · Bill thiếu giờ`, `Chưa thu · Nghi sai ngày`, or `Chưa thu · Chờ xác minh bill`. The row opens to existing bill viewer/manual verification. No change to receipt status/ledger, customer matching, RPC, push, realtime, cron, retention, network request or collection action. Runtime change [e80c348](https://github.com/1sl2tp/chat/commit/e80c348a4a5a872ba7e860f5b653fec397d98065); canonical regression `tests/test_bank268_unmatched_receipt_reasons_20261110.cjs` added at `f715d2b` and wired to `tools/verify_current.py` at `442a8b8`.
- **E2:** Verify V21 [42817471430](https://github.com/1sl2tp/chat/actions/runs/42817471430) **SUCCESS** at `442a8b8`, including BANK-267/268 tests.
- **E3 UI:** Deploy Chat Pages [42817327327](https://github.com/1sl2tp/chat/actions/runs/42817327327) **SUCCESS**, custom-domain check, from UI source commit `e80c348`. SW already uses network-first/no-store for same-origin scripts and version.json; do not churn its shell cache epoch unnecessarily or erase private IndexedDB.
- **E3 Edge BLOCKED (exact cause identified):** New scoped GitHub Actions workflow `.github/workflows/deploy-bank-bill-edge.yml` was created at `d820b08`: validates BANK-266/267 tests and deploys **only** `v21-bank-bill-event` through Supabase CLI, preserving `--no-verify-jwt`. Release [42816475509](https://github.com/1sl2tp/chat/actions/runs/42816475509) ran, but **failed only because repository secret `SUPABASE_ACCESS_TOKEN` is absent**; its tests passed and deploy step was skipped. Supabase production function remains **version 30**, lacking `date_swap_suspected`. No direct/manual production deployment done, per user guardrail. Set this repo secret with authorized project access, then rerun the failed workflow job. Never log/store tokens in repo text or Chat.
- **E4/E5:** No customer-facing send, financial ledger write, manual-collection RPC, bank change or historical timestamp rewrite. All seven uncollected items remain uncollected until independently confirmed; 10m lacks any customer bill. Next production probe after authorized Edge release: verify new version and `raw_read.date_swap_suspected` on future suspect OCR, do not infer past corrections.
- **Rollback:** Revert UI labels via standard Pages release; keep all bank/receipt/source/ledger records intact. CI deployment workflow can be disabled independently if credential policy changes.

---

## 2026-11-10 — BANK-267 · OCR đảo ngày/tháng trên bill (Web report released; Edge PENDING)

- **E0 / read-only production evidence:** Three 10/11/2026 Chat-uploaded bank receipts had OCR transaction dates 11/10/2026, statuses `amount_read` and no ledger postings: receipt prefixes `dfa64a24` (949,000 VND), `b82336f2` (364,000 VND), and `a6a72af7` (91,000 VND). Each had one same-amount Agribank credit within 10 minutes of upload; only two sender names appeared in matched notifications. These are candidate correlations, **not proof authorizing a collection or a date rewrite**.
- **Root cause:** `supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs` previously accepted valid but day/month-swapped model ISO dates when `transaction_datetime_vn` and `transfer_date_vn` agreed. Even date-only OCR could pass the reference-day path without an independently printed-date check.
- **E1 patch:** The prompt requests `transfer_date_printed_vn` copied literally from the bill. Normalization flags conflicts against the model ISO date and a likely DD/MM inversion relative to Chat upload clock, including **date-only** results. It does not auto-correct bank timestamps, borrow Chat upload day, rewrite source records or authorize collection; ambiguous day is removed from matching. `index.ts` passes `sentAt` into this read-only risk check, blocks `hasReference` on date conflict and records diagnostic flags in future `raw_read`.
- **E1 existing-data UI patch:** `bank-report-dashboard.js` flags probable old OCR inversions with `Nghi sai ngày OCR · Chưa thu`, annotates the original OCR time as suspect, and leaves the finance/ledger/aggregation/RPC behavior unchanged. Source changes: `aee4c97`, `09a0b4a`, `3dd5ebb`; final docs/test commit is separate.
- **E2 tests:** `tests/test_bank266_bill_format_variants_20261108.mjs` now exercises conflicting printed/ISO dates, date-only inversions, genuine historical receipts, current valid dates and midnight; `tests/test_bank267_bill_ocr_swap_report_20261110.cjs` exercises old report rows and no false alarm for received or matched entries. Both are included in the canonical `tools/verify_current.py`. Verify V21 run [42809004613](https://github.com/1sl2tp/chat/actions/runs/42809004613) **SUCCESS** at `11e1960`.
- **E3 UI deploy:** Chat Pages run [42808923808](https://github.com/1sl2tp/chat/actions/runs/42808923808) **SUCCESS** for latest UI-source commit `3dd5ebb`; it checks live custom-domain build identity. Later commits changed tests and `tools/verify_current.py`, not UI runtime.
- **E3 backend PENDING:** Supabase production Edge Function `v21-bank-bill-event` remains **version 30**, with no `date_swap_suspected` logic deployed. There is no existing GitHub Actions Edge release workflow in this repo; in accordance with the user's no-manual-production-deploy rule, **do not claim the backend fix is live and do not deploy manually**. A vetted automated release route is required.
- **E4/E5 PENDING:** User-device report inspection and future bill OCR runs remain unverified. No production database rows were changed; the three old OCR timestamps and amounts remain intact. Before any data correction, verify original bill pixels, unique bank event IDs and sender/reference evidence; retain audit history. No customer messages, bank transactions, cron, new polling or auto-collection actions were emitted.
- **Rollback/resource:** Revert only OCR risk helper/prompt/contract-test changes for future scans and UI warning changes through canonical build if proven harmful; no DB rollback is needed. No extra Gemini calls, data downloads or new schedulers.

---

## 2026-11-10 — CHAT-RO-274 · ResizeObserver red runtime warning (released; iPhone confirmation pending)

- **E0 evidence:** iPhone Chat V21.72.39 screenshot shows `Error: ResizeObserver loop completed with undelivered notifications.` while the keyboard and Composer are open. This browser delivery warning does not by itself prove a fatal app crash.
- **Root cause:** `app.js` Composer-height, message-window and editor-width `ResizeObserver` callbacks could mutate layout during observer delivery. The global error handler also treated source-less browser delivery diagnostics as fatal first-party runtime exceptions.
- **E1 repair:** `app.js` defers each observer's layout update to one coalesced `requestAnimationFrame`, uses the latest editor width, preserves ScrollRoot ownership and keeps real first-party errors visible. `tests/test_chat_resize_observer_runtime_20261110.cjs` covers browser warning vs real error, three observers and coalescing. New `pwa-chat-resizeobserver-loop-fix-20261110` cache epoch updates only the public shell; no private IndexedDB/message/auth cache is wiped. Old exact-epoch UI test locks were replaced with versioned-cache contracts.
- **E2:** Verify V21 [42789308302](https://github.com/1sl2tp/chat/actions/runs/42789308302) **SUCCESS**. **E3:** Deploy Chat Pages [42789308484](https://github.com/1sl2tp/chat/actions/runs/42789308484) **SUCCESS**, including custom-domain build-id confirmation.
- **Source provenance:** repair `6c4d323ed651d23daf5d680e733a8bf181ac275a`; final tests/PWA release `afdd3279c4be0cff78384dedc80f531d2e203cc4`; canonical sync `3a87ab2f971cf87df1f91dd1624cf8aaacfbd1dc`, build `3a97f96c43a376f7348860dc54e20b8b2e171c4ca78e276fb6fb0648447ec617`.
- **E4/E5:** Installed iPhone Safari/PWA activation, keyboard open/close and long-draft no-warning acceptance are **PENDING** because device-side runtime was not observed. CI+Pages does not prove that an already-open PWA tab activated this release.
- **Safety/rollback:** no RPC, DB writes, customer sends, cron, new polling or data deletions. Revert observer deferral and shell epoch together through canonical build if a device regression is proven.

---

## 2026-11-10 — UI-273 · Composer expands to show long drafts on iPhone (released, iPhone verification pending)

- **E0 screenshot:** in iOS Chat PWA with the keyboard open, a long unsent text wraps but only the final 40px strip is visible; the ChatGPT reference shows the writing area expanded with controls at the bottom. Previous UI-268 intentionally capped mobile textarea at 40px, causing the clipping/hidden-lines behavior.
- **GIVEN/WHEN/THEN:** authenticated iPhone Web/PWA composing a message; on soft wrapping or explicit newline, keep the native textarea and expand the editor above the +/mic/send row, with up to 168px of visible content and native internal scroll only after a viewport-aware limit. A cleared draft restores the compact one-row composer. Desktop retains its two-line cap.
- **Owner:** `app.js::autoGrow` (measurement/draft/caret and keyboard viewport cap) and `mobile-chat-refresh.css` (existing mobile composer layout). No second editor or duplicate resize loop; expanded state stays stable until draft clears to avoid Safari width-measurement oscillation.
- **MUST-STAY:** account-scoped draft, Vietnamese IME composition, send/Return mode, +/mic/voice, 44px hit areas, existing VisualViewport/ScrollController, server sync, read state, privacy and all business content unchanged. No new requests, timers, cron, backend changes or IndexedDB resets.
- **Verification:** the existing UI-268 contract and new `tests/test_chat_composer_multiline_ui273_20261110.cjs` cover soft wrap, explicit line breaks, native scroll after cap, keyboard viewport shrinking, preservation of caret/value, short-row restoration, width feedback and desktop behavior. PR #241 merged into `main` as `edc1c813ceb9974d7fbf0d5d8725621d64341497`. Branch Verify V21 `42763718963` PASS; main Verify V21 `42763876588` PASS; Pages `42763876659` SUCCESS; live HTTPS index/version.json build id match `0f90f0a5e11f384a49fcebfe9948658d4d28a8c4a09bcd80748fa84bc7fbc4af`. E3 verified. Installed iPhone PWA keyboard/scroll acceptance (E4) is **PENDING**; no production DB edits or real message sends.
- **Rollback:** revert composer CSS+runtime+test and restore previous shell cache epoch through canonical build; do not touch private storage.

---

## 2026-11-10 — IDB-272 · iOS Chat PWA `idb_tx_aborted` banner (released; iPhone device validation pending)

- **E0 report:** iPhone Chat `V21.72.39 runtime: Error: idb_tx_aborted` red banner while the sidebar continues to render; screenshot alone does not prove whether the abort was storage-pressure, Safari lifecycle or transaction timing.
- **Code evidence/root risk:** `v21-cache-store.js::txDone` was often attached only after awaiting a request/cursor; some Safari transactions may finish before the handler is installed. `replaceContacts` enqueued `put()` writes only after awaiting the end-of-cursor callback, outside a live transaction on Safari. `v21-sync-engine.js::hydrateAccount` allowed optional cache read failure to escape its fire-and-forget auth bootstrap, triggering the global runtime banner.
- **Patch:** attach one completion/abort handler immediately after transaction creation, preserve rejected result for explicit callers without an unhandled parallel rejection, enqueue contact replacement within the active cursor callback (atomic delete+insert), release stale connections on version change and retry a future IndexedDB open after transient failure. A failed optional contact cache read now leaves authenticated server-first directory intact. Do not downgrade outbox/send durability failures to success.
- **MUST-STAY:** no IndexedDB delete/clear/recreate; no canonical data edits; no login/session reset; no new RPC/poll, push or cron; error handling outside disposable local contact hydration remains unchanged; PWA shell cache epoch only (private storage untouched).
- **Verification:** `tests/test_chat_idb_tx_abort_recovery_20261110.cjs` passes Safari transaction/cursor and cache-abort server-first regressions. PR #240 merged as `b4721e1391687198f8a271621c6bef2eb704f910`; branch Verify V21 run `42756845087` PASS and main Verify V21 run `42756952693` PASS. GitHub Pages run `42756952669` SUCCESS, including live custom-domain HTTPS/index/version.json build match `25610ce9282188f88dd571e773f68eb74736af0f10397172cdb7a52b91ea81fe` on 2026-11-10. E3 deployment VERIFIED; E4 actual installed iPhone PWA upgrade and recurrence-free use **PENDING**. No private cache wipe, DB writes or customer messages.
- **Rollback:** revert `v21-cache-store.js`, `v21-sync-engine.js`, test wiring and `sw.js` shell epoch; preserve all customer messages, outbox and storage.

---

## 2026-11-10 — PRICE-271 · App Chat 06:00 VN seven-day price advisory (deployed, production Zalo verified)

- **Requirement:** Daily 06:00 Viet Nam, owner is Chat app Supabase pg_cron, NOT ChatGPT Tasks. Advice is Vietnamese with accents; product names unaccented. Combined products from price changes, delivered orders, pending drafts over trailing 7 days, de-duplicating same names with same sales price. Reliable old price shown as `old -> current (+/- delta)`, unexpected/unknown comparison current price only. Customer-specific support pricing is not disclosed in the public group.
- **Migration:** `supabase/migrations/20261110000000_chat_price7d_group_advisory.sql` committed to `main` and **applied to production 2026-11-10 06:31–06:32 ICT** using Supabase's migration operation. New fixed-destination sender `v21_private.taphoa_price7d_send_ordered`, read-only text generator, immutable date batch and single `cron.job` `taphoa-price7d-advisory-0600-vn` active with schedule `0-44 23 * * *` UTC; 06:00–06:44 ICT. It resumes only when previous part's outbound `state='sent'` with non-empty `zalo_message_id`. Fixed group `Báo Giá - 0911479555` verified as `thread_type='group'`; other previous 06:00 milk and 09:00 general automated cron jobs remain inactive.
- **Delivered backfill:** 2026-11-10 daily batch is 4,726 chars in four chunks. Supabase cron queued part 01 at 06:32:00 ICT; the canonical sender safely advanced the next two parts upon verified Zalo acknowledgement, and cron queued last at 06:33:00. Verified actual Zalo outbound ACKs 01 at 06:32:02, 02 at 06:32:43, 03 at 06:32:52, 04 at 06:33:01 ICT. All four records `sent` with distinct actual Zalo message IDs; one attempt each, no errors, no duplicates. Post-send idempotent sender call returned `status='sent'` without creating another message.
- **Validation:** live daily catalogue text query success, 147 eligible unique lines / 40 with valid old→new from preview; grouped batch length 4,726. Read-only production reconciliation query: expected_parts=4, actual_parts=4, acknowledged_parts=4, unique_zalo_message_ids=4, first_attempts_only=true, no_errors=true, ack_after_queue=true, active_daily_app_cron=1. Contract regression `tests/test_chat_price7d_advisory_20261110.cjs` registered in `Verify V21` and `tools/verify_current.py`; full CI test execution still to be checked separately.
- **Release status:** database/server scheduled sender = DEPLOYED and same-day production Zalo ACK = VERIFIED. Next automatic daily 06:00 run is independent of ChatGPT automations. Do not overstate future reliability; review actual Zalo ACK after each business date. Rolling back is by disabling only `taphoa-price7d-advisory-0600-vn`, preserving legacy inactive jobs and historical messages/batches; never delete canonical Chat/Zalo history.

---

## 2026-11-08 — AUTH-264 · iPhone PWA unexpectedly returns to login

- **User evidence:** iPhone PWA screenshot at 13:56 ICT shows the guest login card with an empty account/password form while the Chat composer remains mounted. This indicates the browser fell out of the authenticated shell; it does **not** by itself prove a new-device approval or a specific cause for the lost session.
- **Read-only Supabase evidence:** one Auth refresh endpoint HTTP 400 with `refresh_token_already_used` at about 13:45 ICT (06:45Z), in the same general time period. No reliable client/device correlation was available, so this is a related risk signal, not definitive attribution.
- **Code risk / owner:** `auth-session-store.js::bootstrap` used to invoke `auth.refreshSession()` on **every** RPC error after `getSession()` had already handled normal refresh. Unrelated network/PostgREST errors could therefore cause unnecessary single-use refresh-token rotation.
- **Fix (PR #234, merge `22bf9b0197fb839869b2109c35816d7ed9c1732e`):** only retry manual token refresh for explicit invalid/expired JWT errors; on transient RPC failure retain tokens and display RECONNECTING. Preserve existing device-approval rules, real revocation handling and normal Supabase automatic refresh. Rotate the *public* PWA shell epoch; do not clear account data or add polling/retries.
- **Verification:** PR Verify V21 **PASS**; GitHub Pages deployment `42457562802` **SUCCESS**, including `Verify Pages custom domain`. The iOS PWA VM regression covers transient RPC failure (zero manual refresh, zero signOut) and explicit expired JWT (one refresh, restored authenticated state).
- **Limitations:** this is a **mitigation of unnecessary refresh**, not proof that the one production `refresh_token_already_used` was caused by that path. If Supabase already invalidated/lost the refresh token, a device cookie is not a login credential and secure reauthentication may still be required. Live iPhone PWA token restoration remains **unverified on-device**.
- **Rollback:** revert PR #234 or its squash merge, restore preceding shell cache epoch via a new shell revision; preserve all private storage. **Resource impact:** no new RPCs, database operations, background polling, timers, Edge Functions or Realtime channels.

---

## 2026-11-08 — UI-263 · Bank report refresh on canonical finance confirmation

- **Evidence:** existing `v21-sync-engine.js::applyMessageEvent` emitted `v21-bank-report-dirty` only for one obsolete `taphoa:bank-report:2026-10-19:initial` client ID. The existing dashboard listener was therefore never awakened by current verified collection ACK messages, even when an Admin was viewing the report.
- **Patch:** one pure matcher for canonical `taphoa:<receipt UUID>:collection` or `taphoa:bank-manual:<notice id>:collection` plus the historical initial signal. Dispatch only from a confirmed own Admin message, after normal sync/message ownership. The existing report listener performs one coalesced refresh only if visible/active. No new RPC, notification, cron, Realtime channel, read permission, database view, or polling owner. Never infer financial success from a client-side signal.
- **Measured upstream delay (read-only, n=8, last 48h):** median scan-to-verified ledger ~307s was predominantly Agribank notification arriving ~306s after scan; phone notice-to-server ~3s; ledger post ~0.7s after both verified sources; ACK message ~80s after ledger due existing 2min server drain cadence. No shortcut around bank confirmation, ledger checks, idempotency or opt-in. UI change improves report update **after** the canonical finance message, not bank-signal timing.
- **Test:** `tests/test_chat_bank_report_realtime_dirty_ui263_20261108.cjs` verifies accepted/rejected IDs, Admin ownership, existing active-only dashboard reload and no report polling. Public PWA shell epoch `pwa-chat-bank-report-signal-ui263-20261108`. CI, Pages/custom-domain and actual iPhone event delivery must be confirmed separately.

---

## 2026-11-08 — UI-262 · Compact customer notification settings

- **Evidence:** authenticated iPhone settings screenshot has repetitive event help rows, long customer list and no stable scroll after a checkbox save; current JS rebuilt the whole modal content after each RPC.
- **UI owner:** `customer-notification-settings.js` retains all authorized `chat_admin_outbound_settings_get/set` RPCs, admin check and every existing event/audience/customer key. Dedicated `customer-notification-settings.css` owns compact 44px interactions, readable two-line rows, sticky title/status, search/filter and customer results scroller. Save no longer disables search and restores both scroll positions after server-confirmed response. No changes to actual send/eligibility.
- **Financial latency audit (read-only Supabase):** 8 sent automatic collection ACKs in the preceding 48h showed median ~364s from completed bill scan to ACK; approximately 307s elapsed before the bank notification arrived, verified ledger posted ~0.7s after both sources were present, and ACK was inserted ~80s after ledger. Cron ACK 2min, while bank notification source delay is external; never show received before verified ledger or bypass idempotency and approval. Report UI remains read-only; live delivery needs separate event-driven proof before tuning.
- **Verify/release:** UI-262 static regression wired to canonical Verify V21, epoch `pwa-chat-notice-settings-ui262-20261108` updates only public shell. CI, deploy and authenticated device validation must be observed independently. Rollback CSS+JS+test+epoch; don't touch customer settings/business data.

---

## 2026-11-08 — UI-261 · Directory and account-menu consistency (first implementation)

- **Purpose:** translate the design illustration into the actual app's existing contacts and account controls without fictitious Groups/Discover routes. Existing one-column mobile and three-column desktop architecture remains unchanged.
- **Change owner:** only `mobile-ui-polish.css` controls this mobile visual pass: consistent 44px search/filter/overflow targets, selected state, keyboard focus, neutral empty state, responsive account menu. Keep row density at 60px, avatar 40px and time rail 64px.
- **Preserve:** the real KH/CM/Bạn bè/Khác filters, contact actions, group integration, Chat/Ảnh tabs, account settings own CSS, VisualViewport keyboard/scroll, auth, Realtime, calls, unread, Zalo, business data and message delivery.
- **Tests:** `tests/test_chat_directory_menu_ui261_20261108.cjs` registered in Verify V21; old exact shell-epoch assertions advance to `pwa-chat-directory-menu-ui261-20261108` in a single patch; no private CacheStorage invalidation. Canonical build artifacts are rebuilt by the existing GitHub workflow. CI, deployment and on-device results are to be checked independently.
- **Next:** profile/settings, remaining message surfaces and desktop only after this first coherent region passes verification.

---

## 2026-11-07 — UI-260 · Compact message action toolbar beside selected bubble

- **User screenshot:** in the iPhone PWA conversation with `b a duyệt`, reply/share/forward/copy appears as an unnecessarily broad, heavily shadowed floating toolbar, visually detached from the selected outgoing bubble. The user requests a more compact position.
- **Owner/root:** `index.source.html` UI-150 mobile toolbar was using four 44px touch targets **plus 4px gap between buttons, 4px side padding and 8px/24px shadow**. `app.js::toggleActionsForTurn` already correctly anchors action rails above/below message content and mirrors edge alignment by sender. Do not add an independent placement owner.
- **Fix:** remove inter-button gap, reduce side padding to 2px, use a full capsule radius and lighter shadow, keep icons at 18px artwork while **retaining all four separate 44×44px accessible targets**. Dock toolbar 2px above/below the chosen bubble instead of 6px. Four-button width drops to about 182px, aligned right for sent and left for received; remains safely within 320px portrait.
- **Preserve:** reply/share/forward/copy functionality, accessibility labels, native text selection, media long press, keyboard safety, dynamic above/below placement, scrollbar and virtualization/scroll anchoring, 44px touch-target minimum, PWA and desktop behaviors, account/data/auth/Realtime/Zalo.
- **Test & release:** UI-150 CSS contract adjusted; new `tests/test_chat_action_toolbar_compact_20261107.cjs` added to canonical Verify V21. Public PWA shell epoch `pwa-chat-actions-compact-ui260-20261107`, with no private cache/storage clear. CI/Pages and on-device visual evidence must be established independently.
- **Rollback:** revert this focused CSS/test/PWA epoch and rebuild/deploy; no business data modified.

---

## 2026-11-07 — UI-259 · Soften sent-bubble blue to match ChatGPT reference screenshot

- **User reference:** new iPhone ChatGPT screenshot shows a much lighter blue message bubble than current Chat. Screenshot's flat bubble surface is approximately RGB(238,243,254), near #EEF3FE on an off-white background.
- **Fix:** change only the canonical `--chat-message-sent-bg` token in `index.source.html` from 24% of #5b8def to 10% of #78aef8 blended into the theme primary surface. This yields about RGB(239,244,252) on a #FCFCFC canvas, within three 8-bit channel points of the screenshot sample. Keep received messages neutral gray and text primary. Dark theme still uses the same theme-relative mix.
- **Scope:** existing semantic sender/receiver CSS remains unchanged; no button, header, composer, message geometry, timestamp, media, file, invoice, scroll, backend, Realtime or data modifications.
- **Verification:** update UI-258 visual-color test with a screenshot-relative RGB tolerance, rotate only the public PWA shell epoch to `pwa-chat-soft-blue-ui259-20261107` and update dependent header/test assertions. GitHub Actions source verification and Pages deploy must pass before calling the release complete; authenticated iPhone rendering remains unverified without an on-device capture.
- **Rollback:** restore prior color token and rotate a fresh shell epoch, do not clear private caches.

---

## 2026-11-07 — UI-258 · Different colors for the two conversation sides

- **User intent:** sender (A) and receiver (B) should have distinct message colors.
- **Root:** `index.source.html` made received text transparent, `mobile-chat-refresh.css` added a gray background for received text, and `mobile-ui-polish.css` used virtually the same gray for sent text. The CSS cascade and mobile style ownership obscured the difference.
- **Fix:** one semantic, theme-aware color pair for Web/PWA: own sent messages (right) use a subdued blue `--chat-message-sent-bg`, remote received text (left) uses gray `--chat-message-received-bg`. The two tokens are defined at the canonical HTML source, and both mobile styling owners use them consistently. Typography uses primary theme text; the colors adapt naturally to dark theme.
- **Preserve:** sender alignment, mobile in-bubble timestamps and virtual-scroll height contract, 6px gutters, media/album/audio/file/invoices, message text content, read-state, Realtime, Zalo, keyboard and account-scoped storage. No messages were sent during this change.
- **Tests:** new `tests/test_chat_sender_receiver_colors_20261107.cjs`; adjusted UI-256/mobile-refresh color contracts and PWA epoch contract tests; wired into Verify V21. Public shell epoch `pwa-chat-message-colors-ui258-20261107`, no private cache clear.
- **Verification:** source patch; GitHub Actions checks/deploy and physical iPhone/PWA render require separate validation before claiming success.
- **Rollback:** revert style and test changes, issue a new public PWA shell epoch; leave customer data and backend unchanged.

---

## 2026-11-07 — UI-257 · Restore ChatGPT-style segmented top navigation

- **User evidence:** iPhone comparison: ChatGPT shows a centered two-option pill between circular header controls; Chat displayed a large standalone “Trò chuyện” title with an overlapping/right-side “Ảnh” button. The latter is owned by the UI-251 list-header CSS, not broken navigation or user data.
- **Change:** In the canonical mobile header presentation owner `mobile-ui-polish.css`, replace UI-251's full-width title/absolute Photos control in the **no-active-contact** state with one centered, 48px ChatGPT-style outlined pill and two equal 40px hit targets. The existing real routes are **Trò chuyện / Ảnh** because `shell.js` intentionally has `WORK_ENABLED=false`; do not show or silently enable a fake “Công việc” route. Retain left circular menu with unread indicator, selected-contact avatar/name, conditional duplicate Photos suppression, call controls and desktop layout. No HTML, JS navigation or business/backend changes.
- **Tests:** update UI-255/UI-256 PWA and header assertions; add `tests/test_chatgpt_header_pill_20261107.cjs` to the canonical Verify V21 to cover the 320–507px symmetric header, functional tabs, active-contact/call isolation and no disabled route activation.
- **PWA:** public shell epoch `pwa-chat-header-pill-ui257-20261107`, without clearing message, auth or media storage. GitHub Actions verification/deployment and authenticated iPhone visual confirmation **not yet established in this source entry**; do not claim those until independently observed.
- **Rollback:** revert this focused CSS/test/SW change and generate a new public shell epoch. Do not alter Supabase, data, message caches or calls.

---

## 2026-11-07 — UI-256 · Restore ChatGPT-first mobile design identity

- **User evidence:** six authenticated iPhone screenshots compare ChatGPT's centered, quiet header, neutral controls, airy typography and two-tier Composer with TAPHOA Chat's left-heavy "Trò chuyện" title, strong separators/type, WhatsApp green/paired bubbles and single-line writing bar. User asks to restore ChatGPT design spirit, not to drop WhatsApp-like functional messaging or business actions.
- **Owner/root:** UI-251 (WhatsApp inspired) was overriding the original ChatGPT-reference message canvas and source UI, while UI-240/254 owned the directory. Corrected existing owner declarations in `mobile-ui-polish.css`, changed only grid placement in `mobile-chat-refresh.css`. No new global override stylesheet, no DOM restructure, no JS/Realtime/polling/keyboard changes.
- **Presentation:** centered no-contact chat title in symmetric 44px header rails; 44px Photos action stays reachable and selected-contact avatar/call actions retain the separate state. Active directory filter uses neutral secondary surface, search is a rounded pill, contact name is 15px/600 weight, time/preview remain secondary, 60px rows and 40px avatars are unchanged, inset separators softened to 24% blend. Quick business action colors/borders and day chips made quieter.
- **Messages & composer:** restored incoming text to transparent ChatGPT-reference canvas; outgoing text is a single theme-aware neutral 20px rounded bubble instead of hard-coded green (also in dark mode). Kept time inside text bubbles, outside media; no image/photo/invoice geometry altered. Composer writes in a full-width top row with 44px plus/mic/send controls on the lower row. Existing reply/attachment rows, microphone audio state grid, `data-keyboard-open` / VisualViewport placement and send behavior remain canonically owned.
- **Regression:** `tests/test_chatgpt_visual_identity_20261107.cjs` added to canonical `tools/verify_current.py`; older type/search/epoch assertions were updated to reflect the intended same-owner appearance. `sw.js` public shell epoch is `pwa-chat-gpt-identity-ui256-20261107`, retaining separate avatar cache and all private message databases.
- **Verification & deployment:** Initial UI-256 commit `bd18d6ba` failed pre-existing PWA epoch prefix invariants and did **not** deploy; fixed the prefix and a test's owner selection in `6bf65c68d35ce539a44fc75e1514aefe6f2adbbd`. [Verify V21 #42366227174](https://github.com/1sl2tp/chat/actions/runs/42366227174) **SUCCESS**; [Deploy Chat Pages #42366227183](https://github.com/1sl2tp/chat/actions/runs/42366227183) **SUCCESS** with canonical verification, artifact upload/deploy and HTTPS custom-domain index/manifest build ID `19e8f023635ace9fa74c4e5e9b18a21da7681c716745f2aa2bff1353bd7a29aa`. Authenticated physical-iPhone PWA rendering has **not** been visually verified and must not be claimed from CI alone.
- **Rollback:** revert UI-256 visual styles, 3 adjusted tests, added test/verify wiring and public SW epoch; rebuild/redeploy canonical Pages. Never clear customer messages/media caches, databases, auth, Realtime or call state.

---

## 2026-11-07 — UI-255 · Audit of existing mobile Chat layout owners

- **Purpose:** The user asked for another scientifically coherent review rather than stacking random CSS. Audited the existing owner chain: `index.source.html` owns header/menu/call slots and contact-row structure, `shell.js` owns account/contact/avatar/timestamp navigation state, `contact-directory-admin.js` owns search/filter/category and pinned report order, `mobile-chat-refresh.css` owns message/composer sizing, `mobile-ui-polish.css` owns final mobile presentation, and `sw.js` owns public PWA shell versioning. Preserve payment/debt/photo/recent controls, Realtime, VN date, calling, keyboard safety, Zalo and scroll anchoring.
- **Root issues fixed:** (1) active-contact title was a flex-growing child inheriting the button's centered text, visually distancing the name from the avatar; `text-align:start` on the real label (with ellipsis) resolves that without moving any buttons; (2) UI-251 independently supplied name/preview/time and a full-bleed row border while UI-254 restyled them and cancelled the border via `!important`. Retired the duplicated UI-251 list selectors and left one late owner in UI-254.
- **Visual rhythm:** 44px header controls, 36px square selected avatar, 40px list avatar, 60px contact row, 64px time rail, 16px/20px 650-weight name, 13px/18px preview and 12px/16px time. Divider remains after the avatar (54px from list-row start), softened to 60% border contrast; last row has no line. Search, category filters, active state and scroll geometry are unchanged. The list Photos chip uses the same neutral surface as the menu button.
- **Regression:** UI-254 test updated for the single owner and forward-compatible newer PWA shell; `tests/test_chat_mobile_layout_coherence_20261107.cjs` verifies no duplicated UI-251 row typography/border, adjacent avatar/name, retained Photos navigation, four business actions, five filters, call owner and VisualViewport contract. `sw.js` cache epoch `pwa-chat-layout-coherence-ui255-20261107` updates only public shell assets.
- **Verification and production:** [Verify V21 #42358476723](https://github.com/1sl2tp/chat/actions/runs/42358476723) **SUCCESS** after narrowing one new test's CSS-selector assertion to the actual contact row; the earlier overly broad assertion had incorrectly included the business shortcuts' border. [Deploy Chat Pages #42358680172](https://github.com/1sl2tp/chat/actions/runs/42358680172) **SUCCESS** on commit `7d58c97b8cef`: canonical verification passed UI-254 and UI-255, Pages deployment succeeded, and the `chat.taphoa.xyz` HTTPS `index.html` and `version.json` matched build ID `a929354c851f42762f74fda278457702b9a0e9b37761757fd3ded6bdbd4fa819`. No authenticated live iPhone PWA screen/pixel walkthrough was possible; CI and production probe establish delivery of source, not final on-device layout appearance.
- **Rollback:** revert the CSS/test/docs changes with a fresh PWA shell epoch; never touch customer data, private media/cache, keyboard owners, database or Realtime delivery.

---

## 2026-11-07 — UI-254 · WhatsApp contact list typography and inset separators

- **Screenshot reference:** WhatsApp mobile Chat list at 15:51 compared to the user's current Chat directory. WhatsApp separators begin at the start of the contact text column, not beneath the avatar; name, preview and timestamps use an obvious three-level visual hierarchy. The business app intentionally retains its denser list instead of expanding to WhatsApp's taller rows.
- **Change scope:** Authenticated mobile (less than 1024px) only, owner `mobile-ui-polish.css`. Supersedes UI-251 full-width row borders for inactive rows. A single non-interactive `::after` hairline appears on all but the last conversation row, inset **54px** from the row's left (4px button padding + 40px avatar + 10px gap), 4px from the right; it does not cover the avatar or intercept taps. The row remains a 60px contact target with the canonical two-line grid; no padding, scrolling, keyboard, avatar dimensions or list DOM changed.
- **Type hierarchy:** Name **15px/20px, 700 weight**, preview **13px/18px, 400 weight**, time **11.5px/16px, 400 weight** aligned right with tabular numerals. Text truncation and the existing 64px time rail remain intact, including long customer names and report conversations. Search/filter layouts and message view remain unchanged.
- **Regression:** `tests/test_chat_directory_dividers_typography_20261107.cjs` added to `tools/verify_current.py`, checks divider inset, source metadata order, three-level type scale, 60px row, 40px avatar and shell epoch. `sw.js` uses `pwa-chat-directory-type-ui254-20261107` to update public shell CSS without clearing message storage.
- **Deployment/probe:** [Deploy Chat Pages #42357551303](https://github.com/1sl2tp/chat/actions/runs/42357551303) **SUCCESS**, including canonical Verify and UI-254 contract PASS, Pages deploy, and custom domain HTTPS `index.html`/`version.json` matching production build ID `a463edade43ee58941524a6ebf00b8dfb939808ede996629fed9bdd43d71a1d6`. This validates the deployed source, not an authenticated physical iPhone screenshot.
- **Rollback:** revert the scoped UI-254 CSS/test/verify and rotate the public shell epoch. Do not change contact data, presence, Realtime, Zalo, payment, calls or message history.

---

## 2026-11-07 — UI-253 · De-duplicate Photos and repair mobile header avatar

- **User screenshot:** authenticated iPhone PWA selected conversation displayed both top-header `Ảnh` tab and Admin `Ảnh` quick-action below, while the avatar appeared distorted rather than circular. The mobile header remained crowded.
- **Root cause:** UI-251/252 set top avatar to 36×36px but an earlier `mobile-ui-polish.css` rule kept `max-width:26px`/`max-height:26px`. Conflicting constraints squeezed the image. The redundant header `Ảnh` and business shortcut led to two entry points for the same function.
- **Scoped fix:** UI-253 in the existing mobile CSS owner applies only below 1024px, `data-route="chat"`, selected-contact header, and when `#chatQuickActions` is actually visible. In that exact state, only the top `Ảnh` tab is visually hidden and the identity track reclaims its width. The original Admin quick `Ảnh` handler, photo route and all other users/no-shortcuts states retain access to Photos. No tab click handler or route was removed.
- **Avatar fix:** enforce the same square width/height/min/max/flex basis (36px, or 32px at <=360px) with `aspect-ratio:1/1`, `border-radius:50%`, `overflow:hidden`, `isolation:isolate`, and loaded image `object-fit:cover;object-position:center`. The original user photo bytes/asset handling are unchanged.
- **Tests:** `tests/test_chat_mobile_header_avatar_20261107.cjs` checks conditional duplicate hiding, retained Photos navigation, 320–430px title space, image crop/shape and exact size rules. Registered in `tools/verify_current.py`. The UI-252 cache epoch test was made forward-compatible. First Verify failed only due a test string whitespace comparison, which was corrected; canonical Verify within the successful deployment passed.
- **PWA/deploy:** `sw.js` shell epoch bumped to `pwa-chat-header-avatar-ui253-20261107`, leaving account-scoped message/avatar data untouched. [Deploy Chat Pages #42356932674](https://github.com/1sl2tp/chat/actions/runs/42356932674) **SUCCESS**, including `Verify canonical chat`, the UI-253 test and custom-domain HTTPS index/version probe. Verified production build ID `6bc0aea8866e04f574bb9d2d8c33c438162205b7eb9b33562436457d6102107d`.
- **Limitations / rollback:** installed iPhone PWA pixel rendering was not separately screen-tested after deployment; the screenshot above predates the latest build. To roll back, revert this scoped CSS/test and rotate the PWA shell epoch; do not change Realtime, conversation messages, Zalo, call, payment or media storage.

---

## 2026-11-07 — UI-252 · Header balance and in-bubble time

- **User evidence:** iPhone screenshots at 15:18 comparing current Chat selected-contact header + separately placed timestamps against WhatsApp. Request: balance back/avatar/name/Ảnh/call areas and move message time inside conversations.
- **Scope & implementation:** visual-only rules in the existing owner `mobile-ui-polish.css`, narrow widths (<1024px). Header is 44px back track / flexible identity+44px Photos / content-sized idle call cluster; avatar 36px (32px on <=360px) and 44px action targets. Name is ellipsized before call controls become crowded. Active-call status remains under existing owner. On timestamped **text-only** bubbles, one existing accessible `time.message-sent-time` is visually anchored at the inner lower-right and bubble bottom padding grows from 8px to 25px (+17px), replacing the original 14px timestamp line + 3px margin. Therefore the virtualization height estimate and scroll anchoring remain unchanged. Hidden/empty text bubbles and image, invoice, gallery, audio, file formats preserve external timestamps so critical media content is unobscured. VN locale/dateTime/ARIA unchanged; no duplicated time node, DOM reparenting, JS or read-state update.
- **Tests:** added `tests/test_chat_mobile_header_timestamp_20261107.cjs` and wired into canonical `tools/verify_current.py`: header track geometry at 320/360/375/390/393/430px, minimum touch targets, active call unaffected, one timestamp, unchanged 17px virtual-height accounting, image safety and VN timezone. `sw.js` cache epoch advanced to `pwa-chat-header-time-ui252-20261107` (shell only, no private data clear, no new polling).
- **Deployment:** [Deploy Chat Pages #42355318579](https://github.com/1sl2tp/chat/actions/runs/42355318579) **SUCCESS**, including canonical Verify and custom-domain probe; live `index.html` and `version.json` matched build ID `8687393e9ec3e329d04e102bab889ee06c1d53f52d1347d87f200c45a366bc28`. New UI-252 contract was **PASS** during deploy verification. Physical installed iPhone PWA rendering not independently observed; do not equate CI with visual screenshot validation.
- **Rollback:** revert only UI-252 CSS/test, rotate PWA shell epoch again; do not touch realtime, messages, contacts, calls, composer, image geometry or cache of account-scoped data.

---

## 2026-11-07 — UI-251 · WhatsApp-inspired mobile Chat hierarchy

- **Reference / user request:** Four iPhone screenshots comparing the existing Chat list/detail/operations with WhatsApp-style chat. Goal: more coherent hierarchy and compact, readable mobile layout without changing retail actions.
- **Root observation:** in the selected conversation, a two-tab pill reduced the available identity/name space; four large business buttons looked like a form rather than contextual shortcuts. The contact list needed stronger name/preview/time hierarchy; message/date treatment could be calmer.
- **UI-only correction (owner `mobile-ui-polish.css`):** narrow (under 1024px) list header treats Trò chuyện as primary title and Ảnh as secondary shortcut; selected header prioritizes existing avatar and ellipsized contact name, with a visual back chevron on the unchanged sidebar-opening button; call controls remain in their original slot. Quick admin actions keep all four existing handlers with 44px touch targets in quieter rounded chips; Recent popup is not clipped. Directory remains 60px/2-line with a subdued divider, clearer name and metadata. Text-only outgoing/received bubbles get paired WhatsApp-like surfaces and compact day chips, while photos, galleries, audio, files and sent-time geometry stay owned by previous features. Composer stays on existing keyboard/VisualViewport owner.
- **Accessibility:** `shell.js::renderChatTabIdentity()` now labels the same left header button as “Quay lại danh sách trò chuyện” on narrow selected admin chat, otherwise “Mở danh sách trò chuyện”; no routing/role/read-state changes. Photo controls retain minimum 44px touch areas.
- **PWA:** `sw.js` shell epoch advanced to `pwa-chat-whatsapp-mobile-ui251-20261107`. No private message/avatar cache clear, no new polling or network owner. The old UI-250 advisory regression assertion was made forward-compatible with later safe PWA epochs.
- **Verification:** [Verify V21 run 42354354250](https://github.com/1sl2tp/chat/actions/runs/42354354250) **SUCCESS**. [Deploy Chat Pages run 42354354240](https://github.com/1sl2tp/chat/actions/runs/42354354240) **SUCCESS**, including canonical build/verify and production custom-domain probe. Production HTTPS, `index.html` and `version.json` matched build ID `873e423ae52ab96312fe5306e98cb9476b73e57d5daba72483a822d1d6bb0a09`. Earlier deploy run 42354116586 failed because a UI-250 test pinned the old cache epoch; the test was fixed before the successful run.
- **E4/E5 limitation:** no authenticated interactive or physical iPhone-installed PWA visual walkthrough in this run; CI and production build proof do not establish exact pixel placement on-device. The user should receive the new shell through the existing update policy without a manual cache reset.
- **Rollback:** revert scoped CSS and shell label changes, then use a *new* PWA epoch on rollback. Leave backend, Supabase/Realtime, Zalo, payment flows, read-state and data intact. Desktop three-pane layout remains untouched.

---

## 2026-11-06 — UI-250 · Manual Báo Giá advisories, no 06:00/09:00 automation

- **User request:** Screenshot of Zalo-linked group Báo Giá; stop automatic group advisories at 06:00 milk and 09:00 general, replace with three optional `+` menu actions: `Tư vấn sữa`, `Tư vấn hàng thường`, `Tư vấn hàng U`.
- **Actual send schedules, immediately disabled in production:** Supabase `cron.job` id 26 `taphoa-milk-advisory-0600-vn`, and id 27 `taphoa-daily-advisory-0900-vn`. Verified **active=false** twice against Supabase project `vtqhbhrkdxirqeqkgylo`. Other unrelated cron jobs (debt/payment/customer care) not changed. Kept cron entries + history for audit; did not delete previously sent messages.
- **Known recipient:** exact existing Zalo group `Báo Giá - 0911479555` and its currently linked Chat account. Fixed destination on both client gate and server; no generic customer broadcast, no direct third-party API, no new scheduler, no automated invocation. User's text `hàng u` matches product `source_key=hang-u`; other keys `sua` and `hang-thuong`.
- **Server:** Supabase migration `manual_group_advisory_preview_confirm_20261106` deployed successfully and a GitHub versioned migration `supabase/migrations/20261106213000_chat_manual_group_advisory.sql` captures the functions/grants and idempotent deactivation. `v21_private.taphoa_manual_advisory_text` builds category-scoped, catalogue-backed, non-promotional, single-part messages excluding tobacco/alcohol, with availability/price checks noted. Three read-only content probes returned lengths **433, 526 and 556 characters**, under 1400. `public.chat_admin_manual_advisory` verifies current active Admin, admin-linked group, intended contact/conversation, category allowlist and explicit `p_send=true` plus unique UUID command before writing one canonical Chat message. Uses sender+client ID conflict guard and checks existing Zalo outbound link. `anon/public` cannot execute; `authenticated` may execute but must pass Admin authorization checks. No message was sent by the assistant during verification; user has to confirm in UI.
- **UI:** `admin-composer-actions.js/.css` adds an independent `+` group-only category section; original six customer actions remain unchanged. On category click, an authorized read-only RPC generates a text-only preview. A separate `Gửi tư vấn` button obtains user confirmation; only then does `p_send=true` run with stable UUID (repeated uncertain network result reuses ID). Provides queued/sent feedback, a close button, scroll-safe preview, and follows existing Chat→Zalo outbound/SyncEngine. Source commit [1c45889](https://github.com/1sl2tp/chat/commit/1c458897118f7d28b6a3553514df1bdf7d7ee562), test VM fixture [2bb3305](https://github.com/1sl2tp/chat/commit/2bb330546d83a0742cf2ba401a2f7ae147922a91), legacy customer-only menu contract adjusted [63f420d](https://github.com/1sl2tp/chat/commit/63f420d0735b62e3df0f9fbef22c7467c185144b).
- **E2/E3:** [Verify V21 42237345512](https://github.com/1sl2tp/chat/actions/runs/42237345512) **SUCCESS**; [Deploy Chat Pages 42237074694](https://github.com/1sl2tp/chat/actions/runs/42237074694) **SUCCESS** (same UI source; later commit changed only test). Custom-domain step verified `https://chat.taphoa.xyz`, `index.html` and `version.json` matching `build_id=895705f3a08bdac4f76a37ccd634b1686d442f41e24ebc6a49614682638b52f8`. Server RPC installed and three draft kinds read-probed; no live send/receipt was performed because user should trigger that themselves.
- **E4/E5 pending:** actual installed iPhone/Android PWA menu rendering and successful end-to-end manual Chat→Zalo receipt need evidence of a user-approved send. Do not claim either from CI alone, and do not bypass user confirmation to test delivery.
- **Rollback:** keep both cron jobs `active=false` even if UI is reverted. If manual path has a regression, roll back the scoped UI and revoke `public.chat_admin_manual_advisory` while preserving historical Chat messages; no private data/cache deletion. Existing read-only monitoring Automations are separate from these now-disabled server send schedules.

---

## 2026-11-06 — UI-249 · Narrow header tab ratio and true center

- **Evidence/screenshots:** user submitted desktop 1140×1025, narrow 516×1027 and cropped header 507×176, requesting proportion correction for the menu circle, Trò chuyện/Ảnh tab pair, search and category chips. The tab switch visually sits ~20–25px right of center in the narrow no-contact screenshot; search/filter left rail and controls already have usable 44px/36px heights.
- **Confirmed cause:** `shell.js::renderCallFocus()` sets `slot.hidden=!showCallSurface` when no contact and no active call. On narrow screens, `mobile-ui-polish.css` defined `.compact-top-grid` with `44px minmax(0,1fr) auto`, so the trailing column collapsed when the call slot was hidden. The middle tab track was mathematically shifted right. Also the default tab switch was 20rem/320px, larger than needed for two short labels, and the Ảnh label 12.5px disagreed with Trò chuyện 13px.
- **Scoped correction:** `mobile-ui-polish.css` reserves a symmetrical 44px trailing grid track **only when** the direct `.call-focus-slot[hidden]` is hidden (`:has`), while the base visible-call layout remains `auto`. Caps the default two-tab switch at 17.5rem/280px, preserves equal intrinsic identity tab widths and the existing 44px/40px hit targets, and sets both labels to 13px. Search 44px, filters 36px/8px gap and independent desktop sidebar unchanged. No JS, keyboard geometry, scroll owner, call signaling, read-state, Realtime, DB, Supabase or message data were modified.
- **Regression:** `tests/test_chat_mobile_header_ratio_20261106.cjs` asserts DOM/CSS ownership, hidden-vs-visible call geometry, 320/375/390/430/507/516/640px centered math, label parity, PWA epoch and existing ARIA/scroll semantics. It is wired into `Verify V21` and canonical `tools/verify_current.py`. UI-248's historical exact shell-cache equality was updated to a forward-compatible invariant. Original test accidentally compared a shortened HTML class string; fixed in [b041333](https://github.com/1sl2tp/chat/commit/b041333742f90e0d4ad6b0ed1fb061cb46f46bdc), followed by the UI-248 future-epoch guard [1ec34b6](https://github.com/1sl2tp/chat/commit/1ec34b650efd2950a97e861e6f8a6040af9366ef). UI implementation [3a1a803](https://github.com/1sl2tp/chat/commit/3a1a803fbcb2412d7298b0eb5828e4614884df9f).
- **CI:** [Verify V21 #42233084786](https://github.com/1sl2tp/chat/actions/runs/42233084786) **SUCCESS** for the corrected implementation/tests. [Deploy Chat Pages #42233084759](https://github.com/1sl2tp/chat/actions/runs/42233084759) has completed canonical Build, Verify and artifact upload but deployment was still `in_progress` at last observation; **production domain/build verification NOT yet established**. Do not claim Pages PASS from source CI alone.
- **E4/E5:** physical iPhone/Android installed PWA rendering, update notice and real pixel alignment remain **PENDING**. No user cache clear, reinstall or test requests. Revert UI-249 CSS + SW epoch and tests and rebuild shell if regression is demonstrated.

---

## 2026-11-06 — UI-248 · Composer eligibility parity with actual send, Web/PWA

- **Context:** continuation of UI-247 ChatGPT-inspired iPhone chat refinement, focusing on Composer behavior rather than changing the keyboard layout or reworking the media/send pipeline.
- **E0 code-confirmed mismatch:** `app.js::canSendFromComposer` previously used `editor.value.length>0`, but `sendNow` trims `rawText` and rejects whitespace-only text when no media is attached. An input containing only spaces/newlines therefore painted the Send control as eligible while pressing it silently did nothing. This is a visual/interaction truth bug rather than a transport failure.
- **Scoped owner/fix:** `canSendFromComposer` now checks `editor.value.trim().length>0 || pendingAttachments.length`. `syncSendButtonState`, the existing `submit` handler and `sendNow` all reuse that same eligibility contract. The text is never re-written; native IME selection/composition, smart Return modes, 44px touch hitbox, colors, mic audio workflow and media-only sends are unchanged.
- **Proof/tests:** new `tests/test_chat_composer_whitespace_send_parity_20261106.cjs` executes the real `canSendFromComposer` + `syncSendButtonState` in a VM for blank/whitespace/Unicode NBSP, normal text, mixed/newline, media-only, IME composing, in-flight lock, keyboard Enter mode and ARIA-state parity. Wired into canonical `tools/verify_current.py` and dedicated Verify V21 workflow step. The older UI-247 test now checks PWA shell epoch forward compatibility rather than pinning the historical exact string. Commit [2f736cf](https://github.com/1sl2tp/chat/commit/2f736cfb5813e1ca855bcf55597d4969f9e5ba91).
- **E2/E3:** [Verify V21 42153041861](https://github.com/1sl2tp/chat/actions/runs/42153041861) **SUCCESS**; [Pages 42153041728](https://github.com/1sl2tp/chat/actions/runs/42153041728) **SUCCESS**. Production workflow verified `chat.taphoa.xyz` custom HTTPS and matching `index.html`/`version.json` build_id `c4e21eebba1bb29be7b77de4ad3b43e071f9a19a27782c2a34ed9a39b945568e`. PWA public shell epoch is `pwa-chat-composer-send-parity-ui248-20261106`.
- **Scope:** no changes to Supabase, Push, Realtime, read receipts, message/media ownership, attachment bytes, keydown listeners, keyboard geometry or private cache. No extra network/background calls and no data clear.
- **E4/E5:** on-device iPhone/Android PWA update notice activation, true pixel geometry and IME behavior remain unverified on a physical install; do not claim UI parity solely from source/CI. Rollback by reverting `app.js` eligibility, SW epoch and scoped tests, then rebuilding canonical shell; keep all private data intact.

---

## 2026-11-06 — UI-247 · ChatGPT-inspired mobile Chat directory polish

- **Evidence:** user supplied three iPhone images: two ChatGPT conversation/loading references and one TAPHOA Chat directory. Chat's directory needs search, category filters, contact status and sorting, so do not copy ChatGPT's single-conversation screen or blank loading spinner. Keep directory rows at 60px, section order and current single scroll/keyboard owners.
- **Concrete source issue:** the last authenticated narrow CSS in `mobile-ui-polish.css` reserved `padding-inline-end:36px` in **every** contact preview for the manage control, even for inactive rows where the touch manage control does not appear. This unnecessarily truncated long previews (visible in user's screenshot). The search area had no search icon despite its central navigation role, and the menu button lacked a clear circular hit surface.
- **Scoped fix:** `contact-directory-admin.js` adds one semantic, non-interactive inline SVG magnifier within the existing search field. Input remains `type=search`, `data-contact-directory-search` and same input/change callback. Its font is 16px to avoid iOS automatic focus zoom. The final authenticated mobile CSS retains 44px search/44px menu touch targets, gives search 16px radius and a 42px icon inset, uses soft focus/section treatment, and returns 36px to inactive preview rows while preserving it for selected rows with a visible manage button. Category chips, 60px row, avatar, name/time rail and sender previews are unchanged; the ChatGPT-inspired circular menu stays scoped to narrow authenticated header.
- **Tests/source:** commit [883dab3](https://github.com/1sl2tp/chat/commit/883dab31d1e61d26ec7126cbdb67ccce69e36b54); new `tests/test_chat_mobile_reference_polish_20261106.cjs` in canonical Verify and Verify V21; updated UI-240 preview reservation test and UI-246 PWA epoch test. No source of truth, auth, backend, Realtime, media upload, call transport, message send or focus/scroll owner changed.
- **E2/E3:** [Verify V21 42152209698](https://github.com/1sl2tp/chat/actions/runs/42152209698) **PASS**; [Deploy Chat Pages 42152209720](https://github.com/1sl2tp/chat/actions/runs/42152209720) **PASS**. Live custom-domain check verified `chat.taphoa.xyz` HTTPS and `index.html`/`version.json` canonical build_id `4a0b6d675034ed4da615f69b4cd74f042180c4337c0b16062440cd4412067e26`.
- **Open E4/E5:** the exact installed iPhone PWA's upgrade/badge and visual geometry are not remotely measurable; no device-specific proof of applied CSS is claimed. Do not ask for manual cache deletion or reinstall. Next comparison should use actual Chat thread/composer screenshots before changing their geometry.
- **Rollback:** revert only UI-247 search markup/styles, narrow CSS preview rule and shell epoch plus associated tests; canonical rebuild/deploy. Preserve user cache, messages and all private customer data.

---

## 2026-11-06 — UI-246 · Contact sidebar emoticon preview

- **User screenshot / E0:** contact row for “E Anh đạt” showed raw `Bạn: a cảm ơn em :)`, despite the conversation body already rendering `🙂`. The original preview string is correct stored content; only its presentation was inconsistent.
- **Owner:** `shell.js::contactPreview` displayed `preview_text` via `compactPreview` but never called the canonical display-only emoticon normalizer in `app.js`. The latter already mapped `:) / :D / ;) / :( / :P / :~` without changing message data or links.
- **Minimal correction:** expose `window.V21NormalizeDisplayEmoticons` from `app.js` (loaded before `shell.js`) and reuse it in `contactPreview` for text previews only, preserving media kind labels, outgoing `Bạn:`, bank preview and textContent security. Fallback to original text when the helper is absent (including VM fixtures). Both initial directory render and Realtime row patches already call the same preview function. Advance only Chat PWA SW shell epoch to `pwa-chat-sidebar-emoticons-ui246-20261106`.
- **Regression:** `tests/test_chat_directory_emoticon_preview_20261106.cjs` checks exact screenshot content, all supported markers, raw-text immutability, URL preservation, media labels, missing helper, initial and patch call paths, source ordering and PWA cache epoch. Wired to `tools/verify_current.py` and Verify V21. Implementation [6b0a0ca](https://github.com/1sl2tp/chat/commit/6b0a0ca138de50d8972a3cc23f5d45df51660201); guarded fallback [6464475](https://github.com/1sl2tp/chat/commit/64644752f6a19d2019e0bd658eb52bec6d30854b). Initial Verify caught missing `window` in historical VM fixture; corrected before final passing release.
- **E2/E3:** [Verify V21 run 42149423376](https://github.com/1sl2tp/chat/actions/runs/42149423376) **SUCCESS** and [Pages run 42149423264](https://github.com/1sl2tp/chat/actions/runs/42149423264) **SUCCESS**. Pages HTTPS custom-domain check confirmed `index.html` and uncached `version.json` build ID `4be88e4da5caa41487b73379f093c81c332f8ee662ccc0afa08da6eebedf6997` at `chat.taphoa.xyz`.
- **E4/E5:** actual installed iOS/Android PWA rendering and the specific device's update-banner activation **PENDING**; CI/source and custom-domain build verification are not proof of pixels on that device. No new polling, notifications, DB writes, auth changes, message text rewrites or storage clears.
- **Rollback:** revert the scoped `app.js` exposure + `shell.js` formatting and SW epoch with regression test; canonical rebuild before redeploy. No user cache/data deletion.

---

## 2026-11-06 — UI-245 · Align sent-time with chat bubbles, unify text/media spacing

- **Reported issue:** user screenshot shows sent times not reliably aligned with their visible message/photo edge; gaps between text, image and adjacent messages do not follow one consistent rhythm.
- **Root source:** `index.source.html` used an old mixed-media selector targeting `[data-message-media-root]` as a direct child, but `app.js` now wraps it in `.message-media-shell`. Separate media-type gaps (7–11px) and a mobile 6px important override conflicted. Message units did not own both the bubble and timestamp as one sender-aligned flex column.
- **Fix:** sender-aligned `.message-unit` and intrinsic text/time widths; timestamps align right for outgoing and left for incoming messages, including image/gallery. Mixed text+media gap is 8px using the actual media shell. Same-sender rows use 8px regardless of text/image/audio/file; sender changes use 14px. Mobile/PWA foundation token and shell cache epoch advanced without touching app message data or scroll owner.
- **Regression:** extended virtual sent-time contract and updated outdated conversation-axis/UI-240 epoch tests to check the new semantics. Fix commits: [UI change 8ca82de](https://github.com/1sl2tp/chat/commit/8ca82deb9310f254170703740c4de76fe86806b0), [aligned tests fc7d7b2](https://github.com/1sl2tp/chat/commit/fc7d7b2632d5a6fe04929ac6869ecd9b22bf0c65). An initial CI/Pages attempt failed stale assertions; the corrected [Verify V21 42148077688](https://github.com/1sl2tp/chat/actions/runs/42148077688) and [Pages deploy 42148077640](https://github.com/1sl2tp/chat/actions/runs/42148077640) **PASS**.
- **Production proof:** Pages custom-domain step confirmed HTTPS `chat.taphoa.xyz` and matching `index.html`/`version.json` `build_id=d25220c9a784663038ff7204bed036782cb346bf78719bee75f0c7fc9e151b59`. Actual installed iOS/Android PWA device screenshot and update notice activation remain **E4/E5 PENDING**; do not infer physical pixel alignment solely from CI.
- **Scope/rollback:** no auth, Realtime, Push, DB, media bytes or business logic changed. Roll back UI-245 CSS/source + SW epoch and synchronized tests together if physical regression is observed. No customer storage or message cache clearing.

---

## 2026-11-06 — UI-240 · Narrow directory spacing, preview and timestamps (CI + Pages PASS; device visual PENDING)

- **User evidence:** desktop Chrome at narrow ~704px width showed uneven spacing between Chat/Ảnh top switch, search, filter chips, first contact row and bottom, with contact avatar/name/preview/time needing a consistent axis. The prior UI-239 removal of the redundant visible “Danh bạ” heading remains in place.
- **E0 failure reproduced:** the effective narrow CSS had inconsistent 5px/7px/8px tool rhythm and 64px contact rows; message previews occupied only the first grid column even though the timestamp occupied the second column on the **first** line only. UI-240 CSS/source contract reported FAIL before patch.
- **Minimal correction:** `mobile-ui-polish.css` adds one last, authenticated <=63.999rem rhythm owner. Search 44px; search-to-filters and chip gap 8px; filter 36px; list starts with 4px inset; contact row 68px; avatar 40px, gap to name 10px; name 20px/preview 18px separated 2px; 64px timestamp stays on name row. Preview uses the second line across both columns but reserves 36px for the existing contact manage affordance. Bottom list inset respects `safe-area-inset-bottom`. No changes to scroll/keyboard owner, Realtime, database or message data.
- **Release/test:** source + SW + regression + Verify workflow commit [9975171](https://github.com/1sl2tp/chat/commit/99751717340d3fa65e717c08a8532bbc8f422344). Legacy UI-239 test hardcoded the previous shell epoch and initially failed; corrected by test-only commit [bcb9a47](https://github.com/1sl2tp/chat/commit/bcb9a477f78c7ec20f264b6d6eae571b0f64c8e6). UI-239, UI-240 and complete Verify V21 **PASS** [run 42121281757](https://github.com/1sl2tp/chat/actions/runs/42121281757).
- **Canonical deploy:** [Chat Pages 42121106647](https://github.com/1sl2tp/chat/actions/runs/42121106647) **SUCCESS**; workflow checked HTTPS custom-domain `index.html` and uncached `version.json` `build_id` both equal `337f477971db0a5e7394ca10688a5f2b79dd40868acf19df58b1a9bd3836c6f8`. CSS cache epoch `pwa-chat-directory-rhythm-ui240-20261106`. CI PWA update tests PASS; installed-device real visual geometry / button **Cập nhật** interaction is **PENDING**, not inferred from successful deployment.
- **Rollback:** revert scoped UI-240 CSS block + SW epoch + UI-240 test/workflow, without clearing private cache or data. Keep UI-239 forward-compatible epoch assertion.

---

## 2026-11-05 — UI-238 · Forward recipient search hidden under iOS PWA keyboard

- **Screenshot evidence (14:36 Asia/Ho_Chi_Minh):** installed iOS Chat PWA showed blurred conversation, native keyboard/accessory and a message-sharing recipient bottom sheet mostly below the keyboard edge; user reported the same while sharing and searching. No proof that other unrelated search surfaces are affected.
- **Root source gap:** message-forward.js places a recipient search inside the global .message-forward-overlay/.message-forward-card. Existing mobile CSS anchors the sheet to the layout viewport bottom, while shell-form-viewport-policy.js lacked a message-forward owner. On iOS, the software keyboard reduces the visual viewport but does not necessarily move a fixed bottom sheet upward. The existing platform VisualViewport owner already supports Settings and Directory.
- **Minimal fix:** add message-forward to the platform form owner. On focused keyboard-open mobile/touch, CSS bounds the share sheet by the measured VisualViewport top/height, pins the search within the card above keyboard, gives recipient results the only vertical scroll, sets a 16px search font, and removes bottom safe-area padding only while keyboard occupies it. No parallel resize listeners, viewport polling, root scroll changes, or send behavior changes. Close/reopen/blur automatically restore ordinary sheet state.
- **Evidence E1–E3:** [PR #233](https://github.com/1sl2tp/chat/pull/233) squash-merged as [3482299](https://github.com/1sl2tp/chat/commit/3482299b662c7a4a41d673b41a417b45118f5f6e). Added tests/test_chat_forward_search_ios_keyboard_20261105.cjs to Verify V21 and canonical Pages verify. Dedicated UI-238 CI step **PASS** in [run 41989089409](https://github.com/1sl2tp/chat/actions/runs/41989089409); full Verify V21 still **FAIL** at the pre-existing unrelated BANK-193 customer picker test. [Deploy Chat Pages 41989206348](https://github.com/1sl2tp/chat/actions/runs/41989206348) **SUCCESS**, including canonical verify, Pages deploy and custom-domain build_id read-back.
- **E4/E5:** actual installed iPhone visual placement and user acceptance after activating the new build are **OPEN**; CI simulation plus Pages verification are not evidence of client activation or real keyboard geometry. Avoid claiming all iOS input surfaces are fixed.
- **Safety & rollback:** no Supabase/DB/auth, realtime, bank, media, navigation, PWA identity, or message send changes; no customer data/cache clearing. Roll back only shell-form-viewport-policy.js, message-forward.css and test wiring if a regression is observed.

---

## 2026-11-05 — AUTH-237 · iOS PWA lost approved device key / erroneous new pending Admin device

- **Production evidence (Asia/Ho_Chi_Minh):** user screenshot at 13:44 showed previously signed-in Admin blocked by "Thiết bị này đang chờ Admin duyệt". Read-only Supabase check found an approved iPhone last seen 13:36:37 with an active session and a new pending iPhone created 13:43:19 with no active app session. The two records are consistent with a rotated/missing browser device UUID; they do **not** cryptographically prove the two device records are the same physical handset.
- **Source cause and correction:** auth-session-store.js previously kept device UUID only in localStorage and immediately generated another one when missing; the approval_required bootstrap branch also called auth.signOut(scope:local), discarding valid Auth credentials. Use first-party Secure/SameSite=Strict cookie as secondary *identifier* store, self-heal localStorage from it, and fail closed without registering an ephemeral device when neither store is writable. APPROVAL_PENDING keeps Auth tokens but not an authorized **app session** and offers an explicit no-password retryApproval on the existing login form. shell.js displays "Kiểm tra duyệt". Never autoapprove a newly seen Admin device.
- **Regression:** tests/test_chat_ios_pwa_device_session_20261105.cjs exercises existing approved key backup, missing-localStorage recovery, pending→approved retry without signOut, and inaccessible storage fail-closed. Registered in both canonical verifier and Verify V21 workflow. PR [#232](https://github.com/1sl2tp/chat/pull/232) merged as [b025354](https://github.com/1sl2tp/chat/commit/b0253541293060865e9cc32d25e360691486d972). AUTH-237 step **PASS** in [Verify 41983932090](https://github.com/1sl2tp/chat/actions/runs/41983932090); overall Verify remains blocked by pre-existing **BANK-193** customer picker test unrelated to auth.
- **Deploy:** [Pages workflow 41984129824](https://github.com/1sl2tp/chat/actions/runs/41984129824) **PASS** for canonical verify, Pages deploy and live chat.taphoa.xyz custom-domain/build ID verification.
- **Security and residuals:** no SQL mutation, no admin device approval, no bypass of v21_auth_bootstrap, no changes to RLS, RPC permissions, heartbeat, Realtime, Supabase account, service-worker cache or customer data. The existing pending device from 13:43 still requires normal Admin approval; if all origin stores were erased before this patch there is no safe automatic reconstruction of the previously approved device UUID. Actual iPhone PWA build activation and recovery remain **E4 OPEN**; GitHub Pages success is not user-device proof.
- **Rollback:** revert only scoped auth/shell UI and test contract; preserve auth/device rows and private app data. Do not clear PWA IndexedDB or customer message caches.

---

## 2026-11-05 — CHAT–ZALO iOS DIRECTORY ROW COLLAPSE · screenshot regression fix

- **Actual device evidence:** user iPhone PWA screenshot at 10:14 showed multiple account cards reduced to thin outlined strips; avatars, Chat/Zalo labels and linked-account actions overlapped through subsequent rows. Settings tab itself remained readable with extra unused bottom space.
- **Confirmed root cause:** the outer `.zalo-account-list` remained a CSS Grid scroll container with many implicit auto tracks and each `.zalo-account-row` explicitly had `min-height:0`. Under a long 136 Chat / 225 unassigned Zalo directory, grid tracks were allowed to shrink below contents. Chromium 390×844 synthetic fixture with 150 rows reproduced first card **20px** tall while its actions extended outside the card.
- **Single UI owner fix:** scoped `zalo-admin-link.css` mobile `[data-active-tab="links"]` list to `display:flex; flex-direction:column; align-items:stretch` with one `overflow-y:auto` owner; each row is `flex:0 0 auto; min-height:max-content`, retains its own internal single-column grid. No row can be compressed by the total number of items. Synthetic Chromium after fix: first card **160px**, all actions contained, `scrollHeight` expands normally. Desktop layout, Settings pane and keyboard viewport policies untouched.
- **Regression:** `tests/test_chat_account_settings_ios_density_20261105.cjs` now asserts the actual no-shrink list/row CSS rather than only testing card gaps/selector presence. PWA shell cache epoch advanced to `pwa-chat-zalo-directory-no-collapse-v3-20261105`.
- **Safety:** no changes to Admin auth, backend, Chat/Zalo linking data, search algorithms, group classification, Agribank, financial collection or Realtime owner. No new calls, timers or retention mechanisms.
- **PR:** [#231](https://github.com/1sl2tp/chat/pull/231) merged at `c1383d215836aa2903665b19001415713803404d`. **Canonical build + Verify in Pages + custom-domain deploy: PASS** [workflow 41961010830](https://github.com/1sl2tp/chat/actions/runs/41961010830). Broader separate Verify V21 is known to be blocked at a BANK-193 test unrelated to this patch.
- **Acceptance boundary:** CI + local headless Chromium provide reproducible technical evidence. Actual installed iOS PWA pixel geometry after device activates the new build remains **OPEN E4**; do not mark phone verification complete without seeing that state.
- **Rollback:** revert the scoped directory CSS, PWA cache epoch and regression contract together. No customer data reset or IndexedDB clearing.

---

## 2026-11-05 — Chat Account Settings · compact iOS cards and Chat–Zalo

- User evidence: iPhone PWA Settings tab had oversized stacked action buttons and visually clipped first/last rows; Chat–Zalo link cards used unnecessary vertical space.
- UI owner: `zalo-admin-link.css`. Compact mobile settings keep short-card actions beside status text, with full-width explanatory banking cards; linked-account rows have smaller gaps and consistent 40px actions. The settings tab and links tab each retain their own scroll owner; header, tabs and search remain outside the list scroller. Narrow phones <=360px still stack actions safely.
- Business controls untouched: Admin push, friend requests, devices, Agribank pairing, auto-collection status/actions, Chat–Zalo link/unlink/create and Zalo individual/group labels. No new API, Realtime, polling, database or banking write logic.
- PWA shell epoch: `pwa-chat-account-settings-compact-v2-20261105`; generated `index.html` and `version.json` follow the canonical build pipeline.
- Checks: extended `test_chat_account_settings_ios_density_20261105.cjs`; fixed outdated fixed-epoch checks in UI-208, PWA standalone and UI-213 tests without changing runtime behavior. Updated a stale mobile timestamp test rail expectation from 56px to the actual 58px directory CSS.
- PRs: [#229](https://github.com/1sl2tp/chat/pull/229) and [#230](https://github.com/1sl2tp/chat/pull/230). **Pages build / canonical verify / deploy: PASS** [workflow 41959986839](https://github.com/1sl2tp/chat/actions/runs/41959986839).
- Release limitation: the Pages workflow verifies the GitHub Pages target and custom-domain binding. An installed iOS PWA visual measurement / user-device activation is **not independently proven** here; leave E4 device acceptance OPEN. Separate `Verify V21` checks may still fail in BANK-193 customer-search tests unrelated to this UI patch; do not conflate this with successful Pages canonical verification.
- Rollback: revert the scoped CSS, SW epoch and aligned regression test changes; preserve customer data and caches containing messages.

---

## 2026-11-02 — CHAT HEADER · Equal-width User / Ảnh tabs

- Requirement: two equal horizontal tabs, each naturally sized to the wider intrinsic tab, never overlapping video/phone buttons. Prior desktop CSS used unequal max-content tracks and mobile used a fixed 52px Photos track.
- UI owner: `work-customer-summary.css` uses `width:max-content` and `grid-template-columns:repeat(2,minmax(0,1fr))` with user/Photos full track width; desktop cap 260px. `mobile-ui-polish.css` uses the same equal-track rule with 280px cap. Names still ellipsize if calls constrain the middle track.
- No JS measurements, ResizeObserver, scrolling, keyboard, backend, data, auth, media or call-state behavior changed.
- Chromium geometry model widths 320/375/390/500/700px and short/long names: two equal-width tabs, no horizontal overflow. CI: [Verify PASS](https://github.com/1sl2tp/chat/actions/runs/41375862960), [Deploy PASS](https://github.com/1sl2tp/chat/actions/runs/41375862897), [source commit](https://github.com/1sl2tp/chat/commit/1d865ac8d300ce71f5f0f2bf899280fc97372b1e). New contract `test_chat_header_equal_tabs_20261102.py`; PWA shell epoch `pwa-chat-equal-tabs-20261102`.
- E4 iPhone/PWA actual-device visual acceptance remains OPEN; CI does not establish that an installed PWA activated the newest build.
- Rollback: restore the scoped CSS, tests and shell epoch, rebuild canonical artifacts; do not touch customer data.

---

## 2026-11-02 — MULTI-PASS CHAT UI QA · 5 passes completed, actual-device check OPEN

**Progress rule:** fix what is confirmed in source; continue into the next pass even if a previous pass still awaits CI or device proof. Mark PASS only with evidence. This record describes completed work in this chat turn, not a scheduled/background job.

| Pass | Scope and outcome | Verification |
| --- | --- | --- |
| **Vòng 1 — PASS** | Root-cause audit: CALL-186 private callback button was 34×34 while video Chat call was 44×44; corrected 44×44, aligned icon and hid callback button during live-call states. Also fixed stale private phone RPC results after changing contact/admin. | Scoped contract; full Verify V21 success |
| **Vòng 2 — PASS** | Phone modal accessibility: 44×44 close target and 44px action buttons; Escape and backdrop close, focus restored only if the opener remains available; labelled dialog. New VM runtime regression exercises both focus cleanup and admin/contact privacy checks. | `tests/test_call186_phone_header_modal_20261102.cjs` in CALL-186 CI step |
| **Vòng 3 — PASS** | Four Admin customer shortcuts now retain 44px touch targets and 12px safe-area rails on touch tablets as well as narrow phones, without changing desktop fine-pointer layout. PWA cache epoch rotated to `pwa-chat-ui-audit-round4-20261102`, with corresponding UI-208/UI-213 tests. | UX-192, UI-208 and UI-213 CI steps success |
| **Vòng 4 — PASS** | Full regression/build/deployment. GitHub Actions Verify V21: **158 successful checked steps, 0 failed**, including chats, calls, keyboard, account settings, banking guards, PWA, and canonical source. GitHub Pages deployment succeeded. | [Verify V21 41362811045](https://github.com/1sl2tp/chat/actions/runs/41362811045); [Deploy Chat Pages 41362811118](https://github.com/1sl2tp/chat/actions/runs/41362811118) |
| **Vòng 5 — PASS** | Ten independent source invariants: no floating message ellipses; native text selection; media long press; four customer action buttons; narrow header widths; private phone context guard; modal Escape/focus; live-call phone hide; settings tab visibility; PWA shell epoch. | 10/10 grounded in latest GitHub main files, read-only cross-component check |
| **Vòng 6 — OPEN (E4/E5)** | Actual desktop/Chrome narrow screen and iOS/Android PWA user-device geometry/gesture acceptance: measure button hitboxes and bounding rectangles, latest build ID, keyboard open/close, scroll and long-press selection. Not marked PASS without a real-device observation. | Device proof unavailable in code-only access; do not misstate CI as device verification |

**Modified source:** `contact-phone-admin.js` (header alignment, privacy lifecycle, accessible modal), `admin-composer-actions.css` (touch-tablet shortcuts), `sw.js` (offline-shell epoch), scoped tests and Verify workflow. No backend RPC/SQL, authorization, call engine, message cache, customer ledger, banking reconciliation or Realtime operations changed.

**Rollback:** revert only these scoped UI/client patches and PWA shell epoch, maintain the canonical `index.source.html` → `index.html`/`version.json` build and its tests. Never reset customer data or IndexedDB to force a style change.

---

## 2026-11-02 — CHAT UI ROUND 3 · Desktop + narrow-browser screenshot audit

- Two owner screenshots: desktop contact sidebar + chat, and a narrow ~500px Chrome window. Header profile pencil was 34×36 while call control was 44px; mobile contact switch inherited a max-content width rule from Work CSS; Admin customer shortcuts had only 38px mobile targets with a 6px side rail while header used 12px. Desktop active contact showed a persistent decorative “⋯” beneath the preview.
- Scoped UI changes: `index.source.html` makes desktop profile edit a 44×44 hit area, keeps desktop contact manage visible on hover/focus but removes the persistent selected-row “⋯”; touch selected-row management remains accessible. `mobile-ui-polish.css` keeps the contact chip within its grid track (max 280px, minmax name + 52px Ảnh tab), preventing long names from competing with call controls. `admin-composer-actions.css` gives all four mobile customer shortcuts minimum 44px hit targets, 52px row and consistent 12px safe-area rails. No changes to routes, search, message rendering, long-press selection, Composer, call state logic or financial/RPC business actions.
- `sw.js` offline shell epoch rotated to `pwa-chat-ui-round3-20261102`; no private cache, IndexedDB, chat history or financial data deleted. PWA cache regression tests updated. Existing Verify steps extended in `test_ui214_chat_profile_directory.py`, `test_ux192_one_tap_chat.py`, `test_v21_mobile_ui_polish.py`.
- Source commit [3c99aaac63b8](https://github.com/1sl2tp/chat/commit/3c99aaac63b89adfd6cca1d5f3b900f343394aad). `Verify V21` **SUCCESS** [41361903514](https://github.com/1sl2tp/chat/actions/runs/41361903514). `Deploy Chat Pages` **SUCCESS** [41361903516](https://github.com/1sl2tp/chat/actions/runs/41361903516), with deployment custom-domain verification.
- E4/E5 device-side visual acceptance still pending. Web/PWA user should reopen after worker activation and check header with long names, narrow four quick actions, desktop selected contact more-menu hover/focus, and iPhone text selection/Composer. CI/Pages PASS does not assert their currently open browser/PWA tab is already running this build.
- Rollback: revert these scoped CSS/HTML and tests, rotate shell epoch, rebuild canonical `index.html`/`version.json`. Do not touch backend, auth, calls, money, chat messages or Realtime.

---

## 2026-11-02 — CHAT MOBILE HEADER + MESSAGE ACTION POLISH

- Screenshot showed uneven avatar/name/Ảnh/call control alignment plus noisy floating ellipsis next to each incoming message.
- One mobile visual owner: mobile-ui-polish.css aligns the header using a 44px menu rail and consistent 44px idle call target; 26px avatar, compact 52px Photos tab, ellipsized contact name. Existing active-call layouts, routes and permissions unchanged.
- app.js and index.source.html remove the visible per-message ellipsis. Short tap on text shows existing Reply/Copy/Forward actions; long press remains native selection, drag/links/reply quote/highlight never hijack selection. Keyboard Enter/Space opens same actions; media long-press unchanged. No backend changes, RPC, polling, push or financial writes.
- PWA shell epoch pwa-mobile-header-message-polish-20261102; only offline shell rotates, not private caches. UI-208/UI-213 PWA tests updated.
- Source d8dec7457c42dc884fac5034f7b324712089f2c3, tests 50d07ec79ffd10cda863b229be4949ba506151e1. Verify V21 SUCCESS https://github.com/1sl2tp/chat/actions/runs/41361008328; Deploy Chat Pages SUCCESS https://github.com/1sl2tp/chat/actions/runs/41360932135.
- E4 actual PWA/browser device visual and gesture acceptance pending. Check narrow 320/375/390/430 widths, header, long names, short-tap actions, long-press text selection, media and keyboard. CI/Pages cannot attest to client activation.
- Rollback: revert only mobile CSS, text-action JS, relevant tests and shell epoch; build canonical source output. Keep user data.

---

## 2026-11-02 — CHAT ACCOUNT SETTINGS ROUND 2 · two-tab layout, mobile no clipped controls

- User-provided screenshots showed the five Admin setting cards constrained inside a 34svh/34dvh independent scroller: Auto Collection button cut at the scroll boundary, Agribank card directly beneath and Chat–Zalo directory competing for vertical space on ~500px browser widths.
- UI owner: `zalo-admin-link.js` and `zalo-admin-link.css`. Separated account settings into **Thiết lập** and **Chat – Zalo** tabs with ARIA tablist, keyboard arrows and focus restoration. Exactly one content-scrolling panel is visible at a time; desktop remains a compact two-column preference grid, mobile uses full-width cards; Auto Collection is a full-width last row. Removed automatic focus on the hidden Zalo search input when opening Settings so iOS keyboard is not summoned unexpectedly.
- Existing actions and backend untouched: notification permissions, friend invites, device management, Agribank token issuance, guarded auto-collection RPC, Chat–Zalo search/filter/create/link/unlink; no change to customer data, Supabase/RPC permissions, messages, Realtime, cache/database or financial ledger. PWA shell epoch moved to `pwa-settings-tabs-round2-20261102`, preserving offline-first and message caches.
- Regression contracts updated in `test_chat_account_settings_compact_cards_20261102.cjs`, `test_ui208_pwa_fresh_navigation.cjs`, `test_ui213_first_paint_guard.py`. Kept the historical mobile settings selector stable in the markup. `Verify V21` **SUCCESS** [41360290263](https://github.com/1sl2tp/chat/actions/runs/41360290263). `Deploy Chat Pages` **SUCCESS** [41360290286](https://github.com/1sl2tp/chat/actions/runs/41360290286), including Pages custom-domain verification.
- E4 PWA/browser device-side visual acceptance still pending: reopen Settings, switch both tabs, scroll long Zalo list, open search with iPhone keyboard, confirm 5 actions remain tappable and no bank action overlaps. Do not treat CI/Pages success as a screenshot from the user's actual device.
- Rollback: revert the scoped UI/CSS changes and shell epoch; rebuild canonical `index.source.html` → `index.html`/`version.json`; do not reverse financial or Zalo data.

---

## 2026-10-20 — BANK-184 LIVE (AUDIT ONLY) · Admin exception explanation for pending bank credits

- Owner approved an explainable Admin review workflow for ambiguous/missing-time bank receipt evidence, including 461,000 VND multi-row statement and 1,568,000 VND two image captures. Does NOT approve auto ledger mutation until a separately approved secure financial writer exists. Never label `review` as `received`.
- Supabase migrations applied: `bank184_admin_exception_evidence_audit`, `bank184_one_primary_receipt_per_manual_review`, `bank184_one_exception_record_per_bank_credit`. Private RLS-enabled `chat_bank_manual_exception_reviews`, Admin app-session guarded `chat_bank_manual_exception_record` and `chat_bank_manual_exception_get`. Mandates primary original image, reason code, >=30-character explanation, Admin checked image assertion, original evidence snapshot, account+sender ownership, eligible/unused official Agribank notice, supplementary images from same customer/date only. Unique bank notice and primary receipt; no editing overwrites, no debt/ledger/notification/message mutations. `requires_additional_proof` for ambiguous multiple-transaction/image without amount, `evidence_reviewed_pending_collection` for matching positive original bill; BOTH are non-payment statuses. Authenticated role cannot SELECT review table; authenticated RPC checks active admin session.
- UI source `bank-report-dashboard.js/.css` + `index.source.html`: optional bottom-sheet dialog under 'Lập biên bản ngoại lệ' on bank-only items with unlinked images; selected original image, supporting images, reason picker, explanation, explicit original-image check, prior-record read and disable duplicate submissions. Can open full original image without closing audit form. Same-day exact-amount screenshots later in the day and adjacent multi-row ambiguous images are surfaced as *suggestions only*, never auto-recognized as paid. SW epoch `bank-audit184`.
- `Verify V21` **PASS** [39441792226](https://github.com/1sl2tp/chat/actions/runs/39441792226), `Deploy Chat Pages` **PASS** [39441792203](https://github.com/1sl2tp/chat/actions/runs/39441792203). Added `tests/test_bank184_manual_exception_audit.py` to CI; corrected BANK-183 candidate test to include late-day duplicate snapshots and close-in ambiguous multi-row statements.
- Production smoke is read-only: table still empty until Admin reviews, notification #35 for 1,568,000 VND and #43 for 461,000 VND remain unlinked and no ledger newly posted. Do not claim end-to-end human-device form submission was exercised; requires actual Admin in PWA. No historic bill rescans. **Unfinished:** separate, guarded *manual financial collection* after bank/receipt evidence review. Earlier attempts to alter the atomic financial writer were blocked; never bypass that restriction, and do not tell the user that clicking record note changes customer balance.

---

## 2026-10-20 — BANK-182 PARTIAL · Missing printed clock, shared memo/reference

- User approved accepting a bill without a printed **time** when both independent sources share exact distinctive transfer memo and transaction reference, plus amount, current printed bill date, confirmed Agribank account, unconsumed unique credit and no duplicate. Plain Chat send time is NOT a substitute for the printed bill date; equal money+send-time alone cannot authorize ledger.
- Live scan Edge `v21-bank-bill-event` deployed **version 22 ACTIVE** after `Verify V21` run [39374156060](https://github.com/1sl2tp/chat/actions/runs/39374156060) SUCCESS. Added optional OCR fields `transfer_date_vn` and `transfer_content` (retains existing rule version), along with exact `transfer_reference`. Missing-clock preview uses a VN same-day, same-amount, same full memo and distinctive reference check, rejects conflicting receiver fields, ambiguous bank notices/bills, wrong day, own transfer or no reference. No more AI scans for persisted `amount_read`; wake reuses stored fields.
- **IMPORTANT — NOT an auto-collection rollout**: protected production writer `public.chat_bank_app_collect` continues requiring `r.transfer_at_vn IS NOT NULL`. Attempt to add corresponding atomic SQL authorization was blocked by tooling safety validation; **no DB migration for missing-time financial writes was applied**. The preview intentionally returns `status=review`, reason `reference_and_memo_verified_waiting_financial_guard`, even on unique proof to prevent a false promise of credited money. Requires separately approved and verified financial-writer revision before accepting no-clock auto-collections. Do not silently change preview to `candidate_unique` first.
- Regression `tests/test_bank182_missing_time_reference.mjs` in CI validates missing clock, unique bank match, exact memo/ref, wrong date/amount, ambiguous same-amount, recipient conflict and explicit review-only gate; baseline old timestamp-based matching still passed.
- Production read-only spot check for 1,568,000 VND (bill sent by `csam` at 09:25:19 VN, notification #35 Agribank 09:25) still has null printed transaction day/time, null memo and null transaction reference. It **must remain unlinked and uncollected**; the newly deployed OCR fields affect future scans, not retroactive fabricated data.
- Rollback Edge to version 21 if vision/preview has trouble. No debt ledger, bank notification, receipt status or historic collection has been modified. No new cron or polling. Bank arrival trigger has not yet been extended to re-wake reference-only older bills, because writing them automatically is intentionally disabled.

---

## 2026-10-20 — BANK-181 LIVE · Admin-only real-time bank Web Push (no Chat report spam)

- User approved PWA Push for four events: **Agribank có tiền/chờ bill**, **bill mới/chờ Agribank**, **khớp & đã ghi thu**, **bill sai/trùng/cần tra soát**. These are events, NOT Chat messages; the live reconciliation table remains canonical and unchanged. Clicking Push opens `taphoa_bao_cao` and selects the original VN business day and matching notice/receipt row. SW uses a stable `bank:notice:<id>` tag for bank-only → matched and closes earlier receipt-waiting notifications when a match arrives. No Chat unread badge changes for a bank event.
- DB deployed additive migration `bank181_admin_web_push_outbox` on project `vtqhbhrkdxirqeqkgylo`. Private RLS-protected `chat_bank_admin_push_outbox`, keyed `event_key,recipient_account_id`; after-insert triggers on Agribank credit, AI bill scan status, collection link, plus event-driven reuse of `v21_private.admin_push_signal`. Only current VN business day from 20/10, no historical event replay. Owner `BUI XUAN TUNG` excluded by both `is_own_transfer` and raw transfer body. Test customer account excluded. Matched push requires valid ledger-linked bill + exact amount + correct account/official package/time-day. Queue RPCs grant only `service_role`, authenticated cannot SELECT queue or claim it.
- Edge `v21-admin-push` version **4 ACTIVE** (`verify_jwt=false`, same as previous production) handles the existing authenticated/message/call workflows unchanged and additionally claims queued bank events, revalidates canonical state just before sending to active Admin subscriptions, drops outdated awaiting events, uses existing Vault VAPID, and acks once. Staged deployment: Edge first (missing-queue RPC temporarily tolerated), then SQL migration. No new cron/polling or new third-party push service.
- Service Worker epoch `bank-push181` and `admin-push-controller.js` deep link `push_bank_day`/`push_bank_notice`/`push_bank_receipt`/`push_bank_status` to `bank-report-dashboard.js`. Normal Chat push/read-state logic is unchanged. Uses existing OS notification permission; it cannot bypass a denied permission. Two existing enabled Admin subscriptions verified (PWA).
- Regression tests: `tests/test_bank181_push_payload.mjs`, `tests/test_bank181_push_wiring.py`; added to `Verify V21`. **Verify V21 run 39346667397 PASS**. **Deploy Chat Pages run 39346176734 PASS** after last client-side code commit; later commits touched only Edge, SQL, tests and docs. UI-180 PWA cache test updated to accept advancing namespaced epochs without losing its thumbnail contract.
- Production read-only verification: triggers 4/4 installed, `chat_bank_admin_push_claim` returns zero on empty queue; customer role cannot read queue nor claim RPC; `service_role` can claim. Queue empty after installation, intentionally no retroactive notifications or fake money/bill events. Full end-to-end device notification awaits next real credit/bill/match after installation and should be observed without editing financial history.
- Rollback separately: stop/drop `chat_bank_admin_push_notice_trg`, `chat_bank_admin_push_receipt_trg`, `chat_bank_admin_push_match_trg` and `chat_bank_admin_push_signal_trg`, retain queue for audit; redeploy `v21-admin-push` version 3 if needed; revert SW/Push controller/dashboard files + rebuild shell. Do not touch ledger, receipts, or bank notices.

---

## 2026-10-20 — UI-180 LIVE · Mobile/PWA image viewer thumbnail strip

- User screenshots: desktop narrow viewer showed 18 photo thumbnails, but smallest-width/mobile view degraded into tiny dot indicators, without tappable photo previews. Requirement: genuine swipeable thumbnails visible at narrow desktop/mobile web/mobile PWA, active image highlighted, no media/data-model change.
- Scoped repair exclusively to `index.source.html` viewer CSS, `app.js` filmstrip hydration, PWA shell epoch and one regression test. `@media(max-width:700px)` explicitly reserves a protected bottom 3.2rem filmstrip with 3rem photo tiles, horizontal swipe, safe-area bottom, and a short-height branch; the main image reserves room above it, not hidden or overlapped. Single-image viewer still hides the strip; multi-image viewer displays it.
- Resize/visualViewport wake already existed: now queues exactly one animation-frame hydration pass after layout; filmstrip rebuild does the same. `hydrateViewerThumb` marks each tile loading so overlapping resize, scroll and selected-image wake cannot fetch same tile twice. Preserves in-view plus 72px bounded image hydration; no polling or whole-gallery downloads, existing selection/gesture/rotation unchanged.
- F-133–F-137 `aria-current` selected-thumb contract retains `border-color:rgba(255,255,255,.92)` and `transform:none`. PWA cache epoch `viewer-thumbs180` advances only public shell, not private media cache/IndexedDB.
- **Verify V21 run [39334892917](https://github.com/1sl2tp/chat/actions/runs/39334892917) SUCCESS**, including new explicit UI-180 mobile/PWA viewer thumbnail step. **Deploy Chat Pages run [39334893051](https://github.com/1sl2tp/chat/actions/runs/39334893051) SUCCESS**, including the custom-domain HTTPS verify. No Supabase/financial data edits. Actual user's device viewport is still a separate visual acceptance step.
- Rollback: revert commit `d17aae2ede4bf57de93ff21ff39b9d9b621dbc56` (CSS test contract) plus UI-180 source commit `3d1ad3a2fef93327bd88f0003fd81df26561403e` if necessary; rebuild canonical source + new shell epoch.

---

## 2026-10-19 — BANK-177 Pages recovery, release now live

- User reported persistent old report-bubble UI and GitHub Pages stuck in `Waiting`; #208 was not cancellable in GitHub UI. Verified that existing Pages workflow already had `cancel-in-progress:true`, so toggling that same setting was **not** the fix. A stranded `github-pages` deployment #208 and earlier old concurrency group blocked deployment.
- Applied guarded recovery by changing only the workflow concurrency group to `chat-pages-production-recovery-20261019`, **not** the `github-pages` protected environment or permissions, and triggering one up-to-date Pages deploy with revised dashboard heading. #208 subsequently became `cancelled`.
- **Deploy Chat Pages #210 run 39286160982 SUCCESS** at 2026-10-19 16:35–16:39 UTC; production job's own canonical verification passed and `Verify Pages custom domain` checked `https://chat.taphoa.xyz/` DNS/HTTPS HTTP 200. The deployed code contains the BANK-177 inline live dashboard, Admin-only structured RPC and correct PWA shell epoch.
- Separate full Verify CI discovered two more stale static tests tied to `bank-collect164`: `test_v21_ui154_image_four_corners.py` and `test_v21_mobile_ui_polish.py`; both changed to verify the release-independent `SHELL_CACHE_EPOCH` naming contract. The earlier `test_v21_chat_message_day_dividers.py` contract already got the same fix. Last commit `b79927b1...` includes accessible live-update status text and mobile test; latest test/deploy runs queued at last check. Do **not** claim final latest full Verify PASS before those runs complete.
- No bank ledger, receipt matching, Agribank notice, or customer data was changed as part of deployment recovery. Older report messages remain in database as history, but the live report contact view replaces the thread with the reconciliation table for Admin.

---

## 2026-10-19 — BANK-177: live reconciliation smart TABLE replaces repeated Chat reports

- Owner clarified the report contact is **not a stream of report chat bubbles**. Its chat slot becomes an Admin-only live table grouped by customer: today/date selector; customer, matched bill count, pending count, duplicates, wrong-date count, confirmed VND; click customer to inspect bill rows; click row for bank timestamp vs AI bill timestamp, bank notice ID, transfer reference, image view (or go to customer's conversation). Bank-only credits displayed separately, with no guessed customer.
- Backend deployed migration `bank177_live_dashboard_read`: authenticated Admin-only `public.chat_bank_dashboard(p_app_session_id,p_day)` returns canonical structured per-customer/per-bill/bank-only rows, including frozen close-day snapshots. It uses `v21_private.require_active_account` session guard, no ledger writes. Read-only execution using an active Admin session passed; 23 images logged 19/10, 11 matches and 0 currently orphaned external notices.
- Changed event-driven triggers: bank-only and bill-state changes update **one existing canonical report signal message** (version increment), not insert another Chat message. `v21-sync-engine.js` emits `v21-bank-report-dirty` on this canonical update; dedicated `bank-report-dashboard.js/.css` refreshes only while report contact visible, no interval or additional Realtime channel; on foreground recovers once. `chat_bank_report_close()` still snapshots at 00:00 and sends outbound-permitted customer wait notices, but no longer appends Admin report bubble.
- PWA `index.source.html` mounts the dashboard; script + css are inlined through the canonical builder. `sw.js` shell epoch bumped `bank-live177`. No changes to normal chat/Work/ScrollRoot ownership, no manual ledger writes.
- Production smoke: calling report-touch increased existing signal message version to 2 **without adding a fourth report message**; canonical synced event owner is unchanged. Admin-only RPC test as active session returned 11 matched/23 bill images/0 bank-only and did not affect ledger. Browser/PWA code is **on PR #199, not deployed to Pages until VERIFY PASS and main merge**. Keep status transparent. The prior 3 report bubbles remain historic data but are hidden in the new table view; no new duplicates.
- Test/rollout remaining: PR Verify V21 queued at time of update; after PASS merge and verify GitHub Pages as well as actual mobile/desktop report contact. First 00:00 job has not yet been proven by live execution.

---

## 2026-10-19 — BANK-173/176 LIVE: private Chat reports, 00:00 VN close, same-day bank guard

- Owner changed to production-only financial reconciliation from 2026-10-19: classify receipts by the **Chat account that sent the bill**, not the remitter name; match official Agribank Plus credit to `2901181999999` using exact money, bank-vs-bill transaction time and one unique unused event/receipt/ledger. Account's own OTT notices marked `is_own_transfer=true` (content `BUI XUAN TUNG`) are **excluded** from customer totals; historical test ledgers are left intact and labeled as exclusions.
- Production `taphoa_bao_cao` account is a **loginless** `v21_accounts` user (`auth_user_id=NULL`, `contact_group=other`), with direct Chat conversation to the Admin. It sends authoritative, canonical messages via existing message sync/Admin push. Report refreshes occur on new eligible official OTT notices and new collection links, no extra polling. Notifications for external credit without a bill are Admin-only and do NOT guess a customer.
- New private `v21_private.chat_bank_report_snapshot` data groups matched customer bills + amount + per-customer duplicate/sai-ngày, bank-only, pending bill, non-bills, old or unreadable date, own-transfer notifications and historical test amounts. Initial and final verified message 19/10: 11 external bank events, 11 unique bill/bank/ledger matches, **10,153,000 VND**; C Sâm pl 9 / 3,643,000 (0 duplicates, 0 bad dates); C Tiềm Hậu 1 / 6,500,000; E Toàn Thắng 1 / 10,000. Separate: 4 old-date receipts C Hà Trang, 2 duplicated test receipts, 3 non-bills; 21 owner-transfer notices and 3 historical test ledger links totaling 90k excluded.
- `chat-bank-report-0000-vn` pg_cron active `0 17 * * *` UTC (cron.timezone=GMT) = 00:00 VN; stores immutable `chat_bank_daily_reports` snapshot, emits exactly one Admin close report per day and uses existing opt-in-protected `taphoa_chat_notify_customer` to notify each customer with a still-unmatched same-day valid bill once. The first actual cutoff **has not occurred yet**; function and scheduler installation verified but midnight dispatch cannot be claimed complete before the job runs.
- BANK-174 financial writer guard is installed in `public.chat_bank_app_collect`, rejects `bill_outside_current_business_day` when printed bill transaction date differs from bill sent date, today's VN business date or official bank transaction date. Existing 11 external linked payments satisfy all dates, 4 backdated 11/10 bills uploaded on 19/10 would be rejected. Preview Edge may still suggest a candidate but financial writer fail-closes.
- Changes are additive/report-only except minimal hard guard in service-only financial writer; no manual ledger reversals or history edits. Production migrations applied: `bank173_chat_report_account`, `bank174_strict_current_day_only_auto_collection`, `bank175_report_customer_exceptions`, `bank176_pending_customer_close_notice`. Source files on PR #199. Existing Realtime owner, database canonical source, Zalo and AI bill scanning unchanged.
- Verification: Supabase `v21_messages` has Admin conversation messages from `taphoa_bao_cao`, existing Admin push outbox sent; daily snapshot customer per-date counts correct; cron.active=true; `chat_bank_app_collect` date guard present; no financial RPC was invoked in this rollout. Next check: actual 00:00 report delivery and customer-wait notices only if qualifying unmatched bills exist, plus first real new external OTT event.

---

## 2026-10-19 — BANK-172 LIVE: two independent 215k credits, no same-amount false duplicate

- Owner confirmed 215,000 VND credit TWICE from two different people in the same day should remain separate; same amount is NOT duplicate evidence. Account/bill reconciliation remains exact bank amount + bank/bill original transaction timestamp within ±5min, with one unique bill and unique unused bank notice. If multiple bank notices/bills match within ±5min and no distinct reference proves ownership, hold for review instead of assigning randomly.
- Reproduced **2026-10-19 bank notification #18** 17:37 `PHAM HONG SON` credited bill `30371eff-1697-4b19-82f5-873acf3b319a` / ledger **408**; **bank notification #20** 18:54 `NGUYEN HA DOANH` matched bill `f8f21213-a54e-4e00-859c-f038f03d1e87` but was held as `amount_read` despite unique match. BOTH photos were sent by same Chat customer account `70df2da0-f0da-43a4-b0ff-af0b79f1d1f6`. Found financial RPC's `possible_manual_collection` gate erroneously treated earlier **automatic** same-amount credit at 19:00 as manual duplicate of distinct 18:54 transfer.
- [PR #197](https://github.com/1sl2tp/chat/pull/197) merged commit `5bdb49ba409029477b7b81bd2d342fe43349a6e4`; tests [main Verify run 39252965810](https://github.com/1sl2tp/chat/actions/runs/39252965810) SUCCESS. Applied production migration `bank172_distinct_equal_amount_same_customer` sourced from `supabase/migrations/20261019193000_bank172_distinct_equal_amount_collections.sql`. Changed ONLY financial RPC's manual duplicate guard to exclude ledger entries already linked to `chat_bank_app_collection_links`; unchanged other bank notice uniqueness, account validation, self-transfer exclusion, original transaction-time constraints, and manual/unlinked duplicate blocking.
- Preflight of bank #20 at 19:xx: bill and credit both 215k and transaction time **18:54 exactly**, account `2901181999999`, candidate_unique #20, device active, no conflicting bill/event, no unlinked manual collection, no prior bank-event link. Explicitly invoked service-only `chat_bank_app_collect` once on receipt #20; response `ok=true,status=received,ledger_id=412,notification_id=20,notice_sent=true,replayed=false`. Verified original bank #18 links ledger **408** and second bank #20 links ledger **412**; each ledger is -215 thousands VND, for total **430k VND** credited to SAME Chat customer (because both bills came from that account). No reversal/duplicate of #408.
- Final live verification **19:35:07 VN**: `enabled=true,ready=true`; **13** total auto-collection links, 2 distinct links for these 215k events, 2 distinct ledgers, new manual-guard SQL present. Bank screenshot after upload might show old customer feedback for failed original attempt; actual debt Chat confirmation was sent for #20 and ledger is correct.

---

## 2026-10-19 — Android Agribank notifier v1.1.0: optional screen-awake controls

- Owner asked if Android APK can request permission to keep phone screen on for Agribank Plus notification reception. Current notifier v1.0 had only notification access. Implemented opt-in nonfinancial UI in [PR #196](https://github.com/1sl2tp/chat/pull/196), merged **bf4b02bb9a632d582588ad68b22fc48f9ce8ae96**; Android APK v1.1.0. New `ScreenAwakeControls.java`: foreground `FLAG_KEEP_SCREEN_ON` checkbox (only while TAPHOA visible) and Android opt-in special `WRITE_SETTINGS` permission with consent dialogue to adjust global `Settings.System.SCREEN_OFF_TIMEOUT` to 15min,30min,1h,6h,24h (affects Agribank foreground too). Preserve prior setting and restore on explicit tap; do not override external user changes; no auto-unlock, no intervention in bank app, no periodic fake wake-ups. MainActivity scrolls on smaller screens. The Android NotificationListenerService, device pairing, app credit upload and Supabase financial back end are unchanged.
- Main [APK build run 39221289719](https://github.com/1sl2tp/chat/actions/runs/39221289719) SUCCESS, artifact `TAPHOA-Agribank-Notifier-debug-APK` id **12171642689**, available until **2026-11-02**; APK main SHA matches merge, user downloads from workflow run's Artifacts. Main [Verify V21 39221289751](https://github.com/1sl2tp/chat/actions/runs/39221289751) SUCCESS. Debug builds may use ephemeral signing keys, so existing debug install might require uninstall (back up pairing token, regrant notification access).
- Important: system-wide display timeout keeps screen on longer but is not a security unlock, will not defeat PIN/manual locking/device management restrictions, **does not guarantee Agribank Plus push**. Warn about bank security/battery drain if using 24h. Option without granting special access: developer settings `Stay awake` while plugged in on dedicated bank phone. Do not enable any screen options without the user's action.

---

## 2026-10-19 — BANK-170/171 LIVE: multiple Agribank accounts, strict credit account and relaxed bill suffix

- Completed owner's last requirement: Agribank Plus can receive credits for multiple accounts, but TAPHOA **automatically collects only when bank notice full credited account is `2901181999999`**. All other bank account notifications still stored for audit, but do not wake or match a Chat bill. The customer photographed bill **may only reveal final 5 digits `99999`**; missing optional bank info remains eligible under M1 unique amount + bank/bill printed transaction time. Explicitly conflicting last-five digits block. Keep self-transfer description `BUI XUAN TUNG` exclusion, replay safeguards, and manual ledger unaffected.
- GitHub [PR #195](https://github.com/1sl2tp/chat/pull/195) merged as `5ba59b3bd6cc2ad1eded56de52a0d6be5c7a918e`. Main [Verify V21](https://github.com/1sl2tp/chat/actions/runs/39207850367) SUCCESS. Supabase `v21-bank-bill-event` **v21 ACTIVE** deployed from merged main; both lookup queries filter `bank_credit_account`, preview parses exact full account from app body and permits bill account suffix only.
- Migrations applied to production: `bank170_index_agribank_credit_account`, `bank171_accept_cropped_customer_receipt_suffix`, `bank170_restrict_wake_to_target_bank_credit_account`. Generated `bank_credit_account` column provides indexed source-account verification.
- Verified live 2026-10-19 13:05:55 VN: `enabled=true,ready=true`, 12 stored bank notifications / 12 exact allowed-account / 0 unknown, 4 existing auto collection links, no new ledger from deployment. DB writer full bank-account guard and bill last-five guard both present, wake filter enabled, `authenticated` role cannot call financial RPC. No new actual customer transfer yet tested with a second account; Node regressions include multiple-account simulation.
- Separate BANK-168 [draft PR #193](https://github.com/1sl2tp/chat/pull/193) bank-assisted second AI pass is NOT deployed. Auto PNG receipt also still incomplete.
  
---

## 2026-10-19 — BANK-169 LIVE: bank transaction-time/day reconciliation + exclude owner's own transfers

- **Owner's rule:** catalog every customer bill by customer + **transaction time printed on the bill** even if no Agribank OTT exists yet. Store every official Agribank Plus credit and its **bank-printed transaction timestamp/date**, Android `posted_at`, and server `received_at` separately. Match exact amount + bank-vs-bill transaction time within 5min and unique bill/event. Neither OTT push delay (sometimes >15min) nor customer's photo upload time is the pairing clock. Reconcile after both sources arrive in either order, without earlier 15-minute/36-hour delivery cutoffs.
- **Self transfer exclusion:** owner's bank notification **transfer content** containing `BUI XUAN TUNG` is stored as usual but generated `is_own_transfer=true` and rejected from NEW auto collection. It is **not** recipient-name exclusion. Live today 12 notifications, 11 marked own (including previously used ids 6/7/8); one `Galaxy chuyen khoan nhanh qua Zalo` is external. Existing 3 own-labeled historical collections (ledger ids 399/401/402) are deliberately NOT reversed or adjusted; manual operator review if required.
- [PR #194](https://github.com/1sl2tp/chat/pull/194) merged `f1c8239a69c808def14ece9cee53baeaeb00e543`, main [Verify V21 39202395270](https://github.com/1sl2tp/chat/actions/runs/39202395270) PASS. Supabase **v21-bank-bill-event v20 ACTIVE**, using generated `transfer_at` index, `is_own_transfer=false` and strict ±5min original-transfer-time joins; new bill images OCR'd upon upload without waiting for bank push, capped by existing AI/day budget. After delayed bank event is stored, database trigger wakes matching already-read bill (and any queued bill). `public.chat_bank_app_collect` now compares only printed bank/bill transaction time ±5min, not arrival, and checks flag to reject own notices; preserves unique link/idempotency/customer guards. No external banking API involved.
- Supabase migration applied names: `bank169_extract_printed_time`, `bank169_store_tx_date_and_own_flag`, `bank169_writer_transaction_clocks_self_exclusion`, `bank169_wake_on_true_bank_transaction_clock`, `bank169_image_ocr_without_prior_bank_event`. Migrations reproduced in `supabase/migrations/20261019111500...19113500`, obsolete 191120 intermediate deleted.
- During rollout `ready=false` temporarily, then transactionally restored to `ready=true` on **2026-10-19 12:01:47 VN** after DB guard check. Live 12:02:16 `enabled=true,ready=true`, 4 auto collections unchanged, no new debt ledger during migration. Bank notification times verified separately (e.g. bank **10:41**, Android **10:56:29**), which should now reconcile by 10:41 if NOT an own transfer and bill same amount/time. Existing own event id10 is excluded.
- **Note** BANK-168 [PR #193](https://github.com/1sl2tp/chat/pull/193) for AI bank-assisted second pass remains separate, incomplete/unmerged and NOT active. Auto PNG receipt likewise outstanding. Exact-image + transaction duplicate guard remains in place.

---

## 2026-10-19 — BANK-167 Camera-photo OCR priority and duplicate transaction replays (LIVE)

- Owner emphasized difficult photographs (desk/room background, tilted/cropped receipt, darkness, blur, glare). **Priority 1 = clearly legible VND amount, priority 2 = printed transfer datetime (paired with REAL Agribank Plus credit), optional = recipient name, account last five `99999`, receiving bank.** Do not hallucinate unreadable fields. Enforce unique bank credit and unique bill and clear transfer-success evidence. Never post on blurry/unreadable amount or time or ambiguities.
- [PR #192](https://github.com/1sl2tp/chat/pull/192) merged as `b98f4de4926af10e8d261a0af4a203853fce0158`; main Verify [39192708850](https://github.com/1sl2tp/chat/actions/runs/39192708850) SUCCESS. `bill-amount-rules.mjs` OCR prompt now locates the receipt amid environmental image clutter and reads amount first, transfer time second, name / last five / bank optional. `bill-app-preview.mjs` returns no candidate when bank app body lacks actual printed datetime; do not pair on Android notification arrival alone.
- Duplicate protection improved in `v21-bank-bill-event/index.ts`: for image scans with **DIFFERENT SHA-256** but same already-used Agribank notification or verified transfer reference + exact amount + within 5min, classify `status=duplicate`, `reason=duplicate_transfer_already_collected`, link original `duplicate_of`, skip ledger mutation, and in pilot Chat feedback state **already collected**, not incorrect CHƯA GHI THU. If existing bank notification belonged to another customer, hold for review. Exact-byte SHA duplicate still uses no AI. **Edge `v21-bank-bill-event` v19 ACTIVE**, deployed from main. No schema changes or auto-toggle modifications.
- Historical second photo (09:45, 20,000 VND) `2d3b55c9-bdc5-4d4d-bc41-7cb9d851cda4` with different hash but same exact transfer ref `124K26A0VT08EZDY`, same bank notification id8 and same time/amount was corrected once from `amount_read` to `duplicate`, linked `duplicate_of=fe8f6ece-a982-4bb3-b33a-59734716752f` to avoid falsely showing waiting. **No new debt entry or new Chat messages** from this historical correction.
- Last live check 2026-10-19 10:03:32 VN: `chat_auto_collect_settings.enabled=true,ready=true`, **3 auto collections total**, ledgers **399,401,402** untouched, original 20k marked received, rephoto marked duplicate with `ledger_id=null`. PNG auto receipt still pending; standard text Chat “✅ Đã thu” works.
  
---

## 2026-10-19 — BANK-166 LIVE FINANCIAL RELEASE: M1 AMOUNT+TIME AUTO COLLECTION ON

- Owner expressly authorized full live **automatic Thu tiền for all customers** at level 1: unique matched bank credited amount and actual transfer time + customer-posted successful bill, optional level 2 recipient name and level 3 destination account/bank (only conflicts block). Branch PR #191 merged; Edge v18 ACTIVE and migrations deployed.
- Production `public.chat_auto_collect_settings`: `enabled=true, ready=true` as of **2026-10-19 09:42:06 Vietnam** via transactional config update. Latest confirmation at 09:43:09: `execution_active=true`. This is NOW ALWAYS-ON; do NOT call it disabled in future. Owner can switch OFF with existing Chat Admin “Tắt tự động thu” (`enabled=false`). M1 requires both a valid unique bank event and a unique bill; transfer alone without customer bill never auto-collects. All authenticity/uniqueness, read-positive-only, message permission and authorization guards maintained.
- Prior waiting bill **10,000 VND**, Chat receipt `7e19fada-9267-4265-af77-020166512e25`, Agribank notification id 7, was collected ONCE explicitly through same service-only RPC on release: ledger **401**, debit `-10` (thousand VND), balance before -60 after -70, exactly one bank→bill link, one Chat “✅ Đã thu” notice.
- A subsequent **NEW 20,000 VND** bill auto-collected WITHOUT any manual financial intervention: receipt `fe8f6ece-a982-4bb3-b33a-59734716752f`, Agribank notification amount 20,000 posted 09:41:59, ledger **402** at 09:42:48 VN, debit `-20` thousand VND, customer before -70 after -90. Confirmed one message `taphoa:<receipt-id>:collection`, no duplicate. Total production app auto-collection links **3** including earlier 60k ledger 399. Last verified 09:43.
- **LIMITATION:** automatic PNG receipt image still not implemented; only standard text “✅ Đã thu” Chat notification, old/new balance, and ledger link. This MUST be presented transparently. PNG manual UI unchanged. In emergencies, Admin can turn OFF via Chat or set `ready=false` to hard-stop automation.
- Avoid replaying or backfilling previously processed notifications id 6/7/20k new event. Idempotent DB return `replayed=true` for used bank+bill.
  
---

## 2026-10-19 — BANK-166 Owner-approved three-tier bill matching (M1 money+time, M2 name, M3 account+bank)

- Owner clarified business rule: **LEVEL 1 is mandatory bank credit amount plus actual transaction time; LEVEL 2 recipient name if visible; LEVEL 3 bank account and receiving bank if visible**. Optional missing or slightly truncated details should not prevent auto collection. Clearly contradictory optional fields or multiple candidate bills/events still fail closed.
- [PR #191](https://github.com/1sl2tp/chat/pull/191) merged as `2e9c21cedb76ce174916f985dd4a4d151ed54da9`; Verify on PR branch run `39190834112` PASS. Code: `bill-app-preview.mjs` computes `match_level` 1/2/3, checks missing optional fields as permissible, accepts a 11+ digit contiguous prefix/suffix cropped full account (preserving 5 digits when available), rejects clearly conflicting name/bank/account. Event pairing uses **Agribank's printed transaction time** in notification body instead of potentially-delayed Android `posted_at`, allows no more than 15m push delay. Edge index selects app `body` across all paths and +15m bounds; deployed `v21-bank-bill-event` **v18 ACTIVE**.
- Supabase migrations deployed: `bank166_optional_recipient_levels` updated `public.chat_bank_app_collect` financial check to require amount+printed transfer time+unique authentic app event+verified successful bill, with name/bank/account if readable optional and conflict rejected. `bank166_wake_app_credit_15min` aligns wake trigger. DB service-role-only permission, enabled AND ready gate, unique notification/receipt link, duplicate checks, existing TAPHOA Thu tiền ledger and Chat notice unchanged.
- REPLAY LIVE PILOT (NO FINANCIAL WRITE): prior 10,000 VND bill `7e19fada-9267-4265-af77-020166512e25`, asset `21b6faed-17ac-4ef2-be19-1a58259a2a63`, Agribank notification id `7`, was erroneously rejected by old DB strict full-account check because AI captured 12 digits `290118199999` instead of full 13 `2901181999999`, but bank/name/last-five matched. After tier fix, DB RPC dry-run in explicit transaction `BEGIN; UPDATE ready=true; SELECT chat_bank_app_collect(asset,7); ROLLBACK;` returned `status=received,amount_thousands=10,notice_sent=true`. Final readback: **enabled=true, ready=false, notification7 used=0, 10k ledger=0, Chat 10k receipt notice=0**. Do not state that 10,000 has been actually collected.
- BANK-165 actual 60k test remains the only real automated ledger receipt (id399). PNG parity is still pending; continuous writer remains OFF (`ready=false`). Owner's simplified levels are implemented, but toggling Admin enable is not enough to post financially. Never arbitrarily enable `ready=true` for all customers without additional release decision or real end-to-end validation.

---

## 2026-10-19 — BANK-165 First Real Agribank→TAPHOA Collection Pilot: SUCCESS (60.000đ)

- User explicitly authorized a real customer transfer pilot. New V4 Chat bill: receipt `b4c825a9-6f67-4985-8412-dda2cc3948a1`, asset `d42d79e0-ec7c-4f3d-9509-2e309855cd06`, test customer `8c4ac6ec-3178-4661-8696-04e345bf443e`, **60,000 VND**, bank printed time **09:09 VN**, bill submitted **09:09:36 VN**, genuine Agribank Plus notification id **6** (posted **09:12:18 VN**, bank message embedded transaction time **09:09**); exact bank account, amount and Chat recipient matched unique.
- Preflight production RPC in a transaction with `ready=true` **ROLLBACK** returned `time_mismatch`: Android notification posted timestamp arrived 3m18s after actual bank transaction. BANK-165 migration `bank165_allow_delayed_agribank_push` changed two DB guards: posted vs printed bank time from 180s to 900s, and bill timestamp before posted notification from 2m to 15m. Strong amount/account/unique/printed-time vs bill ±5m checks retained. [PR #190](https://github.com/1sl2tp/chat/pull/190) merged as `cfa93801b5d40a6bbd097ee32bea1071de6598aa`. Verify [39189337873](https://github.com/1sl2tp/chat/actions/runs/39189337873) SUCCESS.
- Second **ROLLBACK** dry-run returned `status=received,amount_thousands=60,notice_sent=true`. Verified real ledger/bill link still zero and `ready=false` afterward.
- Completed one **REAL** authorized matched collection, transactionally setting `ready=true` only within same transaction, invoking `public.chat_bank_app_collect(asset,6)`, then restoring `ready=false` before COMMIT. Ledger id **399**, `entry_type=collection`, `amount_vnd=-60` (thousand VND), balance before **0**, after **-60** (customer credit). Receipt `status=received`, bank notification id 6 linked once, `taphoa_command_log` `debt_transaction`, Chat message client_id `taphoa:b4c825a9-6f67-4985-8412-dda2cc3948a1:collection` and body **✅ Đã thu · 60** successfully inserted at **09:16:08 VN**; existing outbound permission allows this user. Replay dry-run returned `replayed=true, ledger_id=399`; verified link/message counts remain 1.
- **Production status after pilot:** Admin `enabled=true`; `ready=false`; no other customers auto-charged. **Standard manual receipt PNG is NOT generated or attached by background bank Edge**; this is still outstanding before always-on financial auto-collection. Avoid claiming full unattended auto thu ready yet. Do not call the real matching RPC again: transfer id 6 is already consumed!
- No Android APK change needed for bank notification lag: existing APK forwarded signed +60k correctly. Current DB function live includes lag correction from migration; repo file reproducible.
  
---

## 2026-10-19 — BANK-164 Agribank Plus toggle + app notification→TAPHOA auto collection (SCHEMA + EDGE DEPLOYED; FINANCIAL RELEASE STILL CLOSED)

- User asked to update **Tự động thu tiền** to the new Agribank Plus app (not SMS) and connect it to existing TAPHOA **Thu tiền**. [PR #189](https://github.com/1sl2tp/chat/pull/189) merged as `62ad8031f0a8cc94dd808b19f4853f9815372059`; verify on branch [39187090906](https://github.com/1sl2tp/chat/actions/runs/39187090906) PASS.
- Chat `zalo-admin-link.js` Admin ON/OFF status and confirmation now say **Agribank Plus** instead of obsolete SMS. PWA shell `bank-collect164` (updates 3 cache tests). Admin ON alone still only arms mode, truthful label notes readiness incomplete.
- DB migrations APPLIED: `bank164_app_collection_atomic_guarded` creates `public.chat_bank_app_collection_links` (receipt 1:1 notification 1:1 ledger unique, RLS). Service-only RPC `public.chat_bank_app_collect(p_asset_id uuid,p_notification_id bigint)` cross-checks official app notification body **signed positive amount**, bank account `2901181999999`, event text time/date vs Android time, amount and recipient/name/bank vs V4 Gemini bill, customer and Chat media, duplicate SMS/bill equivalent for app and likely manual posting. Requires **enabled AND ready** under row lock, transactionally writes TAPHOA `collection` ledger with **VND/1000**, balance before/after, revision, existing `taphoa_chat_notify_customer` format and idempotent command-log entry. RPC EXECUTE service_role only (anon/authenticated denied). `bank164_require_allowed_collection_notice` migration enforces existing v21_private.chat_outbound_allowed BEFORE ledger commit.
- Edge `v21-bank-bill-event` deployed **v17 ACTIVE**, calls the guarded RPC only for app+V4 bill `candidate_unique`; version 15 had only preview; v16 added RPC, v17 adds no-new-AI recheck if app credit arrives AFTER `amount_read`. New DB migration `bank164_wake_stored_bill_on_new_app_event` changes app AFTER INSERT wake to include queued or matching amount_read, cap 6, no cron. App matching `bill-app-preview.mjs` removes a 2-minute state with no automatic retry; transaction always rechecks uniqueness. Existing SMS fallback left intact.
- Proven live app event: first true Agribank Plus notification `+50,000 VND` 2026-10-19 08:26 Vietnam was ingested into Supabase. No matching customer bill yet: 2 earlier queued images were outside match time. E4 for bank event+same customer real bill has NOT happened; must verify actual matched bill AI fields/time and finish end-to-end transaction replay/duplicate and customer "Đã thu" notice before enabling financial writer.
- **Latest live readback after user interaction (2026-10-19 08:40 VN):** Admin has since switched `enabled=true`, but `ready=false`; execution blocked. There are 2 authentic app notifications (+50,000 VND at 08:26, +10,000 VND at 08:33) and 3 newer AI-read bills (2,348,000 VND, 1,100,000 VND, 2,000,000 VND around 08:40), all `match_preview.status=review`. Zero automatic ledger links. Do not claim the switch is OFF anymore; latest toggle is ON waiting for readiness. New user bill / bank event may be required for matched E4.
- **STOP/GO:** Last verified `chat_auto_collect_settings.enabled=false,ready=false` and zero `chat_bank_app_collection_links`; do NOT toggle ready=true without audited true-match test and standard TAPHOA PNG parity. Existing TAPHOA receipt PNG is browser Canvas-generated; RPC generates same text/balance command info but does NOT yet generate/attach PNG. User toggling ON only arms with ready=false and cannot write ledger.
- Rollback: Admin OFF, set ready=false, roll back Edge to v15 and notification wake/collection function if necessary. No production debt or test notifications altered. Standard manual Thu tiền / Ghi nợ remains untouched.

---

## 2026-10-19 — BANK-163 Agribank Admin Pairing Token Fix (LIVE BACKEND)

- Admin reported browser alert `Chưa cấp được mã Agribank. Vui lòng thử lại.` after clicking **Tạo mã Agribank**. Verified real cause: Supabase pgcrypto extension is in schema `extensions` but `public.chat_agribank_issue_device_token(text)` used unqualified `gen_random_bytes(32)` and `digest(secret,'sha256')` while SECURITY DEFINER function search_path omitted extensions.
- Applied migration `fix_agribank_issue_token_pgcrypto_schema` to production using `extensions.gen_random_bytes(32)` and `extensions.digest(secret,'sha256')`. Restricted search path, active Admin validation, authenticated-only execution, anon denial and no plaintext token persistence all unchanged.
- [PR #188](https://github.com/1sl2tp/chat/pull/188) merged at `62fe603f0527bbfbbf0c9e1fd88f6390283b774c`. Branch Verify [39185071415](https://github.com/1sl2tp/chat/actions/runs/39185071415) SUCCESS. Main Verify 39185131233 running when recorded.
- Read-only DB validation of pgcrypto functions, deployed function source and grants succeeded. Did **not** call the pairing function using user's session, so an authenticated end-to-end pairing attempt by Admin is still the last acceptance test. No new actual device token, SMS, Agribank app notification, customer ledger or PNG changed by this fix.
- User can retry Chat Admin → Cài đặt tài khoản → Máy Agribank Plus → **Tạo mã Agribank** without reinstalling the Android APK. If still errors, capture backend RPC error code without leaking the secret token.

---

## 2026-10-19 — BANK-162 Agribank Plus OTT Notifications (CODE / DB / EDGE / CHAT PAGES / APK BUILD PASS; REAL EVENT E4 PENDING)

- **User changed bank source:** SMS Banking unavailable; use Android app **Agribank Plus** notification instead. Official Play package is `com.vnpay.Agribank3g`. APK listener `android/agribank-notifier` is new; existing SMS forwarder not modified or required. Native Android `NotificationListenerService` permission is opt-in in system settings. No SMS permission or bank login/credentials.
- **PR:** [#187](https://github.com/1sl2tp/chat/pull/187) merged as `6b8a0564e27ae18b4c025e3c841230e2958ea925`. Android GitHub Actions `Build TAPHOA Agribank Notifier APK` builds debug APK artifact; branch run `39184229462` SUCCESS (artifact ID `12156474494`, debug APK 13,249 bytes) and user-facing installer saved as `/mnt/data/TAPHOA-Agribank-Notifier-v1-debug.apk` for this session. Debug APK ephemeral signing, test only.
- **Backend applied:** migration `agribank_ott_notification_inbox` creates RLS-protected `taphoa_agribank_notifications`; migration `agribank_notification_device_enrollment` grants Admin RPC `chat_agribank_issue_device_token`, stored SHA256 hash only; migration `agribank_ott_notification_bill_wake` extends image queue to either valid bank SMS or app credit and adds **AFTER INSERT** trigger on newly stored candidate app notifications (max six queued images, no timer/cron).
- **Edge:** new `v21-agribank-notification-ingest` v1 ACTIVE with existing device SHA256 token auth; checks exact package, OTP rejection, signed credit/positive amount and fingerprint dedup; NEVER ledger write. Existing `v21-bank-bill-event` deployed v15 ACTIVE with app-notification preflight and `bill-app-preview.mjs` read-only matching when bill+app credit amount/time aligns, no SMS needed. No modifications to customer debt writer.
- **Chat:** Admin-only one-time token issuance button **Tạo mã Agribank** in account settings, `zalo-admin-link.js`. PWA shell epoch `bank-ott162`. [main Verify V21 39184374196](https://github.com/1sl2tp/chat/actions/runs/39184374196) SUCCESS; [Deploy Chat Pages 39184374045](https://github.com/1sl2tp/chat/actions/runs/39184374045) SUCCESS. Authenticated installed Android/PWA real screenshot E4 pending.
- **Finance release remains closed:** `chat_auto_collect_settings.ready=false` and `enabled=false`, zero real app notifications observed after deployment (as of implementation), no auto ledger writes. Before enabling: install debug APK, generate Admin pairing code, explicitly enable Android notification access, inspect first genuine Agribank Plus credit (text may be masked or formats vary), verify credit amount parser and exact bill match, then separately finish audited atomic collection and standard PNG handling. Do not claim auto "✅ Đã thu" works today.
- **Privacy/security:** only exact official package is handled locally; no credentials hardcoded or stored on GitHub; token hash stored server-side. Android notification access is broad at OS level and user must explicitly grant it; app code filters to Agribank notifications. Parser rejects OTP and unrecognized money; does not infer bank settlement merely from screenshot. RLS for inbox; no anon/authenticated direct data read. Existing SMS remains for backward compatibility but is NOT required.
- **Rollback:** revoke device token by setting `taphoa_sms_ingest_devices.active=false`, and leave Admin auto OFF; revert Edge v15 to v14 / replace queue function and drop new notification wake trigger if needed. Never remove unrelated customer data.

---

## 2026-10-18 — BANK-160 ADMIN AUTO COLLECTION ARMED MODE (PAGES+VERIFY PASS; FINANCIAL WRITER STILL NOT READY)

- **User clarified** that a disabled "Chưa sẵn sàng" button for missing SMS is incorrect: Admin can **BẬT/TẮT** automatic collection at any time; ON without SMS just waits, zero AI/zero collection.
- **Admin toggle:** [PR #185](https://github.com/1sl2tp/chat/pull/185) merged squash `425852507207e3cac073ea00f3e000d90c1968ab`. In `zalo-admin-link.js`, no disabled not-ready branch; Admin sees Bật/Tắt labels. PWA shell bumped to `bank-arm160` for new UI. [Verify 39148162763](https://github.com/1sl2tp/chat/actions/runs/39148162763) SUCCESS; [Deploy Chat Pages 39148162707](https://github.com/1sl2tp/chat/actions/runs/39148162707) SUCCESS. Real authenticated Safari/PWA visual smoke E4 PENDING until device refresh.
- **Backend:** migration `20261018181000_chat_auto_collect_arm_without_sms` applied Supabase prod. `chat_auto_collect_admin_settings(p_enabled)` checks current active Admin role, may set enabled regardless of SMS readiness; `execution_active=enabled AND ready`. It cannot execute a financial ledger collection. Direct table privilege remains denied. Readback after deployment: `enabled=false,ready=false,execution_active=false`, SMS rows=0. No automatic revenue capture; no manual debt mutation.
- **Business rule:** User's SMS+bill requirement is strict AND; bank amounts in VND divide once by 1000 before calling the existing TAPHOA collection accounting pathway; no rounding. This repo release implements toggle arming only; finance auto-writer and exact PNG upload parity are **not yet implemented**. Do not set ready=true before real SMS and one-to-one bill match + idempotent debt/notification pipeline tests.
- **Rollback:** Admin sets enabled=false; revert PR #185 UI and RPC migration only if regression. Never delete SMS, bills, customer debt or messages.

---

## 2026-10-18 — BANK-159 SMS-GATED AI RECEIPT SCAN (EDGE+DB LIVE; PR/BRANCH VERIFY PASS; REAL SMS E4 PENDING)

- **User request:** Gemini must not scan every customer Chat image. Scan candidate bill images *only* when a recent incoming Agribank SMS exists; SMS first or image first must both work. Required TWO-source matched SMS+bill rule for auto-collection remains unchanged.
- **E0 SPEC:** `docs/specs/SPEC-CHAT-BANK-AUTOCOLLECT-157.md §BANK-159` locks 24h candidate window (+10-minute arrival tolerance), at most 6 pre-existing queued images woken by each new unique SMS, no cron/poll, no collection writes.
- **E1 source:** [PR #184](https://github.com/1sl2tp/chat/pull/184) merged as `b552a2ff3bb75e215f6bcc2eb4d484d64222e3c7`; new canonical versioned Edge code `supabase/functions/v21-bank-bill-event/index.ts`, `bill-sms-preview.mjs` and unchanged source snapshot of `bill-amount-rules.mjs`, plus `supabase/migrations/20261018172000_chat_bank_bill_sms_gated_ai.sql`.
- **E2 implementation:** `v21-bank-bill-event` Edge V14 deploy applied FIRST, guarded preflight queries received Agribank SMS and parses incoming transfer text (handles HH:mm DD/MM with trusted APK timestamp and year rollover), reject no valid SMS **before** any Storage bytes/hash/Gemini. If missing, return `waiting_sms`, keep receipt queued for later; no ledger updates. SQL migration `chat_bank_bill_sms_gated_ai` applied AFTER Edge: existing customer image trigger queues metadata and dispatches only when plausible recent SMS exists; new unique SMS insert wakes at most six recent queued image assets. No new periodic scanning or full chat-history reads. Existing hashed/scanned images not re-read. The SMS ingest API is unchanged.
- **E2 tests:** [branch Verify 39145870496](https://github.com/1sl2tp/chat/actions/runs/39145870496) SUCCESS, bank date/amount unit tests PASS and SQL/Edge no-AI/no-ledger guard contract PASS. Production DB after deploy: 1 SMS wake trigger; new image queue owner contains `waiting_for_banking_sms`; Edge active V14 has mandatory SMS preflight.
- **Production read-back:** `taphoa_sms_inbox` 0 rows, `chat_bank_bill_receipts` 16 rows, 0 receipts linked ledger, `chat_auto_collect_settings.enabled=false,ready=false`. SMS real delivery/AI-call savings E4/E5 NOT YET measured or confirmed, as no live SMS was present. Old 16 receipt results are preserved and are not retroactively cleared. Do not claim future matches/automatic ledger work before real pilot.
- **MUST-STAY:** manual Thu tiền/Ghi nợ completely independent; automatic collection requires **BOTH** uniquely matched real bank SMS and customer Chat bill and Admin toggle ON. This patch **does not implement nor enable ledger auto-collection**. No Chat message/sync/push/Zalo/Storage cleanup changes.
- **Rollback:** restore original image queue dispatch function and drop only `chat_bank_bill_wake_on_sms_insert_trg` if needed, revert Edge to V13 previous source. Avoid any data cleanup; auto-collection remains OFF.
- **NEXT E4:** inject nothing synthetic into production. Observe first real incoming bank SMS from approved Android APK and customer bill both directions; compare Gemini requests, time parsing, duplicate handling and output statuses; only then plan separate atomic ledger/ready gate. 
- **Release verification:** [main Verify 39145952490](https://github.com/1sl2tp/chat/actions/runs/39145952490) SUCCESS for merge commit; no Chat Pages deployment required (no changed Chat frontend source). Device/real-SMS proof E4 remains PENDING.

---

## 2026-10-18 — BANK-157 Auto-collection ADMIN switch foundation (DEFAULT OFF / CI+PAGES PASS; SMS PILOT & E4 PENDING)

- **User intent:** prepare SMS Banking + bill automatic collection, but keep it OFF until the Admin explicitly controls it in Chat. Only Admin can control the system-wide flag.
- **2026-10-18 user-confirmed business invariant:** Admin's **Thu tiền / Ghi nợ thủ công** is completely independent of automated collection. **TỰ ĐỘNG THU TIỀN** must require **BOTH** a customer-uploaded bank bill in Chat **AND** an independently ingested, valid incoming banking SMS to be a unique, verified 1:1 match. Bill-only or SMS-only NEVER posts a collection; duplicated/ambiguous/mismatched evidence NEVER posts either. One SMS/bill may be consumed at most once. Correct UI name is `Tự động thu tiền`. Spec amended first in `34448abe`; UI copy/test updated in [PR #183](https://github.com/1sl2tp/chat/pull/183), commit `329c56db3a3637e5298d42acd68d806ac1d99701`. **NO automatic collection writer enabled; ready=false, enabled=false verified after merge.**
- **E0 spec:** `docs/specs/SPEC-CHAT-BANK-AUTOCOLLECT-157.md`. SMS inbox and bill OCR already exist, but on this date SMS rows=0 (one active ingest device); bill reader had 16 rows, 9 amount_read in 24h, and zero linked ledgers. Readiness MUST NOT be inferred from mocked SMS or bill text.
- **E1 UI:** Chat > Cài đặt tài khoản (existing Admin-only Zalo-account settings) now shows `Tự động thu tiền` with server-derived OFF / ON / not-ready. `zalo-admin-link.js` queries the secure RPC on explicit Settings open and writes only on explicit click; no browser-only toggle, interval, new message transport, or chat read-state changes. `sw.js` epoch `bank-admin157` plus regression tests updated.
- **E2 DB:** Applied migration `20261018160348_chat_auto_collect_admin_settings_disabled_foundation` to Supabase project `vtqhbhrkdxirqeqkgylo`; DB setting verified `enabled=false,ready=false`. Anon cannot call/read/write; authenticated cannot write table; server checks active Admin role via `v21_private.current_active_account_id()`. Enabling while `ready=false` is rejected at database level. No ledger writer/cron added by BANK-157.
- **E3:** [PR #182](https://github.com/1sl2tp/chat/pull/182) merged squash `137c6a89e4cc8dade49d828bc3d0671c3733764d`; [Verify V21 39143839890](https://github.com/1sl2tp/chat/actions/runs/39143839890) SUCCESS and [Deploy Chat Pages 39143839900](https://github.com/1sl2tp/chat/actions/runs/39143839900) SUCCESS. Canonical build sync commit `2eec35188c3b0fbe148e14757c828c34e6793e90`.
- **E4/E5 PENDING:** No authenticated Admin browser/PWA screenshot yet; cannot state physical Safari/iPhone sees the new setting. No real bank SMS or end-to-end bank-confirmed pilot tested; AUTO COLLECTION IS NOT ACTIVE. Do not set `ready=true` or offer ON until text parser for `HH:MM DD/MM` Agribank format, client timestamps, duplicate cases, unique SMS↔bill mapping, role/account controls and idempotent ledger writer pass integration/pilot and user approves activation.
- **Resources/data:** one admin RPC GET per explicit Settings open, one RPC mutation per explicit Admin click; zero steady-state polls/cron, no changes to existing Chat Realtime/push/media/Zalo, no new ledger writes.
- **Rollback:** Set `enabled=false` in secure config first if ever activated, then revert UI change or prior commit and rebuild canonical files; do not delete SMS, images, messages or debt history.
- **NEXT ACTION:** verify one real AGRIBANK SMS arrives from approved APK; read-only parse and match against a unique test bill, then implement a separately gated atomic ledger writer with failure/duplicate tests. Keep `ready=false` until the entire path is proven.

---

## 2026-10-18 — UI-156 Chat date dividers + floating date while scrolling (SOURCE / VERIFY / PAGES PASS; E4/E5 PENDING)

- **User request:** distinguish today/yesterday/weekday + date in conversation history; show the latest message time in the conversation list; when scrolling, keep a temporary date marker visible without moving the message list.
- **Root cause:** `shell.js::formatContactTime` showed yesterday as a weekday, while `app.js` had no per-day separators or scroll-date marker.
- **Patch:** list time is now `HH:mm` today, `Hôm qua` yesterday, weekday for 2–6 days, and compact date for older messages. In the thread, one date divider is inserted inside the corresponding virtualized message row only at date boundaries. A zero-height sticky chip displays the first visible message's date while scrolling and fades after 900ms idle.
- **Scroll safety:** marker only reads geometry and timestamps; it never writes `scrollTop`. Existing `appendScrollPolicy`, ScrollController, anchor restoration, virtualization, and remote follow-tail rules remain owners. No DB/Supabase/Realtime/polling/RPC/cache changes.
- **Tests:** UI-156 date-label runtime and UI contract PASS. The first run caught an old UI-72.50 test asserting the exact old scroll listener; updated that assertion in follow-up test commit `3b5ce1121b25e96f200cfe98e89bddc84a5ea681`, then reran successfully.
- **E1 source:** `8444a5549922df7d0185da59aa1d810a1232ac1d`; follow-up test contract `3b5ce1121b25e96f200cfe98e89bddc84a5ea681`. Verify V21 also synced canonical generated artifacts in `ddd70a3d8dcc78f6d12e9901d53c11bd03f03920`.
- **E2 Verify V21:** PASS — [run 39086614098](https://github.com/1sl2tp/chat/actions/runs/39086614098), including canonical source verification and both UI-156 tests.
- **E3 Pages:** PASS — [run 39086614085](https://github.com/1sl2tp/chat/actions/runs/39086614085), deployment and custom-domain verification succeeded. Canonical build ID `db28addacf056743dcdfde51b2ab485e19681b2b5c9da30a563cc999f96f2014`; `index.html` SHA-256 `3d016ae3da1b28d27dcf0422d185619e3ffe2807f7f96558e4579253814dd8ae`.
- **E4/E5 pending:** still requires checking a logged-in Safari/iPhone PWA after the service worker activates, including reading older messages and receiving a new message while away from the tail. CI/deploy does not prove the user's installed PWA has switched shell.
- **Rollback:** revert UI-156 source/test/workflow changes and shell epoch, regenerate canonical `index.html/version.json`, rerun Verify/Pages. No data rollback.
---

## 2026-10-13 — UI-154 Four precise photo corners (VERIFY/PAGES PASS; REAL SAFARI E4 PENDING)

- User screenshot on desktop shows radius14 looking fuzzy at four corners, particularly light-background scanned receipt. Screenshot address included an old _build=e71f9bd... value; actual running cached shell cannot be confirmed from image alone.
- Canonical Google Sheet F-133/134 Rev4 + SDD row126: keep a single R14 clip on outer media; remove geometry-changing 1px border and instead paint subtle 1px absolute, pointer-events:none ::after overlay with border-radius inherit. Single and album both have padding0; album tile gap4px; no per-tile round corners, no frame/ratio changes, no transform hacks.
- Scope: index.source.html image/gallery root CSS, sw.js shell epoch img154; same generated index.html/version.json; new UI-154 static regression + updated UI-153/V21.72.43/75 tests. No changes to app.js, rotation, viewer, data, messages, Supabase, RPC or lazy media.
- E1/E3 PASS: UI-154 four-corner test PASS and Verify V21 `38438243951` SUCCESS, Pages `38438011675` SUCCESS including HTTPS domain. Runtime CSS/PWA/build commit `d933abcebf60ca7c7200dc6f46eec7363df77a0b`, follow-up test-only commit `0603d7c8c50ba3ae9b63274959e1efd1c07d49b5`, build `4a13b1baf3ef3383320c76993772c98d08260ac17e0c86b6f37461718a32266d`. Independent Chromium DPR2 corner smoke shows R14/border0/inset pseudo and 4 gallery children unchanged. E4 logged-in physical Safari/iPhone PWA old-vs-new screenshot PENDING; E5 real network/write measurement pending. No DB/backend changes.

---

## 2026-10-13 — UI-153 IMAGE MEDIA EDGE + VIEWER WHEEL + EXIF (VERIFY/PAGES PASS; DEVICE E4/E5 PENDING)

- Screenshot comparison: root media portrait/landscape edges visually differ ~4px. Canonical Google Sheets F-133/134/135/137 + SDD 125 updated BEFORE code. Remove outer 4px inset for both single and gallery, keep ONE shared rounded 14px border 1px subtle and 4px INTERNAL album tile gap; no sender lane/size or orientation classification changes.
- Viewer wheel meaning: at normal 100% when more than one image, wheel navigates one previous/next with throttle; at zoom >100% and Ctrl/Cmd+wheel, wheel zooms. Filmstrip wheel moves thumbnails horizontally, click selects; message list scrolling remains normal. Preserve touch swipe, image pinch, keyboard arrows and viewer album/current-filter.
- Browser EXIF auto orientation via image-orientation:from-image for single/gallery/viewer only, manual per-asset rotate still available when EXIF is absent or inaccurate; never infer content angle from ratio alone or mutate media bytes/DB. No extra image prefetch/network/cron/log.
- Source: app.js viewer wheel, index.source.html media edges and EXIF, sw.js PWA epoch img153; updated existing tests plus new wheel/EXIF test, canonical index.html/version.json.
- E1/E3 PASS: runtime release commit `680ac90ae6673f65e487a47ff30989ec8fa1dda0` (initial `76071987a4da25b6edb1fb7db8bd568f5e4b4a52`), build `f03a62b4b85a70ddabbb75d34877088373e7c8285f7a10ae4f22921e0e79f4e1`, Verify V21 `38435857344` SUCCESS (UI-153 new test + canonical source), Pages `38435856962` SUCCESS (canonical build/deploy/custom domain). Preserved original sender rail after fixing one legacy test assertion conflict. E4 logged-in Safari/PWA screenshot and E5 network/resource/user acceptance PENDING. Rollback only UI sources/build; no data cleanup.

---

## 2026-10-13 — F-133 REV2: PORTRAIT / SQUARE / LANDSCAPE CLASSIFICATION FIRST (SOURCE + VERIFY + PAGES PASS, E4/E5 PENDING)

- User supplied iPhone screenshots: Techcombank vertical receipt rendered too narrow; prior repair used 48dvh to derive portrait width. Clarified requirement: classify source image by intrinsic W/H before choosing both preview dimensions; no arbitrary viewport-height increase.
- Canonical Sheet 04 F-133 rev2 and F-137: portrait H>W width=min(260,560*W/H), square=320, landscape=360; all scale to available sender lane and preserve native ratio. Gallery 2+ retains 2/3/4+ fixed preview grid; viewer always contain and only selected filmstrip thumb has neutral border.
- Changed app.js imageAspectRatio/singleImagePresentation (no 48dvh width calculation), index.source.html portrait cap560, SW shell epoch img152; shell/tile same --message-media-width; no new image fetch/realtime, read-state, RPC/Edge, Zalo or Storage write. Historical owner assertions migrated; new F133 ratio regression includes device height invariance.
- E1/E3 verified: commit `5d3685888f02571cd2ed89852c552063370660f7`, build `99e77f0f2945ec5b8e08e87d341a8c1566a1eea609ee0102ddf5422f665d9b76`; Verify V21 run `38432942253` SUCCESS (geometry F133 test + canonical build PASS), Pages `38432942423` SUCCESS (canonical build, deploy, HTTPS/custom domain). **E4 logged-in Safari/PWA screenshot after build activation and E5 real network/user acceptance PENDING**. Rollback only these source/test/build files and PWA epoch, never delete user data.

---

## 2026-10-13 — F-133..F-137 Chat image geometry / album / viewer (SOURCE / VERIFY / PAGES PASS; iPhone E4 & resource E5 PENDING)

- User approved code fix based on canonical Google Sheet F-133…F-137. The actual issue was portrait preview width computed from constant 460px although CSS clipped portrait at min(48dvh,460px), making excess background on short iPhone viewports; thumbnail selection previously blue with -2px transform.
- Owner: `app.js` singleImagePresentation/messageInlineImageHeightLimit, local portrait geometry on window resize/orientation; `index.source.html` viewer CSS; `sw.js` epoch img151 for PWA shell rotation. Keep image intrinsic ratio without square/landscape clamping; gallery previews only use cover, full viewer contain.
- **Release and evidence:** corrective legacy test assertion updated without bypassing it; final commit `ebaa00347394f6e7d073aa6db802003a8bb38078`, build `e71f9bd26a6d08cbeb02a6e80f43c40d56f0606e5cda7a55bae7510768cde444`; Verify V21 `38429885277` SUCCESS (new F-133..137 runtime step & canonical check both PASS); Chat Pages `38429885358` SUCCESS (canonical build, deploy, custom-domain HTTP200 check). No screenshot or logged-in Safari/PWA verification was performed. Avoid claiming E4/E5 PASS.
- New/update tests: `tests/test_v21_image_geometry_f133_f137.js`, V21.72.28, V21.72.75, UI library composer media and Verify V21 workflow. Same one build `index.html` + `version.json`. The entire package must be verified before marking E3; Safari/PWA E4 and resource E5 still PENDING.
- No Supabase/Realtime/Zalo backend, no media-fetch change, no `v21_mark_read` on image open, no cron/RPC/log writes. Preserve account cache and scroll, left-right sender 6px. Rollback this atomic source/build change if browser regression; do not delete data.

---

## 2026-10-13 — UI-150 Copy / Download / Share after message rail & gap changes (RULE FIRST; CI/PAGES PASS, iPhone E4 pending)

- **User request:** recheck Copy, Share and especially Download across text + media after prior left/right/gap alignments in Chat Web/PWA. The former side action rail had 32px-height hitboxes (40×32 coarse) and stayed at `left/right:100%` even on narrow screens, risking off-screen tap areas for multiple buttons.
- **Rule first:** `README_MAINTENANCE.md §3i UI-150` + canonical Google Sheet **08 - SDD SPEC TEST ACCEPTANCE row122** and **04 - UI FOUNDATION TOKENS F-132 row192** recorded before code. Matrix: raw text Copy even with media caption; original media Download; in-Chat Forward; OS-native Share only on supported browser/gesture. Image viewer always operates on selected current asset.
- **Source owner:** `app.js` keeps one `createActionGroup`. It now adds Copy on any nonempty `message.text`, including mixed text+media; Download for image/gallery/file/audio; internal forward labeled **Chuyển tiếp**, native OS labeled **Chia sẻ**; low-to-high priority ordering keeps Copy/Download nearest message. Native text Share runs immediately inside click. Clipboard fallback `execCommand` success is checked; copied/failed status never claimed before result. Audio format extensions MP3/M4A/OGG/WEBM/WAV and Blob/File MIME correct; native file Share includes optional mixed-text caption and preserves user activation. Missing native Blob: prime lazily, show `Chạm lại để chia sẻ` instead of fake success, no duplicate preload; account-scoped media guard untouched. Viewer menu `Tải ảnh` with 44px touch targets.
- **CSS owner:** `index.source.html` keeps existing mirrored outside rail on desktop fine pointer; on touch/(max-width:700px) toolbar is positioned absolutely above/below message using open-time available space, clamped to safe-area viewport sides, with **44×44px buttons, gap4px**, no message reflow or scroll owner change. `ui-foundation.css` existing 44px touch token reused; no new layout tokens or backend calls.
- **Tests:** existing `tests/test_v21_mobile_share_group_roles.py`, `tests/test_v21_native_image_share_user_activation.py`, `tests/test_v21_image_viewer_shell_controls.py` updated for new labels/signature; new `tests/test_v21_ui150_copy_download_share_contract.py` added and wired into `.github/workflows/verify-v21.yml`. Independent Verify V21 **38424299926 SUCCESS** (including new test); previous Verify **38424174976 SUCCESS** before wiring new test. Deploy Chat Pages **38424039654 SUCCESS** for release head `8031e386077c0eec98714cff2834d115f64e3d7f`. Build `a0ab1c153365050b16465e845002391cb114b085f62fd12f5b68bba88c9679f1`, index commit `4e5d2f6b37455c9197bcc81ea6db362f67b514ae`; PWA shell epoch `ui150`.
- **E4/E5 pending:** physical iPhone PWA/Safari send and received single/mixed text, photo/gallery, audio/file, OS share sheet, clipboard and download; verify toolbar never spills/composer overlaps in real viewport. GitHub CI does not establish that user's active PWA received new build. No change in Supabase, Storage, RPC/Realtime, chat or media cache; no extra polling, eager hydration, or logs.
- **Rollback:** revert `app.js`, `index.source.html`, SW shell epoch, related tests/workflow and rebuild canonical `index.html/version.json`, re-Verify/Deploy; do not alter DB.

---

## 2026-10-13 — WORK-149 Clear stale Work AI summaries, leave Chat + Taphoa untouched (DATA & PAGES PASS; Verify/E4 pending)

- **User screenshot + request:** Work / Công việc showed completed product rows for "Cô Huyền pl" and old customers; user asked to delete all old Work *content*, not the Work tab or customer/business records.
- **Rule first:** `README_MAINTENANCE.md §3h WORK-149` committed before SQL/code; Google Sheet canonical RULE CHUNG tab `08 - SDD SPEC TEST ACCEPTANCE` row121 and `04 - UI FOUNDATION TOKENS` F-131 row191 recorded. Scope owner: `chat_customer_summary_work_feed()` reads only `chat_customer_summary_state.last_result` and `chat_customer_summary_completion`.
- **Actual AI status:** `chat_customer_summary_runtime_config()` reports scan key present, Gemini key absent; HTTP dispatch guard already prevents AI request without Gemini. Latest 713 archived `chat_customer_summary_runs` began 2026-10-04; 32 work-state records existed (25 scanned, 17 contained items), 215 completed keys in 13 customers; stale dirty queue count 25 before cleanup. Do NOT call AI active or restart scans.
- **ONE scoped transactional DB write** on **Supabase chat-bh-get vtqhbhrkdxirqeqkgylo**: lock dispatch advisory; abort if any active claims or configured Gemini key; clear last_result to empty items/notes, last_scanned_at=NULL, last_run_id/error/claim=NULL, processed_version=dirty_version for all 32 Work state rows; delete 215 Work completion rows. Keep 713 run audit logs. No mutation of `v21_messages`, `v21_media_assets`, `taphoa_orders`, `taphoa_debt_ledger`, `chat_order_drafts`, `chat_customer_care_daily` or AI inbox/scan tables.
- **DB post-verify:** visible state 0, state with items 0, stale queued state 0, completion 0, audit runs 713; v21_messages 5631, taphoa_orders 127, taphoa_debt_ledger 233.
- **Small UI fix:** `work-customer-summary.js::renderCurrent()` detects no `rowsCache`, clears ONLY Work selectedWorkCustomerId, renders `renderOverview([])`, empty text `Chưa có công việc nào.`; keeps active Chat contact, directory scroll and Work tab. Test `tests/test_v21_work_customer_summary_ui.py` updated and `sw.js` shell epoch moved ui148→work149 (matching mobile UI polish test), no IndexedDB delete or added polling.
- **Release:** version/build `51acb2635a32060c2f8b849dabdd5718f63f92c87f0276e31c9955660654f8a1`, index commit `3afff2cb9ed9874aec93eaf02cb21da00a8b42b1`, version commit `4c92327278ea8c681da1f6d7cebec0eada7135cd`; GitHub Pages Deploy **38421046984 SUCCESS**. Independent Verify V21 run **38421046977 PENDING** when last checked; E4 actual PWA visual and E5 acceptance also pending. Do not misreport these as PASS.
- **Potential next action:** If Work AI is explicitly re-enabled in future, supply valid Gemini key through existing secure config only after user request; do not reprocess old chat history without new spec. Work content remains blank until new successful scan.
- **Rollback:** Can reconstruct summaries from preserved 713 runs if explicitly requested, but deliberately erased 215 completion checks are not guaranteed recoverable. Roll back UI source/epoch/canonical build separately; no silent DB repopulation.

---

## 2026-10-13 — UI-148 Image Viewer defaults to nearby photos in active conversation (RULE FIRST; Verify/Pages PASS, E4 pending)

- **Screenshot/root cause:** opening a single image from `gd me yeu` showed "Ảnh 1 / 1" despite nearby image messages because `app.js::openImageViewer()` initialized `imageViewerFilter=imageViewerAlbumId?'album':'all'`. Existing collectConversationImageAssets/Prev/Next/ArrowLeft/ArrowRight/swipe/filmstrip already support chronological multi-message navigation, but the automatic album restriction hid it.
- **Rule-first:** `README_MAINTENANCE.md §3g UI-148` committed **before source**, Google Sheet `08 - SDD SPEC TEST ACCEPTANCE` row120 and `04 - UI FOUNDATION TOKENS` F-130 row190 also recorded before source modification. Scope: within active conversation store only, keep A/B and Album hiện tại manual filters, no full-history RPC.
- **Minimal source:** `app.js` now defaults `imageViewerFilter='all'` every time an image is opened; `imageViewerAlbumId` retained for explicit Album selection and updated to the currently displayed image's `messageId` upon manual Album filtering. Keeps selected `assetId`, chronological store order, image 1/N counter, nav keyboard/swipe, zoom/reset, viewer close, current-only save/share, and lazy hydration. If only one image truly loaded, still 1/1. No cross-contact or whole-history fetch.
- **PWA:** Existing `sw.js` HTML shell epoch moved from ui147 to **ui148**; does not erase IndexedDB/media history or add requests. `tests/test_v21_ui_library_composer_media_menu.py` locks default/all and album/current plus existing nav controls, and `tests/test_v21_mobile_ui_polish.py` matches epoch.
- **Release:** build `4458e008e63d2f3506482008d713fd5aa1583824f79b0c5953333c8972621dad`, canonical `index.html` commit `246636fefbcb5e34a3f04fc09aa1bc4f830caab5`, version commit `7c7c7a292d0aeb9366b1a10d0e6662276bbb0597`. Verify V21 **38418655386 SUCCESS**, Deploy Chat Pages **38418654934 SUCCESS**.
- **E4/E5 pending:** real iPhone Web/PWA open any photo in a thread with >=2 already-loaded photos, verify previous/next / swipes / thumbnail and counter. Installed PWA may show cached shell until close/relaunch after SW activation. No E4 device verification yet.
- **Rollback:** restore album default and manual filter source, test, SW epoch, rebuild canonical HTML/version and rerun Verify/Pages. No DB/Realtime rollback.

---

## 2026-10-13 — UI-147 Danh bạ vertical rhythm (RULE FIRST; Verify / Pages PASS, E4 pending)

- **User ask 21:35:** top tabs → "Danh bạ" and title → search too spacious. Approved targets: approximate visual 20–24px and 12–16px rather than screenshot's prior 36–40px and 24–28px. Mobile iPhone screenshot pixel scale is illustrative, not literal CSS measurement.
- **Rule before code:** `README_MAINTENANCE.md §3f UI-147`, spreadsheet Rule chung `08 - SDD SPEC TEST ACCEPTANCE` row119, `04 - UI FOUNDATION TOKENS` F-129 row189 were committed **first**, before CSS edits; UI-146 shell-only epoch requirement then added to rule before `sw.js` edit.
- **CSS owner:** `ui-foundation.css` adds `--ui-directory-root-top-min:12px` and `--ui-directory-top-trim:16px`. `mobile-ui-polish.css` scopes to authenticated `data-mobile-directory=true`, root top padding `max(12px, safe-area-top - 16px)`, heading bottom padding 0, body top padding 0. No transforms, negative margins or changed overlay top; horizontal rails UI-145, 44px search/input, chip spacing, 60px rows, 40px avatars, directory scroll and keyboard untouched.
- **PWA shell:** ServiceWorker `SHELL_CACHE_EPOCH='ui147'` causes old HTML shell cache to be replaced upon activation with existing offline-first behavior. IndexedDB/chat history and push unchanged. `tests/test_v21_mobile_ui_polish.py` expanded for scoped vertical geometry and SW epoch.
- **Release:** build `e189f08cc4dc44b082dc683ffe4f92173c3928989e1ca5f79f2ac8919440bdc6`; `index.html` commit `fba401f0b8be75e529891a312aa1fdfb745fe42b`; `version.json` commit `4692ae2d499772b16817bf791fa78d3938b9b781`. E1/E2 Verify V21 **38416477490 SUCCESS**; E3 Deploy Chat Pages **38416477571 SUCCESS** (canonical verify and Pages custom domain).
- **E4/E5 pending:** screenshots and measured spacing from actual Safari/PWA after closing/reopening and SW activation; no device screenshot instrumentation available. E4/E5 cannot be inferred from server deploy. No extra RPC/DB/Edge/Realtime/polling/log calls; no media/cache reset.
- **Rollback:** revert UI-147 CSS tokens/mobile directory rules, `sw.js` epoch, tests; rebuild canonical HTML/version, rerun CI/Pages.

---

## 2026-10-13 — UI-146 PWA screenshot status / mobile directory root gutter / shell epoch

- **User screenshot 21:07**: Directory rows, heading, search and first filter share an x-axis but have ~36px outer space, rather than the UI-145 12px control rail; conversation uses different deliberate rail6 for received/sent messages. Screenshot cannot reveal exact installed PWA build ID, so do not assert app was stale solely on appearance.
- **Proven CSS cause**: `reference/chatgpt/full-source/raw-css/app-CIyuNPp8.css` imposes `.wm-sidebar-sidebar` horizontal `var(--size-24,1.5rem)` padding (24px). UI-145 nested components correctly add 12px but ancestral 24px remains. `mobile-ui-polish.css` now resets ancestor's `padding-inline:0!important` only for authenticated active mobile directory; leaves vertical padding, scroll, desktop and all actions untouched.
- **PWA cache**: `sw.js` previously used `CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION`; `RELEASE_VERSION` held at V21.72.39 across UI-only releases, and cached navigation HTML can be displayed before existing background network revalidation. New `SHELL_CACHE_EPOCH='ui146'` forces replacement of prior shell namespace when worker activates; no deletion of IndexedDB/messages/avatars, no added network polling, no change to offline-first or authenticated safe reload.
- **Canonical build:** UI-146 `271ffd11a918b8c4b209150247706318728929ae2d6d7ff19b3c3bc9f512d365`, index commit `cd1377d08302bd8c8608eba0ae61389c02e0cb54`, matching version commit `3acfa0726ad55ef84177f1cc2a7e06ad9a084669`. Test `tests/test_v21_mobile_ui_polish.py` extended to lock root reset/SW epoch. **Verify run 38411637081 SUCCESS; Deploy Chat Pages run 38411637777 pending as of last check (prior deployment 38411629178 in progress).** Do not mark Pages or actual iPhone PASS before confirmed.
- **Rule/Sheet:** `README_MAINTENANCE.md §3e UI-146`; Spreadsheet `04 - UI FOUNDATION TOKENS` F-128 row188, `08 - SDD SPEC TEST ACCEPTANCE` UI-146 row118. E4 verify actual `window.V21AppUpdateController.snapshot().currentBuild` vs server `version.json.build_id` and 12px DOM edges on iPhone PWA after relaunch; E5 user acceptance.
- **Rollback:** revert mobile-ui-polish.css and sw.js, rebuild canonical index/version, run Verify and deploy. No backend change.

---

## 2026-10-13 — UI-145 2 semantic horizontal rails: Top/Directory/Thread/Composer (CI + Pages PASS, iPhone E4 pending)

- **Screenshot scope:** C Thúy đông conversation and directory in iPhone standalone PWA. Prior UI-144 made Composer outer rail12 but header had inherited desktop `.chat-content-axis` 16px `!important`, Directory nested tools/list/row added separate margins. Distinguish visual bounding boxes from glyph/text internal padding.
- **Rule:** `README_MAINTENANCE.md §3d UI-145`; canonical Sheet **04 UI FOUNDATION TOKENS F-127 row187** and **08 SDD SPEC-CHAT-LAYOUT-RAILS-TOP-DIRECTORY-THREAD-COMPOSER-20261013 row117**. 12px action/form outer rail for Top, directory title/search/filter/avatar/time, Composer; **6px message edge rail** for remote-left/self-right text and media. Use safe-area at physical edges. Desktop 2/3-column unaffected.
- **Source fix:** `ui-foundation.css` adds `--ui-chat-layout-rail:12px`, `--ui-chat-message-rail:6px`; `mobile-ui-polish.css` explicitly overrides inherited header padding important, directory body6 + tools6 / list2 + row4, mobile directory scrollbar-gutter:auto; `mobile-chat-refresh.css` threads both new tokens into Composer and messageWindow without new scroll owner; `ui-library/index.html` Composer demo uses 12px preview rail. Only presentation CSS and test literals changed.
- **Tests:** `tests/test_v21_mobile_ui_polish.py::test_ui_145_one_layout_rail_for_header_directory_and_composer`, `tests/test_v21_140_zalo_card_narrow_axis.py`, `tests/test_v21_incoming_left_edge_contract.py` changed old hard-coded 6px string assertions to assert value + usage. E1/E2 **Verify V21 run 38407051093 SUCCESS**, E3 **Deploy Chat Pages run 38407051005 SUCCESS** at commit `a5e00042285396cc7ecad8581a60f6c9dd88d80c`. Release build `9327d82e7b4b157304f4d8ec06bf3996ee8c2ac9ce41e994f53667c1d2f054e0`; index/version commits `8da8a8a437d9deaa03033edacb9250606f861d5e`, `25105cfc08c070e0b25d0c8a5c7013fce28be02a`.
- **Acceptance pending:** E4 real iPhone Safari/PWA after fully closing/reopening app, screenshots of directory and conversation with Top/Directory/Composer at action rail12 and messages at edge6, keyboard and landscape; E5 user's visual acceptance. No network, API, Realtime, IndexedDB, Zalo or scroll position changes. If top avatar clipped vertically due restored list scroll, treat as a separate scroll-position ownership issue, not as a left/right CSS change.
- **Rollback:** revert UI-145 CSS, UI demo/test additions then rebuild index/version and Verify; do not edit DB.

---

## 2026-10-13 — UI-144 Chat Composer gutter/icons/state parity (Verify + Pages PASS; real iPhone E4 pending)

- **User screenshots:** danh bạ và thread trên iPhone PWA có Composer quá cách hai mép hoặc Send xát cạnh; Mic nhỏ so với nút mũi tên, trạng thái nút màu xám và xanh không cân đối.
- **Root cause:** `composer-source-frame.chat-content-axis` đã có padding ngang `!important` (16px ở `zalo-admin-link.css`), trong khi Composer mobile còn trừ tiếp hai gutter trong `width`; legacy `#composer-plus-btn{width:36px!important}` lấn chuẩn hit44. Grid gap 2px, đĩa Send khá lớn và mic18px kém nổi bật.
- **Fixed owner P3/P4 only:** `ui-foundation.css` adds UI-144 local tokens (outer gutter12, inner inset4, column gap4, hit target44, Send disc36 + ring4, plus18/mic20/arrow18, SVG stroke1.6). `mobile-chat-refresh.css` removes duplicate inherited horizontal padding from Composer frame, safe-area-aware single outer gutter, three real 44px hit targets override legacy Plus36, stable 44px grid/Send ring across disabled/enabled/focus; recording, keyboard, scroll, send and media owner untouched. `ui-library/index.html` demo mirrors same geometry and data-icon labels.
- **Rule + test:** `README_MAINTENANCE.md §3c UI-144` plus canonical spreadsheet **08 row116 SPEC-CHAT-COMPOSER-ONE-OWNER-20261013** and **04 row186 F-126**. `tests/test_v21_ui_library_composer_media_menu.py` guards tokens, source, no double gutter, inactive/active geometry and demo preview.
- **E1/E2/E3 PASS:** release `84a4995447235ed3105e269d0ba0d3bdc944095cf6a7e8ae9fed4fe20d2503f2`; matching `index.html` commit `12058fc7a3e593b6f093347bc9dfdc08d026011d` and `version.json` commit `3d5ed3af1e76de27f3c987212f16da3a38b93f87`; Verify V21 run **38404927525 SUCCESS**; Deploy Chat Pages **38404927643 SUCCESS** (includes custom-domain check).
- **E4/E5 PENDING:** compare physically measured iPhone Safari Web/PWA closed/open keyboard, mic recording and gray/blue Send; active PWA may defer reload, so close/reopen app before checking. Pages success ≠ real device screenshot proof. 0 new API/RPC/Edge/DB/Storage/polling/log calls.
- **Rollback:** only UI-144 source tokens/composer/demo/tests and regenerate `index.html/version.json`; no backend rollback.

---

## 2026-10-13 — Unified incoming/outgoing image alignment on first-render + history (CI/PAGES PASS; iPhone E4 pending)

- **User screenshots:** E Linh bada / gd me yeu mobile/PWA show some portrait transfers and photos inset/centered, inconsistently across old/new messages. The sender-specific edge rule already exists; the defect was **media shell width not initialized on first render**.
- **Root cause:** `renderMessageNode()` built a `createMessageMediaShell()` with default 360px width while `applySingleImagePresentation()` computed a narrower portrait tile; only `patchMessageNode()` later called `patchMessageMediaShell()` to match the shell. Legacy direct-media CSS also forced all photos to 360px. Some old Zalo assets have missing/inaccurate `width_px/height_px`, making centered `object-fit:contain` inside a wider fallback box.
- **Fix:** `app.js` makes `createMessageMediaShell()` call `patchMessageMediaShell()` on the first render; any late `img.naturalWidth/naturalHeight` mismatch updates tile + shell without new network reads and survives message patch. `index.source.html` legacy direct photos use ratio-derived `--message-media-width`; galleries retain their separate 360px `cover` presentation. The existing mobile left/right edge alignment and image Viewer are unchanged.
- **Locked invariant:** Rule `README_MAINTENANCE.md §3b UI-143` — all image/single, cached/restored/new, Admin/User, Web/PWA share sender-side gutter and first-render/reconcile intrinsic-ratio width; do not special-case age/Zalo source.
- **Test:** `tests/test_v21_ui_library_composer_media_menu.py` and updated `tests/test_v21_chatgpt_visual_alignment.py` guard width parity, legacy media, gallery and natural-dimension fallback. CI Verify V21 **38400683185 SUCCESS**; Deploy Chat Pages **38400682986 SUCCESS**. Release `22da9d50df1d8cd711ae0f6c4eb0c12af984fab180eb60a6158fdae1c428fa20`; version commit `0a5cbf7ff1df8077b7bdfd66e6850f9dfb9b0ab2`.
- **E4/E5 pending:** Real iPhone Safari/installed PWA screenshot side-by-side (old/new, received/sent, portrait/landscape/gallery), and user acceptance. Because active authenticated PWA defers reload, fully close and relaunch to receive the new build. No extra RPC/Storage/Edge/Realtime jobs, polling or logs; any natural-ratio calculation is local image decode.
- **Rollback:** Revert `app.js` shell init and intrinsic ratio, `index.source.html` legacy CSS and relevant tests, regenerate `index.html/version.json` and reverify; do not change backend.

---

## 2026-10-13 — Mobile composer optical balance against ChatGPT screenshot (CI + Pages PASS; device E4 PENDING)

- **Observation:** In side-by-side input bars, Chat mobile/PWA plus, microphone and idle Send appear visually heavier; Send's gray circle is too prominent compared with ChatGPT reference. The right circular arrow is Send, not Search.
- **Owner / fix:** `mobile-chat-refresh.css` only: mobile glyphs 20→18px, inline SVG strokes optically normalized to 1.5px, idle Send background softened with 2px surface border (40px painted disk inside unchanged 44px hit target), composer idle border softened. Desktop, call, audio state, focus, keyboard viewport, tap target, actual Send/Mic/Plus handlers untouched.
- **Related CI repair:** Move previous inbound UI-142 CSS block before the UI-139/141 contract section so left-edge regression assertions remain scoped without changing message gutter behavior. This release also synchronizes previously committed inbox-margin and in-memory cache edits.
- **Release:** CSS `5f477a848cf7dbdb86e6b440c719e96b3ea5cdd3`; CSS test scope `7f57895d74cd91a45614deacf7bc03c6c98b9aca`; canonical index `d1c56b2cb2ab01d91145a3a0ab51fce84a3ec750`, version `ac81597c7606d87ea59867c8589e0308992bef3a`; build `f38082b3d1ab4dad51fae7d1e5549b01d499fffc1ff7d79ac155dad803616405`. Verify V21 run **38397767445 SUCCESS**; Deploy Chat Pages run **38397767312 SUCCESS**.
- **Validation/limits:** CI + deploy passed. User-visible iOS Safari/PWA optical comparison E4/E5 remains pending; standalone PWA may need full close/reopen to pick up updated build because active authenticated sessions defer reload. No new HTTP/RPC/Edge/Realtime/Storage/log or background work. **Rollback:** revert mobile CSS change and regenerate canonical index/version for the reverted source.

---

## 2026-10-13 — PWA/mobile double inset of inbound + Admin chat bubbles (CI + PAGES PASS; E4/E5 PENDING)

- **User issue after PR #179:** In installed mobile/PWA Chat, both sides of messages still look inset compared with screen edges, despite previous fix for centered desktop conversation axis.
- **Root owner:** Three horizontal padding CSS declarations competed: `mobile-chat-refresh.css` older `#messageWindow` shorthand (12px), `mobile-ui-polish.css` later 14px, and UI-139/141's `!important` axis rule (12px), while `#scrollRoot` retained `scrollbar-gutter:stable` on narrow screens. No sender/Realtime defect.
- **Fix:** Restrict P2 message lane to one safe-area-aware horizontal gutter of max(6px, CSS safe-area inset) in `mobile-chat-refresh.css`, remove older shorthand horizontal padding and 14px polish duplicate, prevent invisible reserved scrollbar space only under single-pane authenticated Chat. Explicitly align remote/assistant unit to left boundary and self/Admin unit to right; desktop >=1024px and all bubble internal text padding, media/Viewer/scroll owner stay unchanged.
- **E0/E1/E2/E3 PASS:** Rule sheet tab08 row115 amended; both CSS-focused tests PASS, standalone Chromium fixture 320/375/500/768/1023px measured remote-left/self-right 6px with no horizontal overflow (synthetic, **not real device**); PR #180 Verify V21 run 38375855960 SUCCESS after tightening assertion to distinguish padding reset from nonzero owner; PR #180 squash merged main `d2efaf0f7f127dc10ab7fd55d6d958b703399a3e`; main Verify V21 run 38375982808 SUCCESS; Deploy Chat Pages run 38375982769 SUCCESS; main build `5874a60dfd819d5ebf1d29988628ad4235e5bdf2b0bb774dc0824b80db260cd6`. **E4 actual Safari/iPhone standalone PWA screenshot & loaded build identity, E5 user acceptance/resource measurement PENDING.**
- **PWA update caveat:** `sw.js` currently uses cached-then-network navigation and `app-update-controller.js` deliberately defers reload during authenticated sessions; user may need to fully close and reopen standalone PWA after a deployment. Do not change these cache/reload owners for an edge-layout-only repair; verify displayed build before claiming E4.
- **Rule:** Google Sheet tab 08 row115 `SPEC-CHAT-MOBILE-PWA-SINGLE-GUTTER-20261013`. No new API/Edge/DB/Realtime request, media retrieval or jobs. Rollback: revert CSS+canonical index/version PR together. **E4 real Safari/PWA screenshot and E5 acceptance PENDING.**

---

## 2026-10-13 — Non-Admin incoming Chat content left margin on narrow one-pane UI (CI + PAGES PASS; E4/E5 PENDING)

- **User observation:** Messages from someone other than Admin (including Zalo image/text/file) are positioned too far away from the left border in a narrow browser/mobile screenshot; Admin self messages should stay right.
- **Owner:** `mobile-chat-refresh.css` existing UI-139 single-pane CSS. Root cause: the previous left-edge layout correction only applied through `639px`, while mobile/single-pane geometry lasts until `1023px` and keeps a centered max-width `48rem` conversation axis.
- **Fix:** Scope to `@media (max-width:63.999rem)`: stretch `#conversationContentAxis` full width, remove centered margin/extra axis padding and apply one 12px message reading gutter. Add remote `#messageWindow>.message-row[data-turn="assistant"]` left-edge alignment for text/media/audio/file; leave Admin `data-turn="user"` right-aligned and desktop >=1024px center width unchanged. CSS only; no hacks/transforms, no message renderer, ScrollRoot, media decoding or data changes.
- **Rule:** Shared Google Sheet tab 08 row114 `SPEC-CHAT-INBOUND-LEFT-EDGE-20261013`. `tests/test_v21_incoming_left_edge_contract.py` and updated `test_v21_140_zalo_card_narrow_axis.py` registered in canonical Verify and CI.
- **E0/E1/E2/E3 PASS:** focused left-edge and legacy UI-140 tests registered; PR #179 Verify V21 run 38372345917 SUCCESS, squash merged main `2f286df54f25e327933896f0265fd58dfe3a4024`; main Verify 38372465813 SUCCESS; Deploy Chat Pages 38372465818 SUCCESS; read-back main build ID `1577353a72cb2fddbce4e86bd9d9ae4c588bc7f6b32038e6dc231e4e02e35b3a`. **E4 actual authenticated narrow Web/iPhone Safari/PWA visual measurement, E5 resource delta/user acceptance pending.** No new API/RPC/Edge/Realtime polling/log/egress.
- **Rollback:** revert CSS + generated index/version together; no schema or Zalo bridge redeploy.

---

## 2026-10-13 — UI Library parity: Composer icons, portrait photo, mobile account menu (CI + PAGES PASS; E4/E5 PENDING)

- **User screenshots:** (1) Plus/Mic/Send trong khung Chat lệch hit-area và cỡ icon; (2) ảnh dọc sao kê chiếm gần hết viewport trên màn hẹp; (3) menu Danh bạ/Tài khoản/Cài đặt/Thoát chỉ có chữ, thiếu icon và khoảng cách chuẩn.
- **Spec:** Google Rule chung tab 08 row112 `SPEC-CHAT-UI-PRIMITIVE-COMPOSER-PORTRAIT-MENU-20261013`. Baseline `ui-library/README.md`, `ui-library/index.html`, UI-10/33/35/37/40/43.
- **P3/P4 owners only:** `ui-foundation.css` ComposerBar three tap targets 44px + glyph 20px (no behavior change); `app.js` single portrait image computed proportional width for max inline 460px and `index.source.html` width var CSS + 48dvh mobile max-height; gallery remains 360px, image `contain`, album tiles `cover`, Viewer full. `work-customer-summary.js` reuses `ui-icons.js` registry for four distinct menu 20px icons; `mobile-ui-polish.css` unifies menu 44px rows, 218px panel. UI library demo previews revised.
- **MUST-STAY:** all four menu actions/permissions/focus, + mic/send actions, disabled send, media cache/loading, Gallery/Viewer, image click, scroll/anchor, keyboard/push/Realtime untouched. No API/RPC/Edge/DB/Storage read/write change; no new user traffic except standard static release.
- **Tests:** updated locked image-width and mobile-polish legacy assertions, added `test_v21_ui_library_composer_media_menu.py` in Verify V21 and canonical verify. SHA-aligned index/version regenerated. CI pending.
- **E0/E1/E2/E3 PASS:** Spec Sheet 08 row112, focused tests and full PR Verify V21 run 38363377808 SUCCESS; PR #177 squash-merged main `ef21ed373f89153b20279d5bc2ecdb3be1a16aab`; main Verify V21 run 38363474508 SUCCESS; Deploy Chat Pages run 38363474436 SUCCESS. Prior failed PR runs 38363025335/38363188521 were old fixed-360 assertions; updated tests now align with proportional portrait contract. **E4/E5 PENDING:** real Safari/PWA authenticated visual comparison of 3 screenshots and resource/acceptance proof. UI-only; no new request/RPC/writer.

---

## 2026-10-13 — TAPHOA image share → Chat KH prefilled attachment (MERGED + PAGES PASS; E4/E5 PENDING)

- User symptom: app.taphoa.xyz order/cart Share first click only says "Ảnh đã sẵn sàng. Bấm Chia sẻ lại", forcing Save/Copy/Paste. User wants tapping once to open the linked customer's Chat with the actual PNG already attached (or auto-send).
- **Decision:** prefills a draft; never auto-sends without explicit tap Send. TAPHOA customer id is already V21 account UUID (see existing taphoa_chat_notify_customer/taphoa_save_order). Saved order detail uses its own real row customer id, NOT an unrelated active cart selectedCustomer.
- **Owner:** TAPHOA source capture and opener; Chat app.js ingress. Chat tab accepts only opener at `https://app.taphoa.xyz`, query-bound strong nonce and exact customer ID, authenticated Admin with valid ContactStore member and ready conversation. PostMessage File must be PNG <=15 MiB. Existing Chat `ingestImageFiles` attaches into the correct scoped draft/IDB; no new media writer or auto-send. ACK once; clear share params on success. No RPC/Edge/Storage relay, cron/polling/log.
- **Browser contract:** target window must preserve opener; installed iOS PWA may isolate windows, so E4 iPhone/iOS installed-mode test is mandatory. If popup fails, app's native fallback remains. No claim cross-PWA direct receive until observed.
- **Spec:** Rule chung tab 08 row111 SPEC-TAPHOA-CHAT-ORDER-IMAGE-PREFILL-20261013.
- **E0/E1/E2/E3 PASS:** Chat PR #176 Verify V21 run 38350636840 SUCCESS, squash merged `d32951dd050dce9b0a80c922855659a75afc371f`, Pages run 38350710488 SUCCESS. TAPHOA main code commit `220b0d3978fbf4743893765e3e4dbc7bc4bd2536`, test commit `f356f2146ad96be8dbc8c594724341d77f59f9e5`, cache-bust commit `005ac0e4d56eeddc81fcc864b79401bb2df683d8`; Verify TAPHOA 38350822745 SUCCESS and TAPHOA Pages 38350822779 SUCCESS. **E4/E5 PENDING** direct mobile/iPhone PWA opener handoff confirmation and request/egress/user acceptance. Pages success is NOT actual device QA.
- **Rollback:** revert receiver before sender only after sender stopped; original sharing remains for unbound customers. No DB changes.

---

## 2026-10-13 — User revision: vuốt cả trái và phải đều đổi Danh bạ ↔ hội thoại (MERGED; E4/E5 PENDING)

- **User correction to PR #174:** Both horizontal directions should toggle the two Chat surfaces. Previously directions were asymmetric (directory-right, conversation-left) and felt less convenient.
- **Corrected spec:** From Danh bạ, either horizontal swipe reopens last valid selected conversation; when none/invalid, no-op. From an open thread, either swipe returns to Danh bạ. Work tab cannot be opened by swipe; touch/mouse at screen edges, media/gallery, composer/input, controls, dialogs and vertical scroll must not be stolen.
- **Owner:** only `work-customer-summary.js` `bindMobileHierarchySwipe`. Remove old per-direction gating, preserve 48px distance, 1.2 dominance and 28px system edge exclusion. Keep `shell.js` and other data owners unchanged. No new RPC/Edge/cron/polling/logs.
- **Tests:** revised `tests/test_v21_mobile_directory_swipe_runtime.js` now asserts all four transitions (directory-left/right and conversation-left/right), plus no-prior/no-work/vertical/edge/control negatives. Revised static `tests/test_v21_mobile_chat_navigation.py` guards both-direction logic. Existing Verify/Pages pipeline validates canonical `index.html`/`version.json`.
- **Rule:** in-place amendment of Google Rule chung sheet tab 08 row110 `SPEC-CHAT-MOBILE-SWIPE-DIRECTORY-20261013`.
- **E0/E1/E2 PASS:** updated Rule chung row110; focused runtime/static tests and full Verify V21 run 38349288291 SUCCESS; PR #175 merged main as `2cefd2f88f8fdb4fc1218c11ea0a5d882b3debb3`. Main `version.json` readback build ID `0f27f983753cd81d59e1cba4b6687f28c387b023c4ea2c1c2f81aedb596d877d`. **E3 Pages production release not independently verified** (public URL unavailable), E4 iPhone/Android actual interaction and E5 resource trace PENDING. Rollback PR #175 only if regression.

---

## 2026-10-13 — Mobile Chat first screen Danh bạ + chat-only horizontal swipe (MERGED, E4/E5 PENDING)

- **User request:** opening Chat on mobile/PWA must show Danh bạ. Horizontal swipe is only between selected chat conversation (swipe left → Danh bạ) and Danh bạ (swipe right → previously selected valid conversation). Without a prior contact, directory swipe is a no-op. Swipe must not enter/exit Work; Work remains a deliberate top-tab/button action.
- **Root cause:** two gesture owners: `shell.js` pointer swipe switched Chat ↔ Work; `work-customer-summary.js` touch swipe switched directory/chat ↔ Work. Auth restore could show a saved conversation or single-contact auto-select rather than directory.
- **Patch:** remove legacy shell pointer swipe owner and single-contact mobile auto-selection; move touch owner to explicit Chat directory↔thread only, scoped to scrollable content, no overlay/input/media/horizontal gallery/touch-edge stealing. Remember last selected contact only as local UI state; Shell `openContact` validates membership before returning. Authenticated mobile boot always shows directory, with saved selected contact remembered for optional right-swipe. Avoid a second directory contacts refresh when already open. No DB/Edge/Realtime/Push changes.
- **Safety:** normal contact taps, notification deep-link, mobile Work top-tab/double-tap, desktop directory, USER_AWAY/FOLLOW_TAIL, media, send, pending drafts, realtime and cache unchanged. No new network owner/timer/API. Works for desktop-narrow UI through same source; real gesture requires touch.
- **E0:** canonical Rule chung sheet tab 08 row110 `SPEC-CHAT-MOBILE-SWIPE-DIRECTORY-20261013`.
- **E1/E2 PASS:** `tests/test_v21_mobile_chat_navigation.py` and `tests/test_v21_mobile_directory_swipe_runtime.js` registered with canonical Verify + GitHub Verify V21. PR Verify V21 run 38348854237 SUCCESS. PR #174 merged as `f52d429b9dc6bd3a9b9ddd4ecb1b57943e058bf9`, current main version build ID `b981aab17a33ee54187ff0c4c8db6d09bdd1567b8baf4ed4db58043d28457635` read back.
- **E3/E4/E5 PENDING:** PR Verify SUCCESS and merged main; production Pages deployment/job result and public `/version.json` not independently accessible from this runtime (DNS lookup unavailable), so E3 website cannot yet be marked verified. Real Safari/iPhone/Android PWA gestures and post-notification open remain device acceptance; no measured resource delta. Do not claim PROD VERIFIED without browser proof.
- **Rollback:** revert this navigation-only PR. No data migration.

---

## 2026-10-13 — Mobile share one-tap + customer-only business menu (MERGED, PROD E4/E5 PENDING)

- **Request:** mobile share a Chat photo/file by showing recipient immediately; do not require Save/Copy/Paste. Only KH group exposes business actions like Công nợ/Báo giá; CM/Bạn bè/Khác use simple image/file composer actions.
- **Owner/baseline:** `app.js` source media actions + single-image viewer; `message-forward.js` existing recipient picker and canonical `v21-sync-engine.js.forwardMessage`; `contact-directory-admin.js` is already group-map owner through one `directory_groups` request; `admin-composer-actions.js` currently shows all Admin business actions for all recipients.
- **Patch scope:** primary Chat media `Chia sẻ` opens existing one-tap in-app recipient picker; native OS share becomes explicit `Ứng dụng khác`; `Lưu` stays a separate optional action. Viewer uses in-app forwarding only when its current source message has exactly one media asset, so selecting one photo does not silently send a full gallery. Group editor publishes existing group load/change to customer-menu visibility; UNKNOWN or noncustomer hides all business-specific sends. `runAction` also checks group. No new RPC, media writer, job, polling, Zalo bridge or background sync.
- **E0/E1 PASS:** Sheet Rule chung SPEC row109 recorded; `tests/test_v21_mobile_share_group_roles.py` registered with Verify V21 + canonical verifier. PR Verify V21 run 38347451366 SUCCESS. PR #173 squash merged as `f80622b21e7d8072a37f306c8e31bd10838905ff`; main `version.json` build ID `cfde8a260fb7e0930be4436137fe3dec0ca1e82a2c2d1d4736b1d6f6b85ed096` read back.
- **E2 scoped source PASS, E3/E4/E5 PENDING:** PR tests succeeded and code merged; main GitHub Pages run and real domain release not independently confirmed through available connector. Safari/iPhone/Android one-tap, contact group matrix and canceled/cold-media/gallery cases need real device checks. Do not claim production success solely from source tests. No intentional outbound customer message test.
- **MUST-STAY:** Chat auth/group account isolation, single canonical forward, Zalo-linked media source/destination ownership, no accidental whole-album forwarding, immediate Realtime, draft/scroll, quote/debt backend unchanged.
- **Rollback:** revert this PR as one UI-only change set. No DB rollback needed. Group data is read-only reused from the directory owner; unknown group fails closed for business sends.

---

## 2026-10-12 — Chat warm boot + mobile PWA foreground push (MERGED; E3 PASS, E4/E5 PENDING)

- **User intent:** lần đầu/mở lại Chat mobile/PWA phải hiện khung và dữ liệu đang xem nhanh; khi Chat mobile hiện trước màn hình, tin mới vào Chat nhưng không tạo thêm thông báo PWA/OS. Khi ẩn/đóng Chat, thông báo nền Admin phải hoạt động; call invite luôn hiển thị cảnh báo.
- **Root cause (source):** `v21-cache-store.js` used IndexedDB `getAll` for whole conversation then sliced latest 100; `v21-sync-engine.js` called `prewarmCachedContacts` for inactive contacts on each auth; `sw.js` network-first navigation awaited network before serving existing static shell; SW notification suppressor checked only focused *same conversation*, not visible mobile Chat in another conversation.
- **Patch:** `listMessages()` now uses backward indexed cursor, skips tombstones, stops after requested live rows and reverses to chronological order. Boot hydrates contacts and active conversation only, without background prewarm. Warm SW navigation uses last-good cached shell immediately then one existing network revalidation via waitUntil; cold cache miss retains network-first. `admin-push-controller.js` sends mobile platform/route/visible state, re-advertises on SW controllerchange. SW sends ADMIN_PUSH_MESSAGE_DIRTY to page before suppressing *system* notice for visible iOS/Android Chat Web/PWA, regardless of selected contact; WindowClient visibility wins when available. Hidden/background/closed/Work keeps notice; call_invite is never suppressed.
- **PASS/LOCK:** PR https://github.com/1sl2tp/chat/pull/172 squash merged `d68d3f829e792a66abd608d80d6b4ae52f849acf`. Verify V21 https://github.com/1sl2tp/chat/actions/runs/38266770515 SUCCESS (incl. indexed cursor + mobile push SW tests). Pages https://github.com/1sl2tp/chat/actions/runs/38266770459 SUCCESS, including Pages custom-domain HTTP contract; generated index/version canonical build `269f6431fccaa82d705c9aa3f549fe575272278fb4803f29e257bb5750b5795c`.
- **MUST-STAY:** same Supabase Realtime message owner, user foreground/Admin push semantics, draft/outbox/media/reply, USER_AWAY/FOLLOW_TAIL, contact order, account cache isolation, push subscriptions. No new backend API, SQL migration, cron, polling or job.
- **E4/E5 PENDING:** CI and Pages success do not prove actual first-paint time, offscreen avatar behavior, notifications on real Safari/iPhone PWA, or request/bytes savings. Test warm/cold/slow/offline, mobile foreground different contact, mobile hidden, incoming calls and multi-device role. Capture browser TTFB→first useful thread and number of IDB records read/network bytes. Avoid artificial message sends in real customer account.
- **Rollback:** revert PR #172 source/cache/push/SW/index/version as a unit if cold start/Push regression; no DB rollback. Canonical Sheet tab 08 row15 boot and row108 foreground push.

---

## 2026-10-11 — Tin mới hiện ngay, danh bạ không nhìn thấy tự cuộn (MERGED; DEVICE E4 PENDING)

- User screenshot Chrome desktop: contact preview 21:53/newest at top, active thread latest near composer; user reports new message still appears by visibly scrolling, especially contact directory. Screenshot is a static state only; cannot independently prove timing/motion.
- Code evidence and scoped owners:
  1. ContactStore `auth-session-store.js` already sorts by `latest_at` and `shell.js` restores existing `.wm-sidebar-navigation.scrollTop` across row reorder, but scrolling ancestor lacked `overflow-anchor:none`; browser scroll anchoring can fight explicit restore during DOM `insertBefore`.
  2. `app.js` `scrollToTail` only committed `scrollTop` inside next requestAnimationFrame for new messages; latest on open already positioned synchronously.
- Changes: `index.source.html` scroll host now has `overflow-anchor:none;scroll-behavior:auto`; `app.js` incoming remote/new/reconcile new-message tail transaction commits scroll position immediately after render in same task, then retains existing bounded frame-based geometry settling. USER_AWAY, history, selected contact, scroll owner, search/filter, notifications unchanged.
- Test `tests/test_v21_139_immediate_message_directory.js` added to Verify V21 and canonical verifier. PR https://github.com/1sl2tp/chat/pull/171, Verify V21 `38153320773` SUCCESS, merge main `4344dbb09d9b0d599fda5e162e78dda01f419b58`; readback source/index/version PASS (build `a06e1bf7e52968a770f8c4e9a72e46129deed59f0b7cc996b56cfc9225c3b1af`).
- MUST-STAY: Realtime/Admin/User, UI-138 USER_AWAY holds anchor, notification intent latest, message media and virtual window, read state, no new RPC/DB/Edge/log/polling. Avoid changing ContactStore order or adding additional scroll writers.
- E3 actual Pages deploy not independently proven by connector/tool (public URL inaccessible). E4 Chrome/Safari/PWA visual motion after incoming while list at top vs middle, active thread following tail vs history USER_AWAY PENDING. E5 actual bytes/timing unmeasured. CI cannot verify actual perceived animation.
- Rollback only scoped main commit above if new positioning causes regressions. Canonical Rule chung SDD rows 105–106.

---

## 2026-10-11 — Composer intermittently ignores click after incoming chat (MERGED; E4 PENDING)

- Screenshot: Chrome desktop three-column active chat; composer text area visible yet intermittently cannot be focused when chatting. The existing 2026-10-10 hit-test CSS/padding-focus source is still present. Actual intercepting element was NOT observed in browser devtools, so overlay is a scoped hypothesis, not proven root cause.
- Owner: `app.js` composer pointer hit-test; preserve original `focusEditorFromComposerPadding` exactly to keep native caret/IME, button semantics and existing regression. Add a capture-phase pointerdown recovery ONLY for a user press inside editorWrap rect when a nonactionable ScrollRoot/scroll-control target was hit; skip button/link/action, Work, inert modal, image viewer, recording and disabled editor. No focus on incoming messages, no fake input.
- PR https://github.com/1sl2tp/chat/pull/170 ; main `6182407f02c84211b6f9f5f45c13296064b1ecac`. Final Verify V21 run `38152641373` SUCCESS (81 steps), after initial failing legacy padding-focus contract was preserved, and new test's count assertion corrected. `index.html`/`version.json` regenerated to canonical build ID `8ecf2bfb0fe34d589a0405086f210ed4e617ab4ddc48f368794c8d657f33a76b`; main readback PASS.
- E3 Pages release run E4 actual Chrome desktop + Safari/PWA and E5 resource delta PENDING. GitHub CI PASS does not prove user's intermittent symptom is resolved; ask for recurrence and inspect exact elementFromPoint only if it persists. No API/DB/Edge/cron/network changes.
- MUST-STAY: realtime Admin/User, contact/message scrollers, notif deep-link, Vietnamese IME/selection, media, audio, send, keyboard, modal. Rollback only PR #170 if side effect appears. Canonical Sheet SDD `SPEC-CHAT-COMPOSER-HIT-REGRESSION-20261011` row104.

---

## 2026-10-11 — Chat first-open: lazy-load avatars outside viewport (MERGED; E4/E5 PENDING)

- User request: improve Chat startup/mobile alongside YouTube without changing message delivery, read-state, scroll, media upload or call.
- Owner: `shell.js` `renderAvatarImage`; adds native `img.loading='lazy'` to contact avatar image nodes, retains initials until image's actual `load` and existing error fallback, preserves async decode. Offscreen avatar fetches can be deferred by browser; visible avatars still load as normal.
- Canonical build: regenerated `index.html` + `version.json` using exact build hashing; original source's SHA-256 and release ID were reconstructed and verified before mutation. New build ID `38632c0a40292eeed346fb35972d2b657dc1b90411bb6017fae54fb1461bd96d`.
- Source PR https://github.com/1sl2tp/chat/pull/169 ; Verify V21 run `38148330196` SUCCESS (80 steps passed, canonical build included); merged main commit `e0f3054494fe2e846de223ee53d8daa53353585d`. Main source and generated artifacts readback PASS.
- E3 deploy Pages run could not be independently fetched. E4 Safari/Chrome/iOS PWA screenshots and first open visible/offscreen avatar behavior PENDING; E5 request and byte count before/after PENDING. Do not claim a measured launch improvement.
- MUST-STAY: Admin/User Realtime, background Push, Zalo bridge, contact sort/selection, ScrollController, photo upload/forward, calls, cross-device sync; 0 new RPCs, DB writes, timers or schedulers.
- Rollback: revert shell.js + index.html + version.json together from the PR; no database rollback. Rule chung `SPEC-CHAT-LAZY-AVATARS-20261011` row103. Next: scoped Safari/PWA test, verify avatars show when scrolling into view; measure only initial image requests/bytes and first useful contact render.

---

## 2026-10-10 — Chat starts in Trò chuyện, not Công việc (MERGED; E4 PROD PENDING)

- User symptom: first open / login and cold notification sometimes showed Công việc first, then returned to Chat.
- Root cause: `index.source.html` first-paint defaults, `shell.js` initial and restored routes, and `auth-session-store.js` guest entry all used `work`. A saved Work route could replay before pending notification selected its contact.
- Contract: startup/guest/auth restore **always starts in `chat`**; restore the selected contact, not the previous Work route. The existing Công việc tab still navigates to Work explicitly. The existing Admin Push handler still opens its target contact and forces latest-message positioning via the current owner.
- Scoped changes: `shell.js`, `auth-session-store.js`, `index.source.html`; regenerated canonical `index.html` and `version.json`, including older pending modular source updates. Regression: `tests/test_v21_chat_boot_defaults_to_chat.py` and the updated Work-surface contract test.
- PR: https://github.com/1sl2tp/chat/pull/159 ; squash merge `4b943346283cced853803c6fc75503af2959844e`.
- E0 desired behavior: specified by user; E1 source/build assertions PASS. CI Verify V21: PASS on PR head `767550dd924083166dcba14c3f2c7eaf73a422c5`, run `38065598162`. Earlier CI failure was a legacy assertion requiring Work-first; its expected boot route was updated, while Work content/action assertions remain.
- E2 main source and version confirmed after merge; E3 GitHub Pages deployment outcome not independently confirmed from available tools; E4 actual authenticated Safari/iPhone PWA cold launch, notification tap (closed/background/open), and browser UI still **PENDING**. Do not label PROD VERIFIED yet.
- E5 expected resource change: 0 new API/RPC/Edge/DB/polling or timers; actual network trace still PENDING.
- Rollback: revert only PR #159 squash commit after verifying no newer dependent changes; no DB rollback. Do not modify ScrollController/Push/SyncEngine just to force the route.

## 2026-10-10 — Incoming message leaves 'Nhắn tin...' hard to tap (SOURCE PATCHED, E4 PENDING)

- Symptom: user screenshot reports that after a new incoming message, tapping the text-composer placeholder 'Nhắn tin...' sometimes fails to enter edit mode.
- Scoped owner: index.source.html CSS pointer hit-testing and app.js focus delegation only. No Supabase/Realtime/push/scroll mutation.
- Source evidence: Composer footer parent uses pointer-events-none Tailwind utility; active editor layer relies on pointer-events-auto class. Unread/return-to-bottom control is a sibling lane with its own pointer target and nested motion layer. The textarea itself is not disabled; empty #editorWrap padding previously did not delegate focus.
- Patch: explicit scoped native pointer-events rules for #composerInteractive/#composerShell/#editorWrap/#editor; keep #threadScrollControlWrap click-through except the actual #threadScrollControl button; stack editor over badge lane. Add one trusted pointerdown handler for EMPTY composer padding ONLY; native textarea clicks retain own caret, selection and Vietnamese IME; all buttons/audio/media untouched.
- E0 SPEC-CHAT-COMPOSER-CLICK-20261010 locked in central Google Sheet; E1 focused Node VM+CSS contract test; E2 browser integration unavailable; E3 verify/deploy awaiting workflow; E4 real incoming-message click Safari/PWA/desktop PENDING; E5 resource 0 backend calls expected, actual traffic trace PENDING.
- Rollback: revert only index.source.html CSS and app.js focus handler; test/workflow removable; no data rollback. Do not claim production DONE without a real authenticated click.
- Independent TAPHOA CI/CD gate project remains separate and untouched by this Chat bug.

## 2026-10-10 — Công nợ gửi khách: phân bổ FIFO tham khảo + nhận xét Admin riêng

- Owner: `v21_admin_send_debt_summary` (shared Supabase), existing one-click Admin composer path; không thêm RPC/cron/job/notification trigger.
- DB migration `20261010061148_chat_debt_share_fifo_breakdown.sql` đã áp dụng qua Supabase migration `chat_debt_share_fifo_breakdown_20261010`.
- Khi công nợ dương: gửi tổng phát sinh, đã thu, điều chỉnh, còn lại; lần thu gần nhất; khoản chưa bù trừ cũ nhất; tối đa 5 dòng còn lại theo phương pháp trừ khoản cũ trước. Có ghi chú đây chỉ là bảng đối chiếu tạm, không gán thanh toán pháp lý cho từng đơn.
- Với số dư bằng 0 hoặc âm: giữ chính sách tin nhắn hiện hành. Không tự gửi bất kỳ tin nào khi deploy.
- `admin_assessment` (mức mua / diễn biến thanh toán dựa trên lịch sử đơn/thu) chỉ trả cho Admin, UI chỉ hiện trong hint sau khi bấm gửi thành công; không ghép vào `body` gửi khách.
- E1 test nguồn `tests/test_v21_debt_share_summary.py`; E2 DB tạo hàm PASS + đọc lại live function PASS; E3 Verify/Pages, E4 gửi thử với tài khoản thử nghiệm và E5 resource trace chờ xác minh. KHÔNG đánh dấu real customer send DONE.
- Rollback: khôi phục function `v21_admin_send_debt_summary` từ `20261004203500_chat_send_debt_summary_atomic.sql`, rồi revert riêng `admin-composer-actions.js`. Không xóa ledger hoặc nhắn khách khi rollback.

## 2026-10-09 — Chat notification click: show newest immediately (SOURCE PATCHED)

Symptom: Admin taps an incoming message notification; previous thread reading position appears for a moment and the screen visibly scrolls down, instead of opening directly at the newest message.

Owner/contract:
- Push click/open: `admin-push-controller.js` (only one-time navigation/visibility intent).
- Session reading position: `v21-message-store.js` (one-shot override only for that contact).
- Rendering/scrollTop remains **only** `app.js`'s `V21ConversationBridge/ScrollController`, and Shell/SyncEngine keep the canonical selection/Realtime path.
- `README_MAINTENANCE.md §4a` and central Sheet `CHAT-01` hold the rule.

Patch:
- Before push navigation, temporarily conceal only ScrollRoot; remove the mask after contact mount, FOLLOW_TAIL and <=2px tail-distance stable for 3 frames.
- Use old ScrollController's `replace(...,viewState:null)` when push target is currently active; for another contact, ignore saved `USER_AWAY` state only for that target.
- Abort/failure/logout/newer push restores visibility; bounded 2-second fail-open prevents permanently hidden Chat.
- Normal contact selection still restores its saved reading position. No new calls, cron, message renderer, scroll writer or DB writes.

Commits: MessageStore `72405b65be911a6ae1eb025bd9cefa6e16f8bd6e`; PushController final `71578db5052783668e86942eaf47dd1dc43fb2a4`; regression test `a0ec54ef0f8d1cf4e3ce937330e7f8e8e7cc3be6`; rule docs `35c5710e39cf07caa634cea0c4c81bed1aaa787c`.

Verification so far:
- JavaScript syntax checks on the two changed modules: PASS.
- Isolated MessageStore runtime: normal session restores history; notification session forces tail; same-contact explicit tail: PASS.
- Mocked Admin Push runtime: different contact, same contact, rejected open, mask cleanup: PASS.
- Added `tests/test_v21_admin_web_push_notification_tail.js` to automatic Verify V21 glob, covering cold-open as well.
- **CI/Pages deploy and real Safari/PWA/desktop notification click not yet independently verified**. Do not mark PROD VERIFIED solely from tests.
- Resource difference expected: 0 extra backend/API calls and 0 DB writes, one bounded temporary presentation intent per user notification click. Real before/after network capture outstanding.
- Rollback: revert both runtime files to preceding commits; no database rollback required.

Next: inspect existing Verify V21 / Pages result without starting a duplicate workflow; test live Admin click on existing tab/same contact/cold PWA and confirm no visible scroll. Only then close gates and update this handoff.

---

## 2026-10-06 — Zalo bridge simplified to linked-account event routing

Final architecture:
- Chat web/mobile is canonical for text + image + audio + file.
- Admin -> Chat user always works as Chat first.
- If that user has a current Zalo link owned by the Admin, the existing DB trigger creates exactly the Zalo outbound delivery row and signals Render immediately.
- If there is no Zalo link, the Chat message remains Chat-only: no outbound row, no Render wake, no Zalo action.
- Zalo -> Render text calls canonical ingress once; only a current linked Zalo ID becomes a Chat message. Unlinked text returns NULL and is ignored.
- Zalo -> Render media checks canonical ownership before downloading bytes; unlinked media stops before download/upload/storage.
- Render outbound periodic fallback polling was removed. It now uses the DB event signal plus one startup catch-up after login/restart.
- No Render-side canonical link cache, no new table, no new cron, no second message owner.

Production:
- PR #156 merged as `c89311cdd70d342cb0b64dd3c31c85e12743214a`.
- Verify V21: PASS.
- Render `taphoa-zalo` auto-deploy `dep-db2g1ibncjis73cksajg`: LIVE.
- Runtime log confirms: `outbound event signal enabled; startup catch-up only`.
- Current 24h outbound queue after deploy audit: pending=0, failed=0, sent=145.

Resource impact:
- removes the old 15-minute fallback poll (~96 scheduled outbound checks/day while idle);
- outbound work exists only for linked Chat recipients;
- inbound unlinked media still performs only the tiny ownership preflight, never binary transfer;
- inbound unlinked text performs only its event-triggered canonical link lookup.

## 2026-10-06 — Forwarded image to Zalo-linked contact repair

Symptom:
- Admin used Chuyển tiếp on an existing Chat image toward a Zalo-linked customer, but no destination image message was created and the customer therefore received nothing on Zalo.

Production evidence:
- At 16:55 Vietnam time, `v21_message_forward_source` returned HTTP 200 for the forward attempt immediately after incoming image messages.
- The expected next steps (`v21-media` destination write and `v21_media_assets_send`) never occurred, so no outbound media row existed for Zalo to deliver.
- Existing text delivery to Cô Huyền and previous successful media forwards confirmed the Zalo bridge itself was healthy.

Root cause / patch:
- Browser forwarding depended on Storage server-side `copy(sourceKey,destinationKey)`.
- Forwarding now reads the canonical source Blob and uploads a fresh destination object under the forwarding Admin's account/conversation path, then calls the existing `v21_media_assets_send`.
- The existing media insert trigger remains the single owner that enqueues Zalo outbound media; no new polling, scheduler, retry owner, or Zalo transport path was added.

Verification:
- PR #154 merged as `7d6f271e6483cfc81eaa5feb97219e5fd594a8fe`.
- Forward-media contract: PASS.
- Verify V21 on main: PASS.
- Deploy Chat Pages: PASS.
- Canonical build id: `583739b3725f1f1b07ca4bde7c4dbfd880d396e9595068e3e4b1953acfe7119a`.

Resource impact:
- Only a manual forward of media changes traffic: one Storage download plus one Storage upload per forwarded asset instead of Storage copy.
- Existing 15 MiB/media limit remains. No background traffic was added.

Rollback:
- Revert PR #154 / merge commit above.

## 2026-10-06 — Receipt auto-collection removed

- Bill images are ordinary Chat media only.
- Chat does not OCR/AI-scan bills and does not create automatic debt collections from images.
- Debt/collection changes remain explicit/manual through the existing canonical debt flows.
- No receipt polling, OCR worker, Edge Function, or Render route is an active owner.

## 2026-10-05 — Zalo media bandwidth preflight

Production verification for media preflight:
- GitHub commit: `cdb0da4a0f50c43fc61485e7a35c2318529a09ac`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Supabase `v21-zalo-bridge`: production version **8**;
- Render `taphoa-zalo` deploy `dep-db1a86eq1p3s73f3pmhg`: **live** on the same commit;
- post-deploy health: HTTP 200, `status=logged_in`;
- production canonical probe on an unlinked Zalo contact: `v21_zalo_media_target(...)=NULL`, confirming the new Render preflight will stop before binary download for that class of traffic.


Symptom:
- Render Zalo listener receives upstream messages from the whole logged-in Zalo account, not only Chat-linked contacts.
- Media was downloaded by Render and multipart-uploaded to Supabase before Supabase decided whether the sender was linked to Chat.

Measured production evidence before patch:
- ~333.5 MB inbound media request bytes / 24h on `v21-zalo-bridge`;
- ~331.8 MB (~99.5%) of the large media traffic returned the small "not a target" response and was discarded;
- text traffic is small and is not the bandwidth bottleneck.

Patch:
- new lightweight `media_target` bridge action using canonical `v21_zalo_media_target`;
- Render calls `messageGateway.mediaTarget(event)` before `downloadInboundMedia()`;
- if `needed=false`, Render stops immediately and never downloads/posts the binary;
- linked media keeps the existing idempotent upload/storage/message path;
- no polling, no new database table, no second ownership cache.

Expected resource impact:
- remove nearly all media bandwidth generated by unlinked Zalo contacts/groups;
- keep keepalive/realtime listener unchanged;
- add only one tiny metadata preflight per inbound media event.

Rollback:
- revert the bridge/server/Edge Function commit and redeploy `v21-zalo-bridge`; no schema rollback is required.

## 2026-10-05 — Offline contact visibility + Admin→Zalo delivery

Symptom:
- one Chat account could be absent from the Admin directory while not online;
- Admin manual message to a Zalo-linked account could wait for the bridge fallback poll before 05:00 because the outbound wake signal was time-gated.

Production facts:
- `v21_contacts_sidebar` does **not** filter by `v21_sessions`/Presence; directory membership is canonical `v21_accounts` data.
- production currently has 79 active user accounts; 78 had no active Chat session in the 5-minute check window, yet all remain directory-eligible.
- 76 accounts are linked to Zalo.
- Admin→linked-account Chat insert already creates `zalo_message_links(direction='outbound', state='pending')` independent of target online state.

Root cause:
- desktop can retain a stale local contact cache even after the relevant old sync event is no longer useful for repairing that cache;
- `v21_private.zalo_outbound_signal()` skipped immediate Render wake before 05:00 Asia/Ho_Chi_Minh, even for a manual Admin message.

Final contract:
- authenticated bootstrap performs exactly one bounded `v21_contacts_sidebar` refresh to repair stale local directory cache; no interval polling was added;
- Presence/session state never controls whether an account appears in the directory;
- manual Admin→Zalo outbound signals `taphoa-zalo/outbound-now` immediately at any hour;
- customer-care scheduling remains controlled by its own daytime windows and pacing rules;
- if recipient is offline and has Zalo link: canonical Chat message + Zalo outbound;
- if recipient is offline and has no Zalo link: canonical Chat message remains unread and is delivered by normal Chat catch-up on next login; user-side Web Push is not currently an owner.

Verification:
- code commit: `1707790d2ac317656448b7a233d6dd79a4b7cab8`;
- canonical build sync: `06370c3b1c3c7d4f304f9c19ab2820e71107a573`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages deployment: PASS;
- production Zalo wake probe cleared the 4 current pending outbound rows; one historical failed row remains unrelated.

Resource impact:
- +1 bounded contacts RPC per authenticated bootstrap only;
- 0 interval polling added;
- manual Zalo message creates one immediate bridge wake instead of waiting up to the fallback poll;
- no new canonical table or duplicate delivery store.



## 2026-10-05 — LiveKit single-owner cleanup

- Confirmed production `v21-livekit-session.js` uses `v21-livekit-token`.
- Confirmed guest call page uses `v21-call-invite-guest`.
- Legacy `taphoa-livekit-token` had no current production reference and was retired to HTTP 410.
- Current LiveKit role remains transport/session only; Supabase `1sl2tpvn` owns durable business/call state.
# CURRENT WORK — TAPHOA CHAT

Cập nhật: 2026-10-04

## Luồng bắt buộc hiện tại

1. Auth:
   - Supabase session được persist + auto-refresh.
   - Form dùng browser password manager (`autocomplete=username/current-password`); không lưu plaintext password trong app.
2. User:
   - app/web visible → nhận `v21_sync_events` realtime và áp ngay vào UI/cache;
   - app hidden/closed → dừng foreground Realtime;
   - mở lại/foreground → subscribe lại + delta pull catch-up ngay.
3. Admin:
   - PC/mobile visible → cùng luồng realtime như user;
   - mobile hidden/background → Service Worker/Web Push tiếp quản;
   - app bị đóng hoàn toàn → push/badge vẫn tới cho incoming user message; mở lại thì catch-up phần đã bỏ lỡ.
4. Read-state:
   - conversation đang visible mới mark-read;
   - read-state event được gửi cho cả hai account và mọi session đang mở cùng nhận/apply.

## Owner

- Auth/session: `auth-session-store.js`.
- Foreground realtime: `v21-realtime-session.js`.
- Canonical event apply + catch-up/outbox/read: `v21-sync-engine.js`.
- Admin mobile background: `admin-push-controller.js` + `sw.js`.
- Canonical data: Supabase Postgres.

## Patch đang triển khai

- `v21_sync_events` không còn phải wake rồi chờ RPC pull mới render; event canonical áp thẳng vào cache/UI.
- Pull chỉ còn boot/reconnect/foreground/fallback catch-up.
- Read-state của cùng account cập nhật unread ở các session khác.
- Admin mobile tự coi background push là wanted khi platform hỗ trợ; permission hệ điều hành/browser vẫn là điều kiện bắt buộc.
- Push foreground kiểm tra cache trước khi fallback pull để tránh gọi trùng.
- Direct-message fallback theo dõi đúng message id; sync-event khác không được hủy nhầm fallback.
- Foreground Realtime dừng khi document hidden; admin background do Web Push sở hữu.
- Presence/heartbeat guardrails trước đó vẫn giữ.

## Production probe cần làm

Sau deploy, reload một lần các runtime cũ rồi test không refresh:
- admin PC gửi → user đang mở + admin mobile đang mở thấy ngay;
- user gửi → admin PC + admin mobile thấy ngay;
- admin mobile gửi → admin PC + user thấy ngay;
- một bên đang mở đúng conversation → read-state phản hồi sang bên kia;
- đóng user app → user không chạy nền;
- đóng admin mobile/PWA → incoming user message vẫn có Web Push/badge; mở lại catch-up ngay.

## Không được làm

- Không thêm interval polling message.
- Không lưu plaintext password.
- Không dùng Presence/heartbeat làm message transport.
- Không cho push và direct-message fallback tự render message.


## Root cause xác nhận sau test 19:10

Supabase mới có publication + RLS đúng, trigger tạo đủ `v21_sync_events` cho cả admin và user, nhưng bị thiếu table privilege cho Realtime role:

- `v21_sync_events`: authenticated SELECT = false
- `v21_messages`: authenticated SELECT = false
- `v21_session_events`: authenticated SELECT = false
- `v21_call_events`: authenticated SELECT = true

Do đó PostgreSQL Realtime subscription không đọc được 3 bảng đầu dù policy tồn tại. RPC/REST vẫn có thể hoạt động qua SECURITY DEFINER nên biểu hiện là gửi được nhưng các session đang mở không tự nhận.

Production đã áp migration `restore_chat_realtime_authenticated_select`:
- GRANT SELECT cho authenticated trên 3 bảng trên;
- REVOKE ALL FROM anon;
- giữ nguyên RLS và write privileges.

Sau migration, cả 4 bảng Realtime: authenticated SELECT = true, anon SELECT = false.


## Operational retention đã áp production

Migration: `chat_operational_retention_guard`.

Retention:
- sync events: 14 ngày;
- session events: 7 ngày;
- push outbox sent/dead: 7 ngày;
- revoked app sessions: 30 ngày;
- summary failed: 7 ngày;
- summary done: 30 ngày.

Cron owner duy nhất: `chat-operational-retention-daily`, 03:43 UTC, tối đa 10.000 dòng/bảng/lượt.

Cleanup đầu tiên:
- `v21_session_events`: 228 → 3;
- `v21_push_outbox`: 1264 → 234;
- `chat_customer_summary_runs failed`: 1037 → 86;
- `v21_sync_events`: chưa xóa vì chưa đủ 14 ngày;
- revoked sessions: chưa xóa vì chưa đủ 30 ngày.

Canonical messages/read/media/conversations không bị đụng.


## Danh bạ — click không được nhảy vị trí

Root cause: `ContactStore.upsert()` trước đây luôn sort + render toàn danh bạ kể cả patch chỉ đổi `has_unread` khi mark-read. Vì vậy click một contact có thể làm DOM list bị dựng/reorder lại và vị trí vừa bấm bị nhảy.

Contract mới:
- chỉ contact mới hoặc `latest_at` thật sự đổi mới được reorder;
- `has_unread`, avatar, tên, profile update chỉ patch row tại chỗ;
- tin nhắn mới vẫn đổi `latest_at` nên contact vẫn lên đầu;
- full reorder khi có activity thật vẫn giữ `scrollTop` của `.wm-sidebar-navigation`.


## Customer-care route schedule corrected

Root cause: migration `20260922232000_customer_care_pre_delivery_stagger.sql` changed the source selector from the original route days (Monday/Friday) to one-day-early reminders (Sunday/Thursday).

Final production rule:
- Monday (Thứ 2): Sữa;
- Friday (Thứ 6): Sữa;
- every other day: Hàng thường;
- scanners stay 09:15 and 14:00 Asia/Ho_Chi_Minh;
- manual 2-minute staggering stays unchanged;
- no auto-send was added.

Production was refreshed immediately after the migration. On 2026-10-04 (Sunday), today's open care plan is Hàng thường.


## Customer-care message templates

Both Hàng thường and Sữa use the same 3-tier recommendation contract:
1. customer purchase history;
2. popular products from the same source;
3. active catalog fallback from the same source.

Up to 5 items are returned. A customer with no purchase history still receives product suggestions, and Milk suggestions never mix with regular-goods suggestions.

Canonical formatter: `chat_customer_care_message(customer_id,date)`.


## Customer-care auto-send — KH only

Auto-send is enabled only for `v21_accounts.contact_group='customer'` (nhóm KH). Friend/other groups are explicitly excluded both when planning and when sending.

Pacing/safety contract:
- refresh owners remain 09:15 and 14:00 Asia/Ho_Chi_Minh;
- one auto-send owner: `chat-customer-care-auto-send`;
- cron wakes every 5 minutes only in the morning/afternoon UTC bands; the function enforces exact Vietnam windows;
- send windows: 09:30–11:35 and 14:15–17:35;
- at most one care message per pass and one care message per customer/day;
- no care send while Zalo outbound has unresolved work;
- defer when any Zalo outbound was sent in the previous 2 minutes;
- enforce an additional ~5-minute campaign gap;
- skip a customer with any conversation activity in the previous 60 minutes;
- message creation uses `taphoa_chat_notify_customer`, so normal Chat realtime/Zalo bridge ownership stays unchanged;
- outside windows the sender returns `outside_window` and sends nothing.

This pacing reduces burst/spam-like behavior but cannot guarantee how a third-party platform classifies messages.


## Admin Composer — Công nợ không gửi URL trần

Root cause: `admin-composer-actions.js` action `debt` gọi `customerLinks()` rồi gửi trực tiếp `links.debt_url`.

Contract mới:
- click Công nợ gọi một RPC duy nhất `v21_admin_debt_share_summary(customer_id)`;
- chỉ Admin session hợp lệ được gọi;
- debt age = thời gian của đợt số dư dương liên tục hiện tại, không phải ngày đơn gần nhất;
- số đơn = đơn đã giao trong đợt công nợ đó;
- không gán thanh toán vào từng đơn vì collection hiện là balance-level;
- nội dung dùng giọng "Đối chiếu công nợ", gồm số dư, ngày bắt đầu/số ngày, số đơn đã giao, câu đề nghị kiểm tra lịch sự và link chi tiết;
- balance = 0 / dư tiền có mẫu riêng, không nói "chưa thanh toán hết";
- nếu RPC lỗi thì không fallback gửi URL trần.


### Debt share atomic send repair

Symptom: Admin Composer showed "Đang tạo đối chiếu công nợ…" but no message appeared. Production probe confirmed the summary RPC resolved correctly for the active Admin session, while no new `v21_messages` row was created. The failure boundary was the browser's second step (RPC body → client send).

Final owner:
- one RPC: `v21_admin_send_debt_summary(customer_id, client_id)`;
- server validates the current Admin app session;
- server calls `debt_share_summary_payload`;
- server inserts through canonical `taphoa_chat_notify_customer`;
- client only issues the RPC, then wakes SyncEngine once for immediate catch-up;
- idempotency key is `debt-share:<client_id>`;
- no bare-link or browser-send fallback.


## Admin image paste/send duplicate repair

Root cause production: one Admin clipboard transaction can expose the same image through both `clipboardData.files` and `clipboardData.items`. Browser metadata (`name/lastModified`) can differ, so metadata-only dedupe allowed two prepared assets with different asset IDs but the same `content_hash` into one message.

Evidence:
- production had 3 Admin messages with duplicate non-null image hashes inside the same message;
- newest incident contained 2 assets with identical SHA-256 content hash.

Final contract:
- `sameDraftImageContentExists()` owns same-draft image dedupe by canonical `contentHash`;
- applies to both visible and inactive composer drafts, therefore covers picker + paste ingress;
- duplicate prepared asset is released from local preview/cache before queueing;
- historical reuse is still allowed after the draft/message commits;
- one-time migration soft-deleted later same-hash Admin assets inside the same message; production duplicate-message count is now 0;
- no polling/request owner was added.


## Danh bạ — click giữ nguyên vùng cuộn + xóa ô tìm kiếm

Triệu chứng:
- Admin cuộn danh bạ xuống giữa/dưới rồi bấm một liên hệ (ví dụ Cô Huyền PL) thì sidebar nhảy về đầu.
- Khi tìm một liên hệ rồi bấm mở, chữ trong ô tìm kiếm vẫn còn.

Root cause:
- `contact-directory-admin.js` bắt mọi `v21-contact-store-change` bằng `scheduleSync({scrollToTop:true})`.
- Mở conversation có thể lập tức mark-read, sinh contact-store patch và extension Admin cưỡng bức `scrollTop=0`, dù `shell.js` đã giữ đúng viewport.
- Module danh bạ được dynamic-import ngoài canonical bundle nên cần build-key để tránh browser giữ bản JS cũ.

Final contract:
- `v21-contact-store-change` chỉ sync/reorder và luôn giữ `.wm-sidebar-navigation.scrollTop`; mark-read không được kéo danh bạ về đầu.
- Tin nhắn mới vẫn có thể reorder theo `latest_at`, nhưng viewport hiện tại thuộc về người dùng và không bị ép về row 1.
- Click đúng `[data-contact-select]` sẽ xóa `query` + giá trị input tìm kiếm rồi sync danh sách; nút `...` quản lý liên hệ không bị coi là mở contact.
- Dynamic import `contact-directory-admin.js` được gắn `__build=<app-build-id>` để deploy mới không dùng cache module cũ.
- Không thêm polling/request/Realtime owner mới.

Commits:
- code + regression test: `2a304b7f54a1ed816f61c949962badaaf6620a52`;
- sửa contract test cũ đang yêu cầu hành vi nhảy-top: `efbfee7e7873869657a4176ba024da5bbb05d5ea`;
- sync canonical `index.html/version.json`: `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.

Verification:
- Verify V21: PASS trên `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.
- Deploy Chat Pages: PASS.
- Build canonical + verify canonical: PASS.
- Pages deploy + custom-domain HTTPS probe: PASS.
- Production build id: `568463e3960f72cd91676e369aac91e464ca5ae982838b87da450dfeb3c1dfa2`.


## Ảnh chat — mở full phải giữ độ nét

Triệu chứng:
- ảnh trong bong bóng chat nhìn nét nhưng khi mở viewer toàn màn hình thấy mềm/mờ hơn.

Root cause:
- Composer cũ ép mọi ảnh lớn về cạnh tối đa 1600px và JPEG/WebP quality 0.78;
- ảnh trên bubble chỉ rộng khoảng 360px nên khó thấy suy giảm, nhưng viewer toàn màn hình/Retina phóng vùng ảnh lớn hơn nên lộ rõ;
- production có nhiều media canonical bị chạm đúng trần 1600px, xác nhận đây là đường nén thực tế chứ không phải CSS viewer.

Final contract:
- JPEG/JPG/PNG/WebP có cạnh <=4096px và <=15 MiB được giữ nguyên byte, không re-encode chỉ vì file >512 KiB;
- ảnh lớn hơn 4096px vẫn resize có kiểm soát về 4096px, quality encode 0.92;
- giới hạn upload 15 MiB hiện hữu không đổi;
- viewer/cache/Storage owner không đổi, không thêm request/polling/proxy/log;
- ảnh đã gửi trước patch vẫn giữ chất lượng file đã lưu; patch áp cho ảnh gửi mới.

Resource impact:
- không tăng số request;
- media mới có thể lớn hơn trước nên tăng byte Storage/egress theo kích thước ảnh thực, đổi lại viewer giữ độ nét sản phẩm; vẫn bị chặn bởi giới hạn 15 MiB/ảnh.

Commit production: `7e2403a5fe97f0f797c0811a403100a69facf0e4`.
- build id: `5b34014013eb2c58da951f3078708400d73bf71e7c1f8f9c6ade5215ff05e030`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages build/deployment: PASS;
- canonical build/verify: PASS;
- custom-domain production probe: PASS.


## 2026-10-08 — Chat UI Foundation V1 / mobile directory compact
- Base UI patch: `4a7585cf66613beba5ec03649d06b8eb605b5b9b`.
- Added local `ui-foundation.css` (visual tokens only; no business/realtime/push ownership).
- Mobile directory prioritizes `Chọn người → Chat`: compact `Danh bạ`, 12px gutter, 16px mobile search input, tighter search/filter spacing; contact row remains 60px / avatar 40px.
- Notification routing audited only: `sw.js` carries contact/conversation IDs and `admin-push-controller.js → ChatAppShell.NavigationCommand.openContact()` forces route `chat`; no Push/DB/Realtime code changed.
- Resource impact: 0 DB writes, 0 provider calls, 0 polling/logging/background work added; one small local CSS asset.
- Initial Verify V21 failed only because generated `index.html/version.json` were not committed with modular source. Pages build generated + verified canonical output successfully; this commit synchronizes generated artifacts.


## 2026-10-08 — Chat Header + Composer Foundation pass
- Scope: visual-only, mobile-first RegionTop + Composer.
- Header uses `--ui-chat-header-mobile:60px`, 44px mode controls, safe horizontal gutter; no Chat/Work/call route logic changed.
- Composer uses 44px touch controls for + / mic / send, 16px input, 12px page gutter and local radius/shadow tokens; keyboard/VisualViewport/audio/send owners unchanged.
- No DB/API/realtime/push/provider/log/background changes. Generated `index.html/version.json` are synchronized in the same commit.
