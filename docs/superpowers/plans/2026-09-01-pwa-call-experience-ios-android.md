# PWA Call Experience iOS + Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing User ↔ Admin audio-call experience for PWA iOS and PWA/Android with foreground ringing, Web Push incoming-call notifications, simple busy handling, minimized/hidden call UI, and explicit reconnect/background recovery.

**Architecture:** Keep `VoiceCallSession` as the only call state owner and `LiveKitVoiceMedia` as the only media owner. Reuse the already-deployed `taphoaxyz-call-push` Edge Function, existing push subscription table/RPCs, Supabase Vault VAPID keys, and current service worker; add only small adapters for push registration, push dispatch, and call alerts. No native iOS/CallKit, no Hold/multi-call state machine, and no second notification subsystem.

**Tech Stack:** TypeScript strict, Vite PWA, Vitest, Supabase/Postgres RPC + Edge Functions, Web Push/VAPID, LiveKit client 2.22.1, Web Audio/Vibration APIs where supported.

**Spec:** `docs/superpowers/specs/2026-09-01-pwa-call-experience-ios-android-design.md`

## Global Constraints

- Scope is PWA iOS Home Screen + PWA Android/Chrome; Android APK must remain compatible.
- Do not add native iOS/CallKit in this phase.
- Do not alter the locked iPhone microphone capture ordering: `getUserMedia()` must remain the first media operation on Call/Accept user gesture.
- Do not alter the proven Android native audio-route implementation.
- Do not replace the production LiveKit token flow introduced in `CHAT-ADMIN-0.10.0`.
- Reuse `chat_call_push_subscriptions`, `chat_upsert_call_push_subscription`, `chat_delete_call_push_subscription`, and VAPID values already stored in Supabase Vault.
- Reuse deployed Edge Function slug `taphoaxyz-call-push`; do not create a parallel push sender.
- Push permission must never be requested automatically on page load. It may only be requested from an explicit user action.
- Ringtone and vibration are best-effort browser capabilities. iOS PWA Lock Screen notification behavior comes from Web Push/OS; do not claim background VoIP equivalence.
- One profile may participate in only one live call at a time. A second call receives a simple busy result; no Hold/call-waiting stack in this phase.
- Existing `full | compact | hidden` display modes remain the call UI contract.
- Production release target after all gates pass: `CHAT-ADMIN-0.11.0`.

---

## File Map

**Create**
- `src/notifications/call-push-registration.ts` — browser Web Push permission/subscription owner.
- `src/notifications/call-push-registration.test.ts` — permission/subscription contract tests.
- `src/notifications/call-push-send.ts` — non-blocking invoke adapter for incoming-call push.
- `src/notifications/call-push-send.test.ts` — push invoke contract tests.
- `src/call/call-alert-controller.ts` — ringtone, ringback, vibration lifecycle; no call state ownership.
- `src/call/call-alert-controller.test.ts` — alert transition tests.
- `src/call/ui.test.ts` — full/compact/hidden and reconnect/busy presentation regression tests.
- `supabase/functions/taphoaxyz-call-push/index.ts` — source-controlled mirror of the currently deployed sender, with small payload/navigation hardening.
- `supabase/migrations/20260901_call_single_live_profile.sql` — global one-live-call-per-profile policy.

**Modify**
- `src/call/voice-session.ts` — connect push dispatch, alerts, reconnect phase and foreground recovery.
- `src/call/livekit-media.ts` — expose reconnect/reconnected callbacks and foreground audio reassertion only.
- `src/call/ui.ts` — reconnect/busy copy and correct error dismissal.
- `src/user-main.ts` — explicit call-notification enable button and push registration sync.
- `src/admin-main.ts` — same explicit notification enable flow for Admin.
- `src/user.css` / `src/admin.css` only if the small notification action needs layout rules; do not redesign either interface.
- `src/version.ts` / `src/version.test.ts` — release label `CHAT-ADMIN-0.11.0`.

---

### Task 1: Web Push Registration Adapter + Explicit Enable UI

**Files:**
- Create: `src/notifications/call-push-registration.ts`
- Create: `src/notifications/call-push-registration.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/admin-main.ts`

