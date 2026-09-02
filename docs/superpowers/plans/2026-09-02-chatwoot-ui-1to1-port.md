# TAPHOA Chatwoot UI 1:1 Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TAPHOA's overlapping chat presentation owners with a single Web/PWA port of Chatwoot Mobile's conversation/inbox UI ownership model while preserving TAPHOA Supabase, LiveKit, PWA, notification, and User 1/User 2 business behavior.

**Architecture:** Keep an immutable, provenance-tracked Chatwoot UI mirror under `vendor/chatwoot-mobile-ui/`, then implement a browser-native port under `src/ui/chatwoot-port/`. User and Admin must both consume the same `ConversationScreen` presentation owner. Existing Supabase/LiveKit/session code remains behind typed adapters so the UI can be replaced without backend migration.

**Tech Stack:** Vite, TypeScript, DOM/CSS, Vitest, existing TAPHOA Supabase client, LiveKit call runtime, existing VisualViewport/PWA runtime.

**Spec:** `docs/superpowers/specs/2026-09-02-chatwoot-ui-1to1-port-design.md`

## Global Constraints

- Primary visual source: `chatwoot/chatwoot-mobile-app` branch `develop`.
- Secondary source: `chatwoot/chatwoot-react-native-widget` branch `develop`.
- Chatwoot source is MIT-licensed; copied/substantially ported source must preserve Chatwoot copyright and MIT notice.
- `vendor/chatwoot-mobile-ui/` is read-only reference and MUST NOT be imported by production Vite code.
- Runtime remains Vite + TypeScript Web/PWA; do not migrate TAPHOA to React Native/Expo.
- Supabase remains auth/data/realtime owner.
- LiveKit remains call media/signaling owner.
- User ↔ Hỗ trợ only; User 1 = guest, User 2 = account; no User ↔ User chat.
- User and Admin must share one conversation presentation owner.
- Admin Inbox defaults to exactly two sections: `USER 2` and `USER 1`; no default `Tất cả` or `Chưa đọc` chips.
- Conversation shell is visual-viewport height; timeline is the only vertical scroller; composer is a non-scrolling bottom row.
- Input font remains at least 16px on iOS Web/PWA.
- Physical-device iOS/Android behavior cannot be marked PASS from CI alone.
- Keep legacy presentation behind an internal switch until the new owner passes automated/screenshot gates.
- Do not bump production version until the complete release-source gate passes.

---

## File Structure Locked by This Plan

### Read-only upstream mirror

- `vendor/chatwoot-mobile-ui/LICENSE` — exact upstream MIT license.
- `vendor/chatwoot-mobile-ui/UPSTREAM.json` — repo, branch, commit, mirror timestamp, file list and SHA-256 values.
- `vendor/chatwoot-mobile-ui/src/...` — exact selected Chatwoot files, no edits.
- `scripts/verify-chatwoot-mirror.mjs` — verifies hashes and that runtime source does not import `vendor/`.

### Runtime port

- `src/ui/chatwoot-port/contracts.ts` — UI-facing view models/adapters only.
- `src/ui/chatwoot-port/tokens.css` — Chatwoot-derived web tokens.
- `src/ui/chatwoot-port/conversation-screen.ts` — shared User/Admin conversation root.
- `src/ui/chatwoot-port/conversation-shell.css` — Header/Timeline/Composer geometry.
- `src/ui/chatwoot-port/chat-header.ts` — shared header presentation.
- `src/ui/chatwoot-port/messages/message-list.ts` — timeline renderer/orchestrator.
- `src/ui/chatwoot-port/messages/message-model.ts` — classification/grouping.
- `src/ui/chatwoot-port/messages/message.css` — bubble/footer/grouping geometry.
- `src/ui/chatwoot-port/messages/renderers/*.ts` — text, image, audio, file, link, system, call.
- `src/ui/chatwoot-port/composer/composer.ts` — compact reply box.
- `src/ui/chatwoot-port/composer/composer.css` — sticky composer/voice presentation.
- `src/ui/chatwoot-port/scroll/scroll-owner.ts` — sticky-bottom/new-message/focus behavior.
- `src/ui/chatwoot-port/inbox/inbox.ts` — Admin search + USER 2/USER 1 grouped list.
- `src/ui/chatwoot-port/inbox/inbox.css` — list/group geometry.
- `src/ui/chatwoot-port/account/account-drawer.ts` — User identity/settings grouping.
- `src/ui/chatwoot-port/account/account.css` — drawer presentation.
- `src/ui/chatwoot-port/index.ts` — public exports only.

