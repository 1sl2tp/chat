# Cross-Platform Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first compatibility, diagnostics, and media foundation for the Chat Web/PWA across iOS, Android, Windows, and macOS without creating separate desktop UI systems.

**Architecture:** Business/UI code consumes feature capabilities, not OS-specific branches. Runtime classification exists only for diagnostics and release testing. Media support and diagnostics are pure TypeScript modules so Safari/Chrome differences can be isolated later without rewriting Chat.

**Tech Stack:** Vite 8, TypeScript 6, Vitest 4, vite-plugin-pwa, GitHub Actions, GitHub Pages.

**Spec:** User-approved scope in the Chat project: Web + Web App, primary use on mobile (iOS/Android), compatible with Windows/macOS, desktop layout kept simple.

## Global Constraints

- Mobile-first release priority: iOS Safari/PWA and Android Chrome/PWA.
- Windows/macOS must remain functionally compatible but do not get a separate complex UI architecture.
- Feature detection controls behavior; OS/browser classification is diagnostics-only.
- Do not add Chat/Supabase/WebRTC signaling business logic in this foundation task.
- No secrets, tokens, SDP, message contents, or user data may enter diagnostics snapshots.
- Every feature branch must run typecheck, tests, and production build; GitHub Pages deployment remains main-only.

---

### Task 1: CI branch verification

**Files:**
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: existing `npm ci` and `npm run build`.
- Produces: branch/PR CI gate; main-only Pages deployment.

- [x] **Step 1:** Run build for pushes and pull requests.
- [x] **Step 2:** Guard Pages configuration, artifact upload, and deploy to `refs/heads/main` push events only.
- [x] **Step 3:** Verify a feature-branch push starts CI without deploying Pages.

### Task 2: Runtime and capability contracts

**Files:**
- Create: `src/compat/runtime.test.ts`
- Create: `src/compat/runtime.ts`
- Create: `src/compat/capabilities.test.ts`
- Create: `src/compat/capabilities.ts`

**Interfaces:**
- Produces: `classifyRuntime(input): RuntimeInfo` and `detectCapabilities(input): CapabilitySnapshot`.

- [ ] **Step 1:** Add failing tests for iOS Safari, Android Chrome, macOS Safari, Windows Edge, and feature capability probes.
- [ ] **Step 2:** Run CI and verify RED because production modules do not exist.
- [ ] **Step 3:** Implement minimal pure TypeScript classifiers/probes.
- [ ] **Step 4:** Run CI and verify GREEN.

### Task 3: Media support contract

**Files:**
- Create: `src/media/support.test.ts`
- Create: `src/media/support.ts`

**Interfaces:**
- Consumes: `CapabilitySnapshot`.
- Produces: `deriveMediaSupport(capabilities): MediaSupport`.

- [ ] **Step 1:** Add failing tests for microphone capture, WebRTC calling, and audio-output selection.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement the minimal support derivation without browser-name branching.
- [ ] **Step 4:** Verify GREEN.

### Task 4: Safe diagnostics snapshot

**Files:**
- Create: `src/diagnostics/snapshot.test.ts`
- Create: `src/diagnostics/snapshot.ts`

**Interfaces:**
- Consumes: `RuntimeInfo`, `CapabilitySnapshot`, optional media/connection state.
- Produces: `createDiagnosticsSnapshot(input): DiagnosticsSnapshot` containing safe technical state only.

- [ ] **Step 1:** Add failing test proving the snapshot contains runtime/capabilities/media state and excludes arbitrary secret fields.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement the fixed allow-list snapshot contract.
- [ ] **Step 4:** Verify GREEN.

### Task 5: Final verification and merge

**Files:**
- Modify: `README.md` only if the supported platform scope is not documented.

**Interfaces:**
- Consumes: all prior modules.
- Produces: verified foundation on `main`.

- [ ] **Step 1:** Run full CI: `npm ci`, TypeScript, all Vitest tests, Vite/PWA production build.
- [ ] **Step 2:** Confirm branch CI does not deploy Pages.
- [ ] **Step 3:** Merge/fast-forward verified commit to `main`.
- [ ] **Step 4:** Confirm main CI builds and GitHub Pages deployment succeeds.
