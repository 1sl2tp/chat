# TAPHOA Chat — Minimal Server-Owned Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Chat/Call Web Push ownership from the sender browser to the backend, bind every push subscription to the exact current profile/device/auth session, and suppress only redundant foreground notifications while keeping the User ↔ Admin system small.

**Architecture:** Keep one existing Web Push Edge Function (`taphoaxyz-call-push`) and one PushSubscription per device. Add a tiny Postgres outbox plus `pg_net` dispatch so successful Chat/Call persistence owns notification delivery, and add one service-only target RPC that returns endpoints only when `profile -> device -> chat session -> Supabase auth.sessions -> endpoint` all still match. Client registration/self-test and foreground Call ringtone remain client responsibilities; sender-side push dispatch is removed only after the server path is verified.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, Supabase/Postgres, `pg_net`, Supabase Edge Functions (Deno), `web-push`, Web Push/Service Worker, PWA.

**Spec:** `docs/superpowers/specs/2026-09-01-server-owned-notifications-design.md`

## Global Constraints

- Scope is User ↔ Admin only.
- Keep exactly one user-facing notification control: `Bật thông báo` / `Kiểm tra thông báo ✓`.
- Do not add Firebase, APNs, Redis, a generic worker queue, room/mention rules, quiet hours, or a notification-center screen.
- The push endpoint is transport data, never identity proof.
- Every delivery target must prove the exact current `profile_id + device_id + auth_session_id + endpoint` relationship.
- A revoked, missing, or expired Supabase auth session must never receive push.
- Chat/Call persistence success must never be rolled back because notification enqueue or delivery fails.
- If the exact Chat conversation is visible, suppress only that Chat system notification.
- If Call UI is visible, preserve the current rule that a duplicate system incoming-call notification is suppressed.
- Existing foreground Call ringtone/vibration remains owned by `CallAlertController`.
- Keep current iPhone microphone ordering, LiveKit media path, Android audio routing, TURN/ICE, and Call timer behavior unchanged.
- Existing production release before this work is `CHAT-ADMIN-0.12.4`.
- Use Node `>=22.12.0`; validation commands are `npm run typecheck`, `npm test`, and `npm run build`.
- After this milestone is physically verified, the next work item is `user 1234`.

---

## File Structure

**Create**
- `supabase/migrations/20260901_push_session_binding_and_outbox.sql` — session-bound subscriptions, service-only target validation, outbox table, dispatch URL/enqueue helper; no Chat/Call RPC wiring yet.
- `supabase/migrations/20260901_wire_server_notification_dispatch.sql` — wires the canonical Chat send and Call start RPCs to the outbox after successful persistence.
- `src/notifications/server-owned-schema.test.ts` — source contracts for migration ownership and wiring.
- `src/notifications/server-owned-client-boundary.test.ts` — proves sender clients no longer dispatch push directly.
- `src/notifications/window-context.ts` — page-side responder for exact visible conversation queries.
- `src/notifications/window-context.test.ts` — responder logic tests.

**Modify**
- `supabase/functions/taphoaxyz-call-push/index.ts`
- `src/notifications/push-sender-source.test.ts`
- `src/notifications/payload.ts`
- `src/notifications/payload.test.ts`
- `src/sw.ts`
- `src/user-main.ts`
- `src/admin-main.ts`
- `src/supabase/message-backend.ts`
- `src/supabase/message-backend-notifications.test.ts`
- `src/call/voice-session.ts`
- `src/call/voice-session.test.ts`
- `src/version.ts`
- `src/version.test.ts`

**Delete after server dispatch is live**
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
- Consumes: `chat_call_push_subscriptions`, `chat_devices`, `chat_sessions`, `chat_profiles`, `auth.sessions`, `chat_current_profile_id()`, `chat_current_session_id()`, `chat_private.device_belongs_to_profile(...)`.
- Produces:
  - `chat_call_push_subscriptions.auth_session_id uuid NOT NULL`
  - unchanged client signature `chat_upsert_call_push_subscription(p_device_id uuid, p_endpoint text, p_p256dh text, p_auth text)`
  - service-only `chat_service_push_targets(p_profile_id uuid, p_device_id uuid default null)`
  - `public.chat_notification_outbox`
  - `chat_private.notification_dispatch_url()`
  - `chat_private.enqueue_notification(...)`

