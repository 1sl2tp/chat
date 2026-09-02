# TAPHOA Chatwoot Reference UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the real TAPHOA User/Admin presentation from the approved reference HTML so chat, call, notifications, menus, typography, spacing, color, radii and responsive composition follow the reference as closely as possible while keeping current TAPHOA runtime behavior unchanged.

**Architecture:** Keep the existing Supabase, LiveKit, PWA, push, auth, chat runtime and view-model/action adapters. Replace the current light/custom presentation at its owners: app shells, shared conversation DOM, inbox, account drawer, composer, messages and call widget. Use build-time Tailwind so the production DOM can carry the same utility semantics as the provided reference HTML; reserve custom CSS for safe-area/VisualViewport ownership, scrollbar and call animation/platform details.

**Tech Stack:** Vite 8, TypeScript 6, Vitest 4, Tailwind CSS 3.4.x build-time integration, PostCSS, Plus Jakarta Sans from Google Fonts, Font Awesome 6.5.1 presentation assets, existing Supabase JS 2.112.4, LiveKit Client 2.22.1, vite-plugin-pwa 1.3.0.

**Spec:** `docs/superpowers/specs/2026-09-03-chatwoot-reference-ui-port-design.md`

## Global Constraints

- Visual source of truth: the approved reference HTML files supplied by the user, especially `gemini-code-1788388639559.html`, `gemini-code-1788360206797.html`, and `gemini-code-1788360368834.html`.
- Product name shown in the real application is TAPHOA / `Tạp Hóa XYZ`, not `Chatwoot Enterprise`.
- Preserve current User ↔ Admin product scope; do not add fake CRM, employee-management, reports, automation or channel features.
- Preserve current Supabase auth/data/realtime behavior and schema.
- Preserve current LiveKit call/session logic.
- Preserve current PWA/push/notification runtime and VisualViewport controller.
- Preserve existing message, attachment and voice-recording capabilities.
- Use the reference dark palette and typography: `slate-950`, `slate-900`, `slate-800`, `slate-700`, `cw-500 #1f93ff`, Plus Jakarta Sans.
- Rebuild DOM around reference composition where current DOM prevents parity; do not merely recolor the old light structure.
- Do not expose controls that have no real TAPHOA action.
- Do not merge to `main` or bump the production release until automated gates pass and the user approves the visual result.
- Physical iPhone/Android behavior remains a manual release gate; CI alone cannot mark device UI PASS.

---

## File Structure Locked by This Plan

### Build/theme ownership

- `package.json` — add build-time Tailwind/PostCSS dependencies only.
- `tailwind.config.cjs` — reference font/color/content configuration.
- `postcss.config.cjs` — Tailwind + Autoprefixer.
- `src/ui/reference.css` — Tailwind layers plus only reference custom scrollbar/pulse animation helpers.
- `index.html` and `admin/index.html` — Plus Jakarta Sans and Font Awesome reference links; no Tailwind CDN.

### Shared conversation ownership

- `src/ui/chatwoot-port/conversation-screen.ts` — three-row conversation composition and shared root.
- `src/ui/chatwoot-port/chat-header.ts` — reference conversation header structure.
- `src/ui/chatwoot-port/conversation-shell.css` — keep only geometry/platform rules not represented by Tailwind.
- `src/ui/chatwoot-port/tokens.css` — retire light color ownership; retain only non-visual compatibility tokens if still required.
- `src/ui/chatwoot-port/messages/message-list.ts` and `messages/renderers/*` — reference message DOM/classes.
- `src/ui/chatwoot-port/messages/message.css` — exceptional media/audio behavior only after Tailwind migration.
- `src/ui/chatwoot-port/composer/composer.ts` — reference composer DOM/classes.
- `src/ui/chatwoot-port/composer/composer.css` — voice-record/safe-area exceptions only.

### Admin ownership

- `src/admin-main.ts` — reference desktop workspace shell and real action binding.
- `src/admin.css` — viewport/mobile shell exceptions only.
- `src/ui/chatwoot-port/inbox/inbox.ts` — reference inbox/list DOM/classes using current real model/search.
- `src/ui/chatwoot-port/inbox/inbox.css` — remove old light presentation ownership after cutover.

### User ownership

