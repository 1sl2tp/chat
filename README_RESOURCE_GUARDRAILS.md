# TAPHOA CHAT — RESOURCE GUARDRAILS

> BẮT BUỘC cho mọi thay đổi Realtime, polling, heartbeat, Presence, Supabase RPC, cache, log, cron, push, media và retention.
>
> Quy tắc cốt lõi: **message/read-state realtime không được throttle để tiết kiệm; chi phí phải giảm ở signal phụ, recount, heartbeat, Presence, background scan và dữ liệu tạm.**

## 0. Baseline audit 2026-10-04

Trong 1 giờ kiểm tra production gần nhất:

| RPC | Số call xấp xỉ |
|---|---:|
| `v21_sync_pull` | 543/h |
| `v21_unread_count` | 459/h |
| `v21_auth_heartbeat` | 374/h |
| `v21_mark_read` | 107/h |
| `v21_sync_snapshot` | 7/h |

Kết luận: snapshot không phải nút thắt. Rủi ro là nhiều call nhỏ lặp/thừa.

Các bảng vận hành đang tăng:
- `v21_sync_events`: ~1.0 MB / 1.1k rows;
- `v21_push_outbox`: ~0.65 MB / 1.2k rows;
- `v21_sessions`: ~300 rows, phần lớn revoked;
- `v21_session_events`: ~227 rows;
- `chat_customer_summary_runs`: ~2.1 MB / 1.7k rows, nhiều failed run.

Đây là baseline xu hướng, không phải lý do tăng polling.

## 1. Message delivery là đường nóng bắt buộc

Được phép:
- Realtime subscription;
- delta pull khi có signal;
- bounded reconnect/recovery;
- direct message/push fallback chỉ để wake.

Cấm:
- interval polling message;
- full snapshot mỗi tin;
- refresh toàn contact list từ server mỗi tin;
- nhiều transport cùng render một message;
- retry nhanh vô hạn khi Realtime lỗi.

Một logical event có thể có nhiều wake signal, nhưng **chỉ một SyncEngine runner** xử lý và phải coalesce.

## 2. Presence chỉ là advisory

Presence không phải message transport, không phải read receipt, không phải canonical online truth.

Bắt buộc:
- publish khi subscribe;
- publish khi online/foreground/hidden/route/contact thay đổi nếu UI cần;
- interaction thường (click, keydown, input) chỉ cập nhật local timestamp, không được `track()` theo từng thao tác.

Cấm:
- Presence per keystroke/click;
- Presence interval vài giây;
- tăng Presence rate để “làm realtime nhanh hơn”.

Nếu Supabase log có `ClientPresenceRateLimitReached`, ưu tiên dừng spam Presence trước khi thêm fallback khác.

## 3. Heartbeat

Heartbeat chỉ giữ session/device liveness và phát hiện revoke fallback; không phải message delivery.

Guardrail:
- không được ngắn hơn 60 giây nếu không có test chứng minh bắt buộc;
- page hidden không heartbeat định kỳ;
- foreground/online được phép heartbeat ngay một lần;
- Realtime session-event vẫn là đường revoke tức thời.

Không dùng heartbeat để kéo message/contact/unread.

## 4. Sync pull / snapshot

- First boot hoặc cursor gap → snapshot.
- Bình thường → delta `v21_sync_pull`.
- `reset_required=true` phải rebuild snapshot và cập nhật cursor.
- Không gọi snapshot để “cho chắc” sau mỗi Realtime event.
- Một wake không được mặc định pull hai lần nếu outbox không tạo server change.
- Outbox send có thay đổi server mới được phép pull lại để lấy canonical ACK/event.
- Wake/reconnect phải single-flight + coalesce.

## 5. Unread / read-state

Read receipt phải chính xác, nhưng không cần RPC recount hàng loạt.

- `markRead` chỉ khi conversation đang visible.
- Nhiều message liên tiếp phải debounce/coalesce mark-read.
- `v21_unread_count` phải single-flight/cooldown; cấm 5–10 request trong cùng vài trăm ms.
- UI được dùng ContactStore/read-state hiện có để render tức thời.
- Server recount dùng cho boot, foreground/recovery, push dirty hoặc khi state local không chắc chắn.

## 6. Push

- Admin Web Push = background notification + fallback wake.
- Push không ghi/nhân bản canonical message.
- Push dirty không được vừa wake sync vừa gọi nhiều unread recount độc lập.
- Same-conversation foreground có thể suppress system notification nhưng **không được suppress wake UI**.
- User foreground nhận qua Realtime; không tạo polling chỉ vì user không có admin push.

## 7. Database retention

Canonical giữ lâu dài:
- `v21_messages`;
- `v21_conversations`;
- `v21_read_states`;
- canonical account/device metadata cần thiết;
- media metadata/file theo product retention.

Operational data phải bounded:
- `v21_sync_events`;
- `v21_session_events`;
- sent/dead `v21_push_outbox`;
- revoked session history;
- failed/old summary run;
- temporary retry/debug rows.

`v21_sync_pull` đã có `reset_required` khi cursor cũ hơn retained window, nên sync-event được phép TTL **sau khi** retention migration có test reset→snapshot.

Không áp TTL production bằng ad-hoc SQL trong incident; phải migration riêng.

## 8. Cron/background

Một chức năng chỉ có một owner scheduler.

Hiện production có:
- customer-care refresh theo lịch nghiệp vụ;
- customer-summary dirty scan 5 phút;
- Zalo keepalive;
- các cron khác thuộc Getlink/Tạp hóa, không được coi là Chat realtime.

Không thêm cron để chữa message realtime.
Không để browser polling + Supabase cron + Realtime cùng làm một việc.

## 9. Logs

Production:
- không log mỗi message/event/heartbeat;
- không dump payload/body/auth/token;
- không full stack lặp lại;
- lỗi lặp phải rate-limit/dedupe;
- incident debug phải có thời hạn và tắt sau verify.

Ưu tiên log summary:
```text
chat_sync reason=realtime pulled=3 sent=0 reset=false duration_ms=84
```

## 10. Media

- Binary không nằm trong Postgres/log.
- Supabase Storage chỉ giữ media product thực sự cần.
- DB giữ metadata/storage key.
- Không proxy media byte qua Edge Function chỉ để phát.
- Thumbnail/avatar/media request không được tạo message sync polling.

## 11. Quy tắc sửa traffic

Trước khi thêm request mới phải trả lời:
1. Event nào kích request?
2. Owner hiện tại đã có signal tương đương chưa?
3. Có thể coalesce/single-flight không?
4. Có cache/local state đủ để render trước không?
5. Page hidden có cần request này không?
6. Retry tối đa bao nhiêu?
7. Payload tối đa bao nhiêu?
8. Dữ liệu sinh ra được giữ bao lâu?

Không trả lời được 8 câu trên → chưa merge.

## 12. Mục tiêu vận hành

- Message arrival: event-driven, tức thời.
- Read-state: event-driven + coalesced.
- Snapshot: hiếm.
- Presence: lifecycle-driven.
- Heartbeat: chậm và visibility-aware.
- Background work: dirty/demand-driven.
- Operational tables: bounded retention.
