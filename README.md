# TAPHOA CHAT/CALL

Current canonical source: **V21.72.14 — Viewport Scope Lifecycle**.

This repository contains only the current CHAT/CALL web/PWA source. The previous Chatwoot mirror/source is not part of this repository.

## Current release status

- Release: `V21.72.14`
- Status: `CANDIDATE`
- Automated checkpoint: 311 pytest PASS; media pipeline 202/202 PASS; source sync 20/20 PASS; active JS syntax 13/13 PASS; geometry 9/9 PASS.
- Real-device iOS/Android Web/PWA verification is still required before Production LOCK.

## Build

```bash
python tools/build_current_preview.py
```

Canonical bundled `index.html` SHA-256:

`580e65f75103fac0dbed974acdaafb3f58606c36d3eda0142793106b15490a44`

## Verify current source

```bash
python tools/verify_current.py
```

## Stable preview

`https://taphoa-chat-preview-1sl2tp.vercel.app`

Vercel deployment remains a direct deployment flow and is intentionally independent from GitHub `main`.
