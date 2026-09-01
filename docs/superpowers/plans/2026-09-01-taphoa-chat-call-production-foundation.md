# TAPHOA Chat + Call Production Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productionize the existing LiveKit call path while keeping TAPHOA Chat small: separate User/Admin surfaces, one shared Chat domain, one shared Call domain, one canonical production origin.

**Architecture:** Keep the current `VoiceCallSession` as the shared Call owner. Add one authenticated Supabase Edge Function that validates the current profile, active call, and device before minting a LiveKit room token. The browser then connects with those credentials using the same iPhone-first microphone capture and Android native audio-route behavior already proven.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, Supabase JS 2.112.4, Supabase Edge Functions, LiveKit client 2.22.1, LiveKit server SDK 2.18.0, GitHub Actions, GitHub Pages, Capacitor 8 Android.

**Spec:** `docs/superpowers/specs/2026-09-01-taphoa-chat-call-production-foundation-design.md`

## Global Constraints

- User UI and Admin UI remain separate entry surfaces.
- `src/chat/` remains the shared Chat owner; `src/call/` remains the shared Call owner.
- Do not add separate Admin/User call state machines.
- Keep iPhone `getUserMedia()` as the first media operation after Call/Answer and publish the exact captured track.
- Do not change Android native speaker/receiver routing unless a physical-device regression proves it is broken.
- Do not change GitHub Actions, TypeScript, Vite, PWA, or Chat behavior unless required by this productionization.
- Production canonical origin remains `https://chat.taphoa.xyz/` with Vite base `/` and PWA id `/`.
- Cloudflare TURN remains legacy/unused and is not deleted in this plan.
- No group call, conference abstraction, event bus, generic participant framework, or unrelated refactor.
- User-visible deployed code must update `APP_VERSION` in `src/version.ts`.
- Never switch the browser away from the existing development-token path until the production token endpoint is deployed and its required LiveKit secrets exist.

---

## File Structure

**Create**
- `supabase/functions/_shared/livekit-join-policy.ts` — pure authorization/identity derivation for one User ↔ Admin call.
- `supabase/functions/taphoa-livekit-token/index.ts` — authenticated Edge Function that mints a scoped LiveKit JWT.
- `src/call/livekit-join-policy.test.ts` — pure authorization tests for caller/callee/device/state rejection.
- `src/call/livekit-credentials.ts` — browser adapter that invokes the production token Edge Function.
- `src/call/livekit-credentials.test.ts` — token-response validation and invocation tests.
- `src/call/livekit-bundling.test.ts` — regression proving User/Admin HTML no longer loads LiveKit from jsDelivr after cutover.

**Modify**
- `src/call/livekit-config.ts` — keep room naming/host validation; remove development-token-server ownership.
- `src/call/livekit-config.test.ts` — lock the reduced config contract.
- `src/call/livekit-media.ts` — consume already-authorized credentials and use bundled `livekit-client`; preserve all capture/playback/route logic.
- `src/call/voice-session.ts` — fetch production credentials before `media.join()`; no new state machine.
- `package.json` / `package-lock.json` — pin `livekit-client` 2.22.1.
- `index.html` / `admin/index.html` — remove CDN LiveKit scripts after bundled path passes.
- `vite.config.ts` — keep User/Admin production inputs; gate diagnostic inputs after call regression passes.
- `src/deployment.test.ts` — retain canonical-root assertion and add no second production base.
- `src/version.ts` / `src/version.test.ts` — bump named version for the productionized call build.

**Do not modify in this plan**
- `src/call/user-gesture-mic.ts`
- `src/call/audio-route*.ts`
- `src/call/native-android-audio-route.ts`
- `src/call/remote-audio-owner.ts`
- `src/call/ice-config.ts`
- `native/android/AudioRoutePlugin.java`
- Chat message runtime/RPCs unless a regression proves a separate defect.

---

### Task 1: Add the production LiveKit join authorization policy and Edge Function

**Files:**
- Create: `supabase/functions/_shared/livekit-join-policy.ts`
- Create: `supabase/functions/taphoa-livekit-token/index.ts`
- Create: `src/call/livekit-join-policy.test.ts`

**Interfaces:**
- Consumes existing backend RPCs: `chat_current_profile_id()` and `chat_get_active_voice_calls()`.
- Produces Edge Function `taphoa-livekit-token` with request `{ callId: string, deviceId: string }` and response `{ serverUrl: string, participantToken: string }`.
- Requires Supabase Edge Function secrets `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- Uses fixed LiveKit host `wss://taphoa-chat-dvo9mem2.livekit.cloud`.

