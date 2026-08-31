# Repair Routing and Region Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable project-state checkpoint, repair map, machine-readable region registry, mobile runtime contract, change-trace convention, and automated validation so Chat changes can be located, verified, and rolled back by owner/region instead of by repository-wide search.

**Architecture:** Keep all new metadata outside production runtime. Human-readable Markdown explains routing and operating rules; `docs/region-registry.json` is the machine-readable Region ID source. A dependency-free Node validator checks registry structure/file ownership/mobile gates, and npm scripts expose fast/full/release verification tiers without changing application behavior.

**Tech Stack:** Node.js 22, TypeScript 6, Vite 8, Vitest 4, GitHub Actions, Markdown/JSON developer metadata.

**Spec:** `docs/superpowers/specs/2026-08-31-repair-routing-region-trace-design.md`

## Global Constraints

- Work only on `feature/auth-identity-mobile-0.10.0`; do not merge to `main`.
- Do not deploy production.
- Do not change Supabase schema/data.
- Do not bump `src/version.ts`.
- Do not change Auth/identity/chat/media/PWA runtime behavior.
- Region IDs are semantic and platform-independent.
- `src/version.ts` remains the sole runtime version source.
- Mobile release contexts remain iOS browser, iOS standalone, Android browser, Android standalone.
- New validation must be dependency-free and must not contact external services.

---

### Task 1: Add project recovery and repair-routing documents

**Files:**
- Create: `docs/PROJECT_STATE.md`
- Create: `docs/REPAIR_MAP.md`
- Create: `docs/MOBILE_CONTRACT.md`
- Create: `docs/CHANGE_TRACE.md`

**Interfaces:**
- Produces the human recovery/routing contracts consumed by future maintainers and Task 3 validation.
- Does not modify runtime code.

- [ ] **Step 1: Create `PROJECT_STATE.md`** with the current production baseline (`main` / `CHAT-ADMIN-0.9.1`), development target (`feature/auth-identity-mobile-0.10.0` / `CHAT-AUTH-0.10.0`), Supabase project `gcnoahqsrquxkwkjbuxy`, applied 0.10 backend migration checkpoints, and explicit no-secret/no-unverified-PASS rules.

- [ ] **Step 2: Create `REPAIR_MAP.md`** mapping Auth, identity, Admin, message/realtime, viewport/keyboard, safe-area/layout, PWA, media/audio, and ICE/TURN symptoms to canonical owners and “do not patch” zones.

- [ ] **Step 3: Create `MOBILE_CONTRACT.md`** with the four OS/display-mode gates, 280/320/390/480 width gates, input/tap/zoom/safe-area/scroll/keyboard invariants, plus currently observed non-PASS gaps rather than hiding them.

- [ ] **Step 4: Create `CHANGE_TRACE.md`** with the change-record template and commit naming convention keyed by Region ID and owner.

- [ ] **Step 5: Review all four files** for placeholder text, secrets, claims of PASS without verification, and contradictions with `docs/FOUNDATION_OWNERSHIP.md`.

- [ ] **Step 6: Commit** with message `docs: add project repair operating contracts`.

---

### Task 2: Add the stable Region Registry

**Files:**
- Create: `docs/region-registry.json`
- Create: `docs/REGION_REGISTRY.md`

**Interfaces:**
- Produces stable Region IDs and owner/file/locator metadata consumed by Task 3 validator.
- IDs use `^[A-Z0-9_]+(?:/[A-Z0-9_]+)*$`.

- [ ] **Step 1: Define root/surface entries** for `APP`, `CUSTOMER_CHAT`, and `ADMIN`.

- [ ] **Step 2: Define Customer Chat regions** at minimum for header, message list, footer, composer, composer input/plus/send, profile form, and overflow menu using actual current owner files/selectors.

- [ ] **Step 3: Define Admin regions** at minimum for login, workspace, inbox, conversation, detail, messages, and composer using actual current owner files/selectors.

- [ ] **Step 4: Create `REGION_REGISTRY.md`** explaining semantic stability, Parent → Child tracing, locator usage, and how to add/move/retire a Region ID without making runtime depend on it.

- [ ] **Step 5: Verify manually** that every declared `owner`, `geometryOwner`, and `stateOwner` path either exists or is `null`, every parent exists, and every non-root ID follows the syntax.

- [ ] **Step 6: Commit** with message `docs: add stable UI region registry`.

---

### Task 3: Add architecture validation and developer gates

**Files:**
- Create: `scripts/validate-architecture-docs.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run check:architecture`.
- Produces `npm run check:fast` = TypeScript + architecture validation.
- Produces `npm run check` = TypeScript + full Vitest + architecture validation.
- Produces `npm run release:verify` = full check + Vite build.
- Keeps `npm run build` as CI-compatible alias to `release:verify`.

- [ ] **Step 1: Establish RED** by running the intended validator entry point before the script exists; expected result is command/file-not-found.

- [ ] **Step 2: Implement dependency-free validator** using `node:fs`, `node:path`, and `node:url`. It must validate required docs, JSON parse, Region ID syntax/uniqueness, parent existence, owner paths, four mobile gate phrases, and forbidden placeholders (`TBD`, `TODO`, `???`) in operational docs.

- [ ] **Step 3: Add package scripts** exactly:

```json
"check:architecture": "node scripts/validate-architecture-docs.mjs",
"check:fast": "npm run typecheck && npm run check:architecture",
"check": "npm run typecheck && npm run test && npm run check:architecture",
"release:verify": "npm run check && vite build",
"build": "npm run release:verify"
```

- [ ] **Step 4: Verify GREEN** with `npm run check:architecture` and `npm run check:fast`.

- [ ] **Step 5: Run full verification** with `npm run check` and `npm run release:verify`.

- [ ] **Step 6: Commit** with message `chore: validate repair routing contracts`.

---

### Task 4: Final branch verification

**Files:**
- Read-only verification of all files changed by Tasks 1-3.

**Interfaces:**
- Confirms the feature branch remains runtime-equivalent except for developer scripts/docs.

- [ ] **Step 1: Compare the implementation diff** and confirm there are no changes under `src/`, `supabase/`, `index.html`, or runtime CSS.

- [ ] **Step 2: Re-run `npm run release:verify`** on the exact branch head.

- [ ] **Step 3: Confirm GitHub branch head** and report commit SHAs plus remaining known mobile/runtime gaps separately from this tooling change.

- [ ] **Step 4: Do not merge/deploy**; leave the branch ready for the existing 0.10 implementation work.