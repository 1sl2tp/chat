# Chat Quote Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Admin-generated public quotation snapshot links that can be sent as ordinary Chat text and opened reliably inside Zalo WebView without login.

**Architecture:** Store immutable selling-price snapshots in `chat_quote_snapshots`; create/read them through a dedicated `v21-quote` Edge Function; render a tiny standalone `/b/` page; add an Admin-only quotation action in the existing Chat action flow that reuses canonical text sending. The quotation path never calls Zalo directly and never reads live price data after snapshot creation.

**Tech Stack:** Supabase Postgres/RLS, Supabase Edge Functions (Deno/TypeScript), vanilla HTML/CSS/JS, existing TAPHOA Chat runtime, Node/Python contract tests, GitHub Actions Verify V21.

**Spec:** `docs/superpowers/specs/2026-09-13-chat-quote-links-design.md`

## Global Constraints

- Public URL: `https://chat.taphoa.xyz/b/?k=<token>`.
- Snapshot price data is immutable after creation.
- Eligible product rows: `is_active = true`, `deleted_at is null`, `display_price_vnd > 0`.
- Source-scoped quote requires an existing source in `getlink_supplier_sources`.
- Creation is Admin-only; public read is token-only and login-free.
- Public response must never expose purchase price, margin, profit, supplier history, account data, internal URLs, or service credentials.
- Public page must not require cookies, localStorage, redirects, popups, Tailwind/CDN, or third-party JavaScript.
- `Gửi` must reuse the existing canonical Chat text-send path; quotation code must not call Zalo directly.
- No automatic PDF/image generation, expiry, analytics, customer login, order submission, or quote editing in v1.
- Do not change Chat/Call/Auth business logic outside the new quotation action.
- `main` remains untouched until full Verify V21 is green.

---

### Task 1: Snapshot database contract

**Files:**
- Create: `supabase/migrations/20260913_chat_quote_snapshots.sql`
- Create: `tests/test_v21_quote_db_contract.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- Produces table `public.chat_quote_snapshots` with columns `id`, `token`, `scope`, `source_key`, `source_name`, `item_count`, `payload`, `created_by`, `created_at`, `revoked_at`.
- Public/anon gets no direct table read policy; Edge Function service role is the read/write owner.

- [ ] **Step 1: Write the failing DB contract test**

```python
from pathlib import Path

sql = Path('supabase/migrations/20260913_chat_quote_snapshots.sql').read_text() if Path('supabase/migrations/20260913_chat_quote_snapshots.sql').exists() else ''
assert 'create table if not exists public.chat_quote_snapshots' in sql.lower()
assert 'token text not null unique' in sql.lower()
assert "scope in ('all','source')" in sql.lower()
assert 'payload jsonb not null' in sql.lower()
assert 'enable row level security' in sql.lower()
assert 'create policy' not in sql.lower() or 'anon' not in sql.lower()
```

- [ ] **Step 2: Run the test and verify RED**

Run: `python tests/test_v21_quote_db_contract.py`
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

```sql
create table if not exists public.chat_quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  scope text not null check (scope in ('all','source')),
  source_key text,
  source_name text,
  item_count integer not null check (item_count >= 0),
  payload jsonb not null,
  created_by uuid not null references public.v21_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists chat_quote_snapshots_token_active_idx
  on public.chat_quote_snapshots(token)
  where revoked_at is null;

alter table public.chat_quote_snapshots enable row level security;
revoke all on table public.chat_quote_snapshots from anon, authenticated;
```

- [ ] **Step 4: Add the DB test to Verify V21 and run GREEN**

Add to `.github/workflows/verify-v21.yml`:

```yaml
      - name: Chat quote database contract
        run: python tests/test_v21_quote_db_contract.py
```

Run: `python tests/test_v21_quote_db_contract.py`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260913_chat_quote_snapshots.sql tests/test_v21_quote_db_contract.py .github/workflows/verify-v21.yml
git commit -m "feat: add quotation snapshot storage"
```

---

### Task 2: Quotation snapshot core and Edge Function

