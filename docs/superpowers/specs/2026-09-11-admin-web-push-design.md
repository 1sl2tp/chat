# Admin-only Web Push Notifications Design

Date: 2026-09-11
Branch: `feature/admin-web-push-design`

## Context

TAPHOA Chat already has:

- authenticated accounts with canonical role in `v21_accounts.role`;
- 1:1 conversations in `v21_conversations(member_a, member_b)`;
- canonical messages in `v21_messages`;
- media metadata in `v21_media_assets`;
- a PWA manifest and registered Service Worker (`sw.js`);
- a working background-event pattern in Supabase where a database trigger wakes an external/background processor through `pg_net`.

The current Service Worker only handles shell caching/update. It does not yet handle Push API events or notification clicks.

The existing call Screen Wake Lock is not a background keep-alive mechanism. It only prevents screen sleep while the page remains eligible/visible. This feature must therefore use Web Push rather than trying to keep the app alive.

## Goal

Add reliable **admin-only system notifications** for new inbound Chat events so an Admin can receive them when the browser tab/PWA is in the background or closed.

Supported v1 events:

- text message;
- image;
- file;
- voice message;
- missed-call text event (`Cuộc gọi nhỡ`).

The notification should identify the contact, summarize the event, and open/focus the exact conversation when tapped.

## Non-goals

This phase does not:

- implement native mobile push outside Web Push;
- keep a page/process continuously alive in the background;
- implement an incoming-call UI through push;
- play a custom MP3 notification sound in the background;
- notify normal User accounts;
- introduce a second message store;
- alter the existing Chat/Zalo transport pipeline.

## Platform behavior

### Background / closed app

Use Web Push + Service Worker notification display.

Expected behavior where the platform supports Web Push:

- OS notification banner / Notification Center entry;
- normal system notification sound according to OS/browser notification settings;
- click opens or focuses TAPHOA Chat;
- route selects the correct contact/conversation.

On iPhone/iPad, reliable background Web Push is targeted at the installed Home Screen PWA. A normal Safari tab is not treated as the primary supported background-notification mode.

### Foreground

If TAPHOA Chat is visible and focused on the **same conversation**, do not show a duplicate system notification.

If TAPHOA Chat is visible but the Admin is on another conversation or on `Công việc`, the initial implementation may still show a system notification. This keeps v1 deterministic and avoids inventing a separate in-app notification subsystem.

### Sound

Background sound is owned by the operating system/browser notification settings. The app does not promise a custom sound file for background notifications.

No additional foreground custom sound is required in v1. This avoids duplicate audio when the OS also presents a notification.

## Approaches considered

### A. Client-triggered push send

After a sender writes a message, browser code calls a push sender.

Rejected because:

- messages arriving through Zalo/server ingress can bypass the browser path;
- delivery correctness would depend on whichever client happened to create the message;
- the browser would become responsible for a server-side notification decision.

### B. Database outbox + Supabase Edge Function — selected

A database trigger creates one canonical push outbox row for each qualifying inbound message. A background Edge Function atomically claims the row and sends Web Push to active Admin subscriptions.

Benefits:

- all message ingress paths converge on canonical `v21_messages`;
- idempotency can be enforced at the outbox level;
- browser never receives VAPID private credentials;
- subscriptions and push delivery stay separate from message storage;
- aligns with the repo's existing event-driven database/background-service pattern.

### C. Extend the Render Zalo bridge to send Web Push

Rejected because Web Push is not a Zalo transport concern. Coupling notification delivery to the Zalo runtime would create unnecessary ownership and deployment dependencies.

## Canonical data model

### `v21_push_subscriptions`

One row per Admin browser/PWA subscription.

Proposed fields:

