# TAPHOA Chat — Chatwoot Reference UI Port Design

Date: 2026-09-03
Branch: `ui-chatwoot-reference-port`
Status: Design approved at approach level; implementation not started

## 1. Goal

Rebuild the presentation layer of `1sl2tp/chat` so the real TAPHOA chat/call web app follows the provided Chatwoot-style reference files as closely as practical at the source level: DOM composition, Tailwind utility structure, typography, dark palette, spacing, radii, borders, button sizing, message presentation, composer, menus, notifications, and call surfaces.

The reference UI is the visual source of truth. Product logic remains the current TAPHOA logic.

## 2. Locked product scope

The app remains intentionally small:

- User ↔ Admin support chat.
- Text messaging.
- Attachments.
- Voice recording.
- Audio/video call surfaces backed by the existing LiveKit/runtime implementation.
- Push/notification controls already present in the app.
- User account/settings drawer already present in the app.
- Admin conversation list and selected conversation workspace.

Do not import unrelated enterprise CRM features merely because they exist in the visual reference.

Explicitly out of scope unless separately requested:

- employee management,
- CRM/customer-detail database features not already present,
- reports,
- automation,
- assignment workflows,
- enterprise analytics,
- new business rules,
- new Supabase schema/RPC changes,
- replacement of LiveKit,
- replacement of existing PWA/push architecture.

## 3. Reference presentation contract

The implementation must preserve the reference presentation rather than reinterpret it into another design system.

### 3.1 Foundation

Use the reference values and visual language directly:

- Tailwind-based styling.
- `darkMode: 'class'` presentation model.
- Plus Jakarta Sans typography.
- Slate dark surfaces (`slate-950`, `slate-900`, `slate-800`, etc.).
- Chatwoot accent family with `cw-500 = #1f93ff` and matching reference shades where used.
- Reference border, radius, spacing, text-size, icon-size, hover, active and focus treatment.
- Reference custom scrollbar and call/pulse animation behavior where applicable.

Production integration should use build-time Tailwind with Vite rather than the CDN script, while preserving the same utility-class semantics and theme values.

### 3.2 Copy rule

For every component that exists in both the reference and TAPHOA app, port the reference structure first, then bind current TAPHOA data/actions into that structure.

Do not keep the current light DOM/CSS structure and merely recolor it if that would change layout, spacing or behavior from the reference.

Do not invent replacement styling when the reference already defines the same element.

## 4. Architecture

### 4.1 Runtime layers that remain unchanged

Preserve these current responsibilities:

- Supabase auth/session and chat backend.
- Chat/message runtime and state stores.
- Attachment sending runtime.
- Voice-recorder runtime.
- LiveKit call/session runtime.
- Push registration and notification state logic.
- PWA setup/service worker integration.
- VisualViewport/safe-area/mobile keyboard handling.

No business/data behavior should move into presentation components.

### 4.2 Presentation layer to rebuild

Rebuild the UI composition around the reference markup and styling:

- Admin application shell.
- Admin conversation/inbox list.
- User application shell.
- Shared conversation header.
- Shared message timeline.
- Message cards/bubbles for text, link/file/audio/media states already supported.
- Composer.
- Menus/drawers/dropdowns already backed by current functions.
- Notification banners/buttons/states.
- Incoming-call, active-call, minimized-call/pill surfaces.

Current shared conversation runtime should remain the integration seam: view-model in, user actions out.

## 5. Admin mapping

The Admin page should use the reference desktop workspace composition but only retain real TAPHOA functions.

### Keep / port

- Dark top/header treatment.
- Product identity renamed from `Chatwoot Enterprise` to TAPHOA branding (`Tạp Hóa XYZ` / TAPHOA label as appropriate in the real shell).
- Conversation sidebar/list.
- Online/presence/unread visual states when current data supports them.
- Selected conversation header.
- Chat timeline.
- Composer.
- Existing notification enable/test control, presented in reference style.
- Existing logout/account menu, presented in reference style.
- Existing call actions, presented in reference style.

### Omit

- fake search/data/actions that are not implemented,
- employee management,
- reports,
- automation,
- CRM detail panel unless backed by existing real data and separately approved,
- demo WhatsApp/Zalo/Instagram channel identities not present in current data.

The page must never show fake enterprise functionality merely to resemble the reference screenshot.

## 6. User mapping

The User page is a direct support conversation, so use the mobile/conversation reference language without adding an inbox hierarchy the user does not have.

### Keep / port

- Dark app shell.
- Conversation header with support identity/status.
- Call action when the current runtime permits it.
- Message timeline.
- Composer with attachment, voice and send actions.
- User account/settings drawer using the same reference spacing, palette and control language.
- Existing notification preferences.
- Existing login/upgrade and password-change flows.
- Existing call surfaces.

### Do not add

- admin inbox management,
- CRM tabs,
- unrelated bottom-navigation destinations with no current function,
- fake user/customer data.

