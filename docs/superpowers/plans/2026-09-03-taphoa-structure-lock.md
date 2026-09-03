# TAPHOA STRUCTURE LOCK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce a runnable, Vite-ready TypeScript UI architecture for TAPHOA 1:1 Chat/Call + Admin Directory with stable viewport/keyboard geometry and isolated component ownership.

**Architecture:** A single AppShell mounts one mobile primary screen at a time, while desktop Admin mounts one two-pane AdminWorkspace; overlays live in a separate OverlayRoot; VisualViewport is centralized; Chat, Directory and Call own their own DOM updates and never globally re-render for timer/message changes. Backend behavior is represented by typed service boundaries with mock implementations only.

**Tech Stack:** HTML5, CSS, TypeScript 5.8+, browser ES modules, Vite-ready package layout; dependency-free local TypeScript build/test path.

**Spec:** `docs/superpowers/specs/2026-09-03-taphoa-structure-lock-design.md`

## Global Constraints
- Keep scope to 1:1 chat/call + Admin directory/account management.
- Do not expose User 1/User 2 labels in UI.
- No speaker-route control.
- Every destructive action requires confirmation.
- Temporary menus/sheets dismiss on outside click/Escape; active call does not.
- Only Header owns top safe-area; Composer/FullCall controls own bottom safe-area.
- No child-screen `100vh`/`100dvh`; ViewportController is the single VisualViewport owner.
- Mobile form controls use at least 16px text.
- Keep customer/guest semantics distinct from customer group classification.

---

### Task 1: Foundation, domain and local build
**Files:** Create `package.json`, `tsconfig.json`, `tsconfig.local.json`, `index.html`, `src/app/types.ts`, `src/app/store.ts`, `src/utils/time.ts`, `scripts/build-local.mjs`, `scripts/test-local.mjs`.
**Interfaces:** Produces `AppState`, `Contact`, `AccountType`, `CustomerGroup`, `Store`, `formatDirectoryTime()`.
- [x] Write tests for guest/customer group invariants and relative-time formatting.
- [x] Run tests and confirm RED before implementation.
- [x] Implement typed domain/store/time helpers.
- [x] Run typecheck/tests and confirm GREEN.
- [x] Commit foundation.

### Task 2: AppShell and viewport/keyboard owner
**Files:** Create `src/app/viewport.ts`, `src/app/shell.ts`, `src/app/router.ts`, `src/styles/tokens.css`, `src/styles/layout.css`.
**Interfaces:** Produces `ViewportController`, `AppShell`, `Router` and CSS variables `--app-height`, `--keyboard-height`, `--viewport-offset-top`.
- [x] Add contract tests that forbid child viewport-height rules and require the approved viewport meta.
- [x] Verify RED.
- [x] Implement VisualViewport metrics, AppShell rows and screen host.
- [x] Verify mobile input sizing and safe-area ownership in CSS.
- [x] Run typecheck/tests and commit.

### Task 3: Overlay manager and global dismissal
**Files:** Create `src/app/overlay-manager.ts`, `src/ui/icons.ts`, `src/styles/ui.css`.
**Interfaces:** Produces `OverlayManager.openSheet()`, `openConfirm()`, `openImageViewer()`, `closeTopDismissible()`.
- [x] Add tests for destructive-confirm copy and overlay priority tokens.
- [x] Verify RED.
- [x] Implement overlay root, outside-click and Escape dismissal.
- [x] Ensure call overlay cannot be dismissed by outside click.
- [x] Run tests/typecheck and commit.

### Task 4: Admin Directory screen
**Files:** Create `src/directory/directory-screen.ts`, `src/directory/contact-row.ts`, `src/directory/contact-actions.ts`, `src/services/mock-data.ts`.
**Interfaces:** Produces `DirectoryScreen.mount()`, `openContactActions()`, and Admin flows for add/promote/edit/group/delete/bulk-delete.
- [x] Add tests: Guests cannot group; promotion changes to customer; deleting custom group returns members to base Customer; Guest actions are `Tạo|Xóa`; Customer actions are `Sửa|Nhóm|Xóa`.
- [x] Verify RED.
- [x] Implement compact list with Customers first, Guests last, no `Tất cả` filter.
- [x] Implement row action owner that replaces only right metadata; no row translation.
- [x] Implement swipe-left row actions and outside close.
- [x] Implement manager sheet: `Thêm KH`, `Thêm nhóm`, `Xóa Vãng lai` with confirmation.
- [x] Run tests/typecheck and commit.

### Task 5: Chat screen, message list and composer
**Files:** Create `src/chat/chat-screen.ts`, `src/chat/message-list.ts`, `src/chat/composer.ts`.
**Interfaces:** Produces `ChatScreen.mount()`, `MessageList.append()`, `Composer` modes text/image/recording.
- [x] Add structural tests for one scroll owner and Composer non-fixed contract.
- [x] Verify RED.
- [x] Implement chat header, message stream and bubble geometry.
- [x] Implement image/album + caption preview and image viewer handoff.
- [x] Implement recording mode `Xóa | timer | Pause/Continue | Gửi` and sent-audio progress bar.
- [x] Ensure image removal/recording discard use confirmation.
- [x] Run typecheck/tests and commit.

