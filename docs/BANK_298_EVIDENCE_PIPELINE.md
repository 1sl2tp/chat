# BANK-298 · Kiến trúc nhận diện bill và thu tự động không mâu thuẫn

Nguồn chuẩn: `1sl2tp/chat`; project Supabase `vtqhbhrkdxirqeqkgylo`.
Ngày rà soát: 12/11/2026, múi giờ `Asia/Ho_Chi_Minh`.
Chỉ dùng bằng chứng ngân hàng đã xác minh để phát sinh tiền. AI không có quyền ghi sổ.

## 0. Tiên đề bất biến
1. **Ảnh khách gửi = dữ liệu chưa xác minh**, có thể bị mờ, đảo chiều, ghép, gửi lại, chỉnh sửa hay sai ngày.
2. **Thông báo Agribank độc lập = nguồn xác nhận khoản tiền vào**; thời điểm trên thông báo ngân hàng, không phải lúc điện thoại nhận push.
3. **RPC tài chính = quyết định cuối cùng**, khóa, đối chiếu tiền/tài khoản/giờ/ngày, chống trùng, thu thủ công, ngày nghiệp vụ, quyền tài khoản.
4. **Không gộp các bằng chứng của hai giao dịch khác nhau** (ảnh đầu cho số tiền, ảnh sau cho giờ; hoặc lấy tên người nhận từ memo).
5. Không một yếu tố đơn lẻ (tên đúng, số tiền đúng, ảnh có chữ thành công, ngân hàng gửi cùng giờ) được tự cho phép ghi thu.
6. Khi thiếu bằng chứng hoặc hai nguồn mâu thuẫn, **fail closed**: giữ ảnh/metadata phục vụ đối soát, không ghi thu.

## 1. Pipeline hiện tại — 9 giai đoạn và chủ trách nhiệm
| Bước | Chủ xử lý | Đầu vào, kết quả | Thất bại phải phân loại |
|---|---|---|---|
| 1. Ảnh được gửi | Chat | Xác minh sender/customer, message/media, chưa bị xóa | `not_customer_submitted`/đối tượng không hợp lệ |
| 2. Lập job & quota | DB + worker | Job `queued`, kiểm tra nửa đêm VN, per-customer/global | `scan_budget_unavailable` = lỗi kỹ thuật, không suy luận ảnh xấu |
| 3. Tải ảnh, kiểm tra kích thước, hash | Storage/worker | Bytes + SHA-256, phát hiện ảnh y hệt | `storage_download_failed` tạm thời, `duplicate` nếu hash trùng |
| 4. AI trích xuất chữ nhìn thấy | Gemini | Loại chứng từ, số, ngày/giờ nguyên văn, STK/người nhận, memo, mã giao dịch | 503, timeout, malformed JSON = lỗi **kỹ thuật** và retry có giới hạn |
| 5. Parser tất định | Rule v5 JS | DD/MM/YYYY, giờ, số tiền nguyên VND, tên nhận canonical và nguyên văn | Không rõ/sai/mâu thuẫn = `review`, không được đoán |
| 6. Xác minh đủ trường | `requiredAutoCollectEvidence` | Ngày in, giờ in, tài khoản nhận đủ hoặc đuôi + memo | `review` với lý do cụ thể |
| 7. Ghép ngân hàng | `previewBillAppMatch` | Một Agribank credit độc lập, đúng tài khoản/số tiền/minute, kiểm tra memo QR/MB khi cần | `waiting_bank_event`/review, không được dùng giờ push |
| 8. Chống trùng | Worker + SQL | Hash, reference, bill cạnh tranh, ngân hàng đã thu, thu tay | `duplicate` hoặc `review`, không ghi thêm |
| 9. Ghi thu đúng một lần | `chat_bank_app_collect` RPC | Kiểm tra lại bằng khóa + service role, ghi ledger, liên kết bank↔receipt | `received` chỉ khi RPC trả ledger/link; nếu không, giữ trạng thái chờ |

