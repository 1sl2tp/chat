# Chat Foundation Lock — Design Spec

Date: 2026-08-31
Status: APPROVED

## Goal

Keep the current Vite/TypeScript/Web/PWA foundation, but prevent repairs in one concern from breaking another concern. Complete basic User ↔ Admin text Chat before any Call work.

## Product scope

- Guest enters directly and can chat with Admin support.
- Registered user keeps persistent identity/history; user-to-user features remain later work.
- Admin has a realtime support inbox, can open history and reply.
- Chat owns durable history, realtime send/receive, read/unread, reconnect and duplicate/loss protection.
- Web/PWA/mobile behavior stays isolated under its existing owners.
- Call is not implemented in this phase and may not own/reset Chat state later.

## Core rule

**Shared engine/contract, isolated mutable lifecycle instances.**

Customer and Admin may use the same ConversationSession implementation, but never the same active state/subscription handle.

Forbidden:

- global current conversation;
- global message subscription shared by unrelated consumers;
- global stop/reset capable of killing another consumer;
- screen-local Realtime fixes;
- direct cross-owner internal-store imports.

## Owners

- `session/`, `identity/`, `device/`: canonical auth/application identity/device state.
- `chat/`: reusable conversation/message behavior and Customer support orchestration.
- `admin/`: Admin inbox/selection/workspace orchestration.
- `supabase/`: adapter only; translates Auth/RPC/Realtime to owner contracts.
- `viewport/`: viewport/keyboard geometry only.
- `pwa/`: service-worker/install/update only.
- UI: rendering, local draft/focus/menu/scroll presentation state only.

## ConversationSession contract

Each session is created for one immutable `conversationId` and owns:

- messages;
- load/realtime/error state;
- one subscription cleanup handle;
- stale-async generation guard;
- `start()`;
- `send(text)`;
- `markRead()`;
- `dispose()`;
- `getState()` / `subscribe(listener)`.

Required guarantees:

1. Two sessions do not affect each other.
2. Late async work after dispose is ignored.
3. RPC result + Realtime duplicate merges to one message.
4. Retry identity uses stable `client_message_id` per send attempt contract.
5. Initial load/subscription ordering cannot silently lose messages.

## Admin inbox contract

Admin inbox is independent from the opened conversation and owns summaries, last message, unread count, ordering and realtime refresh lifecycle. A Customer message must update Admin inbox without focus/visibility/manual refresh.

## Data flow

`UI -> ConversationSession -> backend -> Supabase -> Realtime -> ConversationSession -> ViewModel -> UI`

UI does not directly mutate committed message state. Supabase adapters do not own app state.

## Migration strategy

Preserve current code that satisfies contracts. Replace singleton/global lifecycle incrementally:

1. Add isolated ConversationSession + tests.
2. Move Customer Chat to its own instance and verify.
3. Move Admin selected conversation to its own instance and verify.
4. Add Admin inbox realtime owner and verify.
5. Delete obsolete singleton path only after no consumers remain.

## Release gates for this phase

### Foundation

- independent session test PASS;
- stale callback/dispose test PASS;
- dedupe/order test PASS;
- TypeScript/build PASS.

### User ↔ Admin

- Guest support bootstrap works;
- User send -> DB -> Admin inbox updates realtime;
- Admin open/history/reply works;
- User receives reply realtime;
- read/unread/inbox order correct;
- reconnect does not duplicate subscriptions/messages.

### Regression

- existing session/identity/device tests PASS;
- existing viewport/PWA tests PASS;
- no Call implementation added.

## Reference-source rule

External repositories are pattern references only. Every adopted pattern must pass `Source -> Pattern -> TAPHOA contract -> Owner -> Tests -> local implementation`. No direct source-module composition.
