# Admin Support Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `CHAT-ADMIN-0.9.0`: a secure Admin support inbox/detail workspace plus customer name/address update, while preserving the existing User ↔ Admin-only product model and shared chat/message runtime.

**Architecture:** Keep `chat_profiles`, `chat_devices`, `chat_conversations`, `chat_conversation_members`, and `chat_messages` as canonical backend owners. Add additive Admin-only RPCs guarded by current-profile `is_admin`, a profile update contract for address, thin Supabase adapters, and `src/admin/` presentation/selection orchestration that reuses the existing shared message runtime for selected conversations. Customer `/` remains the immediate support-chat surface; `/admin` becomes a separate Admin route/mode with mobile drill-in and desktop split view.

**Tech Stack:** PostgreSQL/Supabase RPC + RLS/security-definer checks, Supabase JS 2.112.4, TypeScript 6, Vite 8, Vanilla SPA, Vitest 4, GitHub Actions/Pages, PWA custom root domain.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-support-workspace-design.md`

## Global Constraints

- Release version is exactly `CHAT-ADMIN-0.9.0`.
- Product scope remains User 1/User 2 ↔ Admin only; no P2P, friends, contacts, groups, attachments, Push backend, Voice/WebRTC, or TURN.
- `chat_profiles` owns customer profile state; `address` is customer-supplied only and must never be inferred from IP/device/geolocation.
- `chat_devices` owns device metadata; do not copy device/runtime fields into `chat_profiles`.
- Admin-only cross-customer reads must be authorized in the database; `/admin` routing is not authorization.
- Browser code must not contain a service-role key or server-only secret.
- Admin conversation messages must reuse existing message load/send/realtime state and cleanup behavior; no second Admin-only message store.
- Customer profile update must preserve the same `chat_profiles.id`, support conversation id, message history, and device associations.
- Production remains rooted at `https://chat.taphoa.xyz/` with Vite/PWA base `/`; do not regress to `/chat/`.
- Minimum responsive gate remains 280px, plus 320/390/480 mobile checks and a desktop split-view gate.
- All implementation tasks use TDD where practical and every release claim requires fresh CI/build/deploy evidence.

---

## File Structure Map

- `supabase/migrations/20260831_chat_admin_090.sql` — additive schema/RPC migration source committed to the repo for reproducibility.
- `src/profile/contracts.ts` — canonical frontend profile DTO/action types for customer-editable fields.
- `src/profile/runtime.ts` — customer profile update orchestration only; no auth/message ownership.
- `src/profile/runtime.test.ts` — tests preserving profile/conversation identity through updates.
- `src/supabase/profile-backend.ts` — thin RPC adapter for customer profile update.
- `src/admin/contracts.ts` — Admin inbox/detail DTOs and backend interface.
- `src/admin/store.ts` — Admin inbox/detail selection/loading state only; explicitly excludes message arrays.
- `src/admin/runtime.ts` — Admin inbox/detail orchestration and selected-conversation handoff to existing message runtime.
- `src/admin/runtime.test.ts` — tests for selection, cleanup, authorization errors, and no duplicate message ownership.
- `src/supabase/admin-backend.ts` — thin adapter for Admin RPCs.
- `src/ui/admin/screen.ts` — Admin route DOM composition and interaction wiring.
- `src/ui/admin/style.css` — Admin-only responsive geometry.
- `src/ui/chat/screen.ts` — add real `Cập nhật tên & địa chỉ` flow to existing customer menu.
- `src/ui/chat/style.css` — customer profile sheet/form geometry only.
- `src/main.ts` — route/mode selection (`/` customer, `/admin` Admin) and shared startup wiring.
- `src/version.ts`, `src/version.test.ts` — release bump to `CHAT-ADMIN-0.9.0`.
- `src/deployment.test.ts` — preserve root deployment contract.

---

### Task 1: Additive database migration for address and secure Admin RPCs

**Files:**
- Create: `supabase/migrations/20260831_chat_admin_090.sql`

**Interfaces:**
- Consumes: existing `public.chat_profiles`, `chat_devices`, `chat_conversations`, `chat_conversation_members`, `chat_messages`, and existing current-profile/auth helper functions.
- Produces:
  - `chat_profiles.address text null`
  - `public.chat_update_my_profile(p_display_name text, p_username text, p_avatar_url text, p_address text) returns jsonb` while preserving existing compatibility overload where needed
  - `public.chat_admin_support_inbox(p_limit integer default 100) returns jsonb`
  - `public.chat_admin_support_detail(p_conversation_id uuid) returns jsonb`

- [ ] **Step 1: Capture current function signatures and policies before migration**