## 2. Cây quyết định — không trộn lỗi OCR với lỗi hạ tầng
- **Không phải bill thật**: QR chưa hoàn tất, lãi, phí, quảng cáo, ảnh vật dụng → `non_bill`.
- **AI đọc không rõ/không chắc**: số tiền, ngày, giờ, tài khoản, tên bị che hoặc mâu thuẫn → `review`, lưu `missing_fields` và `recognition_case`.
- **AI không phản hồi/503/network/timeout/JSON bên ngoài lỗi**: `failed` / `amount_scan_gemini_...`, cron retry có backoff, không kết luận ảnh không phải bill.
- **Đã đọc hợp lệ nhưng Agribank chưa có bằng chứng độc lập**: `amount_read` + preview `waiting_bank_event`, không ghi thu; giao dịch đến muộn có thể recheck **không gọi AI lần hai**.
- **Tiền vào có nhưng tên/STK/giờ/memo khác rõ ràng, hoặc có hai khoản cạnh tranh**: `review`/preview rejection; không ghép sai để đẩy `received`.
- **Bằng chứng đầy đủ, duy nhất, chưa thu**: `candidate_unique` chỉ là *đề nghị*, phải qua RPC; kết quả `received` và ledger/link mới là đã thu.
- **Ảnh y hệt hoặc chuyển khoản đã dùng**: `duplicate`/blocked, không gọi AI lại với ảnh y hệt và không ghi trùng.

## 3. Đã sửa trong BANK-298
1. **Giờ chính xác**: `bankTime` kiểm tra lịch ngày thật bằng UTC roundtrip; không để JavaScript tự biến 31/02 thành tháng 3; SQL RPC vẫn tự kiểm tra lần cuối.
2. **Phát hiện chuyển khoản nội bộ có dấu**: `ownTransferNotice` đọc *đầu* memo ngân hàng, chuẩn hóa `Bùi Xuân Tùng` → `BUI XUAN TUNG`, bóc đúng wrapper `QR -` hoặc `MB(6 chữ số)(nội dung)` khi có. Tên người thụ hưởng xuất hiện ở cuối `A chuyen tien den BUI XUAN TUNG` KHÔNG bị coi là người gửi.
3. **Kỹ thuật Gemini**: timeout 30s bao phủ `fetch` **và** parse body `.json()`; HTTP 200 nhưng JSON bên ngoài lỗi được coi `gemini_invalid_json` (retryable), không biến thành `review` của ảnh.
4. **Quota theo giờ Việt Nam**: `vietnamBusinessDayStartUtc` tính nửa đêm VN, không dùng nửa đêm UTC (07:00 VN). Nếu truy vấn quota lỗi, fail-closed với `scan_budget_unavailable`, không mặc định =0.
5. **Tất cả thay đổi nằm ở Edge**, không sửa SQL production hay ngưỡng tài chính. Giữ nhận diện `rule_version=bank_bill_amount_v5_20261110` để tương thích RPC.

