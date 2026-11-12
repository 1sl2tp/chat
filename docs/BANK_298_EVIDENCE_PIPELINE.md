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