### Runtime adapters

- `src/chat/ui/chatwoot-adapter.ts` — maps existing conversation/message runtime into Chatwoot-port contracts.
- `src/admin/chatwoot-inbox-adapter.ts` — maps Admin management model to grouped Inbox model.
- Existing Supabase/LiveKit implementation files remain backend owners and are not moved.

---

### Task 1: Mirror Chatwoot UI Source with Provenance

**Files:**
- Create: `vendor/chatwoot-mobile-ui/LICENSE`
- Create: `vendor/chatwoot-mobile-ui/UPSTREAM.json`
- Create: selected files under `vendor/chatwoot-mobile-ui/src/`
- Create: `scripts/verify-chatwoot-mirror.mjs`
- Create: `src/ui/chatwoot-port/vendor-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: upstream Chatwoot `develop` source and MIT license.
- Produces: immutable reference mirror plus `npm run verify:chatwoot-mirror`.

- [ ] **Step 1: Write failing vendor contract test**

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const required = [
  'vendor/chatwoot-mobile-ui/LICENSE',
  'vendor/chatwoot-mobile-ui/UPSTREAM.json',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/ChatScreen.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-list/MessagesList.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-item/Message.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/reply-box/ReplyBoxContainer.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/conversations/ConversationScreen.tsx',
]

describe('Chatwoot vendor mirror', () => {
  it('contains license, provenance and canonical UI owners', () => {
    for (const path of required) expect(fs.existsSync(path), path).toBe(true)
  })

  it('is never imported by production src', () => {
    const files = fs.readdirSync('src', { recursive: true })
      .filter(path => typeof path === 'string' && /\.(ts|css)$/.test(path))
    const offender = files.find(path =>
      fs.readFileSync(`src/${path}`, 'utf8').includes('vendor/chatwoot-mobile-ui'))
    expect(offender).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/ui/chatwoot-port/vendor-contract.test.ts`
Expected: FAIL because mirror files do not exist.

- [ ] **Step 3: Copy exact upstream source files and LICENSE without editing**

Mirror at minimum the complete directories named in the spec: chat header, message list, message item, message components, reply box, audio recorder, conversation screen and the conversation list/header/item dependencies required to understand visible geometry. Preserve original paths beneath `vendor/chatwoot-mobile-ui/src/`.

- [ ] **Step 4: Generate `UPSTREAM.json` with deterministic metadata**

Required shape:

```json
{
  "repository": "chatwoot/chatwoot-mobile-app",
  "branch": "develop",
  "commit": "<exact resolved upstream commit SHA>",
  "license": "MIT",
  "files": [
    { "path": "src/screens/chat-screen/ChatScreen.tsx", "sha256": "<64 hex>" }
  ]
}
```

Sort `files` lexicographically by `path`.

- [ ] **Step 5: Implement mirror verifier**

`scripts/verify-chatwoot-mirror.mjs` must:
1. read `UPSTREAM.json`;
2. SHA-256 every mirrored file listed;
3. fail if a hash differs or a file is missing;
4. scan `src/**/*.{ts,css}` and fail on imports/references into `vendor/chatwoot-mobile-ui`.

Add package script:

```json
"verify:chatwoot-mirror": "node scripts/verify-chatwoot-mirror.mjs"
```

- [ ] **Step 6: Run GREEN gate**

