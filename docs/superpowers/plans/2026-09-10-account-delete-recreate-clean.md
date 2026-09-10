# Account Lifecycle Hard-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the locked lifecycle: create a clean User, lock without deleting data, hard-delete the User and all related data, and allow the same username to be created later as a completely new identity.

**Architecture:** Chat remains the only identity owner. `auth.users` is the login identity and `v21_accounts` is the Chat account; deleting the Auth User triggers transactional cleanup of Chat/Call/GETLINK database dependencies and the existing `ON DELETE CASCADE` removes the account and remaining dependent rows. Physical media/avatar files are removed first through the official Supabase Storage API. GETLINK continues to accept only the Chat bearer identity and has no login/session of its own.

**Tech Stack:** Supabase Postgres/Auth/Storage, Supabase Edge Functions, TypeScript/Deno, Python contract tests, GitHub Actions.

**Spec:** User-locked semantics from 2026-09-10: (1) create and validate User; (2) lock User while retaining data; (3) delete User means delete cleanly with nothing left; (4) recreating a previously deleted username is unrelated to the old identity and only current username collisions matter.

## Global Constraints

- Do not change Chat's one-account/one-active-session policy.
- Do not change Call runtime behavior.
- Do not add a GETLINK login or session store.
- Lock keeps User data but blocks Chat/GETLINK access and revokes active app sessions.
- Delete removes Auth, account, Chat, Call, GETLINK sales/debt, session, media metadata and physical Storage objects tied to the deleted User/conversations.
- Recreated usernames receive a fresh Auth User and fresh `v21_accounts.id`.
- Active Admin/User identities are never part of historical cleanup.

---

### Task 1: Lock lifecycle semantics with RED tests

**Files:**
- `tests/test_v21_account_delete_recreate.py`
- `.github/workflows/verify-v21.yml`

- [x] Add RED coverage for hard-delete, fresh registration, Storage cleanup and call/conversation ordering.
- [x] Confirm RED before implementation while prior Chat/GETLINK tests remain green.

### Task 2: Implement future User deletion

**Files:**
- `supabase/functions/v21-account-admin/index.ts`
- `supabase/functions/v21-register/index.ts`
- `supabase/migrations/20260910184500_v21_hard_delete_user.sql`
- `supabase/migrations/20260910190000_v21_hard_delete_user_conversation_cleanup.sql`

- [x] Keep lock semantics: set `locked_at`, revoke active `v21_sessions`, retain data.
- [x] On delete, lock first, revoke sessions, remove conversation media/avatar through Storage API, then call Supabase Auth `deleteUser`.
- [x] Add private `BEFORE DELETE ON auth.users` cleanup trigger for RESTRICT-linked GETLINK/legacy sales/calls data.
- [x] Delete calls before conversations so reply FK/check constraints cannot create an invalid half-null reply row.
- [x] Version the current `v21-register` source; registration checks only live usernames and creates a new Auth/account identity.
- [x] Run targeted and canonical CI GREEN.

### Task 3: Production cleanup of historical half-deleted identities

**Scope:** five soft-deleted Users `test3`–`test7` plus five orphan `@taphoa.chat` Auth identities discovered without `v21_accounts`.

- [x] Apply hard-delete trigger migration to production.
- [x] Deploy `v21-account-admin` v4 with Storage + hard-delete flow.
- [x] Remove physical v21 media for `test3`–`test7` via one-shot Storage API cleanup and immediately disable the one-shot endpoint with HTTP 410.
- [x] Patch reply-safe conversation cleanup after a rollback test exposed `v21_messages_reply_contract_check` interaction.
- [x] Verify full `auth.users` deletion succeeds in a transaction rollback before real cleanup.
- [x] Hard-delete exactly the 10 historical target identities.
- [x] Verify zero remaining rows/objects across Auth, `v21_accounts`, legacy profile, sessions, conversations, messages, calls, media metadata, GETLINK orders/debt, legacy orders/debt and Storage scope.
- [x] Verify active accounts remain intact, including `test9` and `etoanthang`.

### Task 4: Final verification and merge

- [x] Targeted account lifecycle tests GREEN.
- [x] Existing keyboard/auth/profile/GETLINK bridge tests GREEN.
- [x] Canonical source verify GREEN.
- [ ] Run final production schema/function/advisor checks.
- [ ] Merge PR #23 to `main` and verify post-merge CI/Pages.
