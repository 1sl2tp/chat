# TAPHOA CHAT — MAINTENANCE RULE

> BẮT BUỘC đọc trước mọi sửa chữa production.
>
> Mục tiêu: Chat phải realtime như trước khi cutover Supabase, nhưng sửa chữa không được làm tăng request/log/egress bằng cách thêm polling, retry hoặc fallback trùng owner.

## 2026-10-18 · UI-156 — Phân ngày trong chat + nhãn ngày khi cuộn

- **Mục tiêu:** giúp nhận biết ranh giới ngày khi đọc lịch sử và nhìn nhanh thời gian tin gần nhất trong danh sách cuộc trò chuyện, không làm dày giao diện.
- **Danh sách cuộc trò chuyện:** tin mới hôm nay hiển thị giờ `HH:mm`; hôm qua hiển thị `Hôm qua`; 2–6 ngày trước hiển thị thứ; cũ hơn hiển thị ngày/tháng/năm rút gọn.
- **Trong cuộc trò chuyện:** mỗi ranh giới ngày có đúng một mốc `Hôm nay`, `Hôm qua`, hoặc thứ + ngày đầy đủ. Mốc là con của message row để virtual window tính chiều cao đúng; không tạo sibling row riêng và không lặp mốc trước mọi tin.
- **Khi cuộn:** nhãn nổi lấy ngày của tin đầu tiên đang nhìn thấy, hiển thị ngày cụ thể cùng `Hôm nay`/`Hôm qua` khi phù hợp, rồi mờ đi sau 900ms không cuộn. Nhãn không chiếm chiều cao, không ghi `scrollTop`, không gọi mạng.
- **MUST-STAY:** giữ nguyên ScrollController/anchor/virtualization; tin realtime đến chỉ theo chính sách follow-tail hiện hữu; không kéo người đang đọc lịch sử xuống cuối. Không đổi DB, Supabase, Realtime, polling, RPC, message/media cache hoặc quyền đọc.
- **Kiểm thử:** ngày địa phương, chuyển ngày, hôm nay/hôm qua/thứ + ngày; UI contract cho separator/floating chip; giữ nguyên kiểm thử contact-time và scroll policy hiện có.
- **PWA:** chỉ bump shell cache epoch để shell đang cài nhận HTML/CSS/JS mới; không xóa IndexedDB hay cache dữ liệu riêng tư.
- **Build chuẩn:** Verify V21 dựng lại `index.html`/`version.json` và đồng bộ chúng lên `main` khi có khác biệt; Pages cũng dựng lại từ cùng nguồn trước khi triển khai.

---

## 2026-10-15 · SPEC-CHAT-PWA-BOOT-155 — Ưu tiên hiện ngay khi mở PWA

- **Triệu chứng:** iPhone PWA nhiều lần mở chậm/đứng, chưa kịp hiển thị Chat/danh bạ dù đã dùng trước đó.
- **E0 owner & nguyên nhân trong mã:** `index.source.html` tải `cdn.tailwindcss.com` đồng bộ tại `<head>`, gây chặn parser khi CDN chậm; `sw.js` chỉ cache shell cùng origin + avatar, còn hai script khởi tạo Tailwind/Supabase CDN không có đường phục hồi nhanh theo cache Service Worker.
- **E1–E3 patch:** chỉ hai script bootstrap công khai được cho vào `BOOT_VENDOR_URLS` và trả CacheStorage trước mạng khi đã có cache; lần đầu tải qua đúng luồng `fetch` hiện hành rồi lưu nếu response OK/opaque. Tailwind tải `defer` để không chặn HTML parser. Bump `SHELL_CACHE_EPOCH='pwa-boot155'`; build lại canonical `index.html` + `version.json`.
- **MUST-STAY:** không cache auth/RPC/private message, không thay IndexedDB account scope, không thay Supabase client, realtime/heartbeat/push, không sinh interval/poll hoặc lượt GET cố định mới; không thay thứ tự nguồn JS cần cho auth, không xóa cache tin nhắn, không ép reload lúc đang dùng.
- **Verify:** GitHub Pages run `38705488584` SUCCESS, Verify V21 run `38705678644` SUCCESS. Bài UI-154 cũ khóa epoch `img154` được cập nhật sang `pwa-boot155` mà không đổi CSS/media. **E4/E5 vẫn PENDING:** cần thử iPhone PWA cũ được nâng version, mở lại lần đầu/lần hai, mạng chậm/offline, đăng nhập còn phiên hoặc hết hạn; đo first meaningful paint, danh bạ hiện từ cache và phản ứng với RPC chậm. Bản sửa giải quyết chặn CDN, **không chứng minh RPC xác thực cũng hết chậm**.
- **Rollback:** revert `sw.js`, tag Tailwind ở `index.source.html`, build lại `index.html/version.json` đồng bộ; không động backend dữ liệu.

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