### Task 6: Call controller, full call and mini call
**Files:** Create `src/call/call-controller.ts`, `src/call/call-full.ts`, `src/call/call-mini.ts`, `src/services/notifications.ts`.
**Interfaces:** Produces `CallController.startOutgoing()`, `minimize()`, `restore()`, `toggleMute()`, `end()` and targeted timer updates.
- [x] Add tests for call state transitions and queued notification behavior.
- [x] Verify RED.
- [x] Implement connecting -> connected without duration before connect.
- [x] Update timer text nodes only; do not remount call each second.
- [x] Implement mini call in TopStatusSlot and restore/full transition.
- [x] Queue normal notifications while FullCall is active and flush after end.
- [x] Run tests/typecheck and commit.

### Task 7: App wiring, navigation and smoke verification
**Files:** Create `src/main.ts`; modify all screen modules as needed; create `tests/e2e-smoke.py`.
**Interfaces:** App supports Admin Directory -> Chat -> Back, user direct Chat, call start/minimize/restore, account/menu overlays.
- [x] Wire mobile route mounting as one screen; desktop Admin mounts Directory + Chat inside one AdminWorkspace.
- [x] Preserve Directory scroll position across Chat navigation.
- [x] Add left-edge swipe Back without conflicting with row swipe.
- [x] Build dependency-free static `dist/` with TypeScript compiler and copy assets.
- [x] Run Playwright/Chromium smoke at 280, 320, 390 and desktop widths; verify no horizontal overflow, app boot, composer visible after input focus, Admin navigation and call overlay.
- [x] Run complete verification and commit.

### Task 8: Packaging and handoff
**Files:** Create `README.md`, `STRUCTURE_LOCK.md`; package project ZIP and runnable dist ZIP.
**Interfaces:** Documents module ownership, backend integration boundaries and commands.
- [x] Document `npm install && npm run dev/build` for Vite environments and dependency-free local verification commands.
- [x] Record PASS/FAIL evidence and known backend-deferred items.
- [x] Re-run full verification.
- [x] Package source and runnable dist artifacts.


### Task 9: UI system and desktop completion
**Files:** Rewrite `src/ui/icons.ts`, update Shell/Chat/Directory/Call icon usage, create `src/admin/admin-workspace.ts`, update `src/styles/layout.css`, `src/styles/ui.css`, `src/services/mock-data.ts`, `index.html`, PWA assets and packaging scripts.
**Interfaces:** Shared 18/16 icon sizing, adaptive desktop workspace, complete mock message stress set, Plus Jakarta Sans stack, PWA manifest/icons, unified scrollbar rule.
- [x] Add failing gates for icon size ownership, scrollbar policy, font/PWA assets, desktop split pane and stress mock coverage.
- [x] Rewrite icon system so call sites do not pass arbitrary sizes.
- [x] Replace glyph navigation/media controls with shared SVG icons.
- [x] Add touch-hidden / desktop-thin scrollbar contract.
- [x] Add Plus Jakarta Sans web font link with system fallback; do not package font binaries.
- [x] Add manifest, app icons, maskable icon and Apple touch icon.
- [x] Add desktop AdminWorkspace with Directory + Chat panes while preserving mobile one-screen flow.
- [x] Replace mock conversation with full text/reply/audio/file/image album/system stress set.
- [x] Run 280/320/390/1280 Chromium smoke and full verification.

### Task 10: Conversation-first interaction rewrite
**Files:** Rewrite `src/app/types.ts`, `src/chat/message-list.ts`, `src/chat/composer.ts`, `src/chat/chat-screen.ts`; create `src/chat/message-contract.ts`, `src/chat/media-manager.ts`; update `src/app/overlay-manager.ts`, `src/app/shell.ts`, `src/main.ts`, `src/admin/admin-workspace.ts`, `src/directory/directory-screen.ts`, `src/services/mock-data.ts`, `src/call/call-controller.ts`, shared CSS and tests.
**Interfaces:** Messages use `senderId/recipientId`; timeline owns type-specific footer actions and CallEvent rendering; Composer owns inline `Ảnh | Camera | Tệp`; MediaManager derives from original messages and can `Xem gốc`; header quick menu is anchored near the chat subject; desktop keeps Directory + Chat while Media opens inside Chat pane.
- [x] Write failing conversation-v3 gates and verify RED.
- [x] Replace `from: me/peer` with participant IDs and relative render helpers.
- [x] Rewrite message footer action contract and latest-outgoing delivery status rule.
- [x] Add CallEvent message model and relative call-event rendering.
- [x] Rewrite Composer attachment flow as compact inline `Ảnh | Camera | Tệp` choices.
- [x] Add per-conversation MediaManager for `Ảnh | Tệp | Link | Ghi âm`, `Lưu`, and `Xem gốc`.
- [x] Add image-viewer `Lưu`; share one download helper across timeline/media/viewer.
- [x] Replace bottom chat action sheets with anchored quick menu; keep account/edit forms as sheets and group selection in-place.
- [x] Keep Admin row actions local; expose common chat media manager for both Admin and User.
- [x] Add runtime call events to the active conversation without global render.
- [x] Run typecheck/tests/build and 280/320/390/1280 Chromium smoke.
- [x] Repackage standalone/source/runnable V3 and checkpoint locally without pushing production.