## 4. Phương án kế tiếp chính xác hơn (chưa tự áp dụng vào giao dịch thật)
- **Cổng OCR hai lớp có điều kiện**: ưu tiên một lượt AI; chỉ khi số/ngày/giờ không rõ thì dùng lượt thứ hai (hoặc OCR độc lập) để đối chiếu chữ *trên cùng ảnh*, không tự bỏ qua `review` khi hai lượt bất đồng. Giảm chi phí so với gọi hai model cho mọi ảnh.
- **Không dùng điểm confidence của AI để ghi thu**. Lưu bằng chứng trích chữ + vùng ảnh (tọa độ nếu API cho phép), rule version, model/version, nguồn ngân hàng, các kiểm tra fail; quyết định thu là điều kiện tất định và RPC.
- **Tạo test corpus vàng đã được người kiểm chứng**: ảnh mờ, xoay, giấy, QR, MB, DD/MM, thiếu năm/giờ, phí khác số tiền, gửi trùng, tự chuyển tiền, 2 giao dịch gần nhau, ngân hàng gửi push trễ. Ẩn thông tin nhận diện thực tế khi lưu fixture. Đo recall OCR, tỷ lệ đọc ngày đúng, tỷ lệ gắn khoản sai (phải bằng 0 trên corpus) và thời gian từ ảnh đến ledger. Không tuyên bố tỷ lệ chính xác từ `received`.
- **Khóa version quy tắc/ma trận tương thích** giữa OCR JS và SQL RPC: trước khi release, CI bắt buộc kiểm tra các nhánh `candidate_unique`/SQL guard bằng fixture đối xứng; không để preview nói YES nhưng RPC từ chối vì cách chuẩn hóa tên/số/giờ.
- **Giám sát SLO theo từng bước**: `queued→scanning`, Gemini HTTP, `scanning→amount_read/review`, bank notification lag, `candidate_unique→received`; cảnh báo lỗi 503 tăng, retry hết số lượt, bank ingest chậm. Không lấy tình trạng `received` làm bằng chứng OCR đúng.
- **Không thay đổi công nợ để thử**; replay hoặc kiểm thử trên bản sao fixture/chế độ read-only và xác minh giao dịch thật chỉ theo bằng chứng độc lập đã tồn tại.

## 5. Kiểm chứng & triển khai
- `tests/test_bank298_evidence_clock_retry_quota_20261112.mjs`: các ca ranh giới 00:00 VN, bank date vô lý, bank leap day, chuyển tiền nội bộ có dấu/QR/MB, tiền đến từ người khác, khác giờ/tiền, timeout bao phủ HTTP body và lỗi Gemini malformed.
- Verify V21 và guarded Edge workflow phải PASS trước merge main; đọc ngược 8/8 tệp nguồn từ `chat:main` vào đúng project.
- Không deploy lại `v21-agribank-notification-ingest` khi source không đổi; không tạo token mới, không sửa database production, không replay ledger #849/#850.


## 6. BANK-299 — Một bảng quyết định thống nhất, không suy đoán trạng thái từ số tiền

**Bất biến mới: trạng thái tài chính (`received` + ledger hợp lệ) có thẩm quyền cao hơn lời diễn giải từ AI hoặc `match_preview` cũ.** `amount_read` chỉ nói OCR đã nhận số tiền, KHÔNG nói tiền đã khớp ngân hàng. Mỗi lần hiển thị phải **tính lại** kết luận từ trạng thái/bút toán hiện tại, không ghi riêng một trạng thái dẫn xuất có thể trở nên lỗi thời sau khi RPC thu.

| Trạng thái receipt | Bằng chứng so ngân hàng | Nhóm chẩn đoán | Hành động |
|---|---|---|---|
| `received` + ledger | bất kể `match_preview` cũ | `collected` | Không thu thêm; hiển thị bút toán thật |
| `received` không ledger; hoặc ledger với trạng thái khác | bất kỳ | `integrity_alert` | Admin kiểm tra tính toàn vẹn; không suy đoán |
| `duplicate` | bất kỳ | `duplicate` | Không quét/thu trùng |
| `non_bill` | bất kỳ | `not_bill` | Không thu |
| `queued/scanning` | bất kỳ | `processing` | Chờ worker |
| `failed` lỗi có thể thử lại | Gemini 408/429/5xx, timeout, HTTP body/JSON lỗi, tải ảnh, hash store tạm thời | `technical_failure` | Retry có giới hạn và backoff |
| `failed` lỗi cấu hình/không thuộc retry | ví dụ Gemini key missing, 400/401/403 | `technical_failure` | Admin kiểm tra; không lặp API mù |
| `review` | thiếu/sai/mâu thuẫn | `requires_review` | Không thu; kiểm chứng riêng |
| `amount_read` | `waiting_bank_event` | `waiting_bank` | Chờ thông báo độc lập, khi tới so lại không tốn AI |
| `amount_read` | `review`: thiếu mã, thiếu giờ, thiếu bằng chứng | `missing_evidence` | Admin xác minh; không tự tạo chữ/số |
| `amount_read` | `review`: trùng/khác tiền, sai nội dung, sai giờ | `evidence_conflict` | Admin xác minh; không auto match |
| `amount_read` | Query dữ liệu đối chiếu thất bại | `technical_block` | Thử truy vấn lại có kiểm soát; không gọi AI nếu ảnh đã đọc |
| `amount_read` | `candidate_unique` | `pending_financial_rpc` | Chỉ RPC có quyền quyết định đã thu |
| `amount_read` | không có preview | `unverified` | Không ghi thu; điều tra |

