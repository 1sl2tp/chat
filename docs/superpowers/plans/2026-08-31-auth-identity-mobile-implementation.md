# CHAT-AUTH-0.10.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace temporary 0.9.x auth assumptions with one canonical session owner plus backend-resolved guest/customer/admin identity, add a real Admin login/logout flow, preserve guest history through customer upgrade, and harden iOS/Android viewport/input behavior.

**Architecture:** `src/session/` remains the sole Auth-token/session lifecycle owner. A new `src/identity/` owner resolves application identity (`guest_customer | registered_customer | admin`) from backend-authoritative data and coordinates surface-specific startup; `src/chat/` and `src/admin/` remain feature owners and never infer roles. Supabase code stays adapter-only. Existing message runtime, support conversations, profiles, devices, and Admin inbox are reused rather than rewritten.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, `@supabase/supabase-js` 2.112.4, Supabase Postgres/RPC/RLS, PWA/Service Worker, GitHub Pages custom domain `https://chat.taphoa.xyz/`.

**Spec:** `docs/superpowers/specs/2026-08-31-auth-identity-mobile-design.md`

## Global Constraints

- `src/session/` owns Auth token/session lifecycle only; do not create another Auth state machine.
- `src/identity/` owns resolved application identity and role lifecycle.
- `src/chat/message-runtime.ts` remains the only canonical message state machine.
- `/` may auto-create anonymous Auth only for guest customer startup.
- `/admin` must never create anonymous Auth.
- Backend/RPC/RLS is the final authority for Admin access; route names never grant roles.
- Guest → registered customer must preserve canonical profile ID, support conversation, and message history.
- Existing profiles, conversations, messages, devices, and current Admin mapping must not be deleted or recreated.
- `viewport-fit=cover`; no `user-scalable=no` or `maximum-scale=1`.
- Mobile editable text controls must compute to at least 16px on iOS-class mobile layouts.
- Hard release widths: 280, 320, 390, 480 plus representative desktop widths.
- Production base remains `/` for `chat.taphoa.xyz`; do not restore `/chat/`.
- No Push, Voice, TURN, P2P, friends, or groups in this release.
- User-visible release version must be `CHAT-AUTH-0.10.0` and CI must be green before `main` integration.

---

### Task 1: Add backend-authoritative identity resolution

**Files:**
- Create: `supabase/migrations/20260831_chat_auth_010.sql`
- Create: `src/identity/contracts.ts`
- Create: `src/identity/contracts.test.ts`
- Create: `src/supabase/identity-backend.ts`
- Create: `src/supabase/identity-backend.test.ts`

**Interfaces:**
- Produces: `type AppIdentityKind = 'guest_customer' | 'registered_customer' | 'admin'`
- Produces: `interface ResolvedIdentity { kind: AppIdentityKind; profileId: string | null; authUserId: string; isAdmin: boolean }`
- Produces backend contract `IdentityBackend.resolveCurrentIdentity(): Promise<ResolvedIdentity>`.
- Produces RPC `chat_resolve_identity()` returning only allow-listed role/profile data for the current Auth principal.

- [ ] **Step 1: Write failing contract/decoder tests**

```ts
expect(decodeResolvedIdentity({ kind: 'admin', profile_id: 'p1', auth_user_id: 'u1', is_admin: true }))
  .toEqual({ kind: 'admin', profileId: 'p1', authUserId: 'u1', isAdmin: true })
```

Also assert invalid/unknown role payloads throw instead of silently becoming guest.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/identity/contracts.test.ts src/supabase/identity-backend.test.ts`

Expected: FAIL because contracts/adapter do not exist.

- [ ] **Step 3: Add additive SQL migration**

Implement `chat_resolve_identity()` as `security definer`, with a locked `search_path`, deriving identity from the current authenticated principal and existing `chat_profiles`/Admin mapping. Required rules:

```text
no auth principal -> error session_required
admin principal -> kind=admin
non-admin principal mapped to anonymous profile -> kind=guest_customer
non-admin principal mapped to registered profile -> kind=registered_customer
unknown mapping -> explicit identity_unresolved error
```

Do not expose secrets or arbitrary profile rows.

- [ ] **Step 4: Implement decoder + Supabase adapter**

`createSupabaseIdentityBackend(client = supabase)` calls only `chat_resolve_identity` and converts snake_case payload to the canonical TypeScript contract.

- [ ] **Step 5: Verify backend authorization**

Using Supabase test SQL/authorized sessions, verify Admin resolves `admin`, a customer resolves customer kind, and a missing/invalid principal cannot spoof Admin through parameters (RPC must take no role parameter).

- [ ] **Step 6: Run focused tests and full build**

Run: `npm run build`.

- [ ] **Step 7: Commit**

Commit message: `feat: add canonical identity resolution`.

---

### Task 2: Add the canonical identity state owner

**Files:**
- Create: `src/identity/state.ts`
- Create: `src/identity/state.test.ts`
- Create: `src/identity/store.ts`
- Create: `src/identity/runtime.ts`
- Create: `src/identity/runtime.test.ts`

**Interfaces:**
- Consumes: `IdentityBackend.resolveCurrentIdentity()` from Task 1.
- Produces state phases: `idle | resolving | ready | error` with `identity: ResolvedIdentity | null`.
- Produces `resolveIdentity(backend): Promise<ResolvedIdentity>` and `resetIdentity(): void`.

- [ ] **Step 1: Write failing reducer/runtime tests**

Cover:

```ts
resolving -> ready(admin)
resolving -> error(identity_unresolved)
reset -> idle
```

Assert role is never inferred from `SessionState.phase === 'authenticated'`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/identity/state.test.ts src/identity/runtime.test.ts`.

