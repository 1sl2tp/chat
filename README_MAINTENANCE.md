# TAPHOA CHAT — MAINTENANCE RULE

> BẮT BUỘC đọc trước mọi sửa chữa production.
>
> Mục tiêu: Chat phải realtime như trước khi cutover Supabase, nhưng sửa chữa không được làm tăng request/log/egress bằng cách thêm polling, retry hoặc fallback trùng owner.

## 1. Thứ tự bắt buộc trước khi sửa

1. Đọc `CURRENT_WORK.md`.
2. Đọc file này.
3. Nếu chạm Realtime/polling/heartbeat/Presence/RPC/cache/log/cron/push/media/retention: đọc `README_RESOURCE_GUARDRAILS.md`.
4. Ghi rõ: triệu chứng, owner nghi ngờ, bằng chứng nhỏ nhất, patch nhỏ nhất, rollback.
5. Chỉ sửa từ HEAD mới nhất của `main`.

## 2. Owner runtime

- GitHub Pages: code/UI delivery.
- Supabase Postgres/Auth: canonical account, conversation, message, read-state, session, sync-event.
- Supabase Realtime: wake transport, không phải source of truth.
- `v21-sync-engine.js`: delta pull, outbox, read-state orchestration.
- `v21-realtime-session.js`: subscribe/wake/Presence.
- IndexedDB: local cache, outbox, cursor.
- Web Push: admin background notification/fallback wake; không thay canonical message sync.
- Zalo bridge: external transport only; không được trở thành owner của canonical chat.

## 3. FAST REPAIR

Một incident phải trả lời được:

```text
Triệu chứng:
Owner:
Bằng chứng:
Last-known-good:
Patch nhỏ nhất:
Test:
Deploy:
Production probe:
Rollback:
Resource impact:
```

Quy tắc:
- Một lỗi → một owner → một patch → một deploy.
- Production regression rõ từ deploy gần nhất → rollback trước, điều tra sau.
- Không refactor/dọn code trong incident realtime.
- Không sửa cùng lúc UI + DB + Realtime + Push chỉ để “thử”.
- Probe 1 conversation / 1 account / 1 RPC trước khi scan rộng.

## 3b. UI-143 — Một quy tắc hiển thị ảnh cho tin mới và lịch sử (2026-10-13)

- **Không tách rule ảnh theo tuổi tin, nguồn Zalo, Admin/User, Web/PWA hay cache.** Dữ liệu chỉ quyết định asset + tỷ lệ nguồn; cùng một renderer tính kích thước ở lần đầu và mọi lần cập nhật/mở lại.
- **Gốc tọa độ:** `data-turn="assistant"` (tin nhận) sát mép trái vùng tin với *một* gutter 6px/safe-area; `data-turn="user"` (tin gửi) sát mép phải tương ứng. Tin đơn, ảnh/file/audio và album cùng tuân thủ cạnh của người gửi; không thêm căn giữa vào lớp ảnh. Desktop vẫn dùng content axis desktop.
- **Gốc kích thước ảnh đơn:** `singleImagePresentation(media)` và `patchMessageMediaShell(shell,media)`. **`createMessageMediaShell` phải gọi `patchMessageMediaShell` ngay khi tạo**, không chỉ lúc reconcile: media shell, ảnh thật và metadata phải dùng cùng `--message-media-width`. Nếu ảnh Zalo/lịch sử thiếu `width_px/height_px` hoặc khai sai, dùng `img.naturalWidth/naturalHeight` khi decode để hiệu chỉnh cả tile và shell; dữ liệu mạng không cần đọc lại. Ảnh dọc `contain` trọn ảnh theo tỷ lệ, xem ảnh lớn trong Viewer; album cố định tối đa 360px, `cover` riêng từng tile. Legacy direct-image DOM có `data-image-presentation` cũng phải lấy đúng biến width, không mặc định ép 360px.
- **Không tác động dữ liệu:** cache/IndexedDB, lưu ảnh, Storage và Realtime không can thiệp vào vị trí CSS; không gọi thêm API/refresh dữ liệu chỉ để chữa lề.
- **Kiểm thử bắt buộc:** remote/self × ảnh dọc/ngang/album × first-render/patch/restore, trên Web và iPhone Safari/PWA; kiểm left/right bằng tọa độ thực tế, không chỉ nhìn thumbnail; chạy `tests/test_v21_ui_library_composer_media_menu.py` và canonical Verify trước deploy. Cuộn đang đọc lịch sử giữ nguyên vị trí, hình không méo/zoom.
- **Rollback:** hoàn nguyên riêng `createMessageMediaShell` + legacy CSS, cập nhật lại `index.html/version.json` bằng canonical build; không chạm backend.

