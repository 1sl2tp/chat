# TAPHOA PWA Call Experience — iOS + Android

Date: 2026-09-01
Status: design for approval
Scope: PWA iOS Home Screen + PWA Android/Chrome; keep Android APK compatible; no native iOS/CallKit in this phase.

## 1. Goal

Turn the current working LiveKit audio call into a small but complete User ↔ Admin calling experience without adding a large telephony architecture.

The user-visible target is:

- incoming call is visible even when the PWA is not open, where the platform supports Web Push;
- foreground incoming calls ring; supported devices vibrate;
- caller hears ringback while the peer is ringing;
- full call can minimize to a top bar and can hide to a small floating restore button without ending media;
- one profile can be in only one live call at a time; a second caller receives a simple busy result rather than a second CallSession;
- LiveKit reconnecting/reconnected is surfaced in UI;
- returning from iOS/Android background attempts to resume/reassert audio instead of creating another call;
- existing microphone capture order, iPhone audio routing, Android native audio routing and production LiveKit token flow remain locked.

## 2. Existing foundation to reuse

Do not rebuild what already exists.

### Frontend

- `VoiceCallSession` is the single call owner.
- `VoiceCallState.display` already supports `full | compact | hidden`.
- `mountVoiceCallUi()` already renders full screen, compact top bar and hidden restore button.
- `LiveKitVoiceMedia` owns LiveKit media and remote audio.
- `src/sw.ts` already handles `push`, `showNotification()` and `notificationclick`.
- notification capability helpers and payload parsing already exist under `src/notifications/`.

### Database/backend

Reuse current `chat_calls` lifecycle and existing stale cleanup.

Already present:

- `chat_call_push_subscriptions` keyed to profile/device;
- `chat_upsert_call_push_subscription(...)`;
- `chat_delete_call_push_subscription(...)`;
- `chat_call_device_targets`;
- VAPID public/private/subject values already stored in Supabase Vault;
- `chat_start_voice_call`, `chat_accept_voice_call`, `chat_decline_voice_call`, `chat_cancel_voice_call`, `chat_end_voice_call`;
- `chat_private.expire_stale_voice_calls()` already changes timed-out ringing calls to `missed` and timed-out connecting calls to `failed`.

No new push-subscription table is required.

## 3. Architecture boundary

Keep the existing small architecture:

`User UI / Admin UI -> VoiceCallSession -> LiveKitVoiceMedia`

Supporting adapters only:

- `CallAlertController`: foreground ringtone, ringback, best-effort vibration;
- `CallPushRegistration`: Web Push permission/subscription synchronization;
- one Supabase Edge Function `taphoa-call-push`: send an incoming-call Web Push after a call is created.

These helpers never become a second Call state machine. They react to `VoiceCallSession` and backend call state.

## 4. Incoming notification flow

### Subscription

Push permission is never requested automatically on page load.

When push is available and not enabled, User/Admin UI shows one compact action such as `Bật thông báo cuộc gọi`.

On user tap:

