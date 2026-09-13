# Customer Order Source Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an inbound-only customer order-source timeline by time range, make quick splitting resilient without AI, keep AI optional, and connect selected source messages to the independent work/order panel without making Chat own order entry.

**Architecture:** Chat owns message aggregation, source-state tracking, quick/AI split helpers, and the middle-column source timeline. The existing work iframe remains the order-entry owner. Chat sends exact-origin work context to the iframe and accepts an exact-origin “order created” callback so source messages can be marked `Đã nhập` without text matching.

**Tech Stack:** Vanilla JavaScript, Node.js runtime/contract tests, Python contract tests, Supabase PostgreSQL migrations, Supabase Edge Functions (Deno/TypeScript), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-customer-order-source-timeline-design.md`

## Global Constraints

- Only inbound customer messages are eligible as order source material.
- Operator/admin replies must never enter the source aggregate or add quantity to an order.
- Original customer text and timestamps are immutable source data.
- Default time window is `Hôm nay`; supported windows are `Hôm nay | Hôm qua | Tuần này | Tùy chọn`.
- Quick split must work without AI and one unresolved line must not fail the whole source block.
- AI is optional; AI failure must never block manual order entry.
- Desktop keeps `Danh bạ | nguồn báo hàng | Công việc`; the source column and work iframe scroll independently.
- Mobile remains one-column and keeps `Trò chuyện | Công việc`.
- Never show raw HTTP `200` as the primary user-facing error.
- Do not auto-merge repeated customer lines and do not auto-finalize an order.
- Do not modify Chat/Call/media sending behavior outside the source/order handoff.
- Production remains GitHub Pages; do not introduce Vercel.

---

### Task 1: Add pure time-range/candidate helpers and partial-success quick split

**Files:**
- Create: `order-source-core.mjs`
- Create: `tests/test_v21_order_source_core.mjs`
- Modify: `supabase/functions/v21-order-scribe/scribe-core.mjs`
- Modify: `tests/test_v21_order_scribe_core.mjs`

**Interfaces:**
- Produces `rangeForPreset(preset,nowMs,offsetMinutes,custom?) -> {from,to}`.
- Produces `isLikelyOrderSource(text,aliases=[]) -> boolean`.
- Changes `parseQuickOrderText(text)` to return `{ok,items,unresolved,error}`.
- Preserves `materializeAiSpans()` exact-source slicing.

- [ ] **Step 1: Write RED range/candidate tests**

Create `tests/test_v21_order_source_core.mjs`:

```js
import assert from 'node:assert/strict';
import {rangeForPreset,isLikelyOrderSource} from '../order-source-core.mjs';

const now=Date.parse('2026-09-13T08:30:00.000Z');
const vnOffset=-420;
assert.deepEqual(rangeForPreset('today',now,vnOffset),{
  from:'2026-09-12T17:00:00.000Z',
  to:'2026-09-13T17:00:00.000Z',
});
assert.deepEqual(rangeForPreset('yesterday',now,vnOffset),{
  from:'2026-09-11T17:00:00.000Z',
  to:'2026-09-12T17:00:00.000Z',
});
assert.equal(isLikelyOrderSource('3 chua có đường'),true);
assert.equal(isLikelyOrderSource('2 thùng sim 1 lít'),true);
assert.equal(isLikelyOrderSource('em cảm ơn ạ'),false);
assert.equal(isLikelyOrderSource('mai 2 giờ em qua'),false);
assert.equal(isLikelyOrderSource('5 sua chua khong duong',['sua chua khong duong']),true);
```

- [ ] **Step 2: Run RED**

Run: `node tests/test_v21_order_source_core.mjs`

Expected: FAIL because `order-source-core.mjs` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `order-source-core.mjs`:

```js
const DAY=86400000;

function normalized(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
}

