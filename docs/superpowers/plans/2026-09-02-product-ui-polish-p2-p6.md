# Product UI Polish P2–P6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện presentation Chat/Inbox/Call theo đặc tả V2 trên nền shared owners hiện có, giữ Supabase + LiveKit + PWA không đổi và đưa nhánh tới release gate code/CI trước khi test thiết bị thật.

**Architecture:** User/Admin tiếp tục dùng chung `src/ui/chat/*`, `src/call/ui.ts`, `src/ui/icons.ts` và viewport owner. P2 chuyển Admin inbox về một presentation owner duy nhất; P3 polish shared message/attachment/composer; P4 polish shared Call UI bằng SVG và call pill; P5 khóa contract mobile/notification bằng automated tests nhưng không giả lập PASS thiết bị thật; P6 chỉ merge `main` sau khi mọi automated gate PASS và physical-device gate được xác nhận.

**Tech Stack:** Vite 8, TypeScript 6, Vitest 4, Supabase JS, LiveKit Client, PWA Service Worker.

**Spec:** Google Doc `TAPHOA CHAT CALL - ĐẶC TẢ VAI TRÒ & UI POLISH - V2 - 2026-09-02` + `TAPHOA CHAT CALL - PHỤ LỤC MOCKUP GIAO DIỆN & THÔNG BÁO - 2026-09-02`.

## Global Constraints

- User-facing support name is `Hỗ trợ`; `Admin` is a technical role only.
- User1/User2 only chat/call with Hỗ trợ; no User↔User.
- User/Admin share ChatSurface, Composer, Message renderer, attachment/reaction, Call UI, SVG icon system, viewport/keyboard owner.
- Keep VoiceCallSession + LiveKit media/signaling unchanged during presentation polish.
- Mobile input/textarea remains `font-size >= 16px`; never add `user-scalable=no` or `maximum-scale=1`.
- PWA background/lock/system notification remains best effort.
- Do not mark physical iPhone/Android tests PASS unless actually exercised on those devices.
- Every task follows RED → GREEN → full CI; no production code without a failing contract test first.

---

### Task 1: P2 Admin Inbox Single Owner + Search

**Files:**
- Modify: `src/admin/management-ui.ts`
- Modify: `src/admin/management-ui.css`
- Modify: `src/admin-main.ts`
- Modify: `src/admin/management-ui.test.ts`

**Interfaces:**
- Produces `filterAdminInbox(items, filter, query?)` or an equivalent pure filter/search helper.
- `management-ui.ts` is the only owner rendering `#inbox`; `admin-main.ts` only wires Admin runtime, selected conversation and shared surface.

- [ ] Add failing tests proving search matches `displayName` and `username`, long names keep `Avatar | Content | Meta` structure, unread supports `99+`, and legacy `inbox-item` text renderer is absent from production Admin wiring.
- [ ] Run focused Admin tests and confirm RED for missing search/single-owner contract.
- [ ] Add one compact search input above filters and extend pure inbox filtering without changing backend state.
- [ ] Remove legacy per-row inbox renderer from `admin-main.ts`; retain empty/loading data flow through Admin state only.
- [ ] Run focused Admin tests then full CI; commit only after GREEN.

### Task 2: P3 Message Actions + Reaction Presentation

**Files:**
- Modify: `src/ui/chat/message-list.ts`
- Modify: `src/ui/chat/message-list.test.ts`
- Modify: `src/ui/chat/surface.css`
- Create: `src/ui/chat/product-polish-contract.test.ts`

**Interfaces:**
- Message bubble remains canonical renderer.
- Actions stay in DOM capability-wise but are hidden by default; reveal through hover/focus-within on desktop and a per-message `…` toggle suitable for touch.
- Heart summary may stay visible as a compact reaction chip; copy/share controls do not sit permanently beside every message.

- [ ] Add RED tests for an accessible per-message `…` action toggle and for system/call events not receiving normal bubble actions.
- [ ] Implement one message action menu owner in `message-list.ts` using shared SVG `more/heart/copy/share` icons.
- [ ] Add CSS so actions are hidden by default, shown by menu state/hover/focus, without changing timeline width when opened.
- [ ] Verify reaction count presentation remains attached to the message and no second reaction owner is introduced.
- [ ] Run focused message tests + full CI; commit GREEN.

### Task 3: P3 Attachment + Composer Product Presentation

