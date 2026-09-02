# Shared Chat Surface Design

## Mục tiêu

Giữ hai giao diện riêng:
- User: `chat.taphoa.xyz/`
- Admin: `/admin/`

Nhưng Chat/Call/Composer/Viewport/Gesture/Icon/Attachment/Reaction phải dùng chung owner. User và Admin chỉ là hai shell khác nhau quanh cùng một conversation surface.

## Vai trò

- User1 = khách/vãng lai, vào thẳng chat với Admin.
- User2 = tài khoản đã đăng nhập, vẫn chat đúng conversation với Admin và có account/call/push theo capability.
- Admin = trung tâm hỗ trợ, có inbox nhiều User, chọn một conversation rồi dùng cùng shared Chat surface.
- Không có User↔User chat/call.

## Kiến trúc

### Shared core

- `src/viewport/`: đo VisualViewport, keyboard occlusion, safe geometry.
- `src/ui/icons/`: một bộ SVG icon duy nhất, không dùng emoji/text glyph làm icon chức năng.
- `src/ui/gesture/`: edge swipe/drawer gesture dùng chung.
- `src/chat/ui/`: shared Conversation Surface gồm timeline, message render, composer và message actions.
- `src/chat/attachments/`: attachment contract cho image/file/audio message; không tạo realtime/state machine riêng.
- `src/chat/reactions/`: reaction message; V1 chỉ ❤️.
- `src/call/`: VoiceCallSession + call UI dùng chung như hiện tại.
- `src/notifications/`: policy/payload chung; User/Admin shell chỉ đăng ký và hiển thị control.

### User shell

Chỉ sở hữu:
- User1/User2 session/account surface.
- menu tài khoản: nâng cấp/đăng nhập, đổi mật khẩu, thông báo, đăng xuất.
- resolve conversation với Admin và mount shared surface.

### Admin shell

Chỉ sở hữu:
- login Admin.
- inbox/chọn User.
- tạo/quản trị User theo capability hiện có.
- mount shared surface cho selected conversation.

## Viewport / keyboard / zoom

- iOS Safari và Home Screen PWA được coi là hai runtime viewport khác nhau nhưng dùng cùng controller.
- App shell dùng `--app-visual-height` do `src/viewport/` publish thay vì chỉ dựa `100dvh`.
- Composer nằm ngay trên visible keyboard và safe-area, không fixed bằng magic offset.
- input/textarea mobile giữ font-size >=16px để tránh Safari focus zoom.
- Composer là textarea dùng chung: Desktop `Enter=Gửi`, `Shift+Enter=xuống dòng`; Mobile `Enter=xuống dòng`, bấm nút Gửi để gửi.

## Gesture / giao diện

- Tinh thần ChatGPT: ít khung, timeline là trọng tâm, composer nổi nhẹ sát bàn phím.
- edge swipe từ trái mở drawer.
- User drawer: account/notification.
- Admin mobile drawer: inbox + quản trị.
- Không dùng swipe cho thao tác phá hủy.
- message long-press/menu: ❤️, copy, share; theo loại message có open/download.

## Attachment / link / reaction

- Text, image, file, audio, link và reaction đều thuộc cùng message/conversation.
- Image: chọn → preview → upload → message → thumbnail → tap viewer.
- File: chọn → metadata tên/dung lượng → upload → message → open/download.
- Audio message: MediaRecorder → nghe thử → upload attachment; không dùng LiveKit.
- URL tự linkify; preview link là phụ, lỗi preview không làm lỗi message.
- Reaction V1 chỉ ❤️, toggle và realtime theo message id.

## Notification / Call

- Foreground đúng conversation: không system notification chat.
- Foreground incoming call: UI + chuông trong app, không notification trùng.
- Background/closed/locked: Web Push best effort; OS quyết định âm/rung cuối cùng.
- Khi chat+call cùng lúc: call ưu tiên cảnh báo; chat giữ unread/badge.
- PWA không cam kết native CallKit/background call.

## Quy tắc triển khai

1. Một hành vi một owner.
2. Không sửa symptom ở `user-main.ts`/`admin-main.ts` nếu owner nằm ở shared module.
3. Mỗi mốc phải có test trước khi production code.
4. Không đổi backend/LiveKit nếu không cần cho yêu cầu UI/shared-surface.
5. User-visible source change phải bump `src/version.ts`.
6. CI typecheck + test + Vite/PWA build phải PASS trước merge main.