export function rangeForPreset(preset,nowMs=Date.now(),offsetMinutes=new Date().getTimezoneOffset(),custom={}){
  const offset=Number(offsetMinutes)||0;
  const shifted=new Date(Number(nowMs)-offset*60000);
  const localMidnightUtc=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())+offset*60000;
  if(preset==='today')return {from:new Date(localMidnightUtc).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  if(preset==='yesterday')return {from:new Date(localMidnightUtc-DAY).toISOString(),to:new Date(localMidnightUtc).toISOString()};
  if(preset==='week'){
    const weekday=(shifted.getUTCDay()+6)%7;
    const start=localMidnightUtc-weekday*DAY;
    return {from:new Date(start).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  }
  if(preset==='custom'){
    const from=String(custom.from||'').trim();
    const to=String(custom.to||'').trim();
    const start=Date.parse(`${from}T00:00:00.000Z`)+offset*60000;
    const end=Date.parse(`${to}T00:00:00.000Z`)+offset*60000+DAY;
    if(!from||!to||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('invalid_date_range');
    return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
  }
  throw new Error('invalid_range_preset');
}

export function isLikelyOrderSource(value,aliases=[]){
  const text=String(value||'').trim();
  if(!text)return false;
  const valueNorm=normalized(text);
  if(/^(em cam on|cam on|vang|da|ok|oke|ok e|em cam on a)\b/u.test(valueNorm))return false;
  const hasQty=/(^|\s)\d+(?:[.,]\d+)?\s+\S/u.test(valueNorm);
  if(!hasQty)return false;
  const hasPack=/\b(thung|loc|goi|bich|tui|chai|lon|hop|khay|cay)\b/u.test(valueNorm);
  const multiLine=text.split(/\n+/u).filter(Boolean).length>1;
  const aliasHit=(Array.isArray(aliases)?aliases:[]).some(alias=>{
    const key=normalized(alias);
    return key&&valueNorm.includes(key);
  });
  const looksTimeOnly=/\b\d{1,2}\s*(gio|h|phut)\b/u.test(valueNorm)&&!hasPack&&!multiLine&&!aliasHit;
  if(looksTimeOnly)return false;
  return true;
}
```

- [ ] **Step 4: Add RED partial-split tests**

Append to `tests/test_v21_order_scribe_core.mjs`:

```js
{
  const result=parseQuickOrderText('3 chua có đường\nem cảm ơn ạ\n2 chua nha đam');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:3,name:'chua có đường'},
    {quantity:2,name:'chua nha đam'},
  ]);
  assert.deepEqual(result.unresolved,[{raw:'em cảm ơn ạ'}]);
}
{
  const result=parseQuickOrderText('15 thùng bò một thùng sim 5 lít hai thùng sim 2 l');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[]);
  assert.deepEqual(result.unresolved,[{raw:'15 thùng bò một thùng sim 5 lít hai thùng sim 2 l'}]);
}
```

- [ ] **Step 5: Implement partial-success quick split**

Replace only `parseQuickOrderText` in `scribe-core.mjs`:

```js
export function parseQuickOrderText(value){
  const source=normalizeSource(value);
  if(!source)return {ok:false,items:[],unresolved:[],error:'order_text_required'};
  const chunks=quickChunks(source);
  const items=[];
  const unresolved=[];
  for(const chunk of chunks){
    const match=chunk.match(/^\s*(\d+(?:[.,]\d+)?)\s+([\s\S]+?)\s*$/u);
    if(!match){unresolved.push({raw:chunk});continue;}
    const quantity=quantityNumber(match[1]);
    const name=String(match[2]??'').trim();
    if(!quantity||!name||(chunks.length===1&&looksLikeSpokenMultiItem(name))){
      unresolved.push({raw:chunk});
      continue;
    }
    items.push({quantity,name});
  }
  return {ok:true,items,unresolved,error:null};
}
```

- [ ] **Step 6: Verify and commit**

```bash
node tests/test_v21_order_source_core.mjs
node tests/test_v21_order_scribe_core.mjs
git add order-source-core.mjs tests/test_v21_order_source_core.mjs supabase/functions/v21-order-scribe/scribe-core.mjs tests/test_v21_order_scribe_core.mjs
git commit -m "feat: add customer order source core"
```

Expected: both tests PASS before commit.

---

### Task 2: Store source state and source-message links

**Files:**
- Create: `supabase/migrations/20260913_chat_order_source_states.sql`
- Create: `tests/test_v21_order_source_db_contract.py`
- Modify: `tests/test_v21_order_draft_db_contract.py`

**Interfaces:**
- Adds nullable `chat_order_draft_lines.source_message_id`.
- Creates `chat_order_source_states(message_id,admin_account_id,contact_id,conversation_id,state,linked_draft_id,linked_external_order_id,linked_external_order_no,updated_at)`.
- Allowed state values: `pending | working | ignored | imported`.

- [ ] **Step 1: Write RED schema contract**

```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
M=ROOT/'supabase/migrations/20260913_chat_order_source_states.sql'
assert M.exists()
text=M.read_text(encoding='utf-8').lower()
for token in [
    'add column if not exists source_message_id uuid',
    'references public.v21_messages(id) on delete set null',
    'create table if not exists public.chat_order_source_states',
    'message_id uuid not null references public.v21_messages(id)',
    'admin_account_id uuid not null references public.v21_accounts(id)',
    "check (state in ('pending','working','ignored','imported'))",
    'linked_external_order_id text null',
    'linked_external_order_no text null',
    'primary key(message_id,admin_account_id)',
    'enable row level security',
    'revoke all',
]: assert token in text
```

- [ ] **Step 2: Run RED**

Run: `python tests/test_v21_order_source_db_contract.py`

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Create additive migration**

```sql
begin;

