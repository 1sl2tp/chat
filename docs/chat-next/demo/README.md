> **Bắt buộc trước khi sửa demo:** đọc [`../UI_UX_RULES.md`](../UI_UX_RULES.md) và [`../VERSIONING.md`](../VERSIONING.md). Thiết kế mới 100%, chưa kết nối dữ liệu thật; sửa theo cha → con L0–L5, không CSS/JS chắp vá. Kiểm thử đạt rồi mới công bố nâng version.

# CHAT NEXT — Bản demo trực tuyến (không production)

- Mẫu HTML chính: [index.html](./index.html).
- **Demo GitHub Pages trực tiếp (đã xuất bản):** https://1sl2tp.github.io/songoku/demos/chat-next/
- **Bộ 3 mẫu hóa đơn GitHub Pages:** https://1sl2tp.github.io/songoku/demos/chat-next/invoice.html
- Hai liên kết trên được triển khai bằng workflow Pages của `1sl2tp/songoku`, PR #29, [run #44249933528](https://github.com/1sl2tp/songoku/actions/runs/44249933528) **SUCCESS**, commit `40cf4f74dc2d6da187ab6625387b96c756f82634`. Đây là **bản sao tĩnh** của Chat Next demo, chỉ chứa dữ liệu mẫu; nếu chỉnh bản gốc sau này phải đồng bộ lại chủ động qua một PR riêng. Không tự đồng bộ/backend.

- **Quản lý 3 mẫu hóa đơn:** [invoice.html](./invoice.html) — đen trắng chuẩn bản in, xanh lá, xanh than; một dữ liệu mẫu và một phép tính cho cả ba mẫu.
- **Xem trực tiếp bộ mẫu:** https://raw.githack.com/1sl2tp/chat/43679275013d7f92925b70d20f173a0b80bb56bf/docs/chat-next/demo/invoice.html
- Xem trên trình duyệt qua bộ hiển thị GitHub công khai: https://raw.githack.com/1sl2tp/chat/43679275013d7f92925b70d20f173a0b80bb56bf/docs/chat-next/demo/index.html
- Phương án dự phòng: https://htmlpreview.github.io/?https://raw.githubusercontent.com/1sl2tp/chat/43679275013d7f92925b70d20f173a0b80bb56bf/docs/chat-next/demo/index.html
- Nguồn mã chính sách: PR #329, nhánh `design/chat-next-ux-20261118`.

**Đây là nguyên mẫu độc lập, KHÔNG phải ứng dụng đang chạy.** Nội dung tên khách, đơn hàng, thu tiền, danh bạ là dữ liệu giả lập. Nút gửi chỉ chèn tin nháp vào DOM đang mở; làm mới trang sẽ mất tin nháp. Không tải token/API/cookie/private data, không đăng nhập, không gửi tin, không thực hiện thu tiền, không đăng ký service worker, không thay Supabase/GitHub Pages production.

## Chức năng cần người dùng nghiệm thu

1. iPhone Safari/PWA, Android Chrome, desktop và iPad: mở link, xem danh bạ 1–2 dòng, thời gian bên phải không chồng tên.
2. Tìm tên/nội dung, lọc Tất cả/Chưa đọc/Nhóm/Khách hàng, mở từng liên hệ, nút quay lại trên màn nhỏ.
3. Trong hội thoại: đọc tin theo ngày, xem phiếu lấy hàng có số lượng và ghi chú, nhập tin nháp mà **không gửi thật**.
4. Mở Công việc: Đơn hàng, Thanh toán, Báo giá, Phiếu lấy hàng; từ thẻ **Đơn hàng → Quản lý 3 mẫu hóa đơn**. Chọn mẫu 01/02/03, kiểm tra cột số lượng × đơn giá = thành tiền, thử lệnh In (không in thật nếu không xác nhận hộp thoại in của thiết bị).
5. Chuyển sáng/tối, bàn phím hiện/ẩn, xoay máy, phóng to ảnh nếu có ảnh sau này, scrollbar không rung/không che ô gõ.
6. Góp ý bố cục/font/cỡ nút/màu trước khi đưa vào code runtime.

**Giới hạn:** Đây là môi trường mô phỏng UI, không phải E4/E5 nghiệm thu trên chính web app, không chứng minh API/call/realtime/OTP/zalo hoạt động. Demo không được phép dùng làm chứng cứ sản xuất. `index.source.html` và bản thử `?chatnext=1` trong Draft PR là nhánh riêng, tuyệt đối không tự merge vào `main` / deploy PWA.