Run SQL against project `gcnoahqsrquxkwkjbuxy`:

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('chat_update_my_profile','chat_current_profile_id','chat_send_text_message')
order by p.proname, 3;
```

Expected: exact current signatures recorded before replacement/overload additions.

- [ ] **Step 2: Write migration SQL with server-side Admin guard**

Migration must include an internal guard pattern equivalent to:

```sql
if not exists (
  select 1 from public.chat_profiles
  where id = public.chat_current_profile_id()
    and is_admin = true
) then
  raise exception 'admin_required' using errcode = '42501';
end if;
```

`chat_admin_support_inbox` must join conversations/members/profile/last-message data in one query and only include conversations where the current Admin is a member and the peer profile is non-admin. `chat_admin_support_detail` must return one conversation's customer profile + device rows + member state, and must not return message history.

- [ ] **Step 3: Apply migration with Supabase migration tool**

Use migration name:

```text
chat_admin_090
```

Expected: migration applies without rewriting existing user/auth/conversation data.

- [ ] **Step 4: Verify schema and compatibility**

Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='chat_profiles' and column_name='address';

select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where pronamespace='public'::regnamespace
  and proname in ('chat_update_my_profile','chat_admin_support_inbox','chat_admin_support_detail')
order by proname, 2;
```

Expected: `address` nullable text; new Admin RPCs present; prior required profile-update compatibility remains callable.

- [ ] **Step 5: Verify authorization behavior**

Using database-side controlled checks or authenticated test contexts already available in the project, confirm:
- anonymous authenticated non-admin → Admin RPC raises `42501/admin_required`;
- normal authenticated non-admin → same denial;
- Admin → inbox/detail returns data.

- [ ] **Step 6: Commit migration source**

```bash
git add supabase/migrations/20260831_chat_admin_090.sql
git commit -m "feat: add secure admin support RPCs"
```

---

### Task 2: Add canonical customer profile update owner

**Files:**
- Create: `src/profile/contracts.ts`
- Create: `src/profile/runtime.ts`
- Create: `src/profile/runtime.test.ts`
- Create: `src/supabase/profile-backend.ts`

**Interfaces:**
- Produces:

```ts
export interface CustomerProfile {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  address: string | null
  identity_type: string
}

export interface CustomerProfilePatch {
  displayName: string | null
  address: string | null
}

export interface ProfileBackend {
  updateMyProfile(patch: CustomerProfilePatch): Promise<CustomerProfile>
}

export async function updateCustomerProfile(
  backend: ProfileBackend,
  patch: CustomerProfilePatch,
): Promise<CustomerProfile>
```

- [ ] **Step 1: Write failing tests**

Tests must assert normalization and identity preservation:

```ts
it('trims name/address and preserves returned profile id', async () => {
  const backend = fakeBackendReturning({ id: 'profile-1', display_name: 'Lan', address: 'Hà Nội' })
  const result = await updateCustomerProfile(backend, { displayName: '  Lan  ', address: '  Hà Nội  ' })
  expect(result.id).toBe('profile-1')
  expect(backend.lastPatch).toEqual({ displayName: 'Lan', address: 'Hà Nội' })
})
```

Also test empty strings normalize to `null`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- src/profile/runtime.test.ts
```

Expected: FAIL because profile runtime/contracts do not exist.

- [ ] **Step 3: Implement minimal profile contracts/runtime/adapter**

`src/supabase/profile-backend.ts` calls the address-aware `chat_update_my_profile` RPC and maps only profile fields; it does not hold state.

- [ ] **Step 4: Run focused + full tests**

```bash
npm test -- src/profile/runtime.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/profile src/supabase/profile-backend.ts
git commit -m "feat: add customer profile update owner"
```

---

### Task 3: Add Admin contracts and thin Supabase adapter

**Files:**
- Create: `src/admin/contracts.ts`
- Create: `src/admin/contracts.test.ts`
- Create: `src/supabase/admin-backend.ts`

**Interfaces:**
- Produces:

```ts
export interface AdminInboxItem {
  conversationId: string
  profileId: string
  displayName: string | null
  identityType: string
  address: string | null
  customerLastSeenAt: string | null
  lastMessageAt: string | null
  lastMessageText: string | null
  lastMessageType: string | null
  unreadCount: number
}

export interface AdminDevice {
  id: string
  label: string | null
  platform: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  revokedAt: string | null
}

export interface AdminSupportDetail {
  conversationId: string
  profileId: string
  displayName: string | null
  identityType: string
  address: string | null
  devices: AdminDevice[]
}

export interface AdminBackend {
  loadInbox(limit?: number): Promise<AdminInboxItem[]>
  loadDetail(conversationId: string): Promise<AdminSupportDetail>
}
```

- [ ] **Step 1: Write decoder/normalization tests for Admin RPC payloads**

Tests cover null names/addresses, empty device arrays, and unread count defaulting safely to zero when backend returns numeric zero.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/admin/contracts.test.ts
```

