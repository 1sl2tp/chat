# TAPHOA Clean UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active TAPHOA presentation layer with one clean reference-derived UI while preserving existing Supabase, LiveKit, PWA, push, auth, attachment, recording and account runtimes.

**Architecture:** Introduce a new `src/ui/clean/` presentation root and new clean User/Admin entry modules. The new screens consume the existing runtime stores/adapters and own all active DOM/CSS; legacy presentation modules remain temporarily in the repository but are removed from active imports, then deleted/quarantined only after cutover verification passes.

**Tech Stack:** Vite, TypeScript, Tailwind build-time utilities, Plus Jakarta Sans, Supabase, LiveKit, PWA/Service Worker, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-clean-ui-rebuild-design.md`

## Global Constraints

- User product flow: direct Chat with Support/Admin only.
- Admin flow: Inbox screen → select User → full-screen Chat → Back to Inbox.
- User and Admin share one ChatSurface owner.
- Preserve current Supabase, LiveKit, PWA/push, attachment, voice-recording, auth/account runtimes.
- Do not add CRM, reporting, automation, assignment, SLA, hold, transfer or unsupported call controls.
- New active presentation follows Plus Jakarta Sans, Slate dark hierarchy and `cw-500 = #1f93ff` from the supplied reference library.
- No legacy CSS/DOM owner may stay active underneath the new UI.
- Version badge stays available but cannot participate in main header/composer geometry.
- Do not merge to `main` until full CI is green on the feature branch.

---

### Task 1: Clean UI foundation and cutover contract

**Files:**
- Create: `src/ui/clean/theme.css`
- Create: `src/ui/clean/icons.ts`
- Create: `src/ui/clean/cutover.test.ts`
- Modify: `src/user-shell.ts`
- Modify: `src/admin-shell.ts`

**Interfaces:**
- Produces `cleanIcon(name, label): HTMLSpanElement` for icon buttons.
- Produces one global clean theme imported by both shells.
- Cutover contract asserts active shells do not import legacy visual CSS/modules.

- [ ] Write failing cutover tests asserting `user-shell.ts` and `admin-shell.ts` import clean entrypoints and do not import `reference.css`, old account CSS, old inbox CSS, or old reference-shell UI.
- [ ] Run the focused test and verify RED.
- [ ] Add clean global theme/reset/safe-area utilities and icon helper.
- [ ] Switch shells to clean theme + new clean entrypoint placeholders.
- [ ] Run focused tests and commit.

### Task 2: Shared clean ChatSurface

**Files:**
- Create: `src/ui/clean/chat/chat-surface.ts`
- Create: `src/ui/clean/chat/message-list.ts`
- Create: `src/ui/clean/chat/composer.ts`
- Create: `src/ui/clean/chat/chat.css`
- Create: `src/ui/clean/chat/chat-surface.test.ts`
- Reuse data contracts from: `src/ui/chatwoot-port/contracts.ts`
- Reuse message grouping from: `src/ui/chatwoot-port/messages/message-model.ts`
- Reuse scroll owner from: `src/ui/chatwoot-port/scroll/scroll-owner.ts`

**Interfaces:**
- `mountCleanChatSurface(options): MountedCleanChatSurface`
- `update(model: ConversationViewModel): void`
- `setEnabled(enabled: boolean): void`
- `destroy(): void`
- Header callbacks: `onBack`, `onCall`, `onMenu`.

- [ ] Write failing DOM contract tests for exact ownership: Header → Timeline → Composer, optional Back, call/menu actions, no duplicate header/composer.
- [ ] Verify RED.
- [ ] Implement clean header, timeline, message rows and composer from the supplied mobile reference geometry.
- [ ] Render text/link/file/image/audio/call/system message kinds without legacy message CSS.
- [ ] Wire attachment, recording state, send and scroll-to-latest to existing action interfaces.
- [ ] Run focused tests and commit.

### Task 3: Clean User app and account/menu/auth surfaces

**Files:**
- Create: `src/user-clean-main.ts`
- Create: `src/ui/clean/user/user-ui.ts`
- Create: `src/ui/clean/user/user.css`
- Create: `src/ui/clean/user/user-ui.test.ts`
- Modify: `src/user-shell.ts`

**Interfaces:**
- User runtime continues using `startChatRuntime`, `getChatMessageState`, `VoiceCallSession`, notification preferences, User2 auth and current call context.
- UI factory returns refs for menu, login form, settings controls, call host and chat host.

