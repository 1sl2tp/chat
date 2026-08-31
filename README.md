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

## Stack

- TypeScript
- Vite
- Vanilla SPA
- PWA via `vite-plugin-pwa`
- Custom TypeScript service worker via `injectManifest`
- Vitest
- GitHub Actions
- GitHub Pages

## Cross-platform foundation

- `src/compat/`: runtime diagnostics and feature capability detection
- `src/media/`: media/WebRTC support contracts
- `src/notifications/`: Push, Notification, Badge and safe push payload contracts
- `src/floating/`: Picture-in-Picture capability plus guaranteed in-app mini-call fallback
- `src/diagnostics/`: safe allow-listed technical snapshots for troubleshooting
- `src/sw.ts`: offline cache, Web Push notification handling, badge updates and safe notification navigation

Behavior is selected by **feature detection**, not by hard-coded browser/OS branches. Runtime names are kept for diagnostics and release testing only.

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
