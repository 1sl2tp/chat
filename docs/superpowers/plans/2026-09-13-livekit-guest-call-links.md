# LiveKit Guest Call Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 10-minute public LiveKit audio-call links that Admin can create/send through the existing Chat/Zalo text pipeline without automatically joining the call or requesting microphone permission.

**Architecture:** Add a separate `chat_call_invites` subsystem, two Edge Functions (authenticated Admin + public guest key auth), a lightweight `/c/` public page, and a dedicated invite-call browser session module. Keep `v21-call-engine.js`, `v21-livekit-session.js`, and the canonical `RINGING/ACCEPTED` call state untouched.

**Tech Stack:** Supabase Postgres/RLS/Realtime, Supabase Edge Functions (Deno), LiveKit server SDK/client SDK, vanilla JS/HTML, Node contract tests, Python contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-livekit-guest-call-links-design.md`

## Global Constraints

- Invite lifetime is exactly 10 minutes from creation.
- Creating/sending a link must never call `v21_call_start`, join LiveKit, or request microphone permission.
- Raw invite key is never stored; only SHA-256 hex is persisted.
- Public URL is `https://chat.taphoa.xyz/c/?k=<opaque-key>` and never contains a LiveKit token.
- Guest endpoint is public only because customers have no Chat account; it must custom-authorize every operation with the high-entropy invite key.
- LiveKit grants are audio-only: room join + subscribe + microphone publish; no data/video publishing.
- Admin joins only by explicit **Tham gia** action.
- Public page requests microphone only after explicit guest **Tham gia cuộc gọi** click.
- Existing Chat call state machine remains untouched.
- Existing text send/SyncEngine/Zalo bridge is the only delivery path for the generated link.

---

## File Structure

**Create**

- `supabase/migrations/20260913_chat_call_invites.sql` — table, constraints, RLS, policies, Realtime publication.
- `supabase/functions/v21-call-invite-admin/index.ts` — authenticated create/join/connected/revoke/end API.
- `supabase/functions/v21-call-invite-admin/invite-core.mjs` — pure key/room/status/TTL helpers.
- `supabase/functions/v21-call-invite-guest/index.ts` — public open/join/connected API using invite-key authorization.
- `supabase/functions/v21-call-invite-guest/invite-core.mjs` — pure guest validation/status helpers.
- `c/index.html` — lightweight public Zalo-safe call page.
- `guest-call-session.js` — dedicated browser LiveKit session for guest-link calls; no canonical CallEngine dependency.
- `call-invite-client.js` — Admin create/send/status/join UI integration.
- `tests/test_v21_call_invite_db_contract.py`
- `tests/test_v21_call_invite_admin_core.mjs`
- `tests/test_v21_call_invite_admin_edge_contract.py`
- `tests/test_v21_call_invite_guest_core.mjs`
- `tests/test_v21_call_invite_guest_edge_contract.py`
- `tests/test_v21_call_invite_public_page.py`
- `tests/test_v21_call_invite_session.mjs`
- `tests/test_v21_call_invite_admin_ui.py`

**Modify**

- `index.source.html` — load Admin invite client/session modules.
- `index.html` — canonical built page update through the repo's existing build process, not hand-edited independently.
- `contact-directory-admin-core.js` — expose a stable profile action mount hook only if the existing profile action surface cannot be extended without it.
- `.github/workflows/verify-v21.yml` — run the new invite contracts.

---

### Task 1: Database invite schema and security

**Files:**
- Create: `tests/test_v21_call_invite_db_contract.py`
- Create: `supabase/migrations/20260913_chat_call_invites.sql`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- Produces table `public.chat_call_invites` with columns from the approved spec.
- Produces creator read policy only; anon has no table read/write policy.
- Produces Realtime publication membership for `chat_call_invites`.

- [ ] **Step 1: Write the failing DB contract test**

```python
from pathlib import Path

SQL = Path('supabase/migrations/20260913_chat_call_invites.sql')


def test_call_invite_schema_contract():
    text = SQL.read_text() if SQL.exists() else ''
    required = [
        'create table if not exists public.chat_call_invites',
        'key_hash text not null unique',
        'room_name text not null unique',
        'contact_id text not null',
        'created_by_account_id uuid not null',
        'expires_at timestamptz not null',
        'opened_at timestamptz',
        'guest_joined_at timestamptz',
        'admin_joined_at timestamptz',
        'revoked_at timestamptz',
        'ended_at timestamptz',
        'enable row level security',
        'chat_call_invites_creator_select',
        "alter publication supabase_realtime add table public.chat_call_invites",
    ]
    lower = text.lower()
    for needle in required:
        assert needle.lower() in lower, needle
    assert 'for insert to anon' not in lower
    assert 'for update to anon' not in lower
```

- [ ] **Step 2: Run the test and verify RED**

Run: `python -m pytest tests/test_v21_call_invite_db_contract.py -q`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the migration minimally**

Create the table exactly with the approved fields, `expires_at > created_at` check, RLS enabled, creator-select policy based on `auth.uid() = created_by_account_id`, service-role-only writes via no client write policy, indexes on `key_hash`, `created_by_account_id`, `expires_at`, and guarded Realtime publication insertion using a `DO $$ ... $$` block that tolerates already-published state.

- [ ] **Step 4: Add the DB test to Verify V21**

Add:

```yaml
      - name: Chat call invite database contract
        run: python -m pytest tests/test_v21_call_invite_db_contract.py -q
```

- [ ] **Step 5: Run GREEN locally/CI-equivalent**

Run: `python -m pytest tests/test_v21_call_invite_db_contract.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add short-lived call invite schema`

---

### Task 2: Authenticated Admin invite API

**Files:**
- Create: `tests/test_v21_call_invite_admin_core.mjs`
- Create: `tests/test_v21_call_invite_admin_edge_contract.py`
- Create: `supabase/functions/v21-call-invite-admin/invite-core.mjs`
- Create: `supabase/functions/v21-call-invite-admin/index.ts`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `makeInviteKey(bytes=24) -> string`
- `hashInviteKey(rawKey) -> Promise<string>` SHA-256 hex.
- `makeRoomName(inviteId) -> string` server-owned room name.
- `inviteState(row, nowMs) -> 'active'|'expired'|'revoked'|'ended'`
- Admin Edge actions: `create`, `join`, `connected`, `revoke`, `end`.

- [ ] **Step 1: Write failing pure-core tests**

```js
import assert from 'node:assert/strict';
import {
  hashInviteKey,
  makeRoomName,
  inviteState,
  INVITE_TTL_MS,
} from '../supabase/functions/v21-call-invite-admin/invite-core.mjs';

assert.equal(INVITE_TTL_MS, 10 * 60 * 1000);
assert.match(await hashInviteKey('abc'), /^[0-9a-f]{64}$/);
assert.match(makeRoomName('123e4567-e89b-12d3-a456-426614174000'), /^taphoa-guest-/);
assert.equal(inviteState({expires_at:'2026-09-13T00:10:00Z'}, Date.parse('2026-09-13T00:00:00Z')), 'active');
assert.equal(inviteState({expires_at:'2026-09-13T00:00:00Z'}, Date.parse('2026-09-13T00:00:00Z')), 'expired');
assert.equal(inviteState({expires_at:'2099-01-01T00:00:00Z',revoked_at:'2026-09-13T00:00:00Z'}, Date.now()), 'revoked');
```

- [ ] **Step 2: Write failing Admin Edge contract test**

The Python contract must assert the function source contains:

```text
verify_jwt-compatible Authorization handling
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
new AccessToken
TrackSource.MICROPHONE
canPublishData: false
10-minute expires_at creation
created_by_account_id derived from authenticated user, never request body
contactId accepted but roomName/identity rejected from client input
```

It must also assert absence of `v21_call_start` and absence of `V21CallEngine` references.

- [ ] **Step 3: Run RED tests**

Run:

```bash
node tests/test_v21_call_invite_admin_core.mjs
python -m pytest tests/test_v21_call_invite_admin_edge_contract.py -q
```

Expected: FAIL because implementation files do not exist.

- [ ] **Step 4: Implement `invite-core.mjs`**

Implement Web Crypto SHA-256, URL-safe random key generation, room naming and terminal state logic. Keep it independent of DOM/Supabase.

- [ ] **Step 5: Implement Admin Edge Function**

Use authenticated Supabase client to resolve `auth.getUser()` and a service-role client for controlled writes. `create` generates raw key server-side, stores only hash, sets `expires_at = new Date(Date.now()+INVITE_TTL_MS)`, and returns:

```ts
{ inviteId, url: `https://chat.taphoa.xyz/c/?k=${rawKey}`, expiresAt }
```

`join` validates creator + active state, then mints microphone-only LiveKit token. `connected`, `revoke`, and `end` update creator-owned row only.

- [ ] **Step 6: Run GREEN tests**

Run both Task 2 tests; expected PASS.

- [ ] **Step 7: Add Task 2 tests to Verify V21 and commit**

Workflow steps:

```yaml
      - name: Chat call invite Admin core contract
        run: node tests/test_v21_call_invite_admin_core.mjs
      - name: Chat call invite Admin Edge contract
        run: python -m pytest tests/test_v21_call_invite_admin_edge_contract.py -q
```

Commit: `feat: add authenticated call invite API`

---

### Task 3: Public guest invite API

**Files:**
- Create: `tests/test_v21_call_invite_guest_core.mjs`
- Create: `tests/test_v21_call_invite_guest_edge_contract.py`
- Create: `supabase/functions/v21-call-invite-guest/invite-core.mjs`
- Create: `supabase/functions/v21-call-invite-guest/index.ts`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `publicInviteState(row, nowMs) -> 'active'|'expired'|'revoked'|'ended'`
- Guest Edge actions: `open`, `join`, `connected`.
- Guest authorization input is only `{ key }`; client never chooses room name or participant identity.

- [ ] **Step 1: Write failing guest core and Edge tests**

Pure test covers active/expired/revoked/ended precedence. Edge contract asserts:

```text
verify_jwt false is deployment configuration, but source performs custom key hashing
key_hash lookup
open stamps opened_at
join revalidates expiry
identity is derived as guest:<inviteId>
TrackSource.MICROPHONE
canPublishData: false
connected stamps guest_joined_at
no Authorization requirement for guest
no roomName or participantIdentity accepted from request body
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/test_v21_call_invite_guest_core.mjs
python -m pytest tests/test_v21_call_invite_guest_edge_contract.py -q
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement guest core and Edge Function**

The Edge Function uses service-role access internally, hashes the raw key, fetches one invite by `key_hash`, derives state, and returns generic `invalid_or_expired` for invalid/terminal keys. `open` returns only `{status:'ready',expiresAt}`. `join` returns only `{serverUrl,participantToken,expiresAt}`. `connected` returns `{ok:true}`.

- [ ] **Step 4: Run GREEN tests**

Expected: both PASS.

- [ ] **Step 5: Add guest tests to Verify V21 and commit**

Commit: `feat: add public guest call invite API`

---

### Task 4: Public `/c/` Zalo-safe call page and guest media runtime

**Files:**
- Create: `tests/test_v21_call_invite_public_page.py`
- Create: `tests/test_v21_call_invite_session.mjs`
- Create: `c/index.html`
- Create: `guest-call-session.js`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `window.TaphoaGuestCallSession.joinGuest({key, endpoint}) -> Promise<boolean>`
- `window.TaphoaGuestCallSession.leave({reason}) -> Promise<void>`
- `window.TaphoaGuestCallSession.snapshot() -> {state,error,connected}`
- Guest page reads `k` from `URLSearchParams`, calls guest `open`, then joins only after button click.

- [ ] **Step 1: Write failing page contract**

Assert `c/index.html`:

```text
contains Tham gia cuộc gọi
contains URLSearchParams
calls v21-call-invite-guest open before join
has no getUser/login form/redirect to auth
has no getUserMedia call in top-level page-load path
loads guest-call-session.js
contains expired/ended/error state copy
```

- [ ] **Step 2: Write failing session runtime test**

Use a DOM/navigator stub where `getUserMedia` or audio policy acquisition records calls. Assert module initialization produces zero microphone acquisition calls. After explicit `joinGuest`, assert one acquisition/connect attempt occurs; `leave` releases/disconnects.

- [ ] **Step 3: Run RED tests**

```bash
python -m pytest tests/test_v21_call_invite_public_page.py -q
node tests/test_v21_call_invite_session.mjs
```

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement `guest-call-session.js`**

Keep it independent from `V21CallEngine` and `V21LiveKitSession`. Lazy-load the existing LiveKit client CDN version, request guest token only inside `joinGuest`, request microphone only inside `joinGuest`, connect, publish microphone, then call guest `connected` after LiveKit `RoomEvent.Connected`/successful connect. On leave, unpublish/disconnect and release media.

- [ ] **Step 5: Implement `c/index.html`**

Minimal mobile-first shell, no auth, no cookie dependency, no redirects. On load: validate key and call `open`. On primary button click: disable button, call `joinGuest`, render connected state. Terminal/error states are inline and retryable only when active.

- [ ] **Step 6: Run GREEN tests**

Expected: both PASS.

- [ ] **Step 7: Add public/session tests to Verify V21 and commit**

Commit: `feat: add public guest call page`

---

### Task 5: Admin create/send/status/join integration

**Files:**
- Create: `tests/test_v21_call_invite_admin_ui.py`
- Create: `call-invite-client.js`
- Modify: `index.source.html`
- Modify: `contact-directory-admin-core.js` only if needed for a stable mount point
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `window.TaphoaCallInviteClient.openForContact({contactId,contactName})`
- create action calls `v21-call-invite-admin` then queues returned URL through the existing SyncEngine text send owner.
- Admin `Tham gia` calls Admin Edge `join`, then delegates media to `TaphoaGuestCallSession.joinAdmin(...)` (add a sibling explicit method in the session module if needed), never to `V21CallEngine`.

- [ ] **Step 1: Write failing Admin UI contract**

Assert source contains user-visible **Gửi link gọi** and uses `v21-call-invite-admin`. Assert:

```python
assert 'v21_call_start' not in invite_client_source
assert 'V21CallEngine.startOutgoing' not in invite_client_source
assert 'getUserMedia' not in create_send_handler_slice
assert 'queueText' in invite_client_source or 'V21SyncEngine' in invite_client_source
```

Also assert the generated URL is sent as text without mutating composer input/attachments.

- [ ] **Step 2: Run RED**

Run: `python -m pytest tests/test_v21_call_invite_admin_ui.py -q`

Expected: FAIL because client module is absent.

- [ ] **Step 3: Implement Admin invite client**

Mount **Gửi link gọi** into the existing contact profile action region. `createAndSend`:

1. invoke Admin Edge `create`;
2. call existing SyncEngine/text queue for the selected contact with `url` as message body;
3. retain `{inviteId,url,expiresAt}` in module state;
4. subscribe to creator-readable invite row or use existing Supabase Realtime client to update `opened_at/guest_joined_at` state;
5. show **Gửi lại link** on message-send failure without creating a new invite.

`Tham gia` remains disabled/hidden until an active invite is present; clicking it is the only Admin path that requests a token and microphone.

- [ ] **Step 4: Wire scripts through `index.source.html` and canonical build**

Load `guest-call-session.js` before `call-invite-client.js`. Use the repo's existing `tools/build_current_preview.py` / canonical build process to update `index.html`; do not hand-maintain divergent logic.

- [ ] **Step 5: Run GREEN UI contract and existing call tests**

Run:

```bash
python -m pytest tests/test_v21_call_invite_admin_ui.py -q
node tests/test_v21_72_20_call_screen_wake_lock.js
python -m pytest tests/test_v21_72_37_call_header_balance.py -q
```

Expected: PASS, proving invite UI did not regress the normal call surface contracts.

- [ ] **Step 6: Add Admin UI test to Verify V21 and commit**

Commit: `feat: add sendable guest call links to contacts`

---

### Task 6: Full verification, Supabase deployment, and production merge gate

**Files:**
- Modify only if verification reveals contract wiring gaps: `.github/workflows/verify-v21.yml`
- No new business logic in this task.

**Interfaces:**
- Supabase functions deployed:
  - `v21-call-invite-admin`, `verify_jwt:true`
  - `v21-call-invite-guest`, `verify_jwt:false`

- [ ] **Step 1: Run the complete local/CI test set**

Run all new tests plus the existing Verify V21 workflow equivalent. Expected: all PASS.

- [ ] **Step 2: Push branch and require PR CI GREEN**

Verify `Verify V21`, `Zalo Bridge TDD`, and `Admin Push TDD` all succeed on the branch/PR.

- [ ] **Step 3: Apply migration to Supabase production**

Apply `20260913_chat_call_invites.sql`, then query table/RLS/publication metadata to verify exact schema and policies.

- [ ] **Step 4: Deploy Edge Functions**

Deploy Admin function with `verify_jwt:true`; deploy Guest function with `verify_jwt:false`. Fetch both deployed versions and verify `ACTIVE`.

- [ ] **Step 5: Security smoke checks**

Confirm:

- guest open with invalid key returns generic invalid/expired response;
- guest join cannot choose room/identity;
- no raw key exists in DB;
- Admin create without valid JWT is rejected;
- expired invite cannot mint either token;
- creating invite does not create a normal Chat call record.

- [ ] **Step 6: Browser flow smoke test**

With one fresh invite:

1. Admin `Gửi link gọi` creates/sends URL and does not enter a call.
2. Open URL in a guest browser/Zalo-like WebView; no microphone prompt appears on page load.
3. `opened_at` becomes set and Admin status updates.
4. Guest taps **Tham gia cuộc gọi**; only now microphone is requested and guest connects.
5. `guest_joined_at` updates.
6. Admin taps **Tham gia**; Admin connects to same room.
7. Two-way audio works.
8. Leave/end and expiry prevent new joins.

- [ ] **Step 7: Merge only after GREEN**

Fast-forward/merge the reviewed branch to `main`, then require Verify V21 and Pages deploy on `main` to succeed before declaring completion.

---

## Plan Self-Review

- Spec coverage: database, security, 10-minute TTL, public guest auth, Admin auth, LiveKit grants, `/c/` page, explicit microphone gates, canonical text/Zalo send path, status updates, separate media subsystem, deployment and smoke tests are all assigned to tasks.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified test step remains.
- Type consistency: `inviteId`, `expiresAt`, `key`, `contactId`, `opened_at`, `guest_joined_at`, `admin_joined_at` and the two Edge Function slugs are consistent across tasks.
- Scope check: feature is one coherent subsystem (short-lived guest audio call links); quote links and normal Chat calls are dependencies only, not independent deliverables.