Run:
`npm run verify:chatwoot-mirror && npx vitest run src/ui/chatwoot-port/vendor-contract.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `chore: mirror Chatwoot UI source with provenance`

---

### Task 2: Define the Web-Port Contracts and Presentation Switch

**Files:**
- Create: `src/ui/chatwoot-port/contracts.ts`
- Create: `src/ui/chatwoot-port/contracts.test.ts`
- Create: `src/ui/chatwoot-port/presentation-switch.ts`
- Test: `src/ui/chatwoot-port/presentation-switch.test.ts`

**Interfaces:**
- Produces:

```ts
export type UserKind = 'user1' | 'user2'
export type MessageKind = 'text' | 'image' | 'audio' | 'file' | 'link' | 'system' | 'call'

export interface MessageViewModel {
  id: string
  kind: MessageKind
  direction: 'incoming' | 'outgoing' | 'center'
  senderId?: string
  text?: string
  createdAt: string
  callId?: string
  durationSeconds?: number
  attachment?: { url: string; name?: string; mimeType?: string; size?: number; width?: number; height?: number }
  reaction?: 'heart'
}

export interface ConversationViewModel {
  id: string
  title: string
  subtitle?: string
  messages: MessageViewModel[]
}

export interface ConversationActionsAdapter {
  sendText(text: string): Promise<void>
  sendAttachment(file: File): Promise<void>
  startVoiceRecording(): Promise<void>
  stopVoiceRecording(): Promise<void>
  startCall(): Promise<void>
}
```

- [ ] **Step 1: Write contract tests** ensuring the runtime models contain no Supabase/LiveKit client types and the switch defaults to legacy until explicit cutover.
- [ ] **Step 2: Run RED** with `npx vitest run src/ui/chatwoot-port/contracts.test.ts src/ui/chatwoot-port/presentation-switch.test.ts`.
- [ ] **Step 3: Implement minimal contracts and switch** using a build/runtime-safe string union: `'legacy' | 'chatwoot-port'`.
- [ ] **Step 4: Run GREEN**.
- [ ] **Step 5: Commit** as `feat: add Chatwoot port UI contracts`.

---

### Task 3: Port Chatwoot Conversation Shell 1:1 to Browser Geometry

**Files:**
- Create: `src/ui/chatwoot-port/tokens.css`
- Create: `src/ui/chatwoot-port/conversation-screen.ts`
- Create: `src/ui/chatwoot-port/conversation-shell.css`
- Create: `src/ui/chatwoot-port/chat-header.ts`
- Create: `src/ui/chatwoot-port/conversation-screen.test.ts`
- Create: `src/ui/chatwoot-port/conversation-layout-contract.test.ts`

**Interfaces:**
- Consumes: `ConversationViewModel`, header callbacks, child timeline/composer hosts.
- Produces:

```ts
export interface ConversationScreenMountOptions {
  root: HTMLElement
  model: ConversationViewModel
  onBack?: () => void
  onCall?: () => void
}

export function mountConversationScreen(options: ConversationScreenMountOptions): {
  timeline: HTMLElement
  composerHost: HTMLElement
  update(model: ConversationViewModel): void
  destroy(): void
}
```

- [ ] **Step 1: Write failing DOM test** that asserts one root with exactly three vertical owners: header, timeline, composer.
- [ ] **Step 2: Write failing CSS contract test** asserting:
  - shell uses `height: var(--app-visual-height, 100dvh)`;
  - grid rows are `auto minmax(0, 1fr) auto`;
  - timeline has `min-height: 0` and `overflow-y: auto`;
  - composer host does not scroll with timeline.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Implement shell/header using semantic DOM** (`header`, `main`, `footer`, `button`) and Chatwoot-derived radii/spacing tokens.
- [ ] **Step 5: Add responsive contracts** for 280/320/390/480 and 760/761/999/1000/1280/1440 without separate User/Admin layout branches.
- [ ] **Step 6: Run GREEN tests**.
- [ ] **Step 7: Commit** as `feat: port Chatwoot conversation shell`.

---

### Task 4: Port Message Grouping, Footer, and Renderer Pipeline

**Files:**
- Create: `src/ui/chatwoot-port/messages/message-model.ts`
- Create: `src/ui/chatwoot-port/messages/message-model.test.ts`
- Create: `src/ui/chatwoot-port/messages/message-list.ts`
- Create: `src/ui/chatwoot-port/messages/message-list.test.ts`
- Create: `src/ui/chatwoot-port/messages/message.css`
- Create: `src/ui/chatwoot-port/messages/renderers/text.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/image.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/audio.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/file.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/link.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/system.ts`
- Create: `src/ui/chatwoot-port/messages/renderers/call.ts`

**Interfaces:**
- Produces:

```ts
export interface PresentedMessage extends MessageViewModel {
  groupWithPrevious: boolean
  groupWithNext: boolean
}

