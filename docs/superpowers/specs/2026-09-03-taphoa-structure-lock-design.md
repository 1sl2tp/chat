# TAPHOA Chat/Call 1:1 — STRUCTURE LOCK Design

## Goal
Build a small, stable PWA-ready UI architecture for direct 1:1 chat and call between a user and Admin, with a compact Admin directory. Preserve the approved interaction model while separating layout ownership, screen lifecycle, overlays, viewport/keyboard handling, and call runtime so local changes cannot blank or re-render unrelated regions.

## Product Scope
Only these product areas are in scope:
- 1:1 chat: text, reply, file, image/album + caption, recorded audio, message actions.
- 1:1 call: outgoing, incoming-ready architecture, connected, full call, mini call, mute, end call, duration.
- Admin directory: Customers first, Guests last, search, customer groups, add customer, promote Guest -> Customer, edit, group, delete, bulk-delete Guests with confirmation.
- Account sheet and top status/notification slot.

Explicitly out of scope: CRM/tickets, multi-party chat/call, speaker-route control, complex permissions, dashboards, floating draggable PiP, backend implementation.

## Domain Model
`accountType` is technical state and is not shown as User 1/User 2 in the UI:
- `guest`: internal User 1; UI label is `Vãng lai`; actions are `Tạo` and `Xóa`; cannot belong to a customer group.
- `customer`: internal User 2; UI label is `Khách hàng`; actions are `Sửa`, `Nhóm`, `Xóa`; may belong to a custom customer group.

Customer groups (`Gia đình`, `Bạn bè`, `VIP`, etc.) are classification data, independent from `accountType`. Removing a custom group returns its members to the base Customer classification, never to Guest.

## Screen Model
The primary content adapts by width without changing mobile behavior:

```text
MOBILE / narrow Admin
APP ROOT
└── APP SHELL
    ├── HEADER
    ├── TOP STATUS SLOT
    └── SCREEN HOST
        ├── DIRECTORY SCREEN
        └── CHAT SCREEN

DESKTOP Admin >= 900px
APP ROOT
└── APP SHELL
    ├── HEADER
    ├── TOP STATUS SLOT
    └── SCREEN HOST
        └── ADMIN WORKSPACE
            ├── DIRECTORY PANE
            └── CHAT PANE

OVERLAY ROOT
├── FULL CALL
├── SHEET
├── CONFIRM
└── IMAGE VIEWER
```

Mobile Admin keeps Directory -> Chat -> Back/edge-swipe. Desktop Admin keeps Directory and Chat mounted together inside one `AdminWorkspace`; selecting a contact replaces only the Chat pane. User mode remains direct Chat.

## Layout Ownership
- `AppShell` owns app height and top-level rows only.
- `Header` owns top safe area.
- `TopStatusSlot` owns call-mini / incoming-call / important status placement.
- `DirectoryScreen` owns directory filter/search/list geometry; only list scrolls.
- `ChatScreen` owns two rows: message list + composer; only message list scrolls.
- `Composer` owns bottom safe area. It is never `position: fixed`.
- `FullCall` owns its overlay and bottom call-control safe area.
- `OverlayManager` owns modal z-order and outside-click dismissal.

No child component may independently use viewport-height geometry.