- [ ] **Step 1: Write failing authorization-policy tests**

Create `src/call/livekit-join-policy.test.ts` with cases that import the pure helper and prove:

```ts
import { describe, expect, it } from 'vitest'
import { authorizeLiveKitJoin } from '../../supabase/functions/_shared/livekit-join-policy'

const call = {
  id: '193ee972-e716-44f7-a1aa-c4285fe532f7',
  caller_profile_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  callee_profile_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  caller_device_id: '11111111-1111-1111-1111-111111111111',
  accepted_device_id: '22222222-2222-2222-2222-222222222222',
  caller_display_name: 'User',
  callee_display_name: 'Admin',
  state: 'accepted',
}

describe('authorizeLiveKitJoin', () => {
  it('authorizes the caller only on the caller device', () => {
    expect(authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.caller_device_id,
      activeCalls: [call],
    })).toMatchObject({
      roomName: `taphoa-call-${call.id}`,
      participantIdentity: `${call.caller_profile_id}-${call.caller_device_id}`,
      participantName: 'User',
    })
  })

  it('authorizes the callee only on the accepted device', () => {
    expect(authorizeLiveKitJoin({
      currentProfileId: call.callee_profile_id,
      callId: call.id,
      deviceId: call.accepted_device_id!,
      activeCalls: [call],
    }).participantName).toBe('Admin')
  })

  it('rejects another device', () => {
    expect(() => authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.accepted_device_id!,
      activeCalls: [call],
    })).toThrow('livekit_device_not_authorized')
  })

  it('rejects ended/non-active calls', () => {
    expect(() => authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.caller_device_id,
      activeCalls: [{ ...call, state: 'ended' }],
    })).toThrow('livekit_call_not_joinable')
  })
})
```

- [ ] **Step 2: Run the policy test and verify RED**

Run: `npx vitest run src/call/livekit-join-policy.test.ts`

Expected: FAIL because `supabase/functions/_shared/livekit-join-policy.ts` does not yet exist.

- [ ] **Step 3: Implement the pure join policy**

Create a pure TypeScript module with this contract:

```ts
export interface ActiveVoiceCallForLiveKit {
  id: string
  caller_profile_id: string
  callee_profile_id: string
  caller_device_id: string
  accepted_device_id: string | null
  caller_display_name: string | null
  callee_display_name: string | null
  state: string
}

export interface AuthorizedLiveKitJoin {
  roomName: string
  participantIdentity: string
  participantName: string
}

export function authorizeLiveKitJoin(input: {
  currentProfileId: string
  callId: string
  deviceId: string
  activeCalls: readonly ActiveVoiceCallForLiveKit[]
}): AuthorizedLiveKitJoin
```

Rules:
- find exactly the requested call in the caller's authorized active-call result;
- allow states `ringing`, `accepted`, `connecting`, `connected`;
- caller profile must use `caller_device_id`;
- callee profile must use non-null `accepted_device_id`;
- reject any profile that is neither caller nor callee;
- room is `taphoa-call-${callId.toLowerCase()}`;
- participant identity is `${profileId.toLowerCase()}-${deviceId.toLowerCase()}`;
- participant name comes from the matching caller/callee display name with fallback `TAPHOA Chat`.

- [ ] **Step 4: Run policy test and verify GREEN**

Run: `npx vitest run src/call/livekit-join-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement the authenticated Edge Function**

Create `supabase/functions/taphoa-livekit-token/index.ts` using:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { AccessToken } from 'npm:livekit-server-sdk@2.18.0'
import { authorizeLiveKitJoin } from '../_shared/livekit-join-policy.ts'

const LIVEKIT_SERVER_URL = 'wss://taphoa-chat-dvo9mem2.livekit.cloud'
```