**Phân loại không phải quyền ghi thu.** Mọi kết quả của `describeBillDecision` đều phải có `financial_authorized=false`. Không tạo ledger hoặc sửa `status` theo nhãn dẫn xuất. Rule OCR v5 vẫn giữ nguyên để tương thích RPC; phiên bản diễn giải riêng là `bank_bill_decision_v1_20261112`.

**Một hàm xác nhận lỗi thử lại:** `isRetryableBillScanReason` được gọi tại cả hai điểm: (1) khi scan thất bại và (2) khi job `failed` được đánh thức. Không cho 503 được đánh dấu tạm thời ở bước 1 nhưng không được retry ở bước 2; không biến 401/key missing thành retry vô hạn. Tất cả retry luôn đi qua hạn mức cron và cơ chế chống trùng; thay đổi chẩn đoán không mở quyền ghi sổ.

**Dữ liệu kiểm chứng đọc-only 12/11/2026:** bốn bill `amount_read` gồm 10.157.000đ (memo chưa xác minh), 10.000.000đ (cạnh tranh bank credit), 1.482.000đ (reference/memo không rõ), 718.000đ (không rõ giờ). Cùng `reason=bank_image_amount_only_no_collection` không có nghĩa bốn ảnh lỗi giống nhau; phải xem `raw_read.match_preview.reason`. Không tự ghi thu lại bốn bill này, không giả định tất cả vẫn còn nợ vì có thể đã thu thủ công ở nơi khác.

**Giao diện:** `bank-report-dashboard.js` gọi đúng nguyên nhân đối với Gemini JSON lỗi, HTTP 408/429/5xx, timeout, lỗi tải ảnh và hash. Khi API chỉ cung cấp `reason` chung nhưng không có chi tiết preview, phải hiển thị kết luận thận trọng, không tự bịa nguyên nhân. Muốn hiển thị đủ preview trong bảng cần nâng cấp contract dữ liệu qua review riêng, không âm thầm nới RLS hay cấp quyền truy vấn bảng tài chính.

**Về tối ưu OCR:** không bật 2 lượt AI tự động đại trà; ưu tiên một lượt, phân tích tất định, nếu thiếu/không thống nhất mới cân nhắc OCR bổ sung cùng ảnh trong một nhánh thử nghiệm riêng. Chỉ nâng thành auto khi có bộ test ảnh gốc khử nhạy cảm được người kiểm chứng, đo false positive và chi phí. Bất kỳ bất đồng giữa AI1, AI2 hoặc ngân hàng phải review, không chọn kết quả thuận lợi để thu.

**Đối chiếu cron production (bổ sung BANK-299):** cron job #21 `chat-bank-transient-bill-retry-5m` vẫn chạy mỗi 5 phút và gọi `v21_private.chat_bank_retry_transient_scan_failures()`. Filter SQL chỉ chấp nhận HTTP Gemini 408/429/5xx, abort/network, JSON invalid, `storage_download_failed`, `hash_registry_unavailable`, `worker_interrupted`; **không nhận** `hash_registry_lookup_failed`. Vì vậy lỗi tra cứu hash phải báo `technical_failure/admin_check`, KHÔNG báo đang tự retry hoặc thêm vào predicate Edge trước khi có thay đổi cron được kiểm thử/duyệt riêng. Không tự thay đổi SQL production để đồng bộ vội.


