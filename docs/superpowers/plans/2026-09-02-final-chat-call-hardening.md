# Final Chat/Call Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện 5 mốc cuối: decline đa thiết bị, Admin inbox realtime, Call/PWA lifecycle tests, compact UI, final hardening/checkpoint.

**Architecture:** Giữ nguyên Vite/TypeScript/Supabase/LiveKit/PWA. Chỉ thay semantics decline ở RPC, thêm một Admin inbox Realtime watcher nhẹ, bổ sung tests cho lifecycle hiện có, chỉnh presentation CSS/DOM nhỏ và chốt production bằng full gate.

**Tech Stack:** TypeScript, Vitest, Vite, Supabase Postgres/Realtime, LiveKit, Web Push, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-final-chat-call-hardening-design.md`

## Global Constraints
- Không thêm Firebase, Redis, queue riêng, native CallKit/FCM hay 2-call state machine.
- User1 vẫn Chat only; User2/Admin mới Call + Push.
- Một callee device từ chối = toàn call bị decline.
- Admin inbox realtime dùng một Supabase channel; không polling.
- Không claim device-physical PASS nếu chưa có thao tác thật.

---

### Task 1: Decline toàn cuộc gọi từ một thiết bị

**Files:**
- Create: `src/call/decline-all-devices.test.ts`
- Create: `supabase/migrations/20260902_decline_call_all_devices.sql`

**Interfaces:**
- Consumes: RPC `chat_decline_voice_call(p_call_id uuid, p_device_id uuid)`.
- Produces: RPC giữ cùng signature nhưng bất kỳ decline hợp lệ nào kết thúc toàn call.

- [ ] Viết RED test đọc migration và yêu cầu cập nhật toàn bộ target ringing + `chat_calls.state='declined'`.
- [ ] Chạy CI branch, xác nhận test mới fail vì migration chưa tồn tại.
- [ ] Viết migration thay function; validate callee/device như cũ, sau đó update mọi target ringing của call thành declined và update call thành declined ngay.
- [ ] Chạy full typecheck/test/build và xác nhận GREEN.
- [ ] Apply migration production sau khi GREEN, rồi đọc lại function live.

### Task 2: Admin inbox realtime

**Files:**
- Create: `src/admin/inbox-realtime.ts`
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/runtime.test.ts`
- Modify: `src/admin-main.ts`

**Interfaces:**
- Produces: `AdminInboxWatcher { start(onChange): void; stop(): void }`, `stopAdminRuntime(): void`.
- `startAdminRuntime()` load inbox rồi start watcher; watcher callback gọi `refreshAdminInbox()` qua debounce 100ms.

- [ ] Viết RED tests: start runtime starts watcher; watcher change reloads inbox; stop runtime stops watcher; switching conversation không stop global watcher.
- [ ] Xác nhận RED.
- [ ] Implement watcher bằng `adminSupabase.channel('admin-inbox').on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},...)` và cleanup `removeChannel`.
- [ ] Nối lifecycle vào runtime và logout/login workspace.
- [ ] Chạy full gate GREEN.

### Task 3: Call/PWA lifecycle verification

**Files:**
- Modify/add tests near `src/call/voice-session*.test.ts`, `src/pwa/navigation.test.ts` hoặc existing SW wiring tests only where coverage is missing.

**Interfaces:**
- Không đổi production API nếu behavior hiện có đã đúng.

- [ ] Kiểm existing tests cho notification navigation đúng scope, foreground rediscovery, reconnect/resume và decline immediate UI reset.
- [ ] Chỉ viết RED cho gap thật sự.
- [ ] Nếu RED lộ bug, sửa tối thiểu đúng owner; nếu không có gap production, giữ code nguyên.
- [ ] Full gate GREEN.

### Task 4: Compact Admin/User UI

**Files:**
- Modify: `src/admin-main.ts`
- Modify: `src/admin.css`
- Modify: `src/user.css`
- Modify only presentation tests/contracts if required.

**Interfaces:**
- Admin inbox item becomes two-line structure: name/unread + preview.
- No route/business/auth/call behavior changes.

- [ ] Chuyển inbox item DOM sang `strong + unread badge + small preview`.
- [ ] Giảm header/action height/padding và button visual weight trên mobile.
- [ ] Giữ 280px safe width, no horizontal overflow.
- [ ] Build/test gate.

### Task 5: Final hardening, merge, deploy, checkpoint

**Files:**
- Create: `docs/checkpoints/TAPHOA_CHAT_FINAL_HARDENING_2026-09-02.md`

**Interfaces:**
- Rollback ref = `main` SHA ngay trước merge.

- [ ] Rà read-only production: Push subscriptions Admin/User2, active sessions, outbox errors, stale ringing calls.
- [ ] Run fresh full branch gate and compare branch vs main; require behind=0.
- [ ] Fast-forward main without force.
- [ ] Verify main Pages build + deploy success and no Android APK auto-run.
- [ ] Ghi checkpoint repo với SHA, migrations, tests, limitations, rollback.
- [ ] Tạo checkpoint tương ứng trên Google Drive và lưu link.