1. request Notification permission;
2. wait for the existing service worker registration;
3. obtain only the public VAPID key from a minimal authenticated backend/RPC;
4. call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`;
5. send endpoint + `p256dh` + `auth` to existing `chat_upsert_call_push_subscription` for the current device.

If permission is already granted, boot may silently synchronize an existing subscription. If permission is denied, do not repeatedly prompt.

### Sending

After `chat_start_voice_call` successfully creates a ringing `call_id`, the caller invokes `taphoa-call-push` fire-and-forget.

The Edge Function:

1. authenticates the caller;
2. verifies `call_id` exists, caller matches and state is still `ringing`;
3. reads the callee's registered push subscriptions;
4. reads VAPID credentials server-side only;
5. sends a visible incoming-call Web Push to each target;
6. removes expired subscriptions on terminal push-provider responses such as 404/410.

Push failure must never cancel the call. Foreground polling remains a fallback.

Notification payload stays small:

- title: `Cuộc gọi đến`;
- body: caller display name;
- tag: `call:<call_id>`;
- navigation: `/admin/` when target is Admin, `/` when target is User;
- badge: optional.

The service worker remains the sole notification display/click owner.

## 5. Ringing, ringback and vibration

Add one `CallAlertController` shared by User and Admin.

State mapping:

- `incoming` -> start incoming ringtone; request vibration where `navigator.vibrate` is supported;
- `outgoing` while backend state is `ringing` -> play ringback tone;
- `connecting`, `active`, `idle`, `error` -> stop all alert sounds/vibration immediately.

Use generated Web Audio tones rather than adding ringtone binary assets.

Audio is best-effort because browsers can block autoplay. The controller is armed on normal user gestures. On locked/background iOS PWA, the OS Web Push notification is the alert path; do not attempt to play a custom ringtone from the service worker.

Vibration is feature-detected. Android can use it where supported; iOS may ignore the Web vibration API, so iOS relies on normal system notification haptics/sound when allowed by the user.

## 6. Minimize / hide / floating

Keep the current single-session display model; do not create another floating-call store.

- Full -> `compact`: top call bar remains visible over Chat.
- Full/compact -> `hidden`: small floating call restore button remains visible.
- Compact/hidden -> full: restores the same CallSession.
- None of these transitions disconnect LiveKit, stop the microphone or mutate backend call state.

Incoming calls open full by default. Once accepted, the user may minimize/hide normally.

Only small visual polish and regression tests are needed because this mechanism already exists.

## 7. Busy / simple call waiting rule

Do not implement Hold or two simultaneous calls.

For this small User ↔ Admin system, `call waiting` means a deterministic busy response:

- if caller is already in `ringing | accepted | connecting | connected`, return `caller_busy`;
- if target is already in one of those states with any peer, return `peer_busy`;
- caller UI shows `Đang có cuộc gọi khác` or `<peer> đang bận`;
- no second LiveKit room is joined.

Strengthen `chat_start_voice_call` with transaction advisory locking on the two profile IDs so concurrent users cannot race into two calls with the same Admin.

The existing one-live-pair index remains as an additional safety net.

## 8. Reconnect and background/resume

Extend the media callbacks with explicit `onReconnecting` and `onReconnected` from LiveKit.

Add `reconnecting` as a UI phase:

- LiveKit `Reconnecting` -> `Đang kết nối lại…`;
- LiveKit `Reconnected` -> restore `active` when the backend call is still live;
- do not create a new `call_id` during reconnect.

On `visibilitychange/pageshow` when the PWA returns to foreground during a live call:

1. poll the authoritative backend call state;
2. if call is still live, reassert selected phone route and resume remote audio through the existing media owner;
3. let LiveKit reconnect rather than creating a new Room/CallSession;
4. if backend call is terminal, reset UI to idle.

Do not promise that iOS PWA can preserve an active WebRTC call indefinitely while the device is locked. Web Push can wake/notify a Home Screen web app, but native-style guaranteed background VoIP requires native iOS APIs and is explicitly out of scope.

The implementation may adjust LiveKit page-leave handling only if tests/instrumentation show the SDK is actively disconnecting on PWA page lifecycle events. Do not make speculative audio-route changes.

## 9. PWA platform behavior

### iOS Home Screen PWA

- Web Push is supported for installed Home Screen web apps after user-granted permission.
- Notification can appear on Lock Screen/Notification Center.
- foreground custom ringtone is best-effort;
- vibration API is not treated as guaranteed;
- active call background/lock survival is best-effort; reconnect-on-resume is required.

### Android PWA/Chrome

- Web Push subscription and incoming notification;
- foreground ringtone/ringback;
- vibration where supported;
- LiveKit reconnect/resume;
- default Android web speaker behavior remains unchanged.

### Android APK

The same CallSession changes may run in the Capacitor build, but native Android audio routing remains untouched. No new native Android call framework is introduced in this phase.

## 10. Failure handling

- Push unavailable/denied: call still works while app is open through current polling.
- Push send failure: log/diagnose but do not fail `startOutgoing`.
- Expired push endpoint: remove subscription server-side.
- Ringtone blocked: UI and push notification still identify the incoming call.
- Vibration unsupported: no error shown.
- Reconnect fails: existing backend state decides whether to end/reset; do not silently create another call.
- Busy: display a specific user-facing reason and remain idle.

## 11. Testing gates

TDD for each change, then full CI.

Required automated gates:

- push payload parsing and safe navigation;
- permission/subscription normalization;
- push registration upsert uses current device ID;
- call push sender verifies caller + ringing state;
- busy rule prevents one profile from entering multiple active calls;
- ringtone/ringback stop on every transition away from ringing;
- vibration is feature-detected;
- full/compact/hidden transitions do not call media disconnect;
- LiveKit Reconnecting/Reconnected map to Call state without new call creation;
- visibility/pageshow resume reuses current call;
- existing iPhone microphone capture-order tests remain unchanged/PASS;
- existing Android native audio-route tests remain unchanged/PASS;
- Web/PWA workflow PASS;
- Android APK workflow PASS.

Physical smoke matrix after deployment:

1. iPhone Home Screen PWA -> Android PWA/APK;
2. Android PWA/APK -> iPhone Home Screen PWA;
3. app foreground incoming call;
4. app background / iPhone lock incoming Web Push;
5. ringtone/ringback; Android vibration; iOS system notification alert;
6. accept, decline, caller cancel;
7. minimize -> compact -> hide -> restore while active;
8. Wi-Fi/mobile interruption -> reconnect;
9. second user calls busy Admin -> busy response, no second session;
10. iPhone lock during an active call -> record actual survival/reconnect behavior; do not claim native-equivalent background VoIP if iOS suspends it.

## 12. Explicit non-goals

Do not add in this phase:

- native iOS app, PushKit or CallKit;
- Hold / swap between two active calls;
- conference/group calling;
- SIP/PSTN;
- another global event bus/store;
- replacement of LiveKit;
- changes to iPhone microphone capture order;
- changes to Android native audio routing;
- deletion/revival of legacy Cloudflare TURN.

## 13. Release target

Next release after implementation: `CHAT-ADMIN-0.11.0`.

Completion means the PWA has a coherent incoming-call experience on iOS/Android, while all browser-dependent behavior degrades safely and the current working media path remains intact.
