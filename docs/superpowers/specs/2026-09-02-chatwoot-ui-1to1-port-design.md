# TAPHOA CHAT — Chatwoot UI 1:1 Port Design

Date: 2026-09-02
Status: DESIGN APPROVED IN CHAT, AWAITING SPEC REVIEW
Target: `1sl2tp/chat`
Primary reference: `chatwoot/chatwoot-mobile-app` (`develop`)
Secondary reference: `chatwoot/chatwoot-react-native-widget` (`develop`)
License: MIT; copied or substantially ported source must preserve the Chatwoot copyright and MIT notice.

## 1. Goal

Replace the current patch-by-patch TAPHOA chat presentation with a stable UI ownership model derived directly from Chatwoot Mobile. The objective is not to migrate TAPHOA to React Native. The objective is to mirror the relevant Chatwoot UI source read-only and port its visible structure, geometry, interaction model, and component boundaries 1:1 into the existing Vite + TypeScript Web/PWA application.

Business architecture remains TAPHOA-specific:

- User ↔ Hỗ trợ only.
- User 1 = guest; User 2 = account.
- No User ↔ User chat.
- Supabase remains data/auth/realtime owner.
- LiveKit remains call media owner.
- Existing notification/PWA infrastructure remains runtime owner.

## 2. Why Chatwoot becomes the visual source of truth

The existing TAPHOA UI accumulated overlapping owners: shell CSS, shared ChatSurface CSS, admin management decorators, call compaction, media renderers, viewport logic, and PWA presentation fixes. That made one visible symptom possible to fix in Admin while remaining broken in User.

Chatwoot Mobile already separates the conversation into stable owners:

- `ChatHeaderContainer` / `ChatHeader`
- `MessagesListContainer` / `MessagesList`
- `MessageComponent` + content-specific renderers
- `ReplyBoxContainer`
- audio recorder/player owners
- conversation list owners
- menu/bottom-sheet owners

TAPHOA will reuse the same ownership boundaries in web form so User and Admin cannot silently diverge.

## 3. Legal/source policy

### 3.1 Mirror policy

Create a read-only vendor mirror under:

`vendor/chatwoot-mobile-ui/`

The mirror records the exact upstream repository, branch/commit, file path, SHA-256, and license notice. Mirrored files are not edited in place.

Minimum mirrored source set for the first port:

- `LICENSE`
- `src/screens/chat-screen/ChatScreen.tsx`
- `src/screens/chat-screen/components/chat-header/**`
- `src/screens/chat-screen/components/message-list/**`
- `src/screens/chat-screen/components/message-item/**`
- `src/screens/chat-screen/components/message-components/**`
- `src/screens/chat-screen/components/reply-box/**`
- `src/screens/chat-screen/components/audio-recorder/**`
- `src/screens/conversations/ConversationScreen.tsx`
- conversation list/header/item components needed to reproduce the Inbox screen
- referenced UI constants/theme values required to understand geometry

The first mirror is source/reference only; it is excluded from the Vite runtime bundle.

### 3.2 Port policy

All runtime code lives outside `vendor/` and is a Web/PWA adaptation. The port preserves Chatwoot's component responsibilities and visible behavior but maps React Native primitives to browser primitives.

Examples:

- `SafeAreaView` → CSS `env(safe-area-inset-*)` + viewport controller
- `FlashList inverted` → stable DOM/virtual-list abstraction with newest content visually at bottom and explicit scroll owner
- `KeyboardStickyView` → fixed grid row + `VisualViewport` contract
- `Pressable` → semantic `button`/interactive element
- React Native bottom sheets → accessible web drawer/popover/sheet
- Tailwind RN token values → Web CSS tokens

## 4. Screen architecture

### 4.1 Admin

Admin no longer owns a permanently visible split-pane as the canonical interaction model.

Primary navigation:

1. Inbox screen
2. Select User
3. Full-screen Conversation screen
4. Back returns to Inbox

