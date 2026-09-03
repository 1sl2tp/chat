# TAPHOA Clean UI Rebuild — Checkpoint

Date: 2026-09-03
Branch: `ui-clean-rebuild`
Release target: `CHAT-ADMIN-0.19.0`
Rollback main SHA: `acf880233870a4c1da2b5ce5bacf2a7bcef0bf6c`

## Scope completed
- Production User shell imports only the clean theme and `user-clean-main`.
- Production Admin shell imports only the clean theme and `admin-clean-main`.
- User is a direct full-screen Support chat with clean menu/account/login surfaces.
- Admin is Inbox screen → selected User → full-screen Chat → Back to Inbox.
- User/Admin share one clean ChatSurface owner.
- Clean message list, composer and supported attachment/audio runtime are connected.
- Clean call presentation owns incoming/full/compact/mic/speaker/accept/end while LiveKit runtime remains unchanged.
- Notification, PWA, auth and Supabase runtime remain connected.
- Legacy Chatwoot/account/login/management presentation owners are not active in production shells.

## Release gate
Before merge to `main` require:
1. clean mirror verification PASS;
2. TypeScript PASS;
3. full Vitest suite PASS;
4. Vite production build PASS;
5. branch compare against `main`: behind = 0;
6. merge only the green branch head;
7. GitHub Pages build + deploy on merged `main` PASS.

## Rollback
If the production cutover fails, reset/revert to main SHA `acf880233870a4c1da2b5ce5bacf2a7bcef0bf6c` and redeploy GitHub Pages.
