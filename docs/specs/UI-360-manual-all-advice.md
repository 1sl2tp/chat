# UI-360 · Tư vấn tất cả trong nhóm Báo Giá
- **Given:** Admin mở đúng hội thoại liên kết "Báo Giá - 0911479555"; các nhóm khác không có menu tư vấn này.
- **When:** chạm `+ → Tư vấn tất cả`, thấy bản xem trước duy nhất với ba phần Sữa / Hàng thường / Hàng U, mỗi phần lấy tối đa 5 mặt hàng đã được RPC tư vấn hiện có cho phép.
- **Then:** Admin xác nhận thì gửi đúng **một** tin qua owner Chat hiện tại với clientId ổn định (không gửi ba tin riêng, không gọi cron, không tuyên bố Zalo ACK ngay khi queue).
- **MUST-STAY:** ba mục tư vấn riêng giữ nguyên; preview RPC không gửi; đối tượng nhận phải khớp contact trong toàn bộ tiến trình; không có gửi thử, tăng polling, ghi nợ/đơn, sửa RLS, cron hay Supabase production.
- **Giới hạn:** Mục "Tất cả" tổng hợp **ba nhóm**, không phải xuất toàn bộ danh mục hàng hóa. Cần hiển thị tối đa 1400 ký tự để theo chuẩn bản xem trước; ưu tiên đủ 3 nhóm, giảm sản phẩm cuối khi dài.
- **Kiểm thử:** tests/test_ui360_all_group_advice_20261116.cjs cùng UI-250 và composer owner. E4 iPhone/Android, Render/Zalo ACK vẫn cần kiểm chứng thực tế sau Pages.
- **Rollback:** revert source JS, cache epoch và test; không có DB migration.
