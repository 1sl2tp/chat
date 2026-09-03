# TAPHOA Chat Fixed Vercel PWA Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one stable Vercel preview URL for the TAPHOA Chat Vite/PWA development branch so ongoing UI and chat changes can be reviewed without touching `main` or `chat.taphoa.xyz`.

**Architecture:** Keep the current Vite/TypeScript/PWA branch unchanged as the application source. Build and verify that branch first, then deploy it into a dedicated Vercel preview project whose project URL remains stable across future deployments. Supabase remains the backend; Vercel is preview hosting only.

**Tech Stack:** Vite 8, TypeScript 6, Vitest, vite-plugin-pwa, Supabase, LiveKit, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-03-vercel-fixed-pwa-preview-design.md`

## Global Constraints

- Preview source is `1sl2tp/chat` branch `feat/chatwoot-responsive-pc-mobile-0174`.
- Do not merge to `main` for preview deployment.
- Do not change DNS or `chat.taphoa.xyz`.
- Do not add Expo Web or replace the existing Vite/PWA architecture.
- Do not change Supabase production data merely to make preview hosting work.
- Preferred stable project URL is `https://taphoa-chat-preview.vercel.app`; if unavailable, use the nearest stable project URL and keep that same URL for subsequent previews.

---

### Task 1: Verify the PWA branch is deployable

**Files:**
- Read: `package.json`
- Read: `vite.config.ts`
- Read: `.env.example` if present
- No source mutation is required unless verification exposes a deployment-only defect.

**Interfaces:**
- Consumes: existing branch build command `npm run build`.
- Produces: verified static Vite output suitable for Vercel and a list of required public environment variables, if any.

- [ ] **Step 1: Check out the exact preview branch**

Use the exact Git ref `feat/chatwoot-responsive-pc-mobile-0174`; record its current commit SHA before building.

- [ ] **Step 2: Install dependencies without changing lockfile**

Run:

```bash
npm ci
```

Expected: exit code 0 and no lockfile rewrite.

- [ ] **Step 3: Run the full repository build gate**

Run:

```bash
npm run build
```

Expected: exit code 0. This command must execute mirror verification, TypeScript checking, Vitest, and `vite build` as defined by the branch.

- [ ] **Step 4: Verify Vite output**

Run:

```bash
test -f dist/index.html
```

Expected: exit code 0.

- [ ] **Step 5: Record deployment settings**

Lock the deployment settings to:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
Install command: npm ci
Source branch: feat/chatwoot-responsive-pc-mobile-0174
```

Do not introduce a second frontend build system.

---

### Task 2: Create and verify the fixed Vercel preview

**Files:**
- No application source changes expected.
- Optional create only if Vercel requires SPA fallback configuration: `vercel.json` on the preview branch.

**Interfaces:**
- Consumes: verified `dist` build from Task 1 and the existing Supabase endpoints already configured by the PWA.
- Produces: one stable Vercel project URL used for all future development review.

- [ ] **Step 1: Provision a dedicated preview project**

Create or deploy a dedicated Vercel project named:

```text
taphoa-chat-preview
```

It must remain separate from `chat.taphoa.xyz` production hosting.

- [ ] **Step 2: Bind the project to the PWA source**

Use the exact source branch:

```text
feat/chatwoot-responsive-pc-mobile-0174
```

The fixed project URL, not a per-deployment hash URL, is the URL to give the user.

- [ ] **Step 3: Configure Vite build/output**

Use:

```text
npm ci
npm run build
dist
```

Only add SPA rewrite configuration if a direct-route refresh returns 404. If required, create `vercel.json` with exactly:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Then rebuild before redeploying.

- [ ] **Step 4: Verify the deployment itself**

Check the deployment state in Vercel and inspect build logs.

Expected: deployment status READY and build exit code 0.

- [ ] **Step 5: Verify the fixed URL serves the PWA**

Fetch the stable project URL and confirm HTTP success plus the PWA shell rather than a Vercel error page.

Expected: the page loads from the stable project URL.

- [ ] **Step 6: Verify backend reachability from preview**

Open the preview and verify the login flow reaches the current Supabase Chatwoot-compatible API. Do not create or migrate legacy `public.chat_*` data for this check.

Expected: current login shell reaches the existing backend; native-device-only call behavior remains a separate E2E gate.

- [ ] **Step 7: Report the single tracking URL**

Return only the stable project URL as the canonical preview URL, plus current branch SHA and build status. Do not make `chat.taphoa.xyz` point at Vercel.
