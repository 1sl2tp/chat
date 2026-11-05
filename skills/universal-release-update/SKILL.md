# Skill: Universal release detection and update notification

Scope: all changes to this repository's web, mobile browser, and installed PWA. This contract is shared across 1sl2tp/chat, 1sl2tp/taphoaxyz, and 1sl2tp/1988. Each repository keeps its own release pipeline and version source; do not couple the apps or copy another app's Service Worker.

## Mandatory change → release → visible update sequence

1. Read the current repository's maintenance, deployment, cache and resource rules. Identify the canonical build command, generated assets, release manifest and deployment workflow. No production data changes.
2. After any user-visible HTML, CSS, JS, runtime or relevant manifest/Service Worker change, run tests and the canonical build. Generate a content-derived, immutable build identifier. Do not rely only on a manually incremented version string.
3. Ensure the deployed entry document and the uncached version endpoint describe the same build identifier. A source-only commit or successful GitHub push is NOT a verified release. Follow each repository's rule for committed vs CI-generated build artifacts; never bypass canonical verification.
4. Web tabs and installed mobile PWAs must check the SAME release identity on startup, foreground/resume, online and at a bounded interval. Fetch the small version manifest with no-store and a cache-busting query; avoid unnecessary polling, repeated downloads or duplicate update owners.
5. If the remote build differs from the running build, display a visible, accessible **Cập nhật** action in both web and PWA. Keep it visible while a user is authenticated. Never silently refresh an active chat, unsent draft, upload, call, media playback or other unsafe transaction. On explicit tap, validate safety, activate any waiting Service Worker and navigate to a fresh entry document; preserve safe route/context where supported.
6. If the version check fails, do not claim the app is current. Record a bounded diagnostic event, retry at the next normal lifecycle trigger, and avoid infinite timers or noisy network retries.
7. Verify: old-build→new-build notification; same-build no notice; offline/error recovery; active-session safety; explicit-tap update; Service Worker waiting/activation; browser and standalone PWA parity. Automate tests where feasible.
8. After deployment, compare the live HTTPS version/build identity with the expected build, confirm successful workflow and update behavior. Report separate states: source committed, tests, build, deploy, live verified, update notice verified. Never mark PASS without evidence.

## Regression prevention

Every future change affecting displayed content or runtime must be checked against this skill before it is called complete. If the canonical release build or live check cannot be executed, mark release verification PENDING, not DONE. Never tell the user to reinstall the PWA, clear cache or manually refresh as a substitute for repairing the shared update mechanism.
