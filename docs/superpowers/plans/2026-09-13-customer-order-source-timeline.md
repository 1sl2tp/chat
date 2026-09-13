# Customer Order Source Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an inbound-only customer order-source timeline by time range, make quick splitting resilient without AI, keep AI optional, and connect selected source messages to the independent work/order panel without making Chat own order entry.

**Architecture:** Chat owns message aggregation, source-state tracking, quick/AI split helpers, and the middle-column source timeline. The existing work iframe remains the order-entry owner. Chat sends exact-origin work context to the iframe and accepts an exact-origin “order created” callback so source messages can be marked `Đã nhập` without text matching.

**Tech Stack:** Vanilla JavaScript, Node.js contract/runtime tests, Python contract tests, Supabase PostgreSQL migrations, Supabase Edge Functions (Deno/TypeScript), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-customer-order-source-timeline-design.md`

## Global Constraints

- Only inbound customer messages are eligible as order source material.
- Operator/admin replies must never enter the source aggregate or add quantity to an order.
- Original customer text and timestamps are immutable display/source data.
- Default time window is `Hôm nay`; supported windows are `Hôm nay | Hôm qua | Tuần này | Tùy chọn`.
- Quick split must work without AI and one unresolved line must not fail the whole source block.
- AI is optional; AI failure must never block manual order entry.
- Desktop keeps `Danh bạ | nguồn báo hàng | Công việc`; the source column and work iframe scroll independently.
- Mobile remains one-column and keeps `Trò chuyện | Công việc` navigation.
- Never show raw HTTP `200` as the user-facing error.
- Do not auto-merge repeated customer lines and do not auto-finalize an order.
- Do not modify Chat/Call/media sending behavior outside the source/order handoff.
- Production remains GitHub Pages; do not introduce Vercel.

---

### Task 1: Add pure source-range and candidate-filter core, and make quick split partial-success

**Files:**
- Create: `order-source-core.mjs`
- Create: `tests/test_v21_order_source_core.mjs`
- Modify: `supabase/functions/v21-order-scribe/scribe-core.mjs`
- Modify: `tests/test_v21_order_scribe_core.mjs`

**Interfaces:**
- Produces: `rangeForPreset(preset, nowMs, offsetMinutes, custom?) -> {from,to}`.
- Produces: `isLikelyOrderSource(text, aliases=[]) -> boolean`.
- Produces: `parseQuickOrderText(text) -> {ok:boolean,items:Array<{quantity:number,name:string}>,unresolved:Array<{raw:string}>,error:string|null}`.
- Preserves: `materializeAiSpans()` exact-source slicing.

- [ ] **Step 1: Write RED tests for time ranges and inbound text candidate rules**

```js
import assert from 'node:assert/strict';
import {rangeForPreset,isLikelyOrderSource} from '../order-source-core.mjs';

const now=Date.parse('2026-09-13T08:30:00.000Z');
const vnOffset=-420;
assert.deepEqual(rangeForPreset('today',now,vnOffset),{
  from:'2026-09-12T17:00:00.000Z',
  to:'2026-09-13T17:00:00.000Z',
});
assert.equal(isLikelyOrderSource('3 chua có đường'),true);
assert.equal(isLikelyOrderSource('2 thùng sim 1 lít'),true);
assert.equal(isLikelyOrderSource('em cảm ơn ạ'),false);
assert.equal(isLikelyOrderSource('mai 2 giờ em qua'),false);
assert.equal(isLikelyOrderSource('5 sua chua khong duong',['sua chua khong duong']),true);
```

- [ ] **Step 2: Run the new core test and confirm RED**

Run: `node tests/test_v21_order_source_core.mjs`

Expected: FAIL because `order-source-core.mjs` does not exist.

- [ ] **Step 3: Implement range and candidate helpers**

```js
const DAY=86400000;