**Interfaces:**
- Consumes: authenticated `SupabaseClient`, current `deviceId`, existing service worker registration, existing RPC `chat_upsert_call_push_subscription`.
- Produces:
  - `CallPushState = 'unsupported' | 'prompt' | 'enabled' | 'denied' | 'error'`
  - `class CallPushRegistration`
  - `getState(): CallPushState`
  - `subscribe(listener: (state: CallPushState) => void): () => void`
  - `sync(): Promise<void>`
  - `enableFromUserGesture(): Promise<void>`

- [ ] **Step 1: Write failing adapter tests**

Test these exact behaviors with injected browser dependencies rather than global mutation:

```ts
it('never requests permission during sync', async () => {
  const permission = vi.fn(async () => 'granted' as NotificationPermission)
  const registration = createRegistration({ notificationPermission: 'default', requestPermission: permission })
  await registration.sync()
  expect(permission).not.toHaveBeenCalled()
  expect(registration.getState()).toBe('prompt')
})

it('requests permission only from enableFromUserGesture and stores the subscription', async () => {
  const registration = createRegistration({ notificationPermission: 'default', requestPermission: async () => 'granted' })
  await registration.enableFromUserGesture()
  expect(rpc).toHaveBeenCalledWith('chat_upsert_call_push_subscription', expect.objectContaining({ p_device_id: DEVICE_ID }))
  expect(registration.getState()).toBe('enabled')
})

it('marks denied permission without trying PushManager.subscribe', async () => {
  const registration = createRegistration({ notificationPermission: 'denied' })
  await registration.sync()
  expect(pushSubscribe).not.toHaveBeenCalled()
  expect(registration.getState()).toBe('denied')
})
```

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/notifications/call-push-registration.test.ts`

Expected: FAIL because `call-push-registration.ts` does not exist.

- [ ] **Step 3: Implement the minimal registration owner**

Use an injected browser boundary so logic is deterministic in Vitest. The implementation flow must be:

```ts
async sync() {
  if (!this.browser.supported()) return this.publish('unsupported')
  if (this.browser.permission() === 'denied') return this.publish('denied')
  if (this.browser.permission() !== 'granted') return this.publish('prompt')
  await this.ensureSubscriptionAndUpsert()
}

async enableFromUserGesture() {
  if (!this.browser.supported()) return this.publish('unsupported')
  const permission = this.browser.permission() === 'granted'
    ? 'granted'
    : await this.browser.requestPermission()
  if (permission !== 'granted') return this.publish(permission === 'denied' ? 'denied' : 'prompt')
  await this.ensureSubscriptionAndUpsert()
}
```

`ensureSubscriptionAndUpsert()` must:
1. `await navigator.serviceWorker.ready`;
2. call `supabase.functions.invoke('taphoaxyz-call-push', { body: { action: 'config' } })` to obtain only `public_key`;
3. use an existing `pushManager.getSubscription()` or create one with `userVisibleOnly: true` and decoded VAPID public key;
4. extract `p256dh` and `auth` using `subscription.getKey(...)`;
5. call existing `chat_upsert_call_push_subscription` with current device id.

Do not return or log endpoint keys beyond what is needed for the RPC.

- [ ] **Step 4: Add one compact explicit enable action to User and Admin**

User header and Admin chat header each get one small button. Copy rules:

```text
prompt/error -> Bật thông báo
shown disabled after success -> Thông báo ✓
denied -> Thông báo bị chặn
unsupported -> hide button
```

The button click calls only `enableFromUserGesture()`. App boot calls `sync()` after authenticated identity/device exists; it must not request permission.

- [ ] **Step 5: Run GREEN + focused existing tests**

Run:
`npm run test -- src/notifications/call-push-registration.test.ts src/notifications/support.test.ts src/pwa/state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notifications/call-push-registration.ts src/notifications/call-push-registration.test.ts src/user-main.ts src/admin-main.ts
git commit -m "feat(call): register PWA incoming call notifications"
```

---

### Task 2: Source-Control Existing Push Sender + Dispatch Incoming Push

**Files:**
- Create: `src/notifications/call-push-send.ts`
- Create: `src/notifications/call-push-send.test.ts`
- Create: `supabase/functions/taphoaxyz-call-push/index.ts`
- Modify: `src/call/voice-session.ts`

**Interfaces:**
- Produces: `sendIncomingCallPush(client: SupabaseClient, callId: string): Promise<void>`.
- Reuses: deployed function slug `taphoaxyz-call-push`, custom bearer verification, `npm:web-push@3.6.7`, Supabase Vault VAPID configuration.

- [ ] **Step 1: Write failing push-dispatch test**

```ts
it('invokes the existing sender with the new call id', async () => {
  await sendIncomingCallPush(client, CALL_ID)
  expect(invoke).toHaveBeenCalledWith('taphoaxyz-call-push', {
    body: { action: 'send', call_id: CALL_ID },
  })
})