alter table public.chat_order_draft_lines
  add column if not exists source_message_id uuid null
  references public.v21_messages(id) on delete set null;

create index if not exists chat_order_draft_lines_source_message_idx
  on public.chat_order_draft_lines(source_message_id)
  where source_message_id is not null;

create table if not exists public.chat_order_source_states (
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','working','ignored','imported')),
  linked_draft_id uuid null references public.chat_order_drafts(id) on delete set null,
  linked_external_order_id text null,
  linked_external_order_no text null,
  updated_at timestamptz not null default now(),
  primary key(message_id,admin_account_id)
);

create index if not exists chat_order_source_states_contact_updated_idx
  on public.chat_order_source_states(admin_account_id,contact_id,updated_at desc);

alter table public.chat_order_source_states enable row level security;
revoke all on public.chat_order_source_states from public,anon,authenticated;
commit;
```

- [ ] **Step 4: Extend existing draft schema test**

`tests/test_v21_order_draft_db_contract.py` must assert the original draft schema still exists and the additive migration owns `source_message_id`; do not edit the already-deployed `20260913_chat_order_drafts.sql`.

- [ ] **Step 5: Verify and commit**

```bash
python tests/test_v21_order_source_db_contract.py
python tests/test_v21_order_draft_db_contract.py
git add supabase/migrations/20260913_chat_order_source_states.sql tests/test_v21_order_source_db_contract.py tests/test_v21_order_draft_db_contract.py
git commit -m "feat: store order source processing state"
```

---

### Task 3: Add admin-only inbound source timeline Edge Function

**Files:**
- Create: `supabase/functions/v21-order-source/index.ts`
- Create: `supabase/functions/v21-order-source/source-core.mjs`
- Create: `tests/test_v21_order_source_edge_contract.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `POST {action:'list',contactId,from,to,includeAll}` -> `{ok:true,conversationId,items:[{messageId,text,createdAt,state,linkedDraftId,linkedExternalOrderId,linkedExternalOrderNo}]}`.
- `POST {action:'set_state',contactId,messageId,state}` -> `{ok:true,state}`.
- `POST {action:'mark_imported',contactId,messageIds,externalOrderId,externalOrderNo}` -> `{ok:true,count}`.
- Every list/mutation validates that the message belongs to the resolved conversation and `sender_account_id===contactId`.

- [ ] **Step 1: Write RED Edge contract**

