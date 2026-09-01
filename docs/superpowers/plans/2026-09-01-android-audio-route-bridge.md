# Android Native Audio Route Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make packaged Android calls start on the built-in earpiece, switch to the built-in speaker only when requested, and verify the actual communication device selected by Android.

**Architecture:** Keep the Vite/LiveKit web call stack unchanged for transport and microphone capture. Add a Capacitor-only `AudioRoute` bridge that uses Android `AudioManager` for receiver/speaker selection; browser Android remains truthful and reports speaker-only because Chrome does not expose this control to JavaScript.

**Tech Stack:** Vite, TypeScript, LiveKit browser SDK, Capacitor 8 Android container, Java Android `AudioManager`.

**Spec:** User-approved call contract in the active chat: default receiver, explicit speaker toggle, no fake route state.

## Global Constraints

- Preserve the proven `getUserMedia()`-first capture order.
- Do not change LiveKit transport or Supabase call state logic.
- iPhone remains web-controlled with `AudioSession`.
- Android browser/PWA must not pretend it can select the receiver.
- Android native must confirm the actual communication device after a route request.
- Call end clears the native communication-device override.

---

### Task 1: Web/native bridge boundary

**Files:**
- Create: `src/call/native-android-audio-route.ts`
- Test: `src/call/native-android-audio-route.test.ts`
- Modify: `src/call/livekit-media.ts`

**Interfaces:**
- Produces: `hasNativeAndroidAudioRoute()`, `setNativeAndroidAudioRoute(route)`, `clearNativeAndroidAudioRoute()`.

- [ ] Write a failing test for native Android detection and confirmed receiver/speaker results.
- [ ] Run the test and verify RED.
- [ ] Implement the smallest Capacitor-global bridge.
- [ ] Integrate it into `LiveKitVoiceMedia` without moving microphone capture order.
- [ ] Run typecheck/tests/build and verify PASS.

### Task 2: Android AudioManager plugin

**Files:**
- Create: `native/android/AudioRoutePlugin.java`
- Create: `capacitor.config.json`
- Create: `scripts/prepare-android-route.mjs`

**Interfaces:**
- Native plugin name: `AudioRoute`.
- Methods: `setRoute({ route: 'receiver' | 'speaker' })`, `getRoute()`, `clearRoute()`.
- `setRoute` resolves only after checking Android's current communication device.

- [ ] Implement API 31+ with `getAvailableCommunicationDevices()` + `setCommunicationDevice()`.
- [ ] Implement pre-31 fallback with communication mode + speakerphone state.
- [ ] Return the actual selected route/device metadata.
- [ ] Add `MODIFY_AUDIO_SETTINGS` and `RECORD_AUDIO` to the generated native manifest.

### Task 3: Reproducible debug APK

**Files:**
- Create: `.github/workflows/android-apk.yml`

**Interfaces:**
- Produces a debug APK artifact named `taphoa-chat-android-debug`.

- [ ] Build web assets with the existing verified build.
- [ ] Generate a Capacitor 8 Android project in CI.
- [ ] Install/register the local `AudioRoutePlugin`.
- [ ] Build `assembleDebug`.
- [ ] Upload the APK artifact.
- [ ] Verify workflow PASS before reporting completion.
