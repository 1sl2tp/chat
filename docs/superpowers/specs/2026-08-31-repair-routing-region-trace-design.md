# Chat Repair Routing, Region Registry, and Change Trace Design

Date: 2026-08-31
Status: Approved design
Scope: development/release tooling and documentation only

## 1. Goal

Make every forward change, regression fix, and rollback in Chat traceable to the correct visible region and canonical owner without rereading the whole repository. The system must answer five questions quickly:

1. What release/branch/backend state are we working on?
2. What visible region is affected?
3. What concern class is failing?
4. Which canonical owner owns the failing state/decision?
5. Which files/tests/commits belong to that repair path?

This design does not change Chat/Auth/Admin/Voice business behavior.

## 2. Source-of-truth hierarchy

- `main` is the production integration branch only after release verification passes.
- `feature/*` branches are development work and may be ahead of production.
- Repository migration files are the reviewable schema history; live Supabase is the applied backend state and must be reconciled back to repository history.
- GitHub Actions is the production build/deploy path.
- `docs/PROJECT_STATE.md` records the current human-readable development/production/backend checkpoint but does not replace Git, migrations, CI, or runtime version sources.
- `src/version.ts` remains the sole runtime named-version source.

## 3. Stable Region Address

Visible UI regions use stable semantic IDs independent of CSS class/file names.

Format:

`SURFACE/PARENT/CHILD`

Examples:

- `CUSTOMER_CHAT/COMPOSER`
- `CUSTOMER_CHAT/COMPOSER/INPUT`
- `ADMIN/INBOX`
- `ADMIN/CONVERSATION/MESSAGES`

Rules:

- IDs use uppercase ASCII words and `_`, separated by `/`.
- An ID describes semantic placement, not platform (`iOS`) or implementation (`textarea`).
- Parent relationships are explicit.
- File names/selectors may change while the stable Region ID remains unchanged if the semantic region remains the same.
- A visible region is not automatically the repair owner.

## 4. Repair routing

`docs/REPAIR_MAP.md` maps symptom/concern to canonical owner and explicitly names common places that must not be patched.

Routing order:

`User report -> Surface -> Region ID -> Runtime context -> Concern -> Canonical owner -> Files/tests`

Concern classes include:

- UI/geometry
- interaction
- Auth/session
- identity/authorization
- chat/message state
- backend/data
- viewport/keyboard
- PWA/lifecycle
- media capture/playback
- WebRTC transport/ICE/TURN

Repair follows Owner/Parent -> Sibling -> Child/Leaf. A leaf may only be changed when its own contract is wrong; it must not compensate for a parent/owner failure.

## 5. Region registry

`docs/region-registry.json` is the machine-readable source for stable Region IDs. `docs/REGION_REGISTRY.md` is the human operating guide.

Each registry entry contains:

- `id`
- `parent`
- `surface`
- `owner`
- `geometryOwner`
- `stateOwner`
- `locator`
- `contract`

The registry is diagnostic/development metadata. Production behavior must not depend on Region IDs.

## 6. Project state

`docs/PROJECT_STATE.md` is a short recovery checkpoint for a new chat/session. It records:

- production branch/release baseline
- active development branch/release target
- backend project reference
- relevant applied migration checkpoints
- current subsystem status
- current next implementation boundary

It must avoid secrets and must not claim deployment PASS without verification evidence.

## 7. Mobile contract

`docs/MOBILE_CONTRACT.md` treats platform and display mode as separate dimensions.

Required mobile runtime gates:

- iOS + browser (Safari)
- iOS + standalone/Home Screen web app
- Android + browser (Chrome)
- Android + installed PWA

Do not collapse these into one `isMobile` decision.

Canonical ownership:

- `src/viewport/`: visual viewport/keyboard geometry publication.
- shell/screen parent CSS: safe-area placement and screen geometry.
- owning component CSS: typography/tap geometry/component layout.
- PWA/service-worker code: install/update/cache/lifecycle only.

Mobile invariants:

- `viewport-fit=cover`.
- no `user-scalable=no` or `maximum-scale=1`.
- editable text controls are at least 16px on iOS-class mobile layouts to prevent focus auto-zoom.
- practical touch targets are approximately 44px where relevant; visual glyph/button art may be smaller.
- no hard-coded keyboard height.
- body/page scroll must not compete with the conversation scroller.
- minimum supported width is 280px; gates include 280/320/390/480 and representative desktop widths.

Known gaps are recorded as gaps, not silently treated as PASS.

## 8. Change Trace

Every non-trivial fix/change should be recoverable by Region ID and concern.

The change record template captures:

- Change ID
- Region ID(s)
- concern
- runtime context (OS/display mode/state when relevant)
- repair root/owner
- files changed
- focused tests
- broader gates
- rollback commit/risk

Commit subject convention:

`type(owner): action REGION_ID`

Examples:

- `fix(viewport): keep CUSTOMER_CHAT/COMPOSER above iOS PWA keyboard`
- `fix(composer): prevent focus zoom CUSTOMER_CHAT/COMPOSER/INPUT`

Commit subjects remain concise; detailed trace belongs in the commit/PR body or checkpoint.

## 9. Automated architecture validation

A dependency-free Node script validates the documentation contract without entering application runtime.

It must fail when:

- required architecture documents are missing;
- Region IDs are duplicated or invalid;
- a non-root Region parent does not exist;
- an owner/geometry-owner/state-owner file path declared by the registry does not exist;
- required four mobile runtime gates disappear from the mobile contract;
- placeholder markers remain in the operational documents.

It must not parse business data, contact Supabase, or mutate source files.

## 10. Developer gates

Package scripts expose three levels:

- `npm run check:fast`: TypeScript + architecture contract; intended for fast local validation.
- `npm run check`: TypeScript + full Vitest + architecture contract.
- `npm run release:verify`: full check + Vite production build.

`npm run build` remains CI-compatible and delegates to release verification.

This design deliberately does not implement changed-file test selection yet; that can be added later if CI duration justifies the added complexity.

## 11. Out of scope

- No merge to `main`.
- No production deploy.
- No version bump.
- No Supabase schema/data mutation.
- No Auth/identity behavior change.
- No Chat message behavior change.
- No Voice/WebRTC/TURN runtime change.
- No iOS/Android layout fix in this change; known violations are documented for the owning subsystem to repair later.

## 12. Success definition

A new maintainer or future chat can start from `PROJECT_STATE`, route a reported symptom through `REPAIR_MAP`, locate the semantic area through `REGION_REGISTRY`, apply the platform rules in `MOBILE_CONTRACT`, and find/record the exact change through `CHANGE_TRACE` without searching the entire repository or patching a visible leaf blindly.