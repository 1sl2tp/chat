# TAPHOA Chat — Android test APK

Source of truth remains https://chat.taphoa.xyz/. This package is a small Android WebView shell; the website and business data are not copied or modified.

- Android application ID: `xyz.taphoa.chat`
- Project: `android/webshell/` (isolated from existing Android services)
- Build: `gradle -p android/webshell :app:assembleDebug`
- CI: `.github/workflows/build-android-webshell.yml`
- Minimum Android: 8.0 / API 26
- Version: 0.1.0-test (internal **debug-signed** test build)

## Known boundaries
- A WebView has a separate cookie/session store from Chrome and existing PWA. First login may be required; no login state or PIN is bundled.
- The test APK is debug signed by its CI runner. Future builds use a new debug key and **will not reliably update in place**. Stable release signing must be configured privately before distributing a long-lived APK.
- Android background notifications, native call notifications, background media playback, home-screen widgets and PWA update prompts are **not** native features of this shell.
- Android file picker, fullscreen video and foreground camera/microphone permission requests are forwarded, but actual feature compatibility remains unverified on a physical device.
- External HTTPS links open in the Android browser; internal chat.taphoa.xyz navigations stay inside the app.
- The app blocks insecure mixed content and third-party WebView permission prompts; users must not use this test app for business-critical operations without acceptance testing.
- Changes to source HTML/CSS/JS on the website appear through HTTPS as usual; native shell changes require a new APK.
