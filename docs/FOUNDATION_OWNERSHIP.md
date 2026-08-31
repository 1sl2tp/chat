# Foundation Ownership Rules

This file is the canonical ownership map for the Chat Web/PWA foundation.

## Core rule

Every state and decision has exactly one owner. Other modules may consume or observe that state, but must not duplicate or independently redefine it.

A bug must be repaired at its **Repair Root**: the highest existing owner that is actually responsible for the broken rule. Do not repair an owner bug inside a composition/assembly file merely because that file can see all modules.

## Owners

- `src/version.ts`: sole runtime source of truth for the named app version. Build ID comes from CI. Documentation must not maintain a second current-version value.
- `src/compat/`: feature/runtime detection only. It reports what the environment supports; it does not request permissions or control UI.
- `src/permissions/`: permission state and permission-request policy. It is the only place allowed to decide whether a browser permission prompt should be requested.
- `src/viewport/`: visual viewport, keyboard occlusion and viewport geometry. It publishes geometry/state only; it does not scroll conversations or position feature-specific UI.
- App shell / feature UI: owns placement and scrolling using values published by `viewport/`.
- `src/pwa/` + `src/sw.ts`: service-worker registration/update lifecycle, app-shell cache and push event handling.
- `src/storage/`: storage capability/state/schema lifecycle. It is not an authentication/session owner.
- `src/session/`: authentication token/session lifecycle state. Supabase adapters must plug into this owner instead of creating parallel auth state.
- `src/identity/`: resolved application identity/role lifecycle (`guest_customer | registered_customer | admin`) and guest→registered identity preservation. It consumes session/backend facts; it does not own Auth tokens.
- `src/device/`: stable client device identity/key and device labeling. It does not own authentication or call state.
- `src/chat/`: customer chat bootstrap/conversation/message state and orchestration. It consumes `session/`, `identity/`, `device/`, network and backend adapters but does not redefine them.
- `src/admin/`: Admin inbox/selection/support-workspace state only. It consumes resolved Admin identity and the shared chat message runtime; it never owns Auth/session/role resolution or a second message store.
- `src/supabase/`: external Supabase adapter only. It translates Auth/RPC/Realtime APIs into app-owner contracts and must not become a second state owner.
- `src/network/`: connectivity/backend-reachability state. `navigator.onLine` is only an input signal, not the final truth.
- `src/lifecycle/`: foreground/background/page lifecycle state.
- `src/media/`: microphone/audio/WebRTC media support and media state contracts.
- `src/notifications/`: notification/push payload and delivery contracts; browser permission policy remains owned by `permissions/`.
- `src/floating/`: mini-call/PiP capability and presentation contract; it does not own call/media state.
- `src/diagnostics/`: read-only allow-listed observation. Diagnostics never controls app behavior and never becomes a second source of truth.

## Repair-zone rule

Before changing code, write down these four things for the current repair:

1. **Symptom** — what the user actually sees failing.
2. **Repair Root / Owner** — which canonical owner is responsible for that rule.
3. **Allowed repair zone** — files/modules inside that owner that may change.
4. **Assembly boundary** — files that may only wire the owner result and must not receive new policy/state logic.

If the intended change requires putting business/auth/identity/message/viewport policy into an assembly file, stop and move the change back to the correct owner first.

### Canonical repair zones

