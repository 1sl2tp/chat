# TAPHOA CHAT — CHECKPOINT CHUYỂN CHAT

**Thời điểm:** 2026-09-01 18:27 +07  
**Repo:** `1sl2tp/chat`  
**Production:** `https://chat.taphoa.xyz/`  
**Admin:** `https://chat.taphoa.xyz/admin/`  
**Main tại thời điểm checkpoint:** `28a0cdda554ac51dc430fa2c3d10b7cec6bbec97`  
**Release constant:** `CHAT-ADMIN-0.13.0`  
**Supabase project:** `gcnoahqsrquxkwkjbuxy`  
**Push Edge Function:** `taphoaxyz-call-push` v9 ACTIVE

## Mục tiêu khi mở chat mới

Tiếp tục đúng dự án TAPHOA Chat/Call User ↔ Admin từ checkpoint này. Không hỏi lại các quyết định đã chốt, không quay lại TURN/audio foundation nếu không có bằng chứng mới, không trộn `user 1234` vào trước khi notification milestone được chốt.

## Kiến trúc đã chốt

- Hệ thống nhỏ: chỉ User ↔ Admin.
- Notification server-owned: Chat/Call RPC tạo outbox; backend/Edge Function là owner gửi Push.
- Không Firebase/Redis/queue lớn; dùng Supabase + `pg_net` + 1 Edge Function.
- Subscription khóa theo `profile → device → auth session → endpoint`.
- Trước khi gửi, target phải thuộc session còn sống; token/session cũ không được tự mang quyền nhận push.
- Client không còn fire-and-forget `send_message/send` cho Chat/Call.
- Foreground đúng conversation: Chat không hiện system notification thừa.
- Foreground incoming Call: Call UI + chuông/rung; không thêm system popup thừa.
- Background/lock: dùng Web Push.
- Exact-device self-test vẫn giữ.

## PWA User / Admin

- User PWA: `id/start_url/scope = /`.
- Admin PWA: `id/start_url/scope = /admin/`.
- **Hai PWA là hai app khác nhau. Không được kết luận User và Admin là cùng PWA.**
- Admin có manifest riêng `/admin/manifest.webmanifest` và Apple standalone metadata riêng.
- VitePWA hiện vẫn build một `src/sw.ts`. Việc đang cần xác minh tiếp là **Service Worker registration/scope thực tế của từng PWA và PushSubscription ownership**; đây là tầng kỹ thuật khác với PWA manifest identity.

## Server-owned notification — đã PASS

- User → Admin Chat: outbox đúng recipient, `processed_at` có, `last_error=null`.
- Admin → User Chat: PASS.
- Một Call Admin → User thật: đúng 1 `incoming_call` outbox, accept → connected → ended; processed thành công.
- `invalid_push_targets = 0` tại lần kiểm gần nhất trước Android regression.
- Edge Function final v9 bỏ legacy `send/send_message`; còn `dispatch_event/config/test`.

## Android notification — trạng thái đang dở

Bằng chứng đã có:

- Android app-info: notification được Allow; Sound & vibration bật; Lock screen + Pop-up bật.
- Android hiện chạy PWA thật (`label=PWA`, `platform=android` đã từng được ghi nhận).
- Android subscription dùng endpoint FCM.
- Backend self-test từng trả `delivered >= 1` nhưng remote notification không hiển thị rõ như mong đợi.
- Diagnostic local `ServiceWorkerRegistration.showNotification()` đã được merge tạm lên production; **local notification hiển thị được trên Android**.
- Ảnh 18:20 thấy rõ local notification:
  - `TAPHOA local test`
  - `Thông báo trực tiếp từ PWA`
  - icon PWA chữ T.

=> Quyền Android / notification channel / local `showNotification()` hoạt động.

## Patch tạm đang ở production

### A. Temporary local diagnostic

- PR #22.
- Merge commit: `2797bdbe404764e49bf1c58572066b1d8119ef91`.
- Nút “Kiểm tra thông báo” gọi local `showNotification()` trước remote probe.
- Đây chỉ là diagnostic, phải gỡ sau khi tìm xong root cause.

### B. Android subscription repair

