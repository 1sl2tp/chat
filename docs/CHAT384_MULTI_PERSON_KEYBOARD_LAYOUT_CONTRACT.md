# CHAT-384 — Kiến trúc Chat nhiều người + bàn phím + Composer
**Ngày:** 2026-11-18 · **Trạng thái:** ĐẶC TẢ THIẾT KẾ/NGHIÊN CỨU, **CHƯA TRIỂN KHAI CODE**  
**Phạm vi:** Web Chrome/Safari, iOS PWA, Android PWA; cùng một hệ thống Chat/Supabase.  
**Nguyên tắc:** ChatGPT là tham khảo về độ nhẹ và tính linh hoạt của Composer, **không** sao chép mô hình một hội thoại vào sản phẩm đa khách hàng.

## 0. Bài toán đúng
Admin đọc nhiều khách (Zalo → Render → Supabase → Chat Web/PWA). Tin nhắn, media, danh bạ và nghiệp vụ đã có. Yêu cầu mới là giảm chi phí nhận thức / số thao tác / rung giật và giữ đúng khách, đúng tin, đúng nháp kể cả lúc iOS mở bàn phím.

Không xây mới Chat; không thêm request/polling; không đụng production DB/Zalo/thu tiền/media. Không sửa CSS chồng lên CSS cũ.

