# TAPHOA CHAT/CALL

Current canonical source: **V21.72.19 — Profile Username + Avatar Circle Hardening**.

This repository contains only the current CHAT/CALL web/PWA source. The previous Chatwoot source is not part of this repository.

## Status
- Release: `V21.72.19`
- State: `CANDIDATE`
- Current CI gate: canonical bundle/source sync PASS; 10 viewport pytest PASS; message/media/sync runtime PASS; AudioCapturePolicy runtime PASS; PWA/update runtime PASS.
- Audio capture uses one canonical mic policy for Recorder + LiveKit (AEC/NS/AGC/mono, device pinning, duplicate capture guard).
- GitHub Pages app registers a PWA service worker and checks version.json; safe sessions auto-reload to new releases without F5.
- Mobile Auth/Profile use ShellFormViewportPolicy so login/register/profile fields remain reachable above the software keyboard without writing Chat ScrollRoot.
- Login/Register primary and secondary actions share one compact two-column row.
- Profile supports changing the login username for self and admin-managed users; backend updates the auth email mapping and v21_accounts together with rollback on failure.
- Avatar rendering is hard-clipped to a circle for preview/saved/fallback states and falls back to initials when an image fails.
- Real-device iOS/Android Web/PWA verification remains open before Production LOCK.

## Build
```bash
python tools/build_current_preview.py
```

Canonical `index.html` SHA-256:
`a09f23ac611329f2ad9fc6682e425168e99e2b6fd8a9f18c0a7c2d0e25d229da`

## Verify
```bash
python tools/verify_current.py
```

Stable preview: `https://taphoa-chat-preview-1sl2tp.vercel.app`

Vercel remains direct-deploy and is independent from GitHub `main`.
