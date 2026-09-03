# TAPHOA Chat Fixed Vercel PWA Preview — Design

## Goal
Provide one stable Vercel URL that Nguyễn can keep open to follow ongoing TAPHOA Chat Web/PWA development without changing `chat.taphoa.xyz` or merging development work into `main`.

## Source of preview
- Repository: `1sl2tp/chat`
- Preview source branch: `feat/chatwoot-responsive-pc-mobile-0174`
- This branch is the Vite/TypeScript/PWA application line, not the Chatwoot upstream/native mirror on `main`.
- The existing Supabase Chatwoot-compatible backend remains the backend for the preview, including the ACTIVE v6 conversation work.

## Deployment model
- Create one dedicated Vercel project for preview only.
- Preferred project name: `taphoa-chat-preview`.
- Preferred fixed URL: `https://taphoa-chat-preview.vercel.app` (or the nearest Vercel-assigned stable project URL if that slug is unavailable).
- The project must build the Vite PWA with the repository's existing build command and static output.
- Subsequent updates to the selected preview branch should update the same project URL rather than generate a different URL for Nguyễn to track manually.

## Isolation / safety
- Do not modify DNS or the existing `chat.taphoa.xyz` domain.
- Do not use Vercel as the production host for `chat.taphoa.xyz`.
- Do not merge to `main` just to refresh the preview.
- Do not replace the PWA architecture or add an Expo Web layer.
- Do not change Supabase production data merely to make the preview deploy.

## Verification gates
Before calling the preview ready:
1. `npm run build` (which already chains mirror verification, TypeScript, tests, and Vite build) must succeed for the preview branch.
2. The deployed URL must return the PWA shell successfully.
3. Login must reach the current Supabase Chatwoot-compatible API.
4. The preview must be able to display the current Conversation flow; native-device-only call behavior remains a separate E2E gate.

## Rollback
Deleting or disconnecting the Vercel preview project must leave `chat.taphoa.xyz`, GitHub `main`, Supabase, and the development branch history unchanged.
