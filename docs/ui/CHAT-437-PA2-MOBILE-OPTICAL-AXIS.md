# CHAT-437 · PA2: cân lề hội thoại và nút bo tròn trên màn hẹp

**Ngày 23/11/2026 | Trạng thái:** đã sửa source và test, chờ CI/Pages E2–E3, chưa nghiệm thu thiết bị E4–E5.

## E0 — Hai ảnh 500px do người dùng cung cấp

- Ảnh danh bạ: Top 1 tab Trò chuyện/Công việc, tìm kiếm 44px, filter 44px; 11 hàng khách gần 68–70px, khoảng dưới màn ít.
- Ảnh hội thoại: ảnh bill bên nhận xấp xỉ 260px nằm đầu dòng; bên gửi là một pill bo tròn lớn sát phía phải; nội dung nhận và nội dung gửi **không nên căn giữa từng tin** vì sẽ mất ý nghĩa A/B.
- Vùng gõ: button +, capsule input/mic, button send có khoảng cách hình học khoảng 4px; chữ nằm gần phần cong mép trái capsule.
- Vòng CHAT-436 **chỉ** đổi desktop từ 64rem trở lên (fine pointer). Với viewport hẹp, không thể quan sát thay đổi đó; đây là lý do người dùng báo chưa thấy khác.

## E1 — Thay đúng owner, không sinh selector vá

- `ui-foundation.css`: gốc token `--ui-chat-layout-rail:12px`, `--ui-chat-message-rail:14px` (**12 + 2px bù góc bo**), `--ui-composer-action-gap:8px`. 44px tap vẫn giữ.
- `mobile-chat-refresh.css`: `#messageWindow` dùng lề trái/phải 14px có safe-area; `#editorWrap` bù 10px trước placeholder để chữ cách hình tròn hợp lý; Composer dùng đúng token gap 8px. Không thay vùng media/bubble riêng, không thêm chiều cao, scroll hay JS.
- `mobile-ui-polish.css` owner `CHAT-388`: hàng danh bạ/hitbox 68 → 64px; list inset 8 → 10px để avatar không sát góc bo; giữ 40px avatar, 58px time rail, preview một dòng, 44px mục tiêu thao tác.
- `chatgpt-ab-conversation.css` giữ nguyên: A một bubble, B chữ không hộp; ảnh/media vẫn thuộc người gửi, bảng tổng hợp có vùng giữa riêng; **không căn giữa các ảnh chứng từ hay từng bong bóng**.
- Public PWA epoch đổi; không clear IDB/session/draft/outbox. App release marker V21.72.76.
- Test CHAT-437 trong Verify V21, cập nhật CHAT-435 theo hình học được phê duyệt, không bỏ kiểm thử cũ.

## E2–E5

CI cần qua build canonical, test CHAT-338/388/395/398/414/421/432/435/437 và toàn bộ Verify V21. Phát hành bằng GitHub Pages tự động nếu xanh; xác nhận `version.json` với `index.html`. E4/E5 còn cần so ảnh desktop Chrome hẹp 500px, iPhone 320/375/390, Android Chrome/PWA, ngang/dọc, bàn phím gõ 1/4/6 dòng, ảnh bill, bubble một/nhiều dòng, phản hồi lỗi gửi.

**Không thay:** nội dung chứng từ, OCR, thu tiền, Zalo, Supabase, thông báo, tin thật hoặc phân quyền. Rollback: revert commit UI và epoch cache công khai.