## 7. Sự cố thật 12/11/2026, 17:41–17:49 VN — BANK-300: lỗi AI tạm thời và bằng chứng Agribank đến muộn

- **Nguồn bằng chứng:** Supabase project `vtqhbhrkdxirqeqkgylo`, receipt `ee2ddbdb-cbdb-4b48-99a0-18b710c87e19`, asset `7c03f06f-6258-4d52-a678-21386e50c4a5`; chỉ đọc database sau xử lý. Không lưu ảnh khách hoặc mã giao dịch đầy đủ vào tài liệu.
- **17:41:27:** ngày/giờ giao dịch trên bill, **10.000.000đ**, người nhận được đọc là `BUI XUAN TUNG`, STK Agribank đã cấu hình. **17:41:59** khách gửi ảnh. **17:42:17** worker v42 hoàn thành attempt 1 với `failed/amount_scan_gemini_http_503` và push "AI quét lỗi · sẽ thử lại · chưa ghi thu". Đây là lỗi dịch vụ AI, **không** chứng minh ảnh sai hoặc số tiền không vào.
- **17:45:** cron retry 5 phút vẫn ACTIVE, chạy nhưng thời điểm này chưa qua đủ 3 phút từ lần quét 17:42:17; chưa đủ điều kiện retry. **17:46:55** một lượt dispatch qua worker chính thức, được chặn bởi điều kiện `failed`, `attempt_count=1`, `reason=amount_scan_gemini_http_503`, `scanned_at <= now()-3min`, chưa có ledger/links, ngày gần đây. Không insert/update ledger thủ công. Worker attempt 2 tại **17:47:03** đọc được **10.000.000đ**, status `amount_read`, preview `waiting_bank_event/no_matching_agribank_notification`.
- **Chú ý về transport:** `pg_net` request #15414 có `timed_out=true` ở bảng HTTP, **nhưng** receipt và job đã tiến đến `amount_read`. Vì vậy không coi timeout của tác vụ gọi worker là bằng chứng quét thất bại; **luôn đọc lại trạng thái receipt và ledger**, không dispatch tiền/AI thêm chỉ vì client timed out.
- **17:49:20** thông báo Agribank ghi có phát ra với giao dịch có giờ ngân hàng **17:41**. **17:49:23** ingest nhận notification #271 (10.000.000đ, đúng account, not own transfer). **17:49:25** verified bank worker ghép với đúng bill và RPC ghi đúng một lần `received`, ledger **#852**, amount_vnd trong ledger `-10000` **đơn vị nghìn VND**, customer balance after `85000` **nghìn VND**, một notification link, **0** manual link.
- Một giao dịch 10.000.000đ ngày 11/11 ledger #838 hoàn toàn **khác** giao dịch ngày 12/11 #852: không ghép chỉ dựa vào số tiền. Các #849 (2m) và #850 (3m) vẫn giữ nguyên.
- **Quy tắc vận hành không được mâu thuẫn:** 503 → **technical retry**, không đổi thành `non_bill`; ảnh đọc thành công mà thiếu Agribank → **waiting_bank**, không gọi lại AI hoặc tự ghi thu; khi thông báo ngân hàng đến trễ phải lấy **bank-printed transaction time**, không dùng push delivery/Chat send time. `received` chỉ khi RPC/ledger/link xác nhận. Push iOS phát lúc failed là **snapshot tại thời điểm gửi** và không tự có hiệu lực để phán xét trạng thái hiện tại; Admin cần đọc receipt/ledger mới nhất.
- **Quan sát:** lần này bản v42 hoạt động đúng và không yêu cầu thay đổi RPC, luật tiền hay gọi Gemini lần ba. Độ trễ từ giao dịch đến app push ~8 phút; data cho thấy ngân hàng thông báo tới điện thoại chậm, nhưng không đủ để khẳng định nguyên nhân bên ngân hàng hay hệ điều hành. **Không** giả định công nợ còn chưa thu chỉ vì push cũ hiển thị.


