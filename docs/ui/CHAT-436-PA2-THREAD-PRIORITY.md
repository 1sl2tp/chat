# CHAT-436 — PA2 ưu tiên diện tích hội thoại

**23/11/2026 · Trạng thái E0/E1, chờ CI/thiết bị thật.**

Quyết định đã chọn: **PA2**. Desktop có hai vùng hoạt động `Danh bạ | Hội thoại`. Context là vùng thứ ba *chỉ theo ngữ cảnh* trong thiết kế cha 2027, **không kích hoạt Work cũ** đang bị tắt ở production. Mobile giữ mô hình một màn chính, chuyển danh bạ → hội thoại, và bàn phím do platform owner quản lý.

## Hiện trạng từ source

- `index.source.html` là canonical HTML/CSS; `index.html` là generated. Layout desktop ở đúng media query `(min-width:64rem) and (hover:hover) and (pointer:fine)`.
- Hai cột `#screenHost`: navigation ở cột 1 và `#activeScreenSlot` ở cột 2. Vùng chat có scroll/Composer owner sẵn có.
- Bề rộng sidebar cũ `clamp(300px,26vw,340px)` chiếm quá nhiều trục đọc khi cửa sổ vừa đủ desktop. Công việc desktop trong `shell.js` hiện `WORK_ENABLED=false`; không có quyền bật chỉ để tạo cột thứ ba.
- Mobile có owner CHAT-388 và P0 keyboard ở `shell-form-viewport-policy.js`; không sửa.

## Thay đổi đúng owner

- Dùng lại **chính** khai báo `--desktop-directory-width` của two-column `#screenHost`; đặt `clamp(272px,24vw,320px)`. Ở 1024px: 300 → 272px; ở 1440px: 340 → 320px, trả khoảng 20–28px cho vùng đọc. Đây là giá trị tính toán từ CSS, không phải đo pixel trên thiết bị.
- Không thêm vùng cuộn, vị trí fixed, JS route, tìm kiếm, input, handler, token gửi, service worker hoặc database.
- Tích hợp regression `CHAT-436` vào Verify V21 và cập nhật đúng expected trong test workspace cũ. Giữ các test CHAT-435, CHAT-431, CHAT-388 và 3-column dormant contract.

## Giai đoạn tiếp

Thư viện cha có PA2 mẫu tại `1sl2tp/2027` PR #44. Sau khi CI xác nhận có thể nghiệm thu đồng thời: 1024/1440 desktop, mobile 320–430, iPhone/Android PWA + bàn phím, danh bạ dài, tên dài, tin dài, ảnh. Không được ghi E4/E5 PASS khi chưa có ảnh/log.

**Rollback:** revert một PR, để pipeline tự xây `index.html`; không can thiệp dữ liệu thật.
