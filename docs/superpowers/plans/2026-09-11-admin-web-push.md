# Admin-only Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver admin-only Web Push notifications for new User → Admin chat events, including text/image/file/audio/missed-call summaries, background/closed-PWA delivery, same-conversation suppression, and click-through to the exact conversation.

**Architecture:** Canonical `v21_messages` inserts enqueue an idempotent Supabase outbox row only when the sender is an active User and the peer is an active Admin. A new `v21-admin-push` Edge Function owns authenticated subscription management and background delivery using server-only VAPID credentials; the existing `sw.js` owns `push`/`notificationclick`; a new browser controller owns permission/subscription state and foreground state bridging.

**Tech Stack:** Supabase Postgres/RLS/`pg_net`, Supabase Edge Functions (Deno + `npm:@supabase/supabase-js@2` + `npm:web-push@3.6.7`), Web Push API, Service Worker Notifications API, vanilla JS/CSS, pytest/Node contract tests, existing canonical build pipeline.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-web-push-design.md`

## Global Constraints

- Only active accounts with `v21_accounts.role='admin'` may register or receive push subscriptions.
- User → Admin canonical messages qualify; Admin → User messages never notify Admin.
- Zalo remains transport only: Zalo inbound qualifies only after it becomes a canonical User → Admin `v21_messages` row.
- VAPID private key exists only as an Edge Function secret; the browser receives only the public key.
- Permission is requested only from an explicit Admin gesture; never auto-prompt.
- If a visible/focused client is already on the same conversation, suppress the duplicate OS notification.
- Background notification sound is controlled by the OS/browser; do not add a custom background MP3.
- Existing PWA cache/update flow, Chat/keyboard/scroll, call Wake Lock, media pipeline, and Zalo bridge behavior remain unchanged.
- Existing `Verify V21` and `Zalo Bridge TDD` gates must remain green before merge.
- Do not merge to `main` or deploy production backend until branch verification is green.

---

### Task 1: Push schema, qualification trigger, and atomic outbox RPCs

**Files:**
- Create: `supabase/migrations/20260911_admin_web_push.sql`
- Create: `tests/test_v21_admin_web_push_schema.py`
- Modify: `tools/verify_current.py`

**Interfaces:**
- Produces table `public.v21_push_subscriptions`.
- Produces table `public.v21_push_outbox` with `unique(message_id, recipient_account_id)`.
- Produces service-role-only RPCs `public.v21_admin_push_claim(integer)` and `public.v21_admin_push_result(uuid,boolean,text,boolean)`.
- Produces private trigger function `v21_private.enqueue_admin_push()` on `v21_messages`.

- [ ] **Step 1: Write the failing schema contract**

Create `tests/test_v21_admin_web_push_schema.py` and assert the migration contains the exact ownership/security rules:

```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20260911_admin_web_push.sql').read_text('utf-8')

for token in [
    'create table if not exists public.v21_push_subscriptions',
    'create table if not exists public.v21_push_outbox',
    'unique(message_id,recipient_account_id)',
    'create or replace function v21_private.enqueue_admin_push()',
    "v_sender_role<>'user'",
    "v_recipient_role<>'admin'",
    'create or replace function public.v21_admin_push_claim',
    'for update skip locked',
    'create or replace function public.v21_admin_push_result',
    'grant execute on function public.v21_admin_push_claim(integer) to service_role',
]:
    assert token.replace(' ','') in SQL.replace(' ',''), token

assert 'grant select on public.v21_push_subscriptions to authenticated' not in SQL.lower()
assert 'grant select on public.v21_push_outbox to authenticated' not in SQL.lower()
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
python -m pytest -q tests/test_v21_admin_web_push_schema.py
```

Expected: FAIL because `20260911_admin_web_push.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Use the existing Zalo migrations' security-definer style. The core schema/qualification logic must be equivalent to:

```sql
create table if not exists public.v21_push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.v21_accounts(id) on delete cascade,
  device_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v21_push_outbox(
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  recipient_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  sender_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  state text not null default 'pending' check(state in('pending','processing','sent','retry','dead')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id,recipient_account_id)
);
```

`v21_private.enqueue_admin_push()` must resolve the peer from `v21_conversations`, verify sender active role=`user`, peer active role=`admin`, then `insert ... on conflict(message_id,recipient_account_id) do nothing`.