Behavior:
1. `POST` only; `OPTIONS` returns CORS headers.
2. Require `Authorization` header.
3. Create a Supabase client with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the incoming Authorization header.
4. Call `chat_current_profile_id()` and reject if no profile id.
5. Call `chat_get_active_voice_calls()` using the same authenticated client.
6. Parse body `{ callId, deviceId }`, then call `authorizeLiveKitJoin(...)`.
7. Read `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; return server configuration error if either is absent.
8. Mint a 10-minute token:

```ts
const token = new AccessToken(apiKey, apiSecret, {
  identity: authorized.participantIdentity,
  name: authorized.participantName,
  ttl: '10m',
})
token.addGrant({
  roomJoin: true,
  room: authorized.roomName,
  canPublish: true,
  canSubscribe: true,
  canPublishData: false,
})
const participantToken = await token.toJwt()
```

9. Return `{ serverUrl: LIVEKIT_SERVER_URL, participantToken }`.
10. Use generic 401/403/500 JSON responses; never return API key/secret or raw internal rows.
11. CORS may use `Access-Control-Allow-Origin: *` because JWT + call/device authorization is the security boundary and the Android WebView must remain supported.

- [ ] **Step 6: Deploy the Edge Function with JWT verification enabled**

Deploy `taphoa-livekit-token` to Supabase project `gcnoahqsrquxkwkjbuxy` with `verify_jwt=true`, including both the entrypoint and `_shared/livekit-join-policy.ts`.

Deployment gate: do not cut over frontend credentials until `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are configured in the Supabase project and an authenticated User/Admin call can receive a token.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/functions/_shared/livekit-join-policy.ts \
  supabase/functions/taphoa-livekit-token/index.ts \
  src/call/livekit-join-policy.test.ts
git commit -m "feat(call): add authorized LiveKit token endpoint"
```

---

### Task 2: Add the browser LiveKit credentials adapter and wire it into the shared Call owner

**Files:**
- Create: `src/call/livekit-credentials.ts`
- Create: `src/call/livekit-credentials.test.ts`
- Modify: `src/call/livekit-config.ts`
- Modify: `src/call/livekit-config.test.ts`
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/livekit-media.ts`

**Interfaces:**
- Produces `fetchLiveKitCredentials(client, callId, deviceId): Promise<LiveKitCredentials>`.
- `LiveKitVoiceMedia.join()` consumes only `{ serverUrl, participantToken }`; it no longer creates or requests a development token.
- `VoiceCallSession` remains the sole call lifecycle owner and owns the Supabase client already needed for credential fetching.

- [ ] **Step 1: Write failing credentials-adapter tests**

Test a fake Supabase client whose `functions.invoke` records calls. Lock these behaviors:
- calls `taphoa-livekit-token` with body `{ callId, deviceId }`;
- rejects invocation errors as `livekit_credentials_failed:<message>`;
- rejects empty token;
- rejects a server host other than `taphoa-chat-dvo9mem2.livekit.cloud`.

- [ ] **Step 2: Run the credentials tests and verify RED**

Run: `npx vitest run src/call/livekit-credentials.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement `livekit-credentials.ts`**

Use this public contract:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertLiveKitServerUrl } from './livekit-config'

export interface LiveKitCredentials {
  serverUrl: string
  participantToken: string
}

export async function fetchLiveKitCredentials(
  client: SupabaseClient,
  callId: string,
  deviceId: string,
): Promise<LiveKitCredentials>
```

Implementation invokes `client.functions.invoke('taphoa-livekit-token', { body: { callId, deviceId } })`, validates `serverUrl` with `assertLiveKitServerUrl`, validates non-empty `participantToken`, and returns only those two values.

- [ ] **Step 4: Remove development-token-server config ownership**

Change `src/call/livekit-config.ts` so it keeps:
- `LIVEKIT_EXPECTED_HOST`;
- `liveKitRoomName(callId)` for diagnostics and deterministic room display;
- `assertLiveKitServerUrl(serverUrl)`.

Remove `LIVEKIT_TOKEN_SERVER_ID` and browser-side `liveKitParticipantIdentity()` because server authorization now derives participant identity.

Update `src/call/livekit-config.test.ts` accordingly.

- [ ] **Step 5: Wire `VoiceCallSession` → credentials adapter → media**

In `joinLiveKit(callId, context)`:

```ts
const credentials = await fetchLiveKitCredentials(this.client, callId, context.deviceId)
await this.media.join(credentials)
```

Keep the existing microphone sequence untouched: `startOutgoing()`/`accept()` must still call `this.media.beginUserGesture()` before awaiting RPC/network work.

- [ ] **Step 6: Simplify `LiveKitVoiceMedia.join()` without changing media behavior**

Replace the join context with:

```ts
export interface LiveKitJoinCredentials {
  serverUrl: string
  participantToken: string
}
```

Inside `join()` keep this order:
1. await the already-started microphone capture;
2. apply current phone route;
3. ensure room;
4. validate server URL;
5. `room.connect(serverUrl, participantToken)`;
6. publish the exact captured microphone track;
7. set joined state.

Do not modify remote audio ownership, route replay, mute, Android native bridge, or iPhone capture logic.

- [ ] **Step 7: Run focused Call tests**

Run:

```bash
npx vitest run \
  src/call/livekit-credentials.test.ts \
  src/call/livekit-config.test.ts \
  src/call/user-gesture-mic.test.ts \
  src/call/remote-audio-owner.test.ts \
  src/call/audio-playback.test.ts \
  src/call/audio-route.test.ts \
  src/call/native-android-audio-route.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/call/livekit-credentials.ts src/call/livekit-credentials.test.ts \
  src/call/livekit-config.ts src/call/livekit-config.test.ts \
  src/call/livekit-media.ts src/call/voice-session.ts
git commit -m "feat(call): use authenticated LiveKit credentials"
```

---

### Task 3: Bundle LiveKit client through Vite and remove CDN runtime ownership

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/call/livekit-media.ts`
- Modify: `index.html`
- Modify: `admin/index.html`
- Create: `src/call/livekit-bundling.test.ts`

**Interfaces:**
- Consumes `livekit-client` version `2.22.1`, the exact version already used by the deployed CDN path.
- Produces no new product API; this is packaging/runtime ownership only.

- [ ] **Step 1: Write the bundling regression test**

Use Node `fs` in Vitest to assert:
- `package.json` has `dependencies['livekit-client'] === '2.22.1'`;
- `index.html` does not contain `cdn.jsdelivr.net/npm/livekit-client`;
- `admin/index.html` does not contain `cdn.jsdelivr.net/npm/livekit-client`.

- [ ] **Step 2: Run bundling test and verify RED**

Run: `npx vitest run src/call/livekit-bundling.test.ts`

Expected: FAIL because LiveKit is still loaded from jsDelivr and is not in `package.json`.

- [ ] **Step 3: Pin the existing LiveKit client version**

Run: `npm install --save-exact livekit-client@2.22.1`

This must update both `package.json` and `package-lock.json`.

- [ ] **Step 4: Replace `window.LivekitClient` with normal TypeScript imports**

In `src/call/livekit-media.ts`, import the SDK directly:

```ts
import {
  Room,
  RoomEvent,
  Track,
  supportsAudioOutputSelection,
} from 'livekit-client'
```

Replace the custom global SDK lookup with those imports. Keep only minimal local structural types where needed for tests or DOM ownership; do not add a new SDK wrapper layer.

- [ ] **Step 5: Remove CDN scripts from both product HTML entries**

Delete only:

```html
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2.22.1/dist/livekit-client.umd.min.js"></script>
```

from `index.html` and `admin/index.html`. Keep their separate TypeScript entry scripts unchanged.

- [ ] **Step 6: Run bundling test, focused Call tests, typecheck and Vite build**

Run:

```bash
npx vitest run src/call/livekit-bundling.test.ts src/call/user-gesture-mic.test.ts src/call/remote-audio-owner.test.ts
npm run typecheck
npm run build
```

Expected: all PASS and Vite emits separate User/Admin entries with LiveKit bundled through dependency chunks.

- [ ] **Step 7: Commit Task 3**

```bash
git add package.json package-lock.json src/call/livekit-media.ts \
  src/call/livekit-bundling.test.ts index.html admin/index.html
git commit -m "build(call): bundle LiveKit client with Vite"
```

---

### Task 4: Keep production build small and keep diagnostic surfaces out of normal product inputs

**Files:**
- Modify: `vite.config.ts`
- Test: existing full build plus one focused config/source regression test if required.

**Interfaces:**
- Production inputs remain `index.html` and `admin/index.html`.
- Diagnostic inputs are available only when `VITE_INCLUDE_DIAGNOSTICS=true`.

- [ ] **Step 1: Add a failing build-config regression test**

Add a small source-level test under `src/deployment.test.ts` or a new `src/deployment-inputs.test.ts` proving the default production input set contains only `user` and `admin`, while diagnostics are enabled only by `VITE_INCLUDE_DIAGNOSTICS=true`.

- [ ] **Step 2: Run the test and verify RED**

Run the focused deployment test. Expected: FAIL because diagnostics are currently unconditional Rollup inputs.

- [ ] **Step 3: Gate diagnostic Rollup entries**

In `vite.config.ts` construct inputs so default production is:

```ts
{
  user: 'index.html',
  admin: 'admin/index.html',
}
```

When `process.env.VITE_INCLUDE_DIAGNOSTICS === 'true'`, add:

```ts
{
  audioLab: 'audio-lab/index.html',
  minimalCall: 'call-minimal/index.html',
  micTest: 'mic-test/index.html',
}
```

Do not delete diagnostic source files in this task.

- [ ] **Step 4: Run default and diagnostic builds**

Run:

```bash
npm run build
VITE_INCLUDE_DIAGNOSTICS=true npm run build
```

Expected: both PASS; default product build exposes only User/Admin Vite entry pages, while explicit diagnostics build still works.

- [ ] **Step 5: Commit Task 4**

```bash
git add vite.config.ts src/deployment*.test.ts
git commit -m "build: gate call diagnostics outside production"
```

---

### Task 5: Version, full verification, deploy, and physical-device regression gate

**Files:**
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Verify: `.github/workflows/pages.yml`
- Verify: `.github/workflows/android-apk.yml`
- Verify deployment: `https://chat.taphoa.xyz/`
- Verify Admin: `https://chat.taphoa.xyz/admin/`

