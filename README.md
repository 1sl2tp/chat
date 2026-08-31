# Chat

Permanent mobile-first foundation for the Chat project.

## Product target

Chat is one codebase delivered as both **Web** and **installable Web App (PWA)**.

Primary release targets:
- iOS: Safari + Home Screen Web App
- Android: Chrome + installed PWA

Compatibility targets:
- Windows: Edge/Chrome + installed PWA
- macOS: Safari/Web App + Chrome

Mobile is the primary UI. Windows and macOS use the same application with a simple wider layout; there is no separate complex desktop UI architecture.

## Android PWA release contract

Android PWA is a first-class release target, not a fallback browser mode. A release must preserve:
- Web App Manifest with stable `id`, `start_url`, `scope`, `display: standalone`, theme/background colors and install icons.
- 192x192, 512x512 and maskable Android-capable icons.
- Registered custom service worker for offline shell, Push, Notification, Badge and notification navigation.
- Runtime detection of Android + Chrome + standalone/browser mode.
- Feature detection for mic, WebRTC, Push, Badge, Media Session, PiP, Wake Lock, permissions, Visual Viewport and Virtual Keyboard.
- GitHub Actions production build before deploy.

## Version tracking rule

`src/version.ts` is the sole runtime source of truth for the named app version. Every user-visible deployed source change updates that value and the running screen displays the named version plus the Git commit build ID. Documentation must not keep a second "current version" value because it can drift from the code.

## Foundation ownership

The canonical single-owner architecture is documented in `docs/FOUNDATION_OWNERSHIP.md`. Each concern has one owner; other modules may consume or observe it but must not duplicate its state or decision logic.

- `src/compat/`: runtime and feature detection only
- `src/permissions/`: browser permission state and one-shot prompt policy
- `src/viewport/`: Visual Viewport / keyboard occlusion geometry only
- `src/pwa/` + `src/sw.ts`: service-worker/update/cache/push lifecycle
- `src/storage/`: storage state/schema lifecycle
- `src/session/`: authentication/session lifecycle
- `src/network/`: connectivity/backend reachability
- `src/lifecycle/`: foreground/background lifecycle
- `src/media/`: media/WebRTC support contracts
- `src/notifications/`: Push/Notification payload and delivery contracts
- `src/floating/`: mini-call/PiP presentation capability
- `src/diagnostics/`: read-only technical observation; never behavior ownership

Permission prompts are never fired automatically on app boot. A feature UI must invoke the permission owner from a user action; already-granted or denied permissions are not prompted again. Keyboard handling is geometry-driven through Visual Viewport with safe-area support; feature UI decides scrolling and placement using that published geometry.

## Stack

- TypeScript
- Vite
- Vanilla SPA
- PWA via `vite-plugin-pwa`
- Custom TypeScript service worker via `injectManifest`
- Vitest
- GitHub Actions
- GitHub Pages

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Every branch and pull request runs TypeScript checks, tests and a production PWA build. Only a successful push to `main` can deploy GitHub Pages.

Production is built into `dist/` and deployed automatically from `main` to GitHub Pages.
The current UI deliberately shows only `TEST`; Chat, Supabase Realtime, WebRTC, TURN and subscription/backend wiring are added on top of this foundation.
