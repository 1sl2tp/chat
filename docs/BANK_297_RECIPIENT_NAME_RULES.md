# BANK-297 — Quy tắc xác minh tên người nhận BUI XUAN TUNG
Ngày xác lập: 12/11/2026. Source of truth: `1sl2tp/chat`.

## 1. Phân loại: AI thấy chữ không đồng nghĩa với xác minh người nhận
- AI chỉ điền `recipient_name` khi chữ xuất hiện trong mục **Người nhận**, **Người thụ hưởng**, hoặc **Chủ tài khoản nhận** của **cùng giao dịch**.
- Chữ **BUI XUAN TUNG** nằm ở **Người gửi**, **Nội dung chuyển tiền**, **Ghi chú**, tên file, app hoặc banner không phải tên người nhận. Nếu không thấy đúng nhãn, trả `recipient_name=null`; không sao chép tên hệ thống vào ảnh.
- Giữ nguyên nguyên văn chữ in ảnh trong `raw_read.recipient_name_printed` để tra soát; giá trị so khớp trong `receiving_name` được chuẩn hóa.

## 2. Chuẩn hóa chính xác (không fuzzy)
- Bỏ dấu tiếng Việt bằng Unicode NFD và chuyển `đ/Đ` thành `d/D`, chuyển chữ hoa, bỏ khoảng trắng đầu/cuối và gộp nhiều khoảng trắng thành một.
- Tên hợp lệ so sánh **toàn bộ chuỗi** sau chuẩn hóa phải bằng đúng `BUI XUAN TUNG`.
- **Tên thực tế in trên tài khoản Agribank 2901181999999 là `BUI XUAN TUNG` — KHÔNG DẤU.** Cách viết trên màn hình thường là `BUI XUAN TUNG` hoặc `Bui Xuan Tung`; chuẩn máy là `BUI XUAN TUNG`.
- Unicode NFD chỉ là bước kỹ thuật để không làm sai OCR khi có ký tự bất thường, **không có nghĩa được tự thêm dấu vào tên chủ tài khoản**. Trong ảnh, AI phải giữ đúng nguyên văn hiển thị, không tự sửa thành `Bùi Xuân Tùng`.
- Hợp lệ khi khớp nguyên chuỗi sau chuẩn hóa: `BUI XUAN TUNG`, `Bui Xuan Tung`, ` bui  xuan   tung `.
- Không hợp lệ nếu thấy rõ tên khác hoặc thêm/bớt/đổi thứ tự/đổi ký tự: `BUI XUAN`, `BUI XUAN THUNG`, `TUNG XUAN BUI`, `BUI XUAN TUNG A`, `BUIXUANTUNG`.
- Dấu câu khác tên là không khớp, không áp dụng OCR sửa lỗi mờ hoặc phép so chuỗi con. Nếu AI không đọc chắc tên, để `null` và dựa vào bằng chứng tài khoản/đối chiếu khác, không đoán.

## 3. Điều kiện cho phép tự thu vẫn **không thay đổi**
- Tên đúng **không đủ để chứng minh giao dịch thành công hoặc ghi thu**.
- Chỉ bill đã xác minh thành công, đọc được số tiền/ngày/giờ, tài khoản/ngân hàng nhận, không có mâu thuẫn, và có **một** thông báo tiền vào Agribank độc lập đúng STK/số tiền/phút giao dịch mới có thể tiến tới RPC.
- Bằng chứng ngân hàng là nguồn xác định **tài khoản nhận đầy đủ**; bill có thể che một phần STK, khi đó yêu cầu memo ngân hàng khớp hoàn toàn theo quy tắc QR/MB có kiểm soát.
- **Tên khác rõ ràng** → `recipient_name_conflict`, chỉ review. **Không đọc được tên** → không tự suy diễn tên, chỉ được xét tiếp khi mọi bằng chứng còn lại đủ.
- Chống trùng theo bill, notification, reference, hash, khoảng thời gian, lịch sử thu thủ công; ngày VN hiện tại, khóa giao dịch và RPC `public.chat_bank_app_collect` vẫn là chủ sở hữu duy nhất được ghi bút toán.

## 4. Vị trí mã và trạng thái phát hành
- `bill-amount-rules.mjs`: `normalizeBillRecipientName`, prompt và `readV4Fields`.
- `bill-app-preview.mjs`: dùng cùng một hàm chuẩn hóa để không mâu thuẫn ở bước nhận diện.
- `index.ts`: lưu riêng tên in nguyên văn, giữ `receiving_name` canonical cho RPC hiện tại.
- `docs/proposed-sql/BANK_297_strict_unaccent_beneficiary_name_NOT_APPLIED.sql`: **migration staged only, KHÔNG ÁP DỤNG production** trong lần sửa này. Nếu sau này quyết định phát hành thay đổi RPC để hỗ trợ receipt lịch sử có dấu, phải kiểm tra quyền service_role, toàn bộ guard và triển khai DB theo quy trình riêng. Không tự sửa DB production.
- `tests/test_bank297_recipient_name_strict_20261112.mjs`: Unicode, tên khác, người gửi/memo, đối chiếu Agribank mock, parity toàn thân RPC sau khi trừ đúng 1 điều kiện.
- Không chạy thử bằng giao dịch thật, không gửi tin khách, không thu lại các bill đã `received`.
