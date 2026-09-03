# TAPHOA CHAT V3.1 Supabase 1:1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Land the approved 280px Composer geometry fix in the V3 source and add a tested Supabase Auth/Chat 1:1 gateway without changing the locked UI structure or deploying.

**Architecture:** Keep all existing Vite/TypeScript screen/component ownership unchanged. Supabase integration lives only under `src/services/supabase/`; UI remains mock-backed during this gate so network/auth failure cannot change geometry. A later gate may inject the backend into `main.ts` after the service layer passes independently.

**Tech Stack:** Vite, TypeScript 5.8, Node test runner, Supabase JS v2, Postgres RPC/RLS.

**Spec:** `TAPHOA CHAT V3 — CHECKPOINT 2026-09-03` + locked rules supplied by user.

## Global Constraints
- Only Chat 1:1 + Call 1:1 + Admin contact management.
- Do not use friendship/privacy/CRM/ticket APIs.
- Preserve STRUCTURE LOCK and all existing UI ownership.
- No GitHub or production deploy.
- No service-role key in browser code.
- Use publishable Supabase key and existing RPC/RLS only; no database DDL in this gate.
- Fresh tests/typecheck/build/smoke before reporting PASS.

---

### Task 1: Composer 280px source fix
**Files:**
- Modify: `tests/chat-structure.test.mjs`
- Modify: `src/styles/ui.css`

- [ ] Add failing contract test for max-width 300px composer spacing.
- [ ] Run targeted test and confirm RED.
- [ ] Add only the approved owner-level CSS patch.
- [ ] Run targeted test and full suite.

### Task 2: Supabase message/domain mapper
**Files:**
- Create: `src/services/supabase/types.ts`
- Create: `src/services/supabase/message-mapper.ts`
- Create: `tests/supabase-message-mapper.test.mjs`

- [ ] Add failing tests for sender/recipient derivation, message kinds, and last-outgoing-only status.
- [ ] Confirm RED.
- [ ] Implement minimal pure mapping functions.
- [ ] Confirm GREEN.

### Task 3: Supabase client/auth/chat gateway
**Files:**
- Create: `src/services/supabase/client.ts`
- Create: `src/services/supabase/auth-service.ts`
- Create: `src/services/supabase/chat-service.ts`
- Create: `src/services/supabase/config.ts`
- Create: `src/vite-env.d.ts`
- Modify: `package.json`
- Create/update: `package-lock.json`
- Create: `.env.example`
- Create: `tests/supabase-service-contract.test.mjs`

Interfaces:
- Auth consumes anonymous/password sessions and existing `chat_bootstrap_identity`, `chat_resolve_identity`, `chat_get_support_entry` RPCs.
- Admin directory consumes only `chat_admin_support_inbox`.
- Messages consume direct SELECT under existing RLS plus `chat_send_text_message` and `chat_mark_conversation_read`.

- [ ] Add failing source-contract tests that prohibit service-role and friendship/privacy usage and require only existing 1:1 RPC names.
- [ ] Confirm RED.
- [ ] Pin current Supabase JS v2 and implement browser client/config.
- [ ] Implement auth bootstrap and username-to-`@taphoa.chat` login mapping.
- [ ] Implement admin inbox, load/send/read/subscribe gateway.
- [ ] Run tests/typecheck.

### Task 4: Fresh verification and V3.1 artifacts
**Files:** generated only under `dist/` and `/mnt/data`.

- [ ] Run `npm run verify`.
- [ ] Run Vite build.
- [ ] Run Chromium smoke 280/320/390/1280 + User.
- [ ] Build standalone.
- [ ] Package V3.1 source zip and calculate SHA-256.
- [ ] Do not deploy or modify Drive originals.
