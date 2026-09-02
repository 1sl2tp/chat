# TAPHOA Chat UI Rebuild Checkpoint — 2026-09-03

Branch: `ui-chatwoot-reference-port`
Base: `main` @ `918faef6eea92c79a8f39a80ec653e5076001cf9`
Plan: `docs/superpowers/plans/2026-09-03-chatwoot-reference-ui-rebuild.md`

## Scope lock

- Presentation source of truth: approved Chatwoot-like reference HTML supplied by the user.
- Copy the reference visual language for the real TAPHOA surfaces only: chat, call, notification controls, menus, login/account/settings, responsive layout.
- Do not add unsupported CRM/report/automation/staff features.
- Preserve current Supabase, LiveKit, PWA, push notification and auth/session runtime behavior.
- `main` remains untouched until explicit user approval.

## Task 1 — Reference Tailwind foundation — PASS

- Added build-time Tailwind/PostCSS/Autoprefixer.
- Added approved Slate dark palette, `cw-500 #1f93ff`, Plus Jakarta Sans and Font Awesome resources.
- Preserved the existing PWA installed-app identities `Chat` and `Hỗ trợ`.
- GREEN gate completed on branch CI.

## Task 2 — Shared conversation shell/header — PASS

- Rebuilt shared User/Admin conversation presentation around the approved dark reference hierarchy.
- Added reference identity avatar, online presence, status typography, call/back/menu actions and safe-area ownership.
- Preserved one shared conversation runtime owner and VisualViewport ownership.
- Responsive release widths 280→1440 remain covered by automated contracts.
- GREEN run: `33694672182`.

## Task 3 — Messages/media — PASS

- Outgoing bubble uses `#1f93ff`; incoming uses Slate-800/Slate-700 reference treatment.
- Added incoming sender avatar presentation.
- Rebuilt link/file/audio/image presentation with dark nested cards while keeping existing media/runtime behavior.
- GREEN run: `33695141118`.

## Task 4 — Composer — PASS

- Rebuilt real composer structure to reference composition: attachment | input + microphone | blue send.
- Preserved send, attach, voice start/stop/cancel, focus/scroll behavior, safe-area and iOS 16px input constraint.
- GREEN run: `33695536319`.

## Task 5 — Admin workspace/inbox/menu/notifications — PASS

- Added compact TAPHOA dark topbar and real support workspace owner.
- Reused real notification registration button and real logout action inside the reference account menu.
- Rebuilt real User1/User2 inbox rows/search in dark reference presentation.
- Preserved mobile Inbox → Chat transition and current admin management/runtime actions.
- Did not add Báo cáo, Automation or fake CRM destinations.
- GREEN run: `33696207157`.

## Task 6 — User shell/account/settings — PASS

- Rebuilt User drawer, account identity, notification settings, password change and login surfaces in the same Slate/CW reference language.
- Preserved guest/User2 modes, notification preference persistence, call notification actions and drawer gestures.
- Kept one direct support conversation; no fake inbox/CRM hierarchy.
- GREEN run: `33696333312`.

## Task 7 — Call — PASS

- Rebuilt incoming/active call using reference avatar/status/control geometry and Font Awesome icons.
- Uses real runtime capabilities only: accept, reject, end, mute, speaker, audio recovery and resume.
- Did not add fake Hold/Pause because current VoiceCallSession has no Hold action.
- Restored the existing real display states: `full`, `compact`, `hidden`.
- Mobile full-call overlay follows the reference Slate-950/95, 96px avatar and green/red action treatment.
- Full call interaction tests for speaker + full/compact/hidden transitions are passing.

## Task 8 — Presentation cutover — PASS

- Shared LoginScreen moved from the old light owner to the same dark reference theme.
- Added `src/ui/reference-cutover.test.ts` to reject obsolete active light-theme ownership (`#f8f9fb`, old white surface/canvas tokens, old light incoming bubble owner).
- Latest full branch gate before this checkpoint: GitHub Actions run `33696928254` — mirror verification, typecheck, full tests and Vite build PASS; deployment skipped because branch is not `main`.

## Base/diff verification

- `ui-chatwoot-reference-port` is ahead of `main` and behind by 0 commits at the final compare gate.
- Merge base is the current `main` commit `918faef6eea92c79a8f39a80ec653e5076001cf9`.
- `src/version.ts` intentionally remains `CHAT-ADMIN-0.17.4`; version bump is deferred until explicit production cutover approval.

## Preview limitation

- GitHub Pages workflow intentionally does not deploy feature branches.
- Connected Vercel team currently exposes no projects, so no branch Preview Deployment URL is available from Vercel.
- Therefore automated DOM/theme/geometry/runtime gates are complete, but an external-device visual preview must happen after an explicitly approved deployment target is available.

## Next action

Do not move `main` yet. After the final CI on this checkpoint commit is green, ask the user to choose the integration action. If the user approves production cutover, bump the visible release version once, verify again, then fast-forward/merge to `main` and verify the production workflow.
