# 10 · THẺ UI CHAT

**CARD:** UI-CHAT  
**VERSION:** UI-CARD-V1  
**TRẠNG THÁI:** Production V21 current structure.  
**PHẠM VI:** Chỉ UI.

## Chế độ hiển thị

- Mobile/touch: một screen chính tại một thời điểm.
- Desktop fine-pointer: workspace nhiều cột.
- PWA được hỗ trợ bằng `manifest.webmanifest` + `sw.js`.
- Auto-update: `app-update-controller.js`; hoãn reload nếu đang draft, upload/reply, audio capture, sync hoặc interaction chưa an toàn.

## Owner hiện tại

### P0 Platform
- `keyboard-inset-core.js`
- `shell-form-viewport-policy.js`
- `audio-capture-policy.js`
- `call-screen-wake-lock.js`
- `app-update-controller.js`
- `sw.js`
- `manifest.webmanifest`

Đây là nơi xử lý keyboard/viewport/device/PWA behavior; feature không tự vá Safari/Chrome.

### P1 Shell
**Owner chính:** `shell.js`

Sở hữu:
- route Chat/Work;
- desktop directory/workspace modes;
- global shell/navigation;
- call/screen-level state;
- placement các region lớn.

Desktop contract hiện dùng capability:
- từ 64rem + hover + fine pointer cho directory layout;
- từ 80rem + hover + fine pointer cho workspace rộng.

### P2 Screen / Region
- Directory/contacts;
- Conversation;
- Work;
- Call/guest-call surface;
- Account/settings related surfaces.

### P3 Component
- message bubble/media/gallery;
- composer;
- image viewer;
- forward picker;
- quote;
- customer summary;
- Zalo/account link UI;
- call invite UI.

### P4 Control
- composer input;
- send/mic/plus;
- reply/forward actions;
- viewer controls;
- account action buttons.

## Build/UI source

- Canonical HTML source: `index.source.html`.
- Build script inline nhiều CSS/JS thành `index.html`.
- Module logic hiện chủ yếu là classic IIFE + `window.V21...` contract, chưa phải ES module thuần.
- `app.js` và `shell.js` còn lớn; feature mới ưu tiên file owner riêng, không tiếp tục nhồi vào `app.js`.

## Rule đặc biệt CHAT

- Message scroller là scroll owner của conversation; composer không được làm body trở thành scroll owner.
- Keyboard/focus do Platform + composer owner phối hợp, không chữa bằng margin/padding cục bộ.
- Realtime render không được làm message list jump nếu không có lý do.
- Image viewer là overlay owner riêng; click/zoom/swipe không lọt xuống conversation.
- Mobile và desktop dùng cùng message/component contract, khác layout do Shell.
- Action menu/forward/quote/call không được tranh một gesture owner.

## Nợ UI cần tránh tăng thêm

- generated `index.html` rất lớn do inline build;
- nhiều global window module;
- `app.js` còn quá nhiều trách nhiệm;
- CSS reference + feature CSS cùng tồn tại.

Không rewrite ngay. Khi sửa feature thật, ưu tiên tách ownership rõ hơn.

## Câu hỏi bắt buộc trước khi sửa

**Vấn đề thuộc viewport/keyboard, shell/cột, conversation region, component hay control?**  
Nếu chưa xác định thì không thêm listener/CSS override.