- [ ] **Step 1: Write the failing migration source-contract test**

Create `src/notifications/server-owned-schema.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bindingPath = new URL('../../supabase/migrations/20260901_push_session_binding_and_outbox.sql', import.meta.url)
const wiringPath = new URL('../../supabase/migrations/20260901_wire_server_notification_dispatch.sql', import.meta.url)
const read = (url: URL): string => existsSync(url) ? readFileSync(url, 'utf8') : ''

const bindingSql = read(bindingPath)
const wiringSql = (): string => read(wiringPath)

describe('server-owned notification schema', () => {
  it('binds subscriptions to exact auth sessions', () => {
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

  it('makes target validation service-only', () => {
    expect(bindingSql).toContain('create or replace function public.chat_service_push_targets')
    expect(bindingSql).toContain('revoke all on function public.chat_service_push_targets')
    expect(bindingSql).toContain('to service_role')
  })

  it('creates an outbox and pg_net dispatch helper', () => {
    expect(bindingSql).toContain('create table if not exists public.chat_notification_outbox')
    expect(bindingSql).toContain('unique(event_type, source_id, recipient_profile_id)')
    expect(bindingSql).toContain('dispatch_token uuid')
    expect(bindingSql).toContain('net.http_post')
    expect(bindingSql).toContain("'dispatch_event'")
  })

  it('keeps Chat/Call wiring in the second migration', () => {
    expect(bindingSql).not.toContain("enqueue_notification('chat_message'")
    expect(wiringSql()).toContain("enqueue_notification('chat_message'")
    expect(wiringSql()).toContain("enqueue_notification('incoming_call'")
  })
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: FAIL because the binding migration is absent and the wiring migration is still absent.

- [ ] **Step 3: Create the binding/outbox migration**

Start `20260901_push_session_binding_and_outbox.sql` with the new nullable column, safe backfill, stale-row deletion, and NOT NULL enforcement:

```sql
alter table public.chat_call_push_subscriptions
  add column if not exists auth_session_id uuid null;