```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase/functions/v21-order-source/index.ts'
CORE=ROOT/'supabase/functions/v21-order-source/source-core.mjs'
assert EDGE.exists() and CORE.exists()
text=EDGE.read_text(encoding='utf-8').lower(); compact=''.join(text.split())
assert 'db.auth.getuser' in compact
assert "eq('role','admin')" in compact or 'eq("role","admin")' in compact
assert 'v21_conversations' in text and 'v21_messages' in text
assert "eq('sender_account_id',contactid)" in compact or 'eq("sender_account_id",contactid)' in compact
assert "gte('created_at',from)" in compact or 'gte("created_at",from)' in compact
assert "lt('created_at',to)" in compact or 'lt("created_at",to)' in compact
for action in ["action==='list'","action==='set_state'","action==='mark_imported'"]:
    assert action in compact
```

- [ ] **Step 2: Run RED**

Run: `python tests/test_v21_order_source_edge_contract.py`

Expected: FAIL because function files do not exist.

- [ ] **Step 3: Implement server core validation**

`source-core.mjs` exports `clean`, deterministic candidate filtering equivalent to Task 1, and:

```js
export function normalizeState(value){
  const state=String(value||'').trim().toLowerCase();
  if(!['pending','working','ignored','imported'].includes(state))throw new Error('invalid_source_state');
  return state;
}
```

- [ ] **Step 4: Implement admin auth + conversation resolution**

Reuse the `requireAdmin()` shape from `v21-order-scribe`. Resolve the conversation containing the authenticated admin and requested contact before any message query.

- [ ] **Step 5: Implement inbound-only range query**

Use this query shape:

```ts
const messages=await db.from('v21_messages')
  .select('id,body,created_at,sender_account_id')
  .eq('conversation_id',conversationId)
  .eq('sender_account_id',contactId)
  .is('deleted_at',null)
  .not('body','is',null)
  .gte('created_at',from)
  .lt('created_at',to)
  .order('created_at',{ascending:true});
```

Load state rows for returned ids. With `includeAll!==true`, apply only deterministic filtering; no AI call belongs in this endpoint.

- [ ] **Step 6: Implement validated state mutations**

Before `set_state` or `mark_imported`, re-read the exact message and require the resolved conversation plus `sender_account_id===contactId`. `mark_imported` upserts `state:'imported'` plus external order id/no and authenticated admin id.

- [ ] **Step 7: Add CI and verify**

Add:

```yaml
- name: Customer order source timeline Edge contract
  run: python tests/test_v21_order_source_edge_contract.py
```

Run:

```bash
python tests/test_v21_order_source_edge_contract.py
deno check supabase/functions/v21-order-source/index.ts
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/v21-order-source tests/test_v21_order_source_edge_contract.py .github/workflows/verify-v21.yml
git commit -m "feat: add inbound order source endpoint"
```

---

### Task 4: Normalize scribe responses and eliminate misleading `200` failures

**Files:**
- Create: `order-scribe-client.js`
- Create: `tests/test_v21_order_scribe_client_runtime.js`
- Modify: `supabase/functions/v21-order-scribe/index.ts`
- Modify: `tests/test_v21_order_scribe_edge_contract.py`
- Modify: `index.source.html`

**Interfaces:**
- `V21OrderScribeClient.quick({contactId,text})`.
- `V21OrderScribeClient.ai({contactId,text})`.
- Client errors are stable application codes, not raw HTTP status strings.

- [ ] **Step 1: Write RED client normalization test**

```js
import assert from 'node:assert/strict';
import {normalizeInvokeResult} from '../order-scribe-client.js';
assert.equal(normalizeInvokeResult({data:{ok:true,items:[]},error:null}).ok,true);
assert.throws(()=>normalizeInvokeResult({data:{ok:false,error:'quick_parse_failed'},error:null}),/quick_parse_failed/);
assert.throws(()=>normalizeInvokeResult({data:null,error:{message:'FunctionsHttpError',context:{status:200}}}),/invalid_response/);
```

- [ ] **Step 2: Run RED**

Run: `node tests/test_v21_order_scribe_client_runtime.js`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement browser normalizer and authenticated invoke**

Core:

```js
export function normalizeInvokeResult({data,error}){
  if(data?.ok===true)return data;
  const code=String(data?.error||'').trim();
  if(code)throw new Error(code);
  if(error)throw new Error('invalid_response');
  throw new Error('invalid_response');
}
```