- [ ] **Step 3: Implement minimal identity reducer/store/runtime**

Do not import UI or feature modules into `src/identity/`.

- [ ] **Step 4: Verify GREEN and full build**

Run: `npm run build`.

- [ ] **Step 5: Commit**

Commit message: `feat: add identity lifecycle owner`.

---

### Task 3: Separate guest customer startup from Admin/customer account startup

**Files:**
- Modify: `src/chat/bootstrap.ts`
- Modify: `src/chat/bootstrap.test.ts`
- Modify: `src/chat/runtime.ts`
- Create: `src/app/startup.ts`
- Create: `src/app/startup.test.ts`
- Modify: `src/main.ts`
- Retire or narrow: `src/admin/bootstrap.ts`
- Modify: `src/admin/bootstrap.test.ts`

**Interfaces:**
- Consumes canonical `SessionState` and `ResolvedIdentity`.
- Produces startup decisions:

```ts
type AppSurface =
  | { type: 'guest-chat' }
  | { type: 'customer-chat' }
  | { type: 'admin-login' }
  | { type: 'admin-workspace' }
  | { type: 'access-denied' }
  | { type: 'identity-error'; message: string }
```

- [ ] **Step 1: Write failing startup decision tests**

Required cases:

```text
/ + no session -> anonymous sign-in allowed -> resolve guest -> customer chat
/ + registered customer session -> resolve registered_customer -> customer chat
/ + Admin session -> never bootstrap a customer identity/conversation
/admin + no session -> admin-login, zero anonymous sign-ins
/admin + customer identity -> access-denied
/admin + admin identity -> admin-workspace
```

- [ ] **Step 2: Verify RED**

Run focused Vitest command for startup/bootstrap tests.

- [ ] **Step 3: Refactor customer bootstrap**

Keep existing `chat_bootstrap_identity`/support entry behavior for customer surfaces only. Remove the assumption that feature code decides whether a generic authenticated session is Admin.

- [ ] **Step 4: Implement `src/app/startup.ts` orchestration**

Order must be:

```text
restore session -> route policy -> optional guest anonymous sign-in -> identity resolution -> surface-specific bootstrap
```

Feature modules consume the result; they do not recreate this decision tree.

- [ ] **Step 5: Simplify `src/main.ts`**

`main.ts` should install viewport/PWA/session runtime then delegate startup. It must no longer directly assemble Admin bootstrap from `createSupabaseChatBackend()`.

- [ ] **Step 6: Verify GREEN + build**

Run: `npm run build`.

- [ ] **Step 7: Commit**

Commit message: `refactor: centralize auth identity startup`.

---

### Task 4: Implement functional Admin login, logout, and access-denied states

**Files:**
- Create: `src/auth/contracts.ts`
- Create: `src/supabase/auth-actions.ts`
- Create: `src/supabase/auth-actions.test.ts`
- Create: `src/ui/admin/login.ts`
- Create: `src/ui/admin/login.css`
- Modify: `src/ui/admin/screen.ts`
- Modify: `src/ui/admin/style.css`
- Modify: `src/main.ts` or app shell host created in Task 3

**Interfaces:**
- Produces `signInWithPassword({ email, password }): Promise<void>` and `signOut(): Promise<void>` adapter actions.
- Admin login succeeds visually only after Task 1 identity resolution returns `admin`.

- [ ] **Step 1: Write failing adapter/auth-transition tests**

Assert password sign-in errors are normalized to a safe UI code, sign-out calls Supabase Auth once, and successful Auth without Admin role ends in access-denied rather than workspace.