## Viewport, Keyboard, Zoom
Use viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
```

Do not disable user zoom. Mobile text inputs/textarea must render at >=16px to prevent focus zoom. `ViewportController` is the single owner of `window.visualViewport` and publishes CSS variables:
- `--app-height`
- `--keyboard-height`
- `--viewport-offset-top`

`AppRoot` uses `--app-height`; child screens use `height:100%` / `min-height:0`. No `100vh`/`100dvh` in child modules. Keyboard appearance shrinks AppShell, therefore the message list shrinks and Composer naturally stays visible.

## Render Strategy
Do not globally `render()` on small state changes.
- Route change mounts a screen.
- New message appends to MessageList.
- Call duration updates only `[data-call-timer]` text nodes.
- Mute updates only call control state.
- Contact unread/time can update its metadata node.
- Sheets/confirm/viewer are mounted in OverlayRoot only.

## Overlay and Dismiss Contract
One `OverlayManager` controls sheets, confirm dialogs, image viewer and transient menus. Temporary UI closes on outside click and Escape unless explicitly non-dismissible. Destructive actions always require confirmation. Full call and active/incoming call status cannot be dismissed by outside click.

Z-order is centralized by CSS tokens. Toast/notification must never overlay FullCall; notifications queue while full call is active and surface afterward.

## Gesture Contract
- Swipe left on a directory row reveals only that row's contextual actions.
- Edge swipe right from the left screen edge performs Back (Chat -> Directory); it never edits a row.
- Tapping outside closes row actions.
- Message/image gestures remain local to their owner.

## Directory Geometry
A contact row keeps identity/content fixed. Opening actions replaces only the right metadata owner; the row never translates horizontally. Normal metadata reserves stable slots for unread, relative time and `...`. Action copy stays short:
- Customer: `Sửa | Nhóm | Xóa`
- Guest: `Tạo | Xóa`

No group badge or content-type icon is shown in each row preview. Relative time: today `HH:mm`, yesterday `Hôm qua`, 2–6 days weekday label, older same year `DD/MM`, previous year `DD/MM/YY`.

## Call Contract
No speaker button. Full call shows avatar/name/status, `Mic`, `Kết thúc`, and minimize. Outgoing connecting has no duration; connected starts duration. Mini call lives in TopStatusSlot. Call animation runs only when opening/restoring FullCall, never every timer tick. Call timer updates text nodes only.


## Icon, Font and Scrollbar Contract
All interface icons come from `ui/icons.ts` and use one 24x24 stroke language (`stroke-width=2`, round linecap/linejoin). Call sites never pass arbitrary pixel sizes. Parent controls own icon size: normal 40–44px controls use 18px icons; compact 22–36px controls use 16px icons. Header Back/Call/Menu, Directory, attachment, Mic, recording, delete, file/media, viewer navigation and call-end all use the shared library.

UI typography is `Plus Jakarta Sans` with system fallbacks. Font binaries are not bundled; web builds link Google Fonts and keep the fallback usable offline. PWA packaging includes manifest, SVG favicon, 192/512 PNG icons, maskable 512 and Apple touch icon.

Scroll remains functional everywhere. Touch/mobile hides scrollbar chrome; fine-pointer desktop shows a slim 6px scrollbar. No component invents a separate scrollbar style.


Runtime-created UI/message/call IDs use a shared ID utility with a non-secure-context fallback; standalone previews must not depend directly on `crypto.randomUUID()`.

## Production Transition
This Structure Lock remains backend-agnostic. Service interfaces are created for Auth, Chat, Call and Notifications. Supabase, LiveKit and PWA Push plug into those interfaces later without changing screen geometry or component ownership.

## Conversation-first Interaction Lock
The conversation timeline is the source of truth for text, images/albums, files, links, audio and call history. Messages store participant IDs (`senderId`, `recipientId`) and the UI derives left/right, `Gọi đến/Gọi đi`, and delivery status relative to the current viewer. Only the latest outgoing message may display `Đang gửi/Đã gửi/Đã xem`; incoming messages display time only.

Message footer actions replace the time/status slot instead of adding layout rows: text uses `Trả lời · Sao chép`; links add `Mở`; image/file/audio use `Trả lời · Lưu`. Media taps still open their primary viewer/player and are not blocked by footer actions.

Composer attachment is a compact inline quick menu adjacent to the composer: `Ảnh | Camera | Tệp`. Camera, image library and file picker remain separate UI actions although they share the same send pipeline beneath the UI.

Call history is a compact `CallEvent` inside the timeline. One call record is rendered relative to the current participant (`Gọi đi`, `Gọi đến`, `Không trả lời`, `Cuộc gọi nhỡ`, `Đã hủy`); missed calls may expose only the contextual `Gọi lại` action.

Each 1:1 conversation has a MediaManager derived directly from its original messages, never a duplicate media database. Tabs are `Ảnh | Tệp | Link | Ghi âm`. Every media item retains its `messageId` (and image index for albums), supports appropriate save/open/copy behavior, and `Xem gốc` closes the media view, returns to the timeline, scrolls to the owning message and highlights it briefly. Closing Media without `Xem gốc` returns to the previous timeline position.

On mobile MediaManager replaces the chat body without unmounting the conversation. On desktop it opens as a panel inside the Chat pane; the Admin Directory pane remains mounted. Frequently used chat-person actions live in an anchored quick menu near the header; edit/account forms may still use sheets for keyboard safety, while group selection expands in-place.
