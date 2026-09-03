# TAPHOA STRUCTURE LOCK V3.4 — Verification Report

Date: 2026-09-03

## Static / Type / Unit gates
- `npm run typecheck`: PASS
- `npm test`: PASS — 115/115
- `npm run build:local`: PASS
- `node scripts/build-standalone.mjs`: PASS
- `npm run build` (Vite production bundle): NOT RUNNABLE in this workspace — `vite: not found` because dependencies/node_modules are not installed in the sandbox. This is a toolchain gate, not counted as PASS.

Regression coverage includes all V3.3 gates plus:
- PWA Push permission/subscription owner isolated in `TaphoaPushService`;
- first-time notification permission requested before async registration work so iOS user gesture is preserved;
- existing granted subscription silently re-synced to the current Supabase `deviceId`;
- VAPID config fetched through the existing `taphoaxyz-call-push` Edge Function;
- subscription upsert/delete uses existing `chat_upsert_call_push_subscription` / `chat_delete_call_push_subscription` RPCs;
- `public/sw.js` displays `chat_message` and `incoming_call` notifications;
- Service Worker ignores legacy backend `navigate` and builds V3 navigation only from canonical `conversation_id` / `call_id`;
- notification click reuses/focuses an existing app window when possible, otherwise opens the app scope root;
- app runtime consumes both launch-query navigation and `taphoa:notification-click` Service Worker messages; incoming-call notification clicks also refresh the existing VoiceCallService so a ringing call can be rebuilt after the PWA is awakened;
- Admin/User chat menus expose one `Thông báo` action only in live mode; mock/standalone geometry remains unchanged.

## Service Worker runtime gate
`public/sw.js` is executed directly in Node VM with a Service Worker-like runtime, not only source-matched.

PASS:
- incoming-call push -> visible notification with canonical data/tag/interaction options;
- notification click -> canonical V3 root URL with conversation/call query;
- existing app client -> postMessage + focus without navigation/reload;
- legacy payload `navigate` is not propagated into notification data/routing;
- `dist/sw.js` exists after `build:local` and is byte-identical to `public/sw.js` (SHA-256 `37f699aa99f5013c7d3824443e4d12080009475ded506e7d631aa4ab7510a35a`).

Browser localhost Service Worker registration could not be executed in this sandbox because Chromium blocks loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR` before the page or Service Worker loads. This gate is therefore NOT claimed as PASS.

## Chromium V3.4 smoke
Fresh smoke bundle is rebuilt automatically before every run.

PASS at:
- 280x700 Admin mobile
- 320x700 Admin mobile
- 390x844 Admin mobile
- 1280x800 Admin desktop split-pane
- 390x844 User direct Chat

Verified interactions remain PASS:
- Directory quick actions and contact actions;
- Message footer actions and latest outgoing delivery state;
- Composer attachment menu;
- Media Manager and exact `Xem gốc` return/highlight;
- Call full/mini/restore/end mock fallback used by standalone smoke;
- PC Admin Directory + Chat split-pane;
- no horizontal overflow at verified widths;
- mobile input text remains >=16px and Composer stays in viewport.

Separate V3.4 notification-menu preview was measured at 280px and 1280px. The worst-case Admin menu holds five rows (`Đa phương tiện · Thông báo · Sửa · Nhóm · Xóa`) with zero horizontal overflow: 280px panel x=58 width=210; 1280px panel x=1054 width=210. User menu is shorter and inherits the same popover owner.

## LiveKit call runtime retained
Live runtime keeps the existing Call UI owner and uses:
- Supabase RPCs as canonical call state/signaling;
- `taphoa-livekit-token` for JWT-authorized room credentials tied to call + device;
- `livekit-client` audio transport only;
- remote audio subscription as the trigger for canonical `connected` state;
- `setMicrophoneEnabled()` for mute/unmute;
- `room.startAudio()` primed directly from Call/Accept user gestures for Safari/iOS autoplay policy, then the same Room is reused for LiveKit connect.

Mock/standalone mode remains independent and keeps its timer/history fallback. Live mode does not append a synthetic CallEvent; timeline projection comes from the Supabase message source.

## Backend/data state recheck
Read-only recheck after PWA work:
- Admin: 1
- U2: 6
- Guest profiles: 0
- Anonymous Auth users: 0
- Messages: 0
- Calls: 0
- Conversations: 0

No production deployment, GitHub push, Supabase DDL or Edge Function deployment was performed for V3.4.

## Still deferred / not claimed PASS
- applying the prepared legacy `anon` read-policy hardening migration to the main Supabase project;
- browser-to-Supabase/LiveKit two-device E2E in this sandbox (browser outbound networking is blocked);
- browser localhost Service Worker registration (loopback navigation blocked by sandbox policy);
- `npm run build` Vite production bundle (local `vite` binary unavailable);
- production deployment.
