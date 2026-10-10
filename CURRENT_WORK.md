## 2026-10-10 — Incoming message leaves 'Nhắn tin...' hard to tap (SOURCE PATCHED, E4 PENDING)

- Symptom: user screenshot reports that after a new incoming message, tapping the text-composer placeholder 'Nhắn tin...' sometimes fails to enter edit mode.
- Scoped owner: index.source.html CSS pointer hit-testing and app.js focus delegation only. No Supabase/Realtime/push/scroll mutation.
- Source evidence: Composer footer parent uses pointer-events-none Tailwind utility; active editor layer relies on pointer-events-auto class. Unread/return-to-bottom control is a sibling lane with its own pointer target and nested motion layer. The textarea itself is not disabled; empty #editorWrap padding previously did not delegate focus.
- Patch: explicit scoped native pointer-events rules for #composerInteractive/#composerShell/#editorWrap/#editor; keep #threadScrollControlWrap click-through except the actual #threadScrollControl button; stack editor over badge lane. Add one trusted pointerdown handler for EMPTY composer padding ONLY; native textarea clicks retain own caret, selection and Vietnamese IME; all buttons/audio/media untouched.
- E0 SPEC-CHAT-COMPOSER-CLICK-20261010 locked in central Google Sheet; E1 focused Node VM+CSS contract test; E2 browser integration unavailable; E3 verify/deploy awaiting workflow; E4 real incoming-message click Safari/PWA/desktop PENDING; E5 resource 0 backend calls expected, actual traffic trace PENDING.
- Rollback: revert only index.source.html CSS and app.js focus handler; test/workflow removable; no data rollback. Do not claim production DONE without a real authenticated click.
- Independent TAPHOA CI/CD gate project remains separate and untouched by this Chat bug.

## 2026-10-10 — Công nợ gửi khách: phân bổ FIFO tham khảo + nhận xét Admin riêng

- Owner: `v21_admin_send_debt_summary` (shared Supabase), existing one-click Admin composer path; không thêm RPC/cron/job/notification trigger.
- DB migration `20261010061148_chat_debt_share_fifo_breakdown.sql` đã áp dụng qua Supabase migration `chat_debt_share_fifo_breakdown_20261010`.
- Khi công nợ dương: gửi tổng phát sinh, đã thu, điều chỉnh, còn lại; lần thu gần nhất; khoản chưa bù trừ cũ nhất; tối đa 5 dòng còn lại theo phương pháp trừ khoản cũ trước. Có ghi chú đây chỉ là bảng đối chiếu tạm, không gán thanh toán pháp lý cho từng đơn.
- Với số dư bằng 0 hoặc âm: giữ chính sách tin nhắn hiện hành. Không tự gửi bất kỳ tin nào khi deploy.
- `admin_assessment` (mức mua / diễn biến thanh toán dựa trên lịch sử đơn/thu) chỉ trả cho Admin, UI chỉ hiện trong hint sau khi bấm gửi thành công; không ghép vào `body` gửi khách.
- E1 test nguồn `tests/test_v21_debt_share_summary.py`; E2 DB tạo hàm PASS + đọc lại live function PASS; E3 Verify/Pages, E4 gửi thử với tài khoản thử nghiệm và E5 resource trace chờ xác minh. KHÔNG đánh dấu real customer send DONE.
- Rollback: khôi phục function `v21_admin_send_debt_summary` từ `20261004203500_chat_send_debt_summary_atomic.sql`, rồi revert riêng `admin-composer-actions.js`. Không xóa ledger hoặc nhắn khách khi rollback.

## 2026-10-09 — Chat notification click: show newest immediately (SOURCE PATCHED)

Symptom: Admin taps an incoming message notification; previous thread reading position appears for a moment and the screen visibly scrolls down, instead of opening directly at the newest message.

Owner/contract:
- Push click/open: `admin-push-controller.js` (only one-time navigation/visibility intent).
- Session reading position: `v21-message-store.js` (one-shot override only for that contact).
- Rendering/scrollTop remains **only** `app.js`'s `V21ConversationBridge/ScrollController`, and Shell/SyncEngine keep the canonical selection/Realtime path.
- `README_MAINTENANCE.md §4a` and central Sheet `CHAT-01` hold the rule.