## 3c. UI-144 — Composer Web/PWA/mobile dùng MỘT owner kích thước và lề (2026-10-13)

- **Triệu chứng:** trên iPhone PWA, vùng nhập tin cách hai mép không đều, có màn quá xa/khác trạng thái quá sát; icon Mic nhỏ, vòng tròn Send lớn; CSS source cũ `zalo-admin-link.css #composer-plus-btn` ép 36px `!important` trong khi UI Foundation khai 44px.
- **Owner:** `ui-foundation.css` là nguồn token; `mobile-chat-refresh.css` là composer mobile/single-pane owner; `ui-library/index.html` demo phải theo cùng contract. Chỉ `keyboard-inset-core.js`/`shell-form-viewport-policy.js` sở hữu vị trí bàn phím, không tạo owner mới.
- **Một lề ngoài:** `.composer-source-frame.chat-content-axis` chỉ lấy **12px mỗi bên** trong portrait, hoặc `max(12px, safe-area-left, safe-area-right)` khi có notch/landscape; **không** vừa trừ width hai bên vừa giữ `.chat-content-axis` padding ngang `!important`. Width co giãn tới max 44rem, căn giữa.
- **Một layout trong khung:** grid `44px minmax(0,1fr) 44px 44px` theo thứ tự + / ô nhập / Mic / Send. Nội bộ padding ngang **4px**, gap cột **4px**; editor font tối thiểu **16px** iPhone; nút +/Mic/Send đều có **hit target 44×44px** kể cả CSS legacy hay trạng thái khác.
- **Tỷ lệ quang học:** SVG + **18px**, mic **20px** (hình mic intrinsically hẹp), mũi tên **18px**, stroke **1.6px**. Vùng bấm ≠ vùng vẽ. Send **đĩa tròn vẽ 36px** nằm giữa hit target 44px, border trong 4px dùng màu surface. Mic/Send không bị ép scale, không dịch vị trí.
- **State invariants:** `data-can-send=true/false`, `:disabled`, focus, recording, textarea multi-line, attachment/reply, keyboard open/closed, PWA/Safari/Web **không** thay đổi toạ độ, grid, 44px targets hoặc vòng tròn 36px; Send chỉ đổi **background/text color**, không đổi geometry. Khi audio recording UI thay bằng tray thì giữ chủ sở hữu audio state sẵn có. Tắt/hiện phím ảo không thêm margin đáy khác.
- **Cấm:** chỉnh từng tin hoặc button bằng inline style/transform; thêm padding hai tầng; nút 36px hit trên mobile; dùng `pointer:coarse` để đổi data/action; polling/RPC/Edge/DB chỉ để sửa UI; sửa shell/scroll owner để chữa icon.
- **Test trước release:** `tests/test_v21_ui_library_composer_media_menu.py` + Verify V21; kiểm tọa độ tại width 320/375/390/430/768/1023, portrait/landscape notch, Safari iPhone Web + PWA, keyboard đóng/mở, Mic recording, Send disabled/enabled, dark theme nếu hỗ trợ. E4 ảnh thiết bị thật và E5 người dùng chấp nhận chỉ xác nhận khi quan sát; CI/Pages PASS không đồng nghĩa PWA đã nhận bản mới.
- **Rollback:** sửa ngược duy nhất `ui-foundation.css`, `mobile-chat-refresh.css`, `ui-library/index.html` và test liên quan; build lại `index.html`/`version.json` khớp HEAD. Không chạm server/cache tin nhắn.

## 3d. UI-145 — TOP / DANH BẠ / HỘI THOẠI / ĐÁY: hai đường lề có ngữ nghĩa (2026-10-13)

**Một nguồn token, không một số px duy nhất cho mọi thành phần.** Mobile/PWA single pane `<1024px`: `ui-foundation.css` sở hữu `--ui-chat-layout-rail:12px` cho các mặt điều khiển và `--ui-chat-message-rail:6px` cho mép bong bóng tin; vùng có tai thỏ tuân `max(token,env(safe-area-inset-left/right))`. Đây là **hai hệ lề có chủ đích**, không cho thêm thứ ba. Desktop đa cột giữ `chat-content-axis` riêng.

