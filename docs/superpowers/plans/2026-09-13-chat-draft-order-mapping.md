# Chat Draft Order Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Admin `Tạo đơn -> Tách nhanh / AI ghi đơn` result into a persistent customer-bound `Đơn tạm` with one shared quantity per line and a two-region mapping UI from raw customer text to one catalog product name + selling price.

**Architecture:** Keep the existing order scribe isolated and unchanged for parsing. Add Chat-owned draft tables plus one Admin-only `v21-order-draft` Edge Function for all persistence/catalog writes, and a focused `admin-order-draft.js` browser module for draft list/editor/search/add-product UI. `admin-composer-actions.js` remains the entry owner: after parsing it creates a draft and immediately hands off to the draft module; `Đơn tạm` opens the saved-draft list.

**Tech Stack:** Vanilla browser JavaScript, Supabase JS 2.57.4, Supabase Postgres/RLS, Deno Edge Functions, Python/Node contract tests, GitHub Actions Verify V21.

**Spec:** `docs/superpowers/specs/2026-09-13-chat-draft-order-mapping-design.md`

## Global Constraints

- Left working region is only `SL + tên gốc`; right working region is only `Tên sản phẩm của mình + Giá`.
- Each line has exactly one quantity value. The right region must never own or render a second quantity.
- Customer raw names are never normalized, corrected, catalog-matched by AI, or rewritten.
- Product search returns active `public.products` rows and exposes only `id`, `name`, `price` to this UI.
- `+ Thêm mới` accepts only `Tên` and `Giá`, creates an active catalog product, then selects it for that draft line.
- Drafts are bound to the current Chat contact/conversation and snapshot the contact display name.
- Every quantity/product mapping edit persists immediately; reopening restores the same draft.
- `Gửi đơn` in this phase only finishes/closes editing while status remains `draft`; it does not send a Chat/Zalo message and does not mark delivered.
- New draft tables are Chat-owned and do not reuse `orders`, `getlink_sales_orders`, or AI order-session tables.
- New persistence is Admin-only through `v21-order-draft` with `verify_jwt=true`; browser code does not directly mutate draft tables or `public.products`.
- Do not modify normal call, guest call, quote, Zalo bridge, or existing AI product parser behavior.

---

### Task 1: Add isolated Chat draft schema and atomic create RPC

**Files:**
- Create: `supabase/migrations/20260913_chat_order_drafts.sql`
- Create: `tests/test_v21_order_draft_db_contract.py`

**Interfaces:**
- Produces tables `public.chat_order_drafts` and `public.chat_order_draft_lines`.
- Produces service-role-only RPC `public.chat_order_draft_create(p_contact_id uuid, p_conversation_id uuid, p_customer_name text, p_created_by_account_id uuid, p_lines jsonb) returns uuid`.
- Later Edge code relies on a single `quantity numeric` column per line and snapshots `product_id`, `product_name`, `unit_price` on selection.

- [ ] **Step 1: Write the failing database contract**

Create `tests/test_v21_order_draft_db_contract.py` with assertions equivalent to:

```python
from pathlib import Path

SQL = (Path(__file__).resolve().parents[1] / "supabase/migrations/20260913_chat_order_drafts.sql").read_text(encoding="utf-8").lower()
compact = "".join(SQL.split())

for table in ["chat_order_drafts", "chat_order_draft_lines"]:
    assert f"create table if not exists public.{table}" in SQL
    assert f"alter table public.{table} enable row level security" in SQL
    assert f"revoke all on public.{table} from public, anon, authenticated" in SQL

assert "contact_id uuid not null" in SQL
assert "conversation_id uuid" in SQL
assert "customer_name text not null" in SQL
assert "created_by_account_id uuid not null" in SQL
assert "status text not null default 'draft'" in SQL
assert "quantity numeric not null" in SQL
assert "raw_name text not null" in SQL
assert "product_id text" in SQL
assert "product_name text" in SQL
assert "unit_price numeric" in SQL
assert "unique (draft_id, line_no)" in SQL
assert "chat_order_draft_create" in SQL
assert "jsonb_array_elements" in SQL
assert "grant execute on function public.chat_order_draft_create" in SQL
assert "to service_role" in SQL
assert "to anon" not in compact.split("chat_order_draft_create", 1)[1]
print("chat order draft database contract PASS")
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
python tests/test_v21_order_draft_db_contract.py
```

