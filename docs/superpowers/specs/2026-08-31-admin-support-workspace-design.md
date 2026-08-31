# Admin Support Workspace Design

## Release target

`CHAT-ADMIN-0.9.0`

## Scope

This release adds the first Admin product surface while preserving the existing narrow product model:

- User 1 = guest/anonymous customer.
- User 2 = the same customer profile after adding information or upgrading.
- Both interact only with Admin.
- No user discovery, friends, contacts, groups, or user-to-user messaging.

The Admin surface is a separate route/mode from the customer surface. It must reuse existing auth/session/chat/message owners and must not introduce a second conversation/message state machine.

## Goals

1. Admin can see a list of support conversations/customers.
2. Admin can open one customer and chat in the existing support conversation.
3. Admin can distinguish guest vs updated customer.
4. Admin can see customer-provided name/address when available.
5. Admin can inspect relevant device/runtime metadata for support purposes.
6. Customer upgrade from User 1 to User 2 keeps the same profile and same support conversation.

## Non-goals

- P2P messaging.
- Friend requests or contacts.
- Groups.
- Media attachments.
- Push backend wiring.
- Voice/video/WebRTC/TURN.
- Full account-management flow.
- Full admin permissions/intervention suite.
- CRM/order/payment/business features.

## Data ownership

### Customer profile

`chat_profiles` remains the canonical customer profile owner.

Existing fields remain authoritative for identity/profile state:
- `id`
- `auth_user_id`
- `identity_type`
- `display_name`
- `username`
- `avatar_url`
- `user_level`
- `is_admin`
- timestamps

This release adds:
- `address text null`

`address` means an address explicitly supplied by the customer. It must not be inferred from IP, device diagnostics, geolocation, or network metadata.

### Device metadata

`chat_devices` remains the canonical device owner.

Admin-visible support metadata may include:
- device label (`Web` / `PWA` or equivalent current value),
- platform,
- first seen,
- last seen,
- revoked state,
- local app version/build only where the backend has a trustworthy stored value.

Do not move device/runtime fields into `chat_profiles`.

The current database does not yet persist app version/build in `chat_devices`. `CHAT-ADMIN-0.9.0` must not fabricate those values. If version/build persistence is not added in this release, the Admin UI shows only metadata actually stored by the backend and leaves version/build unavailable.

### Chat/conversation/messages

Existing owners remain authoritative:
- `chat_conversations`
- `chat_conversation_members`
- `chat_messages`
- existing `chat/` runtime/store in frontend

Admin must use the same message loading/sending/realtime contracts as the customer UI. No duplicate Admin-only message store.

## Security boundary

All Admin-only backend reads must enforce Admin authorization on the server/database side.

Frontend routing or hiding `/admin` is not authorization.

Admin RPCs must validate the current authenticated profile and require `is_admin = true` before returning cross-customer support data.

Anonymous/authenticated customers must never be able to call an Admin inbox/customer-details RPC successfully merely by knowing its name.

No service-role key or server-only secret is exposed to the browser.

## Backend contracts

### Profile update

Add/extend a profile update RPC that updates customer-owned profile information without creating a second profile.

Required inputs for this release:
- display name (nullable/optional according to current profile rules),
- address (nullable).

The operation must update the current authenticated customer's existing `chat_profiles` row.

It must not create a new conversation or copy messages.

### Admin support inbox RPC

Add an Admin-only RPC, suggested name:

`chat_admin_support_inbox(p_limit integer default 100)`

Each row/object should provide enough data for the inbox without requiring N+1 queries:
- `conversation_id`
- customer `profile_id`
- customer display name
- customer identity type / guest-vs-updated status
- customer address
- customer last seen
- conversation last message timestamp
- last message text/type where safe and useful
- unread indicator/count for the Admin member if derivable from existing membership/read state

The RPC must return only support/direct conversations relevant to the Admin support model, not unrelated future conversation types.

### Admin support detail RPC

Add an Admin-only RPC, suggested name:

`chat_admin_support_detail(p_conversation_id uuid)`

It should return:
- selected conversation identity,
- customer profile fields needed by Admin,
- device records for that customer,
- current support/member state.

It does not return the whole message history; messages continue through the existing message backend/runtime so realtime/dedupe behavior stays shared.

## Guest → updated customer transition

User 1 and User 2 are states of one profile.

Transition remains:

`anonymous auth → temporary chat profile → same profile gains display_name/address/account identity`

Requirements:
- same `chat_profiles.id`,
- same support conversation,
- same message history,
- same device associations,
- no duplicate customer row merely because name/address was added.

## Customer UI changes

Customer surface remains simple.