## 3b. F-133 → F-137 — MỘT RULE CHUẨN ẢNH CHAT (2026-10-13, thay UI-143 cũ)

**Nguồn duy nhất:** Google Sheet **RULE CHUNG TOÀN BỘ HỆ THỐNG** → tab `04 - UI FOUNDATION TOKENS` các hàng **F-133…F-137**; hỗ trợ **F-130** (Viewer duyệt ảnh đúng cuộc trò chuyện), **F-132** (Copy/Tải/Chia sẻ). Tab `03 - UI PWA MOBILE WEB` **UI-33/UI-35** chỉ là chỉ dẫn nền, không còn là preset độc lập. Mọi đoạn rule cũ về kích thước viền/ảnh đã xem xung đột với F-133…137 đều **SUPERSEDED / KHÔNG ÁP DỤNG**; bản cũ tra Git history, không duy trì hai chuẩn song song.

- **F-133 Rev2 · CLASSIFY FIRST → SIZE:** ảnh đơn xét đúng W/H gốc: **dọc H>W**, **vuông H=W**, **ngang W>H**. Sau phân loại: **dọc** target width `min(260px, 560px×(W/H))` và chiều cao theo tỷ lệ (tối đa 560px); **vuông** width 320px; **ngang** width 360px. Cả ba tự co theo sender lane thực tế và không crop (`object-fit:contain`), viewer luôn hiển thị ảnh đầy đủ. Không dùng viewport `48dvh` để tính width ảnh dọc. `createMessageMediaShell` + `applySingleImagePresentation` vẫn chung biến `--message-media-width`; nhận bám trái, gửi bám phải, gutter 6px, cùng quy tắc cho Zalo/lịch sử/Web/PWA.
- **F-134 Rev3 · Album:** 2 ảnh = 2 cột; 3 ảnh = 1 ảnh lớn + 2 ảnh chồng; 4+ = 2×2, ảnh cuối dùng `+N` khi còn. Toàn gallery tối đa **360px**, **một** radius ngoài **14px**, **viền trung tính 1px, không padding ngoài**; giữ gap **4px** chỉ *giữa* các ô. Ảnh đơn cũng có border 1px/padding0 để mép nhìn thấy của dọc/ngang/album thẳng nhau, không thêm margin vá. `cover` **chỉ** được dùng cho thumbnail gallery; khi mở từng ảnh phải thấy trọn ảnh gốc.
- **F-135 Rev3 · Viewer:** viewer wheel ở 100% zoom + 2+ ảnh → chuyển ảnh trước/sau (giới hạn nhịp để tránh nhảy nhiều); wheel trên filmstrip chỉ cuộn ngang thumbnails, bấm thumbnail để chọn; Ctrl/Cmd+wheel hoặc đang zoom → phóng to/thu nhỏ, pinch/swipe/arrow/đóng giữ nguyên. Hướng ảnh tự áp dụng EXIF gốc nếu có qua trình duyệt (`image-orientation:from-image`); EXIF thiếu/sai thì không đoán từ nội dung hay ratio, vẫn giữ nút xoay thủ công từng asset. Không tạo network/EXIF probe mới.\n- **F-135 · Viewer:** xem trong vùng Chat (không tự tràn mọi pane), main ảnh `contain`, không cover/cắt, header/thumbnails không đè ảnh, safe-area desktop/Safari/PWA; ảnh lớn không có border trang trí. Dải thumbnail giữ sẵn border 2px trong suốt; **chỉ** thumbnail `aria-current=true` có viền trung tính **2px**; focus keyboard khác selection. Giữ behavior **F-130**: mặc định duyệt tất cả ảnh *đã có trong store* của đúng hội thoại, kể cả sau ảnh đơn; album filter chỉ khi chọn thủ công.
- **F-136 · Đã xem khác đã đọc:** mở/đóng ảnh chỉ thay **viewer current local**; không gửi read receipt mới hoặc ghi visited vào DB/Storage. Ảnh bong bóng đã xem/chưa xem **cùng** kích thước, radius, viền, opacity; không tô viền xanh/đỏ hoặc badge giả. Canonical message read-state thuộc SyncEngine như cũ.
- **F-137 · Dọn rule cũ:** không dùng thêm override theo Web/PWA, Admin/User, tin cũ/mới hoặc nguồn Zalo; các preset portrait `48dvh/460px`, `messageInlineImageHeightLimit`, khung portrait 360px đã **SUPERSEDED**; không negative margin, không patch child để che lỗi ancestor. Geometry owner là `app.js::singleImagePresentation/applySingleImagePresentation/applyImageGalleryGeometry/patchMessageMediaShell`, CSS owner `index.source.html`; `chat-image-orientation.js` chỉ xử lý xoay, không định lại lane. Shared component không được nhân đôi biến thể ảnh.
- **Giữ nguyên:** text/Composer/danh bạ, account-scoped cache, Ctrl/ScrollController, avatar, media Storage, read-state, realtime/Zalo, offline, Copy/Tải/Chia sẻ F-132. UI repair **0** RPC/DB/Edge/cron/polling/eager preload mới.
- **Nghiệm thu:** portrait dài, 4:5, square, 16:9, panorama, metadata thiếu/sai, Zalo; album 1/2/3/4/5+, caption; mới/tin cũ; gửi/nhận; viewer/zoom/rotate/swipe/đã xem; Web 320/375/390/430 và desktop, iPhone Safari/PWA. E1 source tests ≠ E3 GitHub Pages ≠ E4 iPhone thực tế ≠ E5 resource/user acceptance.