Patch:
- Before push navigation, temporarily conceal only ScrollRoot; remove the mask after contact mount, FOLLOW_TAIL and <=2px tail-distance stable for 3 frames.
- Use old ScrollController's `replace(...,viewState:null)` when push target is currently active; for another contact, ignore saved `USER_AWAY` state only for that target.
- Abort/failure/logout/newer push restores visibility; bounded 2-second fail-open prevents permanently hidden Chat.
- Normal contact selection still restores its saved reading position. No new calls, cron, message renderer, scroll writer or DB writes.

Commits: MessageStore `72405b65be911a6ae1eb025bd9cefa6e16f8bd6e`; PushController final `71578db5052783668e86942eaf47dd1dc43fb2a4`; regression test `a0ec54ef0f8d1cf4e3ce937330e7f8e8e7cc3be6`; rule docs `35c5710e39cf07caa634cea0c4c81bed1aaa787c`.

Verification so far:
- JavaScript syntax checks on the two changed modules: PASS.
- Isolated MessageStore runtime: normal session restores history; notification session forces tail; same-contact explicit tail: PASS.
- Mocked Admin Push runtime: different contact, same contact, rejected open, mask cleanup: PASS.
- Added `tests/test_v21_admin_web_push_notification_tail.js` to automatic Verify V21 glob, covering cold-open as well.
- **CI/Pages deploy and real Safari/PWA/desktop notification click not yet independently verified**. Do not mark PROD VERIFIED solely from tests.
- Resource difference expected: 0 extra backend/API calls and 0 DB writes, one bounded temporary presentation intent per user notification click. Real before/after network capture outstanding.
- Rollback: revert both runtime files to preceding commits; no database rollback required.

Next: inspect existing Verify V21 / Pages result without starting a duplicate workflow; test live Admin click on existing tab/same contact/cold PWA and confirm no visible scroll. Only then close gates and update this handoff.

---

## 2026-10-06 — Zalo bridge simplified to linked-account event routing

Final architecture:
- Chat web/mobile is canonical for text + image + audio + file.
- Admin -> Chat user always works as Chat first.
- If that user has a current Zalo link owned by the Admin, the existing DB trigger creates exactly the Zalo outbound delivery row and signals Render immediately.
- If there is no Zalo link, the Chat message remains Chat-only: no outbound row, no Render wake, no Zalo action.
- Zalo -> Render text calls canonical ingress once; only a current linked Zalo ID becomes a Chat message. Unlinked text returns NULL and is ignored.
- Zalo -> Render media checks canonical ownership before downloading bytes; unlinked media stops before download/upload/storage.
- Render outbound periodic fallback polling was removed. It now uses the DB event signal plus one startup catch-up after login/restart.
- No Render-side canonical link cache, no new table, no new cron, no second message owner.

Production:
- PR #156 merged as `c89311cdd70d342cb0b64dd3c31c85e12743214a`.
- Verify V21: PASS.
- Render `taphoa-zalo` auto-deploy `dep-db2g1ibncjis73cksajg`: LIVE.
- Runtime log confirms: `outbound event signal enabled; startup catch-up only`.
- Current 24h outbound queue after deploy audit: pending=0, failed=0, sent=145.

Resource impact:
- removes the old 15-minute fallback poll (~96 scheduled outbound checks/day while idle);
- outbound work exists only for linked Chat recipients;
- inbound unlinked media still performs only the tiny ownership preflight, never binary transfer;
- inbound unlinked text performs only its event-triggered canonical link lookup.

## 2026-10-06 — Forwarded image to Zalo-linked contact repair

Symptom:
- Admin used Chuyển tiếp on an existing Chat image toward a Zalo-linked customer, but no destination image message was created and the customer therefore received nothing on Zalo.

Production evidence:
- At 16:55 Vietnam time, `v21_message_forward_source` returned HTTP 200 for the forward attempt immediately after incoming image messages.
- The expected next steps (`v21-media` destination write and `v21_media_assets_send`) never occurred, so no outbound media row existed for Zalo to deliver.
- Existing text delivery to Cô Huyền and previous successful media forwards confirmed the Zalo bridge itself was healthy.

Root cause / patch:
- Browser forwarding depended on Storage server-side `copy(sourceKey,destinationKey)`.
- Forwarding now reads the canonical source Blob and uploads a fresh destination object under the forwarding Admin's account/conversation path, then calls the existing `v21_media_assets_send`.
- The existing media insert trigger remains the single owner that enqueues Zalo outbound media; no new polling, scheduler, retry owner, or Zalo transport path was added.