Desktop may optionally preserve a wide-screen convenience mode later, but it must compose the same Inbox and Conversation owners; it may not create separate message/composer implementations.

Inbox defaults to only two sections:

- USER 2
- USER 1

No default `Tất cả` or `Chưa đọc` chips. Search stays above the grouped list. The groups are rendered by one owner, not overlaid by a decorator.

### 4.2 User

User opens directly into the same Conversation presentation owner used by Admin. User-specific differences are data/capability differences only:

- title/status copy
- available account actions
- whether a back button/menu exists

User and Admin share:

- header geometry
- timeline geometry
- message renderers
- link preview renderer
- attachment renderers
- audio player
- reaction placement
- call event renderer
- composer
- viewport/keyboard/scroll behavior

## 5. Conversation geometry

Canonical structure:

```text
ConversationScreen
├── ChatHeader
├── TimelineViewport (minmax(0, 1fr), only vertical scroller)
│   └── MessagesList
└── ReplyBox / Composer (non-scrolling bottom row)
```

Hard contracts:

- conversation shell is exactly the visual viewport height
- timeline owns vertical scrolling
- composer never participates in timeline scrolling
- composer remains visible after messages/media grow
- keyboard opening changes available viewport, not document height ownership
- focusing composer scrolls the active conversation to the latest message
- sending a message scrolls to latest
- if user manually scrolls up, remote new messages do not force a jump; show a new-message affordance instead
- when asynchronous media/link-preview height changes while sticky-to-bottom, continue anchoring to the bottom

## 6. Message layout and grouping

Follow Chatwoot's `MessageWrapper` responsibility rather than independent bubble CSS rules.

Each message is first classified by presentation role, then rendered by its specific content renderer.

Presentation roles:

- incoming text
- outgoing text
- image
- audio
- generic file
- link preview
- system/activity
- call summary
- failed/retry state

Grouping rules:

- consecutive text messages from the same sender may visually group
- grouped bubbles reduce repeated corner radii/spacing metadata
- metadata belongs to the message footer and never shares absolute coordinates with reaction controls
- reaction controls apply only to eligible ordinary messages, not system/call/media rows unless explicitly added later

## 7. Media behavior

### Image

- fixed/aspect-ratio placeholder before image load to avoid layout jump
- tap opens full-screen viewer
- contextual actions: Save / Share
- actions do not consume a permanent extra row in the timeline

### Audio

- one persistent player node per message
- play/pause, progress, elapsed/total time
- rerenders unrelated to the message must not replace an active audio element
- Save / Share live in contextual `…` actions and do not consume permanent height
- current/nearest audio row remains clickable even when composer is at bottom

### File

- compact file card
- filename, type/size where available
- contextual Open / Save / Share

### Link preview

- URL remains accessible text
- preview card displays source/title/description/image when metadata exists
- metadata parser decodes HTML entities and charset correctly
- unsupported/blocked sources fall back to URL without corrupt text

## 8. Call-event timeline

Call UI remains TAPHOA/LiveKit-owned, but timeline presentation follows the same principle as Chatwoot activity messages: system events are compact timeline events, not ordinary chat bubbles.

Rules:

- one `call_id` = one semantic call session
- multiple raw states from the same `call_id` collapse to one final timeline row
- sequential unanswered call sessions may be compacted into `N cuộc gọi chưa kết nối`
- answered calls with duration remain individually meaningful rows
- call/system rows do not show heart reaction

## 9. Composer behavior

Port Chatwoot's ReplyBox responsibility, simplified for TAPHOA.

Default compact composer:

- attachment `+`
- multiline text input, minimum 16px font on iOS Web/PWA
- microphone when input is empty
- send when text/attachment exists

Voice recording replaces the normal input area while recording instead of stacking another permanent card below it.

Account/notification checks do not live in the composer/header. They belong in the account drawer.

## 10. User account drawer

Top identity order:

1. Display name
2. `@username`
3. User type (`User 1` or `User 2`)

Then three grouped sections:

- Sửa thông tin
- Thông báo
- Quản lý tài khoản