**F-133 Rev2 (13/10, chuẩn đang áp dụng):** ảnh đơn phân loại từ natural W/H trước: dọc `min(260px,560px×ratio)`, vuông `320px`, ngang `360px`, toàn bộ giữ tỷ lệ/contain và co theo sender lane; album 2+ theo F-134. Quy tắc dọc cũ `48dvh/460px` đã SUPERSEDED. Source release commit `5d3685888f02571cd2ed89852c552063370660f7`, build `99e77f0f2945ec5b8e08e87d341a8c1566a1eea609ee0102ddf5422f665d9b76`, PWA shell epoch `img152`. Verify V21 `38432942253` SUCCESS; Pages `38432942423` SUCCESS (including custom domain). E4 iPhone Safari/PWA thực tế và E5 đo resource/người dùng nghiệm thu vẫn PENDING; CI không chứng minh PWA đã kích hoạt build.

**Trạng thái F-133..F-137 (13/10):** runtime đã sửa và phát hành từ main commit `ebaa00347394f6e7d073aa6db802003a8bb38078` (base sửa `53aba322316434f2bd74c0c3ad7b5742e15c1b5e`); `app.js` dùng height cap theo viewport/natural ratio, `index.source.html` sửa viewer/thumbnails, `sw.js` epoch `img151`, index.html và version.json khớp canonical build `e71f9bd26a6d08cbeb02a6e80f43c40d56f0606e5cda7a55bae7510768cde444`. Verify V21 run `38429885277` SUCCESS (test F-133..137 + canonical source PASS); GitHub Pages run `38429885358` SUCCESS (Build/Deploy/custom domain PASS). **E4 Safari/PWA trên iPhone và E5 network/resource & người dùng nghiệm thu vẫn PENDING**, không giả vờ đã test màn hình thật.