`v21_admin_push_claim(p_limit)` must atomically move due `pending/retry` rows to `processing` with `FOR UPDATE SKIP LOCKED`, increment `attempt_count`, and return claimed rows. `v21_admin_push_result(...)` must mark `sent`, or set `retry/dead` with bounded backoff and error text.

Enable RLS on both new tables; revoke direct access from `public,anon,authenticated`; grant only service-role table access and service-role RPC execution.

- [ ] **Step 4: Add the schema test to canonical verification**

Append to `tools/verify_current.py`:

```python
subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_admin_web_push_schema.py')],check=True,cwd=ROOT)
```

- [ ] **Step 5: Run RED→GREEN verification for Task 1**

Run:

```bash
python -m pytest -q tests/test_v21_admin_web_push_schema.py
python tools/verify_current.py
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911_admin_web_push.sql tests/test_v21_admin_web_push_schema.py tools/verify_current.py
git commit -m "feat: add admin push outbox schema"
```

---

### Task 2: Push payload core and Edge Function subscription API

**Files:**
- Create: `supabase/functions/v21-admin-push/push-core.mjs`
- Create: `supabase/functions/v21-admin-push/index.ts`
- Create: `tests/test_v21_admin_web_push_core.mjs`
- Create: `tests/test_v21_admin_web_push_edge_contract.py`
- Modify: `tools/verify_current.py`

**Interfaces:**
- `push-core.mjs` exports `summarizeNotification({body,media})`, `buildNotificationPayload(row)`, `isGoneStatus(statusCode)`, `retryDelaySeconds(attemptCount)`.
- Edge actions: `public_key`, `status`, `subscribe`, `unsubscribe`, `drain`.
- Edge Function is deployed with JWT verification disabled because `drain` uses a server wake token; authenticated browser actions verify the Bearer token inside the function.

- [ ] **Step 1: Write failing pure-core tests**

Create `tests/test_v21_admin_web_push_core.mjs`:

```js
import assert from 'node:assert/strict';
import {summarizeNotification,isGoneStatus,retryDelaySeconds} from '../supabase/functions/v21-admin-push/push-core.mjs';

assert.equal(summarizeNotification({body:'  Xin chào  ',media:[]}), 'Xin chào');
assert.equal(summarizeNotification({body:'',media:[{kind:'image'}]}), 'Ảnh');
assert.equal(summarizeNotification({body:'',media:[{kind:'audio'}]}), 'Ghi âm');
assert.equal(summarizeNotification({body:'',media:[{kind:'file',file_name:'bao-gia.pdf'}]}), 'bao-gia.pdf');
assert.equal(summarizeNotification({body:'Cuộc gọi nhỡ',media:[]}), 'Cuộc gọi nhỡ');
assert.equal(isGoneStatus(404),true);
assert.equal(isGoneStatus(410),true);
assert.equal(isGoneStatus(500),false);
assert.equal(retryDelaySeconds(1),10);
assert.equal(retryDelaySeconds(5),300);
```

- [ ] **Step 2: Run and verify RED**

```bash
node tests/test_v21_admin_web_push_core.mjs
```

Expected: FAIL because `push-core.mjs` does not exist.

- [ ] **Step 3: Implement `push-core.mjs`**

Use a pure module with no Deno globals:

```js
export function summarizeNotification({body='',media=[]}={}){
  const text=String(body||'').trim().replace(/\s+/g,' ');
  if(text)return text.slice(0,140);
  const first=Array.isArray(media)?media[0]:null;
  if(first?.kind==='image')return 'Ảnh';
  if(first?.kind==='audio')return 'Ghi âm';
  if(first?.kind==='file')return String(first.file_name||'Tệp').slice(0,80);
  return 'Tin nhắn mới';
}
export const isGoneStatus=status=>status===404||status===410;
export function retryDelaySeconds(attempt){return Math.min(300,10*(2**Math.max(0,Number(attempt||1)-1)));}
export function buildNotificationPayload(row){
  return {
    notification_id:String(row.outbox_id),
    message_id:String(row.message_id),
    conversation_id:String(row.conversation_id),
    contact_id:String(row.sender_account_id),
    title:String(row.sender_display_name||row.sender_username||'Tin nhắn mới'),
    body:summarizeNotification({body:row.body,media:row.media}),
    tag:`chat:${row.conversation_id}`,
    icon:'./icons/chat-192.png'
  };
}
```

