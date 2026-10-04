# CURRENT WORK — TAPHOA CHAT

Cập nhật: 2026-10-04

## Luồng bắt buộc hiện tại

1. Auth:
   - Supabase session được persist + auto-refresh.
   - Form dùng browser password manager (`autocomplete=username/current-password`); không lưu plaintext password trong app.
2. User:
   - app/web visible → nhận `v21_sync_events` realtime và áp ngay vào UI/cache;
   - app hidden/closed → dừng foreground Realtime;
   - mở lại/foreground → subscribe lại + delta pull catch-up ngay.
3. Admin:
   - PC/mobile visible → cùng luồng realtime như user;
   - mobile hidden/background → Service Worker/Web Push tiếp quản;
   - app bị đóng hoàn toàn → push/badge vẫn tới cho incoming user message; mở lại thì catch-up phần đã bỏ lỡ.
4. Read-state:
   - conversation đang visible mới mark-read;
   - read-state event được gửi cho cả hai account và mọi session đang mở cùng nhận/apply.

## Owner

- Auth/session: `auth-session-store.js`.
- Foreground realtime: `v21-realtime-session.js`.
- Canonical event apply + catch-up/outbox/read: `v21-sync-engine.js`.
- Admin mobile background: `admin-push-controller.js` + `sw.js`.
- Canonical data: Supabase Postgres.

## Patch đang triển khai

- `v21_sync_events` không còn phải wake rồi chờ RPC pull mới render; event canonical áp thẳng vào cache/UI.
- Pull chỉ còn boot/reconnect/foreground/fallback catch-up.
- Read-state của cùng account cập nhật unread ở các session khác.
- Admin mobile tự coi background push là wanted khi platform hỗ trợ; permission hệ điều hành/browser vẫn là điều kiện bắt buộc.
- Push foreground kiểm tra cache trước khi fallback pull để tránh gọi trùng.
- Direct-message fallback theo dõi đúng message id; sync-event khác không được hủy nhầm fallback.
- Foreground Realtime dừng khi document hidden; admin background do Web Push sở hữu.
- Presence/heartbeat guardrails trước đó vẫn giữ.

## Production probe cần làm

Sau deploy, reload một lần các runtime cũ rồi test không refresh:
- admin PC gửi → user đang mở + admin mobile đang mở thấy ngay;
- user gửi → admin PC + admin mobile thấy ngay;
- admin mobile gửi → admin PC + user thấy ngay;
- một bên đang mở đúng conversation → read-state phản hồi sang bên kia;
- đóng user app → user không chạy nền;
- đóng admin mobile/PWA → incoming user message vẫn có Web Push/badge; mở lại catch-up ngay.

## Không được làm

- Không thêm interval polling message.
- Không lưu plaintext password.
- Không dùng Presence/heartbeat làm message transport.
- Không cho push và direct-message fallback tự render message.


## Root cause xác nhận sau test 19:10

Supabase mới có publication + RLS đúng, trigger tạo đủ `v21_sync_events` cho cả admin và user, nhưng bị thiếu table privilege cho Realtime role:

- `v21_sync_events`: authenticated SELECT = false
- `v21_messages`: authenticated SELECT = false
- `v21_session_events`: authenticated SELECT = false
- `v21_call_events`: authenticated SELECT = true

Do đó PostgreSQL Realtime subscription không đọc được 3 bảng đầu dù policy tồn tại. RPC/REST vẫn có thể hoạt động qua SECURITY DEFINER nên biểu hiện là gửi được nhưng các session đang mở không tự nhận.

Production đã áp migration `restore_chat_realtime_authenticated_select`:
- GRANT SELECT cho authenticated trên 3 bảng trên;
- REVOKE ALL FROM anon;
- giữ nguyên RLS và write privileges.

Sau migration, cả 4 bảng Realtime: authenticated SELECT = true, anon SELECT = false.


## Operational retention đã áp production

Migration: `chat_operational_retention_guard`.

Retention:
- sync events: 14 ngày;
- session events: 7 ngày;
- push outbox sent/dead: 7 ngày;
- revoked app sessions: 30 ngày;
- summary failed: 7 ngày;
- summary done: 30 ngày.

Cron owner duy nhất: `chat-operational-retention-daily`, 03:43 UTC, tối đa 10.000 dòng/bảng/lượt.

Cleanup đầu tiên:
- `v21_session_events`: 228 → 3;
- `v21_push_outbox`: 1264 → 234;
- `chat_customer_summary_runs failed`: 1037 → 86;
- `v21_sync_events`: chưa xóa vì chưa đủ 14 ngày;
- revoked sessions: chưa xóa vì chưa đủ 30 ngày.

Canonical messages/read/media/conversations không bị đụng.


## Danh bạ — click không được nhảy vị trí

Root cause: `ContactStore.upsert()` trước đây luôn sort + render toàn danh bạ kể cả patch chỉ đổi `has_unread` khi mark-read. Vì vậy click một contact có thể làm DOM list bị dựng/reorder lại và vị trí vừa bấm bị nhảy.

Contract mới:
- chỉ contact mới hoặc `latest_at` thật sự đổi mới được reorder;
- `has_unread`, avatar, tên, profile update chỉ patch row tại chỗ;
- tin nhắn mới vẫn đổi `latest_at` nên contact vẫn lên đầu;
- full reorder khi có activity thật vẫn giữ `scrollTop` của `.wm-sidebar-navigation`.
