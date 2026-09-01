# TAPHOA Chat — Minimal Server-Owned Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Chat/Call Web Push ownership from the sender browser to the backend, bind every push subscription to the exact current profile/device/auth session, and suppress only redundant foreground notifications while keeping the User ↔ Admin system small.

**Architecture:** Keep one existing Web Push Edge Function (`taphoaxyz-call-push`) and one Web Push subscription per device. Add a tiny database outbox plus `pg_net` dispatch so successful Chat/Call persistence owns notification delivery, and add one service-only RPC that returns push targets only when `profile -> device -> chat session -> Supabase auth.sessions -> endpoint` all still match. Client registration/self-test and foreground Call ringtone remain client responsibilities; sender-side push dispatch is removed after the server path is live.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, Supabase/Postgres, `pg_net`, Supabase Edge Functions (Deno), `web-push`, Web Push/Service Worker, PWA.

**Spec:** `docs/superpowers/specs/2026-09-01-server-owned-notifications-design.md`

## Global Constraints

- Scope is User ↔ Admin only.
- Keep exactly one user-facing notification control: `Bật thông báo` / `Kiểm tra thông báo ✓`.
- Do not add Firebase, APNs, Redis, a generic worker queue, room/mention rules, quiet hours, or a notification-center screen.
- The push endpoint is transport data, never identity proof.
- Every delivery target must prove the exact current `profile_id + device_id + auth_session_id + endpoint` relationship.
- A revoked/missing/expired Supabase auth session must never receive push.
- Chat/Call persistence success must never be rolled back because notification delivery fails.
- If the exact Chat conversation is visible, suppress only that Chat system notification.
- If Call UI is visible, keep the existing rule that the system incoming-call notification is suppressed.
- Existing foreground Call ringtone/vibration remains owned by `CallAlertController`.
- Keep current iPhone microphone ordering, LiveKit media path, Android audio routing, TURN/ICE, and Call timer behavior unchanged.
- Existing production release before this work is `CHAT-ADMIN-0.12.4`.
- Use Node `>=22.12.0`; validation commands are `npm run typecheck`, `npm test`, and `npm run build`.
- After this milestone is physically verified, the next work item is `user 1234`.

---

## File Structure

**Create**
- `supabase/migrations/20260901_push_session_binding_and_outbox.sql` — session-bound subscriptions, service-only target validation, outbox table, dispatch URL/enqueue helpers; no Chat/Call RPC wiring yet.
- `supabase/migrations/20260901_wire_server_notification_dispatch.sql` — replaces only the canonical Chat send and Call start RPC bodies to enqueue notification events after successful persistence.
- `src/notifications/server-owned-schema.test.ts` — SQL/source contracts for session binding, outbox, target validation, and RPC wiring.
- `src/notifications/window-context.ts` — one page-side responder for “is this exact conversation visible?” queries from the Service Worker.
- `src/notifications/window-context.test.ts` — page-side query contract tests.
- `src/notifications/server-owned-client-boundary.test.ts` — proves sender Chat/Call code no longer invokes push directly.

**Modify**
- `supabase/functions/taphoaxyz-call-push/index.ts` — add internal `dispatch_event`, use the service-only target RPC for all sending, preserve `config`/`test`, retain temporary legacy compatibility during rollout.
- `src/notifications/push-sender-source.test.ts` — update Edge Function source contracts for `dispatch_event` and canonical payload construction.
- `src/notifications/payload.ts` — retain `conversation_id` in parsed push payload.
- `src/notifications/payload.test.ts` — test Chat conversation parsing and existing Call suppression/vibration behavior.
- `src/sw.ts` — query visible windows for exact Chat conversation before showing a system notification.
- `src/user-main.ts` — install the page-side notification-context responder using the current User conversation.
- `src/admin-main.ts` — install the responder using `selectedConversationId` and honor `?conversation=<uuid>` when a notification opens Admin.
- `src/supabase/message-backend.ts` — remove sender-side Chat push dispatch.
- `src/supabase/message-backend-notifications.test.ts` — replace the old “client invokes push” assertion with persistence-only behavior.
- `src/call/voice-session.ts` — remove sender-side incoming-call push dispatch only; do not change media/call lifecycle.
- `src/call/voice-session.test.ts` — preserve Call behavior while proving no client push call is required.
- `src/notifications/call-push-registration.ts` — no public API change; registration continues calling the same RPC, which now binds the current auth session server-side.
- `src/version.ts` / `src/version.test.ts` — bump to `CHAT-ADMIN-0.13.0` only after all functional gates pass.

**Delete after server dispatch is live and client imports are removed**
- `src/notifications/chat-push-send.ts`
- `src/notifications/chat-push-send.test.ts`
- `src/notifications/call-push-send.ts`
- `src/notifications/call-push-send.test.ts`

---

### Task 1: Bind Push Subscriptions to the Exact Auth Session and Create the Outbox Foundation

**Files:**
- Create: `supabase/migrations/20260901_push_session_binding_and_outbox.sql`
- Create: `src/notifications/server-owned-schema.test.ts`

**Interfaces:**
- Consumes: existing `chat_call_push_subscriptions`, `chat_devices`, `chat_sessions`, `chat_profiles`, `auth.sessions`, `chat_current_profile_id()`, `chat_current_session_id()`, `chat_private.device_belongs_to_profile(...)`.
- Produces:
  - `chat_call_push_subscriptions.auth_session_id uuid NOT NULL`
  - `public.chat_upsert_call_push_subscription(p_device_id uuid, p_endpoint text, p_p256dh text, p_auth text) returns boolean` with unchanged client signature
  - `public.chat_service_push_targets(p_profile_id uuid, p_device_id uuid default null)` service-role-only
  - `public.chat_notification_outbox`
  - `chat_private.notification_dispatch_url() returns text`
  - `chat_private.enqueue_notification(p_event_type text, p_source_id uuid, p_recipient_profile_id uuid) returns uuid`

- [ ] **Step 1: Write the failing source-contract test**

Create `src/notifications/server-owned-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bindingSql = readFileSync(
  new URL('../../supabase/migrations/20260901_push_session_binding_and_outbox.sql', import.meta.url),
  'utf8',
)

const wiringSql = () => readFileSync(
  new URL('../../supabase/migrations/20260901_wire_server_notification_dispatch.sql', import.meta.url),
  'utf8',
)

describe('server-owned notification schema', () => {
  it('binds subscriptions to the exact auth session', () => {
    expect(bindingSql).toContain('auth_session_id uuid')
    expect(bindingSql).toContain('join auth.sessions')
    expect(bindingSql).toContain('a.user_id = p.auth_user_id')
    expect(bindingSql).toContain("a.not_after is null or a.not_after > now()")
  })

  it('rebinding a cached endpoint removes stale ownership', () => {
    expect(bindingSql).toContain('delete from public.chat_call_push_subscriptions')
    expect(bindingSql).toContain('endpoint = p_endpoint')
    expect(bindingSql).toContain('auth_session_id')
  })

  it('exposes push targets only through a service-only function', () => {
    expect(bindingSql).toContain('create or replace function public.chat_service_push_targets')
    expect(bindingSql).toContain('revoke all on function public.chat_service_push_targets')
    expect(bindingSql).toContain('grant execute on function public.chat_service_push_targets')
    expect(bindingSql).toContain('to service_role')
  })

  it('creates a unique notification outbox and pg_net enqueue helper', () => {
    expect(bindingSql).toContain('create table if not exists public.chat_notification_outbox')
    expect(bindingSql).toContain('unique(event_type, source_id, recipient_profile_id)')
    expect(bindingSql).toContain('dispatch_token uuid')
    expect(bindingSql).toContain('net.http_post')
    expect(bindingSql).toContain("'dispatch_event'")
  })

  it('keeps RPC wiring in the second migration', () => {
    expect(bindingSql).not.toContain("perform chat_private.enqueue_notification('chat_message'")
    expect(wiringSql()).toContain("perform chat_private.enqueue_notification('chat_message'")
    expect(wiringSql()).toContain("perform chat_private.enqueue_notification('incoming_call'")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: FAIL because the migration files do not exist.

- [ ] **Step 3: Create the session-binding/outbox migration**

Create `supabase/migrations/20260901_push_session_binding_and_outbox.sql` with these concrete operations:

```sql
alter table public.chat_call_push_subscriptions
  add column if not exists auth_session_id uuid null;

with valid_session as (
  select
    s.device_id,
    min(s.auth_session_id) as auth_session_id
  from public.chat_sessions s
  join public.chat_devices d
    on d.id = s.device_id
   and d.profile_id = s.profile_id
   and d.revoked_at is null
  join public.chat_profiles p
    on p.id = s.profile_id
  join auth.sessions a
    on a.id = s.auth_session_id
   and a.user_id = p.auth_user_id
   and (a.not_after is null or a.not_after > now())
  where s.revoked_at is null
  group by s.device_id
  having count(*) = 1
)
update public.chat_call_push_subscriptions ps
set auth_session_id = v.auth_session_id,
    updated_at = now()
from valid_session v
where v.device_id = ps.device_id
  and ps.auth_session_id is null;

delete from public.chat_call_push_subscriptions
where auth_session_id is null;

alter table public.chat_call_push_subscriptions
  alter column auth_session_id set not null;

alter table public.chat_call_push_subscriptions
  drop constraint if exists chat_call_push_subscriptions_auth_session_id_fkey;