it('throws when the Edge Function invoke fails', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('push_failed') })
  await expect(sendIncomingCallPush(client, CALL_ID)).rejects.toThrow('push_failed')
})
```

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/notifications/call-push-send.test.ts`

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement adapter and wire it non-blocking after `chat_start_voice_call`**

In `VoiceCallSession.startOutgoing()`, after a valid `call_id` is returned and before waiting for peer acceptance:

```ts
this.publish({ callId: payload.call_id })
void sendIncomingCallPush(this.client, payload.call_id).catch(() => undefined)
await this.joinLiveKit(payload.call_id, context)
```

Push failure must never fail or delay the LiveKit call path.

- [ ] **Step 4: Put the current deployed Edge Function source into the repository and harden only its notification payload**

Preserve its existing custom authentication and VAPID Vault logic. Change payload building to include:

```ts
{
  type: 'incoming_call',
  call_id: call.id,
  conversation_id: call.conversation_id,
  title: 'Cuộc gọi TAPHOA',
  body: `${callerName} đang gọi cho bạn`,
  navigate: calleeIsAdmin ? './admin/' : './',
  tag: `call-${call.id}`,
  badge: 1,
}
```

Fetch only `display_name` for caller and `is_admin` for callee. Keep TTL 60 and urgency `high`. Continue deleting subscriptions that return 404/410.

Do not create a new Edge Function slug.

- [ ] **Step 5: Deploy `taphoaxyz-call-push` with its existing `verify_jwt=false` setting**

Reason: the existing function performs explicit bearer-token verification with `auth.getUser(token)`. Do not silently change the authorization model in this feature.

- [ ] **Step 6: Run GREEN and call-flow regression tests**

Run:
`npm run test -- src/notifications/call-push-send.test.ts src/call/livekit-production-wiring.test.ts src/call/livekit-credentials.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/notifications/call-push-send.ts src/notifications/call-push-send.test.ts src/call/voice-session.ts supabase/functions/taphoaxyz-call-push/index.ts
git commit -m "feat(call): send PWA incoming call push"
```

---

### Task 3: Foreground Ringtone, Caller Ringback, and Best-Effort Vibration

**Files:**
- Create: `src/call/call-alert-controller.ts`
- Create: `src/call/call-alert-controller.test.ts`
- Modify: `src/call/voice-session.ts`

**Interfaces:**
- Produces:
  - `CallAlertMode = 'silent' | 'incoming' | 'ringback'`
  - `CallAlertController.armAfterMicrophoneGesture(): void`
  - `CallAlertController.sync(state: VoiceCallState): void`
  - `CallAlertController.stop(): void`

- [ ] **Step 1: Write failing state-transition tests**

