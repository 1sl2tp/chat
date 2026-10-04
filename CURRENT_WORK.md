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

Current HEAD tại thời điểm lập rule: `4b3603ed2df8b70924f7db64d07e3c266c37c0fc`.

## Audit resource

1 giờ gần nhất:
- sync_pull ~543;
- unread_count ~459;
- heartbeat ~374;
- mark_read ~107;
- snapshot ~7.

Điểm cần tối ưu tiếp, theo thứ tự:
1. Presence chuyển hẳn lifecycle-only, không publish interaction.
2. Heartbeat >=60s và hidden-aware.
3. SyncEngine không pull lần hai nếu outbox không gửi gì.
4. Unread recount single-flight/cooldown.
5. Thiết kế retention migration riêng cho sync-events/push-outbox/session-events/revoked sessions/summary runs.

## Quy tắc

Không thêm polling message để chữa incident này.
Không đổi canonical message/read contract.
Mọi patch tiếp theo phải đọc README_MAINTENANCE + README_RESOURCE_GUARDRAILS trước.
