# Repair Map

Use this file before changing code. A visible symptom is not automatically the repair location.

Routing order:

`User report -> Surface -> Region ID -> Runtime context -> Concern -> Canonical owner -> Focused tests`

## Canonical routing table

| Symptom / request | Concern | Typical visible region | Canonical repair owner | Supporting owner | Do not patch first in | Focused checks |
| --- | --- | --- | --- | --- | --- | --- |
| Login/logout/token restore/expired session | Auth/session | `ADMIN/LOGIN` or app status | `src/session/` + `src/supabase/` Auth adapter | `src/app/startup.ts` only for sequencing | screen CSS, PWA, message runtime | session/auth adapter tests |
| Guest/customer/Admin role wrong or ambiguous | Identity/authorization | `CUSTOMER_CHAT` / `ADMIN` | `src/identity/` + identity RPC/RLS | `src/supabase/identity-backend.ts` | route-name checks, CSS, Admin screen flags | identity contracts/runtime + backend auth tests |
| Admin cannot enter workspace with valid Auth | Identity/Admin boundary | `ADMIN/LOGIN` / `ADMIN/WORKSPACE` | `src/identity/` then `src/admin/` boundary | Admin authorization RPC/RLS | customer bootstrap, PWA, `main.ts` workaround | startup + Admin runtime tests |
| Admin inbox/detail wrong | Admin orchestration/data | `ADMIN/INBOX` / `ADMIN/CONVERSATION/DETAIL` | `src/admin/` + Admin backend/RPC | Admin UI view-model | message UI global state | Admin runtime/backend/view-model tests |
| Message load/send/dedupe/subscription wrong | Chat message state | `CUSTOMER_CHAT/MESSAGE_LIST` / `ADMIN/CONVERSATION/MESSAGES` | `src/chat/message-runtime.ts` + message backend/Realtime | owning screen render/view-model | screen-local duplicate subscriptions | message-runtime/backend tests |
| Customer support bootstrap/conversation wrong | Chat bootstrap | `CUSTOMER_CHAT` | `src/chat/` + support RPC/backend | identity result | Admin startup, PWA | chat bootstrap/runtime tests |
| iPhone focus auto-zooms editable field | UI typography | `CUSTOMER_CHAT/COMPOSER/INPUT`, profile/Admin form input | owning component CSS | `docs/MOBILE_CONTRACT.md` | viewport JS, `user-scalable=no`, `maximum-scale=1` | computed font >=16px on iOS-class mobile |
| Keyboard geometry detected incorrectly | Viewport/keyboard | `CUSTOMER_CHAT/COMPOSER` | `src/viewport/` | lifecycle/browser signals | composer padding hacks, hard-coded keyboard height | viewport state/controller tests + device matrix |
| Keyboard state correct but composer placement wrong | UI geometry | `CUSTOMER_CHAT/FOOTER` / `CUSTOMER_CHAT/COMPOSER` | owning screen/footer/composer geometry | `src/viewport/` published state | PWA/SW, backend, child button margins | 280/320/390/480 + iOS/Android browser/PWA |
| Header/footer conflicts with notch/home indicator | Safe-area geometry | `CUSTOMER_CHAT/HEADER` / `CUSTOMER_CHAT/FOOTER` | owning parent/shell CSS | viewport/display mode | individual child button safe-area hacks | safe-area on iOS browser + standalone |
| Page/body scroll fights message list | Scroll ownership | `CUSTOMER_CHAT/MESSAGE_LIST` | owning screen + `src/ui/chat/scroll-controller.ts` | viewport state | random body padding or message leaf styles | keyboard open/close + reading-old-messages tests |
| One screen/region overflows horizontally | Responsive geometry | affected Region ID | highest failing parent/geometry owner in `REGION_REGISTRY` | child only if parent contract passes | global CSS or unrelated backend | 280/320/390/480 continuous resize |
| PWA install/update/cache stale | PWA/lifecycle | app shell | `src/pwa/` + `src/sw.ts` | deployment config | Auth/chat/media runtime | PWA registration/cache/update tests |
| Mic permission/capture/local audio track wrong | Media capture | future call surface | `src/media/` | permissions/device owner | TURN, chat UI, Auth | getUserMedia/track diagnostics |
| Remote packets arrive but no audible playback | Media playback/audio route | future call surface | `src/media/` audio playback/route owner | call runtime | TURN or signaling unless evidence points there | remote track/audio element/playback diagnostics |
| Peer cannot connect / ICE fails | WebRTC transport | future call surface | call/media ICE transport owner | signaling backend + TURN adapter | generic UI/PWA/Auth | ICE state/candidate-pair diagnostics |
| Relay required / TURN credentials or allocation fail | TURN transport/provider adapter | future call surface | media ICE/TURN adapter + Cloudflare TURN config boundary | call signaling only for credential delivery | Supabase Auth/UI/CSS | relay candidate + allocation/connectivity checks |
| Browser works but installed PWA fails | Display-mode-specific lifecycle/viewport | affected Region ID | concern owner plus runtime display-mode boundary | PWA only if install/lifecycle itself is wrong | one shared `isMobile` workaround | same OS browser vs standalone comparison |

## Owner-first rule

1. Identify the Region ID from `REGION_REGISTRY`.
2. Classify the concern independently from the visible location.
3. Trace Owner/Parent -> Sibling -> Child/Leaf.
4. Repair the highest canonical owner whose contract/state is wrong.
5. Keep composition points (`src/main.ts`, top-level screen host) thin unless sequencing/mounting itself is the bug.
6. Remove obsolete workarounds when the canonical owner is repaired.
7. Run focused owner tests before broad assembled-flow verification.

## Rollback rule

Rollback by the smallest verified change set associated with the same Region ID + concern. Do not revert an entire release because one leaf region regressed unless the regression is proven to come from a release-wide owner change.