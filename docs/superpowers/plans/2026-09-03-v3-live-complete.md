# TAPHOA V3 Live Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new Structure-Lock UI the complete live product by removing the remaining local-only account/directory behavior, keeping Supabase as canonical chat/auth/directory state, LiveKit as the only call media engine, and PWA Push as the background notification path.

**Architecture:** Keep all V3 UI geometry unchanged. UI components call narrow service boundaries; Supabase owns persistent identity, directory, groups, messages, read state, attachments, call state, and push subscriptions; LiveKit owns audio transport only. Demo/mock data remains available only to offline preview/test mode and is never the live production path.

**Tech Stack:** Vite + TypeScript, `@supabase/supabase-js` 2.112.4, `livekit-client` 2.22.x, Supabase Auth/Postgres/Realtime/Storage/Edge Functions, Service Worker/Web Push.

**Spec:** `docs/superpowers/specs/2026-09-03-taphoa-structure-lock-design.md`

## Global Constraints

- UI/geometry is STRUCTURE LOCK; do not redesign or move regions.
- Product scope is 1:1 Chat, 1:1 Call, Admin directory management only.
- No CRM/ticket/friendship/privacy expansion.
- No service role/secret in browser code.
- Anonymous Supabase sessions are `authenticated`; direct `anon` table reads stay revoked.
- Call history comes from Supabase; live mode must not append duplicate local CallEvent rows.
- LiveKit carries audio only; no second signaling system.
- Production path must not silently fall back to fake data.

---

### Task 1: Persist Admin customer groups in Supabase

**Files:**
- Create: `supabase/migrations/20260903_admin_directory_groups.sql`
- Modify: `src/services/supabase/admin-directory-service.ts`
- Modify: `src/directory/directory-screen.ts`
- Modify: `src/main.ts`
- Test: `tests/admin-directory-groups-live.test.mjs`

**Interfaces:**
- Produces `loadGroups()`, `createGroup(name)`, `deleteGroup(groupId)`, `assignGroup(profileId, groupId|null)` on `SupabaseAdminDirectoryService`.
- Main maps returned assignments onto existing `Contact.customerGroupId`; built-in `customer`/`guest` remain UI-only built-ins.

- [ ] Write failing service/UI contract tests for group load/create/delete/assign and live callbacks.
- [ ] Run focused tests and confirm RED.
- [ ] Add admin-only tables/RPC migration and service methods.
- [ ] Wire DirectoryScreen and Admin chat menu group actions through live management when present.
- [ ] Run focused tests and confirm GREEN.

### Task 2: Make User account editing live

**Files:**
- Modify: `src/services/supabase/port.ts`
- Modify: `src/services/supabase/supabase-js-port.ts`
- Modify: `src/services/supabase/auth-service.ts`
- Modify: `src/runtime/live-services.ts`
- Modify: `src/main.ts`
- Test: `tests/user-account-live.test.mjs`

**Interfaces:**
- `SupabasePort.auth.updateUser({ password })` delegates to Supabase Auth.
- `SupabaseAuthService.updateRegisteredAccount({name, username, password?})` uses `chat_update_user2_account` and updates password only when a real replacement password is supplied.

- [ ] Write failing tests for profile RPC + optional password update and main live account form.
- [ ] Run focused tests and confirm RED.
- [ ] Implement minimal port/auth service support.
- [ ] Wire account form to live auth service and refresh runtime profile after save.
- [ ] Run focused tests and confirm GREEN.

### Task 3: Remove remaining live-mode local mutations and harden runtime behavior

**Files:**
- Modify: `src/main.ts`
- Modify: `src/directory/directory-screen.ts`
- Modify: `src/runtime/live-runtime-bootstrap.ts` if needed
- Test: `tests/live-no-local-mutations.test.mjs`

**Interfaces:**
- Admin delete from header uses `SupabaseAdminDirectoryService.deleteContact()` and refreshes canonical inbox.
- Production no-config state shows configuration/auth error rather than fake contacts; explicit demo mode retains deterministic preview behavior.

- [ ] Write failing tests for live delete and production no-fake fallback.
- [ ] Run focused tests and confirm RED.
- [ ] Route all live mutations through services; isolate demo mode.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Verify LiveKit + Push contracts remain intact

**Files:**
- Modify only if regression proves necessary.
- Test: existing `voice-call-service`, `livekit-js-audio`, `pwa-push`, `pwa-sw-runtime`, `call`, `main-live-runtime` suites.

- [ ] Run all call/push focused tests.
- [ ] Fix only root-cause regressions without UI geometry changes.
- [ ] Re-run focused tests to GREEN.

### Task 5: Apply/verify Supabase migration and security

**Files:**
- Migration from Task 1.

- [ ] Apply the directory-group migration to project `gcnoahqsrquxkwkjbuxy`.
- [ ] Verify tables/RPC grants and RLS/admin checks.
- [ ] Verify existing Chat tables still have no direct `anon` SELECT grants.
- [ ] Verify current data remains 1 Admin + registered U2 data with no reintroduced old chat history.

### Task 6: Full verification, clean production stage, and publish main

**Files:**
- Sync verified new UI/source into clean GitHub-main staging tree.
- Keep `.github/workflows/pages.yml`, build config, required lockfile, Supabase/LiveKit/PWA dependencies.
- Remove legacy UI/diagnostic/compat code from final main only after replacement verifies.

- [ ] Run `npm run verify`.
- [ ] Run standalone builder and Chromium smoke.
- [ ] Run `git diff --check` and source scan for service-role secrets/legacy live mutations.
- [ ] Build a clean main-stage tree containing only the new product UI and required runtime/services.
- [ ] Update GitHub `1sl2tp/chat` `main` atomically from the verified stage.
- [ ] Re-read GitHub `main` commit/tree and verify expected files/workflow.
- [ ] Package final source/runnable/standalone + SHA-256 + verification report.