- `src/user-main.ts` — reference mobile/direct-support shell and real drawer/action binding.
- `src/user.css` — viewport/drawer/safe-area exceptions only.
- `src/ui/chatwoot-port/account/account-drawer.ts` — reference account/menu surface where reusable.
- `src/ui/chatwoot-port/account/account.css` — exceptional drawer animation only after cutover.

### Call ownership

- `src/ui/chatwoot-port/call/call-widget.ts` — reference incoming/active/minimized call DOM/classes.
- `src/ui/chatwoot-port/call/call-widget.css` — pulse/video/positioning exceptions only.
- `src/call/ui.ts` — remains a thin adapter and should not regain presentation logic.

---

### Task 1: Install the Reference Tailwind Foundation

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.cjs`
- Create: `postcss.config.cjs`
- Create: `src/ui/reference.css`
- Modify: `index.html`
- Modify: `admin/index.html`
- Create: `src/ui/reference-theme.test.ts`

**Interfaces:**
- Produces one global presentation foundation imported by User/Admin entrypoints.
- No runtime API changes.

- [ ] **Step 1: Write the failing theme contract test**

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const config = fs.readFileSync('tailwind.config.cjs', 'utf8')
const css = fs.readFileSync('src/ui/reference.css', 'utf8')

describe('approved reference theme', () => {
  it('locks the reference font and Chatwoot accent', () => {
    expect(config).toContain("'Plus Jakarta Sans'")
    expect(config).toContain("500: '#1f93ff'")
    expect(config).toContain("darkMode: 'class'")
  })

  it('keeps the source scrollbar and pulse helpers', () => {
    expect(css).toContain('.custom-scrollbar::-webkit-scrollbar')
    expect(css).toContain('@keyframes pulse-ring')
  })
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/ui/reference-theme.test.ts`
Expected: FAIL because the config/CSS do not exist.

- [ ] **Step 3: Add exact build dependencies**

Add to `devDependencies`:

```json
"autoprefixer": "^10.4.21",
"postcss": "^8.5.6",
"tailwindcss": "^3.4.17"
```

Do not remove current Vite/TypeScript/Vitest dependencies.

- [ ] **Step 4: Create Tailwind/PostCSS configuration**

`tailwind.config.cjs` must use:

```js
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './admin/index.html', './src/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] },
      colors: {
        cw: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#1f93ff',
          600: '#187bcb',
          700: '#1260a3',
          900: '#0f3862',
          dark: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
        },
      },
    },
  },
  plugins: [],
}
```

`postcss.config.cjs` must export Tailwind and Autoprefixer plugins.

- [ ] **Step 5: Add the reference CSS entry**

`src/ui/reference.css` starts with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

.custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
.custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.8); }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
@keyframes pulse-ring {
  0% { transform: scale(.95); opacity: .8; }
  50% { transform: scale(1.1); opacity: .4; }
  100% { transform: scale(.95); opacity: .8; }
}
.calling-animation { animation: pulse-ring 2s infinite ease-in-out; }
```

Import this CSS once in `src/user-shell.ts` and `src/admin-shell.ts`, or their existing shared shell import owner if both already share one.

- [ ] **Step 6: Match the reference font/icon resources**

Add the same Plus Jakarta Sans Google Fonts stylesheet and Font Awesome 6.5.1 stylesheet to both HTML entry documents. Do not add Tailwind CDN.

- [ ] **Step 7: Run GREEN and full build**

Run: `npx vitest run src/ui/reference-theme.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `feat: add approved reference Tailwind theme`

---

### Task 2: Rebuild the Shared Conversation Shell and Header from Reference DOM

**Files:**
- Modify: `src/ui/chatwoot-port/conversation-screen.ts`
- Modify: `src/ui/chatwoot-port/chat-header.ts`
- Modify: `src/ui/chatwoot-port/conversation-shell.css`
- Modify: `src/ui/chatwoot-port/tokens.css`
- Modify: `src/ui/chatwoot-port/conversation-screen.test.ts`
- Modify: `src/ui/chatwoot-port/conversation-layout-contract.test.ts`

**Interfaces:**
- Preserve `mountConversationScreen(options: ConversationScreenMountOptions): MountedConversationScreen`.
- Preserve `update(model)`, `setEnabled(enabled)` and `destroy()` behavior.
- Preserve `onBack` and `onCall` callbacks.

