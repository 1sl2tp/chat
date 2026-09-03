# TAPHOA Supabase Runtime V3.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the STRUCTURE LOCK V3 UI to the existing Supabase 1:1 Chat backend without changing Chat/Directory geometry, while keeping mock standalone mode intact.

**Architecture:** Keep Supabase behind the existing service boundary. A runtime-session mapper converts bootstrap/admin inbox data into UI contacts plus conversation bindings. ChatScreen accepts an optional conversation source; without one it behaves exactly like V3 mock. Auth entry is a separate lock-safe gate and is previewed independently.

**Tech Stack:** Vite, TypeScript, @supabase/supabase-js 2.112.4, Supabase Auth/Postgres/Realtime/Storage.

**Spec:** `STRUCTURE_LOCK.md`

## Global Constraints

- Product scope: Chat 1:1 + Call 1:1 + Admin contact management only.
- Do not use friendship/privacy/CRM/ticket RPCs.
- Preserve ViewportController ownership and all STRUCTURE LOCK geometry.
- Message data uses senderId/recipientId relative to viewer.
- Only latest outgoing data message shows delivery state.
- No production/GitHub deployment.
- Existing prototype anon-read policies must be removed before production enablement; migration is prepared locally only in this phase.

---

### Task 1: Runtime session mapping
- [ ] RED tests for user/admin runtime state and conversation bindings.
- [ ] GREEN mapper implementation.
- [ ] Verify focused tests.

### Task 2: ChatScreen conversation source
- [ ] RED tests proving mock fallback remains and live source owns load/send/subscribe.
- [ ] GREEN optional source implementation with optimistic sending and refresh.
- [ ] Verify focused tests.

### Task 3: Supabase runtime adapter
- [ ] RED tests for conversation binding and RPC calls.
- [ ] GREEN adapter using SupabaseAuthService/SupabaseChatService.
- [ ] Verify focused tests.

### Task 4: Auth gate preview
- [ ] RED structure tests for guest + existing-account choices and 16px mobile inputs.
- [ ] GREEN standalone preview component only.
- [ ] Build screenshot/standalone for review.

### Task 5: Security deployment artifact
- [ ] Add local migration dropping prototype anon-readable policies only.
- [ ] Add static test ensuring authenticated member policies remain untouched.
- [ ] Do not apply migration in this phase.

### Task 6: Fresh verification and packaging
- [ ] Run typecheck + all tests + local build.
- [ ] Run Chromium smoke at 280/320/390/1280 + User.
- [ ] Attempt Vite build and report actual state.
- [ ] Package V3.2 source/runnable and auth preview; do not push/deploy.