**Files:**
- Create: `supabase/functions/v21-quote/quote-core.mjs`
- Create: `supabase/functions/v21-quote/index.ts`
- Create: `tests/test_v21_quote_core.mjs`
- Create: `tests/test_v21_quote_edge_contract.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `buildQuoteItems(rows)` returns only public fields and omits rows without `display_price_vnd > 0`.
- `makePublicPayload(snapshot)` returns `{ok, scope, source_key, source_name, item_count, created_at, items}` only.
- `POST /v21-quote` consumes `{scope:'all'}` or `{scope:'source',source_key:string}` and returns `{ok:true,token,url,item_count,source_name}`.
- `GET /v21-quote?k=<token>` returns sanitized snapshot JSON with `Cache-Control: public, max-age=60` and permissive GET CORS.

- [ ] **Step 1: Write failing pure-core tests**

```js
import assert from 'node:assert/strict';
import {buildQuoteItems} from '../supabase/functions/v21-quote/quote-core.mjs';

const items=buildQuoteItems([
  {product_code:'A',product_name:'A',source_key:'sua',display_price_vnd:100000,input_price_vnd:90000,actual_profit_vnd:10000},
  {product_code:'B',product_name:'B',source_key:'sua',display_price_vnd:null},
]);
assert.deepEqual(items,[{
  product_code:'A',product_name:'A',source_key:'sua',display_price_vnd:100000,
  carton_price_vnd:null,retail_price_vnd:null,primary_packaging:null,
  retail_packaging:null,units_per_carton:null,retail_unit:null,
}]);
assert.equal('input_price_vnd' in items[0],false);
assert.equal('actual_profit_vnd' in items[0],false);
```

- [ ] **Step 2: Run pure-core test and verify RED**

Run: `node tests/test_v21_quote_core.mjs`
Expected: FAIL because `quote-core.mjs` does not exist.

- [ ] **Step 3: Implement the pure snapshot sanitizer**

```js
const publicFields=[
  'product_code','product_name','source_key','display_price_vnd','carton_price_vnd',
  'retail_price_vnd','primary_packaging','retail_packaging','units_per_carton','retail_unit'
];
export function buildQuoteItems(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .filter(row=>Number(row?.display_price_vnd)>0)
    .map(row=>Object.fromEntries(publicFields.map(key=>[key,row?.[key]??null])));
}
```

- [ ] **Step 4: Write failing Edge source contract**

The Python test asserts `index.ts` contains all of these behaviors: Bearer token extraction; `db.auth.getUser(accessToken)`; active Admin lookup in `v21_accounts`; source validation in `getlink_supplier_sources`; product query against `getlink_supplier_products` with `is_active=true`, `deleted_at is null`, and `display_price_vnd > 0`; insert into `chat_quote_snapshots`; cryptographic token creation; exact token lookup on GET; revoked filter; `Cache-Control: public, max-age=60`; CORS headers; and no selected internal price/profit columns.

- [ ] **Step 5: Run Edge contract and verify RED**

Run: `python tests/test_v21_quote_edge_contract.py`
Expected: FAIL because the Edge Function does not exist.

- [ ] **Step 6: Implement `v21-quote/index.ts`**

Use the existing service-role client pattern and these exact request branches:

```ts
if(req.method==='POST') return createQuote(req);
if(req.method==='GET') return readQuote(req);
if(req.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders});
return new Response('method not allowed',{status:405,headers:corsHeaders});
```

Creation must call `db.auth.getUser(accessToken)`, require the matching `v21_accounts` row with `role='admin'`, `deleted_at is null`, `locked_at is null`, validate optional source, read only public selling columns, call `buildQuoteItems`, generate 16 random bytes with `crypto.getRandomValues`, base64url encode them, insert the snapshot, and return URL `https://chat.taphoa.xyz/b/?k=${token}`.

Public GET must query `.eq('token',token).is('revoked_at',null).maybeSingle()` and return only the stored public payload plus snapshot metadata.

- [ ] **Step 7: Run targeted tests GREEN**

Run:

```bash
node tests/test_v21_quote_core.mjs
python tests/test_v21_quote_edge_contract.py
```

Expected: both PASS.

- [ ] **Step 8: Add both tests to Verify V21 and commit**

```yaml
      - name: Chat quote core contract
        run: node tests/test_v21_quote_core.mjs
      - name: Chat quote edge contract
        run: python tests/test_v21_quote_edge_contract.py
```