## 8. BANK-301 — Xử lý quá tải Gemini có giới hạn, giảm lỗi quét ảnh (12/11/2026)

**Bằng chứng:** ngày 12/11 hệ thống ghi 5 bill receipts, trong đó 3 bill cần hơn một lần scan; *tất cả đã thoát trạng thái failed*. Đây là số liệu về số lần đọc, **không được suy ra cả 3 đều lỗi 503** hay mọi ảnh được đọc đúng. Sự cố cụ thể lúc 17:42 của Cô Ngọc tt cho thấy `gemini_http_503` ở attempt 1, attempt 2 đọc được bill 10 triệu, sau đó Agribank #271 báo tiền vào lúc 17:49 và RPC tự thu ledger #852 đúng một lần. Không tạo bản ghi tài chính mới để thử.

**Nguồn gốc kỹ thuật có căn cứ:** primary `gemini-3.5-flash-lite`, fallback `gemini-3.5-flash` cùng key, trong bản v42 có đúng 2 lần gọi API mỗi OCR attempt; khi cả hai gặp HTTP 503, worker trả `amount_scan_gemini_http_503` và chờ cron SQL 5 phút. Theo tài liệu chính thức Google, 503 có thể do backend thiếu công suất tạm thời, **không** chứng minh ảnh sai hay quota hết (429 là lỗi khác).

**BANK-301 mã nguồn mới:**
- `requestBillGemini`: chỉ khi HTTP **502/503/504** (lỗi khả năng phục vụ tạm thời), gọi theo trình tự tối đa **3 lần**: (1) model nhẹ, (2) model dự phòng sau 800ms, (3) model nhẹ một lần nữa sau thêm 1400ms. Nếu bất kỳ lần nào thành công thì trả **đúng** `Response` cùng `usedModel`; không tự chọn ra số/ngày tốt hơn trong dữ liệu. Nếu cả ba thất bại, giữ mã `gemini_http_<status>` để cron tiếp tục retry có backoff.
- Không fallback/loop khi 400/401/403/404 (cấu hình/quyền/model), 429 (hạn mức), 408/500 (giữ cơ chế retry dài ở cron), hoặc network exception (không tự nhân số lần gửi khi kết nối không ổn).
- **Một** `AbortSignal` 30 giây của worker áp dụng cả 3 calls + hai delay + body JSON; có thể còn 0/1/2 calls khi hết thời gian. Không bao giờ lặp vô hạn.
- Log có cấu trúc `bank_bill_gemini_attempt`: `stage`, tên model, mã HTTP, milliseconds; lỗi network chỉ log loại lỗi. **Không log** API key, dữ liệu ảnh, OCR nội dung, nội dung chuyển khoản, tên khách. Để tránh thay đổi schema, không lưu thêm dữ liệu vào receipt.
- Không thay đổi điều kiện tự thu: nhận diện loại ảnh, ngày/giờ in trên bill, tên/stk người nhận, cảnh báo thiếu trường, chống trùng, đối chiếu ngân hàng độc lập, `chat_bank_app_collect` và lịch cron vẫn là chủ sở hữu quyết định cuối. Retry transport chỉ đọc cùng ảnh, không thu tiền.
- Kiểm thử mock (không gọi API thật): `tests/test_bank295_gemini_503_fallback_20261112.mjs` gồm 503→200, 503→503→200, 503→503→503, 502/504, 429/401, abort và xác minh không log nội dung nhạy cảm. Giữ verify V21 và Edge release test.
- Giới hạn: không thể ngăn hoàn toàn Google Gemini quá tải; việc thử lại giúp giảm số lần ảnh vào hàng đợi. Không tuyên bố kết quả lỗi 503 giảm bao nhiêu phần trăm khi chưa có dữ liệu production sau phát hành; không bật OCR nhiều lượt tự động *để so sánh số liệu tài chính*.