alter table public.chat_call_push_subscriptions
  add constraint chat_call_push_subscriptions_auth_session_id_fkey
  foreign key (auth_session_id)
  references public.chat_sessions(auth_session_id)
  on delete cascade;
```

Replace `chat_upsert_call_push_subscription` without changing its four public arguments. Inside it, resolve both `v_actor := public.chat_current_profile_id()` and `v_session := public.chat_current_session_id()`, require `chat_private.device_belongs_to_profile(p_device_id, v_actor)`, then atomically remove stale ownership of the same endpoint before inserting/updating:

```sql
delete from public.chat_call_push_subscriptions
where endpoint = p_endpoint
  and (
    profile_id <> v_actor
    or device_id <> p_device_id
    or auth_session_id <> v_session
  );

insert into public.chat_call_push_subscriptions(
  profile_id, device_id, auth_session_id, endpoint, p256dh, auth_key
)
values(v_actor, p_device_id, v_session, p_endpoint, p_p256dh, p_auth)
on conflict(device_id) do update
set profile_id = excluded.profile_id,
    auth_session_id = excluded.auth_session_id,
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    updated_at = now();
```

Add the service-only target RPC with this eligibility join:

```sql
create or replace function public.chat_service_push_targets(
  p_profile_id uuid,
  p_device_id uuid default null
)
returns table(
  subscription_id uuid,
  device_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
language sql
stable
security definer
set search_path to 'public', 'chat_private', 'auth'
as $function$
  select
    ps.id,
    ps.device_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_key
  from public.chat_call_push_subscriptions ps
  join public.chat_devices d
    on d.id = ps.device_id
   and d.profile_id = ps.profile_id
   and d.revoked_at is null
  join public.chat_sessions s
    on s.auth_session_id = ps.auth_session_id
   and s.device_id = ps.device_id
   and s.profile_id = ps.profile_id
   and s.revoked_at is null
  join public.chat_profiles p
    on p.id = ps.profile_id
  join auth.sessions a
    on a.id = ps.auth_session_id
   and a.user_id = p.auth_user_id
   and (a.not_after is null or a.not_after > now())
  where ps.profile_id = p_profile_id
    and (p_device_id is null or ps.device_id = p_device_id);
$function$;

revoke all on function public.chat_service_push_targets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_service_push_targets(uuid, uuid) to service_role;
```

Create `public.chat_notification_outbox` exactly once, with `event_type` constrained to `chat_message` or `incoming_call`, `source_id`, `recipient_profile_id`, random `dispatch_token`, `created_at`, nullable `processed_at`, nullable `last_error`, and `unique(event_type, source_id, recipient_profile_id)`. Enable RLS and revoke client access.

Add one URL owner:

```sql
create or replace function chat_private.notification_dispatch_url()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoaxyz-call-push'::text;
$function$;
```

Add `chat_private.enqueue_notification(...)` so it inserts an outbox row with `gen_random_uuid()` as `dispatch_token`; only when `insert ... on conflict do nothing returning id, dispatch_token` returns a new row does it call:

```sql
perform net.http_post(
  url := chat_private.notification_dispatch_url(),
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := jsonb_build_object(
    'action', 'dispatch_event',
    'event_id', v_event_id,
    'dispatch_token', v_dispatch_token
  )
);
```

Return the new event ID, or null when the unique event already existed. Do not raise on HTTP delivery status; `pg_net` runs after transaction commit and notification failure must not fail Chat/Call persistence.

- [ ] **Step 4: Run the source-contract test**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: the first four tests PASS; the final wiring test still FAILS only because the second migration is intentionally not created until Task 3.

- [ ] **Step 5: Apply only the foundation migration to Supabase production and verify data safety**

Apply `20260901_push_session_binding_and_outbox.sql` using the Supabase migration tool. Then run SQL checks:

```sql
select count(*) as invalid_push_targets
from public.chat_call_push_subscriptions ps
left join public.chat_sessions s on s.auth_session_id = ps.auth_session_id
left join public.chat_profiles p on p.id = ps.profile_id
left join auth.sessions a on a.id = ps.auth_session_id
where s.auth_session_id is null
   or s.revoked_at is not null
   or a.id is null
   or a.user_id is distinct from p.auth_user_id
   or (a.not_after is not null and a.not_after <= now());
```

Expected: `invalid_push_targets = 0`.

Also verify no business rows were removed:

```sql
select
  (select count(*) from public.chat_profiles) as profiles,
  (select count(*) from public.chat_messages) as messages,
  (select count(*) from public.chat_calls) as calls;
```

Record counts in the implementation checkpoint; this migration may delete only stale push-subscription rows that cannot be proven safe.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901_push_session_binding_and_outbox.sql src/notifications/server-owned-schema.test.ts
git commit -m "feat: bind push subscriptions to auth sessions"
```

---

### Task 2: Make the Existing Edge Function the Single Server Push Sender

**Files:**
- Modify: `supabase/functions/taphoaxyz-call-push/index.ts`
- Modify: `src/notifications/push-sender-source.test.ts`

**Interfaces:**
- Consumes: `chat_service_push_targets(profile_id, optional_device_id)`, `chat_notification_outbox`, canonical `chat_messages` / `chat_calls` / conversation memberships.
- Produces: Edge Function action `dispatch_event` accepting `{ action: 'dispatch_event', event_id: string, dispatch_token: string }`.
- Preserves authenticated `config` and `test` actions.
- Temporarily preserves legacy `send` and `send_message` during rollout; once an outbox row exists for that source, legacy action returns success without sending so old 0.12.4 clients cannot duplicate the new server push.

- [ ] **Step 1: Extend the failing source-contract test**

In `src/notifications/push-sender-source.test.ts`, assert the Edge Function source contains:

```ts
expect(source).toContain("action === \"dispatch_event\"")
expect(source).toContain('chat_service_push_targets')
expect(source).toContain('chat_notification_outbox')
expect(source).toContain('dispatch_token')
expect(source).toContain('processed_at')
expect(source).toContain('message_id: message.id')
expect(source).toContain('call_id: call.id')
```

Also assert it no longer builds ordinary delivery targets by directly selecting `chat_call_push_subscriptions` plus `chat_devices` in `sendToProfile`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/notifications/push-sender-source.test.ts
```

Expected: FAIL because `dispatch_event` and the service target RPC are absent.

- [ ] **Step 3: Refactor target lookup to one service-only RPC**

Replace the current direct subscription/device query inside `sendToProfile` with:

```ts
const { data: subscriptions, error } = await service.rpc('chat_service_push_targets', {
  p_profile_id: profileId,
  p_device_id: options.deviceId ?? null,
});
if (error) throw new Error('push_target_lookup_failed');
```

Map returned rows to the existing `webpush.sendNotification(...)` call. Keep 404/410 cleanup using `subscription_id`; do not change VAPID generation, TTL, urgency, or exact-device self-test behavior.

- [ ] **Step 4: Add the internal dispatch path before normal bearer authentication**

Parse JSON early enough to inspect `action`. For `dispatch_event`, do not accept title/body/recipient from the request. Require valid UUID `event_id` and `dispatch_token`, then load exactly one row:

```ts
const { data: eventRow, error: eventError } = await service
  .from('chat_notification_outbox')
  .select('id,event_type,source_id,recipient_profile_id,dispatch_token,processed_at')
  .eq('id', eventId)
  .eq('dispatch_token', dispatchToken)
  .maybeSingle();
```

Reject missing/mismatched token with 403. If `processed_at` is already set, return `{ ok: true, duplicate: true }` without sending.

For `chat_message`:
- load canonical message by `source_id`;
- require `revoked_at` null;
- require an active direct-conversation membership for `recipient_profile_id` different from `sender_id`;
- load sender display name and recipient `is_admin`;
- construct the existing concise Chat payload from database values only;
- set Admin navigation to `./admin/?conversation=<conversation_id>` and User navigation to `./`.

For `incoming_call`:
- load canonical Call by `source_id`;
- require `state = 'ringing'`;
- require `callee_profile_id = recipient_profile_id`;
- load caller display name and callee `is_admin`;
- construct the existing incoming-call payload from database values only.

Call `sendToProfile(...)`, then mark the outbox row processed:

```ts
await service
  .from('chat_notification_outbox')
  .update({ processed_at: new Date().toISOString(), last_error: null })
  .eq('id', eventId)
  .eq('dispatch_token', dispatchToken)
  .is('processed_at', null);
```

If canonical validation or Web Push processing throws, update the same row with both `processed_at = now` and a compact `last_error`, then return 500. If the function crashes before this update, the row remains unprocessed for diagnostics/manual replay as required by the spec.

- [ ] **Step 5: Preserve rollout compatibility without duplicate pushes**

Keep legacy authenticated `send_message` and `send` actions temporarily. Before their old send logic, query whether the matching outbox event exists:

- `send_message` → `event_type = 'chat_message'`, `source_id = message_id`
- `send` → `event_type = 'incoming_call'`, `source_id = call_id`

If the outbox table query succeeds and a row exists, return `{ ok: true, delegated: true }` without Web Push. If the table query fails because the foundation migration is not yet present, continue the legacy send path. This makes deployment order safe:

1. foundation DB migration;
2. Edge Function deploy;
3. RPC wiring migration;
4. frontend deploy.

- [ ] **Step 6: Run notification function tests and full tests**

```bash
npm test -- src/notifications/push-sender-source.test.ts src/notifications/call-push-registration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Deploy the updated Edge Function before wiring RPCs**

Deploy `taphoaxyz-call-push` preserving its current custom-auth configuration (`verify_jwt=false` if that remains the production setting). Verify the deployed version is ACTIVE.

Run existing exact-device `Kiểm tra thông báo ✓` on one registered test device. Expected: the readiness notification still arrives because `test` uses `chat_service_push_targets` and the exact current session passes validation.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/taphoaxyz-call-push/index.ts src/notifications/push-sender-source.test.ts
git commit -m "feat: dispatch push from server notification events"
```

---

### Task 3: Wire Canonical Chat and Call RPCs to the Outbox

**Files:**
- Create: `supabase/migrations/20260901_wire_server_notification_dispatch.sql`
- Modify: `src/notifications/server-owned-schema.test.ts`

**Interfaces:**
- Consumes: `chat_private.enqueue_notification(event_type, source_id, recipient_profile_id)`.
- Produces: exactly one outbox event after a newly persisted User ↔ Admin text message and exactly one after a successful ringing Call creation; busy/rejected Call starts produce none.

- [ ] **Step 1: Finish the SQL contract tests before implementation**

Ensure `server-owned-schema.test.ts` contains these assertions against the wiring migration:

```ts
expect(wiringSql()).toContain("perform chat_private.enqueue_notification('chat_message', v_result.id, v_peer)")
expect(wiringSql()).toContain("perform chat_private.enqueue_notification('incoming_call', v_call_id, v_target)")
expect(wiringSql()).toContain("on conflict (sender_id, client_message_id)")
```

Also assert the Call enqueue string occurs after the successful `insert into public.chat_calls` path and not in `caller_busy`, `peer_busy`, or `call_already_active` return branches.

- [ ] **Step 2: Run the test to verify it fails only because the wiring migration is absent**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: FAIL on the wiring-migration assertions.

- [ ] **Step 3: Replace the canonical four-argument Chat RPC**

In `20260901_wire_server_notification_dispatch.sql`, recreate:

`public.chat_send_text_message(p_conversation_id uuid, p_client_message_id uuid, p_text text, p_reply_to_id uuid)`

Preserve all existing membership, direct-peer capability, reply validation, text normalization, and idempotent insert logic. After `returning * into v_result`, enqueue only for the User ↔ Admin direct bridge already computed by `v_admin_bridge`:

```sql
if v_type = 'direct' and v_admin_bridge and v_peer is not null then
  perform chat_private.enqueue_notification('chat_message', v_result.id, v_peer);
end if;

return v_result;
```

Do not enqueue for non-direct or non-Admin bridge conversations. Because the outbox has a unique `(event_type, source_id, recipient_profile_id)`, an idempotent retry of the same `client_message_id` cannot produce a second event or second `pg_net` request.

- [ ] **Step 4: Replace the canonical Call start RPC**

Recreate `public.chat_start_voice_call(p_conversation_id uuid, p_device_id uuid)` preserving every current busy lock/check and device target insert. Only after the new Call row and device-target rows exist, add:

```sql
perform chat_private.enqueue_notification('incoming_call', v_call_id, v_target);
```

Then return the existing `{ ok: true, call_id, state: 'ringing', callee_profile_id }` payload unchanged. All busy/rejected returns stay above the enqueue call.

- [ ] **Step 5: Run the SQL source-contract tests**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Apply the wiring migration and verify server ownership on production data**

Apply `20260901_wire_server_notification_dispatch.sql`.

Send one controlled Chat message and run:

```sql
select event_type, source_id, recipient_profile_id, processed_at, last_error
from public.chat_notification_outbox
order by created_at desc
limit 5;
```

Expected for the new message: one `chat_message` row and, after Edge Function processing, non-null `processed_at` with null `last_error`.

Start one controlled Call that reaches `ringing`; expect exactly one `incoming_call` row. Attempt a second Call while the peer is busy; verify no second outbox row was created for the rejected attempt.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260901_wire_server_notification_dispatch.sql src/notifications/server-owned-schema.test.ts
git commit -m "feat: enqueue chat and call notifications on server"
```

---

### Task 4: Remove Sender-Browser Push Ownership

**Files:**
- Modify: `src/supabase/message-backend.ts`
- Modify: `src/supabase/message-backend-notifications.test.ts`
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/voice-session.test.ts`
- Create: `src/notifications/server-owned-client-boundary.test.ts`
- Delete: `src/notifications/chat-push-send.ts`
- Delete: `src/notifications/chat-push-send.test.ts`
- Delete: `src/notifications/call-push-send.ts`
- Delete: `src/notifications/call-push-send.test.ts`

**Interfaces:**
- Consumes: unchanged Chat send RPC and Call start RPC responses.
- Produces: clients persist/start only; server notification dispatch is never invoked from sender application code.

- [ ] **Step 1: Write the failing client-boundary test**

Create `src/notifications/server-owned-client-boundary.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const messageBackend = readFileSync(new URL('../supabase/message-backend.ts', import.meta.url), 'utf8')
const voiceSession = readFileSync(new URL('../call/voice-session.ts', import.meta.url), 'utf8')

describe('server-owned push client boundary', () => {
  it('does not dispatch Chat push from the sender client', () => {
    expect(messageBackend).not.toContain('sendChatMessagePush')
    expect(messageBackend).not.toContain("action: 'send_message'")
  })

  it('does not dispatch Call push from the caller client', () => {
    expect(voiceSession).not.toContain('sendIncomingCallPush')
    expect(voiceSession).not.toContain("action: 'send'")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/notifications/server-owned-client-boundary.test.ts
```

Expected: FAIL because both sender-side helpers are still imported/called.

- [ ] **Step 3: Remove Chat sender push**

In `src/supabase/message-backend.ts`:
- delete the `sendChatMessagePush` import;
- keep `chat_send_text_message` RPC handling exactly as-is;
- return the persisted message directly;
- remove only `void sendChatMessagePush(client, message.id).catch(() => undefined)`.

Update `message-backend-notifications.test.ts` to prove a successful RPC returns the persisted message without calling `client.functions.invoke` at all.

- [ ] **Step 4: Remove Call sender push**

In `src/call/voice-session.ts`:
- delete the `sendIncomingCallPush` import;
- after a successful `chat_start_voice_call`, keep `backendState`, `callId`, ringback, and `joinLiveKit(...)` behavior unchanged;
- remove only the fire-and-forget `sendIncomingCallPush(...)` call.

Do not alter `beginUserGesture`, ringtone/ringback, `accept()`, timer, LiveKit token warm-up, or media lifecycle.

- [ ] **Step 5: Delete the now-unused sender helper modules and their direct tests**

Delete the four `chat-push-send` / `call-push-send` files listed above. The Edge Function remains the one sender implementation.

- [ ] **Step 6: Run focused and full regression tests**

```bash
npm test -- src/notifications/server-owned-client-boundary.test.ts src/supabase/message-backend-notifications.test.ts src/call/voice-session.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/notifications src/supabase/message-backend.ts src/supabase/message-backend-notifications.test.ts src/call/voice-session.ts src/call/voice-session.test.ts
git commit -m "refactor: remove client-owned push dispatch"
```

---

### Task 5: Suppress Only the Exact Visible Chat Notification

**Files:**
- Create: `src/notifications/window-context.ts`
- Create: `src/notifications/window-context.test.ts`
- Modify: `src/notifications/payload.ts`
- Modify: `src/notifications/payload.test.ts`
- Modify: `src/sw.ts`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`

**Interfaces:**
- Produces page query message:
  - request: `{ type: 'CHAT_NOTIFICATION_CONTEXT_QUERY', conversationId: string }`
  - reply through `MessagePort`: `{ matches: boolean }`
- `installNotificationContextResponder(getSelectedConversationId: () => string | null): () => void`
- Service Worker fallback: if no page proves the exact conversation is visible within 150 ms, show the Chat system notification.

- [ ] **Step 1: Write payload and page-responder tests**

Extend `payload.test.ts`:

```ts
expect(parsePushPayload({
  type: 'chat_message',
  conversation_id: 'conversation-1',
  title: 'Tin nhắn mới',
})).toMatchObject({
  type: 'chat_message',
  conversationId: 'conversation-1',
})
```

Create `window-context.test.ts` around an exported pure helper:

```ts
import { describe, expect, it } from 'vitest'
import { matchesVisibleConversation } from './window-context'

describe('matchesVisibleConversation', () => {
  it('matches only the exact visible selected conversation', () => {
    expect(matchesVisibleConversation('a', 'a', 'visible')).toBe(true)
    expect(matchesVisibleConversation('a', 'b', 'visible')).toBe(false)
    expect(matchesVisibleConversation('a', 'a', 'hidden')).toBe(false)
    expect(matchesVisibleConversation(null, 'a', 'visible')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/notifications/payload.test.ts src/notifications/window-context.test.ts
```

Expected: FAIL because `conversationId` and the responder module do not exist.

- [ ] **Step 3: Extend push payload parsing**

In `payload.ts`, add `conversationId: string | undefined` to `PushNotificationPayload` and parse only a non-empty `conversation_id` string. Preserve title/body/navigate/badge/tag behavior and current incoming-call vibration pattern.

- [ ] **Step 4: Implement the page-side context responder**

Create `window-context.ts`:

```ts
export function matchesVisibleConversation(
  selectedConversationId: string | null,
  requestedConversationId: string,
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === 'visible'
    && Boolean(selectedConversationId)
    && selectedConversationId === requestedConversationId
}

export function installNotificationContextResponder(
  getSelectedConversationId: () => string | null,
): () => void {
  const serviceWorker = navigator.serviceWorker
  if (!serviceWorker) return () => undefined

  const listener = (event: MessageEvent): void => {
    const data = event.data as { type?: unknown; conversationId?: unknown } | null
    if (data?.type !== 'CHAT_NOTIFICATION_CONTEXT_QUERY') return
    if (typeof data.conversationId !== 'string') return
    const port = event.ports[0]
    if (!port) return
    port.postMessage({
      matches: matchesVisibleConversation(
        getSelectedConversationId(),
        data.conversationId,
        document.visibilityState,
      ),
    })
  }

  serviceWorker.addEventListener('message', listener)
  return () => serviceWorker.removeEventListener('message', listener)
}
```

- [ ] **Step 5: Wire User and Admin to their actual selected conversation owner**

In `user-main.ts`, install once after PWA setup:

```ts
installNotificationContextResponder(() => getChatMessageState().conversationId || null)
```

In `admin-main.ts`, install once using:

```ts
installNotificationContextResponder(() => getAdminState().selectedConversationId || null)
```

Do not store this state in localStorage/sessionStorage/Service Worker cache.

- [ ] **Step 6: Query visible windows from the Service Worker at push time**

In `src/sw.ts`, add:

```ts
async function isConversationVisible(
  windows: readonly WindowClient[],
  conversationId: string,
): Promise<boolean> {
  const visible = windows.filter((client) => client.visibilityState === 'visible')
  if (visible.length === 0) return false

  const replies = await Promise.all(visible.map((client) => new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 150)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      resolve(Boolean((event.data as { matches?: unknown } | null)?.matches))
    }
    client.postMessage({
      type: 'CHAT_NOTIFICATION_CONTEXT_QUERY',
      conversationId,
    }, [channel.port2])
  })))

  return replies.some(Boolean)
}
```

In the `push` handler:
- preserve current Call rule: `incoming_call` + any visible window → no duplicate system notification;
- for `chat_message` with `conversationId`, suppress only when `isConversationVisible(...)` returns true;
- if no conversation ID, no visible reply, or timeout occurs, show the notification;
- keep badge update independent of whether the notification itself is suppressed.

- [ ] **Step 7: Route Admin notification clicks to the correct conversation**

The Edge Function already builds Admin Chat navigation as `./admin/?conversation=<uuid>` in Task 2. In `admin-main.ts`, after `await startAdminRuntime()`, read:

```ts
const requestedConversationId = new URL(window.location.href).searchParams.get('conversation')
if (requestedConversationId) await selectAdminConversation(requestedConversationId)
```

After successful selection, remove only the query parameter with `history.replaceState(null, '', './')` relative to the Admin PWA location, so refreshes do not repeatedly force the selection. If the ID is invalid/not in Admin inbox, leave the normal Admin workspace usable and do not fail boot.

User has only one support conversation, so its Chat push navigation remains `./` and needs no conversation selection parser.

- [ ] **Step 8: Run focused tests and full build**

```bash
npm test -- src/notifications/payload.test.ts src/notifications/window-context.test.ts src/notifications/presentation.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/notifications/payload.ts src/notifications/payload.test.ts src/notifications/window-context.ts src/notifications/window-context.test.ts src/sw.ts src/user-main.ts src/admin-main.ts
git commit -m "feat: suppress only visible chat notifications"
```

---

### Task 6: Release 0.13.0, Remove Legacy Edge Actions, and Verify Cross-Account Safety

**Files:**
- Modify: `supabase/functions/taphoaxyz-call-push/index.ts`
- Modify: `src/notifications/push-sender-source.test.ts`
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`

**Interfaces:**
- Final Edge Function public authenticated actions: `config`, `test`.
- Final internal action: `dispatch_event`.
- Legacy sender actions `send` and `send_message` are removed only after production frontend no longer calls them and server outbox dispatch is proven.
- Final release label: `CHAT-ADMIN-0.13.0`.

- [ ] **Step 1: Verify server dispatch before removing compatibility**

With the Task 3 wiring migration active and the Task 4 frontend branch build available, perform controlled tests:

1. User sends Chat to Admin → one outbox event → one push to Admin when Admin is not viewing that conversation.
2. Admin sends Chat to User → one outbox event → one push to User when User app is backgrounded.
3. User starts Call → one outbox event → one incoming-call push when Admin app is backgrounded.
4. Visible exact conversation receives Realtime message but no system Chat notification.
5. Visible Call UI receives foreground ringtone/UI but no duplicate system Call notification.

For each event, verify `processed_at` is non-null and `last_error` is null.

- [ ] **Step 2: Add RED assertions that legacy actions are gone**

Update `push-sender-source.test.ts`:

```ts
expect(source).not.toContain('action === "send_message"')
expect(source).not.toContain('action !== "send"')
expect(source).toContain('action === "dispatch_event"')
expect(source).toContain('action === "config"')
expect(source).toContain('action === "test"')
```

Run:

```bash
npm test -- src/notifications/push-sender-source.test.ts
```

Expected: FAIL while compatibility code still exists.

- [ ] **Step 3: Remove legacy Edge Function send actions**

Delete only the authenticated `send` / `send_message` request paths and their compatibility outbox checks. Keep canonical Chat/Call payload builders used by `dispatch_event`, plus `config`, `test`, VAPID bootstrap, target RPC use, expired endpoint cleanup, TTL and urgency.

Run the focused test again; expected PASS.

- [ ] **Step 4: Deploy final Edge Function and verify exact-device self-test again**

Deploy the final `taphoaxyz-call-push`. Run `Kiểm tra thông báo ✓` on one current User session and one current Admin session. Expected: each test notification arrives only on the exact current registered device/session.

- [ ] **Step 5: Write RED release-version assertions**

Change `src/version.test.ts` expected strings to:

```ts
expect(APP_VERSION).toBe('CHAT-ADMIN-0.13.0')
expect(APP_SEMVER).toBe('0.13.0')
```

Run:

```bash
npm test -- src/version.test.ts
```

Expected: FAIL while source remains `0.12.4`.

- [ ] **Step 6: Bump production version**

Set in `src/version.ts`:

```ts
export const APP_VERSION = 'CHAT-ADMIN-0.13.0'
export const APP_SEMVER = '0.13.0'
```

Preserve the current build-ID handling unchanged.

- [ ] **Step 7: Run the complete automated release gate**

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Expected: all commands PASS from a clean dependency install.

- [ ] **Step 8: Run SQL security/correctness verification**

Verify no subscription is eligible through a stale session:

```sql
select count(*) as invalid_push_targets
from public.chat_call_push_subscriptions ps
left join public.chat_sessions cs
  on cs.auth_session_id = ps.auth_session_id
 and cs.device_id = ps.device_id
 and cs.profile_id = ps.profile_id
left join public.chat_profiles p on p.id = ps.profile_id
left join auth.sessions a
  on a.id = ps.auth_session_id
 and a.user_id = p.auth_user_id
where cs.auth_session_id is null
   or cs.revoked_at is not null
   or a.id is null
   or (a.not_after is not null and a.not_after <= now());
```

Expected: `0`.

Verify outbox diagnostics:

```sql
select event_type,
       count(*) filter (where processed_at is null) as pending,
       count(*) filter (where last_error is not null) as errors
from public.chat_notification_outbox
group by event_type
order by event_type;
```

Expected after controlled tests: no unexpected pending rows and no unexplained errors.

- [ ] **Step 9: Physical cross-account/session regression**

On the actual iPhone PWA and Android device:

1. Register notifications as Account A and confirm exact-device self-test.
2. Sign out Account A.
3. Sign in Account B on the same browser/PWA/device and register/test notifications.
4. Send Chat/Call to Account A from the peer: the switched device must not receive A's notification.
5. Send Chat/Call to Account B: the switched device must receive B's notification.
6. Revoke the current session and send another event: the revoked endpoint must not receive push.
7. Open the exact active Chat conversation and send a message: Realtime updates it, but no system Chat notification appears.
8. Move to another screen/background/lock and send a message: one concise system notification appears.
9. Incoming Call foreground: Call UI + ringtone/vibration only, no duplicate system notification.
10. Incoming Call background/locked: system Web Push appears.

Do not call this milestone complete if any cross-account/session notification is observed.

- [ ] **Step 10: Commit release**

```bash
git add supabase/functions/taphoaxyz-call-push/index.ts src/notifications/push-sender-source.test.ts src/version.ts src/version.test.ts
git commit -m "release: server-owned notifications 0.13.0"
```

- [ ] **Step 11: Merge and verify CI on the exact main merge commit**

Merge only after feature-branch CI is green. On the resulting exact `main` merge SHA, require:

- GitHub Pages workflow: checkout/install/typecheck/test/build/deploy PASS.
- Android workflow: web verification PASS; APK build may continue independently and must not gate PWA notification correctness unless Android native packaging itself fails because of these source changes.

Record Edge Function version, migration names, merge SHA, CI run IDs, and physical device PASS/FAIL in the final checkpoint.

- [ ] **Step 12: Move to the next milestone only after PASS**

Once Task 6 physical verification is PASS, close the notification milestone and begin the separately scoped next item: `user 1234`.
