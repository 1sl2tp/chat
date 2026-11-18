# CHAT-NEXT-010 — Hệ quy tắc giao diện tham chiếu các sản phẩm lớn

**Phạm vi:** Bản demo tĩnh của CHAT NEXT; không phải clone giao diện/logo/tài sản của bất kỳ hãng nào. Không chạm Chat/PWA production, Supabase, Zalo, bill/đơn thật. Đây là các **nguyên tắc học hỏi** từ tài liệu công khai, không phải sự bảo chứng từ những hãng này.

## Tham chiếu và chuyển hóa

| Nguồn chính thức | Nguyên tắc quan sát được | Quy tắc áp dụng cho CHAT NEXT |
|---|---|---|
| [Apple Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [UI Design Dos and Don'ts](https://developer.apple.com/design/tips/) | Vùng chạm đủ lớn, khuyến nghị ít nhất 44×44pt; chữ và biểu tượng không chen chúc | Mẫu CSS dùng `--ui-tap:48px` cho nút thao tác chính, tránh vùng click 30–42px. Lưu ý pt/dp ≠ CSS px tuyệt đối; cần test iPhone thật |
| [Google Android Accessibility: Touch target](https://support.google.com/accessibility/android/answer/7101858) | Android khuyến nghị vùng chạm ít nhất 48×48dp | Nút gửi, gọi, ⋯, đóng sheet, điều hướng được thiết kế ở mức tối thiểu 48 CSSpx và khoảng trống phù hợp; không làm icon tự thân quá lớn |
| [Meta / WhatsApp UI redesign](https://www.meta.com/design-at-meta/blog/whatsapp-user-interface-update/) | Đưa navigation xuống dưới trên Android tạo chỗ cho bộ lọc ở trên Inbox | Ở mobile: bottom nav giữ **Trò chuyện / Công việc**; các filter **Tất cả / Chưa đọc / Nhóm / Khách hàng** đặt sát phần danh bạ, không chen giữa composer và tin nhắn |
| [OpenAI / ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) | Công cụ mobile được nhóm vào menu, và chuyển hội thoại trên mobile web không tự focus composer | Header Chat chỉ giữ Back, avatar/tên, gọi và ⋯; “Công việc”, “3 mẫu hóa đơn”, “Ảnh và tệp” vào native `dialog`. Không tự mở bàn phím khi đổi liên hệ |
| [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Android Adaptive Navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) | Bố cục thích ứng theo vùng màn hình và ngữ cảnh nhập, không chỉ đo chiều rộng tuyệt đối | Tablet cảm ứng vẫn dùng một màn tại một thời điểm và bottom nav; desktop con trỏ fine giữ Directory | Conversation | Context ở nơi đủ rộng, không mở thêm app riêng |

## Các quyết định được khóa trong bản thử 10

1. **Một chức năng, một chỗ chính:** Inbox để tìm/chọn hội thoại; Chat để đọc/nhập; Công việc là trang riêng. Header Chat chỉ để gọi hoặc mở menu ngữ cảnh; không thêm “chức năng nghiệp vụ” thứ ba thường trực cạnh tên khách.
2. **Header bền vững:** back + avatar 44px + tên có `min-width:0` và ellipsis + hai nút tối đa, không kéo tên che thời gian hoặc kéo sai lề.
3. **Sắp chữ:** mỗi liên hệ có tên (15px), tối đa hai dòng preview, giờ tabular 64px. Bóng/viền rất nhẹ, một accent xanh cho trạng thái/CTA thực sự.
4. **Touch/keyboard:** 48 CSSpx cho các nút chính (phân biệt Apple 44pt và Android 48dp khi test thiết bị); text area 16px ngăn iOS auto zoom; native sheet top layer với nút đóng, Escape/backdrop và trả focus; không thêm VisualViewport observer.
5. **Điều hướng và bản nháp:** khi chuyển liên hệ, bản nháp được giữ **riêng mỗi khách trong bộ nhớ của tab**; tin đã nhập mẫu cũng giữ trong bộ nhớ tab, không gửi tới ai và không lưu localStorage/IndexedDB.
6. **Một chủ sở hữu chiều cao mobile:** top demo banner tính safe-area top; app co theo flex `height:100dvh` với `min-height:0`, bottom nav chừa safe-area bottom, danh bạ/cuộn tin là vùng scroll của riêng mình.
7. **Hóa đơn:** mẫu 01 đen trắng là hệ hình học gốc; xanh lá/xanh than chỉ thay tokens. Bảng **SL × đơn giá = thành tiền**, giá/tổng tabular, in A4; bản demo không thay đổi dòng tiền.
8. **Cách ly nghiêm ngặt:** demo HTML thuần, không service worker, auth, network, Supabase, Zalo, RPC, dữ liệu khách thực. Cấu hình xuất bản: `1sl2tp/songoku/demos/chat-next/`; repo Chat vẫn Draft.

## Ranh giới kiểm chứng

- **E0:** nguồn đối chiếu chính thức ở bảng trên.
- **E1:** CSS/JS trong `docs/chat-next/demo/index.html`, dự kiến đồng bộ bản tĩnh sang Songoku Pages.
- **E2:** `tests/test_chatnext_interactive_demo_20261118.cjs` (mock DOM) kiểm tra state, focus, menu, thiết bị cảm ứng; test Gallery kiểm tra phép tính.
- **E3:** CI Chat + Songoku Pages; PASS chỉ chứng minh source/test/publish path, không chứng minh Safari thật.
- **E4:** người dùng thử iPhone 320–430px Safari/PWA, iPad portrait/landscape, Android 48dp tương ứng, desktop 1024–1920; bật bàn phím/đổi khách/mở menu/in A4.
- **E5:** Không thêm polling, network, camera, push, DB, thông báo thật hoặc giao dịch.

**Rollback:** Revert riêng CSS và các thay đổi `dialog` / trạng thái giả lập ở bản demo, giữ nguyên mã runtime Chat và bộ test nghiệp vụ.