- [ ] **Step 3: Implement DTO decoders and `createSupabaseAdminBackend()`**

Adapter only calls:

```ts
client.rpc('chat_admin_support_inbox', { p_limit: limit })
client.rpc('chat_admin_support_detail', { p_conversation_id: conversationId })
```

No cross-customer direct table query from browser code.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/admin/contracts.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin src/supabase/admin-backend.ts
git commit -m "feat: add admin support backend contract"
```

---

### Task 4: Add Admin inbox/detail state without duplicating message state

**Files:**
- Create: `src/admin/store.ts`
- Create: `src/admin/runtime.ts`
- Create: `src/admin/runtime.test.ts`
- Modify: `src/chat/message-runtime.ts` only if a public `startChatMessagesForConversation(conversationId)` wrapper is needed; do not duplicate message arrays.

**Interfaces:**
- Admin store owns only:

```ts
export interface AdminState {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  inbox: AdminInboxItem[]
  selectedConversationId: string | null
  detail: AdminSupportDetail | null
  error: string | null
}
```

- Produces:

```ts
export async function startAdminRuntime(): Promise<void>
export async function selectAdminConversation(conversationId: string): Promise<void>
export async function refreshAdminInbox(): Promise<void>
export function clearAdminSelection(): void
```

- [ ] **Step 1: Write failing runtime tests**

Tests must prove:
- inbox load populates Admin store;
- selecting conversation loads detail and delegates to existing message runtime;
- switching A → B calls prior message subscription cleanup before B starts;
- Admin store has no `messages` field;
- authorization/RPC error becomes Admin `error` state without exposing raw secrets.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/admin/runtime.test.ts
```

- [ ] **Step 3: Implement minimal store/runtime**

Use dependency injection in tests for `AdminBackend` and message-runtime start/stop functions. Do not import Supabase directly into the store.

- [ ] **Step 4: Run focused and full tests**

```bash
npm test -- src/admin/runtime.test.ts
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/admin src/chat/message-runtime.ts
git commit -m "feat: add admin support runtime"
```

---

### Task 5: Implement customer `Cập nhật tên & địa chỉ` flow

**Files:**
- Modify: `src/ui/chat/screen.ts`
- Modify: `src/ui/chat/style.css`
- Create: `src/ui/chat/profile-form.test.ts` or extract a pure form model helper under `src/ui/chat/profile-form.ts` with tests.

**Interfaces:**
- Consumes: `updateCustomerProfile()` and existing customer overflow menu.
- Produces: a real editable form sheet/dialog that does not block first-contact chat.

- [ ] **Step 1: Write failing form-model tests**

Cover:
- prefill existing name/address when available;
- blank address allowed;
- save disabled only while request is in flight;
- successful save closes form and keeps same support conversation id;
- failed save keeps draft visible and shows compact error.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/ui/chat/profile-form.test.ts
```

- [ ] **Step 3: Implement form and wiring**

The menu item `Cập nhật tên & địa chỉ` becomes active. The form must not create a new auth user/profile/conversation and must not request geolocation.

- [ ] **Step 4: Run tests + typecheck**

```bash
npm test -- src/ui/chat/profile-form.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/chat
git commit -m "feat: add customer name and address update"
```

---

### Task 6: Implement Admin route and responsive workspace

**Files:**
- Create: `src/ui/admin/screen.ts`
- Create: `src/ui/admin/style.css`
- Create: `src/ui/admin/view-model.ts`
- Create: `src/ui/admin/view-model.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- `/` → existing customer chat surface.
- `/admin` → Admin inbox/workspace.
- Admin UI consumes only Admin state + shared chat message state/actions.

- [ ] **Step 1: Write failing Admin view-model tests**

Cover stable labels:

```ts
expect(getAdminCustomerLabel({ displayName: null, profileId: '12345678-...' })).toMatch(/^Khách /)
expect(getAdminCustomerLabel({ displayName: 'Lan', profileId: '...' })).toBe('Lan')
```

Also cover guest/updated status, latest-message preview, device label/platform formatting, and omission of unavailable address/version/build.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/ui/admin/view-model.test.ts
```

- [ ] **Step 3: Implement mobile Admin hierarchy**

At 280–480px:
- initial view is inbox;
- tap row → replace inbox with conversation/detail;
- Back → inbox;
- composer remains owned by existing viewport/chat UI primitives;
- detail metadata stays secondary/collapsible and does not permanently consume chat height.

- [ ] **Step 4: Implement desktop split view**

At chosen desktop breakpoint (prefer existing app-shell convention; if no convention exists use `min-width: 760px` consistently):
- left fixed/minmax inbox region;
- right conversation/detail region;
- no horizontal overflow at 760/1000/1280/1440.

- [ ] **Step 5: Wire route startup in `src/main.ts`**

Route selection must be path-based presentation only. `startSupabaseRuntime()` remains shared; customer route starts existing chat runtime; Admin route starts authenticated Admin runtime and does not bootstrap a second anonymous support customer conversation for Admin.

- [ ] **Step 6: Run tests/typecheck**

```bash
npm test -- src/ui/admin/view-model.test.ts
npm run typecheck
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/admin src/main.ts
git commit -m "feat: add admin support workspace UI"
```

---

### Task 7: Inbox freshness and conversation switching regression gates

**Files:**
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/runtime.test.ts`
- Reuse: `src/lifecycle/` existing foreground owner if available.

