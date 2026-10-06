# TAPHOA CHAT/CALL

> ## ⚠️ BẮT BUỘC TRƯỚC KHI SỬA / DEPLOY
>
> Trước mọi sửa chữa phải đọc **[CURRENT_WORK.md](./CURRENT_WORK.md)** rồi **[README_MAINTENANCE.md](./README_MAINTENANCE.md)**.
> Nếu thay đổi liên quan Realtime, polling, heartbeat, Presence, Supabase RPC, cache, log, cron, retention, push hoặc media phải đọc thêm **[README_RESOURCE_GUARDRAILS.md](./README_RESOURCE_GUARDRAILS.md)**.
> Quy tắc mặc định: **message/read-state realtime là ưu tiên số 1; một incident → một owner → một patch → một deploy; không thêm polling/fallback mới nếu chưa chứng minh owner hiện tại sai.**
> Job/deploy đang chạy thì không tạo job thứ hai; xem **[README_NO_WAIT_WORKFLOW.md](./README_NO_WAIT_WORKFLOW.md)**.
>
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

## Runtime ownership

Keep each runtime concern with one owner:

- **Shell / navigation / profile** → `shell.js`.
- **Conversation rendering and composer orchestration** → `app.js`. New standalone features should be separate modules instead of adding another large block here.
- **Message state** → `v21-message-store.js`.
- **Send / sync / retry / media forwarding** → `v21-sync-engine.js`.
- **Message forward UI / destination picker** → `message-forward.js`; it calls `v21-sync-engine.js` for the actual send/copy operation.
- **Realtime conversation delivery** → `v21-realtime-session.js`.
- **Media cache** → `v21-media-cache.js`.
- **Work / customer summary UI** → `work-customer-summary.js`; scanner results arrive through Admin-only Realtime. The old periodic refresh fallback is retired; do not add interval polling back.
- **Zalo transport** → `bridge/zalo/` + Zalo Edge Functions. Do not add Zalo transport logic to `v21-sync-engine.js`.
- **Quote data** → `v21-quote` Edge Function + `quote-client.js`. The composer `+` action is the send path; the contact profile only creates/copies a quote link.
- **Interaction / overlay ownership** → `V21InteractionController`. Full-screen or modal surfaces must acquire/release an interaction mode instead of independently disabling the base UI.
- **Primary UI icons** → `ui-icons.js` / `V21Icons`.
- **Feature styling** → dedicated CSS files. Do not inject a new full feature stylesheet from JavaScript.

## UI consistency rules

1. Keep mobile Chat one-column and desktop Chat three-column; do not implement desktop by shrinking mobile geometry.
2. A control that performs the same business action must have one primary path and one label.
3. Zalo endpoints must show whether they are **Zalo cá nhân** or **Nhóm Zalo**.
4. External/user-provided names are rendered with `textContent`, not interpolated into `innerHTML`.
5. Modal surfaces use the shared interaction controller; non-modal viewers must not make visible shell controls inert.
6. Message/media forwarding creates a new destination message/asset; it never reuses ownership of the source asset.
7. Preserve `index.source.html` as the canonical HTML source and rebuild `index.html` after any build-source change.



## External data — Single Source of Truth

Rule dùng chung bắt buộc: `1sl2tp/infrastructure/rules/02-EXTERNAL-DATA-SINGLE-SOURCE-OF-TRUTH.md`.

- Supabase `1sl2tpvn` là canonical business data của Chat.
- LiveKit chỉ giữ transport/session realtime cần cho cuộc gọi; không phải nơi lưu lịch sử Chat hay account.
- Render/Cloudflare/GitHub/Drive nếu được thêm sau này chỉ được giữ role đã khai báo trong central registry, có TTL/retention khi là cache/session.
- Không thêm background two-way sync hoặc database sống thứ hai cho messages/read-state/accounts.


## LiveKit owner lock

- Production account-call token owner: `v21-livekit-token`.
- Peer verification owner: `v21-livekit-confirm-peer`.
- Guest-call entry owner: `v21-call-invite-guest`.
- Legacy `taphoa-livekit-token` is retired and returns HTTP 410; do not reconnect it.
- LiveKit is transport/session only. Message, account and durable call state remain canonical in Supabase `1sl2tpvn`.
