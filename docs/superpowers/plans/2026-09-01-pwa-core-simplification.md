# TAPHOA PWA Core Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loại race Push giữa User/Admin, hoàn thiện teardown session theo owner, rồi thu gọn UI mà không thêm hạ tầng hoặc framework.

**Architecture:** Giữ chung `/sw.js` nhưng registration phải được trả về và truyền trực tiếp đến mọi thao tác Push. Session cleanup nằm ở RPC theo từng owner. Guest cleanup server bổ sung chỉ khi có tiêu chí stale an toàn; không thêm scheduler mặc định.

**Tech Stack:** Vite, TypeScript, Vitest, Supabase Auth/Postgres/Edge Functions, LiveKit, Web Push/PWA, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-09-01-pwa-core-simplification-design.md`

## Global Constraints

- Không thêm Firebase, Redis, native push stack, UI framework hoặc state framework.
- Không sửa LiveKit audio transport nếu không có bằng chứng lỗi mới.
- User1 = Chat only; User2/Admin = Chat + Call + Push.
- Admin và User phải hoạt động đồng thời cùng browser với Auth/device/SW/Push độc lập.
- Mọi production code behavior change phải có RED test trước.
- Không merge `main` nếu `npm run build` chưa PASS.

---

### Task 1: Bind Push to exact owner registration

**Files:**
- Modify: `src/pwa.ts`
- Modify: `src/notifications/call-push-registration.ts`
- Modify: `src/notifications/call-push-registration.test.ts`
- Modify: `src/notifications/push-cleanup.ts`
- Modify: `src/notifications/push-cleanup.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`

**Interfaces:**
- `setupPwa(owner?: PwaOwner): Promise<ServiceWorkerRegistration | null>`
- `callPushBrowserForRegistration(registration: ServiceWorkerRegistration): CallPushBrowser`
- `pushCleanupBrowserForRegistration(registration: ServiceWorkerRegistration): PushCleanupBrowser`

- [ ] **Step 1: Write failing tests**

Add a test that imports `callPushBrowserForRegistration`, passes a fake registration with a unique PushManager and `showNotification`, then verifies `ready()` and `showLocalNotification()` use only that registration. Add a cleanup test that imports `pushCleanupBrowserForRegistration` and verifies unsubscribe targets only its supplied registration.

- [ ] **Step 2: Verify RED in GitHub Actions**

Push only the tests. Expected: TypeScript fails because the new factories are not exported yet.

- [ ] **Step 3: Implement minimal exact-registration adapters**

`callPushBrowserForRegistration` closes over one registration; it must never read `navigator.serviceWorker.ready`. `pushCleanupBrowserForRegistration` closes over one registration. `setupPwa` returns the exact registration or `null` when unsupported/registration fails.

- [ ] **Step 4: Wire User/Admin to the returned registration**

Create one owner registration promise per app. Guest cleanup awaits root registration and only unsubscribes its subscription. User2/Admin create CallPushRegistration only after their exact registration resolves.

- [ ] **Step 5: Verify GREEN**

Run branch GitHub Actions and require `Typecheck, test and build = SUCCESS`.

---

### Task 2: Admin owner teardown

**Files:**
- Create: `src/admin/session.ts`
- Create: `src/admin/session.test.ts`
- Modify: `src/admin-main.ts`
- Create: `supabase/migrations/20260901_admin_session_teardown.sql`

**Interfaces:**
- `logoutAdmin(backend: { unsubscribePush(): Promise<void>; endAdminSession(): Promise<void>; signOutAdmin(): Promise<void> }): Promise<void>`
- SQL RPC: `public.chat_end_admin_session()`

- [ ] **Step 1: Write failing ordering test**

Expected events: `unsubscribe-push`, `end-admin-session`, `sign-out-admin`. The helper must still attempt Auth signout if RPC cleanup fails after unsubscribe.

- [ ] **Step 2: Verify RED**

Expected compile failure because `src/admin/session.ts` does not exist.

- [ ] **Step 3: Implement helper and RPC migration**

RPC resolves current non-anonymous Admin profile (`is_admin=true`, `user_level=4`), deletes only current `chat_sessions` by current `auth_session_id`, and deletes the device only if it is no longer referenced.

- [ ] **Step 4: Wire Admin logout**

Use the exact admin registration from Task 1 to unsubscribe only admin Push, call `chat_end_admin_session`, then sign out.

- [ ] **Step 5: Verify branch build**

Require full build/test PASS before applying migration to production.

---

### Task 3: Decide safe guest stale cleanup

**Files:**
- Inspect current schema/migrations first.
- Create a migration only if a reliable activity timestamp/heartbeat exists.

- [ ] **Step 1: Inspect `chat_sessions`, `chat_profiles`, conversation activity columns and heartbeat writes**

- [ ] **Step 2: Prove a safe stale predicate**

A cleanup predicate must exclude a guest whose browser can still be active. If this cannot be proven from existing data, do not add a TTL function in this task.

- [ ] **Step 3: Prefer opportunistic cleanup over scheduler**

If safe, expose one SECURITY DEFINER cleanup function and invoke it from an existing server path; do not enable `pg_cron` merely for this feature.

- [ ] **Step 4: Verify old guest rows and active guest safety with SQL counts**

---

### Task 4: Lightweight UI and visible build ID

**Files:**
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`
- Modify: `src/user.css`
- Modify: `src/admin.css`
- Create/modify small presentation tests only for extracted non-DOM logic.

- [ ] **Step 1: Add a small build-label helper test**

Expected presentation: abbreviated build ID (7–8 chars), `dev` when unavailable.

- [ ] **Step 2: Implement compact build label and render it unobtrusively**

- [ ] **Step 3: Reduce header/action/panel spacing without changing behavior**

Maintain 280px minimum layout, no new component library, no permanent large account panel.

- [ ] **Step 4: Require full branch build PASS**

---

### Task 5: Call / notification lifecycle audit

**Files:**
- Inspect: `src/call/voice-session.ts`, `src/call/ui.ts`, `src/sw.ts`, notification context files.
- Modify only files tied to a reproduced/static bug.

- [ ] **Step 1: Trace foreground/background incoming-call state and notification click path**

- [ ] **Step 2: For each real bug, add one RED test then minimal fix**

- [ ] **Step 3: Do not touch LiveKit transport/mic routing without new evidence**

- [ ] **Step 4: Full build PASS**

---

### Task 6: Production integration and checkpoint

**Files:**
- Create new repo checkpoint under `docs/checkpoints/`
- Create/update matching Google Drive checkpoint after verification.

- [ ] **Step 1: Review `main...fix/pwa-core-simplify` diff**

- [ ] **Step 2: Open PR and merge only if branch CI PASS**

- [ ] **Step 3: Verify fresh main GitHub Actions build and Pages deploy SUCCESS**

- [ ] **Step 4: Apply only migrations already verified on branch**

- [ ] **Step 5: Query production ownership/session counts**

Require no duplicate Push endpoint ownership, no active `test` session/device/Push, and live Admin/User session mappings consistent with owner.

- [ ] **Step 6: Save checkpoint with main SHA, Actions run IDs, migration names, rollback SHA and remaining physical-device checks**
