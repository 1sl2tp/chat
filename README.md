# TAPHOA CHAT/CALL

Canonical branch: **main**  
Current release: **V21.72.39**  
Channel: **candidate**

This repository contains the current TAPHOA Chat/Call web/PWA source. Old development branches and superseded planning/backup material were removed on 2026-09-18 so `main` is the single source of truth.

## Current status

- `Verify V21`: PASS on the current application checkpoint.
- GitHub Pages deploys the app to **https://chat.taphoa.xyz/**.
- PWA updates are controlled by `version.json` with `auto-when-safe`.
- `index.source.html` is the canonical HTML build source; `index.html` is generated from it.
- `reference/chatgpt/` contains runtime CSS/assets used by the current build and is not a backup.
- `b/` is the active public quote page.
- `c/` is the active guest-call page.
- Supabase migrations/functions, tests, and runtime modules in `main` belong to the current source tree.

## Build

```bash
python tools/build_current_preview.py
```

## Verify

```bash
python tools/verify_current.py
```

## Repository rule

Do new work from the latest `main`. Do not restore or reuse deleted historical branches as implementation bases.
