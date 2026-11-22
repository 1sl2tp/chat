# CHAT-433 · Focus ô gõ theo thư viện cha 2027/V46

**Nguồn:** https://1sl2tp.github.io/2027/#masterLibraryV46 và RULE 12.12. CHAT/TAPHOA cũ chỉ cung cấp bối cảnh nghiệp vụ; UI/UX lấy nguyên tắc từ thư viện cha và nguồn GitHub công khai, không nhúng CSS bên ngoài.

**Vấn đề thấy trong mã:** CHAT-414 vẽ pill trên #composerShell::before, trong khi mobile-chat-refresh.css / mobile-ui-polish.css đặt focus trên viền #composerShell. CHAT-414 lại đặt viền shell trong suốt, có thể làm tín hiệu focus trong textarea không còn thấy trên mặt pill. Đây là suy luận từ source, chưa xác nhận trên thiết bị.

**Thay đổi nhỏ đúng owner:** Chỉ sửa chatgpt-ab-conversation.css: khi #editor:focus-visible, đổi màu border và box-shadow của đúng ::before. Loại trừ năm trạng thái audio. High contrast dùng outline Highlight. Không thay kích thước, grid, keyboard policy, scroll, media, handlers hoặc message rendering; không cài dependency.

**Test:** node tests/test_chat433_v46_composer_focus_20261123.cjs, cùng Verify V21 CI. Sau khi CI xanh mới merge/phát hành theo Pages tự động; không deploy thủ công. E4/E5 cần Safari/Chrome/PWA iPhone/Android, focus, nhiều dòng, audio, IME, bàn phím và cuộn lịch sử.

**Rollback:** revert thay đổi trong PR. Không xóa IndexedDB/cache riêng tư. Không có DB/RPC/network/polling/tin nhắn thật được tạo.
