# Chat Foundation Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared singleton message lifecycle with isolated ConversationSession instances, add Admin inbox realtime ownership, and complete the basic User ↔ Admin text flow without touching Call.

**Architecture:** Keep existing Vite/TypeScript/Supabase/Web/PWA owners. Introduce an instance-scoped conversation session in `src/chat/`, move Customer and Admin to separate instances, then add an Admin inbox realtime subscription through the Admin backend contract. Remove obsolete shared message runtime usage only after both consumers migrate.

**Tech Stack:** TypeScript, Vite, Vitest, Supabase JS, Supabase Realtime.

**Spec:** `docs/superpowers/specs/2026-08-31-chat-foundation-lock-design.md`

## Global Constraints

- No Call implementation.
- No UI redesign; basic existing UI only.
- No screen-local Supabase subscription workaround.
- Customer and Admin may share implementation, never mutable session state.
- TDD RED -> minimal GREEN for each behavioral change.
- Existing `npm run build` remains the full gate.

---

### Task 1: Isolated ConversationSession

**Files:**
- Create: `src/chat/conversation-session.ts`
- Create: `src/chat/conversation-session.test.ts`
- Reuse: `src/chat/messages.ts`

**Produces:** `createConversationSession({ conversationId, backend, createId? })` with `start`, `send`, `markRead`, `dispose`, `getState`, `subscribe`.

- [ ] Write failing tests proving two sessions are independent, dispose ignores stale async callbacks, and RPC+Realtime duplicates merge once.
- [ ] Run focused Vitest and confirm RED.
- [ ] Implement minimal instance-scoped session.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit.

### Task 2: Move Customer Chat off singleton runtime

**Files:**
- Modify: `src/chat/runtime.ts`
- Modify: `src/ui/chat/customer-screen.ts`
- Add/modify focused tests as required.

**Consumes:** ConversationSession from Task 1.

- [ ] Add failing test for Customer runtime owning one private session and cleanup/restart behavior.
- [ ] Confirm RED.
- [ ] Wire Customer runtime to its private session; expose state subscription/send through Chat owner contract.
- [ ] Confirm focused tests GREEN.
- [ ] Commit.

### Task 3: Move Admin selected conversation off Customer/shared singleton

**Files:**
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/runtime.test.ts`
- Modify: `src/ui/admin/screen.ts` only for consuming the Admin-owned session state if necessary.

**Consumes:** ConversationSession from Task 1.

- [ ] Replace old tests that assert shared runtime cleanup with tests proving Admin owns a private session and switching A -> B cannot affect another session.
- [ ] Confirm RED.
- [ ] Implement Admin-owned session lifecycle.
- [ ] Confirm GREEN.
- [ ] Commit.

### Task 4: Admin Inbox Realtime owner

**Files:**
- Modify: `src/admin/contracts.ts`
- Modify: `src/supabase/admin-backend.ts`
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/runtime.test.ts`

**Produces:** Admin backend `subscribeInboxChanges(onChange, onStatus?) -> cleanup` and runtime cleanup ownership.

- [ ] Add failing test proving active Admin inbox refreshes on a backend change signal without focus/manual refresh.
- [ ] Confirm RED.
- [ ] Implement one Admin-owned realtime subscription that coalesces/refreshes inbox from canonical RPC results.
- [ ] Confirm GREEN.
- [ ] Commit.

### Task 5: Remove obsolete shared singleton path and lock boundaries

**Files:**
- Remove/replace consumers of `src/chat/message-runtime.ts`; delete it only if no imports remain.
- Modify: `docs/FOUNDATION_OWNERSHIP.md`.
- Add architecture test/script if repository pattern allows.

- [ ] Add a failing boundary assertion/search proving Admin no longer imports Chat singleton runtime and Call cannot import Chat internals.
- [ ] Confirm RED if old imports remain.
- [ ] Remove obsolete path and update ownership docs to `shared engine, isolated instances`.
- [ ] Confirm GREEN.
- [ ] Commit.

### Task 6: Full verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Verify no Call files/logic were added.
- [ ] Verify branch CI is green.
- [ ] Report result only as the agreed functional summary with PASS/FAIL and remaining blockers.
