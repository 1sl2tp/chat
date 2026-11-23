# CHAT-439 — Ô gõ 1–6 dòng ổn định khi bàn phím mobile mở

**Ngày 23/11/2026 · V21.72.78 · Owner: app.js autoGrow + mobile-chat-refresh.css**

## E0 · Nguyên nhân trong mã nguồn
- Giới hạn `composerTextHeightLimit` tính từ 32% chiều cao viewport và phần diện tích còn lại. Trước đó trả về số pixel **bất kỳ** (ví dụ 97px), khiến phần cuối dòng bị cắt và thay đổi chiều cao khi iOS đo lại VisualViewport.
- Giới hạn JavaScript và CSS đang cùng ở **144px**, trong khi 6 dòng của textarea mobile `40px + 5 * 22px = 150px`. Vì vậy chiều cao 6 dòng không thể hiển thị trọn.
- Cache chiều cao VisualViewport cập nhật khi thay đổi từ **8px**, quá sát với nhiễu thanh gợi ý/bàn phím; vị trí Composer vẫn phải đo live bằng `KeyboardInsetAdapter`.

## E1 · Mô hình cha/con
- **StageLayout**: chủ vị trí và trạng thái bàn phím.
- **KeyboardInsetAdapter**: chủ tọa độ cặp keyboard/Composer; giữ nguyên.
- **ComposerShell**: cha duy nhất của `editor`, các nút + / mic / gửi và tập tin trả lời.
- **Editor**: con duy nhất được phép tự tăng chiều cao (1–6 dòng); không thêm scroll owner và không đổi grid tracks.

## E2 · Sửa tại đúng owner
- `app.js`: giới hạn chiều cao luôn thuộc `40 + N*lineHeight`, với `N=0..5`. Vẫn giữ tối thiểu 128px vùng đọc khi viewport nhỏ; vượt số dòng phù hợp chuyển sang cuộn nội bộ textarea.
- `app.js`: ngưỡng bỏ qua dao động nhỏ `VisualViewport.height` cho riêng việc tính **giới hạn textarea** từ 8px lên 24px. Việc **đặt vị trí Composer** vẫn nhận mọi cập nhật viewport, nên không chờ thay đổi 24px mới dịch chuyển khỏi bàn phím.
- `mobile-chat-refresh.css`: giới hạn 150px cho sáu dòng trọn; không thêm padding, vùng, lớp/selector hay handler.
- Toàn bộ nút vẫn 44px, khoảng cách 8px, text input 16px, IME tiếng Việt giữ nguyên native composition.

## E3 · Kiểm thử và phát hành
- `tests/test_chat439_composer_line_height_cap_20261123.cjs` thực thi hàm thật trích từ source trong VM, kiểm từng viewport 180–1000px, 1–6 dòng, trường hợp thấp 220/310/380px, parity CSS, giữ logic IME và `KeyboardInsetAdapter`.
- Version `V21.72.78` đồng bộ giữa `app.js`, `index.source.html`, `sw.js`, canonical `index.html/version.json` sau CI.
- Xoay **public cache epoch**, không đụng session, tin nhắn, ảnh riêng, dữ liệu ngân hàng, OCR, outbox hay database.

## E4/E5 · Chưa thay thế bằng phép kiểm trên thiết bị thật
- iPhone Safari/PWA, Android Chrome/PWA: gõ nhanh, xuống dòng thủ công 1–6 dòng; copy/paste văn bản dài; xóa bớt; gõ tiếng Việt có dấu; chuyển hội thoại và trở lại; đóng/mở bàn phím; màn 320/375/390/430px và xoay ngang.
- Quan sát mép trên của Composer và khoảng cách phía trên bàn phím, không có rung 1–4px; bản thân khung hội thoại không nhảy theo thao tác gõ; tin đang xem khi cuộn lên không bị tự kéo cuối.
- CI đạt chỉ chứng minh regression source; nghiệm thu E4/E5 cần thiết bị thực.