export function rangeForPreset(preset,nowMs=Date.now(),offsetMinutes=new Date().getTimezoneOffset(),custom={}){
  const shifted=new Date(Number(nowMs)-Number(offsetMinutes)*60000);
  const y=shifted.getUTCFullYear();
  const m=shifted.getUTCMonth();
  const d=shifted.getUTCDate();
  const localMidnightUtc=Date.UTC(y,m,d)+Number(offsetMinutes)*60000;
  if(preset==='today')return {from:new Date(localMidnightUtc).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  if(preset==='yesterday')return {from:new Date(localMidnightUtc-DAY).toISOString(),to:new Date(localMidnightUtc).toISOString()};
  if(preset==='week'){
    const weekday=(shifted.getUTCDay()+6)%7;
    const start=localMidnightUtc-weekday*DAY;
    return {from:new Date(start).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  }
  if(preset==='custom'){
    const from=String(custom.from||'');
    const to=String(custom.to||'');
    const start=Date.parse(from+'T00:00:00.000Z')+Number(offsetMinutes)*60000;
    const end=Date.parse(to+'T00:00:00.000Z')+Number(offsetMinutes)*60000+DAY;
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('invalid_date_range');
    return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
  }
  throw new Error('invalid_range_preset');
}

export function isLikelyOrderSource(value,aliases=[]){
  const text=String(value||'').trim();
  if(!text)return false;
  const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  const hasQty=/(^|\s)\d+(?:[.,]\d+)?\s+\S/u.test(normalized);
  const hasPack=/\b(thung|loc|goi|bich|tui|chai|lon|hop|khay|cay)\b/u.test(normalized);
  const multiLine=text.split(/\n+/u).filter(Boolean).length>1;
  const aliasHit=(Array.isArray(aliases)?aliases:[]).some(alias=>normalized.includes(String(alias||'').trim().toLowerCase()));
  return Boolean((hasQty&&hasPack)||(hasQty&&multiLine)||(hasQty&&aliasHit));
}
```

- [ ] **Step 4: Extend quick split tests for partial success**

Add to `tests/test_v21_order_scribe_core.mjs`:

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

- [ ] **Step 5: Change `parseQuickOrderText` to collect unresolved chunks instead of aborting**

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

- [ ] **Step 6: Run focused tests**

Run:

```bash
node tests/test_v21_order_source_core.mjs
node tests/test_v21_order_scribe_core.mjs
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add order-source-core.mjs tests/test_v21_order_source_core.mjs supabase/functions/v21-order-scribe/scribe-core.mjs tests/test_v21_order_scribe_core.mjs
git commit -m "feat: add customer order source core"
```

---

### Task 2: Store source processing state and source-message links safely

**Files:**
- Create: `supabase/migrations/20260913_chat_order_source_states.sql`
- Modify: `tests/test_v21_order_draft_db_contract.py`
- Create: `tests/test_v21_order_source_db_contract.py`

**Interfaces:**
- Produces table: `public.chat_order_source_states` keyed by `(message_id, admin_account_id)`.
- Produces optional draft-line link: `chat_order_draft_lines.source_message_id`.
- State values: `pending | working | ignored | imported`.
- External work-order callback fields: `linked_external_order_id`, `linked_external_order_no`.

- [ ] **Step 1: Write RED schema contracts**

```python
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIGRATION=ROOT/'supabase/migrations/20260913_chat_order_source_states.sql'
assert MIGRATION.exists()
text=MIGRATION.read_text(encoding='utf-8').lower()
for token in [
    'create table if not exists public.chat_order_source_states',
    'message_id uuid not null references public.v21_messages(id)',
    'admin_account_id uuid not null references public.v21_accounts(id)',
    "check (state in ('pending','working','ignored','imported'))",
    'linked_external_order_id text null',
    'linked_external_order_no text null',
    'add column if not exists source_message_id uuid',
    'references public.v21_messages(id) on delete set null',
    'enable row level security',
    'revoke all',
]:
    assert token in text
```

- [ ] **Step 2: Run and confirm RED**

Run: `python tests/test_v21_order_source_db_contract.py`

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Add migration**

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

- [ ] **Step 4: Extend draft DB contract to require `source_message_id` preservation**

Add an assertion to `tests/test_v21_order_draft_db_contract.py` that the new migration adds the nullable source link and does not remove the existing draft tables/RLS.

- [ ] **Step 5: Run schema contracts**

Run:

```bash
python tests/test_v21_order_source_db_contract.py
python tests/test_v21_order_draft_db_contract.py
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260913_chat_order_source_states.sql tests/test_v21_order_source_db_contract.py tests/test_v21_order_draft_db_contract.py
git commit -m "feat: store order source processing state"
```

---

### Task 3: Add an admin-only inbound source timeline Edge Function

**Files:**
- Create: `supabase/functions/v21-order-source/index.ts`
- Create: `supabase/functions/v21-order-source/source-core.mjs`
- Create: `tests/test_v21_order_source_edge_contract.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `POST {action:'list',contactId,from,to,includeAll}` -> `{ok:true,conversationId,items:[{messageId,text,createdAt,state,linkedDraftId,linkedExternalOrderId,linkedExternalOrderNo}]}`.
- `POST {action:'set_state',contactId,messageId,state}` -> `{ok:true,state}`.
- `POST {action:'mark_imported',contactId,messageIds,externalOrderId,externalOrderNo}` -> `{ok:true,count}`.
- Only admin bearer may call the function.
- Every source query must include `.eq('sender_account_id',contactId)`.

- [ ] **Step 1: Write RED edge contract**

```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase/functions/v21-order-source/index.ts'
CORE=ROOT/'supabase/functions/v21-order-source/source-core.mjs'
assert EDGE.exists()
assert CORE.exists()
text=EDGE.read_text(encoding='utf-8').lower()
compact=''.join(text.split())
assert "db.auth.getuser" in compact
assert "eq('role','admin')" in compact or 'eq("role","admin")' in compact
assert "v21_conversations" in text
assert "v21_messages" in text
assert "eq('sender_account_id',contactid)" in compact or 'eq("sender_account_id",contactid)' in compact
assert ".gte('created_at',from)" in compact or '.gte("created_at",from)' in compact
assert ".lt('created_at',to)" in compact or '.lt("created_at",to)' in compact
assert "chat_order_source_states" in text
assert "action==='list'" in compact
assert "action==='set_state'" in compact
assert "action==='mark_imported'" in compact
```

- [ ] **Step 2: Run and confirm RED**

Run: `python tests/test_v21_order_source_edge_contract.py`

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Add pure server helper**

`source-core.mjs` exports `clean`, `normalizeState`, and the same inclusive deterministic candidate logic as `order-source-core.mjs`; do not import browser-only globals.

```js
export function normalizeState(value){
  const state=String(value||'').trim().toLowerCase();
  if(!['pending','working','ignored','imported'].includes(state))throw new Error('invalid_source_state');
  return state;
}
```

- [ ] **Step 4: Implement `list` with inbound-only filtering**

Core query shape:

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

Then load states for returned message ids and return exact `body` text unchanged. If `includeAll!==true`, apply deterministic candidate filtering only; do not call AI from this endpoint.

- [ ] **Step 5: Implement state mutation with membership validation**

Before update/upsert, query the exact message and require `conversation_id===resolvedConversationId` and `sender_account_id===contactId`. Upsert state using the authenticated admin account id as part of the primary key.

- [ ] **Step 6: Implement `mark_imported` for exact source ids**

For each validated inbound message id, upsert:

```ts
{
  message_id:messageId,
  admin_account_id:String(admin.account.id),
  contact_id:contactId,
  conversation_id:conversationId,
  state:'imported',
  linked_external_order_id:externalOrderId||null,
  linked_external_order_no:externalOrderNo||null,
  updated_at:new Date().toISOString(),
}
```

- [ ] **Step 7: Add CI step**

Add to `.github/workflows/verify-v21.yml`:

```yaml
- name: Customer order source timeline Edge contract
  run: python tests/test_v21_order_source_edge_contract.py
```

- [ ] **Step 8: Run focused tests and Deno check**

Run:

```bash
python tests/test_v21_order_source_edge_contract.py
deno check supabase/functions/v21-order-source/index.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/v21-order-source tests/test_v21_order_source_edge_contract.py .github/workflows/verify-v21.yml
git commit -m "feat: add inbound order source endpoint"
```

---

### Task 4: Normalize scribe responses and remove raw “200” failures

**Files:**
- Create: `order-scribe-client.js`
- Create: `tests/test_v21_order_scribe_client_runtime.js`
- Modify: `supabase/functions/v21-order-scribe/index.ts`
- Modify: `tests/test_v21_order_scribe_edge_contract.py`
- Modify: `index.source.html`

**Interfaces:**
- Produces: `window.V21OrderScribeClient.quick({contactId,text})`.
- Produces: `window.V21OrderScribeClient.ai({contactId,text})`.
- Throws stable codes: `invalid_response`, `ai_unavailable`, or server application error code; never raw status text `200`.

- [ ] **Step 1: Write RED runtime tests for result normalization**

Test cases:

```js
assert.equal(normalizeInvokeResult({data:{ok:true,items:[]},error:null}).ok,true);
assert.throws(()=>normalizeInvokeResult({data:{ok:false,error:'quick_parse_failed'},error:null}),/quick_parse_failed/);
assert.throws(()=>normalizeInvokeResult({data:null,error:{message:'FunctionsHttpError',context:{status:200}}}),/invalid_response/);
```

Also test that an application payload error wins over transport `error.message` when `data?.error` is available.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/test_v21_order_scribe_client_runtime.js`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the browser client**

```js
function normalizeInvokeResult({data,error}){
  if(data&&data.ok===true)return data;
  const code=String(data?.error||'').trim();
  if(code)throw new Error(code);
  if(error)throw new Error('invalid_response');
  throw new Error('invalid_response');
}
```

`invoke(action,{contactId,text})` must acquire the current Chat Supabase session and call `v21-order-scribe`; `quick` and `ai` wrap this helper.

- [ ] **Step 4: Stabilize provider errors in the Edge Function**

Change AI provider/network failures to `ai_unavailable`; keep malformed AI JSON as `ai_response_invalid`. Quick partial-success responses must return HTTP 200 with `items` and `unresolved`; they must not return 422 merely because one raw block is unresolved.

- [ ] **Step 5: Load the client before admin order-source UI**

Add to `index.source.html`:

```html
<script src="./order-scribe-client.js" data-build-source="order-scribe-client.js"></script>
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node tests/test_v21_order_scribe_client_runtime.js
node tests/test_v21_order_scribe_core.mjs
python tests/test_v21_order_scribe_edge_contract.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add order-scribe-client.js tests/test_v21_order_scribe_client_runtime.js supabase/functions/v21-order-scribe/index.ts tests/test_v21_order_scribe_edge_contract.py index.source.html
git commit -m "fix: make order scribe failures actionable"
```

---

### Task 5: Build the middle-column customer source timeline UI

**Files:**
- Create: `admin-order-source.js`
- Create: `tests/test_v21_order_source_ui.py`
- Modify: `index.source.html`
- Modify: `shell.js`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- Produces: `window.V21AdminOrderSource.open({preset='today'})`.
- Produces: `window.V21AdminOrderSource.context() -> {contactId,customerName,preset,from,to,sourceMessageIds}`.
- Produces: `window.V21AdminOrderSource.markImported({contactId,messageIds,externalOrderId,externalOrderNo})`.
- Dispatches: `document.dispatchEvent(new CustomEvent('v21-work-context',{detail:context}))` whenever selected source ids/customer/time window changes.
- Default on wide authenticated Admin workspace: source mode visible; ordinary Chat remains reachable with a local `Chat` switch.

- [ ] **Step 1: Write RED UI contract**

Require these literal UI/data contracts in `admin-order-source.js`:

```python
for token in [
    "Hôm nay", "Hôm qua", "Tuần này", "Tùy chọn",
    "Hiện tất cả tin khách", "Chưa xử lý", "Đang xử lý", "Đã nhập", "Bỏ qua",
    "v21-order-source", "v21-work-context", "V21AdminOrderSource",
]:
    assert token in source
```

Require `index.source.html` to load `admin-order-source.js` and keep mobile one-column contract unchanged.

- [ ] **Step 2: Run and confirm RED**

Run: `python tests/test_v21_order_source_ui.py`

Expected: FAIL because `admin-order-source.js` does not exist.

- [ ] **Step 3: Implement source panel host and independent scroll owner**

Create the panel at runtime as a sibling of the existing chat scroll root inside the middle-column thread host. The panel must own its own scroll element:

```html
<section id="adminOrderSourcePanel" hidden>
  <header class="order-source-head"></header>
  <nav class="order-source-range"></nav>
  <div id="adminOrderSourceScroll" class="order-source-scroll"></div>
</section>
```

When source mode is active, hide only the chat scroll/composer nodes; do not hide the contact header and do not move `#workThreadView` back into the chat scroller.

- [ ] **Step 4: Implement range controls and custom dates**

Use `rangeForPreset()` from `order-source-core.mjs`; browser offset is `new Date().getTimezoneOffset()`. Presets map to API payload `from/to`. Custom range requires both dates and uses inclusive selected end date via the core helper.

- [ ] **Step 5: Fetch only the active customer and render exact source text**

Call `v21-order-source` action `list` with current active contact id. Render each card with exact text, formatted timestamp, and state. Never mutate displayed text with parser output.

- [ ] **Step 6: Add inclusive fallback and selection behavior**

`Hiện tất cả tin khách` toggles `includeAll=true`. Each card has a selection checkbox/button. Selecting a source id dispatches `v21-work-context` and marks it `working` through the source endpoint. `Bỏ qua` writes `ignored`. Imported messages remain visible and can be inspected.

- [ ] **Step 7: Add quick and AI helper actions per selected source**

Quick action calls `V21OrderScribeClient.quick` on exact card text and renders parsed rows plus unresolved raw rows. AI action calls `.ai` only on demand. On `ai_unavailable`, render exactly:

`AI chưa dùng được — vẫn có thể Tách nhanh hoặc nhập tay.`

Do not close or disable the right work panel on any parser error.

- [ ] **Step 8: Keep contact switches scoped**

Subscribe to the existing active-contact/navigation events used by the shell. On contact change: cancel stale request sequence, clear selected source ids, retain the chosen time preset, fetch the new customer, dispatch a new work context. Do not alter any existing work order/draft identity directly.

- [ ] **Step 9: Add CI and run focused tests**

Add workflow step:

```yaml
- name: Customer order source timeline UI contract
  run: python tests/test_v21_order_source_ui.py
```

Run:

```bash
python tests/test_v21_order_source_ui.py
python tests/test_v21_chat_workspace_3col.py
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add admin-order-source.js tests/test_v21_order_source_ui.py index.source.html shell.js .github/workflows/verify-v21.yml
git commit -m "feat: add customer order source timeline ui"
```

---

### Task 6: Route “Tạo đơn” into the source timeline and bridge work context to the iframe

**Files:**
- Modify: `admin-composer-actions.js`
- Modify: `getlink-auth-bridge.js`
- Modify: `tests/test_v21_order_draft_composer_integration.py`
- Create: `tests/test_v21_work_context_bridge.py`

**Interfaces:**
- `Tạo đơn` opens the current customer source timeline, default `today`; it no longer requires AI/scribe success before the operator can work.
- Chat -> iframe message: `{type:'taphoa-chat-work-context',contactId,customerName,sourceMessageIds,preset,from,to}`.
- iframe -> Chat message: `{type:'taphoa-work-order-created',contactId,sourceMessageIds,orderId,orderNo}`.
- Both directions use exact `https://get.taphoa.xyz` / `https://chat.taphoa.xyz` origin checks already used by the auth bridge.

- [ ] **Step 1: Write RED composer/bridge contracts**

Composer contract must require:

```python
assert "V21AdminOrderSource" in composer
assert ".open(" in composer
assert "taphoa-chat-work-context" in bridge
assert "taphoa-work-order-created" in bridge
assert "event.origin!==GETLINK_ORIGIN" in bridge.replace(' ', '')
```

Also reject making `invokeOrderScribe()` a prerequisite for opening order work.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
python tests/test_v21_order_draft_composer_integration.py
python tests/test_v21_work_context_bridge.py
```

Expected: FAIL on the new source/bridge expectations.

- [ ] **Step 3: Change `Tạo đơn` action**

After resolving the active contact, call:

```js
const source=window.V21AdminOrderSource;
if(!source?.open)throw new Error('order_source_unavailable');
await source.open({preset:'today'});
```

Keep `Đơn tạm` as a separate action; do not remove legacy draft inspection in this task.

- [ ] **Step 4: Extend the existing auth bridge with work context**

On `v21-work-context`, post exact context to the iframe:

```js
target.contentWindow.postMessage({type:'taphoa-chat-work-context',...detail},GETLINK_ORIGIN);
```

On iframe load, send auth first and then the latest work context.

- [ ] **Step 5: Handle order-created callback**

In the existing `message` listener, after the exact-origin check:

```js
if(event.data?.type==='taphoa-work-order-created'){
  void window.V21AdminOrderSource?.markImported?.({
    contactId:event.data.contactId,
    messageIds:event.data.sourceMessageIds,
    externalOrderId:event.data.orderId,
    externalOrderNo:event.data.orderNo,
  });
}
```

Reject callbacks whose contact id is not the current source context.

- [ ] **Step 6: Run focused tests**

Run:

```bash
python tests/test_v21_order_draft_composer_integration.py
python tests/test_v21_work_context_bridge.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-composer-actions.js getlink-auth-bridge.js tests/test_v21_order_draft_composer_integration.py tests/test_v21_work_context_bridge.py
git commit -m "feat: hand order source context to work panel"
```

---

### Task 7: Preserve source ids when legacy Chat draft creation is used

**Files:**
- Modify: `admin-order-draft.js`
- Modify: `supabase/functions/v21-order-draft/index.ts`
- Modify: `supabase/migrations/20260913_chat_order_drafts.sql` only if the create RPC is still the insertion owner; otherwise add an additive follow-up migration rather than editing deployed history.
- Modify: `tests/test_v21_order_draft_core.mjs`
- Modify: `tests/test_v21_order_draft_edge_contract.py`
- Modify: `tests/test_v21_order_draft_ui.py`

**Interfaces:**
- Draft line payload may include `sourceMessageId`.
- Existing callers without `sourceMessageId` continue to work.
- A source id is never inferred by text comparison.

- [ ] **Step 1: Add RED tests**

Require payload normalization to preserve:

```js
{quantity:3,name:'chua có đường',sourceMessageId:'11111111-1111-1111-1111-111111111111'}
```

Require Edge insert/update to map it to `source_message_id` and allow `null` for manual rows.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node tests/test_v21_order_draft_core.mjs
python tests/test_v21_order_draft_edge_contract.py
python tests/test_v21_order_draft_ui.py
```

- [ ] **Step 3: Implement optional source id propagation**

When a parsed source block becomes a Chat draft, attach the card’s exact message id to every line derived from that card. Manual product additions keep `sourceMessageId:null`.

- [ ] **Step 4: Mark source imported only after successful draft write**

After the draft Edge Function confirms creation/update, call the source endpoint `mark_imported` for the successfully linked message ids. Parser success alone must not change source state to imported.

- [ ] **Step 5: Run focused tests**

Same commands as Step 2; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-order-draft.js supabase/functions/v21-order-draft tests/test_v21_order_draft_core.mjs tests/test_v21_order_draft_edge_contract.py tests/test_v21_order_draft_ui.py
git commit -m "feat: link draft lines to customer source messages"
```

---

### Task 8: Full Chat verification, Supabase deployment, and merge gate

**Files:**
- Modify generated build outputs only through the existing canonical build tool: `index.html`, `version.json`.
- Deploy: migration `20260913_chat_order_source_states.sql`.
- Deploy Edge Functions: `v21-order-source`, updated `v21-order-scribe`, updated `v21-order-draft` if changed.

**Interfaces:**
- Consumes: all GREEN tasks above.
- Produces: merge-ready Chat side of the feature; the work iframe callback remains harmless if the companion work-panel change is not deployed yet.

- [ ] **Step 1: Run all focused contracts**

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

Expected: PASS.

- [ ] **Step 3: Rebuild canonical output**

Run: `python tools/build_current_preview.py`

- [ ] **Step 4: Run full canonical verification**

Run: `python tools/verify_current.py`

Expected: PASS with no Chat/Call/media regressions.

- [ ] **Step 5: Deploy database and Edge Functions to the existing Supabase project**

Apply the additive migration first, then deploy `v21-order-source`, `v21-order-scribe`, and `v21-order-draft` if modified. Verify each deployed function returns the intended admin-only error on unauthenticated requests instead of a provider/network error.

- [ ] **Step 6: Open/update implementation PR and wait for all CI**

Required green checks: `Verify V21`, `Admin Push TDD`, `Zalo Bridge TDD`.

- [ ] **Step 7: Merge only after GREEN and verify GitHub Pages on the exact merge SHA**

Do not use Vercel. Confirm Pages `completed/success` and `Verify V21` on `main` for the merge SHA before asking the user to test production.

---

## Companion work-panel plan dependency

This Chat plan deliberately does not make the iframe own Chat state. The iframe-side implementation is a separate plan in `1sl2tp/getlink` because it has its own order/cart/customer state owner and separate CI/deployment. It must accept `taphoa-chat-work-context`, preselect the same customer only when safe, and post `taphoa-work-order-created` after a confirmed backend order create. The Chat callback implemented in Task 6 is testable independently with a synthetic exact-origin message and becomes active automatically once the companion work-panel plan is deployed.