with valid_session as (
  select
    s.device_id,
    min(s.auth_session_id::text)::uuid as auth_session_id
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

Replace `chat_upsert_call_push_subscription` without changing its four public arguments. Resolve both current profile and current Supabase auth-session ID, then atomically remove cached endpoint ownership from any old profile/device/session before the upsert:

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

Keep all current endpoint/key validation and require:

```sql
if v_actor is null or v_session is null then raise exception 'session_revoked'; end if;
if not chat_private.device_belongs_to_profile(p_device_id, v_actor) then raise exception 'invalid_device'; end if;
```

Add the service-only target RPC:

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

Create the outbox exactly as follows:

```sql
create table if not exists public.chat_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('chat_message', 'incoming_call')),
  source_id uuid not null,
  recipient_profile_id uuid not null references public.chat_profiles(id) on delete cascade,
  dispatch_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz null,
  last_error text null,
  unique(event_type, source_id, recipient_profile_id)
);

alter table public.chat_notification_outbox enable row level security;
revoke all on table public.chat_notification_outbox from public, anon, authenticated;
grant select, update on table public.chat_notification_outbox to service_role;
```

Add the single URL owner:

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

Add `chat_private.enqueue_notification(p_event_type text, p_source_id uuid, p_recipient_profile_id uuid) returns uuid`. It must insert with `on conflict do nothing returning id, dispatch_token`. Only a newly inserted row may call `net.http_post`. Wrap only the `net.http_post` call in an exception block so a network enqueue failure cannot roll back the Chat/Call transaction:

```sql
begin
  perform net.http_post(
    url := chat_private.notification_dispatch_url(),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'action', 'dispatch_event',
      'event_id', v_event_id,
      'dispatch_token', v_dispatch_token
    )
  );
exception when others then
  update public.chat_notification_outbox
  set last_error = left('dispatch_enqueue_failed:' || sqlerrm, 500)
  where id = v_event_id;
end;
```

Return `v_event_id`; return null if the unique event already existed.

- [ ] **Step 4: Run GREEN for foundation contracts**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: binding/session/outbox tests PASS; the final Chat/Call wiring test remains RED because the second migration intentionally does not exist yet.

- [ ] **Step 5: Apply only the foundation migration and verify safety**

Apply the migration to project `gcnoahqsrquxkwkjbuxy`. Then run:

```sql
select count(*) as invalid_push_targets
from public.chat_call_push_subscriptions ps
left join public.chat_sessions s
  on s.auth_session_id = ps.auth_session_id
 and s.device_id = ps.device_id
 and s.profile_id = ps.profile_id
left join public.chat_profiles p on p.id = ps.profile_id
left join auth.sessions a
  on a.id = ps.auth_session_id
 and a.user_id = p.auth_user_id
where s.auth_session_id is null
   or s.revoked_at is not null
   or a.id is null
   or (a.not_after is not null and a.not_after <= now());
```

Expected: `0`.

Record pre/post counts of `chat_profiles`, `chat_messages`, and `chat_calls`; they must not change. Only stale push-subscription rows may be removed.

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
- Consumes: `chat_service_push_targets`, `chat_notification_outbox`, canonical Chat/Call tables.
- Produces internal action `{ action: 'dispatch_event', event_id, dispatch_token }`.
- Preserves `config` and `test`.
- Temporarily preserves legacy `send` / `send_message` only for rolling compatibility.

- [ ] **Step 1: Write RED Edge Function source contracts**

Add to `push-sender-source.test.ts`:

```ts
expect(source).toContain('dispatch_event')
expect(source).toContain('chat_service_push_targets')
expect(source).toContain('chat_notification_outbox')
expect(source).toContain('dispatch_token')
expect(source).toContain('processed_at')
expect(source).toContain('message_id: message.id')
expect(source).toContain('call_id: call.id')
```

Also assert `sendToProfile` no longer owns validity by joining `chat_devices` itself.

Run:

```bash
npm test -- src/notifications/push-sender-source.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Replace target lookup with the service-only RPC**

Inside `sendToProfile` use:

```ts
const { data: subscriptions, error } = await service.rpc('chat_service_push_targets', {
  p_profile_id: profileId,
  p_device_id: options.deviceId ?? null,
})
if (error) throw new Error('push_target_lookup_failed')
```

Use returned `subscription_id` for 404/410 deletion. Keep VAPID, TTL, urgency, payload encoding, and exact-device test semantics unchanged.

- [ ] **Step 3: Add `dispatch_event` before bearer-authenticated actions**

Parse JSON, inspect `action`, and for `dispatch_event` create the service-role client without requiring a user bearer token. Require valid UUID `event_id` and `dispatch_token`. Load only the matching untrusted-input-free row:

```ts
const { data: eventRow } = await service
  .from('chat_notification_outbox')
  .select('id,event_type,source_id,recipient_profile_id,dispatch_token,processed_at')
  .eq('id', eventId)
  .eq('dispatch_token', dispatchToken)
  .maybeSingle()
```

If no row matches, return 403. If `processed_at` is already set, return `{ ok: true, duplicate: true }` without sending.

For `chat_message`, load the canonical message, require it is not revoked, prove `recipient_profile_id` is the other active member of that direct conversation, then build title/body/navigation from database values only. Admin navigation is:

```ts
`./admin/?conversation=${message.conversation_id}`
```

User navigation stays `./`.

For `incoming_call`, load the canonical Call, require `state === 'ringing'` and `callee_profile_id === recipient_profile_id`, then build the incoming-call payload from canonical caller/callee rows only.

After the attempt finishes, update the outbox row:

```ts
await service
  .from('chat_notification_outbox')
  .update({ processed_at: new Date().toISOString(), last_error: null })
  .eq('id', eventId)
  .eq('dispatch_token', dispatchToken)
  .is('processed_at', null)
```

If canonical validation or Web Push processing throws, set `processed_at` and a compact `last_error`, then return 500. A process crash before this update leaves the row unprocessed for diagnostics/manual replay.

- [ ] **Step 4: Preserve rolling compatibility without duplicate push**

Keep legacy `send_message` and `send` temporarily. Before legacy delivery, check whether a matching outbox event already exists. If it exists, return `{ ok: true, delegated: true }` without sending. If no outbox row exists, run the legacy path. Because Task 1 migration is deployed before this function, no “table missing” fallback is needed.

This makes the rollout order deterministic:

1. Task 1 foundation migration;
2. Task 2 Edge Function deploy;
3. Task 3 RPC wiring migration;
4. Task 4/5 frontend deploy;
5. Task 6 remove legacy actions.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npm test -- src/notifications/push-sender-source.test.ts src/notifications/call-push-registration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Deploy the compatibility Edge Function and self-test**

Deploy `taphoaxyz-call-push` preserving the production custom-auth setting. Run `Kiểm tra thông báo ✓` on one current exact device. Expected: test notification arrives through `chat_service_push_targets`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/taphoaxyz-call-push/index.ts src/notifications/push-sender-source.test.ts
git commit -m "feat: dispatch push from server events"
```

---

### Task 3: Wire Canonical Chat and Call RPCs to the Outbox

**Files:**
- Create: `supabase/migrations/20260901_wire_server_notification_dispatch.sql`
- Modify: `src/notifications/server-owned-schema.test.ts`

**Interfaces:**
- Consumes: `chat_private.enqueue_notification(...)`.
- Produces one `chat_message` outbox event per persisted User ↔ Admin message and one `incoming_call` event per successful ringing Call.

- [ ] **Step 1: Keep wiring test RED until the migration exists**

Run:

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected before implementation: only the Chat/Call wiring test is RED.

- [ ] **Step 2: Recreate the canonical four-argument Chat RPC**

Copy the current production body of:

```sql
public.chat_send_text_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_text text,
  p_reply_to_id uuid
)
```

Preserve every current membership, reply, capability, text-normalization, and idempotency rule. Immediately after `returning * into v_result`, enqueue only the existing direct Admin bridge:

```sql
if v_type = 'direct' and v_admin_bridge and v_peer is not null then
  perform chat_private.enqueue_notification('chat_message', v_result.id, v_peer);
end if;

return v_result;
```

The outbox unique constraint ensures a repeated `client_message_id` cannot enqueue or `pg_net` dispatch twice.

- [ ] **Step 3: Recreate the canonical Call start RPC**

Copy the current production `chat_start_voice_call(p_conversation_id uuid, p_device_id uuid)` body exactly, preserving advisory locks, busy checks, device checks, Call insert, and target-device insert. Only after successful Call creation/target setup add:

```sql
perform chat_private.enqueue_notification('incoming_call', v_call_id, v_target);
```

All `caller_busy`, `peer_busy`, and `call_already_active` returns remain before this line.

- [ ] **Step 4: Run GREEN wiring contracts**

```bash
npm test -- src/notifications/server-owned-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Apply the wiring migration and verify server dispatch**

Apply the migration. Send one controlled message and start one controlled ringing Call. Query:

```sql
select event_type, source_id, recipient_profile_id, processed_at, last_error
from public.chat_notification_outbox
order by created_at desc
limit 10;
```

Expected: one Chat row and one Call row, each with non-null `processed_at` after processing and null `last_error`. Attempt a busy Call and verify it creates no outbox row.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901_wire_server_notification_dispatch.sql src/notifications/server-owned-schema.test.ts
git commit -m "feat: enqueue chat and call push on server"
```

---

### Task 4: Remove Sender-Browser Push Ownership

**Files:**
- Modify: `src/supabase/message-backend.ts`
- Modify: `src/supabase/message-backend-notifications.test.ts`
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/voice-session.test.ts`
- Create: `src/notifications/server-owned-client-boundary.test.ts`
- Delete: four sender helper/test files listed in File Structure.

**Interfaces:**
- Consumes unchanged Chat/Call RPC responses.
- Produces sender clients that persist/start only; the backend owns push.

- [ ] **Step 1: Write RED boundary tests**

Create:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const messageBackend = readFileSync(new URL('../supabase/message-backend.ts', import.meta.url), 'utf8')
const voiceSession = readFileSync(new URL('../call/voice-session.ts', import.meta.url), 'utf8')

describe('server-owned push client boundary', () => {
  it('does not dispatch Chat push from sender code', () => {
    expect(messageBackend).not.toContain('sendChatMessagePush')
    expect(messageBackend).not.toContain("action: 'send_message'")
  })

  it('does not dispatch Call push from caller code', () => {
    expect(voiceSession).not.toContain('sendIncomingCallPush')
    expect(voiceSession).not.toContain("action: 'send'")
  })
})
```

Run:

```bash
npm test -- src/notifications/server-owned-client-boundary.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Remove Chat client dispatch only**

Delete the `sendChatMessagePush` import and fire-and-forget call from `message-backend.ts`. Keep RPC persistence/return semantics unchanged. Update `message-backend-notifications.test.ts` to assert successful persistence does not call `client.functions.invoke`.

- [ ] **Step 3: Remove Call client dispatch only**

Delete the `sendIncomingCallPush` import and call from `VoiceCallSession.startOutgoing()`. Do not change `beginUserGesture`, ringback, `callId`, token warm-up, LiveKit join, accept/decline, timer, or media behavior.

- [ ] **Step 4: Delete obsolete sender helpers**

Delete:

```text
src/notifications/chat-push-send.ts
src/notifications/chat-push-send.test.ts
src/notifications/call-push-send.ts
src/notifications/call-push-send.test.ts
```

- [ ] **Step 5: Run regression gates**

```bash
npm test -- src/notifications/server-owned-client-boundary.test.ts src/supabase/message-backend-notifications.test.ts src/call/voice-session.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

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
- Request: `{ type: 'CHAT_NOTIFICATION_CONTEXT_QUERY', conversationId: string }`
- Reply: `{ matches: boolean }` through `MessagePort`.
- Export: `installNotificationContextResponder(getSelectedConversationId: () => string | null): () => void`.
- Timeout fallback: 150 ms, default to showing the notification.

- [ ] **Step 1: Write RED payload/responder tests**

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

Create `window-context.test.ts`:

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

Run:

```bash
npm test -- src/notifications/payload.test.ts src/notifications/window-context.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Extend parsed payload**

Add `conversationId: string | undefined` to `PushNotificationPayload`, populated only from a non-empty string `conversation_id`. Preserve current title/body/navigate/badge/tag and Call vibration behavior.

- [ ] **Step 3: Implement the page-side responder**

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

- [ ] **Step 4: Wire exact selected conversation owners**

In `user-main.ts` install:

```ts
installNotificationContextResponder(() => getChatMessageState().conversationId || null)
```

In `admin-main.ts` install:

```ts
installNotificationContextResponder(() => getAdminState().selectedConversationId || null)
```

Do not persist notification context to localStorage, sessionStorage, IndexedDB, or Service Worker cache.

- [ ] **Step 5: Query visible windows from `src/sw.ts`**

Add:

```ts
async function isConversationVisible(
  windows: readonly WindowClient[],
  conversationId: string,
): Promise<boolean> {
  const visible = windows.filter((client) => client.visibilityState === 'visible')
  if (visible.length === 0) return false

  const replies = await Promise.all(visible.map((client) => new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(false), 150)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      finish(Boolean((event.data as { matches?: unknown } | null)?.matches))
    }
    client.postMessage({ type: 'CHAT_NOTIFICATION_CONTEXT_QUERY', conversationId }, [channel.port2])
  })))

  return replies.some(Boolean)
}
```

In the push handler:
- incoming Call + any visible window → preserve current no-duplicate system notification rule;
- Chat message + `conversationId` → suppress only when `isConversationVisible(...)` is true;
- no reply/timeout/no conversation ID → show the Chat notification;
- badge update remains independent from notification suppression.

- [ ] **Step 6: Route Admin notification clicks to the correct conversation**

Task 2 builds Admin Chat navigation as `./admin/?conversation=<uuid>`. In `bootWorkspace()` after `await startAdminRuntime()`, read:

```ts
const requestedConversationId = new URL(window.location.href).searchParams.get('conversation')
if (requestedConversationId) {
  try {
    await selectAdminConversation(requestedConversationId)
    history.replaceState(null, '', './')
  } catch {
    // Keep the normal Admin workspace usable if the stale notification points to an unavailable conversation.
  }
}
```

User has only one support conversation, so User Chat navigation remains `./`.

- [ ] **Step 7: Run focused/full gates**

```bash
npm test -- src/notifications/payload.test.ts src/notifications/window-context.test.ts src/notifications/presentation.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/notifications/payload.ts src/notifications/payload.test.ts src/notifications/window-context.ts src/notifications/window-context.test.ts src/sw.ts src/user-main.ts src/admin-main.ts
git commit -m "feat: suppress only visible chat notifications"
```

---

### Task 6: Finalize 0.13.0 and Verify Cross-Account Safety

**Files:**
- Modify: `supabase/functions/taphoaxyz-call-push/index.ts`
- Modify: `src/notifications/push-sender-source.test.ts`
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`