- [ ] **Step 1: Add failing DOM assertions for the reference composition**

Extend `conversation-screen.test.ts` to assert the mounted shell has:

```ts
expect(root.querySelector('.cw-conversation')).toBeTruthy()
expect(root.querySelector('.cw-conversation__header')).toBeTruthy()
expect(root.querySelector('.cw-conversation__timeline')).toBeTruthy()
expect(root.querySelector('.cw-conversation__composer')).toBeTruthy()
expect(root.querySelector('.cw-chat-header__identity')).toBeTruthy()
```

and that the shell/header carry dark-reference utility classes equivalent to:

```text
bg-slate-950 text-slate-100
bg-slate-900 border-b border-slate-800
```

- [ ] **Step 2: Change the CSS contract from light tokens to reference dark ownership**

In `conversation-layout-contract.test.ts`, assert the old light values are absent:

```ts
expect(tokens).not.toContain('--cw-surface: #ffffff')
expect(tokens).not.toContain('--cw-canvas: #f8f9fb')
```

while keeping the geometry contract:

```ts
expect(css).toMatch(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/)
expect(css).toMatch(/overflow-y:\s*auto/)
```

- [ ] **Step 3: Run RED**

Run: `npx vitest run src/ui/chatwoot-port/conversation-screen.test.ts src/ui/chatwoot-port/conversation-layout-contract.test.ts`
Expected: FAIL on dark/reference structure assertions.

- [ ] **Step 4: Rebuild shell/header markup**

Use the approved reference composition as the source of class order and geometry. Keep `header → timeline → composer` as the three ownership rows, but assign Tailwind utility classes directly to the real elements. For the header, use the same dark border/surface/button/identity treatment as the reference; bind real TAPHOA title/subtitle and current call/back actions.

- [ ] **Step 5: Retire light visual tokens**

Remove `--cw-surface: #ffffff`, `--cw-canvas: #f8f9fb`, light text ownership and hover colors from `tokens.css`. Keep only compatibility values still needed by non-Tailwind platform CSS.

- [ ] **Step 6: Keep mobile viewport ownership intact**

Do not add viewport-height ownership to the conversation child. It remains `height: 100%`; app shells/viewport controller own dynamic height. Keep safe-area padding where currently required.

- [ ] **Step 7: Run GREEN**