**Vận hành:** với ảnh lỗi 503 mà sau đó đã `received`, thông báo iOS cũ vẫn có thể nằm trong Notification Center; phải kiểm tra receipt+ledger hiện tại, không nhập thu lại. Nếu lỗi 503 vẫn nhiều sau phát hành, dùng log mỗi `stage` xác minh primary hay backup quá tải trước khi đổi model; không tự tăng chi phí hoặc tự tạo token.


## 9. BANK-302 — Thông báo AI lỗi/chờ ngân hàng không được hiểu là trạng thái cuối

**Trường hợp kiểm chứng:** 12/11/2026 bill 10 triệu của Cô Ngọc tt nhận `review:ai-retrying` lúc 17:42, `bill_waiting` 17:47, `matched:271` 17:49; cả ba đã được gửi qua Admin Push outbox `sent`, nhưng cùng receipt đã `received` và ledger #852. Trên iOS, thông báo lỗi cũ có thể vẫn tồn tại tại thời điểm xem sau đó. **Push là ảnh chụp trạng thái khi gửi, không phải nguồn xác nhận công nợ.**

- **Nguồn chuẩn** chỉ là receipt hiện tại + bank link + ledger do `chat_bank_app_collect` tạo. Không dùng push cũ để quyết định thu, không gửi bill lại hay thu thủ công khi chỉ thấy cảnh báo cũ.
- **Service Worker** khi nhận `kind=bank_reconciliation`, `bank_event_kind=matched` từ **event đã được backend kiểm chứng**, ưu tiên đóng các thông báo đang hiển thị với tag **chính xác** `bank:receipt:<receipt id>` và `bank:notice:<notification id>` trước khi xét liệu PWA đang hiển thị và có cần banner hay không. Không tìm/đóng mọi thông báo, không đụng Chat/missed call hoặc giao dịch khác.
- Nếu browser hỗ trợ `ServiceWorkerRegistration.getNotifications`, sử dụng API này để đóng các notification cũ của **cùng giao dịch**; API có thể không được hỗ trợ hoặc trả lỗi tùy iOS/Safari, nên xử lý **best-effort**, không ngăn thông báo `matched` mới. Không hứa có thể xóa mọi thông báo đã được hệ điều hành lưu/trình bày.
- **Foreground**: ngay cả khi iPhone PWA đang mở và banner hệ thống bị ẩn, SW gửi `ADMIN_PUSH_BANK_DIRTY` cho các client thuộc cùng SW. Admin Push Controller chuyển thành event `v21-bank-report-dirty`, và báo cáo ngân hàng **chỉ reload khi đang active**. Không trigger Chat sync, không thay số lượng tin chưa đọc, không tự mở Chat hay tăng badge.
- **Background**: matched notification được hiển thị bình thường và dùng tag `bank:notice:<id>` theo contract BANK-181, có thể thay bank-only note cũ. Không thay nội dung push/secret, không thêm thông báo mới hoặc giao dịch thật để kiểm thử.
- **Kiểm thử hồi quy mô phỏng**: review→bank-only→matched phải chỉ còn một thông báo đã thu; foreground matched dọn cảnh báo cũ dù không show banner; khi `getNotifications` lỗi vẫn show matched; Chat badge và Chat notification không mất; controller báo bank report dirty đúng một lần, không tự navigate contact.
- **Không thay đổi**: model Gemini, OCR/amount, ngày/giờ/STK, bank Plus ingest, SQL/RPC tài chính, RLS, quyền Push, cron. Chỉ sửa `sw.js` và `admin-push-controller.js`, là cập nhật Web/PWA qua Pages. E4 code/CI/Pages có thể kiểm chứng; E5 việc hệ điều hành iOS thực sự loại notification cũ cần ảnh hoặc thiết bị thực tế.