Expected: FAIL because `20260913_chat_order_drafts.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Create the migration with these concrete structures:

```sql
begin;

create table if not exists public.chat_order_drafts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.v21_accounts(id),
  conversation_id uuid null references public.v21_conversations(id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  created_by_account_id uuid not null references public.v21_accounts(id),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_order_draft_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.chat_order_drafts(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  quantity numeric not null check (quantity > 0),
  raw_name text not null check (length(btrim(raw_name)) > 0),
  product_id text null references public.products(id) on delete set null,
  product_name text null,
  unit_price numeric null check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, line_no)
);

create index if not exists chat_order_drafts_creator_updated_idx
  on public.chat_order_drafts(created_by_account_id, updated_at desc);
create index if not exists chat_order_draft_lines_draft_line_idx
  on public.chat_order_draft_lines(draft_id, line_no);

alter table public.chat_order_drafts enable row level security;
alter table public.chat_order_draft_lines enable row level security;
revoke all on public.chat_order_drafts from public, anon, authenticated;
revoke all on public.chat_order_draft_lines from public, anon, authenticated;

create or replace function public.chat_order_draft_create(
  p_contact_id uuid,
  p_conversation_id uuid,
  p_customer_name text,
  p_created_by_account_id uuid,
  p_lines jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'draft_lines_required';
  end if;

  insert into public.chat_order_drafts(contact_id, conversation_id, customer_name, created_by_account_id)
  values(p_contact_id, p_conversation_id, btrim(p_customer_name), p_created_by_account_id)
  returning id into v_draft_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    insert into public.chat_order_draft_lines(draft_id, line_no, quantity, raw_name)
    values(
      v_draft_id,
      v_line_no,
      (v_line->>'quantity')::numeric,
      btrim(v_line->>'name')
    );
  end loop;

  return v_draft_id;
end;
$$;

revoke all on function public.chat_order_draft_create(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.chat_order_draft_create(uuid, uuid, text, uuid, jsonb) to service_role;

commit;
```

Keep `security invoker`: the Edge Function calls the RPC with the service-role client, so no extra definer privilege is needed.

- [ ] **Step 4: Run database contract GREEN**

Run:

```bash
python tests/test_v21_order_draft_db_contract.py
```

Expected: `chat order draft database contract PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260913_chat_order_drafts.sql tests/test_v21_order_draft_db_contract.py
git commit -m "feat: add chat order draft schema"
```

---

### Task 2: Add Admin-only draft Edge API and product mapping operations

**Files:**
- Create: `supabase/functions/v21-order-draft/index.ts`
- Create: `supabase/functions/v21-order-draft/draft-core.mjs`
- Create: `tests/test_v21_order_draft_core.mjs`
- Create: `tests/test_v21_order_draft_edge_contract.py`

**Interfaces:**
- Browser calls `v21-order-draft` using `{action, ...payload}`.
- Supported actions and payloads:
  - `create_from_lines`: `{contactId, conversationId, customerName, lines:[{quantity,name}]}` -> `{ok:true,draft}`
  - `get`: `{draftId}` -> `{ok:true,draft}`
  - `list`: `{}` -> `{ok:true,drafts:[...]}`
  - `update_quantity`: `{draftId,lineId,quantity}` -> `{ok:true,line}`
  - `search_products`: `{query}` -> `{ok:true,products:[{id,name,price}]}`
  - `select_product`: `{draftId,lineId,productId}` -> `{ok:true,line}`
  - `create_product`: `{draftId,lineId,name,price}` -> `{ok:true,product,line}`
- Admin creator ownership is enforced for `get`, `update_quantity`, `select_product`, and `create_product`.

- [ ] **Step 1: Write failing pure-core tests**

Create `tests/test_v21_order_draft_core.mjs`:

```js
import assert from 'node:assert/strict';
import { normalizeDraftLines, normalizePrice, productId } from '../supabase/functions/v21-order-draft/draft-core.mjs';

assert.deepEqual(normalizeDraftLines([
  {quantity:15,name:'thùng bò'},
  {quantity:1,name:'thùng sim 5 lít'},
]), [
  {quantity:15,name:'thùng bò'},
  {quantity:1,name:'thùng sim 5 lít'},
]);
assert.throws(()=>normalizeDraftLines([{quantity:0,name:'x'}]), /invalid_draft_line/);
assert.equal(normalizePrice('245000'), 245000);
assert.throws(()=>normalizePrice('-1'), /invalid_price/);
assert.match(productId('123e4567-e89b-12d3-a456-426614174000'), /^CHAT-[A-F0-9]{12}$/);
console.log('chat order draft core PASS');
```

- [ ] **Step 2: Write failing Edge contract**

Create `tests/test_v21_order_draft_edge_contract.py` that reads `index.ts` and asserts:

```python
from pathlib import Path

EDGE = (Path(__file__).resolve().parents[1] / "supabase/functions/v21-order-draft/index.ts").read_text(encoding="utf-8").lower()
compact = "".join(EDGE.split())

assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
for action in [
    "create_from_lines", "get", "list", "update_quantity",
    "search_products", "select_product", "create_product",
]:
    assert action in EDGE
assert "chat_order_draft_create" in EDGE
assert ".from('products')" in EDGE or '.from("products")' in EDGE
assert ".eq('active',true)" in compact or '.eq("active",true)' in compact
assert "select('id,name,price')" in compact or 'select("id,name,price")' in compact
assert "chat-" in EDGE
for forbidden in ["v21-ai-product-parser", "getlink-order-agent", "resolveparsedlineswithcatalog", "queueText", "v21_message_send"]:
    assert forbidden.lower() not in EDGE
print("chat order draft Edge contract PASS")
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
node tests/test_v21_order_draft_core.mjs
python tests/test_v21_order_draft_edge_contract.py
```

Expected: FAIL because Edge/core files do not exist.

- [ ] **Step 4: Implement `draft-core.mjs`**

Use small deterministic helpers:

```js
export function normalizeDraftLines(value){
  if(!Array.isArray(value)||!value.length)throw new Error('draft_lines_required');
  return value.map(row=>{
    const quantity=Number(row?.quantity);
    const name=String(row?.name??'').trim();
    if(!Number.isFinite(quantity)||quantity<=0||!name)throw new Error('invalid_draft_line');
    return {quantity,name};
  });
}

export function normalizePrice(value){
  const price=Number(String(value??'').replace(/[.,\s]/g,''));
  if(!Number.isFinite(price)||price<0)throw new Error('invalid_price');
  return price;
}

export function productId(uuid){
  return `CHAT-${String(uuid||'').replace(/-/g,'').slice(0,12).toUpperCase()}`;
}
```

- [ ] **Step 5: Implement `v21-order-draft/index.ts`**

Follow the existing `v21-order-scribe` auth/CORS pattern exactly. Key implementation requirements:

```ts
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { normalizeDraftLines, normalizePrice, productId } from "./draft-core.mjs";

const db=createClient(
  String(Deno.env.get('SUPABASE_URL')||''),
  String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''),
  {auth:{persistSession:false,autoRefreshToken:false}}
);
```

`requireAdmin(req)` must call `db.auth.getUser(token)` then query `v21_accounts` by `auth_user_id`, `role='admin'`, `deleted_at is null`, `locked_at is null`.

For `create_from_lines`:
1. Normalize lines with `normalizeDraftLines`.
2. Load contact from `v21_accounts` by `contactId`; reject missing/deleted contact.
3. If `conversationId` is present, load `v21_conversations` and verify the two members are exactly Admin + contact.
4. Resolve customer name as `contact.display_name || contact.username || body.customerName || 'Liên hệ'`.
5. Call `db.rpc('chat_order_draft_create', {p_contact_id, p_conversation_id, p_customer_name, p_created_by_account_id, p_lines: lines})`.
6. Return a full draft by calling the same internal `loadDraft(adminId,draftId)` helper used by `get`.

For `loadDraft`, first query `chat_order_drafts` with both `id=draftId` and `created_by_account_id=adminId`, then query `chat_order_draft_lines` ordered by `line_no` and return:

```ts
{
  id, contactId, conversationId, customerName, status,
  createdAt, updatedAt,
  lines:[{id,lineNo,quantity,rawName,productId,productName,unitPrice}]
}
```

For `list`, return newest first and compute `mapped` from lines with non-null `product_id`; return only `{id,contactId,customerName,total,mapped,createdAt,updatedAt}`.

For `update_quantity`, validate positive numeric quantity, verify draft ownership, update only `quantity` + `updated_at` for the line and draft.

For `search_products`, trim query to 120 chars, query active products only, return at most 20 results and only `id,name,price`. Escape `%` and `_` before `ilike('name', `%${escaped}%`)`.

For `select_product`, load active product by id, verify line belongs to Admin-owned draft, then snapshot the current product `id/name/price` onto that line.

For `create_product`, normalize name (trim only; no rewriting), normalize price, create id with `productId(crypto.randomUUID())`, insert `{id,name,price,active:true}`, then snapshot it to the requested line. If the generated id collides, retry once with a new UUID before returning `product_create_failed`.

Map expected client errors (`draft_not_found`, `line_not_found`, `contact_not_found`, `conversation_mismatch`, `invalid_draft_line`, `invalid_price`, `product_not_found`) to 400/404/422 rather than 500.

- [ ] **Step 6: Run core + Edge contracts GREEN**

Run:

```bash
node tests/test_v21_order_draft_core.mjs
python tests/test_v21_order_draft_edge_contract.py
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/v21-order-draft tests/test_v21_order_draft_core.mjs tests/test_v21_order_draft_edge_contract.py
git commit -m "feat: add admin order draft api"
```

---

### Task 3: Build the focused two-region draft editor/list module

**Files:**
- Create: `admin-order-draft.js`
- Create: `tests/test_v21_order_draft_ui.py`

**Interfaces:**
- Expose `window.V21AdminOrderDraft = Object.freeze({ createFromParsed, openDraft, openList, close })`.
- `createFromParsed({contactId,conversationId,customerName,items})` invokes `create_from_lines`, then opens the returned draft.
- Module invokes only `v21-order-draft`; it must not invoke the AI parser, send Chat messages, or own parsing.

- [ ] **Step 1: Write the failing UI contract**

Create `tests/test_v21_order_draft_ui.py`:

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI = (ROOT / "admin-order-draft.js").read_text(encoding="utf-8").lower()
compact = "".join(UI.split())

assert "v21-order-draft" in UI
assert "create_from_lines" in UI
assert "search_products" in UI
assert "select_product" in UI
assert "create_product" in UI
assert "update_quantity" in UI
assert "data-draft-quantity" in UI
assert "data-draft-raw-name" in UI
assert "data-draft-product" in UI
assert "tên sản phẩm" in UI
assert "giá" in UI
assert "gửi đơn" in UI
assert "thêm mới" in UI
assert "đơn tạm" in UI
assert "lockbaseui:true" in compact
assert "queuetext" not in compact
assert "v21_message_send" not in compact
assert "v21-ai-product-parser" not in UI
# one quantity control owner only: no product-side quantity marker
assert "data-draft-product-quantity" not in UI
print("chat order draft UI contract PASS")
```

- [ ] **Step 2: Run UI contract and verify RED**

Run:

```bash
python tests/test_v21_order_draft_ui.py
```

Expected: FAIL because `admin-order-draft.js` does not exist.

- [ ] **Step 3: Implement authenticated Edge invocation helper**

Inside `admin-order-draft.js`, use the same session path as composer actions:

```js
async function invoke(action,payload={}){
  const client=window.V21AuthSessionStore?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const session=await client.auth.getSession();
  const accessToken=String(session?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const {data,error}=await client.functions.invoke('v21-order-draft',{
    body:{action,...payload},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(error||!data?.ok)throw new Error(String(data?.error||error?.message||'order_draft_failed'));
  return data;
}
```

- [ ] **Step 4: Implement modal interaction ownership and styles**

Use `globalOverlayRoot` plus `V21InteractionController.enter('ORDER_DRAFT_MODAL',{owner:'admin-order-draft',lockBaseUi:true})`. The module owns its overlay and restores focus on close.

Keep CSS focused. The row must have only two main regions:

```css
.admin-order-draft-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.admin-order-draft-left,.admin-order-draft-product{min-width:0;border:1px solid var(--theme-border-default,#ddd);border-radius:12px;padding:9px}
.admin-order-draft-left{display:grid;grid-template-columns:56px minmax(0,1fr);align-items:center;gap:8px}
.admin-order-draft-qty{width:100%;min-height:38px;text-align:center}
.admin-order-draft-raw{min-width:0;overflow-wrap:anywhere}
.admin-order-draft-search{grid-column:1/-1}
@media(max-width:520px){.admin-order-draft-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}}
```

Do not add source/code/status/note/confidence columns.

- [ ] **Step 5: Implement draft editor row rendering with one quantity owner**

Each row renders one input and one product button:

```html
<div class="admin-order-draft-row" data-draft-line="LINE_ID">
  <div class="admin-order-draft-left">
    <input data-draft-quantity class="admin-order-draft-qty" inputmode="decimal" />
    <span data-draft-raw-name class="admin-order-draft-raw"></span>
  </div>
  <button type="button" data-draft-product class="admin-order-draft-product"></button>
  <div data-draft-search class="admin-order-draft-search" hidden></div>
</div>
```

Render product button text as either `Tên · Giá` or `Chọn sản phẩm`. Format VND without `đ`; use Vietnamese thousands grouping through `Intl.NumberFormat('vi-VN',{maximumFractionDigits:0})`.

Quantity input `change` handler calls `update_quantity`; on success update in-memory draft, on failure restore prior quantity and show one compact status line.

- [ ] **Step 6: Implement inline product search and selection**

Tapping the right button toggles a search area directly under that row. Use a 180ms debounce. Each result is a button showing only `name · price`. Selecting calls `select_product`, updates that line from returned snapshot, collapses search, and does not change quantity.

Render `+ Thêm mới` below results. Do not auto-select by text similarity.

- [ ] **Step 7: Implement minimal add-product form**

The inline form has only `Tên` and `Giá` plus Save/Cancel. On Save call `create_product`; replace line snapshot with returned `line` and close the form. Preserve the exact entered name except trimming outer whitespace.

- [ ] **Step 8: Implement draft list and `Gửi đơn` behavior**

`openList()` calls `list`, shows newest-first rows with `customerName`, compact updated time, and `mapped/total`. Selecting a row calls `openDraft(id)`.

Editor footer button is exactly `Gửi đơn`. Its handler only calls `close()` because every edit has already persisted; it must not call any message-send API or status transition.

- [ ] **Step 9: Run UI contract GREEN**

Run:

```bash
node --check admin-order-draft.js
python tests/test_v21_order_draft_ui.py
```

Expected: syntax check + contract PASS.

- [ ] **Step 10: Commit**

```bash
git add admin-order-draft.js tests/test_v21_order_draft_ui.py
git commit -m "feat: add compact chat draft order editor"
```

---

### Task 4: Wire parsing directly into saved drafts and activate `Đơn tạm`

**Files:**
- Modify: `admin-composer-actions.js`
- Create: `tests/test_v21_order_draft_composer_integration.py`

**Interfaces:**
- `admin-composer-actions.js` keeps ownership of selecting source text and invoking `v21-order-scribe`.
- After parser success it calls `window.V21AdminOrderDraft.createFromParsed(...)` and closes the parser modal.
- `+ -> Đơn tạm` calls `window.V21AdminOrderDraft.openList()`.

- [ ] **Step 1: Write failing composer integration contract**

Create `tests/test_v21_order_draft_composer_integration.py`:

```python
from pathlib import Path

JS = (Path(__file__).resolve().parents[1] / "admin-composer-actions.js").read_text(encoding="utf-8").lower()
compact = "".join(JS.split())

assert "./admin-order-draft.js" in JS
assert "createfromparsed" in compact
assert "openlist" in compact
assert "activecontactname" in compact
assert "currentconversationid" in compact
assert "action:'draft'" in compact
assert "sắp có" not in JS.split("label:'đơn tạm'",1)[1].split("label:'đã giao'",1)[0]
assert "sao chép" not in JS
assert "navigator.clipboard" not in JS
print("chat draft order composer integration PASS")
```

- [ ] **Step 2: Run integration contract and verify RED**

Run:

```bash
python tests/test_v21_order_draft_composer_integration.py
```

Expected: FAIL because current flow still renders/copies parser output and `Đơn tạm` is disabled.

- [ ] **Step 3: Add active contact/conversation snapshot helpers**

Add:

```js
function activeContactName(){
  const shell=window.ChatAppShell?.ScreenSession?.snapshot?.()||{};
  const contact=shell.activeContact||{};
  if(String(contact.id||'')===activeContactId()&&contact.name)return String(contact.name);
  const row=window.V21ContactStore?.snapshot?.().find(item=>String(item?.id||'')===activeContactId());
  return String(row?.display_name||row?.username||contact.name||'Liên hệ');
}
function currentConversationId(){
  return String(window.V21MessageStore?.snapshot?.().currentConversationId||'').trim()||null;
}
```

- [ ] **Step 4: Add lazy draft module loader**

Add a module promise and loader:

```js
let draftModulePromise=null;
async function draftClient(){
  if(window.V21AdminOrderDraft)return window.V21AdminOrderDraft;
  if(!draftModulePromise)draftModulePromise=import('./admin-order-draft.js').then(()=>window.V21AdminOrderDraft||null);
  return draftModulePromise;
}
```

- [ ] **Step 5: Replace parser result/copy endpoint with create-and-open draft**

Remove `copyText`, `<pre data-order-result>`, `Sao chép`, and clipboard handling. Keep the two parser-mode buttons.

On parser success:

```js
const data=await invokeOrderScribe(mode,contactId,sourceText);
if(!Array.isArray(data.items)||!data.items.length)throw new Error('order_scribe_empty');
status.textContent='Đang mở đơn tạm…';
const draft=await draftClient();
if(!draft?.createFromParsed)throw new Error('order_draft_unavailable');
await draft.createFromParsed({
  contactId,
  conversationId:currentConversationId(),
  customerName:activeContactName(),
  items:data.items,
});
closeOrder({restoreFocus:false});
```

Important ordering: create/open the draft before dismissing the parser lock or hand off cleanly so background does not become clickable between modal transitions. If interaction ownership conflicts, close parser with `restoreFocus:false`, then immediately open the draft overlay in the same microtask.

- [ ] **Step 6: Activate `Đơn tạm` menu item**

Change menu construction so `Đơn tạm` is a real action, not an `order:true` disabled placeholder:

```js
actionButton({action:'draft',label:'Đơn tạm',kind:'order',order:false})
```

Keep `Đã giao` and `Công nợ` disabled `Sắp có`.

Extend `runAction`:

```js
if(action==='draft'){
  try{
    const draft=await draftClient();
    if(!draft?.openList)throw new Error('order_draft_unavailable');
    return await draft.openList();
  }catch{
    setTransientHint('Không thể mở đơn tạm');
    return false;
  }
}
```

`Đơn tạm` does not require a contact id to list drafts. Update `runAction`/`syncVisibility` so quote/call/create remain contact-required, while draft-list only requires Admin.

- [ ] **Step 7: Run integration + existing order/quote/call checks GREEN**

Run:

```bash
node --check admin-composer-actions.js
python tests/test_v21_order_draft_composer_integration.py
node tests/test_v21_order_scribe_core.mjs
python tests/test_v21_order_scribe_edge_contract.py
python tests/test_v21_quote_chat_ui.py
python -m pytest tests/test_v21_call_invite_admin_ui.py -q
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add admin-composer-actions.js tests/test_v21_order_draft_composer_integration.py
git commit -m "feat: open saved draft after order parsing"
```

---

### Task 5: Wire CI, deploy Supabase pieces, and perform production-safe verification

**Files:**
- Modify: `.github/workflows/verify-v21.yml`
- No canonical HTML change expected; only change it if `tools/verify_current.py` proves the external module chain requires regeneration.

**Interfaces:**
- Verify V21 runs all new draft contracts before existing quote/call/canonical checks.
- Production Supabase receives the migration and `v21-order-draft` Edge Function with `verify_jwt=true`.

- [ ] **Step 1: Add new Verify V21 steps**

Insert after the existing Manual order scribe Edge contract:

```yaml
      - name: Chat order draft database contract
        run: python tests/test_v21_order_draft_db_contract.py
      - name: Chat order draft core contract
        run: node tests/test_v21_order_draft_core.mjs
      - name: Chat order draft Edge contract
        run: python tests/test_v21_order_draft_edge_contract.py
      - name: Chat order draft UI contract
        run: python tests/test_v21_order_draft_ui.py
      - name: Chat order draft composer integration
        run: python tests/test_v21_order_draft_composer_integration.py
```

- [ ] **Step 2: Run the full verification suite locally/through the available runner**

Run the same commands as `.github/workflows/verify-v21.yml`, ending with:

```bash
python tools/verify_current.py
```

Expected: every existing and new step PASS. Do not merge while any existing quote/call/Zalo/canonical contract regresses.

- [ ] **Step 3: Commit CI wiring**

```bash
git add .github/workflows/verify-v21.yml
git commit -m "test: verify chat draft order flow"
```

- [ ] **Step 4: Apply production migration**

Apply `supabase/migrations/20260913_chat_order_drafts.sql` to project `gcnoahqsrquxkwkjbuxy` using the migration tool. Then verify with SQL:

```sql
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('chat_order_drafts','chat_order_draft_lines')
order by table_name;
```

Expected: exactly both new tables.

- [ ] **Step 5: Deploy `v21-order-draft`**

Deploy the exact branch files:
- `supabase/functions/v21-order-draft/index.ts`
- `supabase/functions/v21-order-draft/draft-core.mjs`

Use `verify_jwt=true`.

Verify Edge Function list reports `v21-order-draft` as `ACTIVE` and `verify_jwt=true`.

- [ ] **Step 6: Open a PR and verify PR-head CI**

Open a PR from `feature/chat-draft-order-mapping` to `main`. Confirm:
- Verify V21 success on exact PR head SHA.
- Admin Push TDD success.
- Zalo Bridge TDD success.

Do not merge on a stale earlier SHA.

- [ ] **Step 7: Merge and verify exact merge commit**

Merge only after all required checks are green. Then verify on the merge SHA:
- Verify V21 success.
- GitHub Pages build/deploy success.
- `v21-order-draft` remains ACTIVE with JWT verification.

- [ ] **Step 8: Functional production smoke with Admin**

Using an Admin session in the app:
1. Open a contact such as `E Quyên`.
2. `+ -> Tạo đơn -> Tách nhanh` on a structured message.
3. Confirm a new `Đơn tạm` opens immediately and header uses that contact name.
4. Confirm each left row shows one editable quantity plus raw customer name.
5. Confirm right side shows only product name + price or `Chọn sản phẩm`.
6. Search/select an existing product; close and reopen from `+ -> Đơn tạm`; confirm selection and price snapshot persist.
7. Change quantity; close/reopen; confirm the one shared quantity persists.
8. On an unmapped line, `+ Thêm mới`, enter only Name + Price, save, and confirm it maps immediately.
9. Press `Gửi đơn`; confirm editor closes but draft remains in `Đơn tạm` and no Chat/Zalo message is sent.

Expected: all nine observations match the spec before calling the feature complete.