Run: `npx vitest run src/ui/chatwoot-port/conversation-screen.test.ts src/ui/chatwoot-port/conversation-layout-contract.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `feat: rebuild conversation shell from reference UI`

---

### Task 3: Port Message Cards, Link/File/Audio Presentation and Timeline Spacing

**Files:**
- Modify: `src/ui/chatwoot-port/messages/message-list.ts`
- Modify: `src/ui/chatwoot-port/messages/message.css`
- Modify: `src/ui/chatwoot-port/messages/renderers/text.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/link.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/file.ts`
- Modify: `src/ui/chatwoot-port/messages/renderers/audio.ts`
- Modify as needed: remaining `src/ui/chatwoot-port/messages/renderers/*.ts`
- Modify: `src/ui/chatwoot-port/messages/message-list.test.ts`
- Modify: `src/ui/chatwoot-port/messages/media-contract.test.ts`

**Interfaces:**
- Preserve current `MessageViewModel` and renderer selection.
- Preserve current media actions and audio element reuse behavior.

- [ ] **Step 1: Write failing reference-class tests**

Assert incoming/outgoing rows resolve to the approved dark palette:

```ts
expect(incoming.className).toContain('bg-slate-900')
expect(outgoing.className).toMatch(/bg-cw-500|bg-blue-600/)
```

For link/file/audio cards, assert nested dark panel/border composition exists rather than the current light generic bubble styling.

- [ ] **Step 2: Keep existing media contract tests unchanged and run RED set**

Run: `npx vitest run src/ui/chatwoot-port/messages/message-list.test.ts src/ui/chatwoot-port/messages/media-contract.test.ts`
Expected: new visual assertions FAIL; existing behavior assertions remain informative.

- [ ] **Step 3: Port the reference timeline spacing and message widths**

Use the reference utility semantics for timeline padding, vertical gaps, max-width, text size, muted metadata and borders. Do not invent a new token layer for values already present in the reference classes.

- [ ] **Step 4: Port message subtypes without changing data behavior**

For supported current message kinds, reproduce the reference structure:
- text: dark incoming card / blue outgoing bubble;
- link: nested dark preview card with URL/title/description and external-link affordance when already supported;
- file: reference bordered attachment card;
- audio: reference voice card with duration/play affordance using the existing audio runtime;
- call/system: dedicated compact semantic rows, not fake CRM messages.

- [ ] **Step 5: Reduce `message.css` to exceptional behavior**

Keep CSS only where utility classes cannot express current player/media behavior or existing tests depend on layout details. Remove light palette declarations.

- [ ] **Step 6: Run GREEN**

Run: `npx vitest run src/ui/chatwoot-port/messages`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: port reference message presentation`

---

### Task 4: Rebuild the Composer 1:1 While Preserving Send/Attach/Voice Logic

**Files:**
- Modify: `src/ui/chatwoot-port/composer/composer.ts`
- Modify: `src/ui/chatwoot-port/composer/composer.css`
- Modify: `src/ui/chatwoot-port/composer/composer.test.ts`

**Interfaces:**
- Preserve `createComposer(...)` callback contract.
- Preserve attach, send, voice start/stop/cancel and focus behavior.
- Input remains at least `16px` on iOS to avoid Safari zoom.

- [ ] **Step 1: Add failing composer structure assertions**

Test for the reference order:

```text
[attachment] [voice] [text input] [send]
```

and assert the outer composer uses dark `slate-900/950`, border `slate-800`, rounded input/button treatment and blue send action.

- [ ] **Step 2: Preserve behavior tests and run RED**

Run: `npx vitest run src/ui/chatwoot-port/composer/composer.test.ts`
Expected: visual/structure assertions FAIL before implementation.

- [ ] **Step 3: Rebuild composer DOM using reference utility classes**

Keep the current real callbacks. Do not add Reply/Note/Macro controls unless TAPHOA has actions for them. Preserve the reference spacing and proportions around the controls that do exist.

- [ ] **Step 4: Preserve mobile keyboard constraints**

Keep `font-size: 16px` minimum on the editable input for iPhone. Keep safe-area bottom ownership and existing focus/scroll callbacks.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run src/ui/chatwoot-port/composer/composer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: rebuild composer from reference UI`

---

### Task 5: Rebuild the Admin Workspace, Inbox, Notification Control and Account Menu

**Files:**
- Modify: `src/admin-main.ts`
- Modify: `src/admin.css`
- Modify: `src/ui/chatwoot-port/inbox/inbox.ts`
- Modify: `src/ui/chatwoot-port/inbox/inbox.css`
- Modify: `src/ui/chatwoot-port/inbox/inbox.test.ts`
- Create: `src/admin-reference-shell.test.ts`

**Interfaces:**
- Preserve `selectAdminConversation`, `clearAdminSelection`, `logoutAdmin`, existing notification registration and call actions.
- Preserve `InboxView.setSearchQuery/getSearchQuery` and current User1/User2 grouping.

- [ ] **Step 1: Write failing Admin shell contract**

`src/admin-reference-shell.test.ts` reads `src/admin-main.ts` and asserts the real workspace contains reference owners for:

```text
Top header
Conversation sidebar
Selected conversation workspace
Account/logout menu
Notification control
Voice-call host
```

and asserts the source does not introduce labels such as `Báo cáo`, `Automation`, or `Quản lý Nhân Viên`.

- [ ] **Step 2: Extend Inbox test for reference presentation hooks**

Assert `mountInbox()` still renders the real search input and USER 2/USER 1 data, while rows receive active/dark reference class hooks and no fake WhatsApp/Zalo/Instagram content.

- [ ] **Step 3: Run RED**

Run: `npx vitest run src/admin-reference-shell.test.ts src/ui/chatwoot-port/inbox/inbox.test.ts`
Expected: new shell/reference assertions FAIL.

- [ ] **Step 4: Rebuild `mountWorkspace()` shell**

Use the approved reference desktop layout:
- dark top navigation header;
- TAPHOA/Tạp Hóa XYZ identity;
- real search/inbox column;
- real selected conversation center;
- existing notification/account/logout actions styled as reference controls;
- no right-side CRM panel unless a later approved task supplies real data.

The current runtime subscriptions and action objects remain where they are; only the DOM host composition and presentation bindings move.

- [ ] **Step 5: Port Inbox DOM/classes**

Keep `InboxModel` and search filtering unchanged. Rebuild each row with reference avatar, online indicator when real state supports it, name/time/preview hierarchy, dark hover/active surfaces and blue selected accent. Do not fabricate unread/status data absent from the model.

- [ ] **Step 6: Preserve mobile Admin list/detail transition**

Keep the existing `data-selected`/edge-drawer behavior or equivalent runtime contract so mobile shows list or detail cleanly without horizontal overflow.

- [ ] **Step 7: Run GREEN and Admin build**

Run: `npx vitest run src/admin-reference-shell.test.ts src/ui/chatwoot-port/inbox/inbox.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `feat: rebuild admin workspace from reference UI`

---

### Task 6: Rebuild the User Shell, Menu/Drawer and Notification Settings

**Files:**
- Modify: `src/user-main.ts`
- Modify: `src/user.css`
- Modify as reusable owner: `src/ui/chatwoot-port/account/account-drawer.ts`
- Modify: `src/ui/chatwoot-port/account/account.css`
- Modify: `src/ui/chatwoot-port/account/account-drawer.test.ts`
- Create: `src/user-reference-shell.test.ts`

**Interfaces:**
- Preserve guest/User2 root modes, login/cancel, password-change, notification preference storage, call-notification enable/test and drawer gestures.
- Preserve one direct support conversation; do not add an inbox hierarchy.

- [ ] **Step 1: Write failing User shell contract**

Assert the source mounts:

```text
Dark app root
Support conversation host
Reference menu/drawer owner
Real notification settings
Voice-call host
```

and does not add fake CRM/bottom-nav destinations.

- [ ] **Step 2: Extend account drawer tests**

Assert current real controls remain present: status, chat notification, call notification, sound, vibration, password change, login/upgrade action; assert dark reference panel/control classes are used.

- [ ] **Step 3: Run RED**

Run: `npx vitest run src/user-reference-shell.test.ts src/ui/chatwoot-port/account/account-drawer.test.ts`
Expected: new visual assertions FAIL.

- [ ] **Step 4: Rebuild User shell from the mobile reference**

Use TAPHOA branding and the reference dark header/menu language, but keep a single support conversation as the main content. Bind existing account/menu/call actions only.

- [ ] **Step 5: Rebuild the account/settings surface**

Port reference panel spacing, borders, typography, toggles/select/button treatment and overlay/backdrop behavior. Keep all current state/persistence callbacks unchanged.

- [ ] **Step 6: Preserve PWA safe-area and keyboard behavior**

The conversation remains full-height inside the viewport owner; composer must remain visible after keyboard open/close. Do not reintroduce legacy duplicate header/composer owners.

- [ ] **Step 7: Run GREEN**

Run: `npx vitest run src/user-reference-shell.test.ts src/ui/chatwoot-port/account/account-drawer.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `feat: rebuild user shell and menu from reference UI`

---

### Task 7: Recompose Incoming, Active and Minimized Call UI from the Reference

**Files:**
- Modify: `src/ui/chatwoot-port/call/call-widget.ts`
- Modify: `src/ui/chatwoot-port/call/call-widget.css`
- Modify: `src/ui/chatwoot-port/call/call-widget.test.ts`
- Verify unchanged adapter: `src/call/ui.ts`

**Interfaces:**
- Preserve the existing `mountChatwootCallUi` and `callStatusText` exports consumed by `src/call/ui.ts`.
- Preserve all current call-session actions; no LiveKit/session changes in this task.

- [ ] **Step 1: Add failing state-surface tests**

For the real call phases supported by the widget, assert DOM owners for:

```text
incoming: caller identity + accept + reject
active/full: identity/status/duration + supported controls + end
minimized: compact pill with identity/status + supported quick controls
```

Assert the UI uses `bg-slate-950/900`, `border-slate-800`, blue/emerald/red action semantics and the `calling-animation` helper for ringing state.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/ui/chatwoot-port/call/call-widget.test.ts`
Expected: reference-structure assertions FAIL.

- [ ] **Step 3: Rebuild widget DOM/classes**

Port the approved call reference structure. Only render mute/camera/speaker/minimize/end controls when the current widget/session exposes the corresponding action. Preserve current full/minimized state behavior.

- [ ] **Step 4: Reduce custom CSS**

Keep only overlay placement, video/media sizing, safe-area positioning and pulse animation rules that Tailwind cannot safely own. Remove generic legacy light/generic call styling.

- [ ] **Step 5: Verify the adapter remains thin**

`src/call/ui.ts` must continue to only re-export the reference widget functions and contain no UI markup.

- [ ] **Step 6: Run GREEN**

Run: `npx vitest run src/ui/chatwoot-port/call/call-widget.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: port reference call surfaces`

---

### Task 8: Cut Over Presentation, Remove Obsolete Light Ownership and Run Release Gates

**Files:**
- Modify only if still referenced: `src/ui/chatwoot-port/tokens.css`
- Modify only if still referenced: `src/admin.css`, `src/user.css`, `src/ui/chatwoot-port/inbox/inbox.css`, `src/ui/chatwoot-port/account/account.css`, `src/ui/chatwoot-port/messages/message.css`, `src/ui/chatwoot-port/composer/composer.css`, `src/ui/chatwoot-port/call/call-widget.css`
- Modify: `src/version.ts` only after the user approves the visual preview and release cutover.
- Create: `src/ui/reference-cutover.test.ts`

**Interfaces:**
- Production User/Admin entrypoints both consume the rebuilt reference presentation.
- Runtime interfaces remain unchanged.

- [ ] **Step 1: Write a failing obsolete-presentation scan**

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const files = [
  'src/ui/chatwoot-port/tokens.css',
  'src/ui/chatwoot-port/conversation-shell.css',
  'src/ui/chatwoot-port/messages/message.css',
  'src/ui/chatwoot-port/composer/composer.css',
  'src/admin.css',
  'src/user.css',
]

describe('reference presentation cutover', () => {
  it('does not retain the old light theme ownership', () => {
    const css = files.map(path => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '').join('\n')
    expect(css).not.toContain('#f8f9fb')
    expect(css).not.toContain('--cw-surface: #ffffff')
    expect(css).not.toContain('--cw-canvas: #f8f9fb')
  })
})
```

- [ ] **Step 2: Run RED if any obsolete light ownership remains**

Run: `npx vitest run src/ui/reference-cutover.test.ts`
Expected: FAIL until all old theme owners are retired.

- [ ] **Step 3: Remove only obsolete presentation rules**

Delete light/redundant declarations that are no longer referenced after the Tailwind cutover. Keep platform-specific rules required by viewport, safe-area, drawer transition, media sizing and call positioning.

- [ ] **Step 4: Run the focused UI suite**

Run:

```bash
npx vitest run \
  src/ui/reference-theme.test.ts \
  src/ui/reference-cutover.test.ts \
  src/ui/chatwoot-port/conversation-screen.test.ts \
  src/ui/chatwoot-port/conversation-layout-contract.test.ts \
  src/ui/chatwoot-port/messages \
  src/ui/chatwoot-port/composer/composer.test.ts \
  src/ui/chatwoot-port/inbox/inbox.test.ts \
  src/ui/chatwoot-port/account/account-drawer.test.ts \
  src/ui/chatwoot-port/call/call-widget.test.ts \
  src/admin-reference-shell.test.ts \
  src/user-reference-shell.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full repository verification**

Run:

```bash
npm run verify:chatwoot-mirror
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Visual/manual preview gate before main**

Check at minimum:
- Desktop Admin: 1280 and 1440 widths.
- Mobile Admin: 390 and 412 widths; list/detail transition.
- User: 320, 390, 412 and 480 widths.
- iPhone Safari/PWA: keyboard open/close, safe-area, composer visibility.
- Android Chrome/PWA: keyboard open/close, composer visibility.
- Incoming call, active call and minimized call.
- Notification/account menus open/close.
- Text/link/file/audio message presentation.

Compare against the approved reference source for typography, palette, spacing, radii, borders, icon placement and content hierarchy. Any mismatch is fixed at the owning shell/component, not with unrelated leaf margin hacks.

- [ ] **Step 7: Ask the user to approve the visual preview**

Do not merge to `main` and do not bump the release version before this approval.

- [ ] **Step 8: After approval, bump visible version once and commit release cutover**

Update `src/version.ts` to the next approved release label, then run `npm run build` one final time.

Commit: `feat: cut over to approved reference UI`
