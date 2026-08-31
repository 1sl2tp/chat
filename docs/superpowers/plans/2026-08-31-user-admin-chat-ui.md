# User ↔ Admin Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary `TEST + version` screen with the first real mobile-first User ↔ Admin support chat UI, wired to the existing Supabase/Auth/Realtime chat runtime, while preserving owner boundaries and PWA/version diagnostics.

**Architecture:** UI code is presentation-only. It consumes `chat/` state/actions, `viewport/` geometry, and `version.ts`; it does not duplicate session, device, permission, notification, network, or message state. The customer surface is implemented first; Admin remains a separate future route/mode.

**Tech Stack:** Vite 8, TypeScript, Vanilla DOM/CSS, Supabase JS 2.112.4, Vitest, PWA custom Service Worker, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-08-31-user-admin-chat-ui-design.md`

## Global Constraints

- Release version is exactly `CHAT-UI-0.8.0`.
- User 1 and User 2 are states of the same customer profile.
- Customer opens directly into Admin support chat; no login/anonymous gate UI.
- No P2P, contacts, friends, groups, attachments, finished account upgrade, Push backend, WebRTC, TURN, or complete Admin dashboard.
- `chat/` remains sole message/conversation owner.
- `viewport/` remains sole visual viewport/keyboard geometry owner.
- `version.ts` remains sole named version source.
- UI only owns rendering, interaction wiring, layout, and scroll behavior.
- Minimum responsive release widths: 280, 320, 390, 480px.
- Version + Git build ID remain visible in a compact location.
- Existing PWA update lifecycle must remain intact.

---

### Task 1: Lock the customer UI view model contract

**Files:**
- Create: `src/ui/chat/view-model.ts`
- Test: `src/ui/chat/view-model.test.ts`

**Interfaces:**
- Consumes: `ChatRuntimeState` from `src/chat/store.ts` and message state from `src/chat/message-store.ts`.
- Produces: `buildCustomerChatViewModel(chatState, messageState)` returning a presentation-safe model containing `phase`, `title`, `status`, `messages`, and `canSend`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildCustomerChatViewModel } from './view-model'

describe('customer chat view model', () => {
  it('maps ready support chat state into a presentation model without technical internals', () => {
    const model = buildCustomerChatViewModel(
      { phase: 'ready', identity: { internal: 'x' }, supportEntry: { conversation_id: 'c1' }, error: null },
      { phase: 'ready', conversationId: 'c1', messages: [], error: null },
    )

    expect(model.title).toBe('Admin hỗ trợ')
    expect(model.phase).toBe('ready')
    expect(model.canSend).toBe(true)
    expect(model).not.toHaveProperty('identity')
    expect(model).not.toHaveProperty('supportEntry')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/chat/view-model.test.ts`
Expected: FAIL because `view-model.ts` does not exist.

- [ ] **Step 3: Implement the minimal view-model mapper**

Create a small pure function that exposes only customer-safe presentation fields and derives `canSend` only when both chat bootstrap and message runtime are ready.

- [ ] **Step 4: Run the test and full TypeScript check**

Run: `npm test -- src/ui/chat/view-model.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/chat/view-model.ts src/ui/chat/view-model.test.ts
git commit -m "feat: add customer chat view model"
```

---

### Task 2: Add the customer support chat shell

**Files:**
- Create: `src/ui/chat/customer-screen.ts`
- Create: `src/ui/chat/customer-screen.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `subscribeChatRuntime()`, message-store subscription, `buildCustomerChatViewModel()`, and `formatVersionLabel()`.
- Produces: `mountCustomerChatScreen(root: HTMLElement): () => void`.

- [ ] **Step 1: Write the failing DOM-structure test**

Test that mounting creates exactly one customer screen with:
- `Admin hỗ trợ` header;
- status text;
- message list region;
- composer;
- overflow button;
- compact version/build label;
- no `TEST` heading.

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/ui/chat/customer-screen.test.ts`
Expected: FAIL because customer screen module does not exist.

- [ ] **Step 3: Implement shell with semantic DOM**

Implement structural regions only:
- `.chat-screen`
- `.chat-header`
- `.chat-messages`
- `.chat-composer`
- `.chat-overflow`
- `.chat-version`