```ts
it('rings and vibrates only for an incoming ringing call', () => {
  controller.sync(state({ phase: 'incoming' }))
  expect(audio.startIncoming).toHaveBeenCalledOnce()
  expect(vibrate.start).toHaveBeenCalledOnce()
  controller.sync(state({ phase: 'connecting' }))
  expect(audio.stop).toHaveBeenCalled()
  expect(vibrate.stop).toHaveBeenCalled()
})

it('plays ringback for outgoing and stops when connecting', () => {
  controller.sync(state({ phase: 'outgoing' }))
  expect(audio.startRingback).toHaveBeenCalledOnce()
  controller.sync(state({ phase: 'connecting' }))
  expect(audio.stop).toHaveBeenCalled()
})

it('never leaves alerts running after idle/error/dispose', () => {
  controller.sync(state({ phase: 'incoming' }))
  controller.sync(state({ phase: 'idle' }))
  expect(audio.stop).toHaveBeenCalled()
  expect(vibrate.stop).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run RED**

Run: `npm run test -- src/call/call-alert-controller.test.ts`

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement tones without binary media assets**

Use a small Web Audio oscillator pattern rather than copyrighted/audio binary assets:

- incoming: two short tones, pause, repeat;
- ringback: one longer tone, longer pause, repeat;
- stop closes timers/nodes immediately.

Use `navigator.vibrate([350, 180, 350, 900])` in a repeating foreground incoming pattern where supported; `navigator.vibrate(0)` stops it.

AudioContext failures/autoplay restrictions must be swallowed as capability limitations, not converted to call errors.

- [ ] **Step 4: Wire controller into `VoiceCallSession` without violating iPhone mic ordering**

The exact order on Call/Accept must remain:

```ts
this.media.beginUserGesture() // getUserMedia remains FIRST media operation
this.alerts.armAfterMicrophoneGesture()
```

Then state publication may start ringback. Incoming calls discovered by polling may attempt ringtone best-effort; if the browser blocks it, the UI and Web Push notification still function.

Every `publish()` synchronizes alerts after state is updated. `resetToIdle()`, `fail()`, and `dispose()` call `alerts.stop()`.

- [ ] **Step 5: Run GREEN + mic-order regression**

Run:
`npm run test -- src/call/call-alert-controller.test.ts src/call/user-gesture-mic.test.ts src/mic-test/pure-order.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/call/call-alert-controller.ts src/call/call-alert-controller.test.ts src/call/voice-session.ts
git commit -m "feat(call): add PWA ringing and vibration alerts"
```

---

### Task 4: Enforce One Live Call Per Profile + Friendly Busy Result

**Files:**
- Create: `supabase/migrations/20260901_call_single_live_profile.sql`
- Create or Modify: `src/call/voice-session.test.ts`
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/ui.ts`

**Interfaces:**
- Backend start-call results may return `reason: 'caller_busy' | 'peer_busy' | 'call_already_active'`.
- UI must present these as normal call outcomes, not raw backend strings.
- Produces `VoiceCallSession.dismissError(): void` so the current error UI can actually return to idle.

- [ ] **Step 1: Verify RED backend contract before migration**

Read `pg_get_functiondef('public.chat_start_voice_call(uuid,uuid)'::regprocedure)` and assert/document that it does not yet enforce both participants globally with `caller_busy` / `peer_busy`.

Expected: RED — current function only has the per-pair unique-index fallback.

- [ ] **Step 2: Write migration with deterministic participant locking**

`chat_start_voice_call` must:

1. resolve actor and target;
2. acquire advisory transaction locks for both profile UUID strings in deterministic lexical order;
3. call `chat_private.expire_stale_voice_calls()`;
4. if actor already participates in any live call (`ringing|accepted|connecting|connected`), return `{ ok:false, reason:'caller_busy' }`;
5. if target already participates in any live call, return `{ ok:false, reason:'peer_busy' }`;
6. otherwise create the call exactly as today, including device targets.

Do not add Hold or multiple active sessions.

- [ ] **Step 3: Apply migration with Supabase migration tooling**

Use `apply_migration`, not ad-hoc DDL through `execute_sql`.

- [ ] **Step 4: Verify GREEN backend contract**

Re-read the installed function definition and verify it contains the global live-call participant checks and both stable reason codes.

- [ ] **Step 5: Add frontend busy/error regression test and correct dismissal**

Expected user copy:

```text
caller_busy -> Bạn đang có cuộc gọi khác
peer_busy -> Đối phương đang trong cuộc gọi
call_already_active -> Cuộc gọi đã tồn tại
```

Add `dismissError()` that performs a safe reset to idle. Change the existing error banner click from `setDisplay('hidden')` to `dismissError()`; the current error phase is rendered before display mode, so hiding it is not a real dismissal.

- [ ] **Step 6: Run GREEN**

Run: `npm run test -- src/call/voice-session.test.ts src/call/ui.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260901_call_single_live_profile.sql src/call/voice-session.ts src/call/voice-session.test.ts src/call/ui.ts src/call/ui.test.ts
git commit -m "feat(call): enforce simple busy policy"
```

