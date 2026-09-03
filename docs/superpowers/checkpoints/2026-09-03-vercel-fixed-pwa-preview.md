# TAPHOA Chat — Fixed Vercel PWA Preview Checkpoint

Date: 2026-09-03

## Fixed preview URL

- User: https://taphoa-chat-preview-1sl2tp.vercel.app/
- Admin: https://taphoa-chat-preview-1sl2tp.vercel.app/admin/

## Source and isolation

- Repository: `1sl2tp/chat`
- Source branch: `feat/chatwoot-responsive-pc-mobile-0174`
- Build bundle branch: `vercel-preview-dist` (generated only by GitHub Actions)
- Production `main` is not required to refresh this preview.
- `chat.taphoa.xyz` DNS/hosting is unchanged.

## Update flow

1. A push to `feat/chatwoot-responsive-pc-mobile-0174` triggers `.github/workflows/vercel-preview-build.yml`.
2. The workflow runs `npm ci` and the repository's full `npm run build` verification chain.
3. A successful build publishes stable User/Admin browser bundles to `vercel-preview-dist` and records the source SHA in `preview-meta.json`.
4. The fixed Vercel loader reads `preview-meta.json` without cache and loads the matching preview bundle. The Vercel URL therefore stays fixed while the displayed PWA follows successful source-branch builds.

## Verification completed before this checkpoint

- Existing Pages build workflow passed for the preview branch.
- Dedicated preview packaging workflow passed and successfully created/updated `vercel-preview-dist`.
- User and Admin stable bundles are produced from the same verified Vite build.
- Vercel dedicated preview project/alias was created separately from `chat.taphoa.xyz`.

## Known verification limitation

The Vercel read/status connector currently returns 404 for deployments created by the deployment connector even though the deployment action returns the project alias. For that reason, do not infer native-device E2E from Vercel deployment metadata. Browser/device interaction remains a separate live E2E gate.
