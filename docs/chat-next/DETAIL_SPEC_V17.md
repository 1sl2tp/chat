# CHAT-NEXT-017 — Hệ chi tiết giao diện thống nhất

Ngày: 18/11/2026 (Việt Nam). Kênh: demo thiết kế, **không** phải Chat V21/PWA/APK production.

## Mục tiêu và chuẩn tham chiếu

ChatGPT là chuẩn chính cho thứ bậc chữ và ô nhập gọn, WhatsApp chỉ tham chiếu bố cục Inbox, Apple/Android tham chiếu kích thước vùng chạm. Không sao chép giao diện/trademark, không thêm bộ UI runtime mới.

**Given**: các phần tử nhỏ được viết bởi nhiều lớp CSS từng vòng nên font chữ 12–14.5px, góc bo 13–19px, icon 17–22px, padding 3–14px chưa theo một trục nội bộ.

**When**: đổi giữa Inbox, Conversation, Work; gõ nhiều dòng; mở hộp thao tác; đổi sáng/tối; xem màn rộng 320/360/375/390/414/430/780/1024/1440/1920.

**Then**: một lớp `CHAT-NEXT-017` định nghĩa token cho chữ, icon, border/radius và nhịp 4px. Trục L4 của V14 và kích thước composer V16 không đổi. Bảng `?geometry=1` đo tâm icon thật, chỉ kết luận `ĐẠT` nếu hai icon lệch tâm ≤1px.

## Token áp dụng

| Hạng mục | Token / chuẩn | Phạm vi |
|---|---|---|
| Tiêu đề Inbox | 24/32px, 750 | 23/32px ≤360px |
| Tên liên hệ | 14/20px, 700 | Truncate một dòng, không đè rail giờ |
| Xem trước | 12.5/18px | Hai dòng, tràn chữ phải xuống hàng |
| Tin nhắn | 14/21px | Giữ selectable, wrap mã hàng dài |
| Nhãn / giờ | 11/16px | Tabular numbers; Inbox/date/stamp/note |
| Icon nút | 21px | Ở trong vùng chạm 48px (44px ≤360px) |
| Viền | 1px | Tôn trọng semantic `--border` sáng/tối |
| Góc bo | 14px điều khiển/liên hệ; 18px bubble | Ô gõ giữ V16 24px |
| Nhịp khoảng cách | 4px cơ sở | Preview cách tên 4px, các vùng khác kế thừa |

## MUST-STAY và trường hợp âm tính

- Không đổi L0–L5 grid, `--frame-control`, `--frame-thread-axis`, scroll owner, `VisualViewport`, input height, menu/hộp ảnh, Back, nội dung chat, business/hệ thống thật.
- Không thêm timer, AJAX, WebSocket, cookie, tài khoản, storage, Supabase, Zalo, sending hay OCR.
- Chữ nhập ≥16px để hạn chế iOS auto zoom, focus ring nằm bên trong vùng có clipping, tabular date/quantity, `prefers-reduced-motion` tắt chuyển động không cần thiết.
- Ẩn thanh scrollbar của V16 là đánh đổi truy cập cần kiểm thực trên desktop; không coi CI là bằng chứng E4/E5.
- Bản Chat design và Songoku Pages phải giống từng byte. Mỗi vòng tăng nhãn + ngày + nhật ký và test.

## E0–E5 và rollback

- E0: kiểm tra phân tán token cũ và điểm chưa đồng nhất trong CSS V12–V16.
- E1: CSS chỉ ảnh hưởng demo HTML và phép đo DOM khi chủ động bật `?geometry=1`.
- E2: Node test xác nhận token, tên phiên bản, icon, vùng chạm, không mạng/dữ liệu thật.
- E3: CI GitHub 2 repo và Pages, ghi mã commit/workflow.
- E4/E5: **PENDING** đo thực `getBoundingClientRect` + screenshot iPhone Safari/PWA, Android Chrome/PWA, desktop; thử bàn phím, font lớn, Dark Mode, giảm chuyển động và đường viền.
- Rollback: revert block `CHAT-NEXT-017`, đo tâm icon và nhãn V17, khôi phục V16 demo. Không liên quan production.