- [ ] **Step 2: Verify RED**

Run focused tests.

- [ ] **Step 3: Implement adapter**

Use Supabase Auth `signInWithPassword` and `signOut`. Do not log passwords or raw sensitive error payloads.

- [ ] **Step 4: Implement Admin login UI**

Fields:

```html
<input type="email" autocomplete="username" inputmode="email">
<input type="password" autocomplete="current-password">
```

Include visible pending state, safe error copy, and version/build label.

- [ ] **Step 5: Add Admin logout/access-denied UI**

Workspace receives an explicit logout action. Access-denied lets the user sign out/switch account; it never creates a guest automatically while still on `/admin`.

- [ ] **Step 6: Verify GREEN + build**

Run: `npm run build`.

- [ ] **Step 7: Commit**

Commit message: `feat: add real admin authentication flow`.

---

### Task 5: Preserve guest identity during registered-customer upgrade and restore

**Files:**
- Modify: `supabase/migrations/20260831_chat_auth_010.sql` or add a second additive migration if Task 1 migration has already been applied to a shared environment.
- Create: `src/identity/upgrade.ts`
- Create: `src/identity/upgrade.test.ts`
- Extend: `src/supabase/identity-backend.ts`
- Add/modify profile/account UI only to the minimum required by the spec.

**Interfaces:**
- Produces an upgrade/link operation whose postcondition is the same canonical `chat_profiles.id`.
- Registered restore on another signed-in device resolves the existing customer profile instead of creating a second profile.

- [ ] **Step 1: Write failing identity-preservation tests**

Model and assert before/after invariants:

```text
profile_id unchanged
support conversation_id unchanged
message IDs/count unchanged
customer role changes guest_customer -> registered_customer
```

- [ ] **Step 2: Verify RED**

Run focused tests.

- [ ] **Step 3: Implement server-side safe link/upgrade contract**

The operation must only upgrade/link the current principal's canonical profile; it must not accept an arbitrary target `profile_id` from the browser as authority.

- [ ] **Step 4: Verify with transaction + rollback against real schema**

Create a controlled test transaction, record profile/conversation/message identity, perform upgrade/link operation, compare invariants, then rollback. Never mutate a real customer's history as a test fixture.

- [ ] **Step 5: Implement minimal registered-customer login/restore hook**

Do not build a full account center. Keep profile name/address separate from Auth credentials.

- [ ] **Step 6: Run full build**

Run: `npm run build`.

- [ ] **Step 7: Commit**

Commit message: `feat: preserve customer identity across account upgrade`.

---

### Task 6: Reconnect Admin workspace and customer chat to the new startup owner

**Files:**
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/runtime.test.ts`
- Modify: `src/ui/admin/screen.ts`
- Modify: `src/chat/runtime.ts`
- Modify: `src/ui/chat/customer-screen.ts`
- Modify: `src/main.ts` / app startup host

**Interfaces:**
- Admin runtime may start only with resolved `admin` identity.
- Customer runtime may start only with `guest_customer | registered_customer`.
- Shared `src/chat/message-runtime.ts` remains unchanged unless a test demonstrates a necessary lifecycle fix.

- [ ] **Step 1: Write failing feature-boundary tests**

Assert Admin cannot start under customer identity, customer support bootstrap cannot run for Admin identity, and switching Admin conversations still stops prior message subscription.

- [ ] **Step 2: Verify RED**

Run focused tests.

- [ ] **Step 3: Wire runtimes to startup/identity results**

Delete temporary 0.9.1 coupling where Admin used customer-oriented bootstrap solely to establish a session.

- [ ] **Step 4: Regression-test realtime ownership**

Verify one canonical message store, one active conversation subscription, dedupe/sort/send still pass.

- [ ] **Step 5: Run full build**

Run: `npm run build`.

- [ ] **Step 6: Commit**

Commit message: `refactor: enforce identity boundaries at feature startup`.

---

### Task 7: Harden iPhone/iOS and Android viewport, zoom, keyboard, and touch behavior

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/admin/style.css`
- Modify: `src/ui/chat/profile-form.css`
- Modify: `src/viewport/controller.ts` only if tests show geometry publication is insufficient
- Modify: `src/viewport/state.test.ts`
- Modify: `src/ui/chat/scroll-controller.test.ts`
- Add: `src/mobile-contract.test.ts`

**Interfaces:**
- Existing viewport owner continues publishing geometry; UI owns placement and scrolling.

- [ ] **Step 1: Write static mobile contract tests**

Read `index.html`/CSS and assert:

