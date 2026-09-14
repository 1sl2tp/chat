# Restore CHAT-owned Công việc implementation plan

**Goal:** Keep CHAT's `Công việc` route and desktop/mobile geometry, but remove every runtime dependency that embeds or authenticates GETLINK inside CHAT.

**Branch:** `feature/restore-chat-workspace-owner`

## Task 1 — Lock the new ownership contract (RED)

**Files:**
- Modify `tests/test_v21_remove_getlink_embed.py`
- Modify `tests/test_v21_work_context_bridge.py`
- Modify `.github/workflows/verify-v21.yml`

1. Rewrite `test_v21_remove_getlink_embed.py` so it still requires the `work` route, top tab, desktop 3-column support, and `workThreadView`, but now requires a CHAT-owned work marker and rejects `workGetlinkFrame`, `get.taphoa.xyz`, `?embed=1`, `data-work-frame-owner="getlink"`, `getlink-auth-bridge.js`, and `V21GetlinkAuthBridge`.
2. Rewrite `test_v21_work_context_bridge.py` into a removal contract: `getlink-auth-bridge.js` must not exist, `shell.js` must not call `V21GetlinkAuthBridge`, and the CHAT work route must remain available.
3. Rename the workflow labels from GETLINK bridge/embed language to CHAT-owned work-surface language; keep the same tests in CI.
4. Run the two contract tests against the current branch state and confirm they fail for the expected reason (iframe/bridge still present).
5. Commit the RED tests separately.

## Task 2 — Remove GETLINK ownership from CHAT (GREEN)

**Files:**
- Modify `index.source.html`
- Modify `shell.js`
- Delete `getlink-auth-bridge.js`
- Generated later: `index.html`, `version.json`

1. In `index.source.html`, preserve `#workThreadView` but replace the iframe block with a CHAT-owned surface using `data-work-owner="chat"`, title `Công việc`, and neutral copy `Khu vực này để phát triển sau.`
2. Replace iframe-only CSS (`.work-thread-embed`) with minimal placeholder content styling while preserving `.work-thread-frame` sizing and the existing desktop/mobile geometry.
3. Change frame ownership from GETLINK-specific markup to CHAT ownership and preserve the existing work-view parent/position behavior used by `shell.js`.
4. Remove the `getlink-auth-bridge.js` build-source script include from `index.source.html`.
5. In `shell.js`, remove only the `window.V21GetlinkAuthBridge?.sync?.()` call from desktop workspace synchronization. Do not change generic `work` route behavior.
6. Delete `getlink-auth-bridge.js`.
7. Re-run the two new ownership tests; they must pass.
8. Run `tests/test_v21_chat_workspace_3col.py` and `tests/test_v21_work_hides_composer.py`; both must remain green.

## Task 3 — Rebuild canonical bundle and verify regression gates

**Files:**
- Regenerate `index.html`
- Regenerate `version.json`

1. Run `python tools/build_current_preview.py` so `index.html` and `version.json` match modular source.
2. Confirm generated `index.html` contains the CHAT-owned work surface and no GETLINK iframe/URL/auth bridge.
3. Run `python tools/verify_current.py`.
4. Run the CI workflow through a pull request against `main` and inspect all checks.
5. Compare `main...feature/restore-chat-workspace-owner`; confirm no files under `1sl2tp/getlink` were touched and no unrelated Chat/Call/Auth business logic changed.

## Completion gate

Do not merge to `main`. Completion for this task means the feature branch/PR is green and the diff shows:
- CHAT still owns `Trò chuyện | Công việc`.
- Desktop still supports `Danh bạ | Trò chuyện | Công việc`.
- Mobile still switches one route at a time.
- No `workGetlinkFrame`, `get.taphoa.xyz/?embed=1`, GETLINK auth bridge, or `V21GetlinkAuthBridge` remains in CHAT runtime.
- GETLINK repository is untouched.
