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


## Customer-care route schedule corrected

Root cause: migration `20260922232000_customer_care_pre_delivery_stagger.sql` changed the source selector from the original route days (Monday/Friday) to one-day-early reminders (Sunday/Thursday).

Final production rule:
- Monday (Thứ 2): Sữa;
- Friday (Thứ 6): Sữa;
- every other day: Hàng thường;
- scanners stay 09:15 and 14:00 Asia/Ho_Chi_Minh;
- manual 2-minute staggering stays unchanged;
- no auto-send was added.

Production was refreshed immediately after the migration. On 2026-10-04 (Sunday), today's open care plan is Hàng thường.


## Customer-care message templates

Both Hàng thường and Sữa use the same 3-tier recommendation contract:
1. customer purchase history;
2. popular products from the same source;
3. active catalog fallback from the same source.

Up to 5 items are returned. A customer with no purchase history still receives product suggestions, and Milk suggestions never mix with regular-goods suggestions.

Canonical formatter: `chat_customer_care_message(customer_id,date)`.


## Customer-care auto-send — KH only

Auto-send is enabled only for `v21_accounts.contact_group='customer'` (nhóm KH). Friend/other groups are explicitly excluded both when planning and when sending.

Pacing/safety contract:
- refresh owners remain 09:15 and 14:00 Asia/Ho_Chi_Minh;
- one auto-send owner: `chat-customer-care-auto-send`;
- cron wakes every 5 minutes only in the morning/afternoon UTC bands; the function enforces exact Vietnam windows;
- send windows: 09:30–11:35 and 14:15–17:35;
- at most one care message per pass and one care message per customer/day;
- no care send while Zalo outbound has unresolved work;
- defer when any Zalo outbound was sent in the previous 2 minutes;
- enforce an additional ~5-minute campaign gap;
- skip a customer with any conversation activity in the previous 60 minutes;
- message creation uses `taphoa_chat_notify_customer`, so normal Chat realtime/Zalo bridge ownership stays unchanged;
- outside windows the sender returns `outside_window` and sends nothing.

This pacing reduces burst/spam-like behavior but cannot guarantee how a third-party platform classifies messages.


## Admin Composer — Công nợ không gửi URL trần

Root cause: `admin-composer-actions.js` action `debt` gọi `customerLinks()` rồi gửi trực tiếp `links.debt_url`.

Contract mới:
- click Công nợ gọi một RPC duy nhất `v21_admin_debt_share_summary(customer_id)`;
- chỉ Admin session hợp lệ được gọi;
- debt age = thời gian của đợt số dư dương liên tục hiện tại, không phải ngày đơn gần nhất;
- số đơn = đơn đã giao trong đợt công nợ đó;
- không gán thanh toán vào từng đơn vì collection hiện là balance-level;
- nội dung dùng giọng "Đối chiếu công nợ", gồm số dư, ngày bắt đầu/số ngày, số đơn đã giao, câu đề nghị kiểm tra lịch sự và link chi tiết;
- balance = 0 / dư tiền có mẫu riêng, không nói "chưa thanh toán hết";
- nếu RPC lỗi thì không fallback gửi URL trần.


### Debt share atomic send repair

Symptom: Admin Composer showed "Đang tạo đối chiếu công nợ…" but no message appeared. Production probe confirmed the summary RPC resolved correctly for the active Admin session, while no new `v21_messages` row was created. The failure boundary was the browser's second step (RPC body → client send).

Final owner:
- one RPC: `v21_admin_send_debt_summary(customer_id, client_id)`;
- server validates the current Admin app session;
- server calls `debt_share_summary_payload`;
- server inserts through canonical `taphoa_chat_notify_customer`;
- client only issues the RPC, then wakes SyncEngine once for immediate catch-up;
- idempotency key is `debt-share:<client_id>`;
- no bare-link or browser-send fallback.


## Admin image paste/send duplicate repair

Root cause production: one Admin clipboard transaction can expose the same image through both `clipboardData.files` and `clipboardData.items`. Browser metadata (`name/lastModified`) can differ, so metadata-only dedupe allowed two prepared assets with different asset IDs but the same `content_hash` into one message.

Evidence:
- production had 3 Admin messages with duplicate non-null image hashes inside the same message;
- newest incident contained 2 assets with identical SHA-256 content hash.

Final contract:
- `sameDraftImageContentExists()` owns same-draft image dedupe by canonical `contentHash`;
- applies to both visible and inactive composer drafts, therefore covers picker + paste ingress;
- duplicate prepared asset is released from local preview/cache before queueing;
- historical reuse is still allowed after the draft/message commits;
- one-time migration soft-deleted later same-hash Admin assets inside the same message; production duplicate-message count is now 0;
- no polling/request owner was added.