- [ ] **Step 4: Write the Edge Function contract before implementation**

`tests/test_v21_admin_web_push_edge_contract.py` must assert:

```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDGE=(ROOT/'supabase/functions/v21-admin-push/index.ts').read_text('utf-8')
for token in [
    'npm:web-push@3.6.7',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
    'action === "public_key"', 'action === "subscribe"',
    'action === "unsubscribe"', 'action === "status"', 'action === "drain"',
    'admin_required', 'v21_push_subscriptions', 'v21_admin_push_claim',
    'v21_admin_push_result'
]: assert token in EDGE, token
assert 'VAPID_PRIVATE_KEY' not in EDGE.split('public_key')[1].split('return')[0]
```

- [ ] **Step 5: Implement `v21-admin-push/index.ts`**

Use `npm:@supabase/supabase-js@2` and `npm:web-push@3.6.7`. For browser actions, verify JWT exactly like `v21-zalo-admin`: create an anon client with the Authorization header, call `auth.getUser()`, then use the service client to load `v21_accounts` and require active `role='admin'`.

`subscribe` must validate `endpoint`, `keys.p256dh`, and `keys.auth`, then service-role upsert by `endpoint` with `account_id=caller.id`, `device_id`, platform and user-agent. `status` only returns whether the caller's endpoint/device is enabled. `unsubscribe` disables/removes only the caller's endpoint.

`public_key` returns only:

```ts
return reply(200,{ok:true,public_key:vapidPublic});
```

No private key or service-role value may be included in responses/logs.

- [ ] **Step 6: Wire tests into canonical verify and run GREEN**

Add to `tools/verify_current.py`:

```python
subprocess.run(['node',str(ROOT/'tests'/'test_v21_admin_web_push_core.mjs')],check=True,cwd=ROOT)
subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_admin_web_push_edge_contract.py')],check=True,cwd=ROOT)
```

Run:

```bash
node tests/test_v21_admin_web_push_core.mjs
python -m pytest -q tests/test_v21_admin_web_push_edge_contract.py
python tools/verify_current.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/v21-admin-push tests/test_v21_admin_web_push_core.mjs tests/test_v21_admin_web_push_edge_contract.py tools/verify_current.py
git commit -m "feat: add admin push edge function"
```

---

### Task 3: Delivery drain, wake authentication, and `pg_net` signal

**Files:**
- Modify: `supabase/migrations/20260911_admin_web_push.sql`
- Modify: `supabase/functions/v21-admin-push/index.ts`
- Modify: `tests/test_v21_admin_web_push_schema.py`
- Modify: `tests/test_v21_admin_web_push_edge_contract.py`

**Interfaces:**
- Migration creates one private wake token and stores only its SHA-256 in a service-role-readable auth row.
- Message trigger enqueues first; a separate after-insert outbox signal calls `https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-admin-push` with `{"action":"drain"}`.
- `drain` never trusts title/body from the request; it only claims canonical DB rows.

- [ ] **Step 1: Extend failing contracts for wake ownership**

Require migration tokens:

```python
for token in [
  'v21_admin_push_wake_secret',
  'v21_admin_push_auth',
  'net.http_post',
  'x-push-wake-token',
  "functions/v1/v21-admin-push",
]: assert token in SQL, token
```

Require Edge Function to hash `x-push-wake-token` and compare against the service-role-readable hash before allowing `drain`.

- [ ] **Step 2: Run tests and verify RED**

```bash
python -m pytest -q tests/test_v21_admin_web_push_schema.py tests/test_v21_admin_web_push_edge_contract.py
```

Expected: FAIL for missing wake signal/auth.

- [ ] **Step 3: Implement wake secret + signal in migration**

Generate a random wake token once at migration time; store plaintext only in a `v21_private` table and its SHA-256 in `public.v21_admin_push_auth` with all public/anon/authenticated access revoked. `v21_private.admin_push_signal()` reads the private token and calls `net.http_post` with `x-push-wake-token` after an outbox row is inserted.

The signal function returns immediately and never raises into message insertion if `pg_net` fails.

- [ ] **Step 4: Implement `drain` delivery**

`drain` must:

1. authenticate the wake header;
2. call `v21_admin_push_claim(20)`;
3. for each row, re-read canonical message/sender/media and current recipient role;
4. load every enabled subscription for that Admin;
5. build payload through `buildNotificationPayload`;
6. `webpush.sendNotification(...)` each target;
7. disable 404/410 targets; count transient failures;
8. mark outbox `sent` if all current targets completed, or `retry/dead` through `v21_admin_push_result`.

