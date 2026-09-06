# TAPHOA CHAT/CALL

Current canonical source: **V21.72.16 — Audio Capture Policy + PWA Auto Update**.

This repository contains only the current CHAT/CALL web/PWA source. The previous Chatwoot source is not part of this repository.

## Status
- Release: `V21.72.16`
- State: `CANDIDATE`
- Automated checkpoint: 311 pytest PASS; media 202/202; source sync 20/20; JS syntax 13/13; geometry 9/9.
- Audio capture uses one canonical mic policy for Recorder + LiveKit (AEC/NS/AGC/mono, device pinning, duplicate capture guard).
- GitHub Pages app registers a PWA service worker and checks version.json; safe sessions auto-reload to new releases without F5.
- Real-device iOS/Android Web/PWA verification remains open before Production LOCK.

## Build
```bash
python tools/build_current_preview.py
```

Canonical `index.html` SHA-256:
`580e65f75103fac0dbed974acdaafb3f58606c36d3eda0142793106b15490a44`

## Verify
```bash
python tools/verify_current.py
```

Stable preview: `https://taphoa-chat-preview-1sl2tp.vercel.app`

Vercel remains direct-deploy and is independent from GitHub `main`.
