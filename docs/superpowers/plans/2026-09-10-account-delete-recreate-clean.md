# Account Delete/Recreate Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deleting a Chat User revoke and remove its login identity while preserving `v21_accounts.id` and all Chat/Call/GETLINK history, so the same username can later be registered as a clean new account.

**Architecture:** `v21_accounts.id` remains the durable business/history identity. `auth.users` is only a credential/login identity and may be removed after a User is soft-deleted. Change `v21_accounts.auth_user_id` to nullable with `ON DELETE SET NULL`; then Admin delete soft-deletes and revokes app sessions before deleting the linked Supabase Auth User. Registration continues to create a fresh Auth User + fresh active `v21_accounts` row.

**Tech Stack:** Supabase Postgres/Auth, Supabase Edge Functions, TypeScript/Deno, Python unittest contract tests.

**Spec:** Current CHAT + GETLINK checkpoint in conversation, with existing rule that account history must be preserved and GETLINK has no separate login.

## Global Constraints

- Do not change Chat's one-account/one-active-session policy.
- Do not change Call runtime behavior.
- Do not add a GETLINK login or session store.
- Keep old `v21_accounts.id` rows for Chat/Call/GETLINK historical foreign keys.
- New registration of a previously deleted username must get a new Auth User and new `v21_accounts.id`.
- Only credential/Auth rows for deleted or truly orphaned User accounts may be removed during cleanup; active Admin/User identities must remain untouched.
- No GETLINK business tables are deleted or rewritten.

---

### Task 1: Lock delete/recreate semantics with RED tests

**Files:**
- Create: `tests/test_v21_account_delete_recreate.py`
- Test: `supabase/functions/v21-account-admin/index.ts`
- Test: migration directory under `supabase/migrations/`

**Interfaces:**
- Requires migration contract: `auth_user_id` nullable and FK `ON DELETE SET NULL`.
- Requires delete action contract: revoke app sessions first, then call `admin.auth.admin.deleteUser(target.auth_user_id)`.
- Requires registration contract to keep fresh `createUser` behavior for reused usernames.

- [ ] **Step 1: Write failing tests** asserting migration changes `auth_user_id` to nullable and replaces CASCADE with SET NULL; asserting Admin delete invokes Supabase Auth delete after revoke; asserting register still creates a fresh Auth User.
- [ ] **Step 2: Run targeted unittest and confirm RED** because no migration/deleteUser call exists yet.
- [ ] **Step 3: Commit RED tests.**

### Task 2: Implement minimal durable-history deletion

**Files:**
- Create: `supabase/migrations/20260910183000_v21_account_auth_identity_detach.sql`
- Modify: `supabase/functions/v21-account-admin/index.ts`
- Test: `tests/test_v21_account_delete_recreate.py`

**Interfaces:**
- Database keeps `v21_accounts.id`; deleting `auth.users.id` sets only `v21_accounts.auth_user_id = NULL`.
- Admin delete returns success only after app account soft-delete, app-session revoke, and Auth User delete succeed.

- [ ] **Step 1: Add migration** dropping NOT NULL and replacing `v21_accounts_auth_user_id_fkey` with `ON DELETE SET NULL`.
- [ ] **Step 2: Update Admin delete** to revoke sessions and then delete `target.auth_user_id`; return a specific failure if Auth deletion fails rather than silently leaving a half-deleted credential.
- [ ] **Step 3: Run targeted tests and confirm GREEN.**
- [ ] **Step 4: Run full Chat verification.**

### Task 3: Apply schema/function and clean historical credential debris

**Files:**
- Production Supabase project `gcnoahqsrquxkwkjbuxy`.

**Interfaces:**
- Cleanup candidates are only `role=user` identities whose `v21_accounts.deleted_at IS NOT NULL`, plus Auth Users with `@taphoa.chat` email that have no `v21_accounts` row.
- Preserve all `v21_accounts` historical rows and all business/chat data referencing them.

- [ ] **Step 1: Apply migration to production.**
- [ ] **Step 2: Deploy updated `v21-account-admin` Edge Function.**
- [ ] **Step 3: Re-query FK/nullability before cleanup.**
- [ ] **Step 4: Delete credential/Auth identities for soft-deleted User accounts and true orphan `@taphoa.chat` User identities; verify active accounts are unchanged.**
- [ ] **Step 5: Verify old soft-deleted `v21_accounts` rows remain with `auth_user_id = NULL` and historical FK rows remain intact.**
- [ ] **Step 6: Verify a previously deleted username is now available to the registration path without modifying GETLINK.**

### Task 4: Final verification and merge

**Files:**
- Branch `fix/account-delete-recreate-clean`.

**Interfaces:**
- Merge only after targeted tests, full Chat verification, production schema verification, and cleanup checks pass.

- [ ] **Step 1: Run targeted account tests.**
- [ ] **Step 2: Run canonical/full repository verification.**
- [ ] **Step 3: Confirm no Call/session-policy files changed except the account-admin credential deletion boundary.**
- [ ] **Step 4: Merge branch to `main` and verify GitHub Pages/CI.**