Use `TTL:60` and urgency `normal`; no custom sound field.

- [ ] **Step 5: Run full branch verification**

```bash
python tools/verify_current.py
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911_admin_web_push.sql supabase/functions/v21-admin-push/index.ts tests/test_v21_admin_web_push_schema.py tests/test_v21_admin_web_push_edge_contract.py
git commit -m "feat: wake and drain admin push outbox"
```

---

### Task 4: Extend the existing Service Worker for push, suppression, notification click, and badge

**Files:**
- Modify: `sw.js`
- Create: `tests/test_v21_admin_web_push_sw_runtime.js`
- Modify: `tests/test_v21_72_16_audio_pwa_contract.py`
- Modify: `tools/verify_current.py`

**Interfaces:**
- Page → SW message: `{type:'ADMIN_PUSH_STATE',visible:boolean,focused:boolean,route:string,conversationId:string|null,contactId:string|null}`.
- SW → page click message: `{type:'ADMIN_PUSH_OPEN',conversationId,contactId}`.
- Push payload follows Task 2.

- [ ] **Step 1: Write failing Service Worker runtime harness**

Create a Node `vm` harness that stubs `self.addEventListener`, `clients.matchAll`, `registration.showNotification`, and badge APIs. Assert:

```js
// background push => one showNotification
// visible+focused same conversation => zero showNotification
// different conversation => one showNotification
// tag remains chat:<conversation_id>
// notificationclick focuses existing client and postMessage()s ADMIN_PUSH_OPEN
// no existing client => clients.openWindow('./')
```

- [ ] **Step 2: Run RED**

```bash
node tests/test_v21_admin_web_push_sw_runtime.js
```

Expected: FAIL because `sw.js` has no `push` handler.

- [ ] **Step 3: Implement additive SW behavior**

Keep current install/activate/fetch code intact. Add transient client state:

```js
const adminPushClientState=new Map();
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
  if(event.data?.type==='ADMIN_PUSH_STATE'&&event.source?.id){
    adminPushClientState.set(event.source.id,{...event.data,updatedAt:Date.now()});
  }
});
```

On `push`, parse JSON, call `clients.matchAll({type:'window',includeUncontrolled:true})`, suppress only if a matched client state is `visible && focused && route==='chat' && conversationId===payload.conversation_id`. Otherwise:

```js
await self.registration.showNotification(payload.title,{
  body:payload.body,
  icon:payload.icon||'./icons/chat-192.png',
  badge:'./icons/chat-192.png',
  tag:payload.tag,
  renotify:true,
  data:{conversationId:payload.conversation_id,contactId:payload.contact_id}
});
```

Use badge APIs only when present; failures are ignored.

On `notificationclick`, close notification, focus an existing same-origin window and post `ADMIN_PUSH_OPEN`; if none exists, `openWindow('./')` and rely on a pending navigation payload encoded in the opened URL query (`push_contact`, `push_conversation`) so cold launch can consume it.

- [ ] **Step 4: Preserve PWA update contract**

Update `test_v21_72_16_audio_pwa_contract.py` only to allow/require the new additive `push` and `notificationclick` tokens; do not weaken existing cache/update assertions.

- [ ] **Step 5: Add runtime test to canonical verify and run GREEN**

```python
subprocess.run(['node',str(ROOT/'tests'/'test_v21_admin_web_push_sw_runtime.js')],check=True,cwd=ROOT)
```

Run:

```bash
node tests/test_v21_admin_web_push_sw_runtime.js
python tools/verify_current.py
```

Expected: PASS including the existing call Wake Lock test.

- [ ] **Step 6: Commit**

```bash
git add sw.js tests/test_v21_admin_web_push_sw_runtime.js tests/test_v21_72_16_audio_pwa_contract.py tools/verify_current.py
git commit -m "feat: handle admin web push in service worker"
```

---

### Task 5: Browser Admin Push controller and explicit subscription lifecycle

**Files:**
- Create: `admin-push-controller.js`
- Modify: `index.source.html`
- Create: `tests/test_v21_admin_web_push_controller.js`
- Create: `tests/test_v21_admin_web_push_ui_contract.py`
- Modify: `tools/verify_current.py`