Notification permission diagnostics and test controls live inside `Thông báo`, not on the primary chat header.

Destructive account actions are shown only when the backend capability exists. No decorative dead buttons.

## 11. CSS/token strategy

Do not copy the old TAPHOA CSS forward and continue overriding it. Introduce a new scoped token and component layer for the Chatwoot port.

Suggested runtime roots:

- `src/ui/chatwoot-port/tokens.css`
- `src/ui/chatwoot-port/conversation-shell.css`
- `src/ui/chatwoot-port/message.css`
- `src/ui/chatwoot-port/composer.css`
- `src/ui/chatwoot-port/inbox.css`

Port dimensions/colors/radii from Chatwoot's current source where they affect visible geometry. Keep TAPHOA branding only where explicitly chosen (app name/logo/domain); do not mix legacy bubble/layout rules into the new port.

## 12. Runtime adapter boundary

The UI port must not know Supabase or LiveKit implementation details.

Define small adapters:

- `ConversationViewModel`
- `MessageViewModel`
- `ConversationActionsAdapter`
- `AttachmentActionsAdapter`
- `CallTimelineAdapter`
- `AccountDrawerAdapter`

Existing Supabase/LiveKit/session code maps into these adapters. This keeps UI replacement reversible and testable.

## 13. Migration strategy

Do not rewrite the full application in one commit.

Phase 0 — Source mirror and provenance
- mirror relevant Chatwoot source read-only
- add MIT notice/provenance manifest
- add hashes/upstream ref

Phase 1 — Shared full-screen conversation shell
- ChatHeader
- TimelineViewport
- Composer
- viewport/keyboard/scroll contracts
- use for User and Admin conversation routes

Phase 2 — Message renderer parity
- text grouping/footer
- media
- audio
- link preview
- system/call rows
- contextual actions

Phase 3 — Admin Inbox parity
- search
- USER 2 / USER 1 groups
- one list owner
- open conversation full-screen/back

Phase 4 — Account drawer cleanup
- identity order
- information/notification/management sections

Phase 5 — Legacy removal
- remove superseded TAPHOA CSS owners/decorators/duplicate compactors only after the new owner is live and tests prove parity

## 14. Testing gates

### Static/source contracts
- vendor mirror contains license + provenance
- vendor code is not imported into production bundle
- User/Admin both import the same Conversation presentation owner
- no duplicate message-list/composer owner

### Unit behavior
- message classification/grouping
- call-id compaction
- media contextual actions
- link entity decode/fallback
- account grouping

### DOM/layout integration
At minimum test:

- 280, 320, 390, 480 px mobile
- narrow desktop browser around the widths shown in current screenshots
- 760/761 and 999/1000 boundaries
- 1280/1440 desktop

Verify:

- composer always visible
- timeline scroll reaches true latest message
- media resize preserves bottom anchor only when sticky
- audio node is not replaced by unrelated rerender
- reaction never overlaps time/footer
- Admin USER 2/USER 1 headers never overlay rows

### Physical-device gate

Automated CI cannot certify iOS/Android keyboard, audio route, lock-screen or installed-PWA behavior. Physical smoke remains mandatory for those claims.

## 15. Rollback

Keep the current ChatSurface implementation available behind an internal presentation switch until the port passes automated and screenshot gates. The switch is removed only after the Chatwoot port is verified and the old presentation owners are deleted.

No Supabase schema migration is required for this UI port.
No LiveKit signaling migration is required.

## 16. Definition of done

The port is done only when:

- source mirror/provenance is reproducible
- User and Admin conversation screens use one shared owner
- Chatwoot-equivalent full-screen geometry is visible on both sides
- composer/keyboard/scroll behavior is stable
- message/media/call presentation is renderer-specific
- Admin Inbox has one owner with USER 2 and USER 1 sections
- account drawer is grouped cleanly
- legacy owners are removed rather than merely overridden
- typecheck, tests, Vite/PWA build pass
- production version is bumped only after the release-source gate passes