```text
viewport-fit=cover present
user-scalable=no absent
maximum-scale=1 absent
editable mobile controls >= 16px in relevant rules
280px minimum supported
```

- [ ] **Step 2: Write/extend scroll policy tests**

Assert near-bottom keyboard resize preserves bottom anchoring and reading-old-messages does not force jump.

- [ ] **Step 3: Verify RED where current code violates contract**

Run focused tests.

- [ ] **Step 4: Fix owner-level CSS/viewport geometry**

Use safe-area on shell/composer owners, `100dvh` + existing `--app-visual-height`, independent conversation scrolling, 44px-class tap targets where appropriate, and 16px text inputs/textareas.

- [ ] **Step 5: Verify responsive geometry**

At 280/320/390/480 and desktop, confirm no horizontal overflow for customer chat, profile sheet, Admin login, Admin inbox, and Admin conversation.

- [ ] **Step 6: Document physical-device gate explicitly**

Automated CI cannot claim physical iOS/Android keyboard PASS. Record manual acceptance checklist for Safari, iOS Home Screen PWA, Android Chrome, Android installed PWA.

- [ ] **Step 7: Run full build**

Run: `npm run build`.

- [ ] **Step 8: Commit**

Commit message: `fix: harden mobile viewport and form behavior`.

---

### Task 8: Add end-to-end lifecycle regression contracts

**Files:**
- Create: `src/auth-lifecycle.test.ts`
- Modify existing focused tests only where needed.

**Interfaces:**
- Tests orchestration contracts without creating a second runtime/state owner.

- [ ] **Step 1: Add lifecycle scenarios**

Cover:

```text
fresh / -> guest chat
fresh /admin -> admin login, no anonymous sign-in
admin credentials + admin role -> Admin workspace
customer credentials on /admin -> access denied
Admin session visiting / -> not converted to guest
registered customer logout -> later login required to restore registered history
guest upgrade -> same profile/conversation/history
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`.

- [ ] **Step 3: Run typecheck + production build**

Run: `npm run build`.

- [ ] **Step 4: Commit**

Commit message: `test: lock auth identity lifecycle contracts`.

---

### Task 9: Release `CHAT-AUTH-0.10.0`

**Files:**
- Modify: `src/version.test.ts`
- Modify: `src/version.ts`
- Verify: `src/deployment.test.ts`, `src/deployment.ts`, `vite.config.ts`, `.github/workflows/pages.yml`
- Add/update release checkpoint documentation if the repository convention requires it.

**Interfaces:**
- `APP_VERSION = 'CHAT-AUTH-0.10.0'`.
- Build ID remains CI-derived short Git SHA.

- [ ] **Step 1: Change version test first**

Expected:

```ts
expect(APP_VERSION).toBe('CHAT-AUTH-0.10.0')
expect(formatVersionLabel('abc1234')).toBe('CHAT-AUTH-0.10.0 · abc1234')
```

- [ ] **Step 2: Verify RED, then update `src/version.ts`**

- [ ] **Step 3: Run release verification**

Run: `npm run build` and verify deployment contract remains root `/`.

- [ ] **Step 4: Backend security verification**

Verify non-Admin cannot call Admin inbox/detail; Admin can; route manipulation alone grants nothing.

- [ ] **Step 5: Data-preservation verification**

Confirm existing profile/conversation/message counts are not destructively changed by migration and current Admin mapping still exists.

- [ ] **Step 6: Physical/mobile acceptance gate**

Before claiming full mobile PASS, verify on real devices where available:

```text
iPhone Safari: focus composer/profile/admin-login inputs -> no auto zoom; composer above keyboard
iOS installed PWA: same + safe areas/orientation
Android Chrome: keyboard resize + composer + back button behavior
Android installed PWA: same
```

If physical devices cannot be exercised from the execution environment, report this gate as pending user/device verification rather than falsely marking PASS.

- [ ] **Step 7: Integrate only a green branch**

Move/merge the exact green feature head to `main` without force; wait for the `main` GitHub Pages workflow.

- [ ] **Step 8: Verify production workflow**

Require build job SUCCESS and deploy job SUCCESS for the same `main` SHA.

- [ ] **Step 9: Verify live entry points**

Check `https://chat.taphoa.xyz/` and `https://chat.taphoa.xyz/admin` routing/version behavior. Do not claim an authenticated Admin workspace was browser-tested unless an actual Admin browser session was exercised.

- [ ] **Step 10: Commit/release checkpoint**

Report exact commit, CI run/jobs, production version/build, rollback SHA, any manual mobile gates still pending, and the next subsystem only after 0.10 is stable.
