# CHAT NEXT · Thiết kế lại TAPHOA Chat · 2026-11-18

**Trạng thái:** design proposal / E0–E1. **Không tự động áp dụng cho production.** Nhánh `design/chat-next-ux-20261118` tách từ `main`. Các UI run-time hiện hữu, tin nhắn, Supabase, Zalo, ngân hàng, push và các tính năng đã gửi không đổi.

## 1. Mục đích sản phẩm

Chat TAPHOA phải có cảm giác như một ứng dụng chat thực sự. Tách rõ:
- **Trò chuyện**: liên hệ, nhóm, nhắn tin, media, trả lời, gọi và tìm kiếm.
- **Công việc**: đơn hàng, phiếu lấy hàng, báo giá, chuyển khoản, đối soát và các tác vụ liên quan đến cùng khách hàng.
- Không nhét bảng dữ liệu, menu nghiệp vụ và các hành động ít dùng lên vùng hội thoại chính. Không hiển thị nhãn “đang gửi” khiến message reflow, giữ state thật.
- Khi nhận tin đặt hàng, có thể có lớp tóm tắt/nhóm nội dung **chỉ đọc**, vẫn xem được nguyên văn, không tự suy diễn số lượng hay sửa nội dung gốc.

## 2. Tham chiếu cạnh tranh, không sao chép

| Sản phẩm | Giữ lại nguyên tắc | Không nên sao chép |
|---|---|---|
| WhatsApp | Inbox trực diện; bộ lọc trên danh sách; thao tác gửi/media quen thuộc; điều hướng ổn định | Nhiều tab không liên quan bán hàng |
| Telegram | Folder/lọc, tìm kiếm mạnh, ghim, dễ làm việc với nhiều cuộc hội thoại | Quá nhiều nút/tuỳ biến trên màn hẹp |
| Apple Messages/iMessage | Bong bóng tin tiết chế, transition tự nhiên, nhập liệu/ảnh dễ dùng | Phụ thuộc gesture ẩn, không phù hợp web/PWA mọi thiết bị |
| Signal | Trật tự thị giác, tương phản, ưu tiên riêng tư | Đưa các biểu tượng bảo mật giả vào UI chưa có bằng chứng |
| Slack | Chia context chat và công việc, hành động có ngữ cảnh, activity không làm nhiễu | Biến inbox cá nhân thành dashboard doanh nghiệp nặng |
| ChatGPT | Ô nhập có auto-grow, icon đều, định dạng nội dung dài rõ ràng | Sao chép toàn bộ UI AI hoặc biến chat thành prompt box |

Nguồn kiểm chứng: WhatsApp https://www.meta.com/design-at-meta/blog/whatsapp-user-interface-update/ ; Telegram https://telegram.org/faq ; Apple https://developer.apple.com/design/human-interface-guidelines/layout ; Signal https://support.signal.org/ ; Slack https://slack.com/blog/news/slack-feature-drop-june2026 .

## 3. Đánh giá mã nguồn hiện tại (bằng chứng E0)

- `README.md` ghi mobile **một cột**, desktop **ba cột**; `shell.js` sở hữu navigation/profile, `app.js` sở hữu messages + composer, `ui-icons.js` là icon chủ sở hữu. Không được phá runtime owner.
- `index.source.html` tải nhiều bộ CSS tham chiếu ChatGPT cùng `ui-foundation.css`, `mobile-chat-refresh.css`, các CSS tính năng. `mobile-ui-polish.css` chứa nhiều selector `!important`, là dấu hiệu cần hợp nhất ưu tiên CSS; chưa đủ chứng cứ để kết luận mọi màn đang lỗi.
- `CURRENT_WORK.md` đã ghi tồn tại formatter tin khách `incoming-message-layout.js` chỉ đọc và lựa chọn “Xem tin nguyên văn”; phải duy trì.
- `README_MAINTENANCE.md` có chuẩn media F-133…F-137 và UI-144 cho composer; không nhân bản một chuẩn ảnh/keyboard mới.
- Chưa có kết quả nghiệm thu Safari iPhone, Android Chrome hay Web desktop trực tiếp trong đợt thiết kế này. Không tuyên bố E4/E5 PASS.

## 4. Kiến trúc màn hình đề xuất

### 4.1 Mobile: inbox / conversation / work

**Màn Inbox**
- Header: **Tin nhắn** (trái), tìm kiếm và menu ở phải; không có logo/hàng tiêu đề dư.
- Tìm kiếm riêng một hàng, bộ lọc `Tất cả · Chưa đọc · Nhóm · Công việc` (chip có thể cuộn ngang, không wrap).
- Item: avatar **44px**, tên một dòng, thời gian một cột riêng bên phải (**56–68px**), preview tối đa **2 dòng**, unread badge nếu có; row cao động, không để preview đè thời gian.
- Chạm item mở conversation full width. Bottom navigation chỉ ở màn danh sách/root, không chiếm chỗ của composer trong hội thoại.

**Màn Conversation**
- Header: Back 44×44; avatar 38–40; tên và trạng thái thực tế; nút gọi 44; menu 44. Mọi hành động khác ở detail menu.
- Timeline là **scroll owner duy nhất**; message theo ngày, tin mình phải/tin khách trái, timestamp nhỏ ở cuối nội dung, visual send state không đổi chiều cao.
- Hiển thị tên người gửi có ngữ cảnh nhóm; media theo F-133…137; ảnh xem full viewer; forward/share/copy/rotate không chồng keyboard.
- Composer: nút `+` 44, input min-height 44, font ít nhất 16px, auto-grow đến tối đa 5 dòng rồi cuộn nội bộ; khi trống hiển thị Mic, khi có nội dung hiển thị Send. Một khung sở hữu lề và safe area; không dùng negative margin/JS keyboard polling.
- Nút `Công việc` trong header/detail mở sheet có ngữ cảnh liên hệ; đóng sheet trở lại đúng scroll + draft.

