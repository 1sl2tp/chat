# CURRENT WORK — TAPHOA CHAT

Cập nhật: 2026-10-04

## Incident hiện tại

Triệu chứng sau cutover/tối ưu Supabase:
- message đã ghi server và push/badge có thể tới nhưng thread/contact không sync ngay;
- user foreground và admin multi-device có lúc không tự đồng bộ;
- Supabase Realtime log ghi `ClientPresenceRateLimitReached: client_rate_limit_exceeded`.

## Owner

- Canonical data: Supabase Postgres.
- Realtime wake/session: `v21-realtime-session.js`.
- Delta/read/outbox: `v21-sync-engine.js`.
- Push fallback: `admin-push-controller.js` + `sw.js`.

## Patch đã có

- ContactStore reorder theo `latest_at`.
- Active thread nhận canonical message event và follow newest.
- Admin push dirty đánh thức SyncEngine.
- Direct `v21_messages INSERT` thêm fallback wake.
- Presence đã được throttle để tránh spam.

Current production repair: `2d6801b0ac5000c8322ad92b6efefb758f227701`, build `1c951f5483de42a291cd2feeeb5cf52aa86514d6da6bcd06952bcda13c18ed97`.

## Audit resource

1 giờ gần nhất:
- sync_pull ~543;
- unread_count ~459;
- heartbeat ~374;
- mark_read ~107;
- snapshot ~7.

Patch runtime của incident này:
1. Presence lifecycle-only; click/keydown/input chỉ cập nhật local timestamp.
2. Heartbeat 60s, hidden không chạy; foreground/online heartbeat ngay một lần.
3. SyncEngine chỉ pull lần hai khi outbox thực sự gửi >0 item.
4. Unread recount single-flight + cooldown 750ms + tối đa một trailing refresh.
5. Direct message fallback đợi 250ms và bị hủy nếu canonical sync-event tới trước.

Còn lại sau production probe:
- retention migration riêng cho sync-events/push-outbox/session-events/revoked sessions/summary runs;
- kiểm tra Realtime log để xác nhận không còn Presence rate-limit.

## Quy tắc

Không thêm polling message để chữa incident này.
Không đổi canonical message/read contract.
Mọi patch tiếp theo phải đọc README_MAINTENANCE + README_RESOURCE_GUARDRAILS trước.


## Production verify sau patch

- Verify V21: PASS.
- Deploy Chat Pages: PASS.
- Custom domain chat.taphoa.xyz: PASS.
- Log window ngay sau deploy:
  - ClientPresenceRateLimitReached: 0;
  - v21_auth_heartbeat: 5;
  - v21_sync_pull: 10;
  - v21_unread_count: 9.
- Cần người dùng reload các tab/PWA đang mở từ trước để loại runtime cũ còn nằm trong bộ nhớ.

## Việc còn lại

1. Test thực tế 3 chiều: admin PC ↔ admin mobile ↔ user, không reload giữa các tin.
2. Sau khi realtime được xác nhận ổn, làm migration retention riêng cho operational tables.
3. GitHub Pages hiện vẫn còn native `pages build and deployment` song song với workflow `Deploy Chat Pages`; cần đặt Settings → Pages → Source = GitHub Actions để còn một deploy owner.
