# Zalo & Chat Account Admin Design

Date: 2026-09-11
Branch: `feature/zalo-user-link-bridge-design`

## Context

The current Zalo bridge already supports two-way text messaging between an existing Chat User and one linked Zalo contact. The current mapping is canonical in Supabase through `zalo_user_links(chat_account_id, zalo_id, linked_by_account_id, linked_at, updated_at)`. The browser already has a per-profile Zalo picker, while `v21-zalo-admin` exposes per-user snapshot/link/unlink actions.

The planning spreadsheet adds the next admin requirements:

- manage Chat account ↔ Zalo contact mapping from one Settings page;
- support existing Chat users that do not yet have a Zalo mapping;
- support Zalo contacts that do not yet have a Chat account by creating a new Chat account and linking it immediately;
- prefer direct avatar links rather than downloading/re-uploading remote avatars;
- keep call/media work separate for later phases.

## Goal

Add an Admin-only Settings surface called **Zalo & tài khoản** that gives one clear view of:

- Chat users;
- Zalo contacts;
- current one-to-one mapping;
- connection state;
- actions to link, change, unlink, or create-and-link a Chat account.

Supabase remains the only source of truth for accounts, contacts, links, and bridge state. Render remains only the Zalo transport/runtime and is not involved in account administration.

## Non-goals

This phase does not implement:

- historical message sync;
- call events;
- image/file/voice transport;
- avatar file download/re-upload;
- storing readable/plaintext passwords;
- duplicating mapping state into Render or browser storage.

## Data ownership

### Chat account

Canonical table: `v21_accounts`.

Fields relevant to this phase:

- `id`
- `username`
- `display_name`
- `avatar_path`
- `role`
- `locked_at`
- `deleted_at`

### Zalo contact

Canonical table: `zalo_contacts`.

Fields relevant to this phase:

- `zalo_id`
- `display_name`
- `avatar_url`
- `last_seen_at`

### Mapping

Canonical table: `zalo_user_links`.

One Chat account may have at most one Zalo contact, and one Zalo contact may belong to at most one Chat account. No second mapping copy is created anywhere else.

### Passwords

Passwords are write-only inputs to Supabase Auth. They must never be stored in `zalo_user_links`, `v21_accounts`, any admin snapshot payload, browser state, logs, or Google Sheet sync.

## Admin UI

Add an Admin-only Settings section named **Zalo & tài khoản**.

The primary desktop view is a compact management table/list with these conceptual columns:

| Chat User | Zalo | Avatar | Status | Action |
| --- | --- | --- | --- | --- |
| buita | Cha Yêu | linked avatar | Đã kết nối | Đổi / Bỏ |
| equyen | — | Chat avatar | Chưa kết nối | Chọn Zalo |
| — | C Sâm | Zalo avatar | Chưa có Chat | Tạo tài khoản |

Mobile uses the same data model but renders each relationship as a compact stacked card rather than forcing a wide table.

### Status values

Only user-facing states are shown:

- `Đã kết nối`
- `Chưa kết nối`
- `Zalo đã được gán`
- `Chưa có tài khoản Chat`

Internal delivery/session states are not exposed here.

### Existing Chat user flow

For an unlinked Chat user:

1. Admin opens `Chọn Zalo`.
2. Picker searches `zalo_contacts` by display name.
3. A contact already linked to another Chat account is disabled and marked `Zalo đã được gán`.
4. Choosing an available contact calls the existing link operation.
5. The page refreshes from the canonical server snapshot.

For a linked Chat user:

- `Đổi` opens the same picker;
- choosing another available contact atomically replaces the mapping;
- `Bỏ` removes only the mapping and leaves Chat account/message history untouched.

### Zalo-only contact flow

For a Zalo contact that has no Chat account mapping:

1. Admin chooses `Tạo tài khoản`.
2. Form opens with:
   - `Tên đăng nhập` required;
   - `Tên hiển thị` prefilled from the Zalo contact name and editable;
   - `Mật khẩu` required;
   - avatar preview from the Zalo URL when available.
3. Submit performs one server-side create-and-link operation.
4. On success, the new Chat account appears immediately as `Đã kết nối`.

If account creation succeeds but mapping fails, the server must not leave a half-created orphan account. The operation must compensate/rollback or otherwise guarantee atomic business behavior from the Admin's point of view.

## Avatar policy

This phase follows the spreadsheet note to prefer links.

When Admin creates a Chat account from a Zalo contact, or explicitly applies Zalo avatar to an existing linked account:

- `v21_accounts.avatar_path` may store the external `zalo_contacts.avatar_url` directly;
- the app renders the remote URL directly;
- no image download/upload is performed in this phase.

