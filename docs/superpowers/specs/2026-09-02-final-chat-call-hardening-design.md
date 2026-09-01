# Final Chat/Call Hardening Design

## Goal
Hoàn thiện 5 mốc đã duyệt mà không thêm kiến trúc lớn: sửa Từ chối cuộc gọi đa thiết bị, realtime danh sách Admin, khóa lifecycle Call/PWA bằng test, tinh gọn UI, và final hardening/checkpoint.

## Constraints
- Giữ Vite + TypeScript + Supabase + LiveKit + PWA + GitHub Actions.
- Không thêm Firebase, Redis, queue riêng, native CallKit/FCM hay state machine 2 cuộc gọi.
- User1/vãng lai: Chat only, không Call/Push/persistence.
- User2: Chat + Call + Push; Admin tách riêng nhưng có thể cùng máy/browser.
- Một thao tác Từ chối của callee phải kết thúc toàn bộ incoming call trên mọi device của cùng profile.
- Admin inbox phải tự refresh preview/unread/order khi chat_messages thay đổi, kể cả conversation chưa mở.
- Realtime watcher phải nhẹ: một channel cho Admin inbox, không polling.
- UI chỉ tinh gọn presentation; không đổi nghiệp vụ.
- Không tuyên bố PASS iPhone/Android vật lý nếu chưa có thao tác thiết bị thật; thay vào đó khóa behavior có thể tự động hóa bằng test.

## Design
### 1. Decline semantics
Thay `chat_decline_voice_call` để bất kỳ device hợp lệ nào của callee bấm Từ chối thì call chuyển ngay sang `declined`, tất cả `chat_call_device_targets` còn ringing của call đó cùng chuyển `declined`. Không giữ logic “còn device khác thì call tiếp tục ringing”.

### 2. Admin inbox realtime
`admin/runtime.ts` sở hữu lifecycle inbox. Thêm một `AdminInboxWatcher` mỏng dùng Supabase Realtime `postgres_changes` trên `public.chat_messages`; INSERT/UPDATE/DELETE đều gọi refresh inbox qua debounce ngắn. Watcher start sau initial inbox load và stop khi Admin runtime dừng/logout. Realtime message detail của conversation đang mở vẫn giữ nguyên như hiện tại.

### 3. Call/PWA lifecycle verification
Giữ Service Worker navigation, Push TTL/urgency và `VoiceCallSession` foreground recovery hiện có. Bổ sung test chứng minh notification navigation vẫn đúng scope, incoming ringing được rediscover sau boot/foreground, và decline UI reset tức thì trước RPC. Không thêm workaround cho giới hạn iOS background WebRTC.

### 4. Compact UI
Giữ layout hiện tại nhưng giảm chiều cao header/action, chuyển Admin inbox item thành 2 dòng `name + unread badge` / `preview`, giảm độ nặng các nút phụ. Không đổi route, form hay call controls.

### 5. Final hardening
Chạy full typecheck/test/build, áp migration production, fast-forward main chỉ khi branch không behind, xác minh Pages deploy, kiểm Push/session/outbox read-only, cập nhật checkpoint repo và Google Drive. Rollback là main SHA trước merge.
