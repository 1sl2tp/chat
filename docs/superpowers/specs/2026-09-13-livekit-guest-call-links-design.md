# LiveKit Guest Call Links — Design

Date: 2026-09-13
Status: Approved
Repo: `1sl2tp/chat`

## Goal

Add a short-lived public call-link flow for customers reached through Zalo. Admin can create and send one compact link without starting a normal Chat call or opening the microphone. The customer opens the link without a Chat account, explicitly taps **Tham gia cuộc gọi**, and only then receives a short-lived LiveKit token and microphone permission prompt.

The existing authenticated call state machine (`v21-call-engine.js`, `v21-livekit-session.js`, `v21_call_start`, `RINGING/ACCEPTED/...`) remains untouched.

## Locked user flow

1. Admin opens the existing `⋯` contact/profile menu.
2. Admin taps **Gửi link gọi**.
3. System creates a new invite with a 10-minute expiry and immediately sends only the public URL through the existing canonical Chat text/SyncEngine/Zalo bridge path.
4. Admin is **not** joined to LiveKit, microphone is **not** requested, and the normal call engine is not started.
5. Customer opens `https://chat.taphoa.xyz/c/?k=<opaque-key>` in Zalo WebView or a normal browser.
6. The public page validates the invite and shows a minimal TAPHOA Call screen with expiry state and a **Tham gia cuộc gọi** button.
7. Opening the page does not request microphone access.
8. When customer taps **Tham gia cuộc gọi**, the guest endpoint validates the invite again, issues a LiveKit guest token, and the page requests microphone permission/connects to the invite room.
9. Admin sees invite state (`Đã mở link`, then `Khách đã vào phòng`) and can tap **Tham gia** to request an authenticated admin token and connect to the same room.
10. Expired, revoked, or ended invites cannot mint new tokens. The public page shows a concise terminal message.

## Architecture

This is a new subsystem parallel to normal Chat calls:

`Contact action -> Admin invite Edge Function -> chat_call_invites -> public /c/ page -> Guest Edge Function -> LiveKit room`

Admin join uses:

`Admin invite UI -> Admin invite Edge Function -> LiveKit room`

No operation in this subsystem calls `v21_call_start`, `v21_call_accept`, `v21_call_end`, or mutates the canonical call state machine.

## Data model

Create `public.chat_call_invites` with:

- `id uuid primary key default gen_random_uuid()`
- `key_hash text not null unique`
- `room_name text not null unique`
- `contact_id text not null`
- `created_by_account_id uuid not null`
- `created_at timestamptz not null default now()`
- `expires_at timestamptz not null`
- `opened_at timestamptz null`
- `guest_joined_at timestamptz null`
- `admin_joined_at timestamptz null`
- `revoked_at timestamptz null`
- `ended_at timestamptz null`

Rules:

- Default invite TTL is exactly 10 minutes from creation.
- The raw URL key is never persisted. Only SHA-256 hex is stored.
- Room name is generated server-side from invite identity/randomness; it is never accepted from the browser.
- Client code cannot insert or update invite rows directly.
- Authenticated creator can read only their own invite rows for status/realtime.
- Public/anon cannot select the table directly.
- Add the table to Supabase Realtime publication so creator-side status can update without reloading.

## Edge Functions

### `v21-call-invite-admin` — authenticated

`verify_jwt: true`.

Actions:

- `create { contactId }`
  - validates authenticated Chat account/session using the same account/session ownership conventions already used by Chat admin features;
  - generates a cryptographically random raw key;
  - stores only `sha256(rawKey)`;
  - creates a unique room name;
  - sets `expires_at = now() + 10 minutes`;
  - returns `{ inviteId, url, expiresAt }` where URL is `/c/?k=<rawKey>`.

- `join { inviteId }`
  - verifies caller is the invite creator;
  - rejects expired/revoked/ended invite;
  - mints LiveKit token for identity `admin:<accountId>:<inviteId>`;
  - grants only room join, subscribe, microphone publish;
  - marks `admin_joined_at` only after the client reports a successful LiveKit connection using `connected`.

- `connected { inviteId }`
  - verifies creator and active invite;
  - stamps `admin_joined_at` if absent.

- `revoke { inviteId }` and `end { inviteId }`
  - creator-only;
  - terminally prevent future token minting.

### `v21-call-invite-guest` — public with invite-key authentication

`verify_jwt: false`. This is intentional because Zalo customers do not have Chat accounts. The function performs custom authorization using the high-entropy invite key.

Actions:

- `open { key }`
  - hashes key server-side;
  - looks up active invite;
  - if active, stamps `opened_at` once;
  - returns only minimal public metadata (`status`, `expiresAt`), never room name/token/database identifiers.

- `join { key }`
  - revalidates active state and expiry;
  - mints token for fixed identity `guest:<inviteId>`;
  - grants only room join, subscribe, microphone publish;
  - returns LiveKit server URL + participant token.

- `connected { key }`
  - revalidates invite;
  - stamps `guest_joined_at` once after the browser has actually connected to LiveKit.

Security properties:

- No LiveKit API key/secret in browser assets.
- No LiveKit token in the public URL.
- Guest endpoint never accepts room name, identity, or privileges from the client.
- One fixed guest identity per invite means a second device using the same link cannot create an independent second guest participant; LiveKit identity collision provides an additional single-guest guard.
- Functions return generic terminal/invalid responses and never disclose whether an arbitrary database id exists.
- CORS explicitly supports Supabase browser invocation headers (`authorization`, `apikey`, `x-client-info`, `content-type`) where applicable.

## LiveKit token policy

Current authenticated `v21-livekit-token` already uses a 10-minute TTL. The new subsystem follows the same TTL ceiling but mints tokens only after invite validation.

Both guest and admin invite tokens:

- TTL: `10m` maximum, and the minting endpoint refuses after invite expiry.
- `roomJoin: true`
- `canSubscribe: true`
- `canPublish: true`
- `canPublishSources: [MICROPHONE]`
- `canPublishData: false`
- no camera/video grant.

Token lifetime does not extend invite validity for new joins. Existing LiveKit connections may remain until the session is ended/disconnected; the application `end` action prevents new tokens and both clients should disconnect when they observe terminal state.

## Public `/c/` page

Add a static lightweight `c/index.html` designed for Zalo WebView:

- no login;
- no redirects;
- no cookies/localStorage required for authorization;
- no microphone request on page load;
- no third-party UI dependencies;
- LiveKit client SDK loaded only when user chooses to join (or preloaded without requesting media if performance requires it);
- states: loading, ready, joining, connected, expired/invalid, ended/error;
- one primary action: **Tham gia cuộc gọi**;
- once connected: concise call state with **Kết thúc/Rời cuộc gọi**.

The raw key remains in the page URL only as the bearer capability. The page never renders it into visible text or logs it intentionally.

## Admin UI

Extend the existing contact/profile action area with **Gửi link gọi**.

Create flow:

- call `v21-call-invite-admin:create`;
- pass only the returned URL into the existing canonical text queue/SyncEngine send path for that contact;
- do not directly call Zalo APIs;
- do not mutate composer draft/attachments;
- do not call normal CallEngine;
- do not request microphone.

After creation, show a compact invite state row in the same contact UI:

- `Link gọi · còn Xm`
- `Đã gửi` / `Khách đã mở link` / `Khách đã vào phòng` / `Hết hạn`
- button **Tham gia** appears only while invite is active and guest has opened/joined (it may be shown after `opened_at`; joining remains an explicit Admin action).

Admin LiveKit media for this subsystem is owned by a new small module (for example `guest-call-session.js`) rather than `V21LiveKitSession`, so it cannot corrupt the canonical call engine state. It reuses the existing audio-capture policy for microphone ownership and releases it on leave/end.

## State and concurrency

Invite status is derived, not manually trusted from the UI:

- terminal if `revoked_at` or `ended_at` is set;
- expired if `now() >= expires_at`;
- guest joined if `guest_joined_at` exists;
- opened if `opened_at` exists;
- otherwise created/sent.

Creating another invite for the same contact does not mutate older rows. UI should treat the newest active invite as current. Older links remain valid only until their own expiry unless explicitly revoked.

## Failure handling

- Supabase/Edge error during creation: no message is sent; UI shows a compact retryable error.
- Message queue failure after invite creation: invite remains valid; UI provides **Gửi lại link** using the same URL rather than creating another invite automatically.
- Guest microphone denial: remain on the page with a retry button; do not stamp `guest_joined_at`.
- LiveKit connect failure: do not stamp joined; allow retry while invite is active.
- Expiry while page is open but before join: `join` rejects and page changes to expired.
- Admin join after expiry: rejected.

## Testing / TDD gates

Add RED contracts before production code for:

1. DB schema, RLS and Realtime publication.
2. Invite key hashing/expiry/status helpers.
3. Admin Edge Function: authenticated create, creator-only join, 10-minute expiry, microphone-only grants.
4. Guest Edge Function: public custom-key auth, no room/identity client control, expired/revoked rejection, no token in URL.
5. Public page: no login, no auto-mic, join action only after click, terminal states.
6. Admin UI: `Gửi link gọi` exists, sends through canonical text queue, does not call `V21CallEngine.startOutgoing`, does not request mic on create.
7. Guest/Admin LiveKit session: microphone acquired only on explicit join and released on leave.
8. Existing Verify V21, Zalo Bridge and Admin Push workflows remain green.

## Deployment order

1. Migration.
2. Deploy admin and guest Edge Functions.
3. Deploy public `/c/` page and admin UI/session module through normal `main` deployment.
4. Verify production function versions ACTIVE.
5. Smoke test with one freshly generated invite: create -> send URL -> open public page -> join guest -> status update -> explicit admin join -> two-way audio -> end/expiry rejection.

## Non-goals

- No video call in this iteration.
- No permanent meeting links.
- No guest Chat account creation.
- No integration into normal `RINGING/ACCEPTED` call state.
- No automatic Admin join/microphone activation.
- No direct Zalo call API integration.