The runtime wrapper acquires the existing Chat Supabase session, calls `v21-order-scribe`, then passes `{data,error}` to the normalizer.

- [ ] **Step 4: Stabilize Edge errors**

Map Gemini network/provider failures to `ai_unavailable`; retain `ai_response_invalid` for malformed AI JSON. Quick parsing with unresolved blocks returns HTTP 200 `{ok:true,items,unresolved,...}`.

- [ ] **Step 5: Load the client and verify**

Add before the admin source UI in `index.source.html`:

```html
<script src="./order-scribe-client.js" data-build-source="order-scribe-client.js"></script>
```

Run:

```bash
node tests/test_v21_order_scribe_client_runtime.js
node tests/test_v21_order_scribe_core.mjs
python tests/test_v21_order_scribe_edge_contract.py
```

- [ ] **Step 6: Commit**

```bash
git add order-scribe-client.js tests/test_v21_order_scribe_client_runtime.js supabase/functions/v21-order-scribe/index.ts tests/test_v21_order_scribe_edge_contract.py index.source.html
git commit -m "fix: make order scribe failures actionable"
```

---

### Task 5: Build the middle-column inbound source timeline UI

**Files:**
- Create: `admin-order-source.js`
- Create: `tests/test_v21_order_source_ui.py`
- Modify: `index.source.html`
- Modify: `shell.js`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `V21AdminOrderSource.open({preset='today'})`.
- `V21AdminOrderSource.context() -> {contactId,customerName,preset,from,to,sourceMessageIds}`.
- `V21AdminOrderSource.markImported({contactId,messageIds,externalOrderId,externalOrderNo})`.
- Dispatches `v21-work-context` when source selection/customer/range changes.

- [ ] **Step 1: Write RED UI contract**

Require literals/functions:

```python
for token in [
    'Hôm nay','Hôm qua','Tuần này','Tùy chọn','Hiện tất cả tin khách',
    'Chưa xử lý','Đang xử lý','Đã nhập','Bỏ qua',
    'v21-order-source','v21-work-context','V21AdminOrderSource',
]: assert token in source
```

Also assert `index.source.html` loads `admin-order-source.js` and existing mobile one-column selectors remain unchanged.

- [ ] **Step 2: Run RED**

Run: `python tests/test_v21_order_source_ui.py`

Expected: FAIL because source UI file does not exist.

- [ ] **Step 3: Create an independent middle-column source panel**

Runtime markup:

```html
<section id="adminOrderSourcePanel" hidden>
  <header class="order-source-head"></header>
  <nav class="order-source-range"></nav>
  <div id="adminOrderSourceScroll" class="order-source-scroll"></div>
</section>
```

It is a sibling of the ordinary chat scroller inside the middle column. It owns its own scrolling and must never reparent or resize `#workThreadView`.

- [ ] **Step 4: Implement time controls**

Use `rangeForPreset()` with `new Date().getTimezoneOffset()`. Default `today`; preserve chosen preset when switching customers. Custom range requires explicit start/end dates.

- [ ] **Step 5: Fetch/render exact inbound text**

Invoke `v21-order-source` with active `contactId/from/to/includeAll`. Render exact returned `text`, timestamp and state. `Hiện tất cả tin khách` toggles `includeAll=true`; it never asks AI to decide visibility.

- [ ] **Step 6: Implement source selection/state actions**

Selecting a message adds its exact id to `sourceMessageIds`, writes `working`, and dispatches `v21-work-context`. `Bỏ qua` writes `ignored`. Imported messages remain visible with `Đã nhập`.

- [ ] **Step 7: Add optional quick/AI helpers**

Quick uses exact source text and renders `items + unresolved`. AI is invoked only by explicit action. On `ai_unavailable`, display exactly:

`AI chưa dùng được — vẫn có thể Tách nhanh hoặc nhập tay.`

No parsing error disables the right work iframe.

- [ ] **Step 8: Scope contact changes**

On active-contact change: increment request sequence, clear selected message ids, keep preset, fetch new contact source, dispatch new context. Do not retarget any existing work order/draft directly from Chat.

