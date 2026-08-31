# chat

Permanent frontend foundation for the Chat project.

## Stack

- TypeScript
- Vite
- Vanilla SPA
- PWA via `vite-plugin-pwa`
- GitHub Actions
- GitHub Pages

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Production is built into `dist/` and deployed automatically from `main` to GitHub Pages.
The current UI deliberately shows only `TEST`; future Chat, Supabase Realtime, WebRTC, TURN and Push modules are added on top of this foundation.