Verification:
- PR #154 merged as `7d6f271e6483cfc81eaa5feb97219e5fd594a8fe`.
- Forward-media contract: PASS.
- Verify V21 on main: PASS.
- Deploy Chat Pages: PASS.
- Canonical build id: `583739b3725f1f1b07ca4bde7c4dbfd880d396e9595068e3e4b1953acfe7119a`.

Resource impact:
- Only a manual forward of media changes traffic: one Storage download plus one Storage upload per forwarded asset instead of Storage copy.
- Existing 15 MiB/media limit remains. No background traffic was added.

Rollback:
- Revert PR #154 / merge commit above.

## 2026-10-06 — Receipt auto-collection removed

- Bill images are ordinary Chat media only.
- Chat does not OCR/AI-scan bills and does not create automatic debt collections from images.
- Debt/collection changes remain explicit/manual through the existing canonical debt flows.
- No receipt polling, OCR worker, Edge Function, or Render route is an active owner.

## 2026-10-05 — Zalo media bandwidth preflight

Production verification for media preflight:
- GitHub commit: `cdb0da4a0f50c43fc61485e7a35c2318529a09ac`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Supabase `v21-zalo-bridge`: production version **8**;
- Render `taphoa-zalo` deploy `dep-db1a86eq1p3s73f3pmhg`: **live** on the same commit;
- post-deploy health: HTTP 200, `status=logged_in`;
- production canonical probe on an unlinked Zalo contact: `v21_zalo_media_target(...)=NULL`, confirming the new Render preflight will stop before binary download for that class of traffic.


Symptom:
- Render Zalo listener receives upstream messages from the whole logged-in Zalo account, not only Chat-linked contacts.
- Media was downloaded by Render and multipart-uploaded to Supabase before Supabase decided whether the sender was linked to Chat.

Measured production evidence before patch:
- ~333.5 MB inbound media request bytes / 24h on `v21-zalo-bridge`;
- ~331.8 MB (~99.5%) of the large media traffic returned the small "not a target" response and was discarded;
- text traffic is small and is not the bandwidth bottleneck.

Patch:
- new lightweight `media_target` bridge action using canonical `v21_zalo_media_target`;
- Render calls `messageGateway.mediaTarget(event)` before `downloadInboundMedia()`;
- if `needed=false`, Render stops immediately and never downloads/posts the binary;
- linked media keeps the existing idempotent upload/storage/message path;
- no polling, no new database table, no second ownership cache.

Expected resource impact:
- remove nearly all media bandwidth generated by unlinked Zalo contacts/groups;
- keep keepalive/realtime listener unchanged;
- add only one tiny metadata preflight per inbound media event.

Rollback:
- revert the bridge/server/Edge Function commit and redeploy `v21-zalo-bridge`; no schema rollback is required.

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


## 2026-10-08 — Chat UI Foundation V1 / mobile directory compact
- Base UI patch: `4a7585cf66613beba5ec03649d06b8eb605b5b9b`.
- Added local `ui-foundation.css` (visual tokens only; no business/realtime/push ownership).
- Mobile directory prioritizes `Chọn người → Chat`: compact `Danh bạ`, 12px gutter, 16px mobile search input, tighter search/filter spacing; contact row remains 60px / avatar 40px.
- Notification routing audited only: `sw.js` carries contact/conversation IDs and `admin-push-controller.js → ChatAppShell.NavigationCommand.openContact()` forces route `chat`; no Push/DB/Realtime code changed.
- Resource impact: 0 DB writes, 0 provider calls, 0 polling/logging/background work added; one small local CSS asset.
- Initial Verify V21 failed only because generated `index.html/version.json` were not committed with modular source. Pages build generated + verified canonical output successfully; this commit synchronizes generated artifacts.


## 2026-10-08 — Chat Header + Composer Foundation pass
- Scope: visual-only, mobile-first RegionTop + Composer.
- Header uses `--ui-chat-header-mobile:60px`, 44px mode controls, safe horizontal gutter; no Chat/Work/call route logic changed.
- Composer uses 44px touch controls for + / mic / send, 16px input, 12px page gutter and local radius/shadow tokens; keyboard/VisualViewport/audio/send owners unchanged.
- No DB/API/realtime/push/provider/log/background changes. Generated `index.html/version.json` are synchronized in the same commit.
