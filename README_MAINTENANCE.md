# TAPHOA CHAT — MAINTENANCE RULE

> BẮT BUỘC đọc trước mọi sửa chữa production.
>
> Mục tiêu: Chat phải realtime như trước khi cutover Supabase, nhưng sửa chữa không được làm tăng request/log/egress bằng cách thêm polling, retry hoặc fallback trùng owner.

## 1. Thứ tự bắt buộc trước khi sửa

1. Đọc `CURRENT_WORK.md`.
2. Đọc file này.
3. Nếu chạm Realtime/polling/heartbeat/Presence/RPC/cache/log/cron/push/media/retention: đọc `README_RESOURCE_GUARDRAILS.md`.
4. Ghi rõ: triệu chứng, owner nghi ngờ, bằng chứng nhỏ nhất, patch nhỏ nhất, rollback.
5. Chỉ sửa từ HEAD mới nhất của `main`.

## 2. Owner runtime

- GitHub Pages: code/UI delivery.
- Supabase Postgres/Auth: canonical account, conversation, message, read-state, session, sync-event.
- Supabase Realtime: wake transport, không phải source of truth.
- `v21-sync-engine.js`: delta pull, outbox, read-state orchestration.
- `v21-realtime-session.js`: subscribe/wake/Presence.
- IndexedDB: local cache, outbox, cursor.
- Web Push: admin background notification/fallback wake; không thay canonical message sync.
- Zalo bridge: external transport only; không được trở thành owner của canonical chat.

## 3. FAST REPAIR

Một incident phải trả lời được:

```text
Triệu chứng:
Owner:
Bằng chứng:
Last-known-good:
Patch nhỏ nhất:
Test:
Deploy:
Production probe:
Rollback:
Resource impact:
```

Quy tắc:
- Một lỗi → một owner → một patch → một deploy.
- Production regression rõ từ deploy gần nhất → rollback trước, điều tra sau.
- Không refactor/dọn code trong incident realtime.
- Không sửa cùng lúc UI + DB + Realtime + Push chỉ để “thử”.
- Probe 1 conversation / 1 account / 1 RPC trước khi scan rộng.

## 4. Contract realtime không được phá

Luồng chuẩn:

```text
message/read write
→ v21_sync_events
→ app đang mở: áp canonical event thẳng vào SyncEngine/cache/UI
→ MessageStore + ContactStore cùng cập nhật
→ active thread xuống newest
→ mark-read chỉ khi conversation thật sự visible
→ mở lại/reconnect: delta pull catch-up phần bị lỡ
```

Các invariants:
- Tin nhắn không phụ thuộc polling interval.
- Danh bạ và thread phải dùng cùng canonical event.
- Một account mở nhiều admin device: mọi session hợp lệ đều phải nhận wake.
- Chỉ `v21_sync_events` được phép áp canonical payload trực tiếp khi app đang mở.
- `v21_sync_pull` là catch-up khi boot/reconnect/gap, không phải vòng bắt buộc sau mỗi event.
- Direct `v21_messages INSERT` hoặc push chỉ được làm fallback wake; không được trở thành render owner.
- Admin mobile background dùng Web Push; user đóng app thì không chạy foreground sync.

## 4a. Mở tin từ thông báo phải hiển thị NGAY tin cuối

- **Chỉ** click thông báo tin nhắn Admin (cửa sổ đang mở hoặc mở PWA lạnh) mới được bỏ vị trí đọc cũ của **đúng liên hệ đích**. Chọn liên hệ thường, quay lại tab, đang đọc lịch sử và thao tác scroll tay phải giữ nguyên contract cũ.
- Luồng owner: SW chuyển `contactId/conversationId` → `admin-push-controller.js` đặt one-shot notification intent trước Shell navigation → `v21-message-store.js` bỏ `viewState.USER_AWAY` của liên hệ đích và gọi lại `V21ConversationBridge.replace(...,viewState:null)` nếu chính liên hệ ấy đang mở → **duy nhất `app.js` ScrollController** dựng cửa sổ tin mới nhất và điều khiển ScrollRoot.
- Che **chỉ vùng tin nhắn** trong thời gian thay vị trí; chỉ hiện khi contact đã mounted, viewport ở `FOLLOW_TAIL`, khoảng cách tới cuối ≤2px ổn định liên tiếp 3 frame. Nhằm tránh hiện cảnh chạy cuộn từ đầu/cuối vị trí đọc cũ. Bỏ che khi route lỗi, logout hoặc quá 2 giây (fail-open), không để UI bị ẩn vô thời hạn. Không dùng `scroll-behavior:smooth` hoặc viết scrollTop trong PushController/MessageStore.
- Không thêm RPC, polling, cron, catch-up thứ hai, render owner thứ hai. Push chỉ điều hướng; SyncEngine vẫn là owner đọc canonical, mark-read chỉ khi conversation visible. Intent chỉ nằm trong bộ nhớ, không ghi localStorage/IndexedDB.
- QA bắt buộc: click từ thông báo cửa sổ đang mở (khác liên hệ), đang ở chính liên hệ nhưng đọc tin cũ, cold-open khi contact cache chưa sẵn, contact không tồn tại, logout giữa transition. Mọi đường đều không được cuộn có hoạt ảnh, không để màn hình trống vĩnh viễn; chọn liên hệ thông thường vẫn khôi phục vị trí.
- Đối chiếu production sau GitHub Actions Verify V21 và Deploy Chat Pages, Safari/PWA; chưa có video/ảnh production thì không đánh dấu PROD VERIFIED.

## 5. Deploy

- Chỉ deploy runtime bị thay đổi.
- Docs-only không deploy Pages và không chạy full verify.
- Gom patch cùng owner thành một commit code chính khi có thể.
- Không commit từng ý nhỏ chỉ để kích workflow.
- Sau code change: build canonical → verify → deploy → production probe.
- Chưa production probe thì chưa nói “xong”.

## 6. Migration / DB

- Migration additive/backward-compatible trước.
- Không xóa canonical message/read/media chỉ để giảm dung lượng.
- Event/outbox/session-run là dữ liệu vận hành, phải bounded bằng retention có contract.
- Mọi delete/TTL production phải có rollback/backup logic và test `reset_required → snapshot` nếu đụng sync-event.

## 7. Sau repair

Cập nhật `CURRENT_WORK.md`:
- commit;
- root cause;
- patch;
- workflow/deploy;
- production probe;
- resource impact;
- việc còn lại.

Nếu thay đổi kiến trúc/traffic contract thì cập nhật luôn `README_RESOURCE_GUARDRAILS.md`.
