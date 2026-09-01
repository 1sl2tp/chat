# TAPHOA Root User Modes Design

Date: 2026-09-01
Status: IMPLEMENTED ON `fix/pwa-core-simplify`, pending `main` integration

## Goal

Make `https://chat.taphoa.xyz/` resolve exactly two user modes without mixing test/admin state:

- **User1 / vãng lai**: chat with Admin only, no Call, temporary session.
- **User2 / registered**: explicit login, persistent session, Chat + Call.
- **Admin** remains isolated at `/admin/` and is not part of root user classification.

The temporary `test` account exists only for prior Call diagnostics and must never be auto-selected by production root startup.

## Locked behavior

### User1

- Opening root with no valid persistent User2 session starts a fresh anonymous guest session.
- User1 can chat with Admin.
- User1 has no Call button, no LiveKit session startup and no Call/Web-Push registration.
- Guest Auth and guest device identity are session-scoped, not persistent User2 state.
- Closing the current browsing/PWA session must not cause the next root launch to restore the old guest conversation.
- Client guest cache/session is cleared when the guest session ends.
- Browser shutdown callbacks are best-effort only; server cleanup must not depend solely on `beforeunload`/`pagehide`.

### User2

- User2 is entered only by an explicit login action.
- Before User2 login, the active User1 guest Auth/session/device state is ended/cleared.
- Login username maps to the existing TAPHOA email convention `<username>@taphoa.chat`.
- A valid User2 session persists across reopen until explicit logout or server revocation.
- User2 receives Chat + Call + Push behavior.
- User2 logout clears User2 runtime state, then root starts a new User1 session.

### Admin

- `/admin/` keeps its existing Admin login/workspace behavior.
- Admin Auth never participates in root User1/User2 resolution.
- Admin and root User may be logged in simultaneously on the same physical device/browser.

## Same-device isolation contract

The following namespaces must not collide on one origin:

| Owner | Auth storage | Device key storage | Service Worker / Push registration |
| --- | --- | --- | --- |
| User1 guest | session-scoped guest key | session-scoped guest device key | none |
| User2 | persistent root-user key | persistent User2 device key | generated `sw.js`, user-root scope (`/` or `/chat/`) |
| Admin | persistent admin key | persistent Admin device key | same generated `sw.js`, separate Admin scope (`/admin/` or `/chat/admin/`) |

This fixes two collision classes:

1. Root and Admin previously shared one device key namespace.
2. Root and Admin previously resolved to one root Service Worker registration, so one PushManager subscription could be rebound between profiles.

The browser therefore holds separate Service Worker registrations and separate Push subscriptions for User2 and Admin when both are enabled on the same machine, without duplicating Service Worker source code.

## Root startup resolver

```text
Open /
  -> valid persistent User2 session?
       yes -> boot User2
       no  -> clear stale root guest session -> create User1 anonymous -> boot User1

User1 taps Login
  -> stop guest runtime
  -> sign out/clear guest auth + guest device state
  -> sign in User2 using persistent root-user client
  -> boot User2

User2 taps Logout
  -> stop call/push/chat runtime
  -> sign out User2
  -> clear User2 runtime state
  -> create a completely new User1 session
```

## PWA / Push ownership

- Vite PWA generates one `sw.js` implementation.
- On the custom domain the script URL is `/sw.js`; on GitHub Pages project hosting it is `/chat/sw.js`.
- Root User2 registers that script at the deployed user-root scope: `/` on the custom domain or `/chat/` on GitHub Pages.
- Admin registers the same script URL as a distinct Service Worker registration at `/admin/` or `/chat/admin/`. Service Worker registrations are scope-keyed, so User2 and Admin receive independent PushManager subscriptions even though the script source is shared.
- Service Worker precache, install assets and notification navigation resolve from the runtime deployment base instead of assuming origin root.
- Notification clicks are normalized and constrained to the active Service Worker scope, preventing duplicated paths such as `/admin/admin/` and preserving project-base navigation such as `/chat/?conversation=...`.
- User1 does not register Push; guest chat is foreground/realtime only.

## Runtime ownership

The chat runtime no longer depends on one global default Supabase client. Root startup passes the active client/device key explicitly so User1 and User2 cannot leak state into each other.

A runtime stop/reset operation disposes realtime subscriptions and resets stores before switching modes.

## Non-goals

- Do not revisit LiveKit codec/mic/audio foundation; two-way LiveKit audio was previously PASS.
- Do not add Firebase, Redis, APK/native shell, or a second backend queue.
- Do not redesign Admin UI.
- Do not keep fixed `test` auto-login behavior in production root.

## Verification gates

1. No User2 session -> root boots User1, chat works, Call/notification controls absent.
2. Valid User2 session -> root boots User2, Call/Push available.
3. User1 -> login User2 -> guest state is ended before User2 bootstrap.
4. User2 logout -> new User1 identity/session, old User2 is not reused.
5. Admin and User2 can coexist in same browser with distinct Auth keys, device keys and Service Worker registrations/subscriptions.
6. Custom-domain root/Admin and GitHub Pages `/chat/` + `/chat/admin/` resolve PWA assets and navigation inside their deployment base.
7. Notification click remains inside the owning Service Worker scope.
8. Admin remains functional at `/admin/`.
9. Typecheck, all Vitest tests and Vite PWA build PASS before merge.
