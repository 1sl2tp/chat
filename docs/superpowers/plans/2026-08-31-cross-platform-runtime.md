# Cross-Platform Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first compatibility, diagnostics, media, notification, and floating-call foundation for the Chat Web/PWA across iOS, Android, Windows, and macOS without creating separate desktop UI systems.

**Architecture:** Business/UI code consumes feature capabilities, not OS-specific branches. Runtime classification exists only for diagnostics and release testing. Push is handled by a custom TypeScript service worker so notification, badge, and incoming-call behavior can evolve without changing the PWA architecture.

**Tech Stack:** Vite 8, TypeScript 6, Vitest 4, vite-plugin-pwa, custom `injectManifest` service worker, GitHub Actions, GitHub Pages.

**Spec:** Chat is Web + Web App. Primary use is mobile (iOS/Android). Windows/macOS remain compatibility targets with a simple wider layout.

## Global Constraints

- Mobile-first release priority: iOS Safari/PWA and Android Chrome/PWA.
- Windows/macOS must remain functionally compatible but do not get a separate complex UI architecture.
- Feature detection controls behavior; OS/browser classification is diagnostics-only.
- PiP is progressive enhancement; in-app mini-call is the guaranteed fallback.
- Do not add Chat/Supabase/WebRTC signaling business logic in this foundation task.
- No secrets, tokens, SDP, message contents, or user data may enter diagnostics snapshots.
- Every feature branch must run typecheck, tests, and production build; GitHub Pages deployment remains main-only.

---

### Task 1: CI branch verification
- [x] Build pushes and pull requests.
- [x] Deploy Pages only from successful `main` pushes.
- [x] Verify feature-branch CI does not deploy.

### Task 2: Runtime and capability contracts
- [x] Add RED tests for iOS Safari, Android Chrome, macOS Safari, Windows Edge.
- [x] Add capability probes for PWA, Push, Badge, WebRTC, audio output, Media Session, PiP, Document PiP, and Wake Lock.
- [x] Implement pure TypeScript runtime/capability modules.
- [x] Verify GREEN.

### Task 3: Media support contract
- [x] Test microphone capture, WebRTC calling, and audio-output selection.
- [x] Implement feature-based media support derivation.
- [x] Verify GREEN.

### Task 4: Safe diagnostics snapshot
- [x] Test allow-listed runtime/capability/media diagnostics.
- [x] Include background visibility and WebRTC/ICE/candidate state fields.
- [x] Verify secrets and message content are excluded.

### Task 5: Notifications and floating-call foundation
- [x] Add Push/Notification/Badge/Media Session support contract.
- [x] Add PiP/Document PiP/Wake Lock capability contract.
- [x] Guarantee in-app mini-call fallback in the platform contract.
- [x] Add safe push payload parser.

### Task 6: Custom PWA service worker
- [x] Switch `vite-plugin-pwa` from `generateSW` to `injectManifest`.
- [x] Add `src/sw.ts` for precache/offline shell lifecycle.
- [x] Add user-visible push notifications and badge updates.
- [x] Add safe notification-click navigation constrained to app scope.
- [x] Add stable Web App Manifest `id`.

### Task 7: Verification and integration
- [x] Branch CI: TypeScript PASS.
- [x] Branch CI: 8 test files / 16 tests PASS.
- [x] Branch CI: Vite production build PASS.
- [x] Branch CI: custom service worker builds to `dist/sw.js` using `injectManifest`.
- [x] Branch CI: Pages deploy skipped outside `main`.
- [ ] Fast-forward verified commit to `main`.
- [ ] Confirm main CI and GitHub Pages deployment succeed.