- [ ] Write failing tests proving User renders one header/chat/composer owner and a separate sheet for account/settings/login.
- [ ] Verify RED.
- [ ] Port current User runtime logic into `user-clean-main.ts` while replacing all legacy DOM construction with the clean UI factory.
- [ ] Mount shared clean ChatSurface directly; remove legacy hidden header/composer technique.
- [ ] Keep guest/User2 auth, notification preferences, password change, push registration and edge gesture behavior.
- [ ] Run User-focused tests and commit.

### Task 4: Clean Admin Inbox → full-screen Chat navigation

**Files:**
- Create: `src/admin-clean-main.ts`
- Create: `src/ui/clean/admin/admin-ui.ts`
- Create: `src/ui/clean/admin/admin.css`
- Create: `src/ui/clean/admin/admin-ui.test.ts`
- Modify: `src/admin-shell.ts`

**Interfaces:**
- Inbox consumes `AdminState.inbox` and invokes `selectAdminConversation(conversationId)`.
- Back invokes `clearAdminSelection()`.
- Clean ChatSurface consumes `toConversationViewModel` and existing admin message/call actions.

- [ ] Write failing tests proving Admin uses two mutually exclusive screens, never permanent split-pane: Inbox or Chat.
- [ ] Verify RED.
- [ ] Implement TAPHOA Inbox header, search and rows from reference mobile hierarchy.
- [ ] Port admin login/workspace runtime into `admin-clean-main.ts` and render Chat full-screen after selection.
- [ ] Preserve notifications, logout, call, attachment, recording, notification deep-link selection and runtime subscriptions.
- [ ] Keep create/manage User actions in a simple supported sheet/menu rather than a permanent CRM panel.
- [ ] Run Admin-focused tests and commit.

### Task 5: Clean call presentation

**Files:**
- Create: `src/ui/clean/call/call-ui.ts`
- Create: `src/ui/clean/call/call.css`
- Create: `src/ui/clean/call/call-ui.test.ts`
- Modify: `src/user-clean-main.ts`
- Modify: `src/admin-clean-main.ts`

**Interfaces:**
- Consumes existing `VoiceCallSession` state and methods.
- Supports current product states only: incoming, active/full, compact/minimized, hidden/idle, mic, speaker, accept, decline/end.

- [ ] Write failing tests covering incoming/full/compact/hidden and supported controls.
- [ ] Verify RED.
- [ ] Implement reference-style call overlay/compact pill without importing old `call/call.css` or old call widget CSS.
- [ ] Wire both User and Admin clean mains to the new call presentation while preserving `VoiceCallSession`.
- [ ] Run call-focused tests and commit.

### Task 6: Remove active legacy presentation and regression gates

**Files:**
- Modify: `src/ui/clean/cutover.test.ts`
- Modify existing shell/visual contract tests that assert obsolete presentation details.
- Remove active imports of legacy presentation modules from entrypoints.
- Leave runtime/data modules untouched.

**Interfaces:**
- Production entrypoints must reach only clean presentation owners.

- [ ] Add failing tests scanning active entrypoints for forbidden imports and duplicate product owners.
- [ ] Verify RED where legacy imports remain.
- [ ] Remove old active presentation imports and observer-based UI overlays from production entrypoints.
- [ ] Update obsolete tests so they assert product contracts rather than old implementation details.
- [ ] Run full test suite and commit.

### Task 7: Release/version and final production gate

**Files:**
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Create/update checkpoint: `docs/checkpoints/TAPHOA_CLEAN_UI_REBUILD_2026-09-03.md`

**Interfaces:**
- Visible release label becomes `CHAT-ADMIN-0.19.0` for the clean rebuild cutover.

- [ ] Update version test first to `CHAT-ADMIN-0.19.0` and verify RED.
- [ ] Bump `APP_VERSION` to `CHAT-ADMIN-0.19.0` and verify GREEN.
- [ ] Run `npm run build` through GitHub Actions on `ui-clean-rebuild`; require mirror verification, typecheck, all tests and Vite build PASS.
- [ ] Compare branch to `main`; require behind-by = 0 before merge.
- [ ] Merge the green branch into `main` automatically per user instruction.
- [ ] Verify the `main` GitHub Pages workflow runs build and deploy successfully on the merge commit.
- [ ] Record merge SHA, CI run IDs and rollback SHA in the checkpoint.

## Self-review

- Spec coverage: clean root, shared chat owner, Admin screen navigation, User direct chat, auth/account/menu, notifications, call presentation, legacy cutover, PWA/viewport preservation and final release gate are all mapped to tasks.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Type consistency: shared `ConversationViewModel` and `ConversationActionsAdapter` are reused; clean ChatSurface is the only new cross-screen presentation interface.