- [ ] **Step 9: Add CI, verify, commit**

Add:

```yaml
- name: Customer order source timeline UI contract
  run: python tests/test_v21_order_source_ui.py
```

Run:

```bash
python tests/test_v21_order_source_ui.py
python tests/test_v21_chat_workspace_3col.py
```

Then:

```bash
git add admin-order-source.js tests/test_v21_order_source_ui.py index.source.html shell.js .github/workflows/verify-v21.yml
git commit -m "feat: add customer order source timeline ui"
```

---

### Task 6: Route `Tạo đơn` to the source timeline and bridge context to Công việc

**Files:**
- Modify: `admin-composer-actions.js`
- Modify: `getlink-auth-bridge.js`
- Modify: `tests/test_v21_order_draft_composer_integration.py`
- Create: `tests/test_v21_work_context_bridge.py`

**Interfaces:**
- `Tạo đơn` opens source timeline for the current customer, default `today`.
- Chat -> iframe: `{type:'taphoa-chat-work-context',contactId,customerName,sourceMessageIds,preset,from,to}`.
- iframe -> Chat: `{type:'taphoa-work-order-created',contactId,sourceMessageIds,orderId,orderNo}`.
- Exact GETLINK origin check remains mandatory.

- [ ] **Step 1: Write RED composer/bridge contracts**

Require `V21AdminOrderSource.open`, both message types, exact-origin guard, and reject `invokeOrderScribe()` as a prerequisite for opening work.

- [ ] **Step 2: Run RED**

```bash
python tests/test_v21_order_draft_composer_integration.py
python tests/test_v21_work_context_bridge.py
```

- [ ] **Step 3: Change `Tạo đơn` action**

```js
const source=window.V21AdminOrderSource;
if(!source?.open)throw new Error('order_source_unavailable');
await source.open({preset:'today'});
```

Keep `Đơn tạm` as its existing separate action.

- [ ] **Step 4: Extend exact-origin iframe bridge**

Store latest work context in `getlink-auth-bridge.js`. On `v21-work-context` post:

```js
target.contentWindow.postMessage({type:'taphoa-chat-work-context',...detail},GETLINK_ORIGIN);
```

On iframe load, send auth first, then latest work context.

- [ ] **Step 5: Accept confirmed-order callback**

Inside the existing `event.origin===GETLINK_ORIGIN` listener:

```js
if(event.data?.type==='taphoa-work-order-created'){
  const current=window.V21AdminOrderSource?.context?.();
  if(String(current?.contactId||'')!==String(event.data.contactId||''))return;
  void window.V21AdminOrderSource?.markImported?.({
    contactId:event.data.contactId,
    messageIds:event.data.sourceMessageIds,
    externalOrderId:event.data.orderId,
    externalOrderNo:event.data.orderNo,
  });
}
```

- [ ] **Step 6: Verify and commit**

```bash
python tests/test_v21_order_draft_composer_integration.py
python tests/test_v21_work_context_bridge.py
git add admin-composer-actions.js getlink-auth-bridge.js tests/test_v21_order_draft_composer_integration.py tests/test_v21_work_context_bridge.py
git commit -m "feat: hand order source context to work panel"
```

---

### Task 7: Preserve source ids when legacy Chat draft flow is used

**Files:**
- Modify: `admin-order-draft.js`
- Modify: `supabase/functions/v21-order-draft/draft-core.mjs`
- Modify: `supabase/functions/v21-order-draft/index.ts`
- Modify: `tests/test_v21_order_draft_core.mjs`
- Modify: `tests/test_v21_order_draft_edge_contract.py`
- Modify: `tests/test_v21_order_draft_ui.py`

**Interfaces:**
- Optional line field `sourceMessageId` maps to the `source_message_id` column already added in Task 2.
- Existing callers without source ids remain valid.
- Never infer source ids by comparing text.

- [ ] **Step 1: Add RED normalization/storage tests**

Require this payload to survive normalization:

```js
{quantity:3,name:'chua có đường',sourceMessageId:'11111111-1111-1111-1111-111111111111'}
```