**Interfaces:**
- Named version becomes `CHAT-ADMIN-0.10.0`.
- Build id continues to come from GitHub SHA.

- [ ] **Step 1: Update named app version with test**

Change:

```ts
export const APP_VERSION = 'CHAT-ADMIN-0.10.0' as const
```

Update `src/version.test.ts` expected label accordingly.

- [ ] **Step 2: Run complete local-equivalent verification**

Run:

```bash
npm ci
npm run typecheck
npm run test
npm run build
```

Expected: all PASS. Baseline before this plan was 71 test files / 159 tests; the new suite must pass with a larger count and no regression.

- [ ] **Step 3: Confirm no forbidden changes**

Review the diff and verify:
- no changes to `user-gesture-mic.ts` capture order;
- no changes to Android native route implementation;
- no changes to Cloudflare TURN helper behavior;
- User and Admin still instantiate the same shared `VoiceCallSession`;
- no second Chat/Call state machine was introduced.

- [ ] **Step 4: Push the implementation commits and wait for GitHub Pages CI**

Required Pages job results:
- Checkout PASS;
- Node setup PASS;
- `npm ci` PASS;
- Typecheck/test/build PASS;
- Configure Pages PASS;
- Upload artifact PASS;
- Deploy PASS;
- environment URL remains `https://chat.taphoa.xyz/`.

- [ ] **Step 5: Wait for Android debug CI**

Required Android job results:
- web verify/build PASS;
- Capacitor container generation PASS;
- native route injection PASS;
- Gradle debug APK PASS;
- APK artifact upload PASS.

- [ ] **Step 6: User/Admin live regression**

On deployed production token path verify one complete User ↔ Admin call:
1. User can send/receive chat messages before and after a call.
2. User → Admin call rings, accepts, connects, and has two-way audio.
3. Admin → User call rings, accepts, connects, and has two-way audio.
4. Mute works.
5. iPhone microphone still captures without changing the user-gesture order.
6. iPhone speaker toggle remains behaviorally stable.
7. Android APK receiver/speaker route remains functional.
8. Ending a call returns both sides to idle and the next call can start.

If any item fails, do not alter unrelated owners; gather evidence from the existing call diagnostics and repair the failing owner only.

- [ ] **Step 7: Commit version/verification metadata**

```bash
git add src/version.ts src/version.test.ts
git commit -m "chore: release production LiveKit call foundation"
```

---

## Deployment Secret Gate

The only external prerequisite not stored in Git is the LiveKit signing credential. Before Task 2 cuts the browser over to the production endpoint, Supabase project `gcnoahqsrquxkwkjbuxy` must contain:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

These values must never be committed, displayed in logs, returned to the browser, or copied into Vite environment variables. The current tools can deploy the Edge Function but do not expose a secret-management action, so execution must verify that these secrets are already configured or obtain an approved way to configure them before frontend cutover.

## Rollback

Rollback is intentionally simple:

1. Before frontend cutover, the current deployed build remains unchanged while the new Edge Function can exist unused.
2. If bundled LiveKit causes a build/runtime regression, revert only the bundling commit; the CDN build remains the previous known-good path.
3. If production token auth fails after cutover, revert the credentials-wiring commit to the last known-good LiveKit development-token build while keeping the backend function available for diagnosis.
4. Never roll back by changing iPhone mic capture order, Android native route, Chat message runtime, or re-enabling raw WebRTC/Cloudflare TURN.

## Plan Self-Review

- Spec coverage: User/Admin separation, shared Chat/Call ownership, production token auth, Vite bundling, canonical domain, diagnostic gating, CI, Android, and TURN legacy handling are all covered.
- Scope: no database migration is required; existing authenticated RPCs `chat_current_profile_id()` and `chat_get_active_voice_calls()` provide the authorization inputs needed for the small User ↔ Admin product.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Type consistency: Edge Function request is `{ callId, deviceId }`; browser credentials response is `{ serverUrl, participantToken }`; `LiveKitVoiceMedia.join()` consumes exactly that response shape.
