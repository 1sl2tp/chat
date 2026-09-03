# TAPHOA Chat / Call — STRUCTURE LOCK V3

Small, backend-agnostic UI architecture for 1:1 Chat + Call and Admin Directory.

## Run
```bash
npm install
npm run dev
```

## Verify / package
```bash
npm run verify
python tests/e2e-smoke.py
node scripts/build-standalone.mjs
```

## Responsive model
- Mobile Admin: Directory -> Chat -> Back.
- Desktop Admin >=900px: Directory + Chat stay visible together in `AdminWorkspace`.
- User: direct 1:1 Chat with Support.
- Media Manager: replaces Chat body on mobile; opens inside Chat pane on desktop.

## Conversation-first UI
- Sender/recipient are stored as participant IDs; left/right is relative to current viewer.
- Only latest outgoing message displays `Đang gửi / Đã gửi / Đã xem`.
- Footer actions reuse the same metadata slot: text `Trả lời · Sao chép`; link adds `Mở`; image/file/audio use `Trả lời · Lưu`.
- Composer `+` exposes separate `Ảnh | Camera | Tệp` actions; Mic remains separate.
- Call history is rendered in the message timeline (`Gọi đi`, `Gọi đến`, `Cuộc gọi nhỡ`, `Không trả lời`, `Đã hủy`).
- Per-conversation Media Manager derives from original messages: `Ảnh | Tệp | Link | Ghi âm`, with `Xem gốc` navigation.
- Admin frequent actions stay near the object: Directory `+` for `Thêm KH | Thêm nhóm`; contact `Nhóm` opens inline; rare destructive management remains in manager sheet.

## UI system
- Plus Jakarta Sans via Google Fonts + system fallback; no font binaries included.
- Shared 24x24 SVG icon language; parent controls own 18px/16px icon size.
- Touch scrollbars hidden; desktop scrollbars slim.
- PWA manifest, app icons and the Web Push Service Worker live in `public/`.
- Live sessions silently sync an existing granted Push subscription; first-time permission is requested only from the explicit `Thông báo` menu action.
- Runtime IDs have a non-secure-context fallback, so standalone previews do not depend on `crypto.randomUUID()`.

See `STRUCTURE_LOCK.md` for ownership rules and `VERIFY_REPORT.md` for current gates.