- **TOP — P1/header owner:** `#regionTop .compact-top-grid.chat-content-axis` chỉ dùng một rail 12px (có safe area), thay cho padding 16px `!important` inherited từ desktop + 10px `mobile-ui-polish`. Icon menu và nút gọi nằm trong hitbox riêng, không bắt đường viền icon trùng đường viền khung; hai đầu hit-area cách mép 12px. Giữ switch Trò chuyện/Công việc ở cột giữa, không làm hẹp thành phần chỉ để đạt px.
- **GIỮA / DANH BẠ — P2/P3 owner:** tiêu đề `Danh bạ`, cạnh của ô `Tìm kiếm`, điểm bắt đầu chip đầu tiên `Tất cả`, avatar hàng liên hệ và lề phải thời gian cùng theo rail 12px. Body 6px + tools 6px = 12px; body 6px + list 2px + row 4px = 12px. Safe area bù ở body/heading, không nhân đôi padding qua nested div. Chỉ `.wm-sidebar-navigation` cuộn dọc, `scrollbar-gutter:auto` cho mobile. Tên liên hệ theo sau avatar + gap nội bộ, không ép tên sát rail. Giữ vị trí cuộn/đầu danh bạ của người đang xem, không reload và không tự nhảy top.
- **GIỮA / HỘI THOẠI — P2 message owner:** `#conversationContentAxis` không tự thêm margin/padding khác; `#messageWindow` sở hữu duy nhất rail 6px trái/phải, có safe-area. Tin `assistant` (người khác) bám mép trái và `user` (mình) bám mép phải. Bong bóng chữ, reply, ảnh ngang/dọc/album, media phải dùng một **hướng neo sender**, không center lại hoặc cộng thêm gutter. Padding chữ trong bong bóng không phải lề ngoài.
- **ĐÁY — P3/P4 Composer owner:** `.composer-source-frame.chat-content-axis` lấy một rail 12px, không vừa trừ width vừa giữ padding desktop. Giữ UI-144: ba hitbox +/Mic/Send 44px, Send disc36, grid 44/flex/44/44, gap4, inset4; lề không đổi giữa idle/ready, keyboard đóng/mở hay PWA/Web. Platform keyboard inset owner không đổi.
- **Scope/lock:** single-pane Chat only; không áp tất cả lên Work, PWA guest, desktop >=1024, viewer toàn màn hình hay overlay khác. Không sửa data/auth/Realtime/cache, không phát sinh RPC/Edge/Storage/refresh/background activity hoặc log.
- **Test/acceptance:** `tests/test_v21_mobile_ui_polish.py::test_ui_145_one_layout_rail_for_header_directory_and_composer` + `tests/test_v21_140_zalo_card_narrow_axis.py`; tọa độ DOM 320/375/390/430/768/1023px; Safari/PWA portrait+landscape; top icon hit target, title/search/chips/avatar/time, remote/self chat text/images, bottom editor disabled/ready, keyboard closed/open. Các lề ngoài bằng nhau theo rail tương ứng; không overflow-x và không nhảy vị trí cuộn. **E4 real device** và **E5 người dùng chấp nhận** vẫn pending cho đến khi kiểm nghiệm.
- **Rollback:** hoàn nguyên riêng `ui-foundation.css`, `mobile-ui-polish.css`, `mobile-chat-refresh.css` và tests; tái tạo `index.html/version.json` bằng canonical generator, không đụng backend.

## 3e. UI-146 — Root sidebar padding và PWA shell update phải đúng bản (2026-10-13)

- **Bằng chứng từ iPhone 21:07:** title/search/chips/avatar/time đều thẳng hàng với nhau nhưng còn cách mép màn hình khoảng 36px. UI-145 đã quy định lề danh bạ 12px nhưng `reference/chatgpt/full-source/raw-css/app-CIyuNPp8.css` còn `.wm-sidebar-sidebar{padding:... var(--size-24,1.5rem) ...}` = 24px xung quanh toàn bộ. Tổng thực tế 24+12=36px. **Không được quy kết ảnh giống bản cũ là PWA chưa nhận build nếu chưa có mã build của máy.**
- **Owner duy nhất:** trong `mobile-ui-polish.css` khi `#appShell[data-mobile-directory="true"]` authenticated, đặt `#shellNavigationLayer .wm-sidebar-sidebar{padding-inline:0!important}` để triệt tiêu root padding 24px; giữ nguyên padding dọc, title 12, tools 6+body 6, avatar/time list2+row4+body6 và vị trí cuộn.
- **PWA cập nhật:** `sw.js` sử dụng `SHELL_CACHE_EPOCH` khác khi shell UI thay đổi, để cache HTML cũ không bị giữ mãi vì `RELEASE_VERSION` vẫn là `V21.72.39`. Cùng thay đổi phải build lại `index.html` và `version.json` trong canonical builder; không dùng `localStorage.clear`, không xóa IndexedDB/media/chat history, không thêm polling/network để sửa CSS. Giữ cơ chế shell offline-first và auth-session safe reload. Sau khi worker kích hoạt, đóng/mở PWA để tạo trang mới; nếu cần, mở lần nữa để hoàn tất revalidate.
- **Xác minh 2 tầng:** E3 GitHub Pages CI+Deploy thành công chứng minh server code triển khai; **không** chứng minh client PWA đã kích hoạt. E4 chỉ PASS khi quan sát build ID thiết bị qua `window.V21AppUpdateController.snapshot().currentBuild` / meta `app-build-id`, so với `version.json.build_id`, và đo `getBoundingClientRect()` các title/search/avatar trên iPhone. E5 người dùng xác nhận nhìn đúng. Nếu còn lệch, kiểm computed parent padding trước khi thêm CSS con.
- **Rollback:** hoàn nguyên hai file `mobile-ui-polish.css`/`sw.js`, cập nhật lại canonical index/version, Verify/Pages, giữ mọi DB/Realtime/cache lịch sử.

## 4. Contract realtime không được phá

Luồng chuẩn:

```text
message/read write
→ v21_sync_events
→ app đang mở: áp canonical event thẳng vào SyncEngine/cache/UI
→ MessageStore + ContactStore cùng cập nhật
→ active thread FOLLOW_TAIL mới xuống newest; đang đọc lịch sử USER_AWAY giữ vị trí, không tự cuộn
→ mark-read chỉ khi conversation thật sự visible
→ mở lại/reconnect: delta pull catch-up phần bị lỡ
```

Các invariants:
- Tin nhắn không phụ thuộc polling interval.
- Danh bạ và thread phải dùng cùng canonical event.
- Một account mở nhiều admin device: mọi session hợp lệ đều phải nhận wake.
- Chỉ `v21_sync_events` được phép áp canonical payload trực tiếp khi app đang mở.
- `v21_sync_pull` là catch-up khi boot/reconnect/gap, không phải vòng bắt buộc sau mỗi event.
- Direct `v21_messages INSERT` hoặc push chỉ được làm fallback wake; không được trở thành render owner.
- Admin mobile background dùng Web Push; user đóng app thì không chạy foreground sync.

## 4b. UI-138 — Mở/làm mới Chat hiển thị ĐÚNG VỊ TRÍ, không nhìn thấy cuộn

- Chat Web, Safari, PWA dùng cùng ScrollRoot và một ScrollController (`app.js`). Mở thread chưa có viewState hợp lệ: dựng cửa sổ tin cuối, đặt scrollTop ngay trong lượt render trước frame hiển thị; có viewState USER_AWAY hợp lệ: định vị anchor đọc trước khi reveal rồi mới cho media/layout settle. Không dùng CSS smooth hay writer cuộn thứ hai.
- Tin nhắn mới qua Realtime chỉ theo cuối nếu viewport đang `FOLLOW_TAIL`; người đọc lịch sử `USER_AWAY` giữ nguyên tin đang đọc, có chỉ báo tin mới. Gửi tin chủ động, bấm trở về cuối, bấm thông báo (theo §4a) là các ngoại lệ có intent rõ.
- Danh bạ từ cache xuất hiện theo thứ tự hoạt động mới nhất; khi đã cuộn/chọn người, cập nhật danh sách và đọc tin không được nhảy về đầu. Danh bạ và nội dung có scroll owner độc lập, không gọi backend để sửa vị trí.
- Làm mới toàn trang chỉ khôi phục vị trí đọc cũ **nếu có viewState hợp lệ**; không hứa đã lưu persistent scroll qua mọi reload/cold start. Khi không có snapshot, hiển thị tin mới nhất trực tiếp.
- Tests: `tests/test_v21_138_scroll_visibility_policy.js`, kiểm source `tests/test_v21_contact_click_position_stability.py`, test click notification riêng. E4 thực tế PC+iPhone PWA còn PENDING tới khi quan sát không bị cuộn/giật. No polling, DB/RPC/Edge/cron/log increment.

## 4a. Mở tin từ thông báo phải hiển thị NGAY tin cuối

- **Chỉ** click thông báo tin nhắn Admin (cửa sổ đang mở hoặc mở PWA lạnh) mới được bỏ vị trí đọc cũ của **đúng liên hệ đích**. Chọn liên hệ thường, quay lại tab, đang đọc lịch sử và thao tác scroll tay phải giữ nguyên contract cũ.
- Luồng owner: SW chuyển `contactId/conversationId` → `admin-push-controller.js` đặt one-shot notification intent trước Shell navigation → `v21-message-store.js` bỏ `viewState.USER_AWAY` của liên hệ đích và gọi lại `V21ConversationBridge.replace(...,viewState:null)` nếu chính liên hệ ấy đang mở → **duy nhất `app.js` ScrollController** dựng cửa sổ tin mới nhất và điều khiển ScrollRoot.
- Che **chỉ vùng tin nhắn** trong thời gian thay vị trí; chỉ hiện khi contact đã mounted, viewport ở `FOLLOW_TAIL`, khoảng cách tới cuối ≤2px ổn định liên tiếp 3 frame. Nhằm tránh hiện cảnh chạy cuộn từ đầu/cuối vị trí đọc cũ. Bỏ che khi route lỗi, logout hoặc quá 2 giây (fail-open), không để UI bị ẩn vô thời hạn. Không dùng `scroll-behavior:smooth` hoặc viết scrollTop trong PushController/MessageStore.
- Không thêm RPC, polling, cron, catch-up thứ hai, render owner thứ hai. Push chỉ điều hướng; SyncEngine vẫn là owner đọc canonical, mark-read chỉ khi conversation visible. Intent chỉ nằm trong bộ nhớ, không ghi localStorage/IndexedDB.
- QA bắt buộc: click từ thông báo cửa sổ đang mở (khác liên hệ), đang ở chính liên hệ nhưng đọc tin cũ, cold-open khi contact cache chưa sẵn, contact không tồn tại, logout giữa transition. Mọi đường đều không được cuộn có hoạt ảnh, không để màn hình trống vĩnh viễn; chọn liên hệ thông thường vẫn khôi phục vị trí.
- Đối chiếu production sau GitHub Actions Verify V21 và Deploy Chat Pages, Safari/PWA; chưa có video/ảnh production thì không đánh dấu PROD VERIFIED.

## 5. Deploy

- Chỉ deploy runtime bị thay đổi.
- Docs-only không deploy Pages và không chạy full verify.
- Gom patch cùng owner thành một commit code chính khi có thể.
- Không commit từng ý nhỏ chỉ để kích workflow.
- Sau code change: build canonical → verify → deploy → production probe.
- Chưa production probe thì chưa nói “xong”.

## 6. Migration / DB

- Migration additive/backward-compatible trước.
- Không xóa canonical message/read/media chỉ để giảm dung lượng.
- Event/outbox/session-run là dữ liệu vận hành, phải bounded bằng retention có contract.
- Mọi delete/TTL production phải có rollback/backup logic và test `reset_required → snapshot` nếu đụng sync-event.

## 7. Sau repair

Cập nhật `CURRENT_WORK.md`:
- commit;
- root cause;
- patch;
- workflow/deploy;
- production probe;
- resource impact;
- việc còn lại.

Nếu thay đổi kiến trúc/traffic contract thì cập nhật luôn `README_RESOURCE_GUARDRAILS.md`.

## SDD — SPEC → TEST → ACCEPTANCE (RULE 04, 2026-10-09)

Trước khi thay đổi CHAT, đọc [RULE 04 — SDD/Spec/Test/Acceptance](https://github.com/1sl2tp/infrastructure/blob/main/rules/04-SDD-SPEC-TEST-ACCEPTANCE.md) và [RULE CHUNG Google Sheets](https://docs.google.com/spreadsheets/d/1vu8mlXSr_E6klO3UjrsoWjos2MefCWkDra3MBbI6NHQ/edit) tab **08 - SDD SPEC TEST ACCEPTANCE**, sau các rule owner/resource hiện hành của repo.

- Mỗi task có SPEC ID; mô tả Given/When/Then, root owner và read/write path, MUST-STAY, case lỗi, rollback, nguồn chứng cứ và resource impact. Lỗi UI nhỏ dùng 1 dòng Spec, **không thêm tool GraphRAG/server/cron**.
- Trước patch khóa E0 SPEC + owner; test theo từng case E1/E2; đọc đúng commit/release E3; kiểm hành vi trên production/device thực E4; resource và user acceptance E5. Mock/unit xanh **không** phải bằng chứng UI thật đã sửa xong.
- Drift Check: không mở rộng file/provider/permission, không vô tình làm khác hành vi cũ. Với bug người dùng còn nhìn thấy, test string/CSS/CI đạt không được gọi DONE. Chưa có browser/account thực → `PROD PENDING`.
- Push click mở thẳng newest không lộ cuộn; normal contact scroll giữ vị trí; SyncEngine/ScrollController là owner; Safari/PWA cần test thật.
- Docs-only update **không deploy production** và không cập nhật trạng thái nguồn nghiệp vụ; không sửa task `CURRENT_WORK` đang chờ nghiệm thu chỉ vì thêm SDD rule.