- `id uuid primary key`;
- `account_id uuid not null references v21_accounts(id)`;
- `device_id uuid null` — current Chat device/session identity when available;
- `endpoint text not null unique`;
- `p256dh text not null`;
- `auth text not null`;
- `platform text null` (`ios-pwa`, `android-pwa`, `web`, etc.);
- `user_agent text null`;
- `enabled boolean not null default true`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`;
- `last_success_at timestamptz null`;
- `last_failure_at timestamptz null`;
- `failure_count integer not null default 0`.

Rules:

- subscription registration is accepted only for an authenticated active Admin;
- normal Users cannot create/read Admin subscriptions;
- duplicate `endpoint` updates the existing row instead of creating duplicates;
- HTTP 404/410 from a push endpoint disables/removes that subscription.

### `v21_push_outbox`

One durable, idempotent event per notification candidate.

Proposed fields:

- `id uuid primary key`;
- `message_id uuid not null references v21_messages(id)`;
- `recipient_account_id uuid not null references v21_accounts(id)`;
- `sender_account_id uuid not null references v21_accounts(id)`;
- `conversation_id uuid not null references v21_conversations(id)`;
- `state text not null` (`pending`, `processing`, `sent`, `retry`, `dead`);
- `attempt_count integer not null default 0`;
- `available_at timestamptz not null default now()`;
- `last_error text null`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Unique constraint:

- `unique(message_id, recipient_account_id)`.

The outbox stores references, not a second copy of message text. Notification content is built from canonical message/account/media rows when the event is processed.

## Qualification rule

After insert into `v21_messages`:

1. Load the conversation.
2. Determine the other participant from `member_a/member_b`.
3. The message qualifies only when:
   - sender account is active and has `role='user'`;
   - the other participant is active and has `role='admin'`;
   - message is not deleted.
4. Insert the outbox row with `on conflict do nothing` semantics.

This means:

- Admin → User messages never notify Admin;
- User → Admin messages do notify Admin;
- Zalo inbound that has already become a canonical User → Admin `v21_messages` row follows the same rule automatically;
- profile edits/contact reorder events never create notifications.

## Notification payload

Edge Function builds a small payload from canonical data.

Common fields:

- `notification_id` = outbox id;
- `message_id`;
- `conversation_id`;
- `contact_id` = sender account id;
- `title` = sender `display_name` (fallback username);
- `body` = event summary;
- `tag` = `chat:<conversation_id>`;
- `url` = app route/deep-link data for that contact;
- `icon` = app icon;
- optional contact avatar only when it is a safe stable URL.

Body rules:

- non-empty text: trimmed preview, capped to a short single notification body;
- image-only: `Ảnh`;
- file-only: `Tệp` or file name when short/safe;
- audio-only: `Ghi âm`;
- missed-call message: `Cuộc gọi nhỡ`;
- mixed text + media: prefer text preview.

Multiple media assets on one logical message still produce one notification because the outbox key is the message id.

## Delivery worker

Add a Supabase Edge Function such as `v21-admin-push`.

Responsibilities:

1. Atomically claim pending/retry outbox rows.
2. Re-read canonical message, conversation, sender, recipient, and media.
3. Confirm recipient is still an active Admin.
4. Load all enabled subscriptions for that Admin.
5. Encrypt/sign Web Push using server-only VAPID credentials.
6. Send to each subscription.
7. Disable invalid subscriptions (404/410).
8. Mark the outbox row sent when processing has completed for all current subscriptions.
9. On transient failure, move to retry with bounded backoff.

### Wake-up

Preferred v1 pattern:

- DB trigger inserts `v21_push_outbox`;
- a lightweight `pg_net` signal invokes the Edge Function immediately;
- Edge Function never trusts notification title/body from the HTTP signal — it only claims canonical queued rows from the database.

The signal endpoint is a wake-up mechanism, not the source of notification truth. Atomic `pending/retry → processing` claiming prevents duplicate sends from repeated wake requests.

## Subscription API

Browser registration must not directly write arbitrary rows.

Add authenticated actions to `v21-admin-push`:

### `action: public_key`

Returns the VAPID public key only.

### `action: subscribe`

Input:

- PushSubscription JSON;
- optional device metadata.

Server:

- validates caller JWT;
- resolves current `v21_accounts` row;
- requires active `role='admin'`;
- upserts canonical subscription by endpoint/account.

### `action: unsubscribe`

Disables/removes the current endpoint for the authenticated Admin.

### `action: status`

Returns only the caller's own current device/subscription state.

Normal Users receive `admin_required` and cannot subscribe.

## Browser / Admin UI

Add a compact Admin-only notification setting inside the existing Admin settings area (`Zalo & tài khoản` is an acceptable home because it is already Admin-only; implementation may place it in the shared Admin settings shell if cleaner).

States:

- `Bật thông báo` — permission not yet granted/subscribed;
- `Đã bật thông báo` — active subscription;
- `Thông báo bị chặn` — browser permission denied;
- `Thiết bị này không hỗ trợ` — Push/Service Worker unavailable;
- on iOS browser when not installed as Home Screen PWA: explain briefly that background notification requires the installed PWA rather than repeatedly prompting permission.

Permission request occurs only from an explicit Admin tap. Do not auto-prompt on page load.

Logout/revoked session:

- best-effort unsubscribe current endpoint from server;
- local browser subscription may also be removed;
- a stale endpoint still cannot receive indefinitely because invalid/disabled subscriptions are cleaned by the worker.

## Service Worker behavior

Extend existing `sw.js`; do not introduce a second Service Worker.

### `push`

1. Parse validated JSON payload.
2. Inspect existing window clients.
3. If a visible/focused TAPHOA Chat client reports it is currently on the same conversation, suppress the system notification.
4. Otherwise call `showNotification()` with:
   - title;
   - body;
   - app icon/badge icon when supported;
   - `tag: chat:<conversation_id>`;
   - `renotify: true` where supported;
   - navigation data.

`tag` groups repeated events from the same conversation rather than stacking a large number of separate banners.

### Foreground-state bridge

The page posts a tiny state message to the Service Worker when these change:

- visibility/focus;
- active contact/conversation;
- route (`chat` vs `work`).

The Service Worker keeps only transient in-memory client state. Canonical message/read state remains in Supabase.

### `notificationclick`

1. Close the notification.
2. Search existing same-origin window clients.
3. Focus an existing TAPHOA Chat client if available; otherwise `openWindow()`.
4. Deliver navigation data to the page.
5. Page selects Chat mode + the specified contact/conversation.

No fragile DOM selectors are encoded into the notification URL.

## Badge

Badge support is best-effort and platform-dependent.

V1 behavior:

- when a push is displayed, increment a local app badge counter when `setAppBadge`/`setExperimentalAppBadge` equivalent is supported;
- when the Admin opens/focuses TAPHOA Chat, clear the local app badge.

This badge is a notification-attention badge, not a canonical unread counter. A true unread model should be designed separately if exact cross-device unread counts are later required.

## Privacy

Default notification body contains the normal message preview because this is a private Admin device workflow.

Do not include:

- authentication tokens;
- internal IDs in user-visible text;
- signed media URLs;
- passwords;
- service-role/VAPID private data.

The full message is never copied into the subscription table.

## Security

- subscription actions require authenticated active Admin account;
- RLS/direct grants prevent normal Users from reading subscriptions/outbox;
- VAPID private key exists only as a Supabase Edge Function secret;
- browser receives only VAPID public key;
- Edge Function derives notification content from canonical DB rows, not caller-supplied wake payload;
- outbox claim is atomic and idempotent;
- invalid endpoints are disabled/removed;
- normal Users never become push recipients simply by calling the subscription endpoint.

## Failure and retry

- no subscription: mark event processed with zero targets; message flow is unaffected;
- 404/410 endpoint: remove/disable subscription and continue;
- transient network/5xx: bounded retry with backoff;
- malformed subscription: disable it;
- Edge Function unavailable: outbox remains pending/retry and can be re-woken;
- push failure must never roll back or block message insertion.

Notification delivery is best-effort secondary delivery. Chat data remains authoritative.

## Testing

### Database contracts

- User → Admin message creates exactly one outbox row;
- Admin → User does not create one;
- duplicate trigger/replay does not duplicate outbox;
- profile/contact edits do not affect push queue;
- normal User cannot read/write subscription rows;
- Admin can register only own subscriptions.

### Edge Function

- rejects subscription mutation for non-Admin;
- public key action never exposes private key;
- one outbox event fans out to all active Admin subscriptions;
- 404/410 disables subscription;
- retryable failures preserve retry state;
- media-only summaries map to `Ảnh` / `Tệp` / `Ghi âm`;
- `Cuộc gọi nhỡ` remains exactly that text;
- repeated wake calls do not duplicate a claimed/sent event.

### Service Worker / browser

- existing cache/update behavior remains intact;
- background push calls `showNotification`;
- focused same-conversation client suppresses notification;
- different conversation does not suppress;
- same-conversation notifications reuse the same tag;
- click focuses existing client or opens a new window;
- click routes to correct contact;
- permission is requested only from explicit Admin action;
- normal User never sees notification controls.

### Regression gates

- existing `Verify V21` stays green;
- existing `Zalo Bridge TDD` stays green;
- existing PWA update contract stays green;
- existing call Wake Lock behavior stays unchanged.

## Rollout / delivery order

1. Add schema + RLS/RPC contracts for subscriptions/outbox.
2. Add Edge Function push worker with VAPID secrets and unit/contract tests.
3. Add DB trigger/outbox enqueue + immediate `pg_net` wake.
4. Extend existing Service Worker for push + notification click while preserving update/cache behavior.
5. Add Admin-only browser subscription controller + compact settings UI.
6. Add foreground active-conversation state bridge.
7. Test desktop web, Android web/PWA, iPhone installed PWA.
8. Deploy migration + Edge Function only after branch CI is green.
9. Verify one real Admin device subscription and one real background message end-to-end before merging/deploying broader UI changes.

## Acceptance criteria

The phase is PASS when all of these are demonstrated:

1. A normal User cannot subscribe as a notification recipient.
2. Admin explicitly enables notifications on a supported device.
3. With TAPHOA Chat closed/backgrounded, a new User → Admin message produces a system notification.
4. Text/image/file/audio/missed-call summaries are correct.
5. Tapping the notification opens/focuses the app at the correct contact.
6. When Admin is visibly reading that same conversation, no duplicate system banner is shown.
7. Multiple Admin devices may each receive the push if each device is subscribed.
8. Invalid subscriptions are cleaned without affecting message delivery.
9. `Verify V21` and `Zalo Bridge TDD` remain green.