---

### Task 5: Explicit LiveKit Reconnect State + Foreground/Background Recovery

**Files:**
- Modify: `src/call/livekit-media.ts`
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/ui.ts`
- Modify: `src/call/ui.test.ts`
- Modify/Create: `src/call/livekit-media.test.ts` if a focused media callback test is needed.

**Interfaces:**
- Extend `VoiceCallPhase` with `'reconnecting'`.
- Extend `LiveKitMediaCallbacks` with `onReconnecting()` and `onReconnected()`.
- Add `LiveKitVoiceMedia.resumeAfterForeground(): Promise<void>`.
- Add `VoiceCallSession.handleForeground(): Promise<void>` or equivalent internally owned visibility handler.

- [ ] **Step 1: Write failing reconnect presentation and callback tests**

```ts
expect(statusText(state({ phase: 'reconnecting' }))).toBe('Đang nối lại…')
```

Media behavior must prove `RoomEvent.Reconnecting` does not mark the backend call ended and `RoomEvent.Reconnected` restores active state without creating a second room or microphone track.

- [ ] **Step 2: Run RED**

Run: focused reconnect/UI tests.

Expected: FAIL because reconnect callbacks/state do not exist.

- [ ] **Step 3: Implement media reconnect callbacks**

Change current no-op:

```ts
room.on(RoomEvent.Reconnecting, () => this.callbacks.onReconnecting())
room.on(RoomEvent.Reconnected, () => this.callbacks.onReconnected())
```

Do not route `Reconnected` through `onPeerConnected()`; that callback owns initial peer connection and backend connected marking.

`resumeAfterForeground()` must only:

```ts
await this.applySelectedPhoneRoute()
await room.startAudio()
await this.replayAttachedAudio()
```

if a room exists and is joined. It must not reacquire microphone media and must not create a second LiveKit room.

- [ ] **Step 4: Implement shared session recovery**

`VoiceCallSession` transitions active/connecting to `reconnecting` on media reconnect callback. On reconnected it returns to `active` if backend state is connected, otherwise `connecting`.

On `visibilitychange` to visible and `pageshow`, the shared session:

1. polls active calls immediately;
2. calls `resumeAfterForeground()` for active/connecting/reconnecting calls;
3. if playback is blocked, sets existing `audioBlocked=true` so the user can tap `Bật âm thanh`.

Register listeners in `start()` and remove them in `dispose()`; do not duplicate this logic in User and Admin entrypoints.

- [ ] **Step 5: Run GREEN + locked audio regression tests**

Run:
`npm run test -- src/call/ui.test.ts src/call/audio-route-control.test.ts src/call/native-android-audio-route.test.ts src/call/remote-audio-owner.test.ts src/call/user-gesture-mic.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/call/livekit-media.ts src/call/voice-session.ts src/call/ui.ts src/call/ui.test.ts
git commit -m "feat(call): recover PWA calls after reconnect"
```

---

### Task 6: Lock Full → Compact → Hidden/Nổi UX With Regression Tests

**Files:**
- Create/Modify: `src/call/ui.test.ts`
- Modify: `src/call/ui.ts` only if tests reveal a behavioral gap.
- Modify: `src/call/call.css` only for a verified geometry/safe-area problem.

**Interfaces:** Existing contract remains `VoiceCallDisplay = 'full' | 'compact' | 'hidden'`.

- [ ] **Step 1: Add UI regression tests for the existing contract**

Test:

1. full call renders `Thu nhỏ` and `Ẩn`;
2. Thu nhỏ calls `session.setDisplay('compact')` and renders the top bar;
3. hidden renders only the small floating restore control;
4. restore returns to full;
5. compact/hidden never invoke `hangup()`;
6. active top bar still exposes mute and end;
7. incoming full screen exposes Accept/Decline and does not allow the notification enable UI to replace call controls.

- [ ] **Step 2: Run tests and treat any failure as a real regression**

Run: `npm run test -- src/call/ui.test.ts`

Expected: current implementation should already satisfy most of the contract. Fix only demonstrated gaps.

- [ ] **Step 3: Verify iOS safe-area CSS remains correct**

Current full overlay/topbar/hidden controls already use `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`. Do not redesign CSS if geometry tests/physical smoke test show no issue.

- [ ] **Step 4: Commit only if code/test changes exist**

```bash
git add src/call/ui.test.ts src/call/ui.ts src/call/call.css
git commit -m "test(call): lock minimized PWA call UX"
```

---

### Task 7: Release Version, Full CI, Deployment, and Physical PWA Matrix

**Files:**
- Modify: `src/version.test.ts`
- Modify: `src/version.ts`

**Interfaces:** Release label `CHAT-ADMIN-0.11.0`.

- [ ] **Step 1: RED version test**

Change expected release version in `src/version.test.ts` to `CHAT-ADMIN-0.11.0` and run it.

Expected: FAIL because production code is still `CHAT-ADMIN-0.10.0`.

- [ ] **Step 2: GREEN version implementation**

Change only:

```ts
export const APP_VERSION = 'CHAT-ADMIN-0.11.0' as const
```

- [ ] **Step 3: Run full repository verification**

Run through the existing GitHub Actions-equivalent gate:

```bash
npm ci
npm run typecheck
npm run test
npm run build
```

Expected: 0 TypeScript errors, 0 failing tests, Vite production build PASS.

- [ ] **Step 4: Verify forbidden diff scope**

Compare feature branch to its base and verify there are no behavior changes to:

- `src/call/user-gesture-mic.ts`;
- Android native route implementation;
- legacy `src/call/ice-config.ts` / TURN behavior;
- production LiveKit authorization policy except the intended call UX adapters.

- [ ] **Step 5: Deploy updated `taphoaxyz-call-push` and verify function status ACTIVE**

Keep the same slug. Confirm its source/version matches the repository implementation.

- [ ] **Step 6: Merge only after feature-branch CI is GREEN, then verify `main` again**

On `main`, require Web/PWA build/deploy PASS and Android debug APK build PASS before calling the release complete.

- [ ] **Step 7: Physical smoke matrix**

Use the actual production PWA/APK, not diagnostic pages:

| Scenario | iOS Home Screen PWA | Android PWA/Chrome | Android APK | PC Web |
| --- | --- | --- | --- | --- |
| Enable call notifications from explicit button | PASS required | PASS required | if Web Push available | PASS optional |
| Incoming call foreground UI | PASS | PASS | PASS | PASS |
| Incoming Web Push while app not foreground | PASS where iOS Web Push allowed | PASS | platform-dependent | PASS optional |
| Ringtone foreground | best-effort PASS after audio unlocked | PASS | PASS | PASS |
| Vibration | OS notification; Web Vibration not required | PASS where API supported | PASS where API supported | N/A |
| Caller ringback | PASS | PASS | PASS | PASS |
| Full → compact → hidden → restore | PASS | PASS | PASS | PASS |
| Busy second call rejected | PASS | PASS | PASS | PASS |
| Network loss shows `Đang nối lại…` | PASS | PASS | PASS | PASS |
| Return from background resumes/reasserts audio | best-effort + recover | PASS | PASS | PASS |
| Locking iPhone during active WebRTC | document real PWA behavior; reconnect on return required | N/A | N/A | N/A |

Do not mark iOS locked-screen active-call continuity PASS unless the actual PWA test proves it. The required web contract is notification while locked + recovery/reconnect on return, not native background VoIP.

- [ ] **Step 8: Commit release version**

```bash
git add src/version.ts src/version.test.ts
git commit -m "chore: release PWA call experience 0.11.0"
```

---

## Plan Self-Review

- Spec coverage: push registration, incoming push, ringtone/ringback/vibration, busy, existing minimize/hide/nổi UX, reconnect/background recovery, iOS/Android PWA limitations, Android APK compatibility, and final physical matrix are all assigned to concrete tasks.
- No new call state machine is introduced; `VoiceCallSession` remains the owner.
- No duplicate push backend is introduced; the existing `taphoaxyz-call-push` slug is reused and brought under source control.
- Permission prompting is explicitly user-gesture-only.
- The locked mic ordering is explicitly tested after alert integration.
- The iOS limitation is explicit: Web Push on Lock Screen is in scope; native-style continuous VoIP while locked is not promised.
- No Hold/conference/general participant framework is introduced.
