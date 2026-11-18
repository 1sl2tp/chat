# CHAT NEXT — QUY TẮC KIẾN TRÚC UI/UX BẮT BUỘC

**Phạm vi:** chỉ bản demo thiết kế CHAT NEXT tại `docs/chat-next/demo/` và bản xem trước Songoku. **Không kết nối** API, Supabase, dữ liệu thật, gửi tin thật, thông báo thật hay production. Mục tiêu: làm mới toàn bộ UI/UX từ kiến trúc cha-con, không sửa chắp vá.

## 0. CỔNG ĐỌC BẮT BUỘC TRƯỚC MỌI LẦN SỬA
1. Đọc **toàn bộ** `docs/chat-next/UI_UX_RULES.md` (tài liệu này), `docs/chat-next/VERSIONING.md`, `docs/chat-next/FRAME_SPEC_V14.md` và `docs/chat-next/demo/README.md`.
2. Xác định rõ hạng mục, cấp chủ sở hữu L0–L5, các thành phần con chịu tác động, breakpoint và trạng thái cần thử.
3. Kiểm tra mã hiện tại, quy tắc CSS/JS trùng hoặc mâu thuẫn; không thêm override trước khi xác định nguồn gốc.
4. Khi cần **hành vi**, tra cứu `1sl2tp/chat` nhánh `main`, xác định module và test tương ứng; **chỉ tham khảo hành vi**, không sao chép giao diện/logic nghiệp vụ hoặc kết nối dữ liệu thật.
5. Nếu thiếu bằng chứng/không kiểm tra được, ghi PENDING; không tự tuyên bố đạt.

## 1. KIẾN TRÚC CHA–CON KHÔNG ĐƯỢC PHÁ
- **L0 — Design system:** semantic color tokens, type scale, spacing scale, radii, borders, elevation, motion, breakpoints.
- **L1 — App shell:** viewport, safe-area, navigation, responsive columns, top/bottom bars, scroll owner.
- **L2 — Screen:** Inbox, Chat, Work, Settings; mỗi màn có layout contract.
- **L3 — Region:** header, toolbar, content, composer, sheets, dialogs; mỗi vùng chỉ có **một** chủ sở hữu kích thước/cuộn.
- **L4 — Component:** message, card, avatar, gallery, text field, button, tab; dùng token và ràng buộc vùng cha.
- **L5 — Detail/state:** icon, label, border, focus, hover, disabled, loading, empty, error, keyboard-open.
- Không cho con tự tính lại chiều cao viewport hoặc tự đặt trục/lề độc lập khi cha đã sở hữu.
- Khi một lỗi lặp ở nhiều con, sửa tại cha/token; không vá từng phần tử.
- Quy tắc thay đổi: **đánh giá tác động từ L0 đến L5**, kiểm thử các anh em cùng cấp và tất cả breakpoint.

## 2. CẤM CHẮP VÁ
- Cấm nối các lớp CSS override mới để chữa triệu chứng mà không gỡ/chuẩn hóa quy tắc cũ xung đột.
- Cấm hai JS handler cùng sở hữu keyboard/viewport/scroll, hai nguồn state cho một trạng thái, hoặc magic number không có token/giải thích.
- Cấm thêm timeout/polling/retry tùy tiện để che lỗi bố cục.
- Cấm dùng test chỉ kiểm chuỗi để tuyên bố đã đạt hình học/thiết bị.
- Cấm tự ý sửa production, deploy production hoặc đụng dữ liệu khách hàng.

## 3. HỢP ĐỒNG HẠNG MỤC
Trước khi sửa phải có: `Mục tiêu → Cấp cha → Thành phần con → Trạng thái → Hành vi tham khảo → Ràng buộc hình học → Thiết bị → Test → Bằng chứng`.
Mỗi hạng mục có một owner CSS, một owner JS (nếu cần), một bộ token, một điều kiện đạt. Demo được phép mô phỏng tương tác cục bộ nhưng không kết nối thật.

## 4. QUY TRÌNH MỖI VÒNG
1. **READ:** đọc quy tắc bắt buộc, xác minh mã đang chạy và nguồn tham khảo.
2. **DESIGN:** viết layout contract cấp cha và cây thành phần; xác định điều kiện nghiệm thu.
3. **IMPLEMENT:** sửa tại chủ sở hữu, xóa xung đột, đồng bộ demo và test.
4. **VERIFY:** kiểm tra tĩnh, CI, hình học ở các breakpoint, mở/đóng bàn phím, cuộn, ảnh, popup, safe-area; lỗi thì sửa tiếp **trong cùng vòng**, không tăng số để né lỗi.
5. **RELEASE:** chỉ khi tất cả kiểm thử có thể thực hiện đều đạt và CI hai repo xanh mới tăng nhãn phiên bản phát hành, đồng bộ source Songoku, merge và xác nhận Pages thành công. Thiết bị thật chưa kiểm tra thì E4/E5 vẫn PENDING; không được ghi “đạt toàn bộ”.
6. **LOG:** ghi version, tên hạng mục, cây cha-con bị tác động, rule đọc, commit, CI, Pages, E0–E5 và tồn đọng.

**Quy ước số:** một vòng thiết kế có số nội bộ để theo dõi từ đầu; chỉ công bố là phiên bản **đã đạt/đã phát hành** sau khi qua cổng VERIFY/RELEASE. Bản sửa lỗi chưa đạt giữ cùng số, không tự tăng V liên tục.

## 5. ĐIỀU KIỆN NGHIỆM THU TỐI THIỂU
- Trục ngang/dọc, khoảng cách, typography, icon, padding đúng contract trên mobile/tablet/desktop.
- Không cắt mép, tràn, che, nhảy bố cục, hai vùng tranh quyền cuộn.
- Chat: tin cuối và timestamp nhìn thấy khi bàn phím mở; người đọc tin cũ không bị tự kéo xuống; composer nhiều dòng không che tin.
- Gallery/viewer, popup, tìm kiếm, điều hướng, trạng thái tương tác nhất quán.
- Không có hành vi gửi thật/kết nối thật. CI đạt không thay thế nghiệm thu Safari iPhone.

**Nguyên tắc tối cao: sửa kiến trúc cha trước, con kế thừa; không chữa triệu chứng bằng chắp vá.**