Linking itself does not silently overwrite an existing Chat avatar. For existing accounts, avatar adoption must be an explicit Admin action/toggle so linking does not unexpectedly change profile identity.

For newly created Chat accounts from a Zalo contact, using the Zalo avatar URL as the initial avatar is allowed by default because no previous Chat avatar exists.

## Backend API

Extend `v21-zalo-admin` rather than creating a parallel admin backend.

### `action: admin_snapshot`

Returns one normalized Admin snapshot containing:

- active Chat users (`role='user'`, not deleted);
- Zalo contacts;
- current links;
- enough derived state for the UI to render linked/unlinked/unavailable rows.

The client should not reconstruct mapping truth independently from several unrelated queries.

### Existing actions

Keep:

- `snapshot` for the existing per-profile picker;
- `link`;
- `unlink`.

Both the profile picker and the new Settings page call the same canonical link/unlink logic.

### `action: create_and_link`

Inputs:

- `zalo_id`
- `username`
- `display_name`
- `password`
- optional `use_zalo_avatar`, default true for new accounts

Server responsibilities:

1. Authenticate caller and require active Admin account.
2. Validate Zalo contact exists and is not already linked.
3. Validate username/display name/password using the same account rules as existing account administration.
4. Create Supabase Auth user server-side using service-role credentials.
5. Create corresponding `v21_accounts` User row using existing Chat account conventions.
6. If requested and available, set `avatar_path` to the Zalo avatar URL.
7. Insert `zalo_user_links` using the current Admin as `linked_by_account_id`.
8. Return the created account plus link summary.

No service-role secret reaches the browser.

## Reuse of account creation logic

The repository already has `v21-account-admin` for Admin account mutation, but it currently edits existing users rather than creating them. Creation rules must not be copied into unrelated browser code.

Implementation should either:

- factor shared account validation/create helpers used by the Admin edge functions; or
- keep creation inside `v21-zalo-admin` while matching existing account schema/Auth conventions exactly.

Prefer the smallest change that avoids duplicate business rules.

## Data flow

### Link existing user

`Settings UI → v21-zalo-admin(link) → Supabase RPC/table transaction → canonical snapshot → UI refresh`

### Create from Zalo

`Settings UI → v21-zalo-admin(create_and_link) → Supabase Auth + v21_accounts + zalo_user_links → canonical snapshot → UI refresh`

### Messaging after link

Messaging continues through the existing bridge without modification:

- Zalo inbound: Render → `v21-zalo-bridge` → mapping lookup → Chat message.
- Chat Admin outbound: message insert → outbound row/signal → Render → Zalo.

The Settings feature does not introduce a second message path.

## Error behavior

UI messages must distinguish these cases:

- username invalid;
- username already used;
- password invalid;
- Zalo contact missing;
- Zalo contact already linked elsewhere;
- target Chat user missing;
- Admin authorization failure;
- generic create/link failure.

Buttons are disabled while a mutation is in flight. After success, UI always refreshes from server state rather than assuming the local mutation succeeded exactly as requested.

## Security

- Only authenticated active Admin accounts can read the full admin snapshot or mutate mappings/accounts.
- Browser uses the normal user JWT to invoke the Edge Function.
- Service-role access remains only inside Supabase Edge Functions.
- Password value is never returned in a response or written to logs/database application tables.
- Mapping tables retain RLS and restricted direct access.
- A Zalo contact cannot be linked to two Chat accounts.

## Compatibility

The existing per-profile Zalo picker remains available for quick edits and continues to call the same backend mapping actions.

Existing Chat accounts, conversations, messages, Zalo contacts, and active mappings remain unchanged. The current `Cha yêu` mapping is not migrated or recreated.

## Testing

Add/extend tests for:

- Admin snapshot contains Chat users, Zalo contacts, and mapping state;
- non-Admin cannot read or mutate the admin surface;
- existing link/unlink behavior remains unchanged;
- `create_and_link` creates exactly one Chat account and one mapping;
- duplicate username is rejected without creating a link;
- already-linked Zalo contact is rejected without creating an account;
- failed mapping does not leave an orphan Chat account;
- password never appears in returned snapshot/account payload;
- new account may receive direct Zalo avatar URL;
- existing account avatar is not silently overwritten by link;
- desktop and mobile Settings UI contract renders the four user-facing states;
- existing `Verify V21` and `Zalo Bridge TDD` remain green.

## Delivery order

1. Backend snapshot contract and tests.
2. Server-side `create_and_link` contract and tests.
3. Admin Settings UI using those APIs.
4. Explicit avatar-use behavior.
5. Regression verification of existing profile picker and two-way text bridge.
6. Only after this phase is stable: design media/file/voice and call-event phases separately.