**UI-154 FOUR CORNERS (13/10):** F-133/134 Rev4 thay viền 1px vẽ trực tiếp *trong box-model* bằng một lớp viền mảnh `::after` (absolute, inset0, border-radius:inherit, pointer-events:none) và `position:relative;isolation:isolate` ở root media. Cả bốn góc dùng đúng **một clip 14px** từ khung gốc; ảnh đơn, ảnh ngang/dọc và album không bị viền/padding làm đổi khung hoặc mép. Album chỉ có gap4px giữa các ô, pseudo absolute không chiếm ô grid. Không scale/transform GPU hàng loạt, không làm mờ ảnh, không ảnh hưởng hover rotate/viewer, copy/share/read-state hay media nguyên gốc. Source chỉ CSS + PWA cache epoch `img154`; runtime commit `d933abcebf60ca7c7200dc6f46eec7363df77a0b`, test fix `0603d7c8c50ba3ae9b63274959e1efd1c07d49b5`, canonical build `4a13b1baf3ef3383320c76993772c98d08260ac17e0c86b6f37461718a32266d`. **Verify V21 `38438243951` SUCCESS**, **Pages `38438011675` SUCCESS** (including custom domain). Safari/PWA thực tế E4 và đo resource E5 vẫn PENDING; screenshot người dùng là URL `_build=e71...` cũ. Ảnh người dùng gửi còn URL build `e71f9bd...` cũ, không khẳng định đã thấy build mới.

**UI-153 media edge / viewer wheel / EXIF (13/10):** F-133/134/135/137 clarified in Google Sheets: image single portrait/square/landscape and album all use outer radius14px, neutral border1px, no outside padding (gallery only gap4px internally); existing remote-left/self-right margins unchanged. Viewer wheel when 100% + multiple images browses next/previous with threshold/cooldown; filmstrip vertical wheel scrolls its thumbnails horizontally but does not auto-select; Ctrl/Cmd+wheel or zoomed viewer zooms. Native EXIF orientation via `image-orientation:from-image` where provided, manual rotation remains for missing metadata. Runtime commit `680ac90ae6673f65e487a47ff30989ec8fa1dda0`, build `f03a62b4b85a70ddabbb75d34877088373e7c8285f7a10ae4f22921e0e79f4e1`, PWA shell `img153`. Verify V21 run `38435857344` SUCCESS, Pages run `38435856962` SUCCESS. iPhone Safari/PWA visual E4 and resources E5 **PENDING**, not inferred from CI.

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

## 3f. UI-147 — Danh bạ: nhịp dọc Top → tiêu đề → Tìm kiếm (2026-10-13)

- **Nguồn yêu cầu:** ảnh mobile PWA lúc 21:35 cho thấy khoảng Top/Trò chuyện–Công việc → `Danh bạ` còn rộng (~36–40px nhìn trên ảnh) và khoảng `Danh bạ` → ô `Tìm kiếm` cũng thưa (~24–28px). Mục tiêu quang học tương ứng **20–24px** và **12–16px**; không lấy tọa độ pixel screenshot làm số CSS tuyệt đối vì ảnh mockup có tỷ lệ.
- **Ownership một lần:** Chỉ `mobile-ui-polish.css`, lớp `#appShell[data-auth-state="authenticated"][data-mobile-directory="true"] #shellNavigationLayer` điều chỉnh **padding dọc sẵn có** của `.wm-sidebar-sidebar` (ancestor), `.wm-sidebar-header`, `.wm-sidebar-body`. Token `ui-foundation.css`: `--ui-directory-root-top-min:12px`, `--ui-directory-top-trim:16px`. Đối với notched iPhone root top = `max(12px, safe-area-top - 16px)` còn header tự giữ safe-area-top, nên không cộng khoảng đệm Top quá mức; no-notch có tối thiểu 12px. Giảm header bottom 3→0 và body top 12→0 để thu khoảng tiêu đề/tìm kiếm. **Không** dùng transform, negative margin, đè fixed top overlay hoặc JS scroll để sửa.
- **Không đổi:** UI-145 lề ngang 12px (title/search/filter/avatar/time), mép bong bóng 6px; ô Search 44px và input font16; filter/chip–hàng liên hệ spacing, avatar40px, contact row60px, danh bạ scroll restoration, header Top/Composer, Work/desktop >=1024px, hỗ trợ safe areas portrait/landscape, keyboard/gesture và cập nhật tin realtime. Mobile directory vẫn là overlay thuộc route Trò chuyện; chỉ thay dọc khi `data-mobile-directory=true`.
- **Kiểm tra:** source CSS test phải chứng minh scope active mobile, root top có safe-area + min12/trim16, header bottom0, body top0, không chạm fixed `#shellNavigationLayer`/scroll. Chạy Verify V21 + Pages, kiểm trực quan iPhone Safari/PWA; đo khoảng thực tế sau khi có đúng build. E4 thiết bị và E5 chấp nhận tách biệt CI.
- **PWA shell (theo UI-146):** vì `sw.js` giữ HTML offline trong cache theo epoch, sau khi sửa CSS trong shell phải đổi riêng `SHELL_CACHE_EPOCH:ui146→ui147` để PWA không tiếp tục khởi chạy HTML cũ; **giữ nguyên cache tin nhắn/IndexedDB, Push, offline-first, Safe Reload**. Không thêm request/RPC/polling; nâng epoch chỉ xoá shell phiên bản trước theo cơ chế Service Worker sẵn có.
- **Tài nguyên/rollback:** không tăng RPC/Edge/Realtime/DB/call, không xóa lịch sử hoặc ép PWA refresh khi đang nhập. Rollback riêng CSS/tokens/tests/SW epoch và build lại index/version theo canonical.

## 3g. UI-148 — Viewer ảnh mở từ chat phải duyệt được ảnh gần đó (2026-10-13)

- **Lỗi gốc:** viewer đã có tập `collectConversationImageAssets()`, nút trái/phải, vuốt ngang, bàn phím ←/→, dải thumbnail, nhưng `openImageViewer()` tự chọn `imageViewerFilter='album'` nếu ảnh thuộc một message. Khi message chỉ có 1 ảnh, mặc định `Ảnh 1 / 1` và các thao tác chuyển ảnh bị khóa; không phải vì cuộc chat chỉ có 1 ảnh.
- **Rule mặc định:** mở BẤT KỲ ảnh đã gửi/nhận (ảnh đơn hay album), filter mặc định **`all` = tất cả ảnh đã hiện diện trong message store của đúng cuộc trò chuyện đang mở**, cùng thứ tự lịch sử message (cũ→mới, gallery theo sort_index/canonical order). Chọn đúng `assetId` đã chạm; ←/→ hoặc nút trước/sau, swipe trên mobile/PWA, dải thumbnail và `Ảnh i / N` vận hành trên cùng một danh sách. Không wrap từ ảnh cuối về ảnh đầu; hai đầu khóa đúng.
- **Bộ lọc thủ công:** `Tất cả` / `A` (mình gửi) / `B` (người khác gửi) / `Album hiện tại` vẫn giữ nguyên; album chỉ giới hạn ảnh trong **cùng một message** sau khi người dùng tự chọn. Không để album 1 ảnh tự chiếm filter khi mở, không chuyển sang liên hệ khác. Nếu tập chỉ có một ảnh thật sự thì viewer vẫn là `1 / 1`; không dựng ảnh giả.
- **Hiệu năng, chủ dữ liệu:** reuse `store.items` đã có và các descriptor/cache đang chạy; **không query thêm các cuộc hội thoại, không full-history fetch/scan DB, không RPC/Realtime/subscription/timer mới** chỉ để làm bộ sưu tập. Nếu lịch sử trước đó chưa tải vào message store, không giả là đã có; người dùng tải lịch sử qua luồng scroll hiện hữu, mở lại viewer sẽ thấy phần đã tải. Thumbnails hydrate lười và prefetch 2 ảnh cạnh bên theo behavior hiện có; cấm tải toàn bộ ảnh/Blob cùng lúc.
- **Tương tác:** đóng Viewer trả về vùng đọc cũ; đổi ảnh reset zoom/pan theo owner sẵn có; viewer global overlay/safe area/PWA desktop giữ nguyên, không mở trang web ngoài, không sửa ảnh/tỷ lệ/định hướng, không tự chia sẻ album khi nhấn chia sẻ 1 ảnh; không lấy ảnh từ chat khác hoặc draft hiện hành.
- **Kiểm thử:** test first-open image đơn giữa 3 message ảnh ⇒ `Ảnh 2/3`; cả album 2+ và ảnh đơn lân cận ⇒ `N` chung, album chip thu hẹp khi người dùng bấm; filter A/B; lệnh next/prev/swipe/keyboard dùng cùng index; 1 ảnh thực ⇒ 1/1; đổi liên hệ ⇒ viewer đóng, không rò rỉ. Verify V21 và GitHub Pages trước khi xác nhận phát hành. E4 iPhone thật/E5 phản hồi người dùng tách biệt CI.
- **Rollback:** revert riêng `app.js` logic default filter (và test); rebuild canonical `index.html/version.json` và bump PWA shell epoch để thiết bị nhận CSS/JS mới. Không chạm backend/IndexedDB.

## 3h. WORK-149 — Xóa nội dung Công việc cũ khi AI chưa cấu hình (2026-10-13)

- **Yêu cầu:** xóa sạch các dòng hàng gợi ý/đã gạch trong thẻ Công việc, giữ nguyên tab và điều hướng Trò chuyện/Công việc; không xóa bản ghi đơn hàng, báo giá, công nợ, danh bạ, tin nhắn hay media. Dữ liệu Công việc đến từ RPC `chat_customer_summary_work_feed`, đọc `chat_customer_summary_state.last_result` + `chat_customer_summary_completion`, **không** đọc từ `taphoa_orders` hay `v21_messages` để hiển thị trực tiếp.
- **E0 căn cứ nguồn (Supabase chat-bh-get `vtqhbhrkdxirqeqkgylo`):** 32 state (25 từng scan), 17 có item, 215 đánh dấu hoàn thành trên 13 khách; 713 run AI cuối 2026-10-04. Config `chat_customer_summary_runtime_config()` có scan_key nhưng **Gemini key trống**; `chat_customer_summary_scan_enqueue_http()` có guard không enqueue nếu thiếu Gemini. Không báo AI hoạt động hoặc tự sinh lại nội dung khi chưa cấu hình.
- **Phạm vi xóa transaction:** giữ 32 trạng thái/cursor và 713 run cũ làm chứng cứ/debug, *xóa nội dung* `last_result` bằng `{items:[],notes:[],totalLines:0,totals:[]}`, đặt `last_scanned_at=NULL` để RPC không trả dữ liệu cũ, xóa `last_error` và claim cũ; `processed_version=dirty_version` để bỏ hàng đợi cũ không tự dispatch. Xóa 215 dòng `chat_customer_summary_completion` để không còn dấu hoàn thành lỗi thời. **Chỉ hai table Work**; không truncate DB, xóa run log hay gọi RPC để re-scan lịch sử.
- **UI owner:** `work-customer-summary.js::renderCurrent` khi `rowsCache=[]` phải render overview trống, không giữ detail khách đã chọn; `refresh` realtime/visible dùng luồng sẵn có, không tạo polling/subscription thêm. Work vẫn mở được; trạng thái trống rõ ràng. Dữ liệu mới nếu hệ thống AI được cấu hình lại về sau mới có thể được sinh ra từ luồng mới; không tự bật Gemini.
- **Rule hiệu năng/bảo vệ:** Không xóa `chat_order_drafts`, `chat_ai_scan_*`, `chat_ai_message_inbox`, `chat_customer_care_daily`, `v21_*`, `taphoa_*`; không thay RLS/trigger/scheduler. Snapshot counts và rollback dựa trên 713 historical runs (không hứa khôi phục hoàn toàn 215 completion đã chủ động xóa). Thực thi một SQL transaction, xác minh `last_scanned_at`/visible items bằng read-only SQL, Verify & Deploy sau UI change, kiểm thiết bị thật E4 riêng.
- **Không giả lập refresh:** chỉ kết luận server clean khi SQL xác nhận, UI deployed khi CI/PAGES báo success, PWA client phải nhận build mới trước nghiệm thu.

## 3i. UI-150 — Copy / Tải / Chia sẻ Text & Media sau khi chuẩn hóa lề chat (2026-10-13)