**Interfaces:**
- Exposes `window.V21AdminPush={status,enable,disable,syncState,handleOpen,snapshot}`.
- Uses existing `V21AuthSessionStore.getClient()` and `snapshot()`.
- Calls Edge actions `public_key`, `status`, `subscribe`, `unsubscribe`.

- [ ] **Step 1: Write failing controller runtime tests**

Use a Node `vm` harness with mocked `Notification`, `navigator.serviceWorker.ready`, `pushManager`, `V21AuthSessionStore`, and Supabase `functions.invoke`.

Assert:

```js
// normal user: supported=false/admin=false and enable does not request permission
// admin explicit enable: requests permission exactly once
// granted admin: subscribes with userVisibleOnly:true and VAPID applicationServerKey
// subscribe action sends endpoint+p256dh+auth and device metadata
// denied permission maps to blocked state
// disable invokes unsubscribe and local subscription.unsubscribe()
```

- [ ] **Step 2: Run RED**

```bash
node tests/test_v21_admin_web_push_controller.js
```

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement `admin-push-controller.js`**

Use explicit gesture only:

```js
async function enable(){
  const auth=window.V21AuthSessionStore?.snapshot?.()||{};
  if(auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin')return {ok:false,code:'admin_required'};
  if(Notification.permission==='denied')return {ok:false,code:'blocked'};
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')return {ok:false,code:'blocked'};
  // get public key, subscribe, send canonical subscription to Edge Function
}
```

Add a `urlBase64ToUint8Array` helper and platform detection (`ios-pwa`, `ios-web`, `android-pwa`, `web`). On iOS `ios-web`, status returns `ios_install_required` without auto-prompt.

`syncState()` posts the current shell state to the SW controller using `ChatAppShell.snapshot()` and `document.visibilityState`/focus.

- [ ] **Step 4: Include controller in canonical source**

Add near the other local runtime scripts:

```html
<script src="./admin-push-controller.js" data-build-source="admin-push-controller.js"></script>
```

Add `admin-push-controller.js` to the `node --check` list in `tools/verify_current.py`.

- [ ] **Step 5: Add UI/ownership contract and canonical verify**

`tests/test_v21_admin_web_push_ui_contract.py` must assert the controller is in `index.source.html`, permission request lives only in `admin-push-controller.js`, and `v21-sync-engine.js` contains no Push/Notification transport ownership.

Run:

```bash
node tests/test_v21_admin_web_push_controller.js
python -m pytest -q tests/test_v21_admin_web_push_ui_contract.py
python tools/build_current_preview.py
python tools/verify_current.py
```

Expected: PASS and generated `index.html/version.json` synchronized.

- [ ] **Step 6: Commit**

```bash
git add admin-push-controller.js index.source.html index.html version.json tests/test_v21_admin_web_push_controller.js tests/test_v21_admin_web_push_ui_contract.py tools/verify_current.py
git commit -m "feat: add admin push browser controller"
```

---

### Task 6: Add compact Admin notification setting to existing `Zalo & tài khoản` modal

**Files:**
- Modify: `zalo-admin-link.js`
- Modify: `zalo-admin-link.css`
- Modify: `tests/test_v21_zalo_admin_ui_contract.py`
- Modify: `tests/test_v21_admin_web_push_ui_contract.py`

**Interfaces:**
- Existing modal remains one Admin popup; no second settings route/modal.
- UI calls only `window.V21AdminPush.status/enable/disable`.

- [ ] **Step 1: Extend UI contract RED**

Require these exact user-facing states in `zalo-admin-link.js`:

```python
for token in [
  'Thông báo', 'Bật thông báo', 'Đã bật thông báo',
  'Thông báo bị chặn', 'Thiết bị này không hỗ trợ',
  'Cài TAPHOA Chat ra Màn hình chính để nhận thông báo nền'
]: assert token in module, token
```

Also assert no `Notification.requestPermission` exists in `zalo-admin-link.js`.

- [ ] **Step 2: Run RED**

```bash
python -m pytest -q tests/test_v21_zalo_admin_ui_contract.py tests/test_v21_admin_web_push_ui_contract.py
```

Expected: FAIL for missing notification setting.

- [ ] **Step 3: Implement the compact settings row**

In `openAccountAdmin()`, insert a notification section between modal header and account error/list:

```html
<section class="zalo-account-notifications" data-admin-push-settings>
  <div><strong>Thông báo</strong><small data-admin-push-status></small></div>
  <button type="button" data-admin-push-toggle>Bật thông báo</button>
</section>
```

`renderAdminPushStatus()` maps controller state:

- `enabled` → `Đã bật thông báo` + button `Tắt`;
- `blocked` → `Thông báo bị chặn`, disabled button;
- `unsupported` → `Thiết bị này không hỗ trợ`, disabled button;
- `ios_install_required` → installation explanation, disabled button;
- otherwise → `Bật thông báo`.

Click is the only place that calls `V21AdminPush.enable()` so browser permission remains user-gesture initiated.

Add compact CSS in `zalo-admin-link.css` using the existing modal surface tokens; do not increase mobile modal footprint significantly.

- [ ] **Step 4: Run tests and full verify**

```bash
python -m pytest -q tests/test_v21_zalo_admin_ui_contract.py tests/test_v21_admin_web_push_ui_contract.py
python tools/build_current_preview.py
python tools/verify_current.py
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add zalo-admin-link.js zalo-admin-link.css index.html version.json tests/test_v21_zalo_admin_ui_contract.py tests/test_v21_admin_web_push_ui_contract.py
git commit -m "feat: add admin notification setting"
```

---

### Task 7: Deep-link/focus routing, foreground state bridge, and logout cleanup

**Files:**
- Modify: `admin-push-controller.js`
- Modify: `shell.js`
- Modify: `auth-session-store.js`
- Modify: `tests/test_v21_admin_web_push_controller.js`
- Create: `tests/test_v21_admin_web_push_navigation.js`
- Modify: `tools/verify_current.py`

**Interfaces:**
- Add `ChatAppShell.NavigationCommand.openContact(contactId)` as the stable routing entry point for push clicks.
- SW click message and cold-start query both call `V21AdminPush.handleOpen({contactId,conversationId})`.

- [ ] **Step 1: Write RED navigation tests**

The runtime test must prove:

```js
// ADMIN_PUSH_OPEN for contact X calls NavigationCommand.openContact(X)
// openContact selects existing ContactStore record, opens chat route, and closes mobile sidebar if needed
// focus/visibility/contact/route changes cause ADMIN_PUSH_STATE messages
// logout invokes best-effort V21AdminPush.disable({localOnly:false}) before local signOut
```

- [ ] **Step 2: Run RED**

```bash
node tests/test_v21_admin_web_push_navigation.js
```

Expected: FAIL for missing stable push route.

- [ ] **Step 3: Implement stable shell routing**

Add to `NavigationCommand` in `shell.js`:

```js
openContact(contactId){
  const item=window.V21ContactStore?.snapshot?.().find(row=>String(row.id)===String(contactId));
  if(!item)return false;
  setActiveContact(item.id,item.display_name||item.name||item.username);
  this.openChat();
  setSidebar(false);
  renderCallFocus();
  return true;
}
```

Do not expose DOM selectors as routing APIs.

- [ ] **Step 4: Implement state bridge/cold-start click consumption**

Controller listeners:

```js
document.addEventListener('visibilitychange',syncState);
window.addEventListener('focus',syncState);
window.addEventListener('blur',syncState);
document.addEventListener('v21-contact-store-change',syncState);
navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='ADMIN_PUSH_OPEN')void handleOpen(event.data);
});
```

At boot, consume `push_contact`/`push_conversation` query params once, route after auth/contact store becomes ready, then remove those params with `history.replaceState`.

- [ ] **Step 5: Add logout/revoke cleanup without blocking logout**

Before local sign-out in `auth-session-store.js`, call:

```js
try{await window.V21AdminPush?.disable?.({bestEffort:true});}catch{}
```

The cleanup must never prevent session revocation/logout.

- [ ] **Step 6: Run full verification**

```bash
node tests/test_v21_admin_web_push_navigation.js
python tools/build_current_preview.py
python tools/verify_current.py
```

Expected: PASS, including existing keyboard/scroll/call/media contracts.

- [ ] **Step 7: Commit**

```bash
git add admin-push-controller.js shell.js auth-session-store.js index.html version.json tests/test_v21_admin_web_push_controller.js tests/test_v21_admin_web_push_navigation.js tools/verify_current.py
git commit -m "feat: route admin push to exact conversation"
```

---

### Task 8: Branch gates, production backend deployment, and real-device E2E

