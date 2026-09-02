# TAPHOA CHAT/CALL — PRODUCT UI CHECKPOINT 0.15.0

Ngày: 2026-09-02

## Trạng thái release candidate

- Version hiển thị: `CHAT-ADMIN-0.15.0`
- Nhánh: `feat/role-account-polish`
- Release source commit: `d21cc7061b9bae47828d2cef40cbca96508fa668`
- Production `main`: chưa merge trong checkpoint này.
- GitHub Actions run: `33611548755`
- Gate tự động: PASS — TypeScript typecheck + Vitest + Vite/PWA production build.
- Test: 144 test files PASS, 377 tests PASS.

## Phần đã hoàn tất

### P1 — User1 / User2 / Hỗ trợ
- User-facing copy dùng `Hỗ trợ`; `Admin` chỉ còn là vai trò kỹ thuật.
- User1 có luồng nâng cấp tại chỗ; User2 có quản lý hồ sơ/tài khoản.
- Hỗ trợ có quản lý/nâng cấp/chỉnh sửa/reset/xóa User theo contract hiện tại.
- Không mở User ↔ User.

### P2 — Inbox Hỗ trợ
- Inbox có một owner presentation chính tại `src/admin/management-ui.ts`.
- Có search theo tên/tài khoản và filter Vãng lai/User 2/Chưa đọc.
- Row theo cấu trúc Avatar | Content | Meta; badge unread giới hạn `99+`.
- Renderer inbox legacy trong `admin-main.ts` đã bỏ để tránh hai owner.

### P3 — Chat presentation
- User/Hỗ trợ dùng shared ChatSurface.
- Call event hiển thị như system event.
- Reaction hiển thị riêng; ❤️/copy/share nằm trong menu `…`.
- Ảnh/audio/file có presentation riêng.
- Composer là một cụm bo tròn dùng shared SVG icons; input giữ `font-size:16px`.

### P4 — Call presentation
- Full call chỉ có `Thu nhỏ` trong luồng chính; không còn nút `Ẩn` cho người dùng.
- Compact hiển thị call pill và mở lại Full bằng tap.
- Incoming: chỉ Nhận / Từ chối.
- Outgoing: Mic / Kết thúc.
- Active: Loa (khi khả dụng) / Mic / Kết thúc.
- Call controls dùng shared SVG icon set.
- State `hidden` chỉ giữ cho recovery/compatibility cũ, không có đường vào từ primary UI.
- Không thay đổi ownership LiveKit media hoặc Supabase call state/signaling.

### P5 — Mobile / PWA / notification contract
- User và Hỗ trợ dùng viewport `width=device-width, initial-scale=1.0, viewport-fit=cover`.
- Không dùng `user-scalable=no` hoặc `maximum-scale=1`.
- VisualViewport vẫn là shared owner cho keyboard/geometry.
- Composer input giữ 16px để tránh Safari auto zoom.
- System notification chỉ suppress khi đúng conversation đang visible.
- Notification click dùng Service Worker scoped navigation resolver.

## Gate còn lại — KHÔNG ĐƯỢC GHI PASS BẰNG CI

`PENDING DEVICE` cho test vật lý:
- iPhone Safari: keyboard / scroll / composer / zoom.
- iPhone Home Screen PWA: keyboard + notification khi foreground/background/lock theo khả năng Web Push.
- Android Chrome/PWA: keyboard + notification + call pill.
- Incoming call khi app nền/khóa/chưa mở: best effort theo PWA/OS, không cam kết như native CallKit.

## Cảnh báo build không chặn release candidate

- Vite có cảnh báo chunk `surface` > 500 kB sau minify.
- Có cảnh báo `src/admin/runtime.ts` vừa dynamic import vừa static import nên dynamic import không tách chunk.
- Đây là cảnh báo tối ưu bundle, không phải test/build failure. Không mở refactor riêng trong checkpoint UI này trừ khi có yêu cầu/performance evidence.

## Rollback

Nếu 0.15.0 có regression UI, rollback về `89eb8706d6b40df4d697c6ce74d43aa6cbee0bf6` trên `main`, hoặc revert các commit sau merge. Không rollback database bằng cách xóa dữ liệu User/conversation.

## Bước tiếp theo

1. Chạy matrix thiết bị thật iPhone Safari / iPhone PWA / Android.
2. Ghi PASS/FAIL theo từng case; sửa đúng owner nếu có regression.
3. Chỉ sau gate thiết bị mới quyết định merge `feat/role-account-polish` vào `main`.
