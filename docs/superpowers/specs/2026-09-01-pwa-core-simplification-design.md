# TAPHOA PWA Core Simplification Design

## Goal

Hoàn thiện nền Chat/Call theo hướng ít lớp và ít lỗi hơn mà không đổi stack hiện tại: Vite + TypeScript + Supabase + LiveKit + PWA. User1 chỉ Chat; User2 và Admin có Chat + Call + Push; Admin và User phải dùng đồng thời trên cùng browser mà không chiếm Auth/device/Push của nhau.

## Locked principles

- Không thêm Firebase, Redis, queue riêng, framework UI hay native app.
- Không sửa lại nền LiveKit audio đã PASS nếu không có bằng chứng mới.
- Mỗi owner chỉ có một Auth namespace, một device namespace, một ServiceWorkerRegistration và một PushSubscription tương ứng.
- Không dùng `navigator.serviceWorker.ready` để suy đoán owner Push.
- Logout chỉ có một hướng: dừng runtime → dọn Push/session của đúng owner → Auth sign out.
- Guest vẫn là ephemeral; hard-kill được xử lý bằng server fallback tối giản, không phụ thuộc nhiều browser lifecycle event.
- UI chỉ thu gọn, không đổi luồng nghiệp vụ.

## 1. PWA / Push ownership

`setupPwa(owner)` phải trả về chính `ServiceWorkerRegistration` được tạo cho owner đó. Root dùng scope `/`; Admin dùng scope `/admin/`; cả hai tiếp tục dùng chung `/sw.js` để tránh duplicate worker code.

Mọi thao tác Push phải nhận registration cụ thể. `CallPushRegistration` sẽ dùng một browser adapter đóng trên registration được truyền vào; adapter không đọc global `navigator.serviceWorker.ready`. Guest cleanup cũng unsubscribe trực tiếp subscription của root registration, không đụng registration Admin.

Kết quả cần đạt: mở User2 và Admin cùng browser theo bất kỳ thứ tự nào vẫn tạo/upsert Push bằng đúng endpoint của đúng scope.

## 2. Session teardown

User2 tiếp tục dùng `chat_end_user_session()` trước Auth signout.

Admin có cùng contract riêng `chat_end_admin_session()`: chỉ chấp nhận profile Admin hiện tại, xóa `chat_sessions` của đúng `auth_session_id`, rồi xóa device nếu không còn session. Client Admin unsubscribe đúng admin-scope Push trước RPC; sau đó sign out. Không đụng User2/root registration trên cùng máy.

## 3. Guest server cleanup

Không dựa vào `pagehide` để bảo đảm xóa server vì iOS/Android có thể kill process. Giữ explicit `chat_end_guest_session()` khi app còn sống. Server fallback phải nhỏ và opportunistic nếu schema cho phép xác định stale guest an toàn; chỉ cân nhắc scheduler nếu không có cách an toàn khác.

Không được xóa guest đang hoạt động chỉ dựa trên một timestamp không có heartbeat đáng tin cậy.

## 4. Lightweight UI

Giữ nguyên cấu trúc hai app hiện tại. Chỉ thu gọn header/account actions, create-user/login panel và khoảng trắng; không thêm component framework. Hiển thị build ID rút gọn ở cả User và Admin bằng `VITE_BUILD_ID` để biết production đang chạy bản nào. Hỗ trợ tối thiểu 280px tiếp tục là gate.

## 5. Call / notification audit

Sau khi ownership/session ổn định, rà `VoiceCallSession`, UI và SW notification lifecycle. Chỉ sửa lỗi có bằng chứng/test; không đổi transport LiveKit. PWA background/locked-screen sẽ tận dụng Web Push trong giới hạn nền tảng, không giả lập CallKit/FCM native.

## Verification gates

- Test mới phải RED trước implementation và GREEN sau implementation.
- Toàn bộ `npm run build` phải PASS trên branch: TypeScript + Vitest + Vite build.
- Sau merge, cùng gate phải PASS trên `main` và GitHub Pages deploy phải SUCCESS.
- Production DB phải không có duplicate Push endpoint ownership; `test` không được có active session/device/Push; Admin/User2 logout phải chỉ dọn đúng owner.
- Tạo checkpoint repo + Google Drive sau khi production verification hoàn tất.
