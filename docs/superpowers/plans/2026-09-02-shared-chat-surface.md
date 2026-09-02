# Shared Chat Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách User/Admin thành hai shell mỏng dùng chung viewport, composer/timeline, gesture/icon, call/notification surface và mở đường cho attachment/reaction mà không tạo state owner trùng.

**Architecture:** Shared modules nằm dưới `src/viewport`, `src/ui`, `src/chat/ui`, `src/chat/attachments`, `src/chat/reactions`. `user-main.ts` và `admin-main.ts` chỉ resolve role/conversation, mount shell-specific panels rồi kết nối shared owners. LiveKit/Supabase message runtime hiện tại được giữ làm nguồn sự thật.

**Tech Stack:** Vite 8, TypeScript 6, Vitest 4, Supabase JS, LiveKit Client, PWA Service Worker.

**Spec:** `docs/superpowers/specs/2026-09-02-shared-chat-surface-design.md`

## Global Constraints

- User1/User2 chỉ chat/call với Admin; không User↔User.
- Một hành vi một owner; không tạo message/call/viewport state machine thứ hai.
- iOS Safari/Home Screen PWA và Android Chrome/PWA là release gate mobile.
- Input mobile >=16px; composer theo VisualViewport, không magic offset.
- Desktop Enter=Gửi, Shift+Enter=xuống dòng; Mobile Enter=xuống dòng.
- Voice message không dùng LiveKit.
- PWA background/lock/notification/audio route là best effort.
- Mỗi user-visible source change bump `APP_VERSION`.
- CI `npm run build` phải PASS trước merge main.

---

### Task 1: Viewport + Composer Contract

**Files:**
- Modify: `src/viewport/state.ts`
- Modify: `src/viewport/controller.ts`
- Test: `src/viewport/state.test.ts`
- Create: `src/chat/ui/composer-behavior.ts`
- Test: `src/chat/ui/composer-behavior.test.ts`
- Modify: `src/user.css`
- Modify: `src/admin.css`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`

**Interfaces:**
- Produces `--app-visual-height`, `--app-keyboard-inset`, `data-keyboard-open` for both shells.
- Produces `composerEnterAction({ isMobile, shiftKey }) => 'send' | 'newline'`.

- [ ] Add failing tests for keyboard inset clamping and Enter contract.
- [ ] Verify PR CI fails for the missing composer behavior.
- [ ] Implement minimal behavior and wire both shells to `setupViewportController()`.
- [ ] Switch composer input to textarea and use shared keyboard rule.
- [ ] Apply visual-height/safe-area CSS to User and Admin; keep font-size >=16px.
- [ ] Verify focused tests and PR CI PASS.

### Task 2: Shared Icon Set + Edge Drawer Gesture

**Files:**
- Create: `src/ui/icons.ts`
- Test: `src/ui/icons.test.ts`
- Create: `src/ui/edge-drawer.ts`
- Test: `src/ui/edge-drawer.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`
- Modify: `src/user.css`
- Modify: `src/admin.css`

**Interfaces:**
- `icon(name, label)` returns accessible SVG markup/element without emoji glyphs.
- `EdgeDrawerController` owns open/close/edge-swipe threshold only; shells own drawer content.

- [ ] Add failing tests for icon accessibility and edge gesture thresholds.
- [ ] Implement shared SVG icons and drawer controller.
- [ ] Replace functional text/emoji icons for call/menu/back/send/plus/mic where surfaced.
- [ ] Wire User drawer to account/notification actions and Admin mobile drawer to inbox.
- [ ] Verify tests + CI.

### Task 3: Shared Timeline + Composer Surface

**Files:**
- Create: `src/chat/ui/timeline.ts`
- Test: `src/chat/ui/timeline.test.ts`
- Create: `src/chat/ui/composer.ts`
- Test: `src/chat/ui/composer.test.ts`
- Create: `src/chat/ui/surface.ts`
- Test: `src/chat/ui/surface.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`
- Create: `src/chat/ui/chat-surface.css`

**Interfaces:**
- Surface consumes canonical message state, current profile/peer IDs, send callback, call action.
- Surface emits no backend state of its own.

- [ ] Add failing tests proving User/Admin rendering uses one timeline/composer contract.
- [ ] Implement shared timeline renderer and composer.
- [ ] Mount it from User shell and selected Admin conversation.
- [ ] Delete duplicated message/composer rendering from both mains.
- [ ] Verify text chat/realtime/call wiring regression tests + CI.

### Task 4: Attachment / Link / Message Actions Foundation

**Files:**
- Create: `src/chat/attachments/types.ts`
- Create: `src/chat/attachments/controller.ts`
- Test: `src/chat/attachments/controller.test.ts`
- Create: `src/chat/ui/message-actions.ts`
- Test: `src/chat/ui/message-actions.test.ts`
- Create: `src/chat/ui/linkify.ts`
- Test: `src/chat/ui/linkify.test.ts`
- Modify backend adapter/schema only if existing message contract requires it.

**Interfaces:**
- Attachments remain part of message model; no second realtime channel.
- Message actions expose heart/copy/share/open based on message capability.

- [ ] Add failing tests for safe linkification and attachment/action capability mapping.
- [ ] Implement attachment metadata model and upload boundary against existing Supabase storage/message owner where supported.
- [ ] Add image/file chooser UI and image viewer.
- [ ] Add MediaRecorder voice-message path independent of LiveKit.
- [ ] Add one ❤️ reaction owner with realtime if backend contract supports it; otherwise add schema/RPC migration in same task with tests.
- [ ] Verify integration + CI.

### Task 5: Account / Notification UI + Cleanup

**Files:**
- Modify: `src/user/auth.ts` and account owner modules as needed.
- Create account change-password UI/controller under User shell.
- Reuse `src/notifications/*`; do not fork.
- Audit/delete proven dead duplicate code only.
- Modify: `src/version.ts`, `src/version.test.ts`.

**Interfaces:**
- User1 guest remains able to chat.
- User2 login/session restore/change password/logout do not alter canonical conversation history unexpectedly.

- [ ] Add failing tests for account state actions and notification policy controls.
- [ ] Implement account menu actions and notification toggles/test notification.
- [ ] Audit User/Admin duplicate wiring and legacy demo paths; delete only proven dead code.
- [ ] Bump named app version.
- [ ] Run full `npm run build` via GitHub Actions.
- [ ] Merge PR to `main`, verify deployment, then create Google Drive checkpoint with commit/tests/rollback/next-state.
