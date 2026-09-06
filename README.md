# TAPHOA CHAT/CALL

Current canonical source: **V21.72.17 — Audio Capture Policy + PWA Auto Update**.

This repository contains only the current CHAT/CALL web/PWA source. The previous Chatwoot source is not part of this repository.

## Status
- Release: `V21.72.17`
- State: `CANDIDATE`
- Current CI gate: canonical bundle/source sync PASS; 10 viewport pytest PASS; message/media/sync runtime PASS; AudioCapturePolicy runtime PASS; PWA/update runtime PASS.
- Audio capture uses one canonical mic policy for Recorder + LiveKit (AEC/NS/AGC/mono, device pinning, duplicate capture guard).
- GitHub Pages app registers a PWA service worker and checks version.json; safe sessions auto-reload to new releases without F5.
- Mobile Auth/Profile now use ShellFormViewportPolicy so login/register/profile fields remain reachable above the software keyboard without writing Chat ScrollRoot.
- Real-device iOS/Android Web/PWA verification remains open before Production LOCK.

## Build
```bash
python tools/build_current_preview.py
```

Canonical `index.html` SHA-256:
`b2727a165db78d2053768ae19a16839c9414b43676743d458c6ddca61b5a93f6`

## Verify
```bash
python tools/verify_current.py
```

Stable preview: `https://taphoa-chat-preview-1sl2tp.vercel.app`

Vercel remains direct-deploy and is independent from GitHub `main`.
