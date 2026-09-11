# Zalo User Link Bridge — Design

Date: 2026-09-11
Status: Design approved in chat; implementation not started
Base: `main` at `0694ea12ba4af9c51049e9f83b740c7b111ed052`

## 1. Goal

Add an optional Zalo transport to the existing TAPHOA Chat without creating a second chat system.

An Admin can open the existing `…` managed-user profile, choose one discovered Zalo contact, and link it to that existing Chat User. From that moment forward:

- New text from that Zalo identity enters the User's existing Chat conversation.
- New text typed by Admin in that existing Chat conversation is also delivered to the linked Zalo identity.
- Existing Chat history is not copied to Zalo.
- Existing Zalo history is not imported into Chat.
- Unlinked Chat Users behave exactly as they do today.
- No new Zalo contact row, Zalo inbox, or Zalo-specific conversation screen is added to the main UI.

Phase 1 bridges text only. Existing Chat media behavior stays unchanged. Images, files, audio, reactions, reply metadata, calls, read receipts, and typing indicators are not transported to Zalo in this phase. If a canonical Chat message contains typed body text plus media, only the typed body text is eligible for Zalo delivery; the media remains Chat-only.

## 2. Existing ownership stays unchanged

The current Chat system remains the source of truth:

- Chat account/contact owns navigation identity.
- Existing `conversation_id` owns message history.
- Existing message pipeline owns canonical messages.
- Existing SyncEngine / Realtime / cache / renderer continue to display messages and unread state.
- Existing Composer remains the only UI for typing and sending Chat messages.

The Zalo integration is an adapter around this system. It does not create a parallel `messages` table for UI consumption and it does not make the browser talk directly to Zalo.

## 3. User-facing flow

### 3.1 Link

Only Admin can manage a link.

Existing flow:

`Danh bạ → … → Cập nhật User`

Add one row inside the existing Admin-managed profile:

- Unlinked: `Liên kết Zalo   Chưa liên kết  >`
- Linked: `Zalo   C Sâm Phủ Lý   Đổi | Bỏ liên kết`

Choosing `Liên kết Zalo` opens a small picker showing Zalo identities discovered or synced by the bridge. Each row uses the Zalo display name and avatar only to help Admin identify the person.

Selecting `C Sâm Phủ Lý` while editing Chat User `C Sâm pl` creates the mapping. It does not rename `C Sâm pl`, replace its Chat avatar, or add another sidebar contact.

### 3.2 One-to-one rule

- One Chat User can have at most one active Zalo identity.
- One Zalo identity can have at most one active Chat User.
- If a Zalo identity is already linked elsewhere, linking is rejected instead of silently moving it.
- Admin must unlink first before assigning that Zalo identity to another Chat User.

### 3.3 Change or unlink

Changing a link atomically replaces the current mapping and resets the activation time.

Unlinking deletes the current mapping row. It immediately stops future Zalo ingress/egress for that User. Existing canonical Chat messages and historical bridge bookkeeping remain unchanged.

## 4. Time boundary

Each active link stores `linked_at`.

Only messages/events created after that activation boundary participate in the bridge.

This prevents the integration from replaying old Chat history or importing old Zalo history when a link is first created.

Changing the Zalo identity resets `linked_at` so the new mapping starts cleanly from that point.

## 5. Data model

### 5.1 `zalo_contacts`

Purpose: discovery catalog owned by the bridge, used only by Admin's link picker.

Fields:

- `zalo_id text primary key`
- `display_name text not null`
- `avatar_url text null`
- `last_seen_at timestamptz null`
- `updated_at timestamptz not null default now()`

The bridge upserts this table from whatever the active Zalo adapter can safely discover/sync, and always refreshes it from incoming Zalo events when profile data is available. This table is not a Chat contact table.

### 5.2 `zalo_user_links`

Purpose: current active mapping between one existing Chat User and one Zalo identity.

Fields:

- `chat_account_id uuid primary key` → existing Chat User account
- `zalo_id text not null unique` → `zalo_contacts.zalo_id`
- `linked_by_account_id uuid not null` → Admin who linked it
- `linked_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Business constraints:

- target Chat account must be role `user`
- actor must be Admin
- one Chat User ↔ one Zalo identity
- unlink deletes the mapping row, allowing that Zalo identity to be assigned elsewhere later

### 5.3 `zalo_message_links`

Purpose: delivery bookkeeping, deduplication, and loop prevention. It is not the canonical message store.

Fields:

- `id uuid primary key`
- `chat_message_id uuid null`
- `zalo_message_id text null`
- `chat_account_id uuid not null`
- `zalo_id text not null`
- `direction text not null check (direction in ('inbound','outbound'))`
- `state text not null check (state in ('pending','sent','failed','received'))`
- `attempt_count int not null default 0`
- `last_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Required uniqueness:

- outbound: one delivery row per canonical `chat_message_id`
- inbound: one accepted row per external `zalo_message_id`

This table prevents an inbound Zalo message that becomes a canonical Chat message from being sent back to Zalo again.

## 6. Security and API boundary

### Browser

The browser never receives Zalo credentials and never writes directly to bridge-owned tables.

Admin UI calls dedicated authenticated RPC/API operations:

- list discovered Zalo contacts
- read current User link
- link User ↔ Zalo
- unlink User ↔ Zalo

All mutations verify the current authenticated actor is Admin and the target is an existing Chat User.

### Bridge

The bridge runs server-side only. It uses server credentials stored in the bridge deployment environment, never in Chat frontend code.

The bridge does not insert arbitrary rows into canonical Chat tables. Inbound Zalo text goes through a dedicated server-side ingress operation that resolves the active mapping and creates a canonical message using the existing Chat message rules.