Commit:

```bash
git add supabase/functions/v21-quote tests/test_v21_quote_core.mjs tests/test_v21_quote_edge_contract.py .github/workflows/verify-v21.yml
git commit -m "feat: add quotation snapshot API"
```

---

### Task 3: Public Zalo-safe quotation page

**Files:**
- Create: `b/index.html`
- Create: `tests/test_v21_quote_public_page.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- Reads token from `new URLSearchParams(location.search).get('k')`.
- Fetches exactly one public endpoint: `${SUPABASE_FUNCTION_BASE}/v21-quote?k=${encodeURIComponent(token)}`.
- Client-side search filters already-loaded snapshot items only.

- [ ] **Step 1: Write failing public-page contract**

The Python test requires: mobile viewport; title/OG `Báo giá TAPHOA`; no `cdn`, `tailwind`, third-party `<script src=...>`, auth redirect, localStorage, cookies, popup, or login dependency; token `k` parsing; one `v21-quote` fetch; visible failure copy `Trong Zalo: chọn ⋯ → Mở bằng trình duyệt`; `Sao chép liên kết`; local search input; mobile card layout and desktop table media query.

- [ ] **Step 2: Run and verify RED**

Run: `python tests/test_v21_quote_public_page.py`
Expected: FAIL because `b/index.html` does not exist.

- [ ] **Step 3: Implement standalone page**

Use inline CSS/JS only. Render mobile rows as `.quote-card` and desktop rows as `.quote-table-row`; switch at `@media (min-width:760px)`. Group all-scope items by `source_key`; show source heading from response metadata/map. Price uses `Intl.NumberFormat('vi-VN').format(Number(value))` with no currency suffix unless the design copy explicitly adds one later.

Error state must preserve the current URL for the copy button and never redirect.

- [ ] **Step 4: Run GREEN and add to Verify V21**

Run: `python tests/test_v21_quote_public_page.py`
Expected: PASS.

Add:

```yaml
      - name: Chat quote public page contract
        run: python tests/test_v21_quote_public_page.py
```

- [ ] **Step 5: Commit**

```bash
git add b/index.html tests/test_v21_quote_public_page.py .github/workflows/verify-v21.yml
git commit -m "feat: add lightweight public quotation page"
```

---

### Task 4: Admin quotation UI and canonical Chat send reuse

**Files:**
- Create: `quote-client.js`
- Modify: `index.html`
- Modify: `app.js`
- Create: `tests/test_v21_quote_chat_ui.py`
- Modify: `.github/workflows/verify-v21.yml`

**Interfaces:**
- `window.V21QuoteClient.create({scope,sourceKey,accessToken}) -> Promise<{url,item_count,source_name}>`.
- `openQuotePicker()` shows `Tất cả` and current sources.
- `sendQuoteLink(url)` routes the URL through the existing canonical Chat text send path; it must not call any `v21-zalo-*` function or Zalo API.

- [ ] **Step 1: Write failing Chat UI contract**

The Python contract requires: Admin-only `Báo giá` action; choices `Tất cả` and `Theo nguồn`; source keys `hang-thuong`, `hang-u`, `masan`, `sua`, `thuoc-la`; create call to `v21-quote`; `Sao chép`; `Gửi`; and explicit absence of direct Zalo fetch/invoke from quotation code.

It also requires `sendQuoteLink` to call the same extracted canonical text-send helper used by normal Composer text sending.

- [ ] **Step 2: Run and verify RED**

Run: `python tests/test_v21_quote_chat_ui.py`
Expected: FAIL because quotation UI/client does not exist.

- [ ] **Step 3: Extract a reusable canonical text-send helper from `sendNow()`**

Keep Composer behavior unchanged. The helper accepts text and optional reply metadata but uses the same `window.V21MessageStore`/existing persistence path that `sendNow()` already uses. `sendNow()` becomes a thin caller for ordinary Composer text; `sendQuoteLink(url)` calls the same helper directly so it does not overwrite the user's current draft.

Required shape:

```js
function sendCanonicalText(text,{replyPayload=null}={}){
  const body=String(text||'').trim();
  if(!body)return false;
  // existing normal text commit path moved here unchanged
}