**Files:**
- Modify: `src/ui/chat/message-list.ts`
- Modify: `src/ui/chat/surface.css`
- Modify: `src/ui/chat/composer.test.ts`
- Modify: `src/ui/chat/product-polish-contract.test.ts`

**Interfaces:**
- Image uses thumbnail/viewer path already owned by ConversationSurface.
- Audio continues to use the existing signed URL but presentation wraps playback in a styled audio bubble; no LiveKit use for voice messages.
- File uses a compact file card with shared file icon.
- Composer stays `+ | textarea | mic | send`, mobile Enter=newline, desktop Enter=send.

- [ ] Add RED source/DOM contracts for image radius, file card, audio container, composer rounded shell and `font-size:16px`.
- [ ] Keep native `<audio>` for reliable playback but visually contain it in the app design instead of exposing an unframed browser player.
- [ ] Refine composer spacing/disabled/recording presentation without changing composer behavior.
- [ ] Verify 280px CSS contract and VisualViewport owner remain unchanged.
- [ ] Run focused Chat UI tests + full CI; commit GREEN.

### Task 4: P4 Shared Call SVG + Call Pill

**Files:**
- Modify: `src/ui/icons.ts`
- Modify: `src/ui/icons.test.ts`
- Modify: `src/call/ui.ts`
- Modify: `src/call/ui.test.ts`
- Modify: `src/call/call.css`

**Interfaces:**
- Add shared icon names needed by Call presentation: `minimize`, `speaker`, `speakerOff`/route, `mute`, `unmute`, `endCall`, `acceptCall` as appropriate.
- `VoiceCallSession` API and call states remain unchanged.
- `display='compact'` renders one pill: peer + status/duration + mic + end; tapping main area restores full.
- `display='hidden'` remains compatibility/internal recovery state only and is not exposed as a primary full-screen button.

- [ ] Replace existing tests that expect visible `Ẩn` with RED contracts expecting exactly one minimize primary control and a compact pill.
- [ ] Add RED tests proving production call UI source has no raw `☎`, `🔊`, `🔇`, `🎙`, `✕`, `⌄` glyph controls.
- [ ] Extend shared SVG icon set and render call controls with `iconSvg()`/accessible labels.
- [ ] Incoming full: only Decline/Accept primary actions; no speaker/mic before accept.
- [ ] Outgoing: mute + end; Active: supported speaker route + mute + end.
- [ ] Compact: pill main area + mic + end; hidden state only provides recovery if reached internally.
- [ ] Run Call UI/icon tests + full CI; commit GREEN.

### Task 5: P5 Mobile + Notification Automated Release Contracts

**Files:**
- Create: `src/product-polish-release-contract.test.ts`
- Modify existing tests only where the V2 contract intentionally supersedes old presentation assertions.

**Interfaces:**
- Automated tests prove code contracts only; physical-device rows remain `PENDING DEVICE`.

- [ ] Add RED/then-GREEN source contracts that both `index.html` and `admin/index.html` keep `width=device-width, initial-scale=1.0, viewport-fit=cover` and do not contain `user-scalable=no`/`maximum-scale=1`.
- [ ] Assert User/Admin both call `setupViewportController()` and shared composer CSS contains `font-size:16px`.
- [ ] Assert foreground notification suppression/window-context and scoped navigation tests remain present; do not alter Push/backend without a failing behavior test.
- [ ] Run full CI.
- [ ] Record device gate as pending: iPhone Safari, iPhone Home Screen PWA, Android Chrome/PWA notification/background smoke cannot be claimed by CI.

### Task 6: P6 Version, Merge Gate, Checkpoint

**Files:**
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Create: `docs/checkpoints/TAPHOA_CHAT_PRODUCT_UI_POLISH_2026-09-02.md`
- Update progress tracker/checkpoint source after final state is known.

**Interfaces:**
- Version bump occurs only after all automated P1–P5 gates PASS.
- `main` is updated only by fast-forward/non-force merge after required release gates are satisfied.

- [ ] Add RED version expectation for the new product-polish version, then update `APP_VERSION`.
- [ ] Run final `npm run build` in GitHub Actions and verify typecheck + all Vitest + Vite/PWA build PASS.
- [ ] Compare branch to `main`; require `behind=0` and inspect changed files for accidental backend/LiveKit presentation-unrelated edits.
- [ ] Write checkpoint with branch SHA, main baseline, CI run, rollback SHA, automated PASS list, and explicit physical-device PENDING list.
- [ ] Do **not** label the full release complete or merge `main` if the physical-device release gate remains unverified; leave branch deployable for device testing.