- **Rule trước code**: sau UI-143/144/145/146/147, tin nhận neo trái và tin gửi neo phải (message rail6px), Composer/control rail12px; thanh hành động cũ vẫn `left/right:100%`, gap6px, nút 32×32 hoặc 40×32 trên touch. **Vùng bấm 32px cao là thiếu so với hitbox44**; thanh 4–5 nút bên ngoài bong bóng dễ vượt mép và che/mất trên mobile. Mỗi hành động phải hợp lệ theo **content**, không theo vị trí, nguồn Zalo, tuổi tin hay màu bong bóng.
- **Một command matrix — ưu tiên Copy & Tải**:
  - Tin chỉ chữ: **Sao chép** đúng raw text (emoji/link xuống dòng giữ nguyên), **Trả lời** khi đủ điều kiện, **Chuyển tiếp trong Chat** khi đủ quyền; **Chia sẻ** text bằng native Web Share chỉ khi hỗ trợ.
  - Tin ảnh đơn/album hoặc tệp: **Tải xuống** ảnh/tệp gốc từ cache/sync asset có scope account; album lưu lần lượt các item hiện có và không tự tải media từ chat khác; **Chuyển tiếp trong Chat** qua canonical recipient picker; **Chia sẻ** ra ứng dụng khác bằng file native khi Web Share files/canShare được hỗ trợ. Tin có thêm chú thích chữ vẫn **có Sao chép phần chữ**, không copy nhầm nhị phân hoặc bỏ caption.
  - Tin âm thanh (file kind audio): thuộc nhóm **media**, có Tải xuống và Chia sẻ qua native nếu hỗ trợ; dùng đúng tên và MIME/extension audio, không đặt tên `Anh-*.bin` hoặc coi âm thanh như text. Nếu thiết bị không có native file-share thì ẩn action này, **không** vô hiệu Tải/Chuyển tiếp.
  - **Không tự làm giả thành công**: copy chỉ hiển thị `Đã sao chép` khi Clipboard API hoặc fallback `execCommand` thành công; native share phải gọi trong user activation, không `await` tải Blob trước `navigator.share`; nếu media chưa ready thì giữ UI và nạp lazy đúng cache hiện hữu, không nhảy web ngoài hoặc báo 'sẵn sàng' thay thao tác chia sẻ. Đóng menu khi hành động thực sự được kích hoạt, tránh unhandled rejection.
- **Một action owner:** `app.js::createActionGroup` và các helper copy/save/share; `index.source.html` là nguồn CSS. Desktop fine pointer giữ side rail `outside` theo sender; touch/PWA dùng **toolbar nổi ngay trên hoặc dưới bong bóng**, neo đúng mép sender và nằm trong viewport/safe-area, không đổi vị trí/cuộn của bong bóng. Nút chạm **44×44px**, glyph ~18–20px, gap4px; state disabled/ready không nhảy kích thước. Nút `Trả lời/Chuyển tiếp/Sao chép/Tải xuống/Chia sẻ` có nhãn độc nhất, icon theo UI Foundation, Tab/focus/Escape/outside-tap/longpress hoạt động.
- **Tách rõ:** `Chuyển tiếp` = trong Chat, dùng V21MessageForward; `Chia sẻ` = native OS sheet khi có; `Tải xuống` = tạo file Blob từ đúng asset, `Sao chép` = text raw. Viewer ảnh thao tác **trên đúng ảnh đang chọn** theo UI-148; không chuyển tiếp cả album ngầm. Không ép native share là link nếu app không hỗ trợ files.
- **Không thay đổi owner dữ liệu/tài nguyên:** không sửa media Storage/RPC/schema/Zalo realtime, không lặp đồng thời 2 tải Blob, không full-history scan, không thêm polling/log/cron, không mất cache/offline, không dùng negative margin để bù mép. Chỉ tính position khi mở thanh action; đóng khi scroll/contact switch, không ép render/reflow message.
- **Kiểm thử/điều kiện:** desktop incoming/outgoing outer rail mirror; mobile width320/375/390/430 + iPhone safe area/keyboard: toolbar vẫn ở màn, không đè lên Composer; copy text-only và mixed media, download ảnh/gallery/file/audio, share text/native files, fallback unsupported and cancellation, same account only; mở menu longpress, ESC/scroll đóng; Viewer save/share một asset; Verify V21 + Deploy Pages; **E4 thực tế Web/PWA và E5 người dùng nghiệm thu riêng**, CI không chứng minh iPhone đã cập nhật.

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

