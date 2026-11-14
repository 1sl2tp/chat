# NCC-005 — nghiệm thu nhận ảnh, OCR và điều kiện kích hoạt

**Ngày xác minh:** 2026-11-14 (giờ Việt Nam)  
**Dự án:** `1sl2tp/chat` — Supabase project canonical `vtqhbhrkdxirqeqkgylo`  
**Trạng thái:** SOURCE TESTED / PRODUCTION NOT YET ENABLED  
**Phạm vi:** Phiếu NCC trong Công việc, **không** liên quan bill ngân hàng.

## Kết quả kiểm tra CHỈ ĐỌC trên Supabase

| Điều kiện | Kết quả 14/11/2026 |
| --- | --- |
| Storage `v21-media` | READY |
| Extension `pg_net` | READY |
| Extension Vault | READY |
| `v21_accounts.contact_group` cho phép `ncc` | BLOCKED |
| `chat_ncc_invoices`, `chat_ncc_invoice_lines`, `chat_ncc_product_aliases`, `chat_ncc_scanner_assignments` | BLOCKED |
| RLS bảng NCC | BLOCKED (bảng chưa có) |
| Trigger nhận media `chat_ncc_media_received` | BLOCKED |
| Trigger đánh thức OCR `chat_ncc_auto_scan_on_receipt` | BLOCKED |
| Edge Function `v21-ncc-invoice` | NOT DEPLOYED |
| Edge `v21-zalo-admin` hỗ trợ cờ `ncc_enabled` | BLOCKED — Edge đã deploy vẫn trả `directory_groups` không có trường `ncc_enabled` và không nhận `NCC_INVOICE_ENABLED`; source repo mới hơn runtime |

**Cách đo lại:** Chạy `supabase/ncc-release-preflight-readonly.sql` qua kênh SQL chỉ đọc. Kiểm tra Edge Function qua danh sách function của Supabase. Không truy vấn giá trị bí mật.

## Những gì đã sửa trong mã

- UI NCC: chọn ảnh, xem trước, gửi ảnh, nhận bảng hàng, xem chi tiết/ghép sản phẩm, không tự ghi giá vốn.
- Media `kind='image'` hoặc `kind='photo'` đều được chấp nhận sau khi có chứng cứ sender NCC và metadata MIME/size.
- Hai tác nhân gửi OCR (webhook tự chạy và nút Admin) cùng gặp một hồ sơ: chỉ một tác nhân claim được `status=processing`; tác nhân còn lại nhận trạng thái bền vững, không sinh lỗi giả hoặc quét trùng.
- `sendPhoto` thực hiện `manual_upload → scan → detail`, theo dõi trạng thái `pending/processing` trong tối đa 16 lượt ngắn sau thao tác gửi. Dừng ngay khi tài khoản/phiên đăng nhập thay đổi, không cập nhật bảng từ phản hồi cũ.
- Phiếu đánh máy không có ảnh không được đi qua OCR; có đường đối chiếu thủ công riêng.
- Không gọi bất kỳ hàm ghi công nợ, thu ngân hàng, giá vốn hoặc gửi thông báo Chat/Zalo nào.

## Trình tự mở tính năng đúng và có kiểm soát

1. **Môi trường thử nghiệm hoặc quy trình phê duyệt schema**: kiểm tra hai migration nguồn `20261114061000_chat_ncc_supplier_invoice_intake.sql` và `20261114062500_chat_ncc_event_driven_ocr.sql`. Đối chiếu thực tế constraint, RLS, trigger, extension và media, tránh `db push` đẩy kèm các migration không liên quan.
2. Kiểm tra backend `supabase/functions/v21-ncc-invoice/index.ts`, unit contract và auth Admin; triển khai qua pipeline đã duyệt, **không deploy thủ công production**.
3. Đặt secret `GEMINI_API_KEY`, `NCC_INVOICE_WEBHOOK_SECRET` và Vault `ncc_invoice_webhook_secret` phù hợp; không đưa secret ra log hoặc client.
4. Chạy lại SQL preflight chỉ đọc; xác minh Edge `v21-ncc-invoice` đang ACTIVE đúng project, thử token Admin và từ chối user thường. **Phát hành có kiểm soát bản `v21-zalo-admin` đã hỗ trợ `ncc_enabled`**, vì Edge đang chạy tại thời điểm điều tra còn là bản cũ (không nhận nhóm `ncc`).
5. Chỉ bật `NCC_INVOICE_ENABLED=true` khi toàn bộ gate đạt và fixture OCR an toàn qua; UI sẽ nhận qua `v21-zalo-admin.directory_groups`.
6. Trên môi trường kiểm thử: một ảnh phiếu nhập có bảng, một ảnh không phải phiếu, một ảnh trùng, một ảnh mờ, một phiếu thiếu tổng, một tài khoản không thuộc NCC, Admin mở lại kết quả đang xử lý. Không gửi bất kỳ tin nhắn/thu tiền test cho khách thật.
7. Nghiệm thu Safari/PWA và Web: chọn ảnh → ảnh xem trước → gửi → tên/SL/đơn giá hiển thị cùng bảng → ghép sản phẩm sau kiểm tra; không tự ghi giá vốn. Chỉ ghi **E5 PASS** sau bằng chứng thiết bị/DB/Edge đầy đủ.

## Rollback

Tắt capability NCC, ngừng webhook OCR, không xóa chứng từ thật hoặc tự động quay lại giá cũ. Các tính năng Trò chuyện, chuyển khoản, bill ngân hàng và lịch Chat/Zalo không bị đụng đến.

**Guardrail:** Không tự sửa database production, không deploy thủ công, không chạy thử bằng hóa đơn hoặc tin nhắn của khách thật. Hệ thống không được hiển thị “Đã kích hoạt” khi chỉ UI qua CI mà backend chưa có.