export function presentMessages(messages: MessageViewModel[]): PresentedMessage[]
export function renderMessage(message: PresentedMessage): HTMLElement
```

- [ ] **Step 1: Write failing grouping tests**: same sender + same text role groups; direction/kind/system/call boundaries break grouping.
- [ ] **Step 2: Write failing footer/reaction test**: timestamp lives in a flow footer; heart occupies a separate reaction slot and cannot share absolute bottom-right coordinates.
- [ ] **Step 3: Write failing renderer selection tests** for all seven `MessageKind` values.
- [ ] **Step 4: Run RED**.
- [ ] **Step 5: Implement `presentMessages` and renderer dispatch**.
- [ ] **Step 6: Implement text bubble geometry from Chatwoot `MessageWrapper`**: reduced inter-message gap for grouped rows, rounded-corner changes, metadata only on terminal row of a visual group where appropriate.
- [ ] **Step 7: Implement renderer-specific DOM** without reusing one generic bubble for system/call.
- [ ] **Step 8: Run GREEN**.
- [ ] **Step 9: Commit** as `feat: port Chatwoot message presentation pipeline`.

---

### Task 5: Stabilize Media, Link Preview, Call Timeline and Context Actions

**Files:**
- Modify: `src/ui/chatwoot-port/messages/renderers/image.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/audio.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/file.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/link.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/call.ts`
- Reuse/modify only where needed: `src/ui/chat/call-timeline.ts`, `src/ui/chat/link-preview.ts`
- Create: `src/ui/chatwoot-port/messages/media-contract.test.ts`

**Interfaces:**
- Image actions: `open`, `save`, `share`.
- Audio actions: `play/pause`, `seek`, `save`, `share`.
- File actions: `open`, `save`, `share`.
- Call adapter output is already collapsed to one semantic row per `call_id` before rendering.

- [ ] **Step 1: Write RED media tests** verifying image aspect-ratio placeholder and no permanent Save/Share row.
- [ ] **Step 2: Write RED audio persistence test**: rendering an unchanged message list twice must reuse the same `<audio>`/player root node for the same message id.
- [ ] **Step 3: Write RED contextual-action test**: actions are hidden until hover/focus/`…` activation and do not increase base row height.
- [ ] **Step 4: Write RED call tests** for one `call_id` → one semantic row and sequential unanswered sessions → `N cuộc gọi chưa kết nối`.
- [ ] **Step 5: Write RED link test** for decoded HTML entities and URL-only fallback.
- [ ] **Step 6: Implement minimal media/call/link behavior**, reusing existing TAPHOA link-preview and call semantic data owners rather than duplicating them in CSS.
- [ ] **Step 7: Run GREEN**.
- [ ] **Step 8: Commit** as `feat: port Chatwoot media and activity presentation`.

---

### Task 6: Port Chatwoot ReplyBox and Scroll Ownership

**Files:**
- Create: `src/ui/chatwoot-port/composer/composer.ts`
- Create: `src/ui/chatwoot-port/composer/composer.css`
- Create: `src/ui/chatwoot-port/composer/composer.test.ts`
- Create: `src/ui/chatwoot-port/scroll/scroll-owner.ts`
- Create: `src/ui/chatwoot-port/scroll/scroll-owner.test.ts`
- Modify: `src/ui/chatwoot-port/conversation-screen.ts`

**Interfaces:**

```ts
export interface ScrollOwner {
  onInitialRender(): void
  onComposerFocus(): void
  onLocalMessageSent(): void
  onRemoteMessageAdded(): void
  onTimelineResize(): void
  onUserScroll(): void
  scrollToLatest(): void
  destroy(): void
}
```

- [ ] **Step 1: Write RED composer DOM test**: compact row is `+ | textarea | mic/send`; textarea font >=16px.
- [ ] **Step 2: Write RED voice-state test**: recording presentation replaces the normal input content instead of adding a permanent second card.
- [ ] **Step 3: Write RED scroll tests**:
  - initial/focus/local-send scroll to true latest;
  - remote message auto-scrolls only when near bottom;
  - manual scroll-up preserves position and exposes new-message affordance;
  - async timeline height change keeps bottom anchor only when sticky.
- [ ] **Step 4: Run RED**.
- [ ] **Step 5: Implement composer and scroll owner** using the timeline element as the only scroll container and the existing VisualViewport CSS variable as viewport input.
- [ ] **Step 6: Add ResizeObserver to timeline content** and preserve audio/media node identity.
- [ ] **Step 7: Run GREEN**.
- [ ] **Step 8: Commit** as `feat: port Chatwoot reply box and scroll owner`.

---

### Task 7: Wire One Shared Conversation Owner into User and Admin

**Files:**
- Create: `src/chat/ui/chatwoot-adapter.ts`
- Create: `src/chat/ui/chatwoot-adapter.test.ts`
- Modify: current User conversation bootstrap/entry that mounts shared ChatSurface.
- Modify: current Admin selected-conversation bootstrap/entry.
- Modify: `src/ui/chatwoot-port/presentation-switch.ts`
- Create: `src/ui/chatwoot-port/shared-owner-contract.test.ts`

**Interfaces:**
- `toConversationViewModel(existingRuntimeState): ConversationViewModel`
- `toConversationActionsAdapter(existingRuntime): ConversationActionsAdapter`

- [ ] **Step 1: Write RED static shared-owner test** proving User and Admin both import `mountConversationScreen` and neither introduces a second Chatwoot-port composer/message-list implementation.
- [ ] **Step 2: Write RED adapter tests** for User 1, User 2 and Admin directions/capabilities.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Implement adapters only**; do not move Supabase/LiveKit code into UI port.
- [ ] **Step 5: Mount Chatwoot port behind presentation switch for both User and Admin**.
- [ ] **Step 6: Run full conversation tests** plus existing call/notification suites.
- [ ] **Step 7: Commit** as `feat: share Chatwoot conversation owner across user and admin`.

---

### Task 8: Replace Admin Inbox with One Chatwoot-Style List Owner

**Files:**
- Create: `src/ui/chatwoot-port/inbox/inbox.ts`
- Create: `src/ui/chatwoot-port/inbox/inbox.css`
- Create: `src/ui/chatwoot-port/inbox/inbox.test.ts`
- Create: `src/admin/chatwoot-inbox-adapter.ts`
- Modify: Admin management UI mount path.

**Interfaces:**

```ts
export interface InboxUserRow {
  id: string
  kind: 'user1' | 'user2'
  displayName: string
  username?: string
  preview?: string
  timestamp?: string
}