| Concern / symptom | Repair Root | Normal repair zone | Must NOT be used as the fix owner |
| --- | --- | --- | --- |
| Auth token restore, anonymous sign-in, password sign-in/out, refresh/expiry | `src/session/` + auth adapter contract | `src/session/*`, `src/supabase/auth-*` | `src/main.ts`, route checks, Admin screen, chat screen |
| Guest vs registered customer vs Admin decision | `src/identity/` + backend RPC | `src/identity/*`, `src/supabase/identity-*`, additive DB RPC/RLS | `src/main.ts`, `src/admin/*` UI, `src/chat/*` UI |
| Guest → User 2 must keep profile/conversation/history | `src/identity/` + DB identity mapping | `src/identity/upgrade*`, identity RPC/migration | screen code, message runtime, route code |
| Which surface is allowed after identity is known | app startup policy | `src/app/startup.ts` and its tests | feature screens adding their own role decisions |
| Admin inbox/detail selection | `src/admin/` | `src/admin/*`, `src/supabase/admin-backend.ts` | `main.ts`, shared message store |
| Message load/send/realtime/dedupe/subscription | `src/chat/message-runtime.ts` | shared chat message runtime/backend | Admin-specific message array/store, UI screen state |
| Customer support conversation bootstrap | `src/chat/` | `src/chat/bootstrap*`, chat backend contract | Admin bootstrap, `main.ts` |
| Keyboard height / visual viewport geometry | `src/viewport/` | `src/viewport/*` | composer margins, fixed pixel hacks in individual screens |
| Chat scroll response to keyboard | chat UI scroll owner | chat scroll controller/UI layout | `viewport/` forcing feature scroll position |
| iOS input auto-zoom | UI component typography contract | shared/mobile form CSS owner | JS zoom hacks, viewport disabling zoom |
| Safe area / shell placement | shell/layout owner | global shell + relevant layout CSS | individual leaf controls compensating with margins |
| PWA update/cache | `src/pwa/`, `src/sw.ts` | PWA/SW files | feature UI, Auth/session code |

## Assembly files are intentionally thin

The following are **composition boundaries**, not convenient repair locations:

- `src/main.ts`
- route/entry hosts
- top-level app/screen hosts
- feature mount functions whose job is only DOM composition

They may:

- install foundation controllers;
- ask the canonical startup owner for a result;
- mount/unmount the selected surface;
- pass already-resolved contracts/actions into a feature.

They must not:

- infer `admin` from `authenticated`;
- decide whether anonymous Auth is allowed;
- translate Guest→User2 identity themselves;
- duplicate message subscription state;
- calculate keyboard geometry;
- contain fallback business rules for a broken owner;
- accumulate special cases such as `if iPhone`, `if admin`, `if guest` when those facts already have canonical owners.

**Size-growth warning:** if an assembly file needs repeated new branches to support each new feature, treat that as evidence that policy has leaked out of an owner. Refactor the decision into the owner before continuing.

## Cha → Mẹ → Con → Cháu repair rule

For UI/geometry defects, trace the hierarchy before changing CSS or DOM:

1. Cha / shell: viewport, available region, responsive tracks, visibility.
2. Mẹ / region owner: placement, sizing, scrolling, safe-area responsibility.
3. Con / component: its internal contract.
4. Cháu / leaf: typography/icon/value only when the defect truly belongs there.

Never use a child padding/margin/font tweak to compensate for a broken parent geometry rule. Compare/correct siblings only at the same hierarchy level.

## Change rule

Before adding or modifying functionality:
1. Classify the change by owner and write the Repair Root.
2. Reuse the existing owner if one exists.
3. Declare the allowed repair zone before editing.
4. Treat composition/assembly files as forbidden repair roots unless the defect is genuinely composition itself.
5. Do not create a second state machine for the same concern.
6. Do not move business/UI decisions into `compat/` or `diagnostics/`.
7. Do not make a child/leaf compensate for a parent/owner error.
8. If a change starts making `main.ts`, a route host, or screen host larger with policy branches, stop and relocate that policy to the owner.
9. A user-visible deployed source change must update `APP_VERSION` in `src/version.ts`; the screen must show named version + build ID.
10. CI must pass before the commit is moved to `main`.

## Mobile-first rule

Primary release gates are iOS Safari/Home Screen Web App and Android Chrome/installed PWA. Windows and macOS remain compatibility targets using the same codebase and a simple wider layout.

Mobile defects must still follow Repair Root ownership: iPhone/Android differences are environment inputs, not permission to add device-specific patches in arbitrary feature leaves.