**Màn Công việc**
- Entry `Công việc` độc lập tại root: tập trung `Cần xử lý / Đơn hàng / Thanh toán / Báo giá / Phiếu nhập`.
- Mỗi tác vụ là card rõ trạng thái/owner, không mô phỏng tin nhắn khách; action tài chính phải có confirm & phân quyền thật.
- Chỉ thao tác với dữ liệu thực khi nối chính thức. Đầu tiên mock bằng dữ liệu giả và không gửi/thu/gọi thật.

### 4.2 Desktop, tablet
- Desktop `>=1024px`: rail 64px + inbox 300–340px + thread linh hoạt + context pane 280–320px **khi đủ rộng**. Theo repo hiện hành ba-column => context chỉ hiển thị khi không cắt thread.
- Tablet: inbox + conversation (2 pane) khi đủ chỗ; mobile single pane. Không thu nhỏ desktop UI vào màn mobile.
- Khi sheet/modal mở cần acquire/release từ `V21InteractionController`; back/escape và focus phục hồi.

## 5. Design tokens V1

| Nhóm | Đề xuất |
|---|---|
| Primary | `#0F766E` (teal xanh vừa), dùng cho selected và action chính, không phủ toàn nền |
| Canvas | `#F8FAFB`, card `#FFFFFF` |
| Text chính/phụ | `#17212B` / `#65717E` |
| Neutral border | `#E6EAEE` 1px, chỉ khi cần phân vùng |
| Outgoing bubble | `#DCF3EB`, chữ `#16372D`; incoming `#FFFFFF` |
| Semantic | lỗi `#B42318`, cảnh báo `#946200`; semantic không phụ thuộc chỉ màu |
| Spacing | hệ 4/8/12/16/24, căn 1 baseline; icon 20–22 trong target 44 |
| Radius | row/card 12–16, bubble 15–18, composer pill 20–24 |
| Typography | system UI, input 16px; metadata 12–13px; body 15–16px, line-height 1.45 |
| Motion | 120–200ms; hỗ trợ `prefers-reduced-motion` |

Các con số là **mục tiêu thiết kế**, không phải kết quả đo app hiện tại. Ưu tiên contrast tối thiểu WCAG AA với font thường, hit area tối thiểu 44×44 theo mobile target.

## 6. Thứ tự triển khai, không viết chồng CSS

1. **Design system và layout contract**: xác định owner selector; loại rule trùng sau khi có screenshot diff; dùng các token đang tồn tại trong `ui-foundation.css`, không tạo `!important` mới.
2. **Inbox + root navigation** trong `shell.js`/CSS owner, không sửa message sync.
3. **Conversation header + message rhythm** trong owner shell/app; giữ message virtualization, anchor, read-state và F-133..137.
4. **Composer + keyboard lifecycle** giữ keyboard owner hiện hữu, không tự dựng observer/interval mới.
5. **Work contextual sheet** tái dùng business APIs, tuyệt đối không tạo transport mới hay auto-send.
6. **Unified desktop adaptive panes**, dark mode, accessibility.

**Chiến lược phát hành:** thiết kế trên nhánh, preview screenshot ở width 320/360/375/390/430/768/1024/1440, test offline/component và CI; deploy candidate có thể tắt qua flag; nghiệm thu E4 thiết bị thật trước khi merge `main`. Không tự deploy production, không xoá cache/data riêng, không sửa DB.

## 7. Điều kiện nghiệm thu E0–E5

- **E0**: ảnh before của inbox, thread, composer, keyboard, Work (Safari/PWA/Android/Desktop) + đo điểm lỗi.
- **E1**: chủ sở hữu layout rõ, token/hierarchy đóng băng, không có overlay chồng màn/chiều cao ảo.
- **E2**: component / visual diff / tests cho 320–1440, font scale, focus, back, long preview, media, no-scroll-jitter.
- **E3**: Verify V21 + Pages candidate/CI xanh (không lấy CI làm bằng chứng PWA).
- **E4**: trực tiếp iPhone Safari/PWA, Android Chrome/PWA, desktop; keyboard mở đóng, 2 dòng, input dài, share/forward, zoom ảnh, gọi, realtime, offline/reconnect; **không gửi tin hay giao dịch thử đến khách thật**.
- **E5**: người dùng duyệt visual + đo tải; không tăng RPC/log/poll; rollback chính xác UI patch về main last-known-good.

## 8. Những điều không được đụng khi redesign

- Supabase là canonical message/account/read-state; LiveKit chỉ transport cuộc gọi; Zalo bridge riêng; không sync hai chiều mới.
- Không chỉnh luồng ngân hàng/tự thu/đơn đã giao/nghiệp vụ vào cùng một PR giao diện.
- Không sửa nội dung gốc khách gửi; tóm tắt/AI chỉ gợi ý, người dùng duyệt rồi mới gửi.
- Không gán nhãn delivered/read giả; không làm mất tin cũ, draft, scroll anchor, cache offline, read state.
- Không triển khai Production bởi việc tạo nhánh hoặc tài liệu này.

**Điểm quyết định:** Trò chuyện là sản phẩm chính, Công việc là context; giao diện ít hành động hơn nhưng truy cập nghiệp vụ vẫn nhanh.