# TAPHOA Chat — Clean UI Rebuild Design

Date: 2026-09-03
Branch: `ui-clean-rebuild`
Status: APPROVED IN CHAT — awaiting implementation plan

## 1. Goal

Rebuild the presentation layer from a clean root instead of continuing to reskin or patch the existing UI.

The product stays intentionally small:
- User chats directly with Support/Admin.
- Admin sees a conversation list, opens one user, then chats full-screen.
- Chat, call, notifications, menu/account and authentication remain the only product surfaces needed now.

The new UI must visually follow the supplied reference library, especially `gemini-code-1788360368834.html` for mobile hierarchy and `gemini-code-1788360206797.html` for reusable component styling.

## 2. Source of truth

Presentation source of truth:
- Plus Jakarta Sans.
- Slate dark hierarchy (`slate-950`, `slate-900`, `slate-800`, `slate-700`).
- Chatwoot accent `cw-500 = #1f93ff`.
- Reference spacing, padding, radius, icon placement, message grouping, composer geometry, menu geometry and call presentation.

Product/runtime source of truth:
- Current Supabase message/auth/data flows.
- Current LiveKit call flow.
- Current PWA/push notification/runtime behavior.
- Current attachment, audio recording and account logic.

Reference UI must not introduce unsupported product features.

## 3. Architectural decision

Do NOT continue the current layered approach where old DOM/CSS remains active and new CSS overrides it.

Instead:
1. Create a new presentation root.
2. New screens render only new UI components.
3. Old UI modules are removed from active imports/render paths.
4. Existing runtime functions are connected through adapters/events/callbacks.
5. Delete or quarantine obsolete presentation files after parity is verified.

This is a presentation replacement, not a runtime rewrite.

## 4. Screen hierarchy

### User

`UserApp → ChatScreen`

ChatScreen owns:
- Header.
- Message timeline.
- Composer.
- Menu/account sheet.
- Notification controls.
- Call overlay/compact call state.

There is no inbox for User.

### Admin

`AdminApp → InboxScreen | ChatScreen`

InboxScreen:
- Simple TAPHOA header.
- Search.
- Conversation rows.
- Create User action only if the current runtime actually exposes it.
- Account/notification menu.

Selecting a user replaces InboxScreen with ChatScreen full-screen.

ChatScreen:
- Back button.
- Avatar/name/status.
- Call action.
- Message timeline.
- Composer.
- Conversation menu only for existing supported actions.

No permanent split-pane on mobile. Desktop may use wider geometry but must preserve the same screen ownership instead of creating a separate CRM workspace.

## 5. Shared ChatSurface

User and Admin use the same ChatSurface structure:

`ChatHeader → MessageList → Composer`

Differences are passed as data/capabilities:
- title/avatar/status.
- back button visibility.
- call/menu actions.
- sender orientation.

No duplicate User/Admin chat implementations.

## 6. Messages

Message rendering follows the reference hierarchy:
- incoming/outgoing row orientation.
- text bubble.
- link preview.
- file card.
- image card.
- audio bubble/player.
- call/system event where already supported.
- time/delivery footer.
- message menu attached to the bubble, not floating over content.

Audio must be presented as a proper reference-style message component rather than the oversized legacy player currently visible in production.

## 7. Composer

Composer is a single sticky owner at the bottom.

It contains only supported controls:
- attachment.
- input.
- voice recording/microphone.
- send.

Recording changes composer state; it does not create a second unrelated panel.

Keyboard/safe-area behavior stays owned by the existing PWA/viewport runtime and is connected to the new composer container.

## 8. Call UI

Keep LiveKit/signaling/runtime unchanged.

Replace only presentation:
- incoming call.
- active full call.
- compact/minimized call.
- hidden state where current product supports it.
- mic/speaker/accept/decline/end controls that already exist.

Do not invent hold, transfer, queue, CRM or other enterprise call actions.

## 9. Notifications and menus

Use the reference dropdown/sheet style but only wire current features:
- notification permission/state.
- account/profile.
- password where supported.
- logout.

No fake reports, automation, team management or CRM entries.

## 10. Authentication

Authentication gets a clean standalone screen from the same visual system.

Rules:
- no legacy card styling leaking in.
- no browser autofill/background color left unhandled.
- one clear form owner.
- preserve existing credentials/auth runtime and error handling.

## 11. Version badge

The build/version label must remain available for debugging but must not interfere with product geometry.

Preferred presentation:
- small diagnostics label in a non-layout-breaking corner or developer area.
- never placed inside the main header or composer flow.

## 12. CSS and dependency rule

Tailwind/build-time utilities remain available because the reference uses Tailwind semantics.

However the rebuild must avoid dual ownership:
- new screen/component owns its classes/styles.
- legacy CSS must not override new screen geometry.
- global CSS limited to reset, font, safe-area, viewport and truly global tokens.

Old presentation CSS is removed from active imports as each new surface replaces it.

## 13. Migration sequence

1. Build clean UI root and global tokens.
2. Build shared ChatSurface with static/reference fixtures.
3. Build message renderers.
4. Build composer.
5. Connect existing chat runtime.
6. Build Admin InboxScreen and navigation to ChatScreen.
7. Connect Admin runtime.
8. Build User menu/account/auth surfaces.
9. Build call presentation and connect LiveKit state.
10. Remove old presentation imports/routes.
11. Verify responsive/PWA behavior and only then cut over.

## 14. Verification gates

Must PASS before `main`:
- typecheck.
- full automated test suite.
- Vite production build.
- reference/cutover tests proving old presentation owners are not active.
- User send/receive text.
- file/image/audio message rendering.
- audio recording/send.
- Admin list → open chat → back.
- User direct chat.
- notification/menu/account flows.
- incoming/active/compact/end call UI with existing LiveKit runtime.
- iPhone Safari/PWA and Android Chrome/PWA geometry.
- keyboard + safe-area + sticky composer.
- no horizontal overflow at supported mobile widths.

## 15. Non-goals

Do not:
- rewrite Supabase.
- rewrite LiveKit.
- change message schema.
- add CRM.
- add reporting/automation/team features.
- add unsupported call controls.
- keep a desktop enterprise workspace just because it exists in a reference file.
- preserve old UI for visual compatibility.

## 16. Success condition

The result should feel like the supplied reference was adapted to TAPHOA's small product, not like the old TAPHOA UI was recolored.

A user should see one clean chat app. An admin should see one clean inbox and one clean full-screen chat. Runtime behavior stays the same underneath.
