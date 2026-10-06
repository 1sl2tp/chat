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
- app visible/foreground: `v21_sync_events` áp canonical payload thẳng vào cache/UI;
- hidden/closed user app: dừng foreground Realtime;
- admin mobile background: Service Worker/Web Push là owner;
- boot/foreground/reconnect: delta pull catch-up;
- bounded reconnect/recovery;
- direct message/push fallback chỉ để wake khi canonical Realtime không tới.

Cấm:
- interval polling message;
- full snapshot mỗi tin;
- refresh toàn contact list từ server mỗi tin;
- nhiều transport cùng render một message;
- retry nhanh vô hạn khi Realtime lỗi.

Một logical event chỉ có một render owner: canonical `v21_sync_events`. Pull/fallback được phép replay nhưng phải idempotent theo id/version.

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

- Admin Web Push = background channel của admin mobile + fallback wake khi app đang mở.
- Push không ghi/nhân bản canonical message.
- Push dirty không được vừa wake sync vừa gọi nhiều unread recount độc lập.
- Same-conversation foreground có thể suppress system notification nhưng **không được suppress wake UI**.
- User chỉ nhận foreground khi app visible; hidden/closed không chạy message polling.
- Admin mobile hidden/closed dùng Web Push; khi app foreground lại thì catch-up delta ngay.

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


### Retention production 2026-10-04

Một cron duy nhất `chat-operational-retention-daily` chạy 03:43 UTC, mỗi bảng tối đa 10.000 dòng/lượt:

| Operational data | Retention |
|---|---:|
| `v21_sync_events` | 14 ngày |
| `v21_session_events` | 7 ngày |
| `v21_push_outbox` sent/dead | 7 ngày |
| `v21_sessions` revoked | 30 ngày |
| `chat_customer_summary_runs` failed | 7 ngày |
| `chat_customer_summary_runs` done | 30 ngày |

Canonical `messages/read_states/conversations/media` không thuộc cleanup.

Nếu cursor client cũ hơn vùng `sync_events` còn giữ, `v21_sync_pull` trả `reset_required=true`; client bắt buộc gọi `initializeFromServer()`/snapshot rồi tiếp tục từ cursor mới.

Không dùng `VACUUM FULL` trong production Chat để đòi giảm file ngay; regular autovacuum tái sử dụng free space mà không khóa bảng dài.


### Customer-care auto-send

Customer-care auto-send is a separate business workflow, not Chat realtime.

Guardrails:
- eligibility is only `contact_group='customer'` (KH);
- one scheduler owner: `chat-customer-care-auto-send`;
- one customer at most per 5-minute pass;
- exact send windows: 09:30–11:35 and 14:15–17:35 Asia/Ho_Chi_Minh;
- one care message/customer/day;
- do not enqueue while Zalo outbound is pending/retrying;
- leave at least 2 minutes after any other successful Zalo outbound;
- do not insert a care message into a customer conversation active within the last 60 minutes;
- use the canonical `taphoa_chat_notify_customer` path; never bypass message/Zalo ownership;
- the pacing is intended to prevent bursts, not to claim or guarantee third-party anti-spam acceptance.


### Zalo inbound media preflight

- Zalo listener may receive upstream events outside the Chat-linked account set, but Render must not download media before canonical Chat ownership is known.
- For image/audio/file inbound, Render first sends only `zalo_id + zalo_message_id + event_at` to `v21-zalo-bridge`.
- `v21-zalo-bridge` resolves ownership through canonical `v21_zalo_media_target`.
- `needed=false` => stop immediately: no Zalo media download, no multipart upload, no Storage write.
- `needed=true` => only then download the binary and continue the existing idempotent media ingest path.
- Text ingress remains on the existing lightweight canonical path; do not add a second text preflight just to save a sub-KB request.
- Do not cache link ownership in Render as canonical truth. If a bounded cache is added later it must only optimize a verified canonical lookup and must tolerate stale entries safely.


### Zalo bridge — event-driven linked-account routing

Canonical rule:
- **Chat is always the source of truth.** Web/mobile text, image, audio and file are saved/realtime in Chat first.
- Chat -> Zalo: only an Admin message whose recipient has a current `zalo_user_links` mapping creates `zalo_message_links(outbound,pending)`. No link => no Zalo row, no Render wake, no Zalo send attempt.
- Zalo -> Chat text: Render forwards the event to the protected ingress; `v21_zalo_ingress` resolves the canonical link. No link => returns NULL and creates no Chat message.
- Zalo -> Chat media: Render performs only the lightweight target lookup first. No link => stop before downloading Zalo bytes, multipart upload or Storage write.
- Do not keep a second canonical link cache in Render. `zalo_user_links` remains the single ownership source.
- Outbound transport is event-driven by `zalo_outbound_signal_trg -> /outbound-now`. Render may do **one startup catch-up** after login/restart, but must not interval-poll outbound work.
- A failed outbound row may be retried on the next real outbound signal or service restart; do not add a periodic poll just to retry it.
- Storage cleanup is maintenance, not message transport, and must not be used to wake/send messages.

Resource effect:
- removed the 15-minute outbound fallback poll (~96 empty bridge checks/day when idle);
- unlinked Chat recipients generate zero Zalo outbound work;
- unlinked Zalo media incurs only the tiny ownership preflight and no binary transfer;
- unlinked Zalo text incurs one event-triggered canonical lookup only, with no stored Chat/Zalo delivery row.