The existing overflow/menu is the natural entry point for customer profile management.

For `CHAT-ADMIN-0.9.0`, the minimum customer-side addition is a real `Cập nhật tên & địa chỉ` flow backed by the canonical profile update RPC.

It must not block first-contact chat.

If the customer does nothing, they remain a guest and continue chatting normally.

## Admin route and layout

Use a separate Admin route/mode such as `/admin`.

### Mobile Admin

Hierarchy:

`Inbox → Customer conversation/detail`

The inbox is the first Admin screen.

Each inbox row prioritizes:
- customer name or stable guest label,
- latest message preview,
- latest activity time,
- unread state.

Selecting a row replaces the list with the conversation/detail screen. A back action returns to the inbox.

Do not force a permanent split-pane on narrow mobile widths.

### Desktop Admin

At wider widths, use a two-region workspace:
- left: support inbox,
- right: selected conversation/detail.

The two regions share selection state but the message state itself remains owned by the existing `chat/` message runtime.

### Customer detail presentation

Customer detail is secondary to the conversation and should not overwhelm the chat UI.

Minimum fields:
- display name or guest label,
- address if supplied,
- guest/updated status,
- device label/platform,
- first seen,
- last seen.

Unavailable fields must be shown as unavailable/omitted, never guessed.

## Frontend ownership

Existing ownership remains authoritative.

- `session/`: authentication/session lifecycle.
- `chat/`: conversation/message state and message actions.
- `device/`: local device identity for the current client.
- `supabase/`: backend adapters only.
- `viewport/`: keyboard/visual viewport geometry.
- `version.ts`: named app release version.
- Admin UI route/components: inbox selection/presentation/layout only.
- Profile UI: local form draft/presentation only; persisted customer profile remains backend/profile-owned.

Suggested frontend decomposition:
- `src/admin/` — Admin inbox/detail presentation state and orchestration that does not duplicate message state.
- `src/supabase/admin-backend.ts` — Admin RPC adapter.
- `src/profile/` — customer profile contract/action if a profile owner does not already exist.
- `src/supabase/profile-backend.ts` — profile update adapter.

## Realtime behavior

Messages continue using the current realtime message subscription implementation.

Inbox freshness in this first Admin release may use one of two approaches:

1. subscribe to conversation/message changes relevant to inbox state, or
2. refresh the inbox when a selected conversation receives a realtime message plus on foreground/focus.

Prefer the smallest reliable implementation for the current one-Admin support model. Do not introduce a second high-complexity realtime architecture solely for the inbox.

When Admin switches conversations:
- previous message subscription must be stopped,
- selected conversation state changes,
- existing message runtime starts for the new conversation,
- no messages from the old conversation may leak into the new view.

## Responsive geometry

Customer UI continues to support the existing mobile hard gate.

Admin release gates:
- 280px minimum usable width,
- 320px,
- 390px,
- 480px,
- desktop transition widths chosen consistently with the existing app shell.

Mobile uses one active region at a time. Desktop may use split view.

No fixed-position geometry hack may compensate for keyboard/viewport ownership.

## Versioning

All deployed source changes in this release use:

`CHAT-ADMIN-0.9.0`

Named version + short Git build ID remains visible in a compact diagnostics location.

## Database migration requirements

A migration is required for:
- `chat_profiles.address`,
- Admin-only inbox/detail RPCs,
- any profile update RPC change required for address.

Migration rules:
- additive where possible,
- preserve existing profile/conversation/message data,
- do not rewrite or reseed current users,
- do not alter existing Auth IDs,
- do not remove existing RPC compatibility unless explicitly verified safe.

## Testing and release gates

Before release, verify:
- migration applies successfully,
- existing guest/customer rows remain valid,
- anonymous customer cannot access Admin RPCs,
- normal authenticated non-admin cannot access Admin RPCs,
- Admin can load inbox,
- Admin can open support detail,
- Admin can load/send/receive text in selected conversation,
- switching conversations cleans the prior realtime subscription,
- customer can update name/address without changing profile ID,
- support conversation ID remains unchanged after profile update,
- message history remains unchanged after profile update,
- TypeScript PASS,
- full tests PASS,
- production build PASS,
- GitHub Pages deploy PASS,
- `https://chat.taphoa.xyz/` remains the production root and does not regress to `/chat/` base-path deployment.

## Explicit future work

After Admin text support is stable, later releases may add:
- Push notification subscription/backend delivery,
- richer device diagnostics and persisted app build/version if needed,
- voice/WebRTC + Cloudflare TURN,
- call diagnostics,
- account upgrade/login recovery,
- P2P/friends/contacts only when product scope expands.
