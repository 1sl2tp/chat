# TAPHOA STRUCTURE LOCK V3

## Product boundary
Only 1:1 Chat, 1:1 Call and Admin Directory/account management.

## Adaptive screen ownership

### Mobile / narrow Admin
`AppShell -> Header -> TopStatusSlot -> ScreenHost -> Directory OR Chat`

Only the active mobile top-level screen is mounted. Inside Chat, `ChatScreen` keeps `ChatPrimary` mounted and may switch its visible body to `MediaManager` without destroying the conversation state.

### Desktop Admin >= 900px
`AppShell -> ScreenHost -> AdminWorkspace -> DirectoryPane | ChatPane`

Directory and Chat stay visible together. Selecting a contact replaces only ChatPane. Opening Media creates an inner Media pane inside Chat; Directory remains mounted.

### Chat owner tree
```text
ChatScreen
├── ChatPrimary
│   ├── MessageList        <- only message scroll owner
│   └── Composer           <- bottom safe area owner
└── MediaPane
    └── MediaManager       <- derived view of original messages
```

### Overlays
`OverlayRoot -> Popover | FullCall | Sheet | Confirm | ImageViewer`

Popover is for frequent contextual actions near the trigger. Sheets remain for forms/keyboard-safe editing. FullCall is never dismissed by outside click.

## Conversation data contract
- Normal messages store `senderId` and `recipientId`; no permanent `me/peer` domain semantics.
- UI derives incoming/outgoing from the current participant.
- `MessageList` renders only; `ChatScreen` owns conversation mutation, preventing duplicate appends.
- Only the latest outgoing normal message may show `Đang gửi / Đã gửi / Đã xem`; older/outgoing and all incoming messages show time only.

## Message action contract
Actions replace the existing footer metadata slot instead of growing the message:
- text: `Trả lời · Sao chép`
- link: `Trả lời · Sao chép · Mở`
- image/file/audio: `Trả lời · Lưu`
- call/system events: no generic message actions
- missed call: contextual `Gọi lại`

Image tap still opens viewer; viewer also exposes `Lưu`.

## Attachment contract
Composer `+` opens a compact local menu: `Ảnh | Camera | Tệp`.
- `Ảnh`: image-library picker
- `Camera`: capture input (`capture=environment`)
- `Tệp`: generic file picker
- Mic remains a separate recording flow.

## Call event contract
Call history lives in the conversation timeline. One call record stores `callerId`, `calleeId`, outcome and optional duration, then renders relative to the viewer:
- connected caller: `Gọi đi · mm:ss`
- connected callee: `Gọi đến · mm:ss`
- unanswered caller: `Không trả lời`
- unanswered callee: `Cuộc gọi nhỡ` + `Gọi lại`
- caller cancels before connect: `Đã hủy`

## Media Manager contract
Media Manager is a derived view, never a second media database.
- Tabs: `Ảnh | Tệp | Link | Ghi âm`.
- Every item retains original `messageId`; album images also retain image index.
- `Xem gốc` closes Media, restores Chat, scrolls to the exact source message and highlights it briefly.
- Closing Media normally restores the previous Chat scroll position.
- User and Admin use the same manager for the active 1:1 conversation.

## Admin action placement
- Directory `+`: `Thêm KH | Thêm nhóm` near the top.
- Contact row: Guest `Tạo | Xóa`; Customer `Sửa | Nhóm | Xóa`.
- Customer `Nhóm` expands immediately below that contact.
- Active-chat `⋯` is an anchored popover. Admin gets `Đa phương tiện` + subject actions; User gets `Đa phương tiện | Tài khoản`.
- Rare/destructive directory management stays in the manager sheet and all deletes confirm.

## Viewport / keyboard / zoom
- `ViewportController` is the only `visualViewport` owner.
- No child uses `100vh/100dvh`.
- Composer is not fixed.
- Mobile inputs/textarea are >=16px.
- User zoom is not disabled.
- Header owns top safe-area; Composer/FullCall own bottom safe-area.

## Icon contract
- One SVG stroke family from `src/ui/icons.ts`.
- ViewBox 24x24, stroke width 2, round caps/joins.
- 40–44px normal controls -> 18px icon.
- 22–36px compact controls -> 16px icon.
- No arbitrary numeric call-site icon sizes.

## Font / Scrollbar / PWA
- UI: Plus Jakarta Sans, then system fallback; no font binaries packaged.
- Touch/mobile: scrollbar chrome hidden while scrolling stays enabled.
- Fine-pointer desktop: slim 6px scrollbar.
- Manifest, favicon, 192/512, maskable and Apple touch icons are packaged.
- `public/sw.js` is the sole Service Worker owner for Web Push display and notification-click navigation.
- `TaphoaPushService` owns browser permission/subscription sync and binds each subscription to the current Supabase `deviceId`.
- Notification clicks resolve canonical `conversation_id/call_id` into the existing V3 router; legacy backend `navigate` strings never own client routing.

## Runtime compatibility
UI-generated IDs go through `utils/id.ts`. It uses secure `randomUUID()` when available and falls back when standalone/non-secure contexts do not expose it. No screen/overlay directly depends on secure-context-only APIs for basic navigation.

## Backend boundary
Supabase Auth/Chat, LiveKit Call and PWA Push connect through service modules without changing the geometry and interaction owners above. Supabase remains the canonical owner of conversation/call state and notification outbox/subscription records; LiveKit transports call audio only; `TaphoaPushService` + `public/sw.js` own browser Web Push delivery/navigation only.
