# CHAT-395 · Ba vùng gọn: Top 1 / Top 2 / Nội dung

**Nguồn thiết kế:** các ảnh chụp danh bạ đang dùng và bộ ảnh demo trong hội thoại 20/11/2026. Mục tiêu là giữ cấu trúc hợp lý, không sao chép nguyên mẫu iOS/Asana và không thêm hàng logo/chuông thứ ba.

## Cây sở hữu

- **P1 Top 1 — vùng cố định**: `#regionTop` của `shell.js` (menu và hai tab Trò chuyện / Công việc); độ cao tab 44px; không chứa bộ lọc hoặc danh sách.
- **P2 Top 2 — vùng công cụ theo tác vụ**: `#shellNavigationLayer .wm-sidebar-body` và `contact-directory-admin.js`, dùng đúng một ô input và một danh sách nhóm; mặc định có *một hàng tìm kiếm 52px + một hàng lọc 44px*. Filter rail cuộn ngang, nút chevron mở toàn bộ nhóm khi cần; không hiện mặc định thành hai hàng nhóm.
- **P2 Nội dung — chiếm chiều cao còn lại**: `.wm-sidebar-navigation` là scroll owner duy nhất; mỗi dòng avatar/tên/preview/thời gian và trạng thái chưa đọc. Nội dung không kéo Top 1/Top 2.
- **P0 bàn phím/viewport**: `shell-form-viewport-policy.js` không thay. Khi input focus, Top 2 chỉ còn hàng search; bộ lọc ẩn để chừa kết quả. Khi blur/cancel, phục hồi lọc và anchor theo CHAT-394.

## Giao diện theo trạng thái

| Trạng thái | Top 1 | Top 2 | Nội dung |
| --- | --- | --- | --- |
| Bình thường | Menu + Trò chuyện/Công việc | Search / nhóm một hàng cuộn ngang | Danh bạ cuộn |
| Bấm mở nhóm | Giữ nguyên | Search / nhóm có thể xuống hàng | Danh bạ chiếm phần còn lại |
| Gõ tìm kiếm, IME mở | Giữ nguyên | Search; ẩn nhóm | Kết quả cuộn trên bàn phím |
| IME đóng, vẫn có query | Giữ nguyên | Search + nhóm | Kết quả không thay vị trí tùy tiện |
| Hủy chọn/đóng tìm kiếm | Giữ nguyên | Bình thường | Phục hồi vị trí danh bạ |

## Chất lượng và giới hạn

- Font input ≥16px; nút action 44px; Top 1 44px; không dùng z-index hay fixed mới.
- Một input, một scroll owner, một keyboard owner; không thêm polling, RPC, auth, message sending, push, tài chính, DB hay sự kiện mạng.
- Các nhóm KH/CM/TK NCC/Bạn bè/Khác luôn có thể chạm tới bằng kéo ngang; sau khi chọn phải giữ chip đang chọn trong tầm nhìn.
- Chỉ thay UI danh bạ mobile `data-mobile-directory=true`; không sửa desktop và vùng nội dung hội thoại đang mở.
- Release candidate V21.72.44; tăng epoch public PWA, giữ lại dữ liệu riêng, bản nháp, phiên đăng nhập và outbox.
- CI E1/E2 kiểm qua `tests/test_chat395_three_zones_20261120.cjs` cùng hồi quy CHAT-388/390/391/393. E3 chờ GitHub Pages và so sánh build_id; E4/E5 phải kiểm trực tiếp iPhone PWA/Safari, Android Chrome/PWA và cửa sổ hẹp của máy tính. Không được gọi E4/E5 PASS chỉ vì CI xanh.
