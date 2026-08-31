# Foundation Ownership Rules

This file is the canonical ownership map for the Chat Web/PWA foundation.

## Core rule

Every state and decision has exactly one owner. Other modules may consume or observe that state, but must not duplicate or independently redefine it.

A visible symptom is **not** automatically the repair location. Repair the module that owns the failing state/decision. Do not patch a composition point merely because the error becomes visible there.

## Owners

- `src/version.ts`: sole runtime source of truth for the named app version. Build ID comes from CI. Documentation must not maintain a second current-version value.
- `src/compat/`: feature/runtime detection only. It reports what the environment supports; it does not request permissions or control UI.
- `src/permissions/`: permission state and permission-request policy. It is the only place allowed to decide whether a browser permission prompt should be requested.
- `src/viewport/`: visual viewport, keyboard occlusion and viewport geometry. It publishes geometry/state only; it does not scroll conversations or position feature-specific UI.
- App shell / feature UI: owns placement and scrolling using values published by `viewport/`.
- `src/pwa/` + `src/sw.ts`: service-worker registration/update lifecycle, app-shell cache and push event handling.
- `src/storage/`: storage capability/state/schema lifecycle. It is not an authentication/session owner.
- `src/session/`: authentication/session lifecycle state. Supabase adapters must plug into this owner instead of creating parallel auth state.
- `src/identity/`: resolved application identity/role (`guest_customer`, `registered_customer`, `admin`) and identity lifecycle. Route/UI code must consume this result and must not infer role from Auth phase, URL, or screen state.
- `src/device/`: stable client device identity/key and device labeling. It does not own authentication or call state.
- `src/chat/`: chat bootstrap/conversation/message state and orchestration. It consumes `session/`, `identity/`, `device/`, network and backend adapters but does not redefine them.
- `src/admin/`: Admin inbox/selection/workspace orchestration. It consumes resolved Admin identity and the shared chat message runtime; it must not create its own Auth or message state machine.
- `src/supabase/`: external Supabase adapter only. It translates Auth/RPC/Realtime APIs into app-owner contracts and must not become a second state owner.
- `src/network/`: connectivity/backend-reachability state. `navigator.onLine` is only an input signal, not the final truth.
- `src/lifecycle/`: foreground/background/page lifecycle state.
- `src/media/`: microphone/audio/WebRTC media support and media state contracts.
- `src/notifications/`: notification/push payload and delivery contracts; browser permission policy remains owned by `permissions/`.
- `src/floating/`: mini-call/PiP capability and presentation contract; it does not own call/media state.
- `src/diagnostics/`: read-only allow-listed observation. Diagnostics never controls app behavior and never becomes a second source of truth.

## Repair routing — sửa đúng owner

Use this table before changing code. The place where a symptom is displayed is not necessarily the owner of the bug.

| Symptom / change | Repair owner | Do not repair in |
| --- | --- | --- |
| Login, logout, token restore, expired session | `src/session/` + Auth adapter in `src/supabase/` | `main.ts`, screen UI, PWA |
| Guest/customer/Admin role is wrong or ambiguous | `src/identity/` + backend RPC/RLS | route checks, CSS, Admin screen |
| Admin cannot enter workspace although Auth is valid | `src/identity/`, Admin authorization RPC/RLS, then `src/admin/` boundary | PWA, customer bootstrap, `main.ts` workaround |
| Admin inbox/detail fails | `src/admin/` + Admin backend/RPC | message UI, PWA, global app shell |
| Message load/send/dedupe/subscription fails | canonical `src/chat/message-runtime.ts` + message backend/Realtime | Admin-only message store, screen-local state |
| Customer support bootstrap/conversation is wrong | `src/chat/` + support RPC/backend | Admin startup, `main.ts`, PWA |
| Device identity/label is wrong | `src/device/` | Auth/session or screen state |
| iPhone/Android keyboard height, safe-area, viewport resize | `src/viewport/` for geometry; screen/app CSS for placement | PWA/SW, Auth, message runtime |
| Input zoom/font/tap geometry | owning screen/component CSS, with mobile contract tests | service worker or unrelated global JS |
| UI spacing/layout/scroll | owning parent/composer/screen UI/CSS | backend, session, child leaf hacks |
| Service worker/cache/update/install issue | `src/pwa/` + `src/sw.ts` | Auth, chat runtime, layout CSS |
| Push delivery/payload | `src/notifications/` + PWA/SW event boundary | chat message state machine |
| Audio/mic/WebRTC media flow | `src/media/` and call owner when present | generic UI/PWA/session |

## Composition points are not repair owners

The following are **assembly/composition points** and must stay thin:

- `src/main.ts`
- app startup/router host (for example `src/app/startup.ts`)
- top-level screen host / shell
- PWA install/update shell

They may:

1. call owners in the approved order;
2. pass canonical state/contracts between owners;
3. mount/unmount the correct surface;
4. translate a final owner result into a route/screen choice.

They must **not**:

1. create a second Auth/identity/message state machine;
2. infer Admin from `/admin`, `authenticated`, a UI flag, or a cached screen state;
3. call a customer bootstrap only to make Admin work;
4. repair Realtime/message bugs with screen-local subscriptions;
5. repair viewport/layout bugs in service-worker/PWA code;
6. add special-case branches that duplicate business rules already owned elsewhere;
7. accumulate temporary patches after the underlying owner exists.

If a composition point needs more than simple sequencing/mounting, first ask: **which owner contract is missing or wrong?** Fix that owner/contract instead.

## Root-first repair rule

For every bug/change:

1. Classify the concern: UI/geometry, interaction, business logic, data/backend, Auth/permission, lifecycle, media, PWA.
2. Trace **Owner/Parent → Sibling → Child/Leaf** before editing.
3. Identify the highest canonical owner whose contract/state is wrong.
4. Fix that owner with the smallest change.
5. Keep composition code unchanged unless its sequencing/mount contract itself is the bug.
6. Run focused regression tests for that owner before broad integration tests.
7. Only after the owner passes, verify the assembled User/Admin/PWA flow.

**Forbidden pattern:** symptom appears at Leaf/assembly → add conditional there → another owner later disagrees → add another conditional. This causes code growth, contradictory lifecycle paths, and duplicate state. Remove the root cause instead.

## Change rule

Before adding or modifying functionality:
1. Classify the change by owner.
2. Reuse the existing owner if one exists.
3. Do not create a second state machine for the same concern.
4. Do not move business/UI decisions into `compat/` or `diagnostics/`.
5. Do not make a child/leaf compensate for a parent/owner error.
6. Do not repair an owner failure at a composition point just because the symptom is visible there.
7. Prefer deleting an obsolete workaround when the canonical owner is fixed; do not leave both paths active.
8. A user-visible deployed source change must update `APP_VERSION` in `src/version.ts`; the screen must show named version + build ID.
9. CI must pass before the commit is moved to `main`.

## Mobile-first rule

Primary release gates are iOS Safari/Home Screen Web App and Android Chrome/installed PWA. Windows and macOS remain compatibility targets using the same codebase and a simple wider layout.

Mobile repair routing remains owner-based: viewport/keyboard geometry belongs to `src/viewport/`; component placement/font/tap geometry belongs to the owning UI/CSS; PWA code is changed only for service-worker/cache/install/update behavior.
