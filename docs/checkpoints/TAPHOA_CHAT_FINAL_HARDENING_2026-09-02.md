# TAPHOA CHAT — FINAL HARDENING CHECKPOINT — 2026-09-02

## Scope completed
1. Incoming call decline across all callee devices.
2. Admin inbox realtime refresh for preview/unread/order when `chat_messages` changes.
3. Call/PWA lifecycle audit using existing automated coverage; no unnecessary new call state added.
4. Compact Admin/User presentation while preserving 280px minimum width.
5. Production hardening audit and release verification gates.

## Rollback
- Pre-hardening production `main`: `cc595a80ed69a38e50286c87ee7825204a3d8166`

## Call decline fix
- Migration: `supabase/migrations/20260902_decline_call_all_devices.sql`
- Production migration name: `decline_call_all_devices`
- New rule: one valid callee device declining ends the whole ringing call and marks all remaining ringing targets declined.
- DB verification: `all_targets=true`, `no_remaining_gate=true`, `ends_call=true`.

## Admin inbox realtime
- New: `src/admin/inbox-realtime.ts`
- One Supabase Realtime channel on `public.chat_messages`; INSERT/UPDATE/DELETE events are debounced 100ms and refresh the inbox.
- No polling.
- Conversation-specific message runtime remains independent.
- Production publication check: `chat_messages` is published to `supabase_realtime`.

## Call/PWA lifecycle
Existing verified contracts retained:
- incoming call notification navigation is scope-safe for User/Admin;
- incoming `ringing` call is rediscovered by `VoiceCallSession` polling on start/foreground;
- decline UI returns to idle before the decline RPC completes;
- answer leaves incoming state immediately on the user gesture;
- visibility/pageshow triggers active-call repoll and media resume;
- Push incoming-call TTL = 60s, urgency = high;
- server ring timeout = 60s;
- call targets include recent sessions plus Push-reachable authenticated devices.

No Hold/Swap/2-call state machine was added. Busy remains the supported second-call behavior.

## UI hardening
- Admin header reduced from 58px to 52px minimum height.
- Admin inbox row padding reduced and wrapping allowed instead of forced single-line truncation.
- User header reduced to 10px/12px padding with 8px gap.
- User notification/auth actions reduced to 30px height.
- 280px minimum viewport contract retained.

## Verification evidence
- Decline RED then GREEN: branch workflow run `33570996060` build succeeded after migration implementation.
- Admin realtime runtime GREEN: branch workflow run `33571331810` succeeded.
- Final UI/full branch gate before checkpoint: workflow run `33572076569`, `Typecheck, test and build` SUCCESS.
- Production audit at checkpoint time:
  - Admin Push subscriptions: 2 for 1 Admin profile.
  - User2 Push subscriptions: 1 for 1 User2 profile.
  - Last 24h outbox: 39 `chat_message`, 5 `incoming_call`; 0 errors, all processed.
  - Overdue ringing calls: 0.
  - Active chat sessions: 25.
  - Ring timeout: 60s; connect timeout: 30s.

## Manual-device limitation
Automated/code/backend gates can verify the lifecycle contracts, but physical iPhone/Android lock-screen Web Push and WebRTC background behavior must still be observed on the real devices. Do not label those physical-device cases PASS until they are actually exercised.

## Release procedure
- Require branch `behind=0` versus `main`.
- Fast-forward `main` only; never force.
- Verify GitHub Pages build and deploy both succeed on the final `main` SHA.
- Android APK remains manual-only and must not auto-trigger on normal `main` pushes.
