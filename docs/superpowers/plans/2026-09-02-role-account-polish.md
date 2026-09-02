# Role & Account Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện P1 trong đặc tả V2: User1 tự nâng thành User2 tại chỗ, User2 tự sửa tên/tài khoản/mật khẩu, và Hỗ trợ quản lý/nâng cấp/sửa/reset/xóa User mà không làm mất conversation.

**Architecture:** Giữ nguyên `chat_profiles` + conversation hiện có. User1→User2 tái dùng RPC `chat_upgrade_to_user2` để giữ nguyên `auth_user_id/profile_id/conversation`; sau upgrade chuyển session từ guest storage sang persistent User2 storage. User2 profile dùng RPC riêng để đồng bộ `chat_profiles.username` với auth email. Hỗ trợ dùng Edge Function `taphoaxyz-admin-user` cho các thao tác cần service-role; UI Admin chỉ gọi adapter typed, không chứa business rules.

**Tech Stack:** Vite, TypeScript, Supabase Auth/Postgres/Edge Functions, Vitest.

**Spec:** Google Doc `TAPHOA CHAT CALL - ĐẶC TẢ VAI TRÒ & UI POLISH - V2 - 2026-09-02` — https://docs.google.com/document/d/1VU6OupqPkLW5zarOAe43UYskyEBMLy3gauZc902E2lc/edit

## Global Constraints

- UI phía User chỉ hiển thị “Hỗ trợ”; “Admin” chỉ là role kỹ thuật.
- Không tạo conversation mới khi nâng User1 → User2.
- Không xóa lịch sử chat chỉ vì đổi vai trò hoặc đăng xuất.
- Không mở User↔User.
- Hành động xóa User phải có xác nhận riêng.
- User/Admin tiếp tục dùng shared ChatSurface/Call/Viewport.
- Mọi input mobile giữ font-size >=16px; không dùng `user-scalable=no`.

---

### Task 1: User1 self-upgrade contract

**Files:**
- Modify: `src/user/auth.ts`
- Test: `src/user/auth.test.ts`
- Modify: `src/user-main.ts`
- Modify: `src/user.css`

**Produces:** `upgradeGuestToUser2(...)` validates display name/username/password, invokes `chat_upgrade_to_user2`, refreshes the upgraded auth session, installs it in persistent User2 auth storage, then clears only guest browser storage without ending/deleting the profile.

- [ ] Write failing tests for validation and session handoff.
- [ ] Run focused tests and confirm RED.
- [ ] Implement minimal upgrade contract.
- [ ] Add User1 drawer form: Tên hiển thị + Tài khoản + Mật khẩu; keep separate Login path for existing User2.
- [ ] Run focused + full CI.

### Task 2: User2 profile/account edit

**Files:**
- Create: `supabase/migrations/20260902_user2_account_profile.sql`
- Modify: `src/user/auth.ts`
- Test: `src/user/auth.test.ts`
- Modify: `src/user-main.ts`

**Produces:** RPC `chat_update_user2_account(p_display_name,p_username)` keeps auth email + profile username/display name consistent, with username uniqueness and alias reservation. Existing password change remains separate.

- [ ] Write failing TS tests for normalization/error mapping.
- [ ] Add migration and apply it to live Supabase.
- [ ] Add User2 profile form in drawer.
- [ ] Verify profile update keeps current conversation and session.

### Task 3: Admin account management backend

**Files:**
- Modify: Edge Function `taphoaxyz-admin-user`
- Modify: `src/admin/user2-account.ts`
- Test: `src/admin/user2-account.test.ts`
- Create: `supabase/migrations/20260902_admin_user_metadata.sql`

**Produces:** Edge actions `create_user2`, `upgrade_guest`, `update_user2`, `reset_password`, `delete_user`; admin inbox/detail return `username` + `user_level` needed for classification and management.

- [ ] Write failing adapter tests.
- [ ] Extend migration for inbox/detail metadata.
- [ ] Extend Edge Function with strict admin/profile checks and username validation.
- [ ] Deploy Edge Function with `verify_jwt=true`.
- [ ] Apply migration and verify live schema/RPC outputs.

### Task 4: Admin management UI

**Files:**
- Modify: `src/admin-main.ts`
- Modify: `src/admin.css`
- Test: relevant admin UI/source contract tests

**Produces:** filters `Tất cả / User 2 / Vãng lai / Chưa đọc`; create form includes display name; conversation menu exposes context-appropriate actions; guest upgrade stays in same conversation; delete uses explicit confirmation.

- [ ] Write RED source/behavior tests.
- [ ] Implement filters and account management panel.
- [ ] Ensure no duplicated ChatSurface/Call code.
- [ ] Run full CI.

### Task 5: Naming cleanup + P1 verification

**Files:**
- Modify: `src/user-main.ts` and notification/call copy only where user-visible.
- Test: add source contract preventing `Admin hỗ trợ` in User-facing production copy.

- [ ] Replace User-facing `Admin hỗ trợ` with `Hỗ trợ`.
- [ ] Verify User1 upgrade, User2 edit/login/logout, Admin create/upgrade/edit/reset/delete using non-production test accounts only.
- [ ] Run typecheck + tests + build.
- [ ] Commit P1 checkpoint; do not bump final release version until P2–P5 polish are complete.