**Files:**
- No new product files unless verification finds a real defect.
- PR must contain the migration, Edge Function, Service Worker/controller/UI, tests, and generated `index.html/version.json`.

**Interfaces:**
- Supabase project: `gcnoahqsrquxkwkjbuxy`.
- Edge Function: `v21-admin-push` with `verify_jwt=false`.
- Required Edge secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

- [ ] **Step 1: Run all local/canonical gates from the feature branch**

```bash
python tools/verify_current.py
cd bridge/zalo && npm test && cd ../..
```

Expected: all PASS.

- [ ] **Step 2: Create the PR as Draft and inspect full diff**

Confirm no unrelated Chat/call/media/Zalo transport refactor is present. Required changed areas are only push migration/function, `sw.js`, `admin-push-controller.js`, Admin settings integration, stable routing/logout hook, tests/build/docs.

- [ ] **Step 3: Wait for `Verify V21` and `Zalo Bridge TDD` on the final PR head**

Expected: both GREEN on the same head SHA. Do not merge if either is missing or stale.

- [ ] **Step 4: Generate VAPID keys once and store only server secrets**

Generate with:

```bash
npx --yes web-push@3.6.7 generate-vapid-keys --json
```

Configure Supabase Edge Function secrets:

```text
VAPID_PUBLIC_KEY=<generated publicKey>
VAPID_PRIVATE_KEY=<generated privateKey>
VAPID_SUBJECT=mailto:admin@taphoa.xyz
```

Never commit these values.

- [ ] **Step 5: Apply migration and deploy Edge Function from the verified PR head**

Apply `20260911_admin_web_push.sql`, then deploy `supabase/functions/v21-admin-push` with `verify_jwt=false`.

Verify database objects with read-only queries:

```sql
select to_regclass('public.v21_push_subscriptions'),to_regclass('public.v21_push_outbox');
select proname from pg_proc where proname in('v21_admin_push_claim','v21_admin_push_result');
select tgname from pg_trigger where tgname like '%admin_push%' and not tgisinternal;
```

- [ ] **Step 6: Verify authorization before real push**

On a normal User account, calling `subscribe` must return `admin_required`. On Admin, `public_key` returns only public key and `status` succeeds.

- [ ] **Step 7: Real-device Admin subscription test**

On one Admin device, explicitly tap `Bật thông báo`, accept OS permission, then confirm one enabled row exists in `v21_push_subscriptions` for the Admin/device.

For iPhone, use installed Home Screen PWA; a normal Safari tab is not the acceptance target for closed-app delivery.

- [ ] **Step 8: Real background message E2E**

Put/close the Admin app in background, send one User → Admin text message, and verify:

1. exactly one outbox row;
2. outbox reaches `sent`;
3. OS banner appears with sender name + text preview;
4. system sound follows device notification settings;
5. tapping banner focuses/opens TAPHOA Chat at the exact contact.

Repeat one case each for image, file, audio, and `Cuộc gọi nhỡ`; verify summaries are exactly `Ảnh`, filename/`Tệp`, `Ghi âm`, and `Cuộc gọi nhỡ`.

- [ ] **Step 9: Foreground suppression E2E**

Keep Admin visibly focused on the same conversation, send another message, and confirm no duplicate OS banner appears. Switch Admin to another conversation or `Công việc`, send again, and confirm the OS notification may appear.

- [ ] **Step 10: Merge only after E2E PASS, then verify `main` again**

Merge the PR, record the merge SHA, then require:

```text
Verify V21: success on merge SHA
GitHub Pages deployment: success on same merge SHA
```

Finally confirm production `v21-admin-push` remains ACTIVE and the migration/function versions match the merged files.

---

## Self-review

- Spec coverage: subscription security, outbox idempotency, User→Admin qualification, Zalo convergence, VAPID privacy, wake/drain, invalid endpoint cleanup, retry, SW banner/click, same-conversation suppression, badge best-effort, Admin-only UI, iOS PWA rule, logout cleanup, and real-device acceptance all have explicit tasks.
- Placeholder scan: no TBD/TODO/“similar to” steps remain.
- Type/interface consistency: `contactId`, `conversationId`, Edge action names, `ADMIN_PUSH_STATE`, `ADMIN_PUSH_OPEN`, `v21_admin_push_claim`, and `v21_admin_push_result` use the same names across DB, Edge, SW, browser controller, and tests.
