# NCC-003 — Nhập phiếu thủ công và chỉ định tài khoản quét ảnh

**Ngày:** 2026-11-14 (Asia/Ho_Chi_Minh)  
**Repository:** `1sl2tp/chat` — branch `main`  
**Owner nghiệp vụ:** `ncc-invoice-admin.js`, `supabase/functions/v21-ncc-invoice/index.ts`, migration `20261114061000_chat_ncc_supplier_invoice_intake.sql`  
**Trạng thái:** SOURCE READY / DB+EDGE ACTIVATION PENDING. Không tự sửa DB production hoặc deploy thủ công.

## Given / When / Then

1. **Admin nhập phiếu bằng tay:** Given đã xác thực Admin, When nhập ngày trên phiếu, NCC, mã phiếu tùy chọn, tên mặt hàng, SL, giá VND và tổng phiếu, Then máy chủ kiểm số học toàn bộ dòng, lưu phiếu `origin=manual` riêng trong hàng đối chiếu; không cập nhật giá vốn ngay.
2. **Admin tải ảnh từ máy:** Given ảnh JPEG/PNG/WebP tối đa 4 MB, When chọn NCC hoặc để trống, Then dịch vụ lưu ảnh nguyên bản, SHA-256 chống trùng và tạo hồ sơ chờ OCR; không gửi Chat/Zalo.
3. **Admin gán người quét ảnh:** Given tài khoản Chat bất kỳ ở `v21_accounts` có `role=user`, When Admin cấp quyền, Then chỉ ảnh MỚI từ tài khoản đó được đưa vào hàng đợi NCC, không đổi `contact_group` hoặc trạng thái khách hàng. When thu hồi, ảnh mới về sau không còn tạo hồ sơ NCC (trừ khi tài khoản vẫn thuộc nhóm `ncc`).
4. **Ghép sản phẩm:** Given ảnh hoặc phiếu đánh máy đã được kiểm tra số học và ngày, When không có mã sản phẩm trùng chắc chắn/thiếu đơn vị/sai lệch giá lớn, Then yêu cầu chọn mã sản phẩm và hệ số quy đổi thủ công; không tự tạo mã hoặc ghi đè giá vốn.
5. **Chống trùng:** Given cùng account+ngày+mã phiếu hoặc cùng hash ảnh, hoặc phiếu thủ công có dấu vân tay nội dung trùng, When có lần nhận thứ hai, Then giữ nguyên phiếu cũ, báo trùng/không tạo thêm bản ghi hợp lệ.
6. **Quyền:** End-user không được truy cập Admin API, Edge `scanner_assign`/`manual_create`/quản lý alias. Webhook chỉ được phép `scan` với khóa riêng. DB tables RLS bật và bị thu hồi quyền `anon/authenticated`.

## MUST-STAY

- Không ghi mới/sửa `taphoa_products.input_price_vnd`, `taphoa_debt_ledger`, đơn khách, thu ngân hàng, bản ghi Zalo.
- Không thêm cron/interval/polling. Chat Realtime và bill ngân hàng giữ nguyên luồng.
- Để bảo vệ dữ liệu thực, không gửi ảnh test cho khách, không tạo phiếu mẫu trong production.
- Không tự triển khai SQL migration/Edge thủ công; GitHub source build không đồng nghĩa production DB đã sẵn sàng.

## Kiểm thử bằng chứng

- `tests/test_ncc001_supplier_invoice_20261114.mjs`: ngày, số học, tên/đơn vị, alias và giá bất thường.
- `tests/test_ncc001_integration_20261114.cjs`: intake RLS, parser, CRUD, không phát sinh ghi giá.
- `tests/test_ncc002_manual_invoice_20261114.cjs`: ảnh thêm thủ công và gán nhóm NCC.
- `tests/test_ncc003_manual_typed_and_scan_users_20261114.cjs`: form đánh máy, quyền gán/thu hồi, unique indexes, không ghi ngân hàng.
- `tools/verify_current.py` chạy các test trên cùng CI chung. **E0–E2:** có source và unit contract; **E3:** chờ verify cho HEAD; **E4–E5:** chưa xác minh runtime Supabase hoặc iPhone PWA.

## Triển khai và rollback

Để hoạt động thực tế cần apply migration theo quy trình được phê duyệt, triển khai `v21-ncc-invoice`, cấu hình `NCC_INVOICE_WEBHOOK_SECRET` và Vault webhook tương ứng, rồi phát hành `v21-zalo-admin` có `NCC_INVOICE_ENABLED=true`. Kiểm tra 1 tài khoản test không gửi thông báo thật, 1 ảnh phiếu thử tại môi trường được phép, rồi mới bật cho NCC. Khôi phục bằng tắt cờ phân nhóm/gán quyền/quét; giữ nguyên lịch sử để audit, không xóa dữ liệu thật.
