# TAPHOA Chat Functional Core Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining functional gaps in User/Admin Chat + audio Call without redesigning the product UI.

**Architecture:** Keep the existing Supabase + LiveKit + PWA architecture. Harden the current realtime/session/call lifecycle code instead of adding new infrastructure. Use lightweight recovery/fallback logic because this is a small User↔Admin system.

**Tech Stack:** TypeScript, Vite PWA, Supabase Realtime/RPC/Auth, LiveKit, GitHub Pages.

**Spec:** Existing User1/User2/Admin contract already implemented in the repo and approved in chat.

## Global Constraints

- User1 stays Chat-only: no Call, no Push.
- User2 stays Chat + Call + Push.
- Admin stays separate under `/admin/`.
- Do not add Firebase, Redis, native app dependencies, or framework rewrites.
- Keep exact PWA owner registration for User/Admin.
- Prefer recovery/fallback logic over complex new subsystems.
- Do not redesign User/Admin visual layout in this plan.

---

### Task 1: Admin inbox realtime hardening

**Files:**
- Modify: `src/admin/inbox-realtime.ts`
- Modify: `src/admin/runtime.ts`
- Test: `src/admin/runtime.test.ts`

**Interfaces:**
- Consumes: `AdminInboxWatcher.start(onChange)` and `AdminBackend.loadInbox()`.
- Produces: debounced realtime refresh plus visible/pageshow/heartbeat fallback that cannot overlap refreshes.

- [ ] Add a serialized refresh guard so multiple realtime events cannot race and overwrite newer inbox state.
- [ ] Extend the watcher with `visibilitychange`, `pageshow`, and a low-frequency heartbeat fallback.
- [ ] Keep event-driven refresh as primary; heartbeat is recovery only.
- [ ] Verify unread/preview/order update without opening a conversation.

### Task 2: Call restore after background / reload

**Files:**
- Modify: `src/call/voice-session.ts`
- Test: `src/call/voice-session.test.ts`

**Interfaces:**
- Consumes: `chat_get_active_voice_calls`, `joinLiveKit`, `VoiceCallContext`.
- Produces: restore of accepted/connecting/connected call state after PWA resume or cold reopen.

- [ ] When local state has no call id, detect a non-terminal call involving the current profile.
- [ ] Reconstruct direction, peer name, call id, backend state and connected timestamp.
- [ ] Rejoin LiveKit for accepted/connecting/connected calls once, with an in-flight guard.
- [ ] Add `online`/focus recovery in addition to visibility/pageshow.

### Task 3: Call lifecycle fallback and busy/waiting behavior

**Files:**
- Modify: `src/call/voice-session.ts`
- Modify: `src/call/ui.ts`
- Test: existing call state tests.

**Interfaces:**
- Consumes: backend busy reasons and existing compact/hidden UI.
- Produces: deterministic idle/error transitions and clear busy handling without introducing a second concurrent media session.

- [ ] Preserve backend single-active-call rule and surface peer/caller busy cleanly.
- [ ] Ensure decline/cancel/end always returns local state to idle immediately even if RPC fails.
- [ ] Ensure compact/hidden state remains restorable while a call is active/reconnecting.
- [ ] Keep call waiting simple: second call is rejected as busy rather than opening concurrent LiveKit sessions.

### Task 4: Admin/User lifecycle cleanup symmetry

**Files:**
- Modify: `src/admin-main.ts`
- Modify: `src/admin/session.ts`
- Modify: `src/user-main.ts` only if needed for symmetric lifecycle triggers.
- Test: `src/admin/session.test.ts`, existing User2 auth/session tests.

**Interfaces:**
- Consumes: exact PWA registration, push cleanup helpers, server session RPCs, Auth signout.
- Produces: best-effort push/server cleanup with guaranteed local Auth exit.

- [ ] Stop Admin runtime and message runtime before logout.
- [ ] Dispose call UI/media before push/server cleanup.
- [ ] Unsubscribe Push from the exact Admin registration, end server chat session, then Auth signout.
- [ ] Add page/session recovery hooks that do not cross-contaminate User/Admin registrations.

### Task 5: Regression, deploy, and checkpoint backup

**Files:**
- Create/update: checkpoint documentation in repo.
- Create: Google Drive checkpoint document.

**Interfaces:**
- Consumes: final branch SHA, workflow run IDs, deployment status.
- Produces: main deployment plus Drive backup link.

- [ ] Run typecheck/test/build on the feature branch.
- [ ] Review diff to confirm no unrelated UI redesign or architecture expansion.
- [ ] Fast-forward `main` only after green verification.
- [ ] Verify main build + GitHub Pages deploy success.
- [ ] Create a checkpoint with final SHA, files changed, tests, remaining real-device limitations, rollback SHA, and next validation matrix.
- [ ] Save checkpoint to Google Drive and return the GG link.