**Interfaces:**
- Final authenticated Edge actions: `config`, `test`.
- Final internal action: `dispatch_event`.
- Final release: `CHAT-ADMIN-0.13.0`.

- [ ] **Step 1: Verify server dispatch before removing legacy compatibility**

Using production DB/Edge Function with Task 3 wiring active:

1. User → Admin Chat creates exactly one outbox row and exactly one push when Admin is not in that conversation.
2. Admin → User Chat does the same.
3. A successful ringing Call creates exactly one incoming-call outbox row.
4. A busy Call creates none.
5. New outbox rows finish with non-null `processed_at`; unexplained `last_error` is a release blocker.

- [ ] **Step 2: Write RED assertions that legacy actions are removed**

Update `push-sender-source.test.ts`:

```ts
expect(source).not.toContain('action === "send_message"')
expect(source).not.toContain('action !== "send"')
expect(source).toContain('dispatch_event')
expect(source).toContain('action === "config"')
expect(source).toContain('action === "test"')
```

Run the test; expected FAIL while compatibility code still exists.

- [ ] **Step 3: Remove legacy `send` / `send_message` actions**

Delete only legacy request branches and compatibility checks. Keep the canonical Chat/Call payload builders used by `dispatch_event`, `config`, `test`, VAPID setup, target RPC, TTL/urgency, and 404/410 cleanup.

