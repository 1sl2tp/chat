# TAPHOA Root User Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary fixed-test root startup with isolated User1/User2/Admin session ownership that works correctly on the same machine.

**Architecture:** Root gets an explicit mode resolver and separate Supabase/Auth/device namespaces for guest and registered User2. Admin keeps its separate Auth namespace and gains a separate device key plus `/admin/` Service Worker registration so Push subscriptions cannot collide with root User2.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, Supabase JS 2.112.4, Vite PWA injectManifest, LiveKit 2.22.1.

**Spec:** `docs/superpowers/specs/2026-09-01-root-user-modes.md`

## Global Constraints

- User1 = anonymous guest, Chat only, no Call/Push.
- User2 = explicit login, persistent session, Chat + Call + Push.
- Admin `/admin/` is not part of root classification.
- `test` is diagnostic-only; production root must not auto-login it.
- Admin and User may be active simultaneously on one browser/device.
- Do not alter LiveKit audio foundation.
- Do not deploy production until branch verification passes and merge is approved.

---

### Task 1: Define isolated Auth and device namespaces

**Files:**
- Modify: `src/supabase/client.ts`
- Modify: `src/device/identity.ts`
- Create: `src/user/session-ownership.test.ts`

**Interfaces:**
- Produces `guestSupabase`, `userSupabase`, `adminSupabase`.
- Produces named device key helpers for guest/User2/Admin.

- [ ] Write failing tests proving guest/User2/Admin use distinct storage keys and that guest device identity uses session storage while User2/Admin identities remain persistent.
- [ ] Push the failing test commit and verify GitHub Actions fails for the expected missing interfaces.
- [ ] Implement minimal storage/client and device-key helpers.
- [ ] Push and verify GitHub Actions returns green for Task 1.

### Task 2: Replace fixed-test startup with an explicit root mode resolver

**Files:**
- Create: `src/user/root-session.ts`
- Create: `src/user/root-session.test.ts`
- Modify: `src/chat/runtime.ts`
- Modify: `src/user-main.ts`
- Delete from production wiring: imports/calls to `src/user/fixed-runtime.ts` and `src/user/fixed-auth.ts`.

**Interfaces:**
- `resolveRootMode()` returns `guest` or `user2` based only on the persistent User2 client.
- `startChatRuntime(options)` receives active Supabase client and device key.
- `stopChatRuntime()` disposes/reinitializes mode-owned runtime state.

- [ ] Write failing tests: no User2 session => guest; valid non-anonymous User2 => user2; anonymous/stale User2 storage => guest; Admin storage must not affect root result.
- [ ] Verify RED in GitHub Actions.
- [ ] Implement resolver and injectable/resettable chat runtime.
- [ ] Rewire root startup so it never calls fixed-test setup.
- [ ] Verify GREEN.

### Task 3: Add explicit User1 -> User2 login and User2 -> User1 logout

**Files:**
- Create: `src/user/auth.ts`
- Create: `src/user/auth.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/user.css`

**Interfaces:**
- `loginUser2(username, password)` normalizes username and signs into `<username>@taphoa.chat` using `userSupabase`.
- `endGuestSession()` signs out guest client and clears guest session/device state.
- `logoutUser2()` signs out persistent User2 client and returns to a fresh guest.

- [ ] Write failing tests proving guest teardown occurs before User2 sign-in and logout produces a fresh guest transition.
- [ ] Verify RED.
- [ ] Implement minimal login/logout helpers and compact root login UI.
- [ ] Show User1/User2 mode in the root header; remove `· test`.
- [ ] Verify GREEN.

### Task 4: Gate Call/Push strictly to User2

**Files:**
- Create: `src/user/capabilities.ts`
- Create: `src/user/capabilities.test.ts`
- Modify: `src/user-main.ts`

**Interfaces:**
- `capabilitiesForRootMode('guest'|'user2')` returns explicit booleans for `call` and `push`.

- [ ] Write failing tests: User1 => call=false/push=false; User2 => call=true/push=true.
- [ ] Verify RED.
- [ ] Create/mount/start `VoiceCallSession` and `CallPushRegistration` only in User2 mode.
- [ ] Ensure User1 DOM does not expose active Call/notification controls.
- [ ] Verify GREEN.

### Task 5: Separate Admin and User2 device/Push ownership on one machine

**Files:**
- Modify: `src/admin-main.ts`
- Modify: `src/pwa.ts`
- Create: `src/pwa/registration.ts`
- Create: `src/pwa/registration.test.ts`
- Create: `public/admin/sw.js`

**Interfaces:**
- `setupPwa('user')` registers/uses root worker `/sw.js` scope `/`.
- `setupPwa('admin')` registers `/admin/sw.js` scope `/admin/`.
- Admin bootstrap uses Admin-specific persistent device key.
- Root User2 uses User2-specific persistent device key.

- [ ] Write failing pure tests for registration descriptors and scope separation.
- [ ] Verify RED.
- [ ] Implement explicit user/admin PWA registration descriptors.
- [ ] Implement dedicated Admin push worker with notification display, visibility suppression and safe `/admin/` navigation.
- [ ] Rewire Admin to use Admin device key and Admin PWA registration.
- [ ] Rewire root to use User2 device key/root registration only when appropriate.
- [ ] Verify GREEN.

### Task 6: Guest lifecycle cleanup

**Files:**
- Create: `src/user/guest-lifecycle.ts`
- Create: `src/user/guest-lifecycle.test.ts`
- Modify: `src/user-main.ts`

**Interfaces:**
- Guest lifecycle owns session-scoped guest Auth/device keys.
- `clearGuestLocalState()` removes only guest-owned keys.
- Browser close/pagehide cleanup is best-effort and never touches User2/Admin state.

- [ ] Write failing tests that guest cleanup removes only guest keys and leaves User2/Admin keys intact.
- [ ] Verify RED.
- [ ] Implement local guest cleanup and best-effort end-of-session hook.
- [ ] Verify GREEN.

### Task 7: Remove obsolete fixed-test production path and run regression verification

**Files:**
- Delete if no longer referenced: `src/user/fixed-runtime.ts`, `src/user/fixed-runtime.test.ts`, `src/user/fixed-auth.ts`, `src/user/fixed-auth.test.ts`.
- Modify any tests/docs that intentionally referenced fixed test startup.

**Interfaces:** none new.

- [ ] Confirm no production imports reference fixed test modules or `test@taphoa.chat`.
- [ ] Run/verify `npm run typecheck` through GitHub Actions.
- [ ] Run/verify all Vitest tests through GitHub Actions.
- [ ] Run/verify Vite PWA build through GitHub Actions.
- [ ] Review branch diff for accidental LiveKit/audio/backend changes.
- [ ] Create final checkpoint with commit, PASS/FAIL, rollback ref and remaining manual iOS/Android verification items.

## Self-review

- Spec coverage: User1, User2, Admin, same-machine Auth/device/Push, fixed-test removal, Call gating and guest lifecycle are all mapped to tasks.
- Placeholder scan: no implementation placeholder is relied upon for task completion.
- Type consistency: mode names are `guest` and `user2`; PWA owner names are `user` and `admin`.
