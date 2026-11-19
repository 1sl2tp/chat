# CHAT-396 · TAPHOA Chat theo nhịp giao diện ChatGPT (20/11/2026)

## Nguồn và mục tiêu
Đối chiếu **bốn ảnh người dùng cung cấp**: (1) danh bạ có menu tài khoản đang mở, (2) danh bạ với tìm kiếm, (3) hội thoại ChatGPT với ô gõ, (4) ngăn trái ChatGPT gồm mục điều hướng và cuộc trò chuyện gần đây. Các ảnh demo trước đó là **tham khảo hình học**, không phải dữ liệu thực để nhập vào ứng dụng.

## Trục cha–con
- **P1 Top 1:** \`#regionTop\` và \`shell.js\` giữ 1 hàng điều hướng 44px, tab Trò chuyện/Công việc được phân cấp bằng bề mặt bo tròn nhẹ; nút menu vòng tròn.
- **P2 Top 2:** \`#shellNavigationLayer .wm-sidebar-body\` giữ nguyên một ô tìm kiếm và một hàng lọc cuộn ngang. P0 giữ nguyên vai trò bàn phím và đo viewport.
- **P2 Nội dung danh bạ:** chỉ \`.wm-sidebar-navigation\` cuộn; dòng khách dùng dữ liệu store/renderer hiện có.
- **P1 Drawer mới:** \`#mobileChatDrawer\` ở Shell, xuất hiện khi bấm menu trên trang danh bạ. Drawer chứa điều hướng thực có sẵn, một mục đọc từ **các dòng danh bạ đang render** (tối đa 12) để chuyển đúng sang \`NavigationCommand.openContact\`. Không copy dữ liệu vào kho mới, không tạo lịch sử giả, không gửi thông điệp.
- **P2 Hội thoại:** không thay \`MessageStore\`, media, sender, thứ tự hay cơ chế cuộn.
- **P3 Composer:** \`mobile-chat-refresh.css\` chỉ làm viền và bóng nhẹ hơn trên cùng \`#composerShell\`, không đổi owner của textarea/send/mic/plus và P0 keyboard.

## Thao tác và an toàn
- \`work-customer-summary.js::bindMobileNavigationClicks\` vẫn là owner duy nhất của nút hamburger ở mobile và **ủy quyền** \`ChatAppShell.MobileDrawer.toggle()\` khi ở danh bạ. Khi đang xem một khách, nút là back về danh bạ như NAV-284, không được nhầm thành mở menu.
- Drawer đóng bằng nền, Escape, chọn khách, ra desktop, đăng xuất hoặc khi route thay đổi. Tab được giữ trong dialog; đóng trả focus đúng nguồn nếu không điều hướng.
- "Trò chuyện mới" **chỉ đưa về danh bạ để chọn người nhận**. Không tự mở một người, không tạo tin hay phiên hội thoại giả.
- Chỉ hiển thị Cài đặt khi thao tác hiện có được phép. Ảnh đã chia sẻ đi theo route Photos hiện hành; không gán nhầm vào nghiệp vụ Công việc.
- Mọi tiêu đề/tin xem trước đều qua \`textContent\`, không đưa dữ liệu khách vào \`innerHTML\`.
- Không thay tài khoản thật, Supabase, API, DB, thông báo, thu tiền, nhập hàng hay giao dịch.

## Nghiệm thu
- E0: hình học và tính năng mong muốn xác định từ ảnh.
- E1: test tĩnh và mô phỏng \`tests/test_chat396_chatgpt_drawer_20261120.cjs\`, các bài NAV-284, mobile-menu, CHAT-395 và composer cũ.
- E2: full CI Verify V21, gồm source canonical build.
- E3: GitHub Pages auto-deploy (không deploy thủ công), xác minh HTML/version.json cùng build ID trên \`chat.taphoa.xyz\`.
- E4/E5: cần trực tiếp xác nhận bằng thiết bị: iPhone Safari/PWA, Android Chrome/PWA, màn hình hẹp/rộng, mở/đóng menu, bật bàn phím, chọn từ Gần đây, quay lại, ảnh và ô gõ dài; **không coi CI là thay thế**.

## Rollback
Nếu gặp lỗi route/focus: revert PR này và build cache epoch khác; không xóa session/private media/IndexedDB/outbox.
