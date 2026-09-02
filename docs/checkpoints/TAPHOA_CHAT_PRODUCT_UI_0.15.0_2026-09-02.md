# TAPHOA CHAT/CALL — PRODUCT UI CHECKPOINT 0.15.0

Ngày: 2026-09-02

## Trạng thái production

- Version hiển thị: `CHAT-ADMIN-0.15.0`
- Nguồn phát triển: `feat/role-account-polish`
- Release source commit: `d21cc7061b9bae47828d2cef40cbca96508fa668`
- Checkpoint source commit: `84bc28538c62a188091c7c1cc5cc6440bbe18cf5`
- Production `main`: đã fast-forward tới checkpoint 0.15.0 theo quyết định của chủ dự án.
- GitHub Actions production run: `33612534939`
- Production build: PASS — TypeScript typecheck + Vitest + Vite/PWA production build.
- GitHub Pages deploy: PASS.
- Test tại release source: 144 test files PASS, 377 tests PASS.

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

## Hậu kiểm thiết bị thật — PENDING DEVICE

Theo quyết định của chủ dự án, 0.15.0 đã được đưa lên `main` trước; các mục sau là hậu kiểm production chứ không còn là gate chặn merge:

- iPhone Safari: keyboard / scroll / composer / zoom.
- iPhone Home Screen PWA: keyboard + notification khi foreground/background/lock theo khả năng Web Push.
- Android Chrome/PWA: keyboard + notification + call pill.
- Incoming call khi app nền/khóa/chưa mở: best effort theo PWA/OS, không cam kết như native CallKit.

Không ghi PASS cho các mục vật lý chỉ dựa trên CI. Nếu phát hiện regression, sửa đúng owner và chạy lại full CI trước khi cập nhật `main`.

## Cảnh báo build không chặn production

- Vite có cảnh báo chunk `surface` > 500 kB sau minify.
- Có cảnh báo `src/admin/runtime.ts` vừa dynamic import vừa static import nên dynamic import không tách chunk.
- Đây là cảnh báo tối ưu bundle, không phải test/build failure. Không mở refactor riêng nếu chưa có bằng chứng performance.

## Rollback

Nếu 0.15.0 có regression nghiêm trọng, rollback `main` về `89eb8706d6b40df4d697c6ce74d43aa6cbee0bf6` hoặc revert commit gây lỗi. Không rollback database bằng cách xóa dữ liệu User/conversation.

## Bước tiếp theo

1. Hậu kiểm trực tiếp production trên iPhone Safari / iPhone PWA / Android.
2. Ghi PASS/FAIL theo từng case; sửa đúng owner nếu có regression.
3. Tiếp tục audit legacy/lab chỉ khi xác định được production caller và có test bảo vệ; không dọn theo cảm giác.