Require Edge insert/update to write `source_message_id`, and manual rows to write `null`.

- [ ] **Step 2: Run RED**

```bash
node tests/test_v21_order_draft_core.mjs
python tests/test_v21_order_draft_edge_contract.py
python tests/test_v21_order_draft_ui.py
```

- [ ] **Step 3: Propagate optional source id**

When source UI creates/extends a Chat draft, every parsed line from one message receives that exact `messageId`; manually added rows use `null`.

- [ ] **Step 4: Mark imported only after confirmed draft write**

After successful draft create/update, call `v21-order-source` action `mark_imported` for linked message ids and store `linked_draft_id`. Parser success alone never marks imported.

- [ ] **Step 5: Verify and commit**

```bash
node tests/test_v21_order_draft_core.mjs
python tests/test_v21_order_draft_edge_contract.py
python tests/test_v21_order_draft_ui.py
git add admin-order-draft.js supabase/functions/v21-order-draft tests/test_v21_order_draft_core.mjs tests/test_v21_order_draft_edge_contract.py tests/test_v21_order_draft_ui.py
git commit -m "feat: link draft lines to customer source messages"
```

---

### Task 8: Full Chat verification, Supabase rollout and production gate

**Files/Deployments:**
- Build outputs: `index.html`, `version.json` via existing canonical build tool only.
- Apply: `supabase/migrations/20260913_chat_order_source_states.sql`.
- Deploy: new `v21-order-source`; updated `v21-order-scribe`; updated `v21-order-draft` if Task 7 changed it.

**Interfaces:**
- Consumes all GREEN tasks above.
- Produces merge-ready Chat side; iframe completion callback remains harmless until its companion implementation is deployed.

- [ ] **Step 1: Run focused suite**

```bash
node tests/test_v21_order_source_core.mjs
node tests/test_v21_order_scribe_core.mjs
node tests/test_v21_order_scribe_client_runtime.js
python tests/test_v21_order_source_db_contract.py
python tests/test_v21_order_source_edge_contract.py
python tests/test_v21_order_source_ui.py
python tests/test_v21_work_context_bridge.py
python tests/test_v21_chat_workspace_3col.py
python tests/test_v21_order_draft_db_contract.py
python tests/test_v21_order_draft_edge_contract.py
python tests/test_v21_order_draft_ui.py
python tests/test_v21_order_draft_composer_integration.py
```

Expected: all PASS.

- [ ] **Step 2: Deno-check changed Edge Functions**

```bash
deno check supabase/functions/v21-order-source/index.ts
deno check supabase/functions/v21-order-scribe/index.ts
deno check supabase/functions/v21-order-draft/index.ts
```

- [ ] **Step 3: Rebuild and verify canonical Chat output**

```bash
python tools/build_current_preview.py
python tools/verify_current.py
```

Expected: PASS.

- [ ] **Step 4: Apply migration, then deploy Edge Functions**

Use the existing Supabase project. Apply the Task 2 migration before deploying any function that reads `chat_order_source_states` or `source_message_id`. Deploy `v21-order-source`, then updated `v21-order-scribe`, then updated `v21-order-draft` if changed.

- [ ] **Step 5: Verify unauthenticated and authenticated contracts**

Unauthenticated `v21-order-source` must return its intended authorization failure; an authenticated Admin list call must return only the requested contact’s inbound messages inside the requested `from/to` window.

- [ ] **Step 6: Open/update implementation PR and require all CI GREEN**

Required checks: `Verify V21`, `Admin Push TDD`, `Zalo Bridge TDD`.

- [ ] **Step 7: Merge only after GREEN and verify exact merge SHA on main + GitHub Pages**

Do not use Vercel. Confirm both `Verify V21` and GitHub Pages `completed/success` for the exact merge SHA before asking the user to test production.

---

## Companion work-panel dependency

The iframe-side implementation is specified in `1sl2tp/getlink/docs/superpowers/plans/2026-09-13-chat-order-source-handoff.md`. It accepts `taphoa-chat-work-context`, refuses to silently switch customer when a cart already has items, and posts `taphoa-work-order-created` only after the existing backend order create succeeds.