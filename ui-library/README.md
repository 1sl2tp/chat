# THƯ VIỆN UI CHAT TẠP HÓA — BẢN ĐỒ GỐC

> Đọc cùng `README_MAINTENANCE.md`, `CURRENT_WORK.md`, Google Sheet Rule Chung (UI-01/02/03/04, F-20/21/44/45). Không dùng tài liệu này để thay đổi backend hoặc copy logic ra một Chat thứ hai.

## Phân biệt ba lớp

1. **Chat gốc**: `index.source.html`, `shell.js`, `app.js` và các module chức năng. `index.html` là bản build, không sửa thay `index.source.html`.
2. **Thư viện component**: `ui-library/index.html`. Mỗi entry có ID, khu vực Chat gốc, hình dạng, chức năng, primitive, selector/owner và link file. Preview dùng dữ liệu mẫu.
3. **Lab luồng**: `ui-library/chat-flows.html`, `ui-library/so-sanh.html`, `ui-library/chat-components.html`. Chỉ để đánh giá bố cục/trạng thái, không được gửi tin, mở cuộc gọi, tải media riêng tư hay tạo request nghiệp vụ.

## Kiểm kê nguồn — mốc 11/10/2026

- **247** mục kiểm kê, **12** khu vực, **70** họ primitive.
- Phạm vi theo khu vực:

| Khu vực | Số mục |
|---|---:|
| Ảnh & media | 45 |
| Tin nhắn | 37 |
| Composer | 31 |
| Zalo | 26 |
| Admin | 24 |
| Tài khoản | 21 |
| Danh bạ | 18 |
| Công việc | 15 |
| Gọi điện | 13 |
| Đăng nhập | 11 |
| Header | 4 |
| Hệ thống | 2 |

- Tệp được kiểm tra: `index.source.html`, `shell.js`, `app.js`, `mobile-chat-refresh.css`, `mobile-ui-polish.css`, `ui-icons.js`, `admin-composer-actions.js`, `message-forward.js`, `quote-client.js`, `call-invite-client.js`, `zalo-admin-link.js`, `contact-directory-admin.js`, `work-customer-summary.js`, `chat-image-orientation.js`.
- Kiểm thử `tests/test_ui_library_source_map.py` so selector/owner với mã nguồn; `tests/test_ui_library_rendered_previews.cjs` bảo đảm mỗi mục có preview, không rơi về mock chung. Hai bài test chạy trong workflow **Verify V21**.

## Họ primitive, KHÔNG đồng nghĩa viết lại runtime

- `Avatar`: header, danh bạ, hồ sơ, chuyển tiếp và liên kết. Fallback chữ riêng, font-size/line-height riêng, không thừa hưởng padding tab.
- `IconButton` / `MessageActionButton` / `ViewerControl`: hit area và trạng thái rõ; **hành động thật** phải dùng owner của Chat hiện tại.
- `MessageBubble` / `MessageActions`: A (self) căn phải, B (remote) căn trái; nhóm action sắp đối xứng gần nội dung.
- `ImageTile` / `ImageGallery` / `ImageViewer`: ảnh đơn contain, album thumbnail có thể cover, viewer theo một owner; xoay ảnh có module `chat-image-orientation.js`.
- `AudioPlayer` / `RecordingSurface` / `AudioDraft`: ghi âm đang thu khác ghi âm chờ gửi và ghi âm trong tin.
- `AttachmentTray`, `FilePicker`, `ComposerBar`: một thao tác chọn tệp, một đường gửi, không tự upload media ở preview UI.
- `ContactRow`, `WorkRow`, `WorkTable`: giữ scroll, vị trí và alignment cột số.
- `AuthForm`, `ProfileDialog`, `BusinessDialog`, `ForwardDialog`, `ActionMenu`: các lớp phủ khác nhau, có focus owner và chính sách quyền.
- `CallStatus`, `CallControl`, `UnreadIndicator`, `ActionStatus`: feedback theo trạng thái của từng owner; không đồng bộ DB để đổi màu.

## Chống lệch về sau

1. Đọc rule bảng tính và file maintenance trước khi sửa. Xác định **P0 Platform → P1 Shell → P2 Workspace → P3 Component → P4 Control**.
2. Xem source thật; ghi component/selector/owner trong catalog. Phân loại theo khu vực, hình dạng, chức năng, primitive. Đừng dựng lại cùng một chức năng trong thư viện demo.
3. Nếu cùng hình dạng/chức năng thì dùng **một contract primitive**, biến thể bằng props/trạng thái. Không dùng CSS global `.tabs span` hoặc `transition:all` chữa lỗi.
4. Preview UI không gọi Auth/Supabase/Storage/Realtime/Render hoặc dữ liệu khách. Input/checkbox trong demo chỉ đổi trạng thái local.
5. Bổ sung/chỉnh preview, chạy hai test nguồn/preview và **Verify V21**, sau đó đợi **Deploy Chat Pages**. Nghiệm thu Safari/PWA thực tế vẫn là bước riêng.
6. UI-only mặc định **0 API/RPC/Edge/DB/polling/log delta**. Không nhân sự kiện gửi hoặc upload.
7. Kết quả chỉ là **catalog và demo tĩnh**, không tự suy luận rằng 247 mục đã được tái cấu trúc thành 70 runtime component dùng chung.

## Giới hạn cần ghi đúng

- Viewer hiện có lọc Tất cả/A/B/Album, zoom, xoay, lưu/chia sẻ **ảnh hiện tại**. Chọn đồng thời nhiều ảnh **đã gửi** trong Viewer mới là đề xuất, chưa có runtime.
- Chọn nhiều ảnh **trước khi gửi** thuộc `#upload-photos` và `#attachmentTray`, hiện đã có trong Chat.
- `message-forward.js` giới hạn chuyển tiếp cho Admin và tin thỏa điều kiện; native file share cần capability từ trình duyệt.
- `MESSAGE_FEATURES.important=false` ở `app.js`: không mô tả nút đánh dấu quan trọng là chức năng đang bật.
- Không đưa ảnh, ghi âm, số điện thoại, tài khoản khách thật lên một trang demo công khai.
- Bộ catalog được kiểm tra từ **mã nguồn**, chưa phải xác nhận trực tiếp tất cả trạng thái trong Safari/PWA authenticated. Không đánh dấu **PROD VERIFIED** chỉ vì CI thành công.

## Link công cụ

- [Danh mục theo hình dạng/chức năng/primitive/khu vực](./index.html)
- [Luồng A/B, chia sẻ, viewer và chọn nhiều ảnh](./chat-flows.html)
- [So sánh ChatGPT ↔ Chat Tạp Hóa](./so-sanh.html)
- [Lab tin và Composer](./chat-components.html)