## 7. Chat presentation

The shared chat screen should be rebuilt from the reference composition rather than the existing light CSS shell.

Required visual parity targets:

- header height and internal alignment,
- avatar/status presentation,
- incoming/outgoing bubble colors and radii,
- content width and message spacing,
- timestamps and secondary metadata treatment,
- link/file/audio card composition,
- composer height, border, background, input treatment, action placement,
- scroll area and bottom anchoring,
- new-message indicator adapted to the dark reference language.

Existing message capabilities remain authoritative; unsupported reference-only message actions are not introduced.

## 8. Call presentation

Keep the existing call state machine/session logic and re-skin/recompose only the call UI.

Reference-derived surfaces to implement where supported by current state:

- incoming call banner/surface,
- accept/reject controls,
- active full call surface,
- mute/camera/speaker/end/more controls only when the runtime exposes the relevant action,
- minimized/compact call pill,
- duration/name/status placement,
- pulse/ring visual treatment.

Do not add controls that are visually present in the reference but have no safe action in the current runtime.

## 9. Notifications and menus

Copy the reference presentation for notification banners, status chips, dropdowns and drawers while preserving current event handling.

The current push enable/test/preferences logic remains unchanged. Only its presentation and placement are adapted.

No notification UI should imply a capability that the current browser/PWA platform does not actually provide.

## 10. Responsive and PWA constraints

The UI port must not regress the existing mobile/runtime work.

Required checks:

- iPhone Safari/PWA safe areas.
- Android Chrome/PWA.
- dynamic viewport height.
- software keyboard opening/closing.
- composer remains visible and stable.
- conversation list/detail transition on mobile Admin.
- no horizontal overflow in core chat screens.
- call fullscreen/minimized surfaces remain usable on mobile.

Reference desktop/mobile geometry is the visual target; existing viewport controller remains the runtime owner of browser-specific viewport handling.

## 11. Source-level implementation strategy — Approach C

Approach C is locked:

1. Reconstruct the real screen markup around the reference HTML structure.
2. Integrate Tailwind in the Vite build and carry over reference theme values/utilities.
3. Preserve only small custom CSS needed by the reference or platform quirks (scrollbar, animations, safe-area/viewport/call-specific behavior).
4. Rebind existing TypeScript actions/state into the new DOM rather than rewriting runtime logic.
5. Replace the old light presentation only after equivalent real actions are wired.
6. Remove or retire obsolete presentation CSS only after the new screen passes functional and visual checks.

## 12. Likely files/modules affected

Expected presentation/integration scope includes:

- `package.json` and Tailwind build configuration.
- `src/admin-main.ts`.
- `src/user-main.ts`.
- `src/admin.css` and admin UI presentation files.
- `src/user.css` and user UI presentation files.
- `src/ui/chatwoot-port/conversation-screen.ts`.
- `src/ui/chatwoot-port/chat-header.ts`.
- `src/ui/chatwoot-port/messages/*` presentation modules.
- `src/ui/chatwoot-port/composer/*` presentation modules.
- `src/ui/chatwoot-port/tokens.css` / replacement Tailwind theme bridge.
- `src/call/ui.ts` if structural markup must change.
- `src/call/call.css`.

Runtime modules outside those boundaries should not be refactored unless a concrete integration blocker is found.

## 13. Verification gates

No completion claim until all applicable gates pass.

### Build / code

- mirror/reference verification remains passing,
- TypeScript typecheck passes,
- existing tests pass,
- Vite production build passes.

### Functional

- Admin login/logout.
- Admin conversation selection.
- User guest/user2 flows that currently work.
- text send/receive.
- attachment send.
- voice recording send.
- call start/accept/reject/end using existing runtime.
- notification controls/preferences.
- menu/drawer open/close.

### Visual

Compare the implemented screens directly against the supplied reference files, checking parent-to-child geometry:

1. shell/root,
2. region/layout owners,
3. component containers,
4. leaf typography/icons.

Visual review must cover desktop Admin, mobile Admin, mobile User, conversation, composer, incoming call, active call and minimized call.

## 14. Non-regression rules

- No Supabase schema or business-rule changes in this UI port.
- No LiveKit architecture rewrite.
- No production deployment from this design branch without explicit approval.
- No fake CRM features.
- No unrelated refactoring.
- Fix layout at the owning parent/root level; do not compensate with arbitrary leaf margins/transforms.
- Preserve current accessibility labels and keyboard/focus behavior where possible while matching the reference presentation.

## 15. Definition of done

The port is complete only when:

- the real TAPHOA Admin/User screens use the reference visual system and structure instead of the current light interpretation,
- every displayed control maps to a real current function,
- chat/call/notification/menu flows still work,
- desktop/mobile/PWA verification passes,
- visual comparison shows no known avoidable divergence in colors, typography, spacing, radii, component composition or responsive placement,
- the release is still isolated from production until explicitly approved.