function sendQuoteLink(url){
  return sendCanonicalText(String(url||'').trim());
}
```

- [ ] **Step 4: Add `quote-client.js`**

Use the current Supabase session access token already owned by Chat auth runtime and call the Edge Function with:

```js
fetch(`${functionsBase}/v21-quote`,{
  method:'POST',
  headers:{'content-type':'application/json','authorization':`Bearer ${accessToken}`},
  body:JSON.stringify(scope==='all'?{scope:'all'}:{scope:'source',source_key:sourceKey})
})
```

Return only the response fields needed by UI.

- [ ] **Step 5: Add the compact quotation picker/result UI**

Add `Báo giá` under the existing Admin `…` action surface. Do not navigate away. The first panel contains `Tất cả` and `Theo nguồn`; source choice appears only after `Theo nguồn`. After creation show the generated URL plus `Gửi` and `Sao chép`. Closing the panel leaves Composer draft and conversation unchanged.

- [ ] **Step 6: Run GREEN and add to Verify V21**

Run: `python tests/test_v21_quote_chat_ui.py`
Expected: PASS.

Add:

```yaml
      - name: Chat quote Admin UI contract
        run: python tests/test_v21_quote_chat_ui.py
```

- [ ] **Step 7: Commit**

```bash
git add quote-client.js index.html app.js tests/test_v21_quote_chat_ui.py .github/workflows/verify-v21.yml
git commit -m "feat: add quotation link action to Chat"
```

---

### Task 5: Apply migration and deploy Edge Function on Supabase

**Files:**
- Runtime apply: `supabase/migrations/20260913_chat_quote_snapshots.sql`
- Runtime deploy: `supabase/functions/v21-quote/index.ts`, `quote-core.mjs`

**Interfaces:**
- Production project: `gcnoahqsrquxkwkjbuxy`.
- Edge Function: `v21-quote`, `verify_jwt=false` because GET is public and POST performs custom Bearer/Admin verification.

- [ ] **Step 1: Run full Verify V21 before runtime mutation**

Run all commands from `.github/workflows/verify-v21.yml` or wait for the PR workflow for the current branch head.
Expected: every step PASS.

- [ ] **Step 2: Apply the database migration**

Use Supabase migration tooling with migration name `chat_quote_snapshots` and the exact checked-in SQL. Verify table columns and RLS after apply.

- [ ] **Step 3: Deploy `v21-quote`**

Upload both `index.ts` and `quote-core.mjs`; set `verify_jwt=false` only because the function implements public GET plus manual POST authentication.

- [ ] **Step 4: Smoke-check public and protected behavior**

Confirm: GET without token fails cleanly; POST without Bearer fails; an authenticated Admin can create one `source='sua'` snapshot; its returned public GET contains only allowed fields and a fixed `item_count`; old snapshot payload does not change when live supplier data is queried separately.

- [ ] **Step 5: Commit no runtime-only files**

No secret/config values are committed. Record only code/migration changes already versioned.

---

### Task 6: Final verification and handoff

**Files:**
- No new production files unless verification reveals a scoped regression.

**Interfaces:**
- Branch stays `feature/chat-ai-product-parser`.
- `main` remains unchanged until explicit user approval after green verification.

- [ ] **Step 1: Run full Verify V21 on final branch head**

Expected: all existing Chat/Call/Auth/parser tests plus all new quotation tests PASS.

- [ ] **Step 2: Check PR #45 head/status**

Confirm the PR points at the final branch head and no unrelated files changed.

- [ ] **Step 3: Verify public page static contract on the deployed domain**

Open `/b/?k=<fresh test token>` and verify: no login/redirect; mobile one-column; desktop compact table; local search; correct source grouping; Zalo fallback copy visible on error path.

- [ ] **Step 4: Verify Chat send path**

Create a quote from Admin, press `Gửi`, and confirm exactly one ordinary text message containing the URL is created in the current conversation so the existing Zalo bridge can forward it; no direct quotation-to-Zalo request exists.

- [ ] **Step 5: Report checkpoint**

Report final commit SHA, Verify V21 result, migration status, deployed Edge Function version, and the exact test URL shape. Do not merge `main` unless the user explicitly requests it.
