# CHAT-NEXT-014 — Khung thiết kế phân cấp theo ChatGPT

Ngày: 18/11/2026. Phạm vi: HTML demo của Chat Next trên nhánh thiết kế và bản sao tĩnh Songoku Pages. Không phải mã Chat/TAPHOA production.

## Quyết định kiến trúc

**ChatGPT là chuẩn chính cho khung, thứ bậc và trục đọc/nhập**. WhatsApp chỉ làm tham chiếu tổ chức Inbox; Apple Human Interface Guidelines và Android Accessibility dùng để kiểm tra safe-area và vùng chạm. Không trộn phong cách ba sản phẩm ngang hàng.

Khác với các vòng chỉ tinh chỉnh nút/chữ, V14 **thay đổi DOM** để các dải header, tin, composer và note đều có một khung nội dung `chat-width` chung. Tất cả số đo do nhóm token `--frame-*` trong một chủ sở hữu `CHAT-NEXT-014` quyết định. CSS cũ giữ màu/chữ/hình; không được tùy ý thêm lề ngang vào từng dải.

## Bậc cấu trúc

| Cấp | Vùng sở hữu | Quy tắc |
|---|---|---|
| L0 | `.screen` | Một viewport 100dvh; safe-area và `VisualViewport` của demo xử lý bàn phím, không có bộ cuộn gốc bổ sung |
| L1 | `.app` | Desktop gồm rail, Inbox, chat, context; touch/mobile một pane; Work là pane chính riêng; các cột qua token chung |
| L2 | `.inbox`, `.chat`, `.work` | Chỉ vùng danh bạ, conversation và Work tự cuộn; vùng cha `min-width:0;min-height:0` |
| L3 | `.chat-header`, `.conversation`, `.composer`, `.chat-note` | 4 dải dọc không chồng nhau; `.chat` dùng grid rows `72px / minmax(0,1fr) / auto / auto` (touch header 64px) |
| L4 | `.chat-width` | **Cùng trục ngang** cho cả 4 dải, `width:min(760px, 100% - 2 × axis)` và `margin-inline:auto`; axis 16px desktop, 12px touch, 10px màn rất hẹp |
| L5 | `.composer-inner`, `.contact`, `.iconbtn` | Composer 3 cột `48 / minmax(0,1fr) / 48` với gap 8px; liên hệ `44 / minmax(0,1fr) / 64` theo avatar/tên/giờ. Khi ≤360px nút composer 44/gap6; textarea 16px, line height 24px, max text height 120px |

## Trục Inbox riêng, không lẫn với Chat

- `--frame-inbox-axis=16px` desktop hoặc 12px touch.
- Inbox header và Filters đều căn theo axis.
- `.contacts` dùng padding `axis - 8px`; từng `.contact` dùng padding nội bộ 8px. Kết quả: **mép avatar**, chữ tiêu đề Inbox, ô search và nút lọc có cùng mốc bắt đầu; mép hàng bên phải giữ 8px cân.
- Timestamp là 64px cố định, tên và dòng xem trước dùng `minmax(0,1fr)`, không đè vào vùng giờ.

## L1 thông số theo thiết bị

| Nhóm màn | Hệ cột và chiều cao | Ghi chú |
|---|---|---|
| Desktop ≥1400px, chuột fine | Rail 68px · Inbox clamp(292px,25vw,332px) · Chat 1fr · Context 252px | Chat input và messages được giới hạn trong cùng 760px |
| Desktop 901–1399px | Rail 68px · Inbox clamp(292px,25vw,332px) · Chat 1fr | Context ẩn để không bóp composer |
| Laptop 781–900px, chuột fine | Rail 68px · Inbox 292px · Chat 1fr | Full height app; không ép min-height 570px |
| ≤780px **hoặc** mọi touch/coarse | Một pane Inbox hoặc Chat; bottom nav có 66px + safe-area | Không tự kích hoạt bố cục desktop khi iPad xoay ngang |

## L5 composer / nội dung nhỏ

- Form là dải toàn chiều rộng (viền trên ở L3), bên trong **duy nhất** `.chat-width.composer-inner` dùng `display:grid`.
- Nút `+` và Send cùng vuông 48px (trên ≤360px: 44px); ô textarea chiếm diện tích giữa, không dùng `position:absolute` hay `width:calc(100vw - ...)` tùy trang.
- Vỏ ô nhập có min-height 48px, padding 11px dọc và 14px ngang; input text cao một dòng 24px và tự mở rộng đến 120px; các nút giữ align-items:end.
- Viền ô nhập, placeholder, focus và icon không vượt khỏi dải composer; phần note dùng **cùng trục L4** thay vì canh giữa tùy ý.
- Tin nhắn, media mẫu và đơn hàng nằm trong `.message-stream`, không trực tiếp thay thế `.conversation` — vì `.conversation` là chủ scroll.

## Kiểm tra trục bằng mắt và số đo trong trình duyệt

Link demo bình thường: https://1sl2tp.github.io/songoku/demos/chat-next/

Link **kiểm trục trong bản demo**: https://1sl2tp.github.io/songoku/demos/chat-next/?geometry=1#chat/lan

- Khi có `?geometry=1`: nội dung demo được vẽ đường viền các trục; bảng tối ở góc trên hiển thị left/right thực tế từ `getBoundingClientRect` (header/message/composer/note); độ lệch chấp nhận mục tiêu ≤1px.
- Trang Inbox: chọn `#inbox` sẽ đo trục tiêu đề/filter/hàng liên hệ; chương trình không định nghĩa trục bằng phỏng đoán đơn thuần.
- Bảng này **chỉ chạy trong demo tĩnh ở chế độ chủ động bật**, không chạy ở `chat.taphoa.xyz`, không gửi log/mạng, không lưu dữ liệu.
- Nếu gặp `CẦN KIỂM TRA SCROLLBAR` trên desktop, đo lại browser/scrollbar thực; đừng tuyên bố E4 PASS dựa riêng vào test token.

## Kiểm thử và cổng nghiệm thu

- E0: xác minh nguồn tham chiếu: [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [OpenAI ChatGPT notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).
- E1: HTML DOM thực dùng 4 `.chat-width`; CSS `CHAT-NEXT-014` là chủ sở hữu hình học.
- E2: `tests/test_chatnext_interactive_demo_20261118.cjs` kiểm DOM/render, text baseline, bảng độ rộng 320–1920. Chỉ là contract và phép tính dự kiến, chưa phải đo render.
- E3: Verify Chat + Songoku, Github Pages deploy, report bằng chứng SHA/Actions.
- E4/E5: **Chưa xác nhận** screenshot iPhone/Android/iPad/Desktop và số đo rect qua trình duyệt thật; cần mở link Geometry trên từng thiết bị, gồm khi bàn phím mở/đóng, xoay ngang, tin dài, ảnh phóng lớn.
- Rollback: revert phần HTML wrapper + `CHAT-NEXT-014` và test; không động production, Supabase, Zalo, dữ liệu người dùng.

## Quy tắc chống tái phát

1. Không dùng các padding ngang kiểu `7px`, `13px`, `5%` cho một thành phần khi nó đã nằm trong `chat-width`.
2. Không thêm panel ngang hoặc scroll owner vào chat nếu chưa chỉ ra cấp L0–L5 tương ứng.
3. Chỉ sửa token `--frame-*` ở đúng chủ sở hữu, cập nhật metric test + bảng trên khi đổi kích thước.
4. Không tuyên bố “hoàn thiện theo hãng lớn” cho đến khi có bằng chứng số đo trục và duyệt trên thiết bị thật.
