# TAPHOA CHAT/CALL

Current canonical source: **V21.72.16 — Audio Capture Policy + PWA Auto Update**.

This repository contains only the current CHAT/CALL web/PWA source. The previous Chatwoot source is not part of this repository.

## Status
- Release: `V21.72.16`
- State: `CANDIDATE`
- Current CI gate: canonical bundle/source sync PASS; 10 viewport pytest PASS; message/media/sync runtime PASS; AudioCapturePolicy runtime PASS; PWA/update runtime PASS.
- Audio capture uses one canonical mic policy for Recorder + LiveKit (AEC/NS/AGC/mono, device pinning, duplicate capture guard).
- GitHub Pages app registers a PWA service worker and checks version.json; safe sessions auto-reload to new releases without F5.
- Real-device iOS/Android Web/PWA verification remains open before Production LOCK.

## Build
```bash
python tools/build_current_preview.py
```

Canonical `index.html` SHA-256:
`a54f3e1583287a236b8e1974038815eb354ba7b06a457f94675cb0f0364dad1e`

## Verify
```bash
python tools/verify_current.py
```

Stable preview: `https://taphoa-chat-preview-1sl2tp.vercel.app`

Vercel remains direct-deploy and is independent from GitHub `main`.