Run:

```bash
npm test -- src/notifications/push-sender-source.test.ts src/notifications/call-push-registration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Deploy the final Edge Function and exact-device self-test**

Deploy final `taphoaxyz-call-push`. Run `Kiểm tra thông báo ✓` on one current User session and one current Admin session. Each test notification must arrive only on that exact active device/session.

- [ ] **Step 5: RED then GREEN the release version**

Change `version.test.ts` expectations first:

```ts
expect(APP_VERSION).toBe('CHAT-ADMIN-0.13.0')
expect(APP_SEMVER).toBe('0.13.0')
```

Run `npm test -- src/version.test.ts`; expected FAIL on `0.12.4`.

Then update `version.ts` to:

```ts
export const APP_VERSION = 'CHAT-ADMIN-0.13.0'
export const APP_SEMVER = '0.13.0'
```

Preserve build-ID behavior unchanged.

- [ ] **Step 6: Run the complete clean release gate**

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Run SQL correctness checks**

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

Then:

```sql
select event_type,
       count(*) filter (where processed_at is null) as pending,
       count(*) filter (where last_error is not null) as errors
from public.chat_notification_outbox
group by event_type
order by event_type;
```

Any unexplained pending/error row from the controlled test window is a release blocker.

- [ ] **Step 8: Commit release**

```bash
git add supabase/functions/taphoaxyz-call-push/index.ts src/notifications/push-sender-source.test.ts src/version.ts src/version.test.ts
git commit -m "release: server-owned notifications 0.13.0"
```

- [ ] **Step 9: Merge only after feature-branch CI is green**

On the exact merge SHA require GitHub Pages checkout/install/typecheck/test/build/deploy PASS. Android web verification must also PASS; APK packaging is not part of notification acceptance unless this source change breaks it.

- [ ] **Step 10: Physical iPhone PWA + Android regression after production deploy**

Run this exact matrix:

1. Register notifications as Account A and confirm exact-device self-test.
2. Sign out Account A.
3. Sign in Account B on the same browser/PWA/device and register/test notifications.
4. Send Chat/Call to Account A: the switched device must not receive A's notification.
5. Send Chat/Call to Account B: the switched device must receive B's notification.
6. Revoke the current session and send another event: the revoked endpoint must not receive push.
7. Open the exact active Chat conversation and send a message: Realtime updates it, but no system Chat notification appears.
8. Stay in the app but move away from that conversation: one concise Chat system notification appears.
9. Background/close/lock the app: one Chat system notification appears.
10. Incoming Call foreground: Call UI + ringtone/vibration only, no duplicate system notification.
11. Incoming Call background/locked: system Web Push appears.

Do not call this milestone complete if any cross-account/session notification is observed.

- [ ] **Step 11: Close notification milestone and move to `user 1234`**

Only after automated and physical gates PASS, record migration names, final Edge Function version, merge SHA, CI run IDs, and physical PASS/FAIL. Then begin the separately scoped `user 1234` work.
