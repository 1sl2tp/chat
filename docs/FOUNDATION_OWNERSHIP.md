# Foundation Ownership Rules

This file is the canonical ownership map for the Chat Web/PWA foundation.

## Core rule

Every state and decision has exactly one owner. Other modules may consume or observe that state, but must not duplicate or independently redefine it.

## Owners

- `src/version.ts`: sole runtime source of truth for the named app version. Build ID comes from CI. Documentation must not maintain a second current-version value.
- `src/compat/`: feature/runtime detection only. It reports what the environment supports; it does not request permissions or control UI.
- `src/permissions/`: permission state and permission-request policy. It is the only place allowed to decide whether a browser permission prompt should be requested.
- `src/viewport/`: visual viewport, keyboard occlusion and viewport geometry. It publishes geometry/state only; it does not scroll conversations or position feature-specific UI.
- App shell / feature UI: owns placement and scrolling using values published by `viewport/`.
- `src/pwa/` + `src/sw.ts`: service-worker registration/update lifecycle, app-shell cache and push event handling.
- `src/storage/`: storage capability/state/schema lifecycle. It is not an authentication/session owner.
- `src/session/`: authentication/session lifecycle state. Supabase adapters must plug into this owner instead of creating parallel auth state.
- `src/network/`: connectivity/backend-reachability state. `navigator.onLine` is only an input signal, not the final truth.
- `src/lifecycle/`: foreground/background/page lifecycle state.
- `src/media/`: microphone/audio/WebRTC media support and media state contracts.
- `src/notifications/`: notification/push payload and delivery contracts; browser permission policy remains owned by `permissions/`.
- `src/floating/`: mini-call/PiP capability and presentation contract; it does not own call/media state.
- `src/diagnostics/`: read-only allow-listed observation. Diagnostics never controls app behavior and never becomes a second source of truth.

## Change rule

Before adding or modifying functionality:
1. Classify the change by owner.
2. Reuse the existing owner if one exists.
3. Do not create a second state machine for the same concern.
4. Do not move business/UI decisions into `compat/` or `diagnostics/`.
5. Do not make a child/leaf compensate for a parent/owner error.
6. A user-visible deployed source change must update `APP_VERSION` in `src/version.ts`; the screen must show named version + build ID.
7. CI must pass before the commit is moved to `main`.

## Mobile-first rule

Primary release gates are iOS Safari/Home Screen Web App and Android Chrome/installed PWA. Windows and macOS remain compatibility targets using the same codebase and a simple wider layout.