- PR #23.
- Merge commit/main tại thời điểm checkpoint: `28a0cdda554ac51dc430fa2c3d10b7cec6bbec97`.
- Khi explicit self-test trên Android: unsubscribe subscription hiện tại → subscribe lại bằng VAPID hiện tại → upsert endpoint/keys vào đúng device/session → remote test.
- Full typecheck + tests + Vite build PASS trên branch; production Pages build/deploy PASS trên merge commit.

## Ảnh / dấu hiệu mới nhất

### 18:20 Android lock screen

- Notification trên: icon PWA “T”, source `Chat · chat.taphoa.xyz`, title `TAPHOA local test`, body `Thông báo trực tiếp từ PWA`. Đây chắc chắn là LOCAL diagnostic.
- Bên dưới có một notification mang icon Chrome, tên `Chat`, nội dung đang thu gọn/không đọc rõ.
- **Chưa được phép khẳng định** notification Chrome đó là remote Web Push thành công hay failure; phải xác minh bằng event/subscription + hành vi thực tế.

### 18:22 Admin trên Android

- Admin UI hiện `Đăng ký thông báo lỗi · thử lại`.
- User nhắc rõ: **Admin và User khác nhau**.
- Không được nhảy tới kết luận “User và Admin cùng app”.

## Giả thuyết đang cần kiểm chứng — chưa chốt

Câu hỏi kỹ thuật tiếp theo:

1. Hai PWA có manifest identity khác nhau, nhưng Vite hiện có một `sw.ts`. Cần xác minh Service Worker registration của User và Admin thực tế có cùng root scope hay có registration riêng.
2. Cần lấy live `registration.scope` từ User và Admin, không suy luận chỉ từ manifest.
3. Cần query production bảng `chat_call_push_subscriptions` sau lần repair để xem endpoint/profile/device/session hiện tại của User và Admin; không dùng tên bảng cũ.
4. Nếu User/Admin trên cùng browser đang dùng chung một SW `PushManager` registration thì PushSubscription có thể shared ở tầng SW; nếu registration khác scope thì phải chứng minh bằng dữ liệu. Chỉ kết luận sau khi có evidence.

## Việc không được làm

- Không sửa TURN/codec/mic/audio foundation: two-way call/audio trước đó đã PASS.
- Không thêm Firebase/native FCM chỉ để chữa PWA nếu chưa chứng minh cần thiết.
- Không để local diagnostic thành tính năng vĩnh viễn.
- Không xoay subscription tự động mỗi lần mở app.
- Không làm APK nếu user không yêu cầu.
- Không trộn `user 1234` vào trước khi notification milestone được chốt.
- Không kết luận Admin/User cùng app; chúng là hai PWA khác nhau.

## NEXT STEP chính xác

1. Query production bảng `chat_call_push_subscriptions`: liệt kê User/Admin Android subscriptions, `device_id`, `profile_id`, `auth_session_id`, endpoint fingerprint, `updated_at`; kiểm duplicate/shared endpoint.
2. Đọc code runtime đăng ký service worker của User và Admin; xác định `registration.scope` thực tế mong đợi.
3. Nếu cần, thêm diagnostic cực nhỏ hiển thị `registration.scope` + endpoint fingerprint cho User/Admin, **không đổi notification behavior**.
4. Từ evidence đó quyết định: tách SW registration scope hoặc sửa subscription ownership; không đoán.
5. Sau khi remote Web Push Android Chat + Call background/lock PASS, gỡ local diagnostic, giữ self-heal chỉ nếu thực sự cần, chạy full release gate.
6. Khi notification milestone PASS hoàn toàn mới chuyển sang `user 1234`.

## Câu lệnh dùng ở chat mới

> Tiếp tục TAPHOA Chat từ checkpoint mới nhất trong Google Drive thư mục `taphoa.xyz` và GitHub `docs/checkpoints`. Đọc checkpoint 2026-09-01 18:27 +07, kiểm `main` mới nhất của `1sl2tp/chat`, rồi tiếp tục đúng NEXT STEP. Admin và User là hai PWA khác nhau; đang điều tra Service Worker scope/PushSubscription Android. Không làm lại các mốc đã PASS.
