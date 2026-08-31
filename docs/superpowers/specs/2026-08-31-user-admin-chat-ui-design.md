# User ↔ Admin Chat UI Design

## Scope

Release target: `CHAT-UI-0.8.0`.

This release replaces the temporary `TEST + version` screen with the first product UI built on the existing Supabase/Auth/Chat/Realtime foundation.

The product scope is intentionally narrow:
- User 1 = guest/anonymous customer.
- User 2 = the same customer profile after adding information or upgrading to a persistent account.
- Both User 1 and User 2 interact only with Admin.
- No user discovery, contacts, friend requests, groups, or user-to-user messaging.

## Core product rule

A customer must be able to open the Web/PWA and contact Admin immediately.

Authentication, anonymous Supabase identity, device registration, support conversation bootstrap, and realtime subscription remain implementation details below the UI. The customer must not be forced through an "anonymous chat" or account-creation screen before asking for help.

## User screen

### Header

The default customer screen opens directly to the support conversation.

Header content:
- back/navigation affordance only where navigation actually exists;
- Admin avatar;
- title `Admin hỗ trợ`;
- compact availability/status text;
- voice-call action placeholder only if the call feature is actually enabled;
- overflow menu `⋯` for account/conversation management.

Do not expose admin diagnostics, device identifiers, internal IDs, Supabase state, or technical connection state in the normal header.

### Conversation body

The body renders real messages from the existing Chat message owner/state.

Rules:
- received messages align left;
- customer messages align right;
- preserve chronological order;
- do not duplicate messages when initial fetch and Realtime deliver the same row;
- message timestamps remain secondary;
- system notices are visually quieter than normal messages;
- avoid decorative or fake encryption claims unless the product actually provides that property.

The release may use a neutral/simple conversation background. A WhatsApp-like decorative wallpaper is not a requirement.

### Composer

The composer stays attached to the visible mobile viewport and uses the existing viewport/keyboard owner.

It contains:
- text input;
- send action when text is present;
- optional `+` affordance reserved for later attachments;
- no attachment implementation in this release unless already supported end-to-end.

Keyboard rules:
- composer must remain above the iOS/Android software keyboard;
- safe-area must be respected;
- when the customer is already at the bottom of the conversation, opening the keyboard keeps the last message visible;
- if the customer is reading older messages, opening the keyboard must not force-scroll to the latest message.

### Customer overflow menu

The `⋯` menu is the upgrade/management entry point. It is not part of the main messaging path.

Items:
1. `Lưu cuộc trò chuyện`
2. `Cập nhật tên & địa chỉ`
3. `Bật thông báo`
4. `Kết thúc & xóa`

For this release, entries that do not yet have complete backend/product behavior may be present only if clearly disabled or marked as not yet available. Do not fake persistence or deletion behavior.

## User 1 → User 2 transition

User 1 and User 2 are states of the same customer profile, not separate identity systems.

Desired transition:

`anonymous Supabase auth → temporary chat profile → same profile gains name/address/account identity`

The existing Admin support conversation must remain the same conversation during upgrade. Do not copy messages to a new conversation and do not create a second customer record merely because the user adds a name/address.

## Customer profile data

Customer-provided information belongs to the customer/profile domain:
- display name;
- address;
- later phone/email if explicitly added.

Device/runtime information does not belong to customer profile:
- OS;
- browser;
- PWA/browser mode;
- device key;
- app version/build;
- notification capability/state;
- network/runtime diagnostics.

Do not infer a user's home/address from device diagnostics or IP metadata.

## Admin UI boundary

The Admin product surface is a separate route/mode and is not implemented as part of the customer UI component.

Admin eventually needs:
- conversation/customer list;
- guest vs upgraded status;
- customer-provided name/address;
- device/runtime/version/build information;
- support status;
- message conversation;
- later call/audio diagnostics where appropriate.

`CHAT-UI-0.8.0` does not need to implement the complete Admin workspace. It must avoid architecture that would make the future Admin route share or duplicate customer-only state machines.

## Ownership

Existing foundation ownership remains authoritative.

- `chat/`: conversation/message state and message actions.
- `session/`: auth/session lifecycle.
- `device/`: local device identity.
- `viewport/`: keyboard/visual viewport geometry.
- `permissions/`: permission request policy.
- `notifications/`: notification delivery contract, not permission policy.
- `version.ts`: sole named app-version source.
- UI components/routes: presentation, interaction wiring, layout, and scrolling only.

The UI must consume these owners rather than create parallel state for their concerns.

## Version and release tracking

All deployed source changes in this release update the named version to `CHAT-UI-0.8.0`.

The screen must continue to expose named version + Git build ID in a compact, non-disruptive location so a device's actual deployed build can be identified during PWA/cache debugging.

## Testing / release gates

Before release:
- TypeScript passes;
- all existing tests pass;
- new UI/state tests pass;
- production Vite/PWA build passes;
- GitHub Pages deploy passes;
- responsive checks at minimum 280/320/390/480px;
- iOS PWA keyboard/composer behavior is checked;
- Android PWA keyboard/composer behavior is checked;
- real Supabase support conversation loads;
- sending a text updates the conversation without duplicate rows;
- Realtime receive path updates a second active client;
- version/build remains visible and updates through the existing PWA lifecycle.

## Explicitly out of scope

- user-to-user messaging;
- friends/contacts;
- group chat;
- media attachments;
- finished account-upgrade flow;
- final profile editing flow;
- push-notification backend integration;
- WebRTC voice/video implementation;
- Cloudflare TURN integration;
- complete Admin dashboard.
