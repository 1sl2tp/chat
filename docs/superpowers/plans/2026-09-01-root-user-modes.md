# TAPHOA Root User Modes Implementation Plan

> **Execution status:** implementation is complete on `fix/pwa-core-simplify`; production integration and manual iOS/Android verification remain pending.

**Goal:** Replace the temporary fixed-test root startup with isolated User1/User2/Admin session ownership that works correctly on the same machine.

**Architecture:** Root has an explicit mode resolver and separate Supabase/Auth/device namespaces for guest and registered User2. Admin keeps its separate Auth namespace and device key. User2 and Admin use the same generated `sw.js` source but separate Service Worker registrations/scopes, producing independent PushManager subscriptions without duplicating worker code. Deployment paths are runtime-base-aware so the same artifact supports both the custom-domain root and GitHub Pages `/chat/`.

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

### Task 1: Define isolated Auth and device namespaces — COMPLETE

**Files:**
- `src/supabase/client.ts`
- `src/device/identity.ts`
- `src/user/session-ownership.test.ts`
- `src/device/owner-routing.test.ts`

- [x] Guest/User2/Admin use distinct Auth and device storage keys.
- [x] Guest identity is session-scoped; User2/Admin identities remain persistent.
- [x] Admin device routing also works under project-base paths such as `/chat/admin/`.

### Task 2: Replace fixed-test startup with an explicit root mode resolver — COMPLETE

**Files:**
- `src/user/root-session.ts`
- `src/user/root-session.test.ts`
- `src/user/fresh-guest-entry.test.ts`
- `src/chat/runtime.ts`
- `src/user-main.ts`

- [x] No User2 session => fresh guest.
- [x] Valid non-anonymous User2 => User2.
- [x] Stale/anonymous state in persistent User2 namespace is cleared.
- [x] Chat runtime is injectable/resettable.
- [x] Production root no longer uses the old fixed-test startup.

### Task 3: Add explicit User1 -> User2 login and User2 -> User1 logout — COMPLETE

**Files:**
- `src/user/auth.ts`
- `src/user/auth.test.ts`
- `src/user/guest-lifecycle.ts`
- `src/user/guest-end.test.ts`
- `src/user-main.ts`
- `src/user.css`

- [x] Guest teardown occurs before User2 sign-in.
- [x] User2 persists until explicit logout/revocation.
- [x] User2 logout returns to a completely fresh guest.
- [x] Root rejects Admin login and keeps Admin under `/admin/`.

### Task 4: Gate Call/Push strictly to User2 — COMPLETE

**Files:**
- `src/user/capabilities.ts`
- `src/user/capabilities.test.ts`
- `src/user-main.ts`

- [x] User1 => call=false, push=false.
- [x] User2 => call=true, push=true.
- [x] User1 DOM/runtime does not mount active Call/Push controls.

### Task 5: Separate Admin and User2 device/Push ownership on one machine — COMPLETE

**Implemented files:**
- `src/pwa.ts`
- `src/pwa/registration.ts`
- `src/pwa/registration.test.ts`
- `src/pwa/owner-routing.test.ts`
- `src/pwa/owner-visibility.ts`
- `src/sw.ts`
- `src/deployment.ts`
- `src/pwa/navigation.ts`
- `src/pwa/navigation.test.ts`
- `src/pwa/navigation-wiring.test.ts`
- `src/deployment-multi-base.test.ts`
- `src/deployment-assets.test.ts`
- `index.html`
- `admin/index.html`
- `public/manifest.webmanifest`
- `public/admin/manifest.webmanifest`
- `public/404.html`

**Actual implementation:**
- One generated Service Worker source is built as `sw.js`.
- Custom domain: User2 registers `/sw.js` at `/`; Admin registers the same `/sw.js` as a distinct registration at `/admin/`.
- GitHub Pages: User2 registers `/chat/sw.js` at `/chat/`; Admin registers the same `/chat/sw.js` as a distinct registration at `/chat/admin/`.
- Service Worker registration identity is scope-keyed, so User2/Admin have independent PushManager subscriptions.
- Foreground visibility suppression is owner-scoped so one app cannot suppress the other app's notification.
- Notification-click navigation is constrained to the owning registration scope and normalizes legacy values such as `admin/?conversation=...`.
- HTML, manifests, precache base and 404 fallback are relative/runtime-base-aware.

- [x] Separate User/Admin registration descriptors.
- [x] Separate User/Admin device keys.
- [x] Same-machine foreground suppression isolated by owner.
- [x] Same artifact supports custom-domain root and GitHub Pages `/chat/`.
- [x] Notification click cannot duplicate `/admin/admin/` and preserves `/chat/` base navigation.

### Task 6: Guest lifecycle cleanup — COMPLETE

**Files:**
- `src/user/guest-lifecycle.ts`
- `src/user/guest-lifecycle.test.ts`
- `src/user/guest-end.test.ts`
- `src/user-main.ts`
- `supabase/migrations/20260901_guest_ephemeral_cleanup.sql`

- [x] Local cleanup removes guest-owned keys only.
- [x] Remote guest cleanup is attempted while app is alive.
- [x] Fresh-entry logic prevents old guest restoration even if the OS terminates the PWA before a shutdown callback runs.

### Task 7: Remove obsolete fixed-test path and run regression verification — BRANCH COMPLETE

- [x] Obsolete fixed-test production files/imports removed.
- [x] No production auto-login path for `test@taphoa.chat` remains.
- [x] Admin and guest server cleanup functions are deployed in Supabase.
- [x] Branch typecheck passes.
- [x] All Vitest tests pass.
- [x] Vite client + injectManifest Service Worker production build passes.
- [x] Branch deployment/PWA tests cover custom root plus GitHub `/chat/`.
- [ ] Merge to `main` — requires explicit approval.
- [ ] Verify `main` Actions build + GitHub Pages deployment.
- [ ] Manual iOS/Android PWA verification: locked-screen Push, notification tap, User2 persistence/logout, Admin+User2 same-device coexistence.
- [ ] Create final production checkpoint in repo + Google Drive after production verification.

## Latest verified branch gate before documentation alignment

- Code commit: `a1ae95862bd845fb473aedd9b7cbb7b72130714d`
- GitHub Actions run: `33532504532`
- Build job: `99938825913`
- Result: 113/113 test files PASS; 283/283 tests PASS; Vite client build PASS; Service Worker injectManifest build PASS.

## Self-review

- User1/User2/Admin ownership is explicit and isolated.
- Admin + User2 can coexist on one browser with separate Auth/device/Service Worker registration/Push ownership.
- Deployment base is not hard-coded to `/`.
- Notification-click navigation stays inside the owning PWA scope.
- LiveKit audio foundation was not rewritten.
