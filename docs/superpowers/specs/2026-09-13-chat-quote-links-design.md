# Chat Quote Links — Design

Date: 2026-09-13
Status: Design approved in chat; implementation pending written-spec review
Branch: `feature/chat-ai-product-parser`
Base head when specified: `36c3909377f913ddf58c680bde0110d852c0b114`

## 1. Goal

Create a lightweight public quotation link that Admin can generate from TAPHOA Chat and send as a normal text message. The existing Chat → Zalo bridge can then forward only that one link, avoiding image/PDF payloads.

The customer must be able to open the quotation inside Zalo's in-app browser without logging in. The public viewer is therefore static, very small, HTTPS-only, and does not depend on cookies, localStorage, redirects, popups, or third-party JavaScript.

Primary public URL shape:

`https://chat.taphoa.xyz/b/?k=<token>`

The quote is a snapshot: later price changes do not alter a link already sent to a customer.

## 2. Admin flow

Add `Báo giá` under the existing `…` action area used by Admin.

Flow:

`… → Báo giá → Tất cả / Theo nguồn → Tạo link`

For `Theo nguồn`, show the current supplier groups already present in data:

- Hàng thường
- Hàng U
- Hàng masan
- Sữa
- Thuốc lá

After creation show only the actions needed for this workflow:

- `Gửi`: put/send the generated URL through the existing Chat text-message pipeline so the existing Zalo bridge forwards it exactly like any other text.
- `Sao chép`: copy the URL.

No image or PDF is generated automatically. PDF remains out of scope for this first version.

## 3. Source of truth for quotation data

Read current selling data from `getlink_supplier_products`.

Eligible rows:

- `is_active = true`
- `deleted_at is null`
- `display_price_vnd > 0`
- if scope is `source`, `source_key` must equal the chosen source

The snapshot copies values at creation time. It never reads live prices when a customer opens an old quotation.

Each snapshot item stores at least:

- `product_code`
- `product_name`
- `source_key`
- `display_price_vnd`
- `carton_price_vnd`
- `retail_price_vnd`
- `primary_packaging`
- `retail_packaging`
- `units_per_carton`
- `retail_unit`

`display_price_vnd` is the primary price shown. Packaging and retail price are secondary information only when present.

Products without a usable display price are omitted rather than displayed as a misleading blank/zero quote.

## 4. Snapshot storage

Add one table owned by Chat:

### `chat_quote_snapshots`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `token text unique not null`
- `scope text not null check (scope in ('all','source'))`
- `source_key text null`
- `source_name text null`
- `item_count integer not null`
- `payload jsonb not null`
- `created_by uuid not null`
- `created_at timestamptz not null default now()`
- `revoked_at timestamptz null`

No automatic expiry in v1. A sent quotation stays stable until explicitly revoked in a later feature.

The public token is a random base64url capability token with at least 96 bits of entropy. The token itself grants read access to that snapshot, so it must be unguessable.

The table is not directly readable from the public browser through Supabase RLS. Public reads go through the quotation Edge Function only.

## 5. Edge Function

Add `v21-quote` with `verify_jwt = false` because it serves both authenticated creation and public token reads. Authentication is enforced manually for creation.

### 5.1 Create

`POST /v21-quote`

Body:

- `{scope:'all'}`
- or `{scope:'source', source_key:'sua'}`

Rules:

1. Require `Authorization: Bearer <Supabase access token>`.
2. Resolve the authenticated user.
3. Require an active `v21_accounts` Admin account.
4. Validate source against `getlink_supplier_sources` for source-scoped requests.
5. Load eligible `getlink_supplier_products`.
6. Build the immutable snapshot payload.
7. Generate a random token and insert one snapshot row.
8. Return `{ok:true, token, url, item_count, source_name}`.

The returned URL uses `https://chat.taphoa.xyz/b/?k=<token>`.

### 5.2 Public read

`GET /v21-quote?k=<token>`

Rules:

- no login required
- exact token lookup only
- reject missing, unknown, or revoked tokens
- return only public quotation fields; never expose purchase price, margin, internal profit, supplier history, account data, or service credentials
- cache response briefly (`public, max-age=60`) because snapshot data is immutable
- send CORS headers allowing the static quote page to fetch it

## 6. Public page `/b/`

Add a standalone static page under `b/index.html`.

Constraints for Zalo WebView reliability:

- no login
- no redirect
- no cookie/localStorage requirement
- no popup
- no Tailwind/CDN or other third-party scripts
- one small same-page JavaScript bundle only
- one fetch to the quotation Edge Function
- generic Open Graph metadata: `Báo giá TAPHOA`

### Mobile

One column, designed first for Zalo WebView:

- header: `Báo giá TAPHOA`
- subline: source name or `Tất cả` + creation time
- local search box
- source section headings when viewing `Tất cả`
- each product row: name on the left, primary price right-aligned, compact packaging below when available
- retail price appears as secondary text only when it exists and differs from the primary price

### Desktop

Use the same data but a wider compact table. Do not simply stretch the mobile cards.

### Failure state

If the public API cannot load, show a short message and the instruction:

`Trong Zalo: chọn ⋯ → Mở bằng trình duyệt`

Also provide `Sao chép liên kết` so the customer still has a fallback without another generated asset.

## 7. UI integration rules

Quotation creation is Admin-only.

Do not change Chat/Call/Auth business logic outside the new quotation action. Do not add a second message transport. `Gửi` must reuse the existing canonical text-message send path so the existing Zalo bridge remains the only Zalo transport.

Creating a quotation must not mutate supplier prices or product rows.

Creating/sending a link should not navigate away from the conversation.

## 8. Security

- Creation requires authenticated active Admin.
- Public token uses high entropy and exact lookup.
- Public response contains selling information only.
- No purchase price (`input_price_vnd`), margins, profit fields, internal URLs, or account identifiers are exposed.
- Service role key stays inside Edge Function only.
- Snapshot table has no anonymous direct select policy.

## 9. Tests / verification

Implementation follows TDD.

Required coverage:

1. Database contract: snapshot table shape and no anonymous direct-read policy.
2. Edge create contract: non-admin rejected; source validation; all/source filters; rows without display price omitted; immutable payload created.
3. Public read contract: valid token returns sanitized data; missing/revoked token rejected; internal price/profit fields absent.
4. Public page contract: no auth redirect, no CDN/third-party script, handles token/load/error states, mobile viewport present.
5. Chat UI contract: `Báo giá` action exists for Admin; supports `Tất cả` and `Theo nguồn`; send action reuses existing text send path rather than a new Zalo call.
6. Full `Verify V21` must be green before deployment/merge.

## 10. Out of scope for v1

- PDF/image generation
- customer login
- editable quote after creation
- automatic expiration
- quotation analytics/view tracking
- customer order submission from the quote page
- direct Zalo API sending from quotation code

Those can be added later without changing the public snapshot contract.