No duplicate message/session/network state is stored in the component; only DOM references and scroll-position UI state are local.

- [ ] **Step 4: Replace temporary TEST render in `src/main.ts`**

Keep existing runtime startup order:
1. viewport controller;
2. Supabase runtime;
3. chat runtime;
4. mount customer screen;
5. PWA setup.

- [ ] **Step 5: Run tests/build and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/chat src/main.ts
git commit -m "feat: mount customer support chat shell"
```

---

### Task 3: Render real messages with deterministic ownership and dedupe-safe keys

**Files:**
- Create: `src/ui/chat/message-list.ts`
- Test: `src/ui/chat/message-list.test.ts`
- Modify: `src/ui/chat/customer-screen.ts`

**Interfaces:**
- Consumes: message rows already deduped/sorted by `chat/` message owner and current profile id from the chat bootstrap view model if safely available as a derived `currentProfileId` field.
- Produces: `renderMessageList(container, messages, currentProfileId)`.

- [ ] **Step 1: Write failing tests**

Test:
- current-customer messages get outgoing/right-aligned class;
- other messages get incoming/left-aligned class;
- timestamp is secondary text;
- revoked/system rows are rendered quietly or omitted according to row type;
- rendering does not create a second dedupe algorithm.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/ui/chat/message-list.test.ts`
Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement renderer**

Use message `id` as DOM key/data attribute and replace/update nodes deterministically. Do not reorder independently of the chat owner except using the already-sorted input order.

- [ ] **Step 4: Wire message-store subscription into customer screen**

When message owner state changes, render from that state only.

- [ ] **Step 5: Run tests/build and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/chat/message-list.ts src/ui/chat/message-list.test.ts src/ui/chat/customer-screen.ts
git commit -m "feat: render realtime support messages"
```

---

### Task 4: Wire composer send behavior without creating message state in UI

**Files:**
- Create: `src/ui/chat/composer.ts`
- Test: `src/ui/chat/composer.test.ts`
- Modify: `src/ui/chat/customer-screen.ts`
- Modify only if required by existing API: `src/chat/message-runtime.ts`

**Interfaces:**
- Consumes: existing `sendTextMessage(text)` chat action/runtime API; if no stable public function exists, expose one from `chat/` without changing message ownership.
- Produces: `mountComposer(element, { canSend, onSend })` with local draft text only.

- [ ] **Step 1: Write failing interaction tests**

Test:
- empty/whitespace text cannot send;
- typing enables send;
- send trims outer whitespace;
- successful send clears input;
- Enter sends only where appropriate; mobile input behavior must not break multiline composition/IME.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/ui/chat/composer.test.ts`
Expected: FAIL because composer module does not exist.

- [ ] **Step 3: Implement composer**

The only UI-local state is the unsent text draft. Message send success/error remains delegated to chat runtime/action.

- [ ] **Step 4: Wire to customer screen**

Disable send until chat/message owner reports ready.

- [ ] **Step 5: Run tests/build and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/chat/composer.ts src/ui/chat/composer.test.ts src/ui/chat/customer-screen.ts src/chat/message-runtime.ts
git commit -m "feat: wire support chat composer"
```

---

### Task 5: Implement keyboard-aware scroll behavior using viewport owner

**Files:**
- Create: `src/ui/chat/scroll-controller.ts`
- Test: `src/ui/chat/scroll-controller.test.ts`
- Modify: `src/ui/chat/customer-screen.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: CSS variables/state published by existing `viewport/` controller.
- Produces: `createConversationScrollController(scroller)` with `capturePosition()`, `onViewportChange()`, and `onMessagesChanged()`.

- [ ] **Step 1: Write failing scroll-policy tests**

