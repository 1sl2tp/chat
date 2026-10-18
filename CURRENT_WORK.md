## 2026-10-18 — BANK-159 SMS-GATED AI RECEIPT SCAN (EDGE+DB LIVE; PR/BRANCH VERIFY PASS; REAL SMS E4 PENDING)

- **User request:** Gemini must not scan every customer Chat image. Scan candidate bill images *only* when a recent incoming Agribank SMS exists; SMS first or image first must both work. Required TWO-source matched SMS+bill rule for auto-collection remains unchanged.
- **E0 SPEC:** `docs/specs/SPEC-CHAT-BANK-AUTOCOLLECT-157.md §BANK-159` locks 24h candidate window (+10-minute arrival tolerance), at most 6 pre-existing queued images woken by each new unique SMS, no cron/poll, no collection writes.
- **E1 source:** [PR #184](https://github.com/1sl2tp/chat/pull/184) merged as `b552a2ff3bb75e215f6bcc2eb4d484d64222e3c7`; new canonical versioned Edge code `supabase/functions/v21-bank-bill-event/index.ts`, `bill-sms-preview.mjs` and unchanged source snapshot of `bill-amount-rules.mjs`, plus `supabase/migrations/20261018172000_chat_bank_bill_sms_gated_ai.sql`.
- **E2 implementation:** `v21-bank-bill-event` Edge V14 deploy applied FIRST, guarded preflight queries received Agribank SMS and parses incoming transfer text (handles HH:mm DD/MM with trusted APK timestamp and year rollover), reject no valid SMS **before** any Storage bytes/hash/Gemini. If missing, return `waiting_sms`, keep receipt queued for later; no ledger updates. SQL migration `chat_bank_bill_sms_gated_ai` applied AFTER Edge: existing customer image trigger queues metadata and dispatches only when plausible recent SMS exists; new unique SMS insert wakes at most six recent queued image assets. No new periodic scanning or full chat-history reads. Existing hashed/scanned images not re-read. The SMS ingest API is unchanged.
- **E2 tests:** [branch Verify 39145870496](https://github.com/1sl2tp/chat/actions/runs/39145870496) SUCCESS, bank date/amount unit tests PASS and SQL/Edge no-AI/no-ledger guard contract PASS. Production DB after deploy: 1 SMS wake trigger; new image queue owner contains `waiting_for_banking_sms`; Edge active V14 has mandatory SMS preflight.
- **Production read-back:** `taphoa_sms_inbox` 0 rows, `chat_bank_bill_receipts` 16 rows, 0 receipts linked ledger, `chat_auto_collect_settings.enabled=false,ready=false`. SMS real delivery/AI-call savings E4/E5 NOT YET measured or confirmed, as no live SMS was present. Old 16 receipt results are preserved and are not retroactively cleared. Do not claim future matches/automatic ledger work before real pilot.
- **MUST-STAY:** manual Thu tiền/Ghi nợ completely independent; automatic collection requires **BOTH** uniquely matched real bank SMS and customer Chat bill and Admin toggle ON. This patch **does not implement nor enable ledger auto-collection**. No Chat message/sync/push/Zalo/Storage cleanup changes.
- **Rollback:** restore original image queue dispatch function and drop only `chat_bank_bill_wake_on_sms_insert_trg` if needed, revert Edge to V13 previous source. Avoid any data cleanup; auto-collection remains OFF.
- **NEXT E4:** inject nothing synthetic into production. Observe first real incoming bank SMS from approved Android APK and customer bill both directions; compare Gemini requests, time parsing, duplicate handling and output statuses; only then plan separate atomic ledger/ready gate. 
- **Release verification:** main Verify after merge and device/real SMS proof still need to be added when available.

---

## 2026-10-18 — BANK-157 Auto-collection ADMIN switch foundation (DEFAULT OFF / CI+PAGES PASS; SMS PILOT & E4 PENDING)

- **User intent:** prepare SMS Banking + bill automatic collection, but keep it OFF until the Admin explicitly controls it in Chat. Only Admin can control the system-wide flag.
- **2026-10-18 user-confirmed business invariant:** Admin's **Thu tiền / Ghi nợ thủ công** is completely independent of automated collection. **TỰ ĐỘNG THU TIỀN** must require **BOTH** a customer-uploaded bank bill in Chat **AND** an independently ingested, valid incoming banking SMS to be a unique, verified 1:1 match. Bill-only or SMS-only NEVER posts a collection; duplicated/ambiguous/mismatched evidence NEVER posts either. One SMS/bill may be consumed at most once. Correct UI name is `Tự động thu tiền`. Spec amended first in `34448abe`; UI copy/test updated in [PR #183](https://github.com/1sl2tp/chat/pull/183), commit `329c56db3a3637e5298d42acd68d806ac1d99701`. **NO automatic collection writer enabled; ready=false, enabled=false verified after merge.**
- **E0 spec:** `docs/specs/SPEC-CHAT-BANK-AUTOCOLLECT-157.md`. SMS inbox and bill OCR already exist, but on this date SMS rows=0 (one active ingest device); bill reader had 16 rows, 9 amount_read in 24h, and zero linked ledgers. Readiness MUST NOT be inferred from mocked SMS or bill text.
- **E1 UI:** Chat > Cài đặt tài khoản (existing Admin-only Zalo-account settings) now shows `Tự động thu tiền` with server-derived OFF / ON / not-ready. `zalo-admin-link.js` queries the secure RPC on explicit Settings open and writes only on explicit click; no browser-only toggle, interval, new message transport, or chat read-state changes. `sw.js` epoch `bank-admin157` plus regression tests updated.
- **E2 DB:** Applied migration `20261018160348_chat_auto_collect_admin_settings_disabled_foundation` to Supabase project `vtqhbhrkdxirqeqkgylo`; DB setting verified `enabled=false,ready=false`. Anon cannot call/read/write; authenticated cannot write table; server checks active Admin role via `v21_private.current_active_account_id()`. Enabling while `ready=false` is rejected at database level. No ledger writer/cron added by BANK-157.
- **E3:** [PR #182](https://github.com/1sl2tp/chat/pull/182) merged squash `137c6a89e4cc8dade49d828bc3d0671c3733764d`; [Verify V21 39143839890](https://github.com/1sl2tp/chat/actions/runs/39143839890) SUCCESS and [Deploy Chat Pages 39143839900](https://github.com/1sl2tp/chat/actions/runs/39143839900) SUCCESS. Canonical build sync commit `2eec35188c3b0fbe148e14757c828c34e6793e90`.
- **E4/E5 PENDING:** No authenticated Admin browser/PWA screenshot yet; cannot state physical Safari/iPhone sees the new setting. No real bank SMS or end-to-end bank-confirmed pilot tested; AUTO COLLECTION IS NOT ACTIVE. Do not set `ready=true` or offer ON until text parser for `HH:MM DD/MM` Agribank format, client timestamps, duplicate cases, unique SMS↔bill mapping, role/account controls and idempotent ledger writer pass integration/pilot and user approves activation.
- **Resources/data:** one admin RPC GET per explicit Settings open, one RPC mutation per explicit Admin click; zero steady-state polls/cron, no changes to existing Chat Realtime/push/media/Zalo, no new ledger writes.
- **Rollback:** Set `enabled=false` in secure config first if ever activated, then revert UI change or prior commit and rebuild canonical files; do not delete SMS, images, messages or debt history.
- **NEXT ACTION:** verify one real AGRIBANK SMS arrives from approved APK; read-only parse and match against a unique test bill, then implement a separately gated atomic ledger writer with failure/duplicate tests. Keep `ready=false` until the entire path is proven.

---

## 2026-10-18 — UI-156 Chat date dividers + floating date while scrolling (SOURCE / VERIFY / PAGES PASS; E4/E5 PENDING)

- **User request:** distinguish today/yesterday/weekday + date in conversation history; show the latest message time in the conversation list; when scrolling, keep a temporary date marker visible without moving the message list.
- **Root cause:** `shell.js::formatContactTime` showed yesterday as a weekday, while `app.js` had no per-day separators or scroll-date marker.
- **Patch:** list time is now `HH:mm` today, `Hôm qua` yesterday, weekday for 2–6 days, and compact date for older messages. In the thread, one date divider is inserted inside the corresponding virtualized message row only at date boundaries. A zero-height sticky chip displays the first visible message's date while scrolling and fades after 900ms idle.
- **Scroll safety:** marker only reads geometry and timestamps; it never writes `scrollTop`. Existing `appendScrollPolicy`, ScrollController, anchor restoration, virtualization, and remote follow-tail rules remain owners. No DB/Supabase/Realtime/polling/RPC/cache changes.
- **Tests:** UI-156 date-label runtime and UI contract PASS. The first run caught an old UI-72.50 test asserting the exact old scroll listener; updated that assertion in follow-up test commit `3b5ce1121b25e96f200cfe98e89bddc84a5ea681`, then reran successfully.
- **E1 source:** `8444a5549922df7d0185da59aa1d810a1232ac1d`; follow-up test contract `3b5ce1121b25e96f200cfe98e89bddc84a5ea681`. Verify V21 also synced canonical generated artifacts in `ddd70a3d8dcc78f6d12e9901d53c11bd03f03920`.
- **E2 Verify V21:** PASS — [run 39086614098](https://github.com/1sl2tp/chat/actions/runs/39086614098), including canonical source verification and both UI-156 tests.
- **E3 Pages:** PASS — [run 39086614085](https://github.com/1sl2tp/chat/actions/runs/39086614085), deployment and custom-domain verification succeeded. Canonical build ID `db28addacf056743dcdfde51b2ab485e19681b2b5c9da30a563cc999f96f2014`; `index.html` SHA-256 `3d016ae3da1b28d27dcf0422d185619e3ffe2807f7f96558e4579253814dd8ae`.
- **E4/E5 pending:** still requires checking a logged-in Safari/iPhone PWA after the service worker activates, including reading older messages and receiving a new message while away from the tail. CI/deploy does not prove the user's installed PWA has switched shell.
- **Rollback:** revert UI-156 source/test/workflow changes and shell epoch, regenerate canonical `index.html/version.json`, rerun Verify/Pages. No data rollback.
---

## 2026-10-13 — UI-154 Four precise photo corners (VERIFY/PAGES PASS; REAL SAFARI E4 PENDING)

- User screenshot on desktop shows radius14 looking fuzzy at four corners, particularly light-background scanned receipt. Screenshot address included an old _build=e71f9bd... value; actual running cached shell cannot be confirmed from image alone.
- Canonical Google Sheet F-133/134 Rev4 + SDD row126: keep a single R14 clip on outer media; remove geometry-changing 1px border and instead paint subtle 1px absolute, pointer-events:none ::after overlay with border-radius inherit. Single and album both have padding0; album tile gap4px; no per-tile round corners, no frame/ratio changes, no transform hacks.
- Scope: index.source.html image/gallery root CSS, sw.js shell epoch img154; same generated index.html/version.json; new UI-154 static regression + updated UI-153/V21.72.43/75 tests. No changes to app.js, rotation, viewer, data, messages, Supabase, RPC or lazy media.
- E1/E3 PASS: UI-154 four-corner test PASS and Verify V21 `38438243951` SUCCESS, Pages `38438011675` SUCCESS including HTTPS domain. Runtime CSS/PWA/build commit `d933abcebf60ca7c7200dc6f46eec7363df77a0b`, follow-up test-only commit `0603d7c8c50ba3ae9b63274959e1efd1c07d49b5`, build `4a13b1baf3ef3383320c76993772c98d08260ac17e0c86b6f37461718a32266d`. Independent Chromium DPR2 corner smoke shows R14/border0/inset pseudo and 4 gallery children unchanged. E4 logged-in physical Safari/iPhone PWA old-vs-new screenshot PENDING; E5 real network/write measurement pending. No DB/backend changes.

---

## 2026-10-13 — UI-153 IMAGE MEDIA EDGE + VIEWER WHEEL + EXIF (VERIFY/PAGES PASS; DEVICE E4/E5 PENDING)

- Screenshot comparison: root media portrait/landscape edges visually differ ~4px. Canonical Google Sheets F-133/134/135/137 + SDD 125 updated BEFORE code. Remove outer 4px inset for both single and gallery, keep ONE shared rounded 14px border 1px subtle and 4px INTERNAL album tile gap; no sender lane/size or orientation classification changes.
- Viewer wheel meaning: at normal 100% when more than one image, wheel navigates one previous/next with throttle; at zoom >100% and Ctrl/Cmd+wheel, wheel zooms. Filmstrip wheel moves thumbnails horizontally, click selects; message list scrolling remains normal. Preserve touch swipe, image pinch, keyboard arrows and viewer album/current-filter.
- Browser EXIF auto orientation via image-orientation:from-image for single/gallery/viewer only, manual per-asset rotate still available when EXIF is absent or inaccurate; never infer content angle from ratio alone or mutate media bytes/DB. No extra image prefetch/network/cron/log.
- Source: app.js viewer wheel, index.source.html media edges and EXIF, sw.js PWA epoch img153; updated existing tests plus new wheel/EXIF test, canonical index.html/version.json.
- E1/E3 PASS: runtime release commit `680ac90ae6673f65e487a47ff30989ec8fa1dda0` (initial `76071987a4da25b6edb1fb7db8bd568f5e4b4a52`), build `f03a62b4b85a70ddabbb75d34877088373e7c8285f7a10ae4f22921e0e79f4e1`, Verify V21 `38435857344` SUCCESS (UI-153 new test + canonical source), Pages `38435856962` SUCCESS (canonical build/deploy/custom domain). Preserved original sender rail after fixing one legacy test assertion conflict. E4 logged-in Safari/PWA screenshot and E5 network/resource/user acceptance PENDING. Rollback only UI sources/build; no data cleanup.

---

## 2026-10-13 — F-133 REV2: PORTRAIT / SQUARE / LANDSCAPE CLASSIFICATION FIRST (SOURCE + VERIFY + PAGES PASS, E4/E5 PENDING)

- User supplied iPhone screenshots: Techcombank vertical receipt rendered too narrow; prior repair used 48dvh to derive portrait width. Clarified requirement: classify source image by intrinsic W/H before choosing both preview dimensions; no arbitrary viewport-height increase.
- Canonical Sheet 04 F-133 rev2 and F-137: portrait H>W width=min(260,560*W/H), square=320, landscape=360; all scale to available sender lane and preserve native ratio. Gallery 2+ retains 2/3/4+ fixed preview grid; viewer always contain and only selected filmstrip thumb has neutral border.
- Changed app.js imageAspectRatio/singleImagePresentation (no 48dvh width calculation), index.source.html portrait cap560, SW shell epoch img152; shell/tile same --message-media-width; no new image fetch/realtime, read-state, RPC/Edge, Zalo or Storage write. Historical owner assertions migrated; new F133 ratio regression includes device height invariance.
- E1/E3 verified: commit `5d3685888f02571cd2ed89852c552063370660f7`, build `99e77f0f2945ec5b8e08e87d341a8c1566a1eea609ee0102ddf5422f665d9b76`; Verify V21 run `38432942253` SUCCESS (geometry F133 test + canonical build PASS), Pages `38432942423` SUCCESS (canonical build, deploy, HTTPS/custom domain). **E4 logged-in Safari/PWA screenshot after build activation and E5 real network/user acceptance PENDING**. Rollback only these source/test/build files and PWA epoch, never delete user data.

---

## 2026-10-13 — F-133..F-137 Chat image geometry / album / viewer (SOURCE / VERIFY / PAGES PASS; iPhone E4 & resource E5 PENDING)

- User approved code fix based on canonical Google Sheet F-133…F-137. The actual issue was portrait preview width computed from constant 460px although CSS clipped portrait at min(48dvh,460px), making excess background on short iPhone viewports; thumbnail selection previously blue with -2px transform.
- Owner: `app.js` singleImagePresentation/messageInlineImageHeightLimit, local portrait geometry on window resize/orientation; `index.source.html` viewer CSS; `sw.js` epoch img151 for PWA shell rotation. Keep image intrinsic ratio without square/landscape clamping; gallery previews only use cover, full viewer contain.
- **Release and evidence:** corrective legacy test assertion updated without bypassing it; final commit `ebaa00347394f6e7d073aa6db802003a8bb38078`, build `e71f9bd26a6d08cbeb02a6e80f43c40d56f0606e5cda7a55bae7510768cde444`; Verify V21 `38429885277` SUCCESS (new F-133..137 runtime step & canonical check both PASS); Chat Pages `38429885358` SUCCESS (canonical build, deploy, custom-domain HTTP200 check). No screenshot or logged-in Safari/PWA verification was performed. Avoid claiming E4/E5 PASS.
- New/update tests: `tests/test_v21_image_geometry_f133_f137.js`, V21.72.28, V21.72.75, UI library composer media and Verify V21 workflow. Same one build `index.html` + `version.json`. The entire package must be verified before marking E3; Safari/PWA E4 and resource E5 still PENDING.
- No Supabase/Realtime/Zalo backend, no media-fetch change, no `v21_mark_read` on image open, no cron/RPC/log writes. Preserve account cache and scroll, left-right sender 6px. Rollback this atomic source/build change if browser regression; do not delete data.

---

## 2026-10-13 — UI-150 Copy / Download / Share after message rail & gap changes (RULE FIRST; CI/PAGES PASS, iPhone E4 pending)

- **User request:** recheck Copy, Share and especially Download across text + media after prior left/right/gap alignments in Chat Web/PWA. The former side action rail had 32px-height hitboxes (40×32 coarse) and stayed at `left/right:100%` even on narrow screens, risking off-screen tap areas for multiple buttons.
- **Rule first:** `README_MAINTENANCE.md §3i UI-150` + canonical Google Sheet **08 - SDD SPEC TEST ACCEPTANCE row122** and **04 - UI FOUNDATION TOKENS F-132 row192** recorded before code. Matrix: raw text Copy even with media caption; original media Download; in-Chat Forward; OS-native Share only on supported browser/gesture. Image viewer always operates on selected current asset.
- **Source owner:** `app.js` keeps one `createActionGroup`. It now adds Copy on any nonempty `message.text`, including mixed text+media; Download for image/gallery/file/audio; internal forward labeled **Chuyển tiếp**, native OS labeled **Chia sẻ**; low-to-high priority ordering keeps Copy/Download nearest message. Native text Share runs immediately inside click. Clipboard fallback `execCommand` success is checked; copied/failed status never claimed before result. Audio format extensions MP3/M4A/OGG/WEBM/WAV and Blob/File MIME correct; native file Share includes optional mixed-text caption and preserves user activation. Missing native Blob: prime lazily, show `Chạm lại để chia sẻ` instead of fake success, no duplicate preload; account-scoped media guard untouched. Viewer menu `Tải ảnh` with 44px touch targets.
- **CSS owner:** `index.source.html` keeps existing mirrored outside rail on desktop fine pointer; on touch/(max-width:700px) toolbar is positioned absolutely above/below message using open-time available space, clamped to safe-area viewport sides, with **44×44px buttons, gap4px**, no message reflow or scroll owner change. `ui-foundation.css` existing 44px touch token reused; no new layout tokens or backend calls.
- **Tests:** existing `tests/test_v21_mobile_share_group_roles.py`, `tests/test_v21_native_image_share_user_activation.py`, `tests/test_v21_image_viewer_shell_controls.py` updated for new labels/signature; new `tests/test_v21_ui150_copy_download_share_contract.py` added and wired into `.github/workflows/verify-v21.yml`. Independent Verify V21 **38424299926 SUCCESS** (including new test); previous Verify **38424174976 SUCCESS** before wiring new test. Deploy Chat Pages **38424039654 SUCCESS** for release head `8031e386077c0eec98714cff2834d115f64e3d7f`. Build `a0ab1c153365050b16465e845002391cb114b085f62fd12f5b68bba88c9679f1`, index commit `4e5d2f6b37455c9197bcc81ea6db362f67b514ae`; PWA shell epoch `ui150`.
- **E4/E5 pending:** physical iPhone PWA/Safari send and received single/mixed text, photo/gallery, audio/file, OS share sheet, clipboard and download; verify toolbar never spills/composer overlaps in real viewport. GitHub CI does not establish that user's active PWA received new build. No change in Supabase, Storage, RPC/Realtime, chat or media cache; no extra polling, eager hydration, or logs.
- **Rollback:** revert `app.js`, `index.source.html`, SW shell epoch, related tests/workflow and rebuild canonical `index.html/version.json`, re-Verify/Deploy; do not alter DB.

---

## 2026-10-13 — WORK-149 Clear stale Work AI summaries, leave Chat + Taphoa untouched (DATA & PAGES PASS; Verify/E4 pending)

- **User screenshot + request:** Work / Công việc showed completed product rows for "Cô Huyền pl" and old customers; user asked to delete all old Work *content*, not the Work tab or customer/business records.
- **Rule first:** `README_MAINTENANCE.md §3h WORK-149` committed before SQL/code; Google Sheet canonical RULE CHUNG tab `08 - SDD SPEC TEST ACCEPTANCE` row121 and `04 - UI FOUNDATION TOKENS` F-131 row191 recorded. Scope owner: `chat_customer_summary_work_feed()` reads only `chat_customer_summary_state.last_result` and `chat_customer_summary_completion`.
- **Actual AI status:** `chat_customer_summary_runtime_config()` reports scan key present, Gemini key absent; HTTP dispatch guard already prevents AI request without Gemini. Latest 713 archived `chat_customer_summary_runs` began 2026-10-04; 32 work-state records existed (25 scanned, 17 contained items), 215 completed keys in 13 customers; stale dirty queue count 25 before cleanup. Do NOT call AI active or restart scans.
- **ONE scoped transactional DB write** on **Supabase chat-bh-get vtqhbhrkdxirqeqkgylo**: lock dispatch advisory; abort if any active claims or configured Gemini key; clear last_result to empty items/notes, last_scanned_at=NULL, last_run_id/error/claim=NULL, processed_version=dirty_version for all 32 Work state rows; delete 215 Work completion rows. Keep 713 run audit logs. No mutation of `v21_messages`, `v21_media_assets`, `taphoa_orders`, `taphoa_debt_ledger`, `chat_order_drafts`, `chat_customer_care_daily` or AI inbox/scan tables.
- **DB post-verify:** visible state 0, state with items 0, stale queued state 0, completion 0, audit runs 713; v21_messages 5631, taphoa_orders 127, taphoa_debt_ledger 233.
- **Small UI fix:** `work-customer-summary.js::renderCurrent()` detects no `rowsCache`, clears ONLY Work selectedWorkCustomerId, renders `renderOverview([])`, empty text `Chưa có công việc nào.`; keeps active Chat contact, directory scroll and Work tab. Test `tests/test_v21_work_customer_summary_ui.py` updated and `sw.js` shell epoch moved ui148→work149 (matching mobile UI polish test), no IndexedDB delete or added polling.
- **Release:** version/build `51acb2635a32060c2f8b849dabdd5718f63f92c87f0276e31c9955660654f8a1`, index commit `3afff2cb9ed9874aec93eaf02cb21da00a8b42b1`, version commit `4c92327278ea8c681da1f6d7cebec0eada7135cd`; GitHub Pages Deploy **38421046984 SUCCESS**. Independent Verify V21 run **38421046977 PENDING** when last checked; E4 actual PWA visual and E5 acceptance also pending. Do not misreport these as PASS.
- **Potential next action:** If Work AI is explicitly re-enabled in future, supply valid Gemini key through existing secure config only after user request; do not reprocess old chat history without new spec. Work content remains blank until new successful scan.
- **Rollback:** Can reconstruct summaries from preserved 713 runs if explicitly requested, but deliberately erased 215 completion checks are not guaranteed recoverable. Roll back UI source/epoch/canonical build separately; no silent DB repopulation.

---

## 2026-10-13 — UI-148 Image Viewer defaults to nearby photos in active conversation (RULE FIRST; Verify/Pages PASS, E4 pending)

- **Screenshot/root cause:** opening a single image from `gd me yeu` showed "Ảnh 1 / 1" despite nearby image messages because `app.js::openImageViewer()` initialized `imageViewerFilter=imageViewerAlbumId?'album':'all'`. Existing collectConversationImageAssets/Prev/Next/ArrowLeft/ArrowRight/swipe/filmstrip already support chronological multi-message navigation, but the automatic album restriction hid it.
- **Rule-first:** `README_MAINTENANCE.md §3g UI-148` committed **before source**, Google Sheet `08 - SDD SPEC TEST ACCEPTANCE` row120 and `04 - UI FOUNDATION TOKENS` F-130 row190 also recorded before source modification. Scope: within active conversation store only, keep A/B and Album hiện tại manual filters, no full-history RPC.
- **Minimal source:** `app.js` now defaults `imageViewerFilter='all'` every time an image is opened; `imageViewerAlbumId` retained for explicit Album selection and updated to the currently displayed image's `messageId` upon manual Album filtering. Keeps selected `assetId`, chronological store order, image 1/N counter, nav keyboard/swipe, zoom/reset, viewer close, current-only save/share, and lazy hydration. If only one image truly loaded, still 1/1. No cross-contact or whole-history fetch.
- **PWA:** Existing `sw.js` HTML shell epoch moved from ui147 to **ui148**; does not erase IndexedDB/media history or add requests. `tests/test_v21_ui_library_composer_media_menu.py` locks default/all and album/current plus existing nav controls, and `tests/test_v21_mobile_ui_polish.py` matches epoch.
- **Release:** build `4458e008e63d2f3506482008d713fd5aa1583824f79b0c5953333c8972621dad`, canonical `index.html` commit `246636fefbcb5e34a3f04fc09aa1bc4f830caab5`, version commit `7c7c7a292d0aeb9366b1a10d0e6662276bbb0597`. Verify V21 **38418655386 SUCCESS**, Deploy Chat Pages **38418654934 SUCCESS**.
- **E4/E5 pending:** real iPhone Web/PWA open any photo in a thread with >=2 already-loaded photos, verify previous/next / swipes / thumbnail and counter. Installed PWA may show cached shell until close/relaunch after SW activation. No E4 device verification yet.
- **Rollback:** restore album default and manual filter source, test, SW epoch, rebuild canonical HTML/version and rerun Verify/Pages. No DB/Realtime rollback.

---

## 2026-10-13 — UI-147 Danh bạ vertical rhythm (RULE FIRST; Verify / Pages PASS, E4 pending)

- **User ask 21:35:** top tabs → "Danh bạ" and title → search too spacious. Approved targets: approximate visual 20–24px and 12–16px rather than screenshot's prior 36–40px and 24–28px. Mobile iPhone screenshot pixel scale is illustrative, not literal CSS measurement.
- **Rule before code:** `README_MAINTENANCE.md §3f UI-147`, spreadsheet Rule chung `08 - SDD SPEC TEST ACCEPTANCE` row119, `04 - UI FOUNDATION TOKENS` F-129 row189 were committed **first**, before CSS edits; UI-146 shell-only epoch requirement then added to rule before `sw.js` edit.
- **CSS owner:** `ui-foundation.css` adds `--ui-directory-root-top-min:12px` and `--ui-directory-top-trim:16px`. `mobile-ui-polish.css` scopes to authenticated `data-mobile-directory=true`, root top padding `max(12px, safe-area-top - 16px)`, heading bottom padding 0, body top padding 0. No transforms, negative margins or changed overlay top; horizontal rails UI-145, 44px search/input, chip spacing, 60px rows, 40px avatars, directory scroll and keyboard untouched.
- **PWA shell:** ServiceWorker `SHELL_CACHE_EPOCH='ui147'` causes old HTML shell cache to be replaced upon activation with existing offline-first behavior. IndexedDB/chat history and push unchanged. `tests/test_v21_mobile_ui_polish.py` expanded for scoped vertical geometry and SW epoch.
- **Release:** build `e189f08cc4dc44b082dc683ffe4f92173c3928989e1ca5f79f2ac8919440bdc6`; `index.html` commit `fba401f0b8be75e529891a312aa1fdfb745fe42b`; `version.json` commit `4692ae2d499772b16817bf791fa78d3938b9b781`. E1/E2 Verify V21 **38416477490 SUCCESS**; E3 Deploy Chat Pages **38416477571 SUCCESS** (canonical verify and Pages custom domain).
- **E4/E5 pending:** screenshots and measured spacing from actual Safari/PWA after closing/reopening and SW activation; no device screenshot instrumentation available. E4/E5 cannot be inferred from server deploy. No extra RPC/DB/Edge/Realtime/polling/log calls; no media/cache reset.
- **Rollback:** revert UI-147 CSS tokens/mobile directory rules, `sw.js` epoch, tests; rebuild canonical HTML/version, rerun CI/Pages.

---

## 2026-10-13 — UI-146 PWA screenshot status / mobile directory root gutter / shell epoch

- **User screenshot 21:07**: Directory rows, heading, search and first filter share an x-axis but have ~36px outer space, rather than the UI-145 12px control rail; conversation uses different deliberate rail6 for received/sent messages. Screenshot cannot reveal exact installed PWA build ID, so do not assert app was stale solely on appearance.
- **Proven CSS cause**: `reference/chatgpt/full-source/raw-css/app-CIyuNPp8.css` imposes `.wm-sidebar-sidebar` horizontal `var(--size-24,1.5rem)` padding (24px). UI-145 nested components correctly add 12px but ancestral 24px remains. `mobile-ui-polish.css` now resets ancestor's `padding-inline:0!important` only for authenticated active mobile directory; leaves vertical padding, scroll, desktop and all actions untouched.
- **PWA cache**: `sw.js` previously used `CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION`; `RELEASE_VERSION` held at V21.72.39 across UI-only releases, and cached navigation HTML can be displayed before existing background network revalidation. New `SHELL_CACHE_EPOCH='ui146'` forces replacement of prior shell namespace when worker activates; no deletion of IndexedDB/messages/avatars, no added network polling, no change to offline-first or authenticated safe reload.
- **Canonical build:** UI-146 `271ffd11a918b8c4b209150247706318728929ae2d6d7ff19b3c3bc9f512d365`, index commit `cd1377d08302bd8c8608eba0ae61389c02e0cb54`, matching version commit `3acfa0726ad55ef84177f1cc2a7e06ad9a084669`. Test `tests/test_v21_mobile_ui_polish.py` extended to lock root reset/SW epoch. **Verify run 38411637081 SUCCESS; Deploy Chat Pages run 38411637777 pending as of last check (prior deployment 38411629178 in progress).** Do not mark Pages or actual iPhone PASS before confirmed.
- **Rule/Sheet:** `README_MAINTENANCE.md §3e UI-146`; Spreadsheet `04 - UI FOUNDATION TOKENS` F-128 row188, `08 - SDD SPEC TEST ACCEPTANCE` UI-146 row118. E4 verify actual `window.V21AppUpdateController.snapshot().currentBuild` vs server `version.json.build_id` and 12px DOM edges on iPhone PWA after relaunch; E5 user acceptance.
- **Rollback:** revert mobile-ui-polish.css and sw.js, rebuild canonical index/version, run Verify and deploy. No backend change.

---

## 2026-10-13 — UI-145 2 semantic horizontal rails: Top/Directory/Thread/Composer (CI + Pages PASS, iPhone E4 pending)

- **Screenshot scope:** C Thúy đông conversation and directory in iPhone standalone PWA. Prior UI-144 made Composer outer rail12 but header had inherited desktop `.chat-content-axis` 16px `!important`, Directory nested tools/list/row added separate margins. Distinguish visual bounding boxes from glyph/text internal padding.
- **Rule:** `README_MAINTENANCE.md §3d UI-145`; canonical Sheet **04 UI FOUNDATION TOKENS F-127 row187** and **08 SDD SPEC-CHAT-LAYOUT-RAILS-TOP-DIRECTORY-THREAD-COMPOSER-20261013 row117**. 12px action/form outer rail for Top, directory title/search/filter/avatar/time, Composer; **6px message edge rail** for remote-left/self-right text and media. Use safe-area at physical edges. Desktop 2/3-column unaffected.
- **Source fix:** `ui-foundation.css` adds `--ui-chat-layout-rail:12px`, `--ui-chat-message-rail:6px`; `mobile-ui-polish.css` explicitly overrides inherited header padding important, directory body6 + tools6 / list2 + row4, mobile directory scrollbar-gutter:auto; `mobile-chat-refresh.css` threads both new tokens into Composer and messageWindow without new scroll owner; `ui-library/index.html` Composer demo uses 12px preview rail. Only presentation CSS and test literals changed.
- **Tests:** `tests/test_v21_mobile_ui_polish.py::test_ui_145_one_layout_rail_for_header_directory_and_composer`, `tests/test_v21_140_zalo_card_narrow_axis.py`, `tests/test_v21_incoming_left_edge_contract.py` changed old hard-coded 6px string assertions to assert value + usage. E1/E2 **Verify V21 run 38407051093 SUCCESS**, E3 **Deploy Chat Pages run 38407051005 SUCCESS** at commit `a5e00042285396cc7ecad8581a60f6c9dd88d80c`. Release build `9327d82e7b4b157304f4d8ec06bf3996ee8c2ac9ce41e994f53667c1d2f054e0`; index/version commits `8da8a8a437d9deaa03033edacb9250606f861d5e`, `25105cfc08c070e0b25d0c8a5c7013fce28be02a`.
- **Acceptance pending:** E4 real iPhone Safari/PWA after fully closing/reopening app, screenshots of directory and conversation with Top/Directory/Composer at action rail12 and messages at edge6, keyboard and landscape; E5 user's visual acceptance. No network, API, Realtime, IndexedDB, Zalo or scroll position changes. If top avatar clipped vertically due restored list scroll, treat as a separate scroll-position ownership issue, not as a left/right CSS change.
- **Rollback:** revert UI-145 CSS, UI demo/test additions then rebuild index/version and Verify; do not edit DB.

---

## 2026-10-13 — UI-144 Chat Composer gutter/icons/state parity (Verify + Pages PASS; real iPhone E4 pending)

- **User screenshots:** danh bạ và thread trên iPhone PWA có Composer quá cách hai mép hoặc Send xát cạnh; Mic nhỏ so với nút mũi tên, trạng thái nút màu xám và xanh không cân đối.
- **Root cause:** `composer-source-frame.chat-content-axis` đã có padding ngang `!important` (16px ở `zalo-admin-link.css`), trong khi Composer mobile còn trừ tiếp hai gutter trong `width`; legacy `#composer-plus-btn{width:36px!important}` lấn chuẩn hit44. Grid gap 2px, đĩa Send khá lớn và mic18px kém nổi bật.
- **Fixed owner P3/P4 only:** `ui-foundation.css` adds UI-144 local tokens (outer gutter12, inner inset4, column gap4, hit target44, Send disc36 + ring4, plus18/mic20/arrow18, SVG stroke1.6). `mobile-chat-refresh.css` removes duplicate inherited horizontal padding from Composer frame, safe-area-aware single outer gutter, three real 44px hit targets override legacy Plus36, stable 44px grid/Send ring across disabled/enabled/focus; recording, keyboard, scroll, send and media owner untouched. `ui-library/index.html` demo mirrors same geometry and data-icon labels.
- **Rule + test:** `README_MAINTENANCE.md §3c UI-144` plus canonical spreadsheet **08 row116 SPEC-CHAT-COMPOSER-ONE-OWNER-20261013** and **04 row186 F-126**. `tests/test_v21_ui_library_composer_media_menu.py` guards tokens, source, no double gutter, inactive/active geometry and demo preview.
- **E1/E2/E3 PASS:** release `84a4995447235ed3105e269d0ba0d3bdc944095cf6a7e8ae9fed4fe20d2503f2`; matching `index.html` commit `12058fc7a3e593b6f093347bc9dfdc08d026011d` and `version.json` commit `3d5ed3af1e76de27f3c987212f16da3a38b93f87`; Verify V21 run **38404927525 SUCCESS**; Deploy Chat Pages **38404927643 SUCCESS** (includes custom-domain check).
- **E4/E5 PENDING:** compare physically measured iPhone Safari Web/PWA closed/open keyboard, mic recording and gray/blue Send; active PWA may defer reload, so close/reopen app before checking. Pages success ≠ real device screenshot proof. 0 new API/RPC/Edge/DB/Storage/polling/log calls.
- **Rollback:** only UI-144 source tokens/composer/demo/tests and regenerate `index.html/version.json`; no backend rollback.

---

## 2026-10-13 — Unified incoming/outgoing image alignment on first-render + history (CI/PAGES PASS; iPhone E4 pending)

- **User screenshots:** E Linh bada / gd me yeu mobile/PWA show some portrait transfers and photos inset/centered, inconsistently across old/new messages. The sender-specific edge rule already exists; the defect was **media shell width not initialized on first render**.
- **Root cause:** `renderMessageNode()` built a `createMessageMediaShell()` with default 360px width while `applySingleImagePresentation()` computed a narrower portrait tile; only `patchMessageNode()` later called `patchMessageMediaShell()` to match the shell. Legacy direct-media CSS also forced all photos to 360px. Some old Zalo assets have missing/inaccurate `width_px/height_px`, making centered `object-fit:contain` inside a wider fallback box.
- **Fix:** `app.js` makes `createMessageMediaShell()` call `patchMessageMediaShell()` on the first render; any late `img.naturalWidth/naturalHeight` mismatch updates tile + shell without new network reads and survives message patch. `index.source.html` legacy direct photos use ratio-derived `--message-media-width`; galleries retain their separate 360px `cover` presentation. The existing mobile left/right edge alignment and image Viewer are unchanged.
- **Locked invariant:** Rule `README_MAINTENANCE.md §3b UI-143` — all image/single, cached/restored/new, Admin/User, Web/PWA share sender-side gutter and first-render/reconcile intrinsic-ratio width; do not special-case age/Zalo source.
- **Test:** `tests/test_v21_ui_library_composer_media_menu.py` and updated `tests/test_v21_chatgpt_visual_alignment.py` guard width parity, legacy media, gallery and natural-dimension fallback. CI Verify V21 **38400683185 SUCCESS**; Deploy Chat Pages **38400682986 SUCCESS**. Release `22da9d50df1d8cd711ae0f6c4eb0c12af984fab180eb60a6158fdae1c428fa20`; version commit `0a5cbf7ff1df8077b7bdfd66e6850f9dfb9b0ab2`.
- **E4/E5 pending:** Real iPhone Safari/installed PWA screenshot side-by-side (old/new, received/sent, portrait/landscape/gallery), and user acceptance. Because active authenticated PWA defers reload, fully close and relaunch to receive the new build. No extra RPC/Storage/Edge/Realtime jobs, polling or logs; any natural-ratio calculation is local image decode.
- **Rollback:** Revert `app.js` shell init and intrinsic ratio, `index.source.html` legacy CSS and relevant tests, regenerate `index.html/version.json` and reverify; do not change backend.

---

## 2026-10-13 — Mobile composer optical balance against ChatGPT screenshot (CI + Pages PASS; device E4 PENDING)

- **Observation:** In side-by-side input bars, Chat mobile/PWA plus, microphone and idle Send appear visually heavier; Send's gray circle is too prominent compared with ChatGPT reference. The right circular arrow is Send, not Search.
- **Owner / fix:** `mobile-chat-refresh.css` only: mobile glyphs 20→18px, inline SVG strokes optically normalized to 1.5px, idle Send background softened with 2px surface border (40px painted disk inside unchanged 44px hit target), composer idle border softened. Desktop, call, audio state, focus, keyboard viewport, tap target, actual Send/Mic/Plus handlers untouched.
- **Related CI repair:** Move previous inbound UI-142 CSS block before the UI-139/141 contract section so left-edge regression assertions remain scoped without changing message gutter behavior. This release also synchronizes previously committed inbox-margin and in-memory cache edits.
- **Release:** CSS `5f477a848cf7dbdb86e6b440c719e96b3ea5cdd3`; CSS test scope `7f57895d74cd91a45614deacf7bc03c6c98b9aca`; canonical index `d1c56b2cb2ab01d91145a3a0ab51fce84a3ec750`, version `ac81597c7606d87ea59867c8589e0308992bef3a`; build `f38082b3d1ab4dad51fae7d1e5549b01d499fffc1ff7d79ac155dad803616405`. Verify V21 run **38397767445 SUCCESS**; Deploy Chat Pages run **38397767312 SUCCESS**.
- **Validation/limits:** CI + deploy passed. User-visible iOS Safari/PWA optical comparison E4/E5 remains pending; standalone PWA may need full close/reopen to pick up updated build because active authenticated sessions defer reload. No new HTTP/RPC/Edge/Realtime/Storage/log or background work. **Rollback:** revert mobile CSS change and regenerate canonical index/version for the reverted source.

---

## 2026-10-13 — PWA/mobile double inset of inbound + Admin chat bubbles (CI + PAGES PASS; E4/E5 PENDING)

- **User issue after PR #179:** In installed mobile/PWA Chat, both sides of messages still look inset compared with screen edges, despite previous fix for centered desktop conversation axis.
- **Root owner:** Three horizontal padding CSS declarations competed: `mobile-chat-refresh.css` older `#messageWindow` shorthand (12px), `mobile-ui-polish.css` later 14px, and UI-139/141's `!important` axis rule (12px), while `#scrollRoot` retained `scrollbar-gutter:stable` on narrow screens. No sender/Realtime defect.
- **Fix:** Restrict P2 message lane to one safe-area-aware horizontal gutter of max(6px, CSS safe-area inset) in `mobile-chat-refresh.css`, remove older shorthand horizontal padding and 14px polish duplicate, prevent invisible reserved scrollbar space only under single-pane authenticated Chat. Explicitly align remote/assistant unit to left boundary and self/Admin unit to right; desktop >=1024px and all bubble internal text padding, media/Viewer/scroll owner stay unchanged.
- **E0/E1/E2/E3 PASS:** Rule sheet tab08 row115 amended; both CSS-focused tests PASS, standalone Chromium fixture 320/375/500/768/1023px measured remote-left/self-right 6px with no horizontal overflow (synthetic, **not real device**); PR #180 Verify V21 run 38375855960 SUCCESS after tightening assertion to distinguish padding reset from nonzero owner; PR #180 squash merged main `d2efaf0f7f127dc10ab7fd55d6d958b703399a3e`; main Verify V21 run 38375982808 SUCCESS; Deploy Chat Pages run 38375982769 SUCCESS; main build `5874a60dfd819d5ebf1d29988628ad4235e5bdf2b0bb774dc0824b80db260cd6`. **E4 actual Safari/iPhone standalone PWA screenshot & loaded build identity, E5 user acceptance/resource measurement PENDING.**
- **PWA update caveat:** `sw.js` currently uses cached-then-network navigation and `app-update-controller.js` deliberately defers reload during authenticated sessions; user may need to fully close and reopen standalone PWA after a deployment. Do not change these cache/reload owners for an edge-layout-only repair; verify displayed build before claiming E4.
- **Rule:** Google Sheet tab 08 row115 `SPEC-CHAT-MOBILE-PWA-SINGLE-GUTTER-20261013`. No new API/Edge/DB/Realtime request, media retrieval or jobs. Rollback: revert CSS+canonical index/version PR together. **E4 real Safari/PWA screenshot and E5 acceptance PENDING.**

---

## 2026-10-13 — Non-Admin incoming Chat content left margin on narrow one-pane UI (CI + PAGES PASS; E4/E5 PENDING)

- **User observation:** Messages from someone other than Admin (including Zalo image/text/file) are positioned too far away from the left border in a narrow browser/mobile screenshot; Admin self messages should stay right.
- **Owner:** `mobile-chat-refresh.css` existing UI-139 single-pane CSS. Root cause: the previous left-edge layout correction only applied through `639px`, while mobile/single-pane geometry lasts until `1023px` and keeps a centered max-width `48rem` conversation axis.
- **Fix:** Scope to `@media (max-width:63.999rem)`: stretch `#conversationContentAxis` full width, remove centered margin/extra axis padding and apply one 12px message reading gutter. Add remote `#messageWindow>.message-row[data-turn="assistant"]` left-edge alignment for text/media/audio/file; leave Admin `data-turn="user"` right-aligned and desktop >=1024px center width unchanged. CSS only; no hacks/transforms, no message renderer, ScrollRoot, media decoding or data changes.
- **Rule:** Shared Google Sheet tab 08 row114 `SPEC-CHAT-INBOUND-LEFT-EDGE-20261013`. `tests/test_v21_incoming_left_edge_contract.py` and updated `test_v21_140_zalo_card_narrow_axis.py` registered in canonical Verify and CI.
- **E0/E1/E2/E3 PASS:** focused left-edge and legacy UI-140 tests registered; PR #179 Verify V21 run 38372345917 SUCCESS, squash merged main `2f286df54f25e327933896f0265fd58dfe3a4024`; main Verify 38372465813 SUCCESS; Deploy Chat Pages 38372465818 SUCCESS; read-back main build ID `1577353a72cb2fddbce4e86bd9d9ae4c588bc7f6b32038e6dc231e4e02e35b3a`. **E4 actual authenticated narrow Web/iPhone Safari/PWA visual measurement, E5 resource delta/user acceptance pending.** No new API/RPC/Edge/Realtime polling/log/egress.
- **Rollback:** revert CSS + generated index/version together; no schema or Zalo bridge redeploy.

---

## 2026-10-13 — UI Library parity: Composer icons, portrait photo, mobile account menu (CI + PAGES PASS; E4/E5 PENDING)

- **User screenshots:** (1) Plus/Mic/Send trong khung Chat lệch hit-area và cỡ icon; (2) ảnh dọc sao kê chiếm gần hết viewport trên màn hẹp; (3) menu Danh bạ/Tài khoản/Cài đặt/Thoát chỉ có chữ, thiếu icon và khoảng cách chuẩn.
- **Spec:** Google Rule chung tab 08 row112 `SPEC-CHAT-UI-PRIMITIVE-COMPOSER-PORTRAIT-MENU-20261013`. Baseline `ui-library/README.md`, `ui-library/index.html`, UI-10/33/35/37/40/43.
- **P3/P4 owners only:** `ui-foundation.css` ComposerBar three tap targets 44px + glyph 20px (no behavior change); `app.js` single portrait image computed proportional width for max inline 460px and `index.source.html` width var CSS + 48dvh mobile max-height; gallery remains 360px, image `contain`, album tiles `cover`, Viewer full. `work-customer-summary.js` reuses `ui-icons.js` registry for four distinct menu 20px icons; `mobile-ui-polish.css` unifies menu 44px rows, 218px panel. UI library demo previews revised.
- **MUST-STAY:** all four menu actions/permissions/focus, + mic/send actions, disabled send, media cache/loading, Gallery/Viewer, image click, scroll/anchor, keyboard/push/Realtime untouched. No API/RPC/Edge/DB/Storage read/write change; no new user traffic except standard static release.
- **Tests:** updated locked image-width and mobile-polish legacy assertions, added `test_v21_ui_library_composer_media_menu.py` in Verify V21 and canonical verify. SHA-aligned index/version regenerated. CI pending.
- **E0/E1/E2/E3 PASS:** Spec Sheet 08 row112, focused tests and full PR Verify V21 run 38363377808 SUCCESS; PR #177 squash-merged main `ef21ed373f89153b20279d5bc2ecdb3be1a16aab`; main Verify V21 run 38363474508 SUCCESS; Deploy Chat Pages run 38363474436 SUCCESS. Prior failed PR runs 38363025335/38363188521 were old fixed-360 assertions; updated tests now align with proportional portrait contract. **E4/E5 PENDING:** real Safari/PWA authenticated visual comparison of 3 screenshots and resource/acceptance proof. UI-only; no new request/RPC/writer.

---

## 2026-10-13 — TAPHOA image share → Chat KH prefilled attachment (MERGED + PAGES PASS; E4/E5 PENDING)

- User symptom: app.taphoa.xyz order/cart Share first click only says "Ảnh đã sẵn sàng. Bấm Chia sẻ lại", forcing Save/Copy/Paste. User wants tapping once to open the linked customer's Chat with the actual PNG already attached (or auto-send).
- **Decision:** prefills a draft; never auto-sends without explicit tap Send. TAPHOA customer id is already V21 account UUID (see existing taphoa_chat_notify_customer/taphoa_save_order). Saved order detail uses its own real row customer id, NOT an unrelated active cart selectedCustomer.
- **Owner:** TAPHOA source capture and opener; Chat app.js ingress. Chat tab accepts only opener at `https://app.taphoa.xyz`, query-bound strong nonce and exact customer ID, authenticated Admin with valid ContactStore member and ready conversation. PostMessage File must be PNG <=15 MiB. Existing Chat `ingestImageFiles` attaches into the correct scoped draft/IDB; no new media writer or auto-send. ACK once; clear share params on success. No RPC/Edge/Storage relay, cron/polling/log.
- **Browser contract:** target window must preserve opener; installed iOS PWA may isolate windows, so E4 iPhone/iOS installed-mode test is mandatory. If popup fails, app's native fallback remains. No claim cross-PWA direct receive until observed.
- **Spec:** Rule chung tab 08 row111 SPEC-TAPHOA-CHAT-ORDER-IMAGE-PREFILL-20261013.
- **E0/E1/E2/E3 PASS:** Chat PR #176 Verify V21 run 38350636840 SUCCESS, squash merged `d32951dd050dce9b0a80c922855659a75afc371f`, Pages run 38350710488 SUCCESS. TAPHOA main code commit `220b0d3978fbf4743893765e3e4dbc7bc4bd2536`, test commit `f356f2146ad96be8dbc8c594724341d77f59f9e5`, cache-bust commit `005ac0e4d56eeddc81fcc864b79401bb2df683d8`; Verify TAPHOA 38350822745 SUCCESS and TAPHOA Pages 38350822779 SUCCESS. **E4/E5 PENDING** direct mobile/iPhone PWA opener handoff confirmation and request/egress/user acceptance. Pages success is NOT actual device QA.
- **Rollback:** revert receiver before sender only after sender stopped; original sharing remains for unbound customers. No DB changes.

---

## 2026-10-13 — User revision: vuốt cả trái và phải đều đổi Danh bạ ↔ hội thoại (MERGED; E4/E5 PENDING)

- **User correction to PR #174:** Both horizontal directions should toggle the two Chat surfaces. Previously directions were asymmetric (directory-right, conversation-left) and felt less convenient.
- **Corrected spec:** From Danh bạ, either horizontal swipe reopens last valid selected conversation; when none/invalid, no-op. From an open thread, either swipe returns to Danh bạ. Work tab cannot be opened by swipe; touch/mouse at screen edges, media/gallery, composer/input, controls, dialogs and vertical scroll must not be stolen.
- **Owner:** only `work-customer-summary.js` `bindMobileHierarchySwipe`. Remove old per-direction gating, preserve 48px distance, 1.2 dominance and 28px system edge exclusion. Keep `shell.js` and other data owners unchanged. No new RPC/Edge/cron/polling/logs.
- **Tests:** revised `tests/test_v21_mobile_directory_swipe_runtime.js` now asserts all four transitions (directory-left/right and conversation-left/right), plus no-prior/no-work/vertical/edge/control negatives. Revised static `tests/test_v21_mobile_chat_navigation.py` guards both-direction logic. Existing Verify/Pages pipeline validates canonical `index.html`/`version.json`.
- **Rule:** in-place amendment of Google Rule chung sheet tab 08 row110 `SPEC-CHAT-MOBILE-SWIPE-DIRECTORY-20261013`.
- **E0/E1/E2 PASS:** updated Rule chung row110; focused runtime/static tests and full Verify V21 run 38349288291 SUCCESS; PR #175 merged main as `2cefd2f88f8fdb4fc1218c11ea0a5d882b3debb3`. Main `version.json` readback build ID `0f27f983753cd81d59e1cba4b6687f28c387b023c4ea2c1c2f81aedb596d877d`. **E3 Pages production release not independently verified** (public URL unavailable), E4 iPhone/Android actual interaction and E5 resource trace PENDING. Rollback PR #175 only if regression.

---

## 2026-10-13 — Mobile Chat first screen Danh bạ + chat-only horizontal swipe (MERGED, E4/E5 PENDING)

- **User request:** opening Chat on mobile/PWA must show Danh bạ. Horizontal swipe is only between selected chat conversation (swipe left → Danh bạ) and Danh bạ (swipe right → previously selected valid conversation). Without a prior contact, directory swipe is a no-op. Swipe must not enter/exit Work; Work remains a deliberate top-tab/button action.
- **Root cause:** two gesture owners: `shell.js` pointer swipe switched Chat ↔ Work; `work-customer-summary.js` touch swipe switched directory/chat ↔ Work. Auth restore could show a saved conversation or single-contact auto-select rather than directory.
- **Patch:** remove legacy shell pointer swipe owner and single-contact mobile auto-selection; move touch owner to explicit Chat directory↔thread only, scoped to scrollable content, no overlay/input/media/horizontal gallery/touch-edge stealing. Remember last selected contact only as local UI state; Shell `openContact` validates membership before returning. Authenticated mobile boot always shows directory, with saved selected contact remembered for optional right-swipe. Avoid a second directory contacts refresh when already open. No DB/Edge/Realtime/Push changes.
- **Safety:** normal contact taps, notification deep-link, mobile Work top-tab/double-tap, desktop directory, USER_AWAY/FOLLOW_TAIL, media, send, pending drafts, realtime and cache unchanged. No new network owner/timer/API. Works for desktop-narrow UI through same source; real gesture requires touch.
- **E0:** canonical Rule chung sheet tab 08 row110 `SPEC-CHAT-MOBILE-SWIPE-DIRECTORY-20261013`.
- **E1/E2 PASS:** `tests/test_v21_mobile_chat_navigation.py` and `tests/test_v21_mobile_directory_swipe_runtime.js` registered with canonical Verify + GitHub Verify V21. PR Verify V21 run 38348854237 SUCCESS. PR #174 merged as `f52d429b9dc6bd3a9b9ddd4ecb1b57943e058bf9`, current main version build ID `b981aab17a33ee54187ff0c4c8db6d09bdd1567b8baf4ed4db58043d28457635` read back.
- **E3/E4/E5 PENDING:** PR Verify SUCCESS and merged main; production Pages deployment/job result and public `/version.json` not independently accessible from this runtime (DNS lookup unavailable), so E3 website cannot yet be marked verified. Real Safari/iPhone/Android PWA gestures and post-notification open remain device acceptance; no measured resource delta. Do not claim PROD VERIFIED without browser proof.
- **Rollback:** revert this navigation-only PR. No data migration.

---

## 2026-10-13 — Mobile share one-tap + customer-only business menu (MERGED, PROD E4/E5 PENDING)

- **Request:** mobile share a Chat photo/file by showing recipient immediately; do not require Save/Copy/Paste. Only KH group exposes business actions like Công nợ/Báo giá; CM/Bạn bè/Khác use simple image/file composer actions.
- **Owner/baseline:** `app.js` source media actions + single-image viewer; `message-forward.js` existing recipient picker and canonical `v21-sync-engine.js.forwardMessage`; `contact-directory-admin.js` is already group-map owner through one `directory_groups` request; `admin-composer-actions.js` currently shows all Admin business actions for all recipients.
- **Patch scope:** primary Chat media `Chia sẻ` opens existing one-tap in-app recipient picker; native OS share becomes explicit `Ứng dụng khác`; `Lưu` stays a separate optional action. Viewer uses in-app forwarding only when its current source message has exactly one media asset, so selecting one photo does not silently send a full gallery. Group editor publishes existing group load/change to customer-menu visibility; UNKNOWN or noncustomer hides all business-specific sends. `runAction` also checks group. No new RPC, media writer, job, polling, Zalo bridge or background sync.
- **E0/E1 PASS:** Sheet Rule chung SPEC row109 recorded; `tests/test_v21_mobile_share_group_roles.py` registered with Verify V21 + canonical verifier. PR Verify V21 run 38347451366 SUCCESS. PR #173 squash merged as `f80622b21e7d8072a37f306c8e31bd10838905ff`; main `version.json` build ID `cfde8a260fb7e0930be4436137fe3dec0ca1e82a2c2d1d4736b1d6f6b85ed096` read back.
- **E2 scoped source PASS, E3/E4/E5 PENDING:** PR tests succeeded and code merged; main GitHub Pages run and real domain release not independently confirmed through available connector. Safari/iPhone/Android one-tap, contact group matrix and canceled/cold-media/gallery cases need real device checks. Do not claim production success solely from source tests. No intentional outbound customer message test.
- **MUST-STAY:** Chat auth/group account isolation, single canonical forward, Zalo-linked media source/destination ownership, no accidental whole-album forwarding, immediate Realtime, draft/scroll, quote/debt backend unchanged.
- **Rollback:** revert this PR as one UI-only change set. No DB rollback needed. Group data is read-only reused from the directory owner; unknown group fails closed for business sends.

---

## 2026-10-12 — Chat warm boot + mobile PWA foreground push (MERGED; E3 PASS, E4/E5 PENDING)

- **User intent:** lần đầu/mở lại Chat mobile/PWA phải hiện khung và dữ liệu đang xem nhanh; khi Chat mobile hiện trước màn hình, tin mới vào Chat nhưng không tạo thêm thông báo PWA/OS. Khi ẩn/đóng Chat, thông báo nền Admin phải hoạt động; call invite luôn hiển thị cảnh báo.
- **Root cause (source):** `v21-cache-store.js` used IndexedDB `getAll` for whole conversation then sliced latest 100; `v21-sync-engine.js` called `prewarmCachedContacts` for inactive contacts on each auth; `sw.js` network-first navigation awaited network before serving existing static shell; SW notification suppressor checked only focused *same conversation*, not visible mobile Chat in another conversation.
- **Patch:** `listMessages()` now uses backward indexed cursor, skips tombstones, stops after requested live rows and reverses to chronological order. Boot hydrates contacts and active conversation only, without background prewarm. Warm SW navigation uses last-good cached shell immediately then one existing network revalidation via waitUntil; cold cache miss retains network-first. `admin-push-controller.js` sends mobile platform/route/visible state, re-advertises on SW controllerchange. SW sends ADMIN_PUSH_MESSAGE_DIRTY to page before suppressing *system* notice for visible iOS/Android Chat Web/PWA, regardless of selected contact; WindowClient visibility wins when available. Hidden/background/closed/Work keeps notice; call_invite is never suppressed.
- **PASS/LOCK:** PR https://github.com/1sl2tp/chat/pull/172 squash merged `d68d3f829e792a66abd608d80d6b4ae52f849acf`. Verify V21 https://github.com/1sl2tp/chat/actions/runs/38266770515 SUCCESS (incl. indexed cursor + mobile push SW tests). Pages https://github.com/1sl2tp/chat/actions/runs/38266770459 SUCCESS, including Pages custom-domain HTTP contract; generated index/version canonical build `269f6431fccaa82d705c9aa3f549fe575272278fb4803f29e257bb5750b5795c`.
- **MUST-STAY:** same Supabase Realtime message owner, user foreground/Admin push semantics, draft/outbox/media/reply, USER_AWAY/FOLLOW_TAIL, contact order, account cache isolation, push subscriptions. No new backend API, SQL migration, cron, polling or job.
- **E4/E5 PENDING:** CI and Pages success do not prove actual first-paint time, offscreen avatar behavior, notifications on real Safari/iPhone PWA, or request/bytes savings. Test warm/cold/slow/offline, mobile foreground different contact, mobile hidden, incoming calls and multi-device role. Capture browser TTFB→first useful thread and number of IDB records read/network bytes. Avoid artificial message sends in real customer account.
- **Rollback:** revert PR #172 source/cache/push/SW/index/version as a unit if cold start/Push regression; no DB rollback. Canonical Sheet tab 08 row15 boot and row108 foreground push.

---

## 2026-10-11 — Tin mới hiện ngay, danh bạ không nhìn thấy tự cuộn (MERGED; DEVICE E4 PENDING)

- User screenshot Chrome desktop: contact preview 21:53/newest at top, active thread latest near composer; user reports new message still appears by visibly scrolling, especially contact directory. Screenshot is a static state only; cannot independently prove timing/motion.
- Code evidence and scoped owners:
  1. ContactStore `auth-session-store.js` already sorts by `latest_at` and `shell.js` restores existing `.wm-sidebar-navigation.scrollTop` across row reorder, but scrolling ancestor lacked `overflow-anchor:none`; browser scroll anchoring can fight explicit restore during DOM `insertBefore`.
  2. `app.js` `scrollToTail` only committed `scrollTop` inside next requestAnimationFrame for new messages; latest on open already positioned synchronously.
- Changes: `index.source.html` scroll host now has `overflow-anchor:none;scroll-behavior:auto`; `app.js` incoming remote/new/reconcile new-message tail transaction commits scroll position immediately after render in same task, then retains existing bounded frame-based geometry settling. USER_AWAY, history, selected contact, scroll owner, search/filter, notifications unchanged.
- Test `tests/test_v21_139_immediate_message_directory.js` added to Verify V21 and canonical verifier. PR https://github.com/1sl2tp/chat/pull/171, Verify V21 `38153320773` SUCCESS, merge main `4344dbb09d9b0d599fda5e162e78dda01f419b58`; readback source/index/version PASS (build `a06e1bf7e52968a770f8c4e9a72e46129deed59f0b7cc996b56cfc9225c3b1af`).
- MUST-STAY: Realtime/Admin/User, UI-138 USER_AWAY holds anchor, notification intent latest, message media and virtual window, read state, no new RPC/DB/Edge/log/polling. Avoid changing ContactStore order or adding additional scroll writers.
- E3 actual Pages deploy not independently proven by connector/tool (public URL inaccessible). E4 Chrome/Safari/PWA visual motion after incoming while list at top vs middle, active thread following tail vs history USER_AWAY PENDING. E5 actual bytes/timing unmeasured. CI cannot verify actual perceived animation.
- Rollback only scoped main commit above if new positioning causes regressions. Canonical Rule chung SDD rows 105–106.

---

## 2026-10-11 — Composer intermittently ignores click after incoming chat (MERGED; E4 PENDING)

- Screenshot: Chrome desktop three-column active chat; composer text area visible yet intermittently cannot be focused when chatting. The existing 2026-10-10 hit-test CSS/padding-focus source is still present. Actual intercepting element was NOT observed in browser devtools, so overlay is a scoped hypothesis, not proven root cause.
- Owner: `app.js` composer pointer hit-test; preserve original `focusEditorFromComposerPadding` exactly to keep native caret/IME, button semantics and existing regression. Add a capture-phase pointerdown recovery ONLY for a user press inside editorWrap rect when a nonactionable ScrollRoot/scroll-control target was hit; skip button/link/action, Work, inert modal, image viewer, recording and disabled editor. No focus on incoming messages, no fake input.
- PR https://github.com/1sl2tp/chat/pull/170 ; main `6182407f02c84211b6f9f5f45c13296064b1ecac`. Final Verify V21 run `38152641373` SUCCESS (81 steps), after initial failing legacy padding-focus contract was preserved, and new test's count assertion corrected. `index.html`/`version.json` regenerated to canonical build ID `8ecf2bfb0fe34d589a0405086f210ed4e617ab4ddc48f368794c8d657f33a76b`; main readback PASS.
- E3 Pages release run E4 actual Chrome desktop + Safari/PWA and E5 resource delta PENDING. GitHub CI PASS does not prove user's intermittent symptom is resolved; ask for recurrence and inspect exact elementFromPoint only if it persists. No API/DB/Edge/cron/network changes.
- MUST-STAY: realtime Admin/User, contact/message scrollers, notif deep-link, Vietnamese IME/selection, media, audio, send, keyboard, modal. Rollback only PR #170 if side effect appears. Canonical Sheet SDD `SPEC-CHAT-COMPOSER-HIT-REGRESSION-20261011` row104.

---

## 2026-10-11 — Chat first-open: lazy-load avatars outside viewport (MERGED; E4/E5 PENDING)

- User request: improve Chat startup/mobile alongside YouTube without changing message delivery, read-state, scroll, media upload or call.
- Owner: `shell.js` `renderAvatarImage`; adds native `img.loading='lazy'` to contact avatar image nodes, retains initials until image's actual `load` and existing error fallback, preserves async decode. Offscreen avatar fetches can be deferred by browser; visible avatars still load as normal.
- Canonical build: regenerated `index.html` + `version.json` using exact build hashing; original source's SHA-256 and release ID were reconstructed and verified before mutation. New build ID `38632c0a40292eeed346fb35972d2b657dc1b90411bb6017fae54fb1461bd96d`.
- Source PR https://github.com/1sl2tp/chat/pull/169 ; Verify V21 run `38148330196` SUCCESS (80 steps passed, canonical build included); merged main commit `e0f3054494fe2e846de223ee53d8daa53353585d`. Main source and generated artifacts readback PASS.
- E3 deploy Pages run could not be independently fetched. E4 Safari/Chrome/iOS PWA screenshots and first open visible/offscreen avatar behavior PENDING; E5 request and byte count before/after PENDING. Do not claim a measured launch improvement.
- MUST-STAY: Admin/User Realtime, background Push, Zalo bridge, contact sort/selection, ScrollController, photo upload/forward, calls, cross-device sync; 0 new RPCs, DB writes, timers or schedulers.
- Rollback: revert shell.js + index.html + version.json together from the PR; no database rollback. Rule chung `SPEC-CHAT-LAZY-AVATARS-20261011` row103. Next: scoped Safari/PWA test, verify avatars show when scrolling into view; measure only initial image requests/bytes and first useful contact render.

---

## 2026-10-10 — Chat starts in Trò chuyện, not Công việc (MERGED; E4 PROD PENDING)

- User symptom: first open / login and cold notification sometimes showed Công việc first, then returned to Chat.
- Root cause: `index.source.html` first-paint defaults, `shell.js` initial and restored routes, and `auth-session-store.js` guest entry all used `work`. A saved Work route could replay before pending notification selected its contact.
- Contract: startup/guest/auth restore **always starts in `chat`**; restore the selected contact, not the previous Work route. The existing Công việc tab still navigates to Work explicitly. The existing Admin Push handler still opens its target contact and forces latest-message positioning via the current owner.
- Scoped changes: `shell.js`, `auth-session-store.js`, `index.source.html`; regenerated canonical `index.html` and `version.json`, including older pending modular source updates. Regression: `tests/test_v21_chat_boot_defaults_to_chat.py` and the updated Work-surface contract test.
- PR: https://github.com/1sl2tp/chat/pull/159 ; squash merge `4b943346283cced853803c6fc75503af2959844e`.
- E0 desired behavior: specified by user; E1 source/build assertions PASS. CI Verify V21: PASS on PR head `767550dd924083166dcba14c3f2c7eaf73a422c5`, run `38065598162`. Earlier CI failure was a legacy assertion requiring Work-first; its expected boot route was updated, while Work content/action assertions remain.
- E2 main source and version confirmed after merge; E3 GitHub Pages deployment outcome not independently confirmed from available tools; E4 actual authenticated Safari/iPhone PWA cold launch, notification tap (closed/background/open), and browser UI still **PENDING**. Do not label PROD VERIFIED yet.
- E5 expected resource change: 0 new API/RPC/Edge/DB/polling or timers; actual network trace still PENDING.
- Rollback: revert only PR #159 squash commit after verifying no newer dependent changes; no DB rollback. Do not modify ScrollController/Push/SyncEngine just to force the route.

## 2026-10-10 — Incoming message leaves 'Nhắn tin...' hard to tap (SOURCE PATCHED, E4 PENDING)

- Symptom: user screenshot reports that after a new incoming message, tapping the text-composer placeholder 'Nhắn tin...' sometimes fails to enter edit mode.
- Scoped owner: index.source.html CSS pointer hit-testing and app.js focus delegation only. No Supabase/Realtime/push/scroll mutation.
- Source evidence: Composer footer parent uses pointer-events-none Tailwind utility; active editor layer relies on pointer-events-auto class. Unread/return-to-bottom control is a sibling lane with its own pointer target and nested motion layer. The textarea itself is not disabled; empty #editorWrap padding previously did not delegate focus.
- Patch: explicit scoped native pointer-events rules for #composerInteractive/#composerShell/#editorWrap/#editor; keep #threadScrollControlWrap click-through except the actual #threadScrollControl button; stack editor over badge lane. Add one trusted pointerdown handler for EMPTY composer padding ONLY; native textarea clicks retain own caret, selection and Vietnamese IME; all buttons/audio/media untouched.
- E0 SPEC-CHAT-COMPOSER-CLICK-20261010 locked in central Google Sheet; E1 focused Node VM+CSS contract test; E2 browser integration unavailable; E3 verify/deploy awaiting workflow; E4 real incoming-message click Safari/PWA/desktop PENDING; E5 resource 0 backend calls expected, actual traffic trace PENDING.
- Rollback: revert only index.source.html CSS and app.js focus handler; test/workflow removable; no data rollback. Do not claim production DONE without a real authenticated click.
- Independent TAPHOA CI/CD gate project remains separate and untouched by this Chat bug.

## 2026-10-10 — Công nợ gửi khách: phân bổ FIFO tham khảo + nhận xét Admin riêng

- Owner: `v21_admin_send_debt_summary` (shared Supabase), existing one-click Admin composer path; không thêm RPC/cron/job/notification trigger.
- DB migration `20261010061148_chat_debt_share_fifo_breakdown.sql` đã áp dụng qua Supabase migration `chat_debt_share_fifo_breakdown_20261010`.
- Khi công nợ dương: gửi tổng phát sinh, đã thu, điều chỉnh, còn lại; lần thu gần nhất; khoản chưa bù trừ cũ nhất; tối đa 5 dòng còn lại theo phương pháp trừ khoản cũ trước. Có ghi chú đây chỉ là bảng đối chiếu tạm, không gán thanh toán pháp lý cho từng đơn.
- Với số dư bằng 0 hoặc âm: giữ chính sách tin nhắn hiện hành. Không tự gửi bất kỳ tin nào khi deploy.
- `admin_assessment` (mức mua / diễn biến thanh toán dựa trên lịch sử đơn/thu) chỉ trả cho Admin, UI chỉ hiện trong hint sau khi bấm gửi thành công; không ghép vào `body` gửi khách.
- E1 test nguồn `tests/test_v21_debt_share_summary.py`; E2 DB tạo hàm PASS + đọc lại live function PASS; E3 Verify/Pages, E4 gửi thử với tài khoản thử nghiệm và E5 resource trace chờ xác minh. KHÔNG đánh dấu real customer send DONE.
- Rollback: khôi phục function `v21_admin_send_debt_summary` từ `20261004203500_chat_send_debt_summary_atomic.sql`, rồi revert riêng `admin-composer-actions.js`. Không xóa ledger hoặc nhắn khách khi rollback.

## 2026-10-09 — Chat notification click: show newest immediately (SOURCE PATCHED)

Symptom: Admin taps an incoming message notification; previous thread reading position appears for a moment and the screen visibly scrolls down, instead of opening directly at the newest message.

Owner/contract:
- Push click/open: `admin-push-controller.js` (only one-time navigation/visibility intent).
- Session reading position: `v21-message-store.js` (one-shot override only for that contact).
- Rendering/scrollTop remains **only** `app.js`'s `V21ConversationBridge/ScrollController`, and Shell/SyncEngine keep the canonical selection/Realtime path.
- `README_MAINTENANCE.md §4a` and central Sheet `CHAT-01` hold the rule.

Patch:
- Before push navigation, temporarily conceal only ScrollRoot; remove the mask after contact mount, FOLLOW_TAIL and <=2px tail-distance stable for 3 frames.
- Use old ScrollController's `replace(...,viewState:null)` when push target is currently active; for another contact, ignore saved `USER_AWAY` state only for that target.
- Abort/failure/logout/newer push restores visibility; bounded 2-second fail-open prevents permanently hidden Chat.
- Normal contact selection still restores its saved reading position. No new calls, cron, message renderer, scroll writer or DB writes.

Commits: MessageStore `72405b65be911a6ae1eb025bd9cefa6e16f8bd6e`; PushController final `71578db5052783668e86942eaf47dd1dc43fb2a4`; regression test `a0ec54ef0f8d1cf4e3ce937330e7f8e8e7cc3be6`; rule docs `35c5710e39cf07caa634cea0c4c81bed1aaa787c`.

Verification so far:
- JavaScript syntax checks on the two changed modules: PASS.
- Isolated MessageStore runtime: normal session restores history; notification session forces tail; same-contact explicit tail: PASS.
- Mocked Admin Push runtime: different contact, same contact, rejected open, mask cleanup: PASS.
- Added `tests/test_v21_admin_web_push_notification_tail.js` to automatic Verify V21 glob, covering cold-open as well.
- **CI/Pages deploy and real Safari/PWA/desktop notification click not yet independently verified**. Do not mark PROD VERIFIED solely from tests.
- Resource difference expected: 0 extra backend/API calls and 0 DB writes, one bounded temporary presentation intent per user notification click. Real before/after network capture outstanding.
- Rollback: revert both runtime files to preceding commits; no database rollback required.

Next: inspect existing Verify V21 / Pages result without starting a duplicate workflow; test live Admin click on existing tab/same contact/cold PWA and confirm no visible scroll. Only then close gates and update this handoff.

---

## 2026-10-06 — Zalo bridge simplified to linked-account event routing

Final architecture:
- Chat web/mobile is canonical for text + image + audio + file.
- Admin -> Chat user always works as Chat first.
- If that user has a current Zalo link owned by the Admin, the existing DB trigger creates exactly the Zalo outbound delivery row and signals Render immediately.
- If there is no Zalo link, the Chat message remains Chat-only: no outbound row, no Render wake, no Zalo action.
- Zalo -> Render text calls canonical ingress once; only a current linked Zalo ID becomes a Chat message. Unlinked text returns NULL and is ignored.
- Zalo -> Render media checks canonical ownership before downloading bytes; unlinked media stops before download/upload/storage.
- Render outbound periodic fallback polling was removed. It now uses the DB event signal plus one startup catch-up after login/restart.
- No Render-side canonical link cache, no new table, no new cron, no second message owner.

Production:
- PR #156 merged as `c89311cdd70d342cb0b64dd3c31c85e12743214a`.
- Verify V21: PASS.
- Render `taphoa-zalo` auto-deploy `dep-db2g1ibncjis73cksajg`: LIVE.
- Runtime log confirms: `outbound event signal enabled; startup catch-up only`.
- Current 24h outbound queue after deploy audit: pending=0, failed=0, sent=145.

Resource impact:
- removes the old 15-minute fallback poll (~96 scheduled outbound checks/day while idle);
- outbound work exists only for linked Chat recipients;
- inbound unlinked media still performs only the tiny ownership preflight, never binary transfer;
- inbound unlinked text performs only its event-triggered canonical link lookup.

## 2026-10-06 — Forwarded image to Zalo-linked contact repair

Symptom:
- Admin used Chuyển tiếp on an existing Chat image toward a Zalo-linked customer, but no destination image message was created and the customer therefore received nothing on Zalo.

Production evidence:
- At 16:55 Vietnam time, `v21_message_forward_source` returned HTTP 200 for the forward attempt immediately after incoming image messages.
- The expected next steps (`v21-media` destination write and `v21_media_assets_send`) never occurred, so no outbound media row existed for Zalo to deliver.
- Existing text delivery to Cô Huyền and previous successful media forwards confirmed the Zalo bridge itself was healthy.

Root cause / patch:
- Browser forwarding depended on Storage server-side `copy(sourceKey,destinationKey)`.
- Forwarding now reads the canonical source Blob and uploads a fresh destination object under the forwarding Admin's account/conversation path, then calls the existing `v21_media_assets_send`.
- The existing media insert trigger remains the single owner that enqueues Zalo outbound media; no new polling, scheduler, retry owner, or Zalo transport path was added.

Verification:
- PR #154 merged as `7d6f271e6483cfc81eaa5feb97219e5fd594a8fe`.
- Forward-media contract: PASS.
- Verify V21 on main: PASS.
- Deploy Chat Pages: PASS.
- Canonical build id: `583739b3725f1f1b07ca4bde7c4dbfd880d396e9595068e3e4b1953acfe7119a`.

Resource impact:
- Only a manual forward of media changes traffic: one Storage download plus one Storage upload per forwarded asset instead of Storage copy.
- Existing 15 MiB/media limit remains. No background traffic was added.

Rollback:
- Revert PR #154 / merge commit above.

## 2026-10-06 — Receipt auto-collection removed

- Bill images are ordinary Chat media only.
- Chat does not OCR/AI-scan bills and does not create automatic debt collections from images.
- Debt/collection changes remain explicit/manual through the existing canonical debt flows.
- No receipt polling, OCR worker, Edge Function, or Render route is an active owner.

## 2026-10-05 — Zalo media bandwidth preflight

Production verification for media preflight:
- GitHub commit: `cdb0da4a0f50c43fc61485e7a35c2318529a09ac`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Supabase `v21-zalo-bridge`: production version **8**;
- Render `taphoa-zalo` deploy `dep-db1a86eq1p3s73f3pmhg`: **live** on the same commit;
- post-deploy health: HTTP 200, `status=logged_in`;
- production canonical probe on an unlinked Zalo contact: `v21_zalo_media_target(...)=NULL`, confirming the new Render preflight will stop before binary download for that class of traffic.


Symptom:
- Render Zalo listener receives upstream messages from the whole logged-in Zalo account, not only Chat-linked contacts.
- Media was downloaded by Render and multipart-uploaded to Supabase before Supabase decided whether the sender was linked to Chat.

Measured production evidence before patch:
- ~333.5 MB inbound media request bytes / 24h on `v21-zalo-bridge`;
- ~331.8 MB (~99.5%) of the large media traffic returned the small "not a target" response and was discarded;
- text traffic is small and is not the bandwidth bottleneck.

Patch:
- new lightweight `media_target` bridge action using canonical `v21_zalo_media_target`;
- Render calls `messageGateway.mediaTarget(event)` before `downloadInboundMedia()`;
- if `needed=false`, Render stops immediately and never downloads/posts the binary;
- linked media keeps the existing idempotent upload/storage/message path;
- no polling, no new database table, no second ownership cache.

Expected resource impact:
- remove nearly all media bandwidth generated by unlinked Zalo contacts/groups;
- keep keepalive/realtime listener unchanged;
- add only one tiny metadata preflight per inbound media event.

Rollback:
- revert the bridge/server/Edge Function commit and redeploy `v21-zalo-bridge`; no schema rollback is required.

## 2026-10-05 — Offline contact visibility + Admin→Zalo delivery

Symptom:
- one Chat account could be absent from the Admin directory while not online;
- Admin manual message to a Zalo-linked account could wait for the bridge fallback poll before 05:00 because the outbound wake signal was time-gated.

Production facts:
- `v21_contacts_sidebar` does **not** filter by `v21_sessions`/Presence; directory membership is canonical `v21_accounts` data.
- production currently has 79 active user accounts; 78 had no active Chat session in the 5-minute check window, yet all remain directory-eligible.
- 76 accounts are linked to Zalo.
- Admin→linked-account Chat insert already creates `zalo_message_links(direction='outbound', state='pending')` independent of target online state.

Root cause:
- desktop can retain a stale local contact cache even after the relevant old sync event is no longer useful for repairing that cache;
- `v21_private.zalo_outbound_signal()` skipped immediate Render wake before 05:00 Asia/Ho_Chi_Minh, even for a manual Admin message.

Final contract:
- authenticated bootstrap performs exactly one bounded `v21_contacts_sidebar` refresh to repair stale local directory cache; no interval polling was added;
- Presence/session state never controls whether an account appears in the directory;
- manual Admin→Zalo outbound signals `taphoa-zalo/outbound-now` immediately at any hour;
- customer-care scheduling remains controlled by its own daytime windows and pacing rules;
- if recipient is offline and has Zalo link: canonical Chat message + Zalo outbound;
- if recipient is offline and has no Zalo link: canonical Chat message remains unread and is delivered by normal Chat catch-up on next login; user-side Web Push is not currently an owner.

Verification:
- code commit: `1707790d2ac317656448b7a233d6dd79a4b7cab8`;
- canonical build sync: `06370c3b1c3c7d4f304f9c19ab2820e71107a573`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages deployment: PASS;
- production Zalo wake probe cleared the 4 current pending outbound rows; one historical failed row remains unrelated.

Resource impact:
- +1 bounded contacts RPC per authenticated bootstrap only;
- 0 interval polling added;
- manual Zalo message creates one immediate bridge wake instead of waiting up to the fallback poll;
- no new canonical table or duplicate delivery store.



## 2026-10-05 — LiveKit single-owner cleanup

- Confirmed production `v21-livekit-session.js` uses `v21-livekit-token`.
- Confirmed guest call page uses `v21-call-invite-guest`.
- Legacy `taphoa-livekit-token` had no current production reference and was retired to HTTP 410.
- Current LiveKit role remains transport/session only; Supabase `1sl2tpvn` owns durable business/call state.
# CURRENT WORK — TAPHOA CHAT

Cập nhật: 2026-10-04

## Luồng bắt buộc hiện tại

1. Auth:
   - Supabase session được persist + auto-refresh.
   - Form dùng browser password manager (`autocomplete=username/current-password`); không lưu plaintext password trong app.
2. User:
   - app/web visible → nhận `v21_sync_events` realtime và áp ngay vào UI/cache;
   - app hidden/closed → dừng foreground Realtime;
   - mở lại/foreground → subscribe lại + delta pull catch-up ngay.
3. Admin:
   - PC/mobile visible → cùng luồng realtime như user;
   - mobile hidden/background → Service Worker/Web Push tiếp quản;
   - app bị đóng hoàn toàn → push/badge vẫn tới cho incoming user message; mở lại thì catch-up phần đã bỏ lỡ.
4. Read-state:
   - conversation đang visible mới mark-read;
   - read-state event được gửi cho cả hai account và mọi session đang mở cùng nhận/apply.

## Owner

- Auth/session: `auth-session-store.js`.
- Foreground realtime: `v21-realtime-session.js`.
- Canonical event apply + catch-up/outbox/read: `v21-sync-engine.js`.
- Admin mobile background: `admin-push-controller.js` + `sw.js`.
- Canonical data: Supabase Postgres.

## Patch đang triển khai

- `v21_sync_events` không còn phải wake rồi chờ RPC pull mới render; event canonical áp thẳng vào cache/UI.
- Pull chỉ còn boot/reconnect/foreground/fallback catch-up.
- Read-state của cùng account cập nhật unread ở các session khác.
- Admin mobile tự coi background push là wanted khi platform hỗ trợ; permission hệ điều hành/browser vẫn là điều kiện bắt buộc.
- Push foreground kiểm tra cache trước khi fallback pull để tránh gọi trùng.
- Direct-message fallback theo dõi đúng message id; sync-event khác không được hủy nhầm fallback.
- Foreground Realtime dừng khi document hidden; admin background do Web Push sở hữu.
- Presence/heartbeat guardrails trước đó vẫn giữ.

## Production probe cần làm

Sau deploy, reload một lần các runtime cũ rồi test không refresh:
- admin PC gửi → user đang mở + admin mobile đang mở thấy ngay;
- user gửi → admin PC + admin mobile thấy ngay;
- admin mobile gửi → admin PC + user thấy ngay;
- một bên đang mở đúng conversation → read-state phản hồi sang bên kia;
- đóng user app → user không chạy nền;
- đóng admin mobile/PWA → incoming user message vẫn có Web Push/badge; mở lại catch-up ngay.

## Không được làm

- Không thêm interval polling message.
- Không lưu plaintext password.
- Không dùng Presence/heartbeat làm message transport.
- Không cho push và direct-message fallback tự render message.


## Root cause xác nhận sau test 19:10

Supabase mới có publication + RLS đúng, trigger tạo đủ `v21_sync_events` cho cả admin và user, nhưng bị thiếu table privilege cho Realtime role:

- `v21_sync_events`: authenticated SELECT = false
- `v21_messages`: authenticated SELECT = false
- `v21_session_events`: authenticated SELECT = false
- `v21_call_events`: authenticated SELECT = true

Do đó PostgreSQL Realtime subscription không đọc được 3 bảng đầu dù policy tồn tại. RPC/REST vẫn có thể hoạt động qua SECURITY DEFINER nên biểu hiện là gửi được nhưng các session đang mở không tự nhận.

Production đã áp migration `restore_chat_realtime_authenticated_select`:
- GRANT SELECT cho authenticated trên 3 bảng trên;
- REVOKE ALL FROM anon;
- giữ nguyên RLS và write privileges.

Sau migration, cả 4 bảng Realtime: authenticated SELECT = true, anon SELECT = false.


## Operational retention đã áp production

Migration: `chat_operational_retention_guard`.

Retention:
- sync events: 14 ngày;
- session events: 7 ngày;
- push outbox sent/dead: 7 ngày;
- revoked app sessions: 30 ngày;
- summary failed: 7 ngày;
- summary done: 30 ngày.

Cron owner duy nhất: `chat-operational-retention-daily`, 03:43 UTC, tối đa 10.000 dòng/bảng/lượt.

Cleanup đầu tiên:
- `v21_session_events`: 228 → 3;
- `v21_push_outbox`: 1264 → 234;
- `chat_customer_summary_runs failed`: 1037 → 86;
- `v21_sync_events`: chưa xóa vì chưa đủ 14 ngày;
- revoked sessions: chưa xóa vì chưa đủ 30 ngày.

Canonical messages/read/media/conversations không bị đụng.


## Danh bạ — click không được nhảy vị trí

Root cause: `ContactStore.upsert()` trước đây luôn sort + render toàn danh bạ kể cả patch chỉ đổi `has_unread` khi mark-read. Vì vậy click một contact có thể làm DOM list bị dựng/reorder lại và vị trí vừa bấm bị nhảy.

Contract mới:
- chỉ contact mới hoặc `latest_at` thật sự đổi mới được reorder;
- `has_unread`, avatar, tên, profile update chỉ patch row tại chỗ;
- tin nhắn mới vẫn đổi `latest_at` nên contact vẫn lên đầu;
- full reorder khi có activity thật vẫn giữ `scrollTop` của `.wm-sidebar-navigation`.


## Customer-care route schedule corrected

Root cause: migration `20260922232000_customer_care_pre_delivery_stagger.sql` changed the source selector from the original route days (Monday/Friday) to one-day-early reminders (Sunday/Thursday).

Final production rule:
- Monday (Thứ 2): Sữa;
- Friday (Thứ 6): Sữa;
- every other day: Hàng thường;
- scanners stay 09:15 and 14:00 Asia/Ho_Chi_Minh;
- manual 2-minute staggering stays unchanged;
- no auto-send was added.

Production was refreshed immediately after the migration. On 2026-10-04 (Sunday), today's open care plan is Hàng thường.


## Customer-care message templates

Both Hàng thường and Sữa use the same 3-tier recommendation contract:
1. customer purchase history;
2. popular products from the same source;
3. active catalog fallback from the same source.

Up to 5 items are returned. A customer with no purchase history still receives product suggestions, and Milk suggestions never mix with regular-goods suggestions.

Canonical formatter: `chat_customer_care_message(customer_id,date)`.


## Customer-care auto-send — KH only

Auto-send is enabled only for `v21_accounts.contact_group='customer'` (nhóm KH). Friend/other groups are explicitly excluded both when planning and when sending.

Pacing/safety contract:
- refresh owners remain 09:15 and 14:00 Asia/Ho_Chi_Minh;
- one auto-send owner: `chat-customer-care-auto-send`;
- cron wakes every 5 minutes only in the morning/afternoon UTC bands; the function enforces exact Vietnam windows;
- send windows: 09:30–11:35 and 14:15–17:35;
- at most one care message per pass and one care message per customer/day;
- no care send while Zalo outbound has unresolved work;
- defer when any Zalo outbound was sent in the previous 2 minutes;
- enforce an additional ~5-minute campaign gap;
- skip a customer with any conversation activity in the previous 60 minutes;
- message creation uses `taphoa_chat_notify_customer`, so normal Chat realtime/Zalo bridge ownership stays unchanged;
- outside windows the sender returns `outside_window` and sends nothing.

This pacing reduces burst/spam-like behavior but cannot guarantee how a third-party platform classifies messages.


## Admin Composer — Công nợ không gửi URL trần

Root cause: `admin-composer-actions.js` action `debt` gọi `customerLinks()` rồi gửi trực tiếp `links.debt_url`.

Contract mới:
- click Công nợ gọi một RPC duy nhất `v21_admin_debt_share_summary(customer_id)`;
- chỉ Admin session hợp lệ được gọi;
- debt age = thời gian của đợt số dư dương liên tục hiện tại, không phải ngày đơn gần nhất;
- số đơn = đơn đã giao trong đợt công nợ đó;
- không gán thanh toán vào từng đơn vì collection hiện là balance-level;
- nội dung dùng giọng "Đối chiếu công nợ", gồm số dư, ngày bắt đầu/số ngày, số đơn đã giao, câu đề nghị kiểm tra lịch sự và link chi tiết;
- balance = 0 / dư tiền có mẫu riêng, không nói "chưa thanh toán hết";
- nếu RPC lỗi thì không fallback gửi URL trần.


### Debt share atomic send repair

Symptom: Admin Composer showed "Đang tạo đối chiếu công nợ…" but no message appeared. Production probe confirmed the summary RPC resolved correctly for the active Admin session, while no new `v21_messages` row was created. The failure boundary was the browser's second step (RPC body → client send).

Final owner:
- one RPC: `v21_admin_send_debt_summary(customer_id, client_id)`;
- server validates the current Admin app session;
- server calls `debt_share_summary_payload`;
- server inserts through canonical `taphoa_chat_notify_customer`;
- client only issues the RPC, then wakes SyncEngine once for immediate catch-up;
- idempotency key is `debt-share:<client_id>`;
- no bare-link or browser-send fallback.


## Admin image paste/send duplicate repair

Root cause production: one Admin clipboard transaction can expose the same image through both `clipboardData.files` and `clipboardData.items`. Browser metadata (`name/lastModified`) can differ, so metadata-only dedupe allowed two prepared assets with different asset IDs but the same `content_hash` into one message.

Evidence:
- production had 3 Admin messages with duplicate non-null image hashes inside the same message;
- newest incident contained 2 assets with identical SHA-256 content hash.

Final contract:
- `sameDraftImageContentExists()` owns same-draft image dedupe by canonical `contentHash`;
- applies to both visible and inactive composer drafts, therefore covers picker + paste ingress;
- duplicate prepared asset is released from local preview/cache before queueing;
- historical reuse is still allowed after the draft/message commits;
- one-time migration soft-deleted later same-hash Admin assets inside the same message; production duplicate-message count is now 0;
- no polling/request owner was added.


## Danh bạ — click giữ nguyên vùng cuộn + xóa ô tìm kiếm

Triệu chứng:
- Admin cuộn danh bạ xuống giữa/dưới rồi bấm một liên hệ (ví dụ Cô Huyền PL) thì sidebar nhảy về đầu.
- Khi tìm một liên hệ rồi bấm mở, chữ trong ô tìm kiếm vẫn còn.

Root cause:
- `contact-directory-admin.js` bắt mọi `v21-contact-store-change` bằng `scheduleSync({scrollToTop:true})`.
- Mở conversation có thể lập tức mark-read, sinh contact-store patch và extension Admin cưỡng bức `scrollTop=0`, dù `shell.js` đã giữ đúng viewport.
- Module danh bạ được dynamic-import ngoài canonical bundle nên cần build-key để tránh browser giữ bản JS cũ.

Final contract:
- `v21-contact-store-change` chỉ sync/reorder và luôn giữ `.wm-sidebar-navigation.scrollTop`; mark-read không được kéo danh bạ về đầu.
- Tin nhắn mới vẫn có thể reorder theo `latest_at`, nhưng viewport hiện tại thuộc về người dùng và không bị ép về row 1.
- Click đúng `[data-contact-select]` sẽ xóa `query` + giá trị input tìm kiếm rồi sync danh sách; nút `...` quản lý liên hệ không bị coi là mở contact.
- Dynamic import `contact-directory-admin.js` được gắn `__build=<app-build-id>` để deploy mới không dùng cache module cũ.
- Không thêm polling/request/Realtime owner mới.

Commits:
- code + regression test: `2a304b7f54a1ed816f61c949962badaaf6620a52`;
- sửa contract test cũ đang yêu cầu hành vi nhảy-top: `efbfee7e7873869657a4176ba024da5bbb05d5ea`;
- sync canonical `index.html/version.json`: `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.

Verification:
- Verify V21: PASS trên `9f192d36a13f9c5e48ffc9ae25ffc39da28017ab`.
- Deploy Chat Pages: PASS.
- Build canonical + verify canonical: PASS.
- Pages deploy + custom-domain HTTPS probe: PASS.
- Production build id: `568463e3960f72cd91676e369aac91e464ca5ae982838b87da450dfeb3c1dfa2`.


## Ảnh chat — mở full phải giữ độ nét

Triệu chứng:
- ảnh trong bong bóng chat nhìn nét nhưng khi mở viewer toàn màn hình thấy mềm/mờ hơn.

Root cause:
- Composer cũ ép mọi ảnh lớn về cạnh tối đa 1600px và JPEG/WebP quality 0.78;
- ảnh trên bubble chỉ rộng khoảng 360px nên khó thấy suy giảm, nhưng viewer toàn màn hình/Retina phóng vùng ảnh lớn hơn nên lộ rõ;
- production có nhiều media canonical bị chạm đúng trần 1600px, xác nhận đây là đường nén thực tế chứ không phải CSS viewer.

Final contract:
- JPEG/JPG/PNG/WebP có cạnh <=4096px và <=15 MiB được giữ nguyên byte, không re-encode chỉ vì file >512 KiB;
- ảnh lớn hơn 4096px vẫn resize có kiểm soát về 4096px, quality encode 0.92;
- giới hạn upload 15 MiB hiện hữu không đổi;
- viewer/cache/Storage owner không đổi, không thêm request/polling/proxy/log;
- ảnh đã gửi trước patch vẫn giữ chất lượng file đã lưu; patch áp cho ảnh gửi mới.

Resource impact:
- không tăng số request;
- media mới có thể lớn hơn trước nên tăng byte Storage/egress theo kích thước ảnh thực, đổi lại viewer giữ độ nét sản phẩm; vẫn bị chặn bởi giới hạn 15 MiB/ảnh.

Commit production: `7e2403a5fe97f0f797c0811a403100a69facf0e4`.
- build id: `5b34014013eb2c58da951f3078708400d73bf71e7c1f8f9c6ade5215ff05e030`;
- Verify V21: PASS;
- Block old Supabase runtime refs: PASS;
- Deploy Chat Pages: PASS;
- GitHub Pages build/deployment: PASS;
- canonical build/verify: PASS;
- custom-domain production probe: PASS.


## 2026-10-08 — Chat UI Foundation V1 / mobile directory compact
- Base UI patch: `4a7585cf66613beba5ec03649d06b8eb605b5b9b`.
- Added local `ui-foundation.css` (visual tokens only; no business/realtime/push ownership).
- Mobile directory prioritizes `Chọn người → Chat`: compact `Danh bạ`, 12px gutter, 16px mobile search input, tighter search/filter spacing; contact row remains 60px / avatar 40px.
- Notification routing audited only: `sw.js` carries contact/conversation IDs and `admin-push-controller.js → ChatAppShell.NavigationCommand.openContact()` forces route `chat`; no Push/DB/Realtime code changed.
- Resource impact: 0 DB writes, 0 provider calls, 0 polling/logging/background work added; one small local CSS asset.
- Initial Verify V21 failed only because generated `index.html/version.json` were not committed with modular source. Pages build generated + verified canonical output successfully; this commit synchronizes generated artifacts.


## 2026-10-08 — Chat Header + Composer Foundation pass
- Scope: visual-only, mobile-first RegionTop + Composer.
- Header uses `--ui-chat-header-mobile:60px`, 44px mode controls, safe horizontal gutter; no Chat/Work/call route logic changed.
- Composer uses 44px touch controls for + / mic / send, 16px input, 12px page gutter and local radius/shadow tokens; keyboard/VisualViewport/audio/send owners unchanged.
- No DB/API/realtime/push/provider/log/background changes. Generated `index.html/version.json` are synchronized in the same commit.