export interface InboxModel {
  user2: InboxUserRow[]
  user1: InboxUserRow[]
}
```

- [ ] **Step 1: Write RED Inbox test** requiring exactly Search → USER 2 section → USER 1 section, with no `Tất cả`/`Chưa đọc` default chips.
- [ ] **Step 2: Write RED geometry test** proving section headers are in document flow and cannot overlay first rows.
- [ ] **Step 3: Write RED navigation test**: selecting a row opens full-screen shared Conversation owner; Back restores Inbox and prior scroll/search state.
- [ ] **Step 4: Implement adapter/list**.
- [ ] **Step 5: Remove active legacy filter decorator from the new path** but leave legacy route intact behind presentation switch.
- [ ] **Step 6: Run GREEN**.
- [ ] **Step 7: Commit** as `feat: port Chatwoot admin inbox`.

---

### Task 9: Port User Account Drawer Structure

**Files:**
- Create: `src/ui/chatwoot-port/account/account-drawer.ts`
- Create: `src/ui/chatwoot-port/account/account.css`
- Create: `src/ui/chatwoot-port/account/account-drawer.test.ts`
- Modify: User account/settings mount adapter.

**Interfaces:**

```ts
export interface AccountDrawerModel {
  displayName: string
  username?: string
  kind: 'user1' | 'user2'
  canEditProfile: boolean
  canManageNotifications: boolean
  canChangePassword: boolean
  canDeleteAccount: boolean
}
```

- [ ] **Step 1: Write RED identity-order test**: Display name → `@username` → User type.
- [ ] **Step 2: Write RED section test**: exactly `Sửa thông tin`, `Thông báo`, `Quản lý tài khoản` as top-level grouped sections.
- [ ] **Step 3: Write RED capability test**: destructive controls absent when backend capability is false.
- [ ] **Step 4: Implement drawer and move notification diagnostics into `Thông báo` presentation only**.
- [ ] **Step 5: Run GREEN**.
- [ ] **Step 6: Commit** as `feat: port Chatwoot-style account drawer`.

---

### Task 10: Cut Over, Screenshot Gate, Remove Superseded Owners, Release

**Files:**
- Modify: `src/ui/chatwoot-port/presentation-switch.ts`
- Modify/delete only after proof: superseded legacy conversation CSS/decorators/duplicate message compactors.
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Create: `src/ui/chatwoot-port/release-contract.test.ts`
- Update: release/checkpoint docs.

**Interfaces:**
- Production presentation becomes `chatwoot-port` only after all gates below pass.

- [ ] **Step 1: Add release contract test** asserting no production User/Admin path imports the legacy conversation owner after cutover and no duplicate call compactor remains in renderer path.
- [ ] **Step 2: Run complete pre-cutover gate**:

`npm run verify:chatwoot-mirror && npm run typecheck && npm run test && npm run build`

Expected: PASS.

- [ ] **Step 3: Run screenshot/geometry matrix** at 280, 320, 390, 480, 760, 761, 999, 1000, 1280, 1440 and compare User/Admin conversation geometry from the same fixture.

Required visible assertions:
- composer fully visible;
- timeline can reach true latest row;
- USER 2/USER 1 headers do not overlay rows;
- reaction does not overlap timestamp;
- audio action controls are contextual;
- media loading does not pull a manually scrolled-up user to bottom.

- [ ] **Step 4: Switch default presentation to `chatwoot-port`**.
- [ ] **Step 5: Delete only legacy files proven unreferenced by static tests**. Do not retain legacy CSS merely overridden by stronger selectors.
- [ ] **Step 6: Run full gate again**.
- [ ] **Step 7: Write version RED test** for the next release version, run it and confirm only version assertions fail.
- [ ] **Step 8: Update `src/version.ts` to the new release version** and rerun full gate.
- [ ] **Step 9: Push/deploy and verify GitHub Pages workflow SUCCESS** before claiming production complete.
- [ ] **Step 10: Record physical-device status separately**: iPhone Safari/PWA keyboard/scroll/audio/call and Android PWA remain `PENDING DEVICE` until actually tested.
- [ ] **Step 11: Commit release checkpoint** as `release: ship Chatwoot UI port`.

---

## Plan Self-Review

### Spec coverage

- Source mirror/provenance/license: Task 1.
- UI adapter boundary: Task 2 and Task 7.
- Shared full-screen conversation shell: Task 3 and Task 7.
- Message grouping/footer/reactions: Task 4.
- Media/audio/link/call: Task 5.
- Composer/keyboard/scroll: Task 6.
- Admin USER 2/USER 1 Inbox: Task 8.
- User account drawer: Task 9.
- Legacy removal, screenshot matrix, release/rollback discipline: Task 10.

### Placeholder scan

No implementation step contains `TBD`, `TODO`, `implement later`, or an unspecified "write tests" instruction. Each task defines concrete files, interfaces, expected RED/GREEN behavior and a commit boundary.

### Type consistency

The plan uses `ConversationViewModel`, `MessageViewModel`, `ConversationActionsAdapter`, `MessageKind`, `UserKind`, `PresentedMessage`, `ScrollOwner`, `InboxModel`, and `AccountDrawerModel` consistently from the task where each is introduced onward.
