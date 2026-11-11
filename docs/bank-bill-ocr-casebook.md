# BANK-286 — Quy trình nhận diện bill và học từ trường hợp đã xác minh

Ngày cập nhật: 2026-11-11 (Asia/Ho_Chi_Minh). Phạm vi: `v21-bank-bill-event` của Chat; đối soát công nợ TAPHOA dùng duy nhất RPC tài chính hiện có.

## Mục tiêu

AI **chỉ đọc** nội dung ảnh: số tiền giao dịch, số tài khoản NGƯỜI NHẬN, tên/ngân hàng người nhận, ngày giờ in trên giao dịch, người gửi, nội dung chuyển và mã tham chiếu. AI không xác nhận tiền thật đã đến, không tự sửa sổ, không tự nhắn khách và không tự đổi chính sách thu.

## Trình tự

1. **Chọn đúng vùng và loại ảnh**: `app_screenshot`, `shared_receipt`, `paper_photo`, `transaction_history`, `credit_notification`, `rotated_photo`, `collage`, `unknown`. Một ảnh nhiều giao dịch chỉ chọn một khi có bằng chứng rõ, không mặc định lớn nhất/trên cùng.
2. **Đọc chữ trước, đổi định dạng sau**: giữ số tiền gốc có dấu, `transfer_date_printed_vn` và `transfer_time_printed_vn` đúng trên ảnh. Chấp nhận ngày DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, YYYY/MM/DD, «11 tháng 11 năm 2026»; giờ HH:mm, HH:mm:ss, 9h20, 9 giờ 20. Không bịa ngày, năm, giây hay lấy từ đồng hồ điện thoại, giờ Chat, giờ gửi ảnh hoặc ngày hạch toán khác ngày thực hiện.
3. **Xác thực từng trường độc lập**: phân biệt tiền chuyển với số dư/phí; tài khoản nhận với tài khoản gửi; ngân hàng nhận với logo app gửi; xác minh dấu âm chỉ thuộc tiền bên gửi; đối chiếu ngày nguyên văn với ISO, giờ nguyên văn với giờ đã chuyển đổi. Mâu thuẫn phải đưa sang review.
4. **Khớp chứng từ với Agribank**: tiền ghi có đúng tài khoản nhận, số tiền đúng, thời gian giao dịch ngân hàng (không phải lúc push đến) trong cửa sổ tài chính hiện hành, một thông báo duy nhất. Nếu tài khoản trên ảnh bị che/cắt hoặc ngày nguyên văn thiếu, bắt buộc nội dung chuyển khoản khớp đúng thông báo ngân hàng. Thực hiện kiểm tra ảnh/mã giao dịch trùng trước khi thu.
5. **Chốt trạng thái**: chỉ gọi `chat_bank_app_collect` khi đạt tất cả điều kiện và cơ chế phòng thu trùng của DB; nếu thiếu giờ, thiếu số tiền, tài khoản không rõ, mâu thuẫn, nhiều giao dịch, hoặc tiền chưa đến, giữ `review`/`amount_read` và cho Admin xác minh/thu thủ công. Không tự lấy giờ từ ngân hàng để viết lại giờ còn thiếu trên bill.
6. **Tiếp nhận trường hợp mới**: lưu `image_layout`, `recognition_case`, `missing_fields`, `uncertainty` trong `raw_read` (không làm căn cứ tài chính). Phân nhóm lỗi bằng dữ liệu không chứa danh tính, xác minh từ ảnh thực và thông báo ngân hàng/đánh giá của Admin, sau đó thêm ca kiểm thử tổng hợp được ẩn danh vào `tests/test_bank286_recognition_casebook_20261111.mjs`. Đề xuất quy tắc có kiểm chứng bằng kiểm thử, không tự chỉnh prompt/ghi công nợ dựa trên một ảnh chưa được duyệt.

## Ca hồi quy tối thiểu

- Ảnh rõ, tài khoản nhận đủ, có thời gian, bank ghi có đúng, không trùng: được đối soát; DB mới là nơi ghi thu.
- Ảnh chỉ còn 5 số tài khoản cuối hoặc thiếu dòng ngày in: buộc đối chiếu mã/nội dung ngân hàng chính xác; thông báo không duy nhất -> review.
- Bill có ngày nhưng không thấy giờ: chỉ giữ ngày và số tiền, chờ xác minh; không tự thu kể cả khi bank có khoản cùng số tiền.
- DD/MM bị AI đảo thành MM/DD: khi nguyên văn ngày và giờ nhất quán thì sửa chuẩn hóa có dấu vết; yêu cầu chứng cứ nội dung bank mạnh hơn.
- Ảnh lịch sử nhiều dòng, thiếu thứ tự; ảnh chụp lệch, ảnh ghép, bị cắt, mờ; số dư lớn hơn tiền giao dịch; tài khoản người gửi giống tài khoản nhận; bill chuyển thất bại/QR: không đoán, review hoặc non_bill.
- Thông báo Agribank đến muộn: đối chiếu lại bill V5 đã quét; tuyệt đối không tự ghi lại vào sổ nếu đã có `ledger_id` hoặc liên kết cũ.

## Triển khai và kiểm thử

- Chạy `node tests/test_bank266_bill_format_variants_20261108.mjs`, `test_bank269_bill_literal_date_clock_20261110.mjs`, `test_bank270_printed_date_ocr_correction_20261110.mjs`, `test_bank284_receipt_fields_manual_fallback_20261111.mjs`, `test_bank286_recognition_casebook_20261111.mjs`.
- Trước khi phát hành, kiểm tra đúng repo `1sl2tp/chat`, project `vtqhbhrkdxirqeqkgylo`, slug `v21-bank-bill-event` và chế độ `verify_jwt=false` như bản gốc (bản thân hàm xác thực key nội bộ). Không triển khai sang dự án khác.
- Kiểm tra phiên bản ACTIVE và chạy truy vấn **chỉ đọc** xem các bill đã thu có liên kết ledger ngân hàng đúng, các bill thiếu giờ không bị tự ghi thu. Không gửi tin khách hay chỉnh production DB để «thử học».
- `SUPABASE_ACCESS_TOKEN` là secret workflow GitHub, **không đồng nghĩa** với quyền truy cập Supabase đang có qua connector. Nếu workflow không nhận secret, không suy luận rằng tài khoản người dùng không có token. Dùng đúng kết nối được cấp phép, không công khai/chép token.

**Giới hạn:** Đây là học theo quy tắc và bộ ca hồi quy, **không** phải tự huấn luyện lại mô hình Gemini hay tự hấp thụ ảnh khách hàng. Phải có bằng chứng độc lập cho mọi thay đổi làm tăng quyền tự thu.