**Interfaces:**
- Uses smallest reliable first-release strategy: refresh inbox on foreground/focus and after selected-conversation realtime activity, rather than creating a second broad Realtime topology.

- [ ] **Step 1: Add failing freshness tests**

Prove:
- foreground callback triggers one inbox refresh;
- multiple rapid triggers are coalesced if current runtime already has such utility; otherwise guard against concurrent duplicate loads;
- switching conversation discards late detail result from previously selected conversation;
- old message subscription cannot append into new selected conversation state.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/admin/runtime.test.ts
```

- [ ] **Step 3: Implement minimal freshness strategy**

Do not subscribe Admin inbox to every customer message channel. Reuse lifecycle owner and selected-conversation message updates where practical.

- [ ] **Step 4: Run full tests**

```bash
npm test
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/admin
git commit -m "fix: keep admin inbox fresh safely"
```

---

### Task 8: Release version, deployment contract, and production verification

**Files:**
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Verify: `src/deployment.ts`, `src/deployment.test.ts`, `vite.config.ts`

**Interfaces:**
- Produces visible label `CHAT-ADMIN-0.9.0 · <short-build-id>`.

- [ ] **Step 1: Update version test first**

```ts
expect(APP_VERSION).toBe('CHAT-ADMIN-0.9.0')
expect(formatVersionLabel('abcdef123')).toBe('CHAT-ADMIN-0.9.0 · abcdef1')
```

- [ ] **Step 2: Verify version test RED**

```bash
npm test -- src/version.test.ts
```

- [ ] **Step 3: Update `APP_VERSION`**

Set exactly:

```ts
export const APP_VERSION = 'CHAT-ADMIN-0.9.0' as const
```

- [ ] **Step 4: Run complete local/CI-equivalent build command**

```bash
npm run build
```

Expected: TypeScript PASS, all Vitest suites PASS, Vite/PWA build PASS.

- [ ] **Step 5: Verify database behavior against live project**

Check:
- existing guest profile rows still present;
- `address` nullable for old rows;
- Admin inbox returns support rows;
- non-admin call denied;
- profile update changes name/address without changing profile id;
- same support conversation id still present after update.

- [ ] **Step 6: Responsive/manual gates**

Verify customer and Admin surfaces at:
- 280px
- 320px
- 390px
- 480px
- 760px
- 1000px
- 1280px
- 1440px

Check no horizontal overflow, mobile one-region hierarchy, desktop split, keyboard composer visibility, and metadata omission rather than guessing.

- [ ] **Step 7: Feature-branch CI gate**

Create/use branch `integration/admin-support-0.9.0`; require GitHub Actions `Typecheck, test and build` SUCCESS before integrating.

- [ ] **Step 8: Integrate exact green commit to `main`**

Use fast-forward where history permits. Do not force-update `main`.

- [ ] **Step 9: Production Pages gate**

Verify the `main` workflow has:
- build SUCCESS;
- Pages configuration SUCCESS;
- artifact upload SUCCESS;
- deploy SUCCESS;
- environment URL `https://chat.taphoa.xyz/`.

- [ ] **Step 10: Live smoke test**

At `https://chat.taphoa.xyz/` verify:
- customer support chat loads;
- `/admin` authorizes Admin and loads inbox;
- Admin opens one customer and receives/sends text realtime;
- customer updates name/address and Admin detail reflects it after refresh;
- visible build label is `CHAT-ADMIN-0.9.0 · <main-short-sha>`.

- [ ] **Step 11: Commit release change if not already included**

```bash
git add src/version.ts src/version.test.ts
git commit -m "chore: release CHAT-ADMIN-0.9.0"
```

---

## Self-Review Result

- Spec coverage: address ownership, Admin security, inbox/detail, shared message runtime, User 1→User 2 identity preservation, mobile/desktop layouts, freshness strategy, release/version/deployment gates are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation placeholders remain.
- Type consistency: Admin DTO names and runtime function names are consistent across Tasks 3, 4, 6, and 7; profile types are consistent across Tasks 2 and 5.
- Scope guard: Push, Voice/TURN, P2P/friends/groups, attachment handling, and fabricated device version/build are explicitly excluded.
