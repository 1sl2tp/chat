## 2026-10-05 — Offline contact visibility + Admin→Zalo delivery

Symptom:
- one Chat account could be absent from the Admin directory while not online;
- Admin manual message to a Zalo-linked account could wait for the bridge fallback poll before 05:00 because the outbound wake signal was time-gated.

Production facts:
- `v21_contacts_sidebar` does **not** filter by `v21_sessions`/Presence; directory membership is canonical `v21_accounts` data.
- production currently has 79 active user accounts; 78 had no active Chat session in the 5-minute check window, yet all remain directory-eligible.
- 76 accounts are linked to Zalo.
- Admin→linked-account Chat insert already creates `zalo_message_links(direction='outbound', state='pending')` independent of target online state.

Root cause:
- desktop can retain a stale local contact cache even after the relevant old sync event is no longer useful for repairing that cache;
- `v21_private.zalo_outbound_signal()` skipped immediate Render wake before 05:00 Asia/Ho_Chi_Minh, even for a manual Admin message.

Final contract:
- authenticated bootstrap performs exactly one bounded `v21_contacts_sidebar` refresh to repair stale local directory cache; no interval polling was added;
- Presence/session state never controls whether an account appears in the directory;
- manual Admin→Zalo outbound signals `taphoa-zalo/outbound-now` immediately at any hour;
- customer-care scheduling remains controlled by its own daytime windows and pacing rules;
- if recipient is offline and has Zalo link: canonical Chat message + Zalo outbound;
- if recipient is offline and has no Zalo link: canonical Chat message remains unread and is delivered by normal Chat catch-up on next login; user-side Web Push is not currently an owner.

Verification:
- code commit: `1707790d2ac317656448b7a233d6dd79a4b7cab8`;
- canonical build sync: `06370c3b1c3c7d4f304f9c19ab2820e71107a573`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages deployment: PASS;
- production Zalo wake probe cleared the 4 current pending outbound rows; one historical failed row remains unrelated.

Resource impact:
- +1 bounded contacts RPC per authenticated bootstrap only;
- 0 interval polling added;
- manual Zalo message creates one immediate bridge wake instead of waiting up to the fallback poll;
- no new canonical table or duplicate delivery store.



## 2026-10-05 — LiveKit single-owner cleanup

- Confirmed production `v21-livekit-session.js` uses `v21-livekit-token`.
- Confirmed guest call page uses `v21-call-invite-guest`.
- Legacy `taphoa-livekit-token` had no current production reference and was retired to HTTP 410.
- Current LiveKit role remains transport/session only; Supabase `1sl2tpvn` owns durable business/call state.
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


## Danh bạ — click giữ nguyên vùng cuộn + xóa ô tìm kiếm

Triệu chứng:
- Admin cuộn danh bạ xuống giữa/dưới rồi bấm một liên hệ (ví dụ Cô Huyền PL) thì sidebar nhảy về đầu.
- Khi tìm một liên hệ rồi bấm mở, chữ trong ô tìm kiếm vẫn còn.

Root cause:
- `contact-directory-admin.js` bắt mọi `v21-contact-store-change` bằng `scheduleSync({scrollToTop:true})`.
- Mở conversation có thể lập tức mark-read, sinh contact-store patch và extension Admin cưỡng bức `scrollTop=0`, dù `shell.js` đã giữ đúng viewport.
- Module danh bạ được dynamic-import ngoài canonical bundle nên cần build-key để tránh browser giữ bản JS cũ.

Final contract:
- `v21-contact-store-change` chỉ sync/reorder và luôn giữ `.wm-sidebar-navigation.scrollTop`; mark-read không được kéo danh bạ về đầu.
- Tin nhắn mới vẫn có thể reorder theo `latest_at`, nhưng viewport hiện tại thuộc về người dùng và không bị ép về row 1.
- Click đúng `[data-contact-select]` sẽ xóa `query` + giá trị input tìm kiếm rồi sync danh sách; nút `...` quản lý liên hệ không bị coi là mở contact.
- Dynamic import `contact-directory-admin.js` được gắn `__build=<app-build-id>` để deploy mới không dùng cache module cũ.
- Không thêm polling/request/Realtime owner mới.

Commits:
- code + regression test: `2a304b7f54a1ed816f61c949962badaaf6620a52`;
- sửa contract test cũ đang yêu cầu hành vi nhảy-top: `efbfee7e7873869657a4176ba024da5bbb05d5ea`;
- sync canonical `index.html/version.json`: `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.

Verification:
- Verify V21: PASS trên `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.
- Deploy Chat Pages: PASS.
- Build canonical + verify canonical: PASS.
- Pages deploy + custom-domain HTTPS probe: PASS.
- Production build id: `568463e3960f72cd91676e369aac91e464ca5ae982838b87da450dfeb3c1dfa2`.


## Ảnh chat — mở full phải giữ độ nét

Triệu chứng:
- ảnh trong bong bóng chat nhìn nét nhưng khi mở viewer toàn màn hình thấy mềm/mờ hơn.

Root cause:
- Composer cũ ép mọi ảnh lớn về cạnh tối đa 1600px và JPEG/WebP quality 0.78;
- ảnh trên bubble chỉ rộng khoảng 360px nên khó thấy suy giảm, nhưng viewer toàn màn hình/Retina phóng vùng ảnh lớn hơn nên lộ rõ;
- production có nhiều media canonical bị chạm đúng trần 1600px, xác nhận đây là đường nén thực tế chứ không phải CSS viewer.

Final contract:
- JPEG/JPG/PNG/WebP có cạnh <=4096px và <=15 MiB được giữ nguyên byte, không re-encode chỉ vì file >512 KiB;
- ảnh lớn hơn 4096px vẫn resize có kiểm soát về 4096px, quality encode 0.92;
- giới hạn upload 15 MiB hiện hữu không đổi;
- viewer/cache/Storage owner không đổi, không thêm request/polling/proxy/log;
- ảnh đã gửi trước patch vẫn giữ chất lượng file đã lưu; patch áp cho ảnh gửi mới.

Resource impact:
- không tăng số request;
- media mới có thể lớn hơn trước nên tăng byte Storage/egress theo kích thước ảnh thực, đổi lại viewer giữ độ nét sản phẩm; vẫn bị chặn bởi giới hạn 15 MiB/ảnh.

Commit production: `7e2403a5fe97f0f797c0811a403100a69facf0e4`.
- build id: `5b34014013eb2c58da951f3078708400d73bf71e7c1f8f9c6ade5215ff05e030`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages build/deployment: PASS;
- canonical build/verify: PASS;
- custom-domain production probe: PASS.
