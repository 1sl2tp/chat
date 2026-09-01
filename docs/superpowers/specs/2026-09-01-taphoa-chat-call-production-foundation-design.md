# TAPHOA Chat + Call — Production Foundation Design

Date: 2026-09-01

## Goal

Keep TAPHOA Chat small and easy to maintain: one User surface, one Admin surface, one shared Chat domain, one shared Call domain. Productionize the existing LiveKit path without creating extra frameworks or duplicate state owners.

## Scope

This design covers only the foundation needed for User ↔ Admin chat and call:

- keep User UI and Admin UI separate;
- keep Chat and Call shared below them;
- productionize LiveKit authentication and packaging;
- keep the existing iPhone/Android audio behavior intact;
- keep GitHub Actions, TypeScript, Vite and PWA structure unless a focused change is required;
- use `https://chat.taphoa.xyz/` as the single canonical production origin.

Not in scope: group calls, generic participant engines, event buses, conference features, multiple roles beyond current User/Admin behavior, or unrelated refactoring.

## Canonical ownership

### User surface

`src/user/` and `src/user-main.ts` own User presentation and User-only interaction wiring.

They may call shared Chat and Call APIs. They must not implement separate Chat or Call state machines.

### Admin surface

`src/admin/` and `src/admin-main.ts` own Admin presentation and Admin-only workspace interaction wiring.

They may call shared Chat and Call APIs. They must not implement separate Chat or Call state machines.

### Chat

`src/chat/` owns conversation, messages, unread state and message realtime behavior.

Chat may display call-history cards, but a call is not converted into a normal text message.

### Call

`src/call/` owns the call lifecycle and LiveKit media integration.

For the current product this is only User ↔ Admin. The call is linked to the existing conversation by `conversation_id`/call state. No generic conference abstraction is added.

### Shared helpers/adapters

`src/identity/`, `src/device/`, `src/media/`, `src/supabase/`, diagnostics and platform helpers remain supporting modules. They do not become new product-level systems.

## Call data flow

User/Admin UI → shared Call domain → existing Supabase call authorization/state → production LiveKit token endpoint → LiveKit Cloud room.

The current microphone rule remains locked: user gesture captures the microphone first on iPhone, and the exact captured track is published into LiveKit. Android native speaker/receiver routing remains unchanged unless a future physical-device regression proves it is broken.

## LiveKit productionization

### Replace development token source

Remove frontend use of LiveKit `developmentTokenServer`.

Add one small authenticated backend token endpoint. It must:

1. require a valid Supabase session;
2. resolve the caller identity from the backend, not from arbitrary frontend values;
3. verify that the caller is allowed to join the requested TAPHOA call/conversation;
4. derive the LiveKit room and participant identity from verified call/profile/device data;
5. return only the token/server values required for that call.

LiveKit secrets must never be shipped to the browser.

### Bundle LiveKit with Vite

Add `livekit-client` as a normal dependency and import it from TypeScript. Remove the jsDelivr LiveKit script tags from User/Admin HTML once the bundled SDK path passes tests.

This keeps the LiveKit version controlled by `package-lock.json` and by the existing GitHub Actions build.

## Deployment and domain

Production canonical origin is:

`https://chat.taphoa.xyz/`

The app remains built with Vite base `/`, PWA app id `/`, and GitHub Pages as the hosting engine.

Do not create two independent production origins for the same app. The default GitHub Pages URL is not treated as a second TAPHOA identity/session origin. If GitHub exposes it alongside the custom domain, the intended user-facing origin remains `chat.taphoa.xyz`.

This avoids splitting microphone permission, PWA installation, local storage, Supabase session and device identity across two browser origins.

## GitHub Actions / TypeScript / Vite

Keep the current foundation:

- Node 22 build environment;
- `npm ci`;
- `tsc -b` strict typecheck;
- `vitest run`;
- Vite production build;
- GitHub Pages deploy only from `main`;
- separate Android APK workflow that first verifies/builds the web app, then generates Capacitor Android and the native route bridge.

No framework migration is required.

## Diagnostic/test pages

`mic-test`, `audio-lab`, and `call-minimal` are development/diagnostic surfaces, not product surfaces.

They may remain temporarily while LiveKit production auth is verified. After the production call path passes regression, remove them from the normal production build inputs or gate them as diagnostics. Do not delete diagnostic code before the new token path is proven.

## Cloudflare TURN

The old Cloudflare TURN/ICE helper is legacy for the previous raw WebRTC path. It is not part of the current LiveKit media transport.

Do not delete it in the first productionization change. Mark/leave it unused until the LiveKit production token path, User/Admin audio regression and deployed build all pass. Cleanup is a separate low-risk follow-up.

## Regression gates

A productionization change is complete only when all of the following pass:

- TypeScript typecheck;
- full Vitest suite;
- Vite production build;
- GitHub Pages workflow;
- Android debug workflow;
- User ↔ Admin chat still sends/receives;
- User ↔ Admin audio call still connects both ways;
- iPhone microphone capture order is unchanged;
- mute still works;
- Android native speaker/receiver route is unchanged and works;
- LiveKit token cannot be requested for an unauthorized call/identity;
- User and Admin continue to use the same shared Call domain rather than separate call implementations.

## Implementation order

1. Add production token contract/backend endpoint and tests.
2. Change `src/call/` to obtain LiveKit credentials from that endpoint; do not alter mic/audio routing.
3. Add `livekit-client` dependency and switch User/Admin to the bundled SDK.
4. Run full web and Android verification.
5. Only after PASS, remove diagnostic entries from normal production build and mark legacy TURN code for later cleanup.

## Non-goals / anti-complexity rules

- No new event bus.
- No repository/service layer just for naming symmetry.
- No separate Admin Call engine and User Call engine.
- No generic multi-party participant model.
- No rewrite of Chat, Call, Vite, PWA or Android audio routing.
- No cleanup mixed into the production token change unless required for correctness.