## 1. Bằng chứng mã nguồn đang có
- \`app.js\`: \`KeyboardInsetAdapter\` dùng \`visualViewport.height+offsetTop\`, \`publishComposerHeight\` có riêng scroll reserve; \`autoGrow\` mở rộng Composer khi \`natural > 43\` (**từ dòng 2**) và cho textarea cao \`min(168px, 35% visible viewport)\` trên mobile.
- \`mobile-chat-refresh.css\`: khi \`data-editor-expanded=true\` chuyển editor sang hàng riêng, nhóm nút xuống hàng 4. Đây là thay đổi hình học lớn ngay từ lúc dòng 2 xuất hiện.
- \`mobile-ui-polish.css\`: \`#chatQuickActions\` còn một hàng thao tác nghiệp vụ cao xấp xỉ 52px; ảnh/tìm kiếm xuất hiện ở hơn một nơi (top tab, quick toolbar, menu); trùng chức năng chứ không phải trùng dữ liệu.
- \`app.js::ComposerDraftOwner\`: đã có bản nháp riêng theo account+conversation/contact, có chuyển từ contact key sang canonical conversation key và dừng recording khi đổi khách; lưu **trong RAM** (không tuyên bố an toàn trước mọi lần reload).
- \`shell.js\`: có owner chọn khách/danh bạ, lưu đường điều hướng và restore directory scroll anchor.
- \`index.source.html\`, \`mobile-chat-refresh.css\`, \`mobile-ui-polish.css\`: cùng tác động đến header, message & composer. Cần lập ma trận selector và xóa predecessor ngay trong cùng PR; không thêm stylesheet vá thứ tư.
- MDN/WebKit xác nhận bàn phím có thể chỉ thu hẹp *visual viewport*, không thu hẹp *layout viewport*. iOS Safari còn có tình huống offset/resize đến muộn hoặc không reset chính xác. Không coi \`100vh\` hoặc \`fixed bottom:0\` là nguồn hình học đúng duy nhất.
  - https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
  - https://bugs.webkit.org/show_bug.cgi?id=265578
  - https://developer.apple.com/forums/thread/800125

## 2. Mô hình kiến trúc chuẩn
**Viewport state:** \`DIRECTORY | THREAD\` × \`KEYBOARD_CLOSED | KEYBOARD_OPEN\` × \`COMPACT | EXPANDED\`.  
**Chủ sở hữu:** 
- Shell/Navigation: contactId, route, sheet/directory open state; **không** can thiệp scroll tin nhắn.
- ComposerDraftOwner: accountId, contactId/conversationId, text, attachments, reply; không thay thế bằng bản nháp dùng chung.
- KeyboardViewport: *một* snapshot \`top,height,bottom,occlusion,settled\`, phân biệt \`opening/open/closing/closed\`; chỉ Composer placement dùng để đặt trên OSK.
- Message ScrollRoot: *một* nơi được quyền ghi \`scrollTop\`, phân biệt \`FOLLOW_TAIL\` và \`USER_AWAY\`.
- Directory ScrollRoot: giữ list anchor và vị trí đã đọc; không scroll theo composer hoặc phím.
- Header/QuickActions: chỉ hiển thị theo state, không có bố cục độc lập đè sang nhau.

**DOM trục chính:** Header + MessageViewport + Composer, cùng một cây DOM cho rộng/hẹp. Desktop mở thêm directory *sibling* (không tạo Thread thứ hai). Các menu/sheet ở overlay root.

## 3. Vùng được phép hiển thị (điều gì KHÔNG cần thì bỏ)
| Vùng | Được giữ ở trạng thái thường | Không hiện thường trực |
|---|---|---|
| DIRECTORY | Điều hướng, Trò chuyện/Công việc, ô tìm, Tất cả/Chưa đọc, danh sách | Composer và thanh thao tác theo khách |
| THREAD HEADER | Quay lại, avatar+tên khách, tối đa 1 hành động ưu tiên và menu \`…\` | Tab Ảnh lặp, nút sửa hồ sơ riêng, hai nút điện thoại giống nhau |
| MESSAGE | Text, ảnh/media, ngày/giờ, trạng thái gửi, nút về tin mới *khi cần* | Bảng công nợ, hàng bốn nút thao tác nghiệp vụ |
| COMPOSER | \`+\`, textarea, nút hành động theo ngữ cảnh (Send khi có chữ/media, Mic khi trống) | Nút send và mic đều lớn thường trực nếu chiếm diện tích không cần thiết |
| OVERFLOW/TOOLS | Media đã chia sẻ, tìm trong tin, chi tiết khách, gọi, công nợ, thu tiền, tác vụ phụ | Không chiếm hàng cố định thứ hai trong màn chat |
| WORK | Quy trình nghiệp vụ riêng theo route; giữ feature hiện có | Không nhân đôi các nút Work bên trên từng tin nhắn |

Chú ý an toàn: \`Thu tiền\` và \`Công nợ\` **chỉ chuyển vị trí UI** sau khi đã kiểm thử hành vi/cấp quyền/idempotency; không xóa handler hoặc tác động giao dịch.

## 4. Hình học dự kiến theo trạng thái
Đây là *mục tiêu thiết kế để kiểm chứng trên thiết bị*, chưa phải số đo live.

| Trạng thái | Header | Composer | Vùng Messages |
|---|---|---|---|
| Danh bạ, không bàn phím | 52–56px top rail; tìm kiếm + filter thành vùng danh bạ riêng | Ẩn | Danh sách tự cuộn, không bị ảnh hưởng bởi bàn phím hội thoại |
| Danh bạ, đang gõ tìm kiếm | Top rail nhỏ gọn; ô tìm luôn nhìn thấy | Ẩn | Danh sách còn lại trên bàn phím, kết quả cuộn độc lập |
| Chat, keyboard đóng, 1 dòng | 52–56px | 52–60px, một hàng | Phần còn lại |
| Chat, keyboard mở, 1 dòng | 48–52px | 52–60px, nằm sát **visual viewport** trên bàn phím | Phần còn lại; không che dưới composer |
| Chat, 2 dòng | Header không đổi | Textarea cao ~64px, **chưa đổi sang layout hai tầng**, nút vẫn ở vị trí ổn định | Co theo phần tăng tự nhiên ~24px |
| Chat, >=3 dòng | Header không đổi | Textarea full-width một hàng, action rail 44px bên dưới; chỉ tăng chiều cao phần văn bản | Nội dung còn đủ đọc; tránh Composer nuốt hết view |
| Chat, ảnh đính kèm hoặc reply | Header không đổi | Preview gọn phía trên input, phần dư có cuộn/ngắt thay vì đẩy cả MessageViewport đi | Tối thiểu một vùng tin hữu ích |
| Chat, đang ghi âm/gọi | Header theo call state | Chuyển sang chế độ tác vụ âm thanh đúng một owner | Không thay người nhận nếu không xác nhận |

**Quy tắc kích thước, đặt trên đo thực tế \`V=visualViewport.height\`:**
- \`H\`: chiều cao header đo thực.
- \`C\`: chiều cao Composer thực (kể cả preview/reply/action rail).
- \`M = V - H - C - g\`: chiều cao đọc tin còn lại; \`g\` là khoảng an toàn mỏng, không cộng safe-area hai lần.
- Ưu tiên \`M >= max(144px, 40%*V)\` trên viewport thông thường; nếu V cực nhỏ/landscape thì giảm editor preview/action trước, giữ tối thiểu viewport có thể đọc; tuyệt đối không khẳng định pixel cứng cho mọi iPhone.
- Mức editor mobile đề xuất: 1 dòng ~40px, 2 dòng ~64px, từ 3 dòng editor full-width và action rail 44px; tối đa 4–5 dòng nhìn thấy nếu V cho phép, sau đó **scroll trong textarea**.
- Không dùng \`35%*V\` như cap editor độc lập: composer total phải được đo và ràng buộc bởi min message area.
- Các icon luôn có *hit target* >=44px kể cả khi bề ngoài thu nhỏ; chỉ một đường focus/keyboard owner.
- Thay đổi từ compact sang expanded có **hysteresis**: mở khi >=3 dòng, không tự co vì emoji, dấu câu, IME, thay đổi wrap trong cùng một draft; co sau khi xóa đủ nội dung hoặc người dùng chủ động thay mode. Không để width reflow đảo trạng thái mỗi frame.

## 5. Chuyển khách A → B trong lúc bàn phím đang mở
Luồng duy nhất:
1. \`A\` hiện với keyboard; người dùng bấm danh bạ (1 thao tác, **không** bắt bấm lần 1 để tắt bàn phím rồi lần 2 mới mở danh bạ).
2. Lưu draft A và scroll state A đúng owner; dừng/đóng chế độ gắn với A nếu có; cập nhật route/directory đồng bộ. Không xoá text A.
3. Khép keyboard rồi trình bày directory; ô tìm danh bạ không tự focus nếu chưa bấm tìm; trả lại list anchor cũ. Không mở toolbar chat B dưới directory.
4. Chạm B một lần: header chuyển B; hiển thị cache RAM hoặc canonical server **đúng B**, giữ khung an toàn khi hydrate; không flash nội dung A.
5. Khôi phục draft B đúng context, **không** tự bật bàn phím (trừ explicit user intent). Scroll B đúng vị trí đọc; nếu mở từ push, ưu tiên tin được trỏ tới.
6. B quay về A: draft A và vị trí A không bị ghi đè. Chuyển khách liên tiếp dùng epoch guard, bất kỳ RPC/cache/media đến muộn của A không được vẽ lên B.

**Push:** target \`account+conversation+message\` xác minh ở nguồn canonical; click push chủ động tới đúng khách/tin và ẩn giao diện cũ cho tới khi mount. Nếu push chỉ có contactId chưa xác minh thì chờ directory; không đoán từ tên. Tin mở trực tiếp từ push có quyền về latest/target; tin đến realtime lúc user đang đọc lịch sử *không* tự kéo xuống cuối.

## 6. Bàn phím, zoom, media và overlay
- Có state machine \`CLOSED/OPENING/OPEN/CLOSING\`, không dùng cờ focus đơn độc làm chứng cứ keyboard visible.
- Chỉ tính from visual viewport khi số đo ổn định; dùng \`requestAnimationFrame\` đồng bộ, guard thế hệ transition; khi Safari báo offsetTop bất thường sau dismiss phải phục hồi sticky state.
- Composer nằm trên bàn phím, không có khe trắng/đè thanh navigation; không cộng keyboard inset + safe area + composer height hai lần.
- Sau resize media/ảnh, người dùng ở \`USER_AWAY\` thì khôi phục anchor; ở \`FOLLOW_TAIL\` thì theo đuôi đúng một writer.
- Overlay menu có mục tiêu mở, đóng và focus-return rõ ràng; popup/attachment nguồn iOS không đè ô nhập hoặc mở nhầm cuộc chat.
- Khi bàn phím mở, ẩn hàng nghiệp vụ/tabs thừa trước khi giảm Messages; nếu chạm \`+\` mở sheet phải kiểm soát focus, không ép đóng/mở keyboard liên tục.
- Search danh bạ trong trạng thái DIRECTORY có scroll owner riêng; không dùng body scroll; virtual list scroll anchor vẫn giữ.

## 7. Kiểm thử bắt buộc trước CSS refactor hoặc merge
Ma trận thiết bị: iPhone Safari Web, iPhone PWA, Android Chrome Web/PWA, Desktop Chrome; rộng <360/390/430/768/1024/1440 CSS px; portrait/landscape; keyboard closed/opening/open/closing; đã login và vừa resume.
- 0/1/2/3/4/8 dòng, paste rất dài, Unicode/IME tiếng Việt, auto-correct dấu câu, xóa text; **mỗi dòng chỉ tăng vùng text tương ứng**, không rung/đảo mode ngoài quy tắc.
- A→directory→B→A khi A có nháp 2 dòng, B có nháp 6 dòng, có attachment (chỉ nội bộ/synthetic) và tình huống đang zoom ảnh; không mất/mượn draft.
- Click push mở khi nền/foreground/cold-start; B là target, A đang soạn; không hiển thị A dưới tiêu đề B.
- Tin media tải chậm, cao thay đổi; không kéo người đang đọc cũ xuống cuối; không lọt ảnh dưới Composer.
- Mở/dismiss/reopen keyboard liên tiếp, xoay màn, Safari address bar đổi kích thước, đang ở directory search chuyển sang chat; không có khe trắng dưới footer.
- Nhấn \`+\` khi bàn phím mở, mở album/file picker, quay lại; bộ chọn không khiến người nhận đổi.
- Đo bằng timestamp: tap→đúng header, tap→tin đầu, keyboard show→Composer settled, A→B, push→đúng tin, số visual jump >2px, số stale-route flash; không đưa ra cam kết ms khi chưa có baseline thực tế.
- Regression message/read-state/outbox, permission, media, bank/cash action không đổi; **không gửi tin/thu tiền đến khách thật để test**.

## 8. Kế hoạch kỹ thuật chống vá
1. Khóa contract state + test bằng browser/harness trước, không thêm CSS.
2. Lập bảng mỗi selector về Header/Directory/Thread/Composer trên ba CSS chính; xóa predecessor ngay trong PR sửa owner. Mỗi breakpoint chỉ một nguồn điều khiển hình học.
3. Giữ \`ComposerDraftOwner\` và ScrollRoot; chuyển \`autoGrow\` sang budget-aware 1/2/3+ dòng, có hồi quy bàn phím.
4. Chuyển quick business bar sang context menu trên desktop/mobile nhưng giữ nguyên nghiệp vụ và điều kiện phân quyền.
5. Kiểm tra device/screenshot trước/sau; chỉ merge khi E0–E3 PASS, E4/E5 thiết bị thật xác minh. Không tuyên bố hoàn tất bằng CI đơn thuần.

**MUST-STAY:** Không thay API/DB/prod dữ liệu, không deploy thủ công, không đổi hash/navigation một cách không tương thích push/deep-link, không biến realtime thành polling, không bỏ bảo vệ account/conversation epoch.
