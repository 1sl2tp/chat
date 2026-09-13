# Chat Draft Order Mapping Design

Date: 2026-09-13
Repo: `1sl2tp/chat`
Scope: Admin manual `Tạo đơn` flow only

## Goal

Turn the existing `Tạo đơn -> Tách nhanh / AI ghi đơn` result into a persistent **Đơn tạm** for the contact currently open in Chat. The draft is intentionally simple: each line has one shared quantity, the customer's original product name, and one selected product from our own catalog with its selling price.

This feature does **not** normalize customer product names, does not auto-match with AI, does not mark an order delivered, and does not send a Chat message to the customer.

## Locked behavior

1. Admin opens a customer/contact in Chat and chooses `+ -> Tạo đơn`.
2. Existing `Tách nhanh` or `AI ghi đơn` produces lines. The current scribe rules stay unchanged: quantity may be interpreted; product text comes from the original customer text and is not rewritten.
3. Immediately after parsing, Chat creates a new draft tied to the active contact and conversation and stores a snapshot of the contact display name.
4. The draft opens immediately.
5. Every line has exactly one quantity value shared by the whole line.
6. Visual row is only two working regions:
   - Left: `SL + tên gốc`.
   - Right: selected `Tên sản phẩm của mình + Giá`.
7. Tapping the right region opens inline product search for that row. Search results show only product name and selling price.
8. Selecting a product stores the catalog product id, a name snapshot, and a price snapshot on that draft line.
9. If the product is missing, `+ Thêm mới` opens a minimal inline form with only `Tên` and `Giá`. Creating it adds an active row to the existing `public.products` catalog and immediately selects it for the current draft line.
10. Changing quantity changes the single quantity value for the line; there is no second quantity in the right region.
11. Every edit auto-saves. Closing and reopening the draft restores the same quantities and product selections.
12. `Đơn tạm` in the Admin `+` menu becomes active and lists saved drafts. A draft is identified primarily by customer/contact name; newest drafts appear first.
13. The bottom action `Gửi đơn` in this phase means **finish editing and keep/save the order as Đơn tạm**. It does not send a customer message and does not change the draft to `Đã giao`.

## UI

### Draft editor

Header:
- Customer/contact display name only as the primary title.
- Compact close/back action.

Rows:

```text
| SL + tên gốc                         | Tên sản phẩm của mình · Giá |
| 15  thùng bò                        | Bò húc thùng 24 lon · 245.000 |
| 1   thùng sim 5 lít                 | Simply 5L · 310.000 |
| 1   thùng Clo dic                   | Chưa chọn · + Thêm mới |
```

The layout remains two visual regions on mobile and desktop. Rows may grow vertically for long names; no extra columns are introduced. No source, code, status, note, confidence, AI explanation, or catalog metadata is shown in this editor.

Quantity control belongs to the left region and is the line's sole quantity owner. The right region never renders another quantity control.

### Inline product search

When the right region is tapped:
- Open a small inline search area directly under that row.
- Realtime local/server search by product name.
- Result item: `Tên · Giá` only.
- `+ Thêm mới` appears after/below results.

### Add product

Minimal fields:
- `Tên`
- `Giá`

On save, server generates a unique text id with prefix `CHAT-` plus a UUID-derived suffix, sets `active=true`, and relies on existing defaults for cost/group/label/note. No catalog normalization is performed in this flow.

### Draft list

`+ -> Đơn tạm` shows a compact newest-first list:
- customer/contact name
- short created/updated time
- progress `mapped/total` only when useful

Selecting a draft opens the same two-region editor.

## Data model

Create isolated Chat-owned tables rather than reuse `orders`, `getlink_sales_orders`, or AI order-session tables.

### `chat_order_drafts`

- `id uuid primary key default gen_random_uuid()`
- `contact_id uuid not null`
- `conversation_id uuid null`
- `customer_name text not null`
- `created_by_account_id uuid not null`
- `status text not null default 'draft'` with only `draft` in this phase
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Each `Tạo đơn` creates a new draft. Existing drafts are never overwritten implicitly.

### `chat_order_draft_lines`

- `id uuid primary key default gen_random_uuid()`
- `draft_id uuid not null references chat_order_drafts(id) on delete cascade`
- `line_no integer not null`
- `quantity numeric not null`
- `raw_name text not null`
- `product_id text null`
- `product_name text null`
- `unit_price numeric null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(draft_id, line_no)`

`quantity` is stored exactly once per line and is shared by both visual regions.

## Backend boundary

Add one Admin-only Edge Function, `v21-order-draft`, with JWT verification enabled. Browser code must not directly mutate the new draft tables or `public.products`.

Supported actions:
- `create_from_lines`: validate Admin, active contact/conversation, and parsed lines; create draft + lines atomically.
- `get`: load one draft owned/accessible to Admin.
- `list`: newest draft summaries.
- `update_quantity`: update one line quantity.
- `search_products`: search active `public.products` by name and return only id/name/price.
- `select_product`: snapshot product id/name/price into one line.
- `create_product`: create `public.products` row from name/price only, then select it into the line.

The function validates Admin role server-side using the existing Chat auth/account pattern. It must not invoke the AI product parser or catalog-name normalization logic.

## Frontend ownership

Keep `admin-composer-actions.js` as the entry owner for `Tạo đơn`, but move draft-editor behavior into a focused external module such as `admin-order-draft.js` so the already-large composer action adapter does not accumulate catalog and persistence responsibilities.

Flow:

```text
Tạo đơn
  -> Tách nhanh / AI ghi đơn
  -> create_from_lines(contact, conversation, customer name, lines)
  -> open draft editor
  -> auto-save quantity/product mapping
  -> Gửi đơn = close/finish editing while status remains draft
```

`Đơn tạm` menu action loads the draft list from the same module/function.

## Error behavior

- Parsing fails: keep current parser error; do not create an empty draft.
- Draft save fails: keep editor open and show one compact inline error; do not silently discard local choice.
- Product search fails: show a retry line inside the row search area.
- Product creation fails or name already conflicts: keep form open and allow the Admin to select the existing result or retry.
- Contact changes while editor is open: editor stays bound to its original draft/contact; no cross-contact reassignment.

## Security and isolation

- Admin-only Edge Function, `verify_jwt=true`.
- New tables have RLS enabled and no browser write policy; service-role function owns mutations after Admin verification.
- Product creation is allowed only through the Admin-verified draft function.
- Do not wire this flow into automatic incoming-message processing.
- Do not touch normal authenticated call, guest call, quote, Zalo bridge, or existing AI parser behavior.

## Tests

TDD contracts must cover:

1. Creating a draft from parsed lines preserves `quantity + raw_name` exactly.
2. One line has only one quantity owner; product selection cannot create a second quantity field.
3. Draft is tied to active contact/conversation and stores customer name.
4. Reopening restores quantity, selected product, and price snapshot.
5. Product search returns only active products and only id/name/price.
6. Add-new product creates a catalog product and immediately maps it to the current draft line.
7. Creating another order for the same contact creates a new draft instead of overwriting an older one.
8. `Gửi đơn` leaves status as `draft` and does not send a Chat message.
9. Non-Admin requests are rejected server-side.
10. Existing quote/call/order-scribe/canonical verification stays green.

## Out of scope

- Auto matching customer text to our product using AI.
- Customer-name normalization.
- Delivered/debt workflows.
- Inventory deduction.
- Sending order content back to customer.
- SHOP88 integration.
- Additional editor columns or metadata.