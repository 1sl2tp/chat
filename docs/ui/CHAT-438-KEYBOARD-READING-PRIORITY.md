# CHAT-438 — Ưu tiên vùng hội thoại khi bàn phím mobile mở

## E0 · Hiện trạng, 23/11/2026

Trên mobile, ở hội thoại khách, thanh `#chatQuickActions` có `min-height:52px` và vẫn chiếm chỗ trong lúc `#stageLayout[data-keyboard-open="true"]` báo phần mềm nhập liệu đã mở. Ở màn iPhone hẹp, phần đọc nội dung bị cắt thêm một hàng; hệ thống đã có đầy đủ shell/top1/quickActions/thread/composer và không nên thêm owner.

## E1 · Quy tắc cha/con từ 2027

- `stageLayout` là cha trạng thái bàn phím, `chatQuickActions` là con thao tác **phụ**, `threadContent` và `composerShell` là con thao tác **chính**. Khi native keyboard mở, ưu tiên phần đọc và nhập.
- Chỉ làm gọn thanh thứ cấp khi `data-keyboard-open=true` và ở cuộc hội thoại mobile thường; không thay quyền, chức năng, nhãn, nút hoặc DOM.
- Khi bàn phím đóng, CSS mặc định của thanh phục hồi, không cần sự kiện JavaScript thứ hai.
- Không áp dụng với `data-bank-report-active=true`, desktop hoặc khi chưa mở bàn phím.

## E2 · Thực hiện

- Thay duy nhất trong owner `mobile-ui-polish.css` (ngay trong block quy định `chatQuickActions`), không chồng cascade ở cuối và không tạo file CSS mới.
- Giữ nguyên `keyboard-inset-core`, `shell-form-viewport-policy`, `ScrollRoot`, các dấu an toàn tai thỏ, tin gửi/nhận, media và công việc.
- Phiên bản public **V21.72.77** ở `index.source.html` và `sw.js`, epoch cache **public shell** được xoay. Giữ private drafts, auth, IDB và outbox.

## E3 · Kiểm tra

- `tests/test_chat438_keyboard_content_priority_20261123.cjs`: kiểm tra trạng thái mở/đóng theo selector, độ cao thanh thường 52px, các DOM owner, version/epoch, không thêm scroll/height/position controller.
- Toàn bộ Verify V21 và CHAT-437 phải xanh; public build canonical của GitHub Actions phải đồng bộ `index.html` và `version.json`.

## E4/E5 · Phạm vi nghiệm thu thực

- Kịch bản cần xem: 320/375/390/430px trên iPhone Safari/PWA và Android Chrome/PWA; mở một hội thoại khách có bốn thao tác nhanh, focus ô gõ 1/4/6 dòng, cuộn lên/xuống, đóng bàn phím kiểm tra thanh khôi phục, thanh toán không được kích hoạt.
- Không khẳng định đã nghiệm thu thiết bị thực chỉ vì test source xanh.
- Không gửi tin nhắn thật, không phát thông báo thật, không thay Supabase, không ghi thu.