Test pure policy helpers:
- if user is within bottom threshold, keyboard/message update keeps bottom anchored;
- if user is reading older messages, viewport resize does not force bottom;
- composer safe-area is additive and does not use fixed keyboard pixel guesses.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/ui/chat/scroll-controller.test.ts`
Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement policy/controller**

Use scroll metrics + existing viewport CSS variables. Do not read browser identity to branch behavior.

- [ ] **Step 4: Add mobile layout CSS**

Requirements:
- `min-width: 280px` retained;
- screen uses visible viewport height variable when available;
- composer pinned inside app shell above keyboard;
- safe area uses `env(safe-area-inset-bottom)` at composer parent;
- 280/320/390/480 widths do not horizontally overflow.

- [ ] **Step 5: Run tests/build and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/chat/scroll-controller.ts src/ui/chat/scroll-controller.test.ts src/ui/chat/customer-screen.ts src/style.css
git commit -m "feat: add mobile keyboard chat geometry"
```

---

### Task 6: Add truthful overflow menu for upgrade/management entry points

**Files:**
- Create: `src/ui/chat/overflow-menu.ts`
- Test: `src/ui/chat/overflow-menu.test.ts`
- Modify: `src/ui/chat/customer-screen.ts`

**Interfaces:**
- Produces four visible entries exactly:
  - `Lưu cuộc trò chuyện`
  - `Cập nhật tên & địa chỉ`
  - `Bật thông báo`
  - `Kết thúc & xóa`

- [ ] **Step 1: Write failing menu test**

Assert all four entries exist and any action lacking complete backend behavior is disabled/marked unavailable rather than faked.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/ui/chat/overflow-menu.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal menu**

`Bật thông báo` may invoke the existing permission owner only if there is already a complete user-gesture-safe call available. Other unfinished actions remain visibly disabled or marked `Sắp có`.

- [ ] **Step 4: Wire menu button and dismiss behavior**

Keep menu state local to UI; do not alter profile/session state.

- [ ] **Step 5: Run tests/build and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/chat/overflow-menu.ts src/ui/chat/overflow-menu.test.ts src/ui/chat/customer-screen.ts
git commit -m "feat: add customer chat management menu"
```

---

### Task 7: Update release version and preserve build diagnostics

**Files:**
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Test: existing PWA/version tests

**Interfaces:**
- Produces: `APP_VERSION = 'CHAT-UI-0.8.0'`.

- [ ] **Step 1: Update version test first**

Change expected named version and rendered label to `CHAT-UI-0.8.0`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/version.test.ts`
Expected: FAIL while production version still reports previous version.

- [ ] **Step 3: Update `src/version.ts`**

Set exactly:

```ts
export const APP_VERSION = 'CHAT-UI-0.8.0' as const
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/version.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/version.ts src/version.test.ts
git commit -m "chore: release CHAT-UI-0.8.0"
```

---

### Task 8: Release verification and production deploy

**Files:**
- No feature code unless verification exposes a defect.
- Update plan checkboxes/status if useful.

**Interfaces:**
- Release output: GitHub Pages production at `https://1sl2tp.github.io/chat/`.

- [ ] **Step 1: Run full automated verification**

Run through CI-equivalent commands:

```bash
npm ci
npm test
npm run build
```

Expected: all PASS, no TypeScript error.

- [ ] **Step 2: Verify responsive geometry**

Check at 280, 320, 390, 480px:
- no horizontal overflow;
- header remains usable;
- message bubbles stay inside content width;
- composer remains usable;
- version remains visible but secondary.

- [ ] **Step 3: Verify real data path**

On two active clients:
1. support conversation loads;
2. send text from customer;
3. no duplicate message appears;
4. second active client receives Realtime update.

- [ ] **Step 4: Verify mobile PWA keyboard/update path**

On iOS PWA and Android PWA:
- keyboard does not cover composer;
- last message stays visible when already at bottom;
- reading older messages is not force-scrolled;
- app returns from background without losing chat state;
- named version/build updates via existing PWA lifecycle.

- [ ] **Step 5: Merge/fast-forward verified release to `main` and wait for Pages deploy**

Only report completion after both build and deploy jobs conclude `success`.

## Self-review

- Spec coverage: customer direct-entry UI, message rendering, composer, keyboard/viewport behavior, truthful overflow menu, owner boundaries, version/build, responsive/mobile gates are all covered.
- Explicit out-of-scope items remain absent.
- No second auth/message/network/permission state machine is introduced.
- No placeholder/fake persistence or deletion behavior is permitted.
- Type/interface names are consistent across tasks.