The concrete Zalo library/package is hidden behind a small adapter interface. The implementation must verify the usable API surface before depending on any package named in external notes; the Chat/DB contract must not depend on one unofficial client library.

## 7. Inbound flow: Zalo → existing Chat conversation

For a new Zalo text event:

1. Bridge receives `zalo_id`, external message id, text, and event time.
2. Bridge upserts basic Zalo profile discovery data when available.
3. Resolve a current `zalo_user_links` row for `zalo_id`.
4. If no link exists, stop. The event does not enter Chat.
5. Reject events older than the link's `linked_at` boundary.
6. Check `zalo_message_links` for the external message id. If already accepted, stop.
7. Resolve the existing Chat conversation for the linked User.
8. Create one canonical Chat text message with the linked User as sender.
9. Record the inbound mapping as `received`.
10. Existing SyncEngine / Realtime wakes the Admin UI; sidebar preview and unread behavior continue through the existing Chat pipeline.

No Zalo history fetch is performed when linking.

## 8. Outbound flow: existing Chat conversation → Zalo

Outbound applies only to new canonical messages authored by Admin that contain non-empty typed body text.

For each eligible new Chat message:

1. Existing Chat send path creates the canonical message first.
2. Server-side bridge routing checks whether the conversation peer is a User with a current Zalo link.
3. If no link exists, do nothing.
4. If the message predates `linked_at`, do nothing.
5. If the message originated from Zalo/inbound bookkeeping, do nothing.
6. Create or resolve one outbound delivery row keyed by `chat_message_id`.
7. Bridge sends the typed body text to the linked `zalo_id`.
8. On success, store the external Zalo message id and mark `sent`.
9. On transient failure, keep canonical Chat message intact and retry delivery with bounded backoff.

Messages authored by the linked User inside Chat are not echoed to that User's own Zalo account.

## 9. Failure behavior

Zalo is an optional transport. Chat must remain usable when the bridge or Zalo is unavailable.

- Chat message creation never depends on Zalo being online.
- Bridge failure must not block Composer, contact switching, SyncEngine, media, or Call.
- Outbound delivery failures remain retryable in `zalo_message_links`.
- Repeated inbound events are idempotent.
- Unlinked users produce zero bridge delivery work.

Phase 1 does not add delivery badges to every message. If a durable outbound failure needs user-visible treatment after real testing, add one compact Admin-only `Zalo chưa gửi` status without changing message ownership.

## 10. Bridge runtime placement

Keep bridge source isolated from browser runtime under a dedicated server directory in the Chat repository:

`bridge/zalo/`

This keeps bridge code versioned with the exact Chat schema/contracts while preventing it from entering the static Web/PWA bundle.

Expected bridge responsibilities:

- maintain the Zalo session/login state
- discover/sync Zalo identities that the selected adapter exposes
- update `zalo_contacts`
- receive new Zalo text events
- call the protected Chat ingress operation
- consume pending outbound deliveries
- send them to Zalo
- retry transient failures
- log bridge health and failures

The Render deployment is operational infrastructure; repository implementation must not depend on Render-specific UI logic.

## 11. UI ownership

Only `shell.js` / existing managed-profile UI should gain the link controls. The main conversation layout, Composer, message renderer, contact list geometry, keyboard behavior, Call controls, and Work/GETLINK embed remain unchanged.

This is deliberately not a new Chat screen.

## 12. Testing gates

Implementation must be TDD and preserve existing Chat verification.

Required contracts:

1. Non-Admin cannot list/link/unlink Zalo identities.
2. Admin can link one existing User to one unclaimed Zalo identity.
3. Same User cannot own two active Zalo identities.
4. Same Zalo identity cannot be linked to two Users.
5. Unlinked User has no inbound/outbound bridge behavior.
6. No message before `linked_at` is bridged.
7. New inbound Zalo text becomes exactly one canonical Chat message.
8. Duplicate inbound external id creates no duplicate Chat message.
9. New Admin-authored Chat text for linked User creates exactly one outbound delivery.
10. User-authored Chat text is not echoed to that User's Zalo.
11. Inbound Zalo-created Chat message is not looped back outbound.
12. Unlink immediately stops future bridge routing and releases the Zalo identity for another User.
13. Existing contact switching, Composer, SyncEngine, media, Call, and GETLINK Work contracts remain green.
14. Bridge unit tests use a mocked Zalo adapter; CI never sends real Zalo messages.
15. Existing media messages continue to work in Chat even though Phase 1 does not transport media to Zalo.

Before merge, run the repository's canonical `python tools/verify_current.py` gate plus the new bridge/database contract tests on the exact feature SHA.

## 13. Explicit non-goals for phase 1

- No import of historical Zalo conversations.
- No export of historical Chat messages.
- No second Zalo contact in the Chat sidebar.
- No replacement of Chat User name/avatar with Zalo profile data.
- No Zalo UI tab or channel selector.
- No browser-side Zalo credentials.
- No direct frontend inserts into a parallel Zalo `messages` table.
- No media transport to Zalo yet.
- No Zalo call integration.
- No effect on Users that Admin has not explicitly linked.

## 14. Success criteria

The feature is successful when Admin can link `C Sâm pl` to the discovered Zalo identity `C Sâm Phủ Lý`, then:

- a new text sent from `C Sâm Phủ Lý` appears once in the existing `C Sâm pl` Chat conversation;
- a new text typed by Admin in `C Sâm pl` is delivered once to `C Sâm Phủ Lý` on Zalo;
- old messages on both sides remain untouched;
- unlinking stops future cross-delivery and allows that Zalo identity to be linked elsewhere;
- every other unlinked Chat User continues exactly as before.
