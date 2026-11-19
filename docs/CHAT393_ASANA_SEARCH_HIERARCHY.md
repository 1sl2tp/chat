# CHAT-393 · Search-first directory hierarchy (tham khảo Asana)

**Ngày:** 2026-11-20. **Phạm vi:** giao diện danh bạ mobile của TAPHOA Chat, không sao chép nhận diện thương hiệu Asana.

## Ảnh tham khảo → quy tắc có thể áp dụng

1. **Inbox:** tên nổi bật, dòng xem trước tối đa hai dòng, thời gian là metadata. `mobile-ui-polish.css` đã giữ trục tên–thời gian–preview (CHAT-392), không đổi chức năng hiện tại.
2. **Search với bàn phím:** ưu tiên tác vụ đang thực hiện: ô tìm ở trên cùng vùng danh bạ, một vùng kết quả cuộn ở dưới; khi nhập ẩn filter phụ. Khác Asana, không thêm bottom navigation 5 tab vì Chat/Work có nhiệm vụ riêng.
3. **Home:** vùng chức năng theo mức ưu tiên; không bê nguyên card trống, thanh AI hay nút + vào hội thoại.

## Owner và state (UI P1/P2, không thay P0)

- **P0 keyboard:** `shell-form-viewport-policy.js`, `keyboard-inset-core.js`; chỉ Platform đo `VisualViewport`.
- **P1 Shell:** `shell.js`, `#shellNavigationLayer`; không thay điều hướng/push.
- **P2 Directory:** `contact-directory-admin.js` quản lý một input `#contactDirectorySearchInput`, trạng thái `expanded` và `directorySearchActive`, giữ lại nguồn list scroll.
- **P2 visual:** sửa trực tiếp *một* block owner CHAT-388 trong `mobile-ui-polish.css`; không thêm stylesheet hay `position:fixed` mới.
- **P3/P4:** `×` đóng tìm, 44px target; không xử lý dữ liệu ngân hàng, tin nhắn hay phiên người dùng.

| State | Thứ tự grid | Filter | Keyboard | Scroll |
|---|---|---|---|---|
| Compact | `filters search` / `results` | Hiện loại tối thiểu | Đóng | `.wm-sidebar-navigation` |
| Typing | `search` / `results` | Ẩn | P0 kiểm soát | `.wm-sidebar-navigation` |
| Results, IME đóng và có query | `search` / `filters` / `results` | Hiện | Đóng | `.wm-sidebar-navigation` |
| Close/Escape/đổi khách | Trở về Compact | Hiện | Theo P0 | Bảo toàn scroll owner |

**Lưu ý:** Khi user chọn khách, không đổi owner dữ liệu, không gửi tin thật, không tự focus Composer. Giữ cơ chế nháp và đường push hiện hành.

## Kiểm thử

- E0: không đổi business APIs, auth, DB hay Supabase; không thêm CSS override ở cuối file.
- E1: source contract `tests/test_chat388_mobile_directory_search_dock_20261119.cjs`, `tests/test_chat391_search_filter_rail_state_20261119.cjs`, `tests/test_chat393_asana_search_first_20261120.cjs`.
- E2/E3: cần chạy full `tools/verify_current.py` cùng CI/build và kiểm bản Preview trước merge; **chưa xác nhận trong phiên này**.
- E4/E5: cần nghiệm thu iPhone Safari/PWA, Android Chrome/PWA và xoay ngang: mở tìm kiếm, nhập tiếng Việt, Done/blur/clear/close, click khách; không giật thanh dưới và không làm mất vị trí cuộn; **chưa xác nhận**.

**Không deploy thủ công**, chỉ merge sau khi kiểm thử đạt.