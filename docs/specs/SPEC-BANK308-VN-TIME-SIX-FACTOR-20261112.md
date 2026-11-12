# BANK-308 — Quy tắc chung 6 yếu tố đối soát bill và Agribank
Ngày xác lập: 12/11/2026 · Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh (UTC+07:00)

## 1. Chuẩn ngày giờ thống nhất
- **Giao diện, thông báo, báo cáo, ngày kinh doanh, thời điểm của chứng từ:** 24 giờ theo Việt Nam, `HH:mm dd/MM/yyyy`; khi sự kiện thực sự có giây thì `HH:mm:ss dd/MM/yyyy`. Ví dụ `19:31 12/11/2026`. Không hiển thị AM/PM, không tự đảo dd và MM.
- **Cơ sở dữ liệu sự kiện tuyệt đối:** tiếp tục `timestamptz` (UTC có múi giờ). Đây là chuẩn lưu trữ, không đổi dữ liệu UTC thành chuỗi giờ Việt Nam không múi giờ vì sẽ mất nghĩa thời điểm và gây trùng/nhảy ngày. Chuyển `AT TIME ZONE 'Asia/Ho_Chi_Minh'` khi tính ngày nghiệp vụ hoặc trình bày.
- **Bill thiếu giờ:** giữ riêng `transfer_date_vn` và `transfer_time_printed_vn=null`; tuyệt đối không suy ra giờ trên bill từ `sent_at`, thời điểm Android, `received_at` hoặc thông báo ngân hàng.
- **Agribank ghi giờ đến phút:** lưu độ chính xác `minute`; dấu `:00` do kiểu timestamp của database không phải giây ngân hàng cung cấp. Phân biệt `transfer_at` (ngày/giờ ngân hàng), `posted_at` (Android phát), `received_at` (server nhận).
- **Số tiền:** lưu kiểu số nguyên VND, giao diện sử dụng `1.000.000đ`, không dùng `.000 đ` cho đơn vị nghìn và không làm tròn ở bước so khớp.

## 2. Định danh người thụ hưởng bắt buộc
- **Ngân hàng nhận:** Agribank; logo app của người chuyển là ngân hàng GỬI, không phải ngân hàng NHẬN.
- **Số tài khoản nhận đầy đủ:** `2901181999999`, hoặc phần bị che khớp đúng đầu/đuôi hiển thị; `*****99999` chỉ là bằng chứng phụ, không đủ để khẳng định một giao dịch.
- **Tên chủ tài khoản nhận thật và chuẩn máy:** `BUI XUAN TUNG` (**KHÔNG DẤU**). Cho phép chữ hoa/thường/khoảng trắng khác nhau: `Bui Xuan Tung` = `BUI XUAN TUNG`. Không tự thêm dấu, không đổi thứ tự hay suy từ tên khách.
- Tên phải xuất hiện tại vùng Người nhận/Người thụ hưởng/Chủ tài khoản NHẬN; tên ở Người gửi, Nội dung, Ghi chú không thay thế tên chủ tài khoản nhận. Tên rõ ràng khác -> dừng tự thu. Không nhìn thấy tên -> ghi `null`, không tự điền.

## 3. Ghép 6 điều kiện song song, không cộng điểm trùng nguồn
| Nhóm | Bill khách gửi (nguồn B) | Thông báo Agribank độc lập (nguồn A) | Bắt buộc/ý nghĩa |
| --- | --- | --- | --- |
| 1. Ngân hàng | Ngân hàng nhận nếu in rõ | Package `com.vnpay.Agribank3g` và tài khoản thực nhận | Bắt buộc là Agribank bên nhận; logo ngân hàng gửi không phải xung đột |
| 2. Tài khoản + chủ tài khoản | STK đầy đủ hoặc đuôi thực in + tên Người nhận `BUI XUAN TUNG` nếu có | STK nhận đầy đủ `2901181999999` | Bắt buộc STK không mâu thuẫn, tên rõ phải đúng; đuôi 99999 chỉ là bằng chứng yếu |
| 3. Tên người chuyển | Tên trong ô Người gửi | Tên người chuyển nếu có trong lời nhắn ngân hàng | Bằng chứng bổ sung; không đếm trùng với chính lời nhắn cùng nguồn |
| 4. Thời gian | Ngày và giờ thật sự trên bill | Ngày/giờ giao dịch trong Agribank, đến phút | Nếu bill có giờ: so khớp trong 60 giây; nếu thiếu: dùng đường bằng chứng mạnh riêng, không suy giờ |
| 5. Nội dung | `transfer_content` nguyên văn, kèm `transfer_reference` đúng chữ in | `Nội dung giao dịch:` trong thông báo ghi có | So khớp toàn bộ sau chuẩn hóa có kiểm soát; tên chung dạng “X chuyển tiền” không phải mã giao dịch duy nhất |
| 6. Số tiền | Số tiền giao dịch hoàn tất, không phải số dư | Số tiền ghi có dương `+...` | **Bắt buộc bằng nhau tuyệt đối**, không lấy trị tuyệt đối số dư để đối soát |

## 4. Khi bill thiếu giờ: cách xét và giới hạn tự thu
- **Không coi thiếu giờ là bill giả**: vẫn lưu ngày, số tiền, STK, tên và nội dung; trạng thái `review` nếu điều kiện ghi thu chưa đủ.
- Chỉ cân nhắc tự thu không giờ khi có **một** sự kiện ngân hàng ghi có độc lập đã xác thực, đúng tiền, đúng STK, đúng ngày VN, đúng người nhận không mâu thuẫn, nội dung chuyển tiền khớp chặt, và có **định danh giao dịch phân biệt được** ở cả hai nguồn (ví dụ reference duy nhất có trong bill và nội dung Agribank, không phải chỉ tên người gửi/một câu phổ biến).
- Phải loại trùng **theo fingerprint sự kiện ngân hàng** trên *mọi thiết bị* trước khi đếm số giao dịch. Xác minh chưa dùng ở tự thu/thủ công, chưa có bill khác hoặc ledger khác tranh chấp; xử lý khóa giao dịch chống đua đồng thời.
- Nếu chỉ có cùng `LAI VAN TAN chuyen tien` + 730.000đ + cùng ngày mà **không có mã/reference chung phân biệt giao dịch**, vẫn `review`; không tự ghi nợ/có do nguy cơ ảnh cũ/ảnh sửa hoặc hai lần chuyển thật giống nhau.
- Nếu tham chiếu mạnh + nội dung trùng và bank notice duy nhất: `reference_and_memo_verified_waiting_financial_guard` cho tới khi **RPC tài chính** được triển khai kiểm chứng và cho phép. Bộ preview hoặc AI không được phép đổi thành `received` hay tự sửa `transfer_at_vn`.
- Một sự kiện đã thu mà APK gửi lại phải hiển thị là **bản phát lại của đã thu**, không tạo thêm hàng “Chưa thu” hoặc khoản thu mới.
- Ngày ngoài ngày kinh doanh hiện tại hoặc có mâu thuẫn/thiếu bằng chứng: review, không viết ledger, không tạo Agribank notice giả.

## 5. Bài toán thực tế 12/11/2026
- Bill 730.000đ: `LAI VAN TAN`, `LAI VAN TAN chuyen tien`, ngày 12/11/2026, số tài khoản nhận đúng, **không có giờ in**. Thông báo Agribank thật lúc `19:31` có cùng số tiền/nội dung nhưng bản sao ID 274 và 280 cùng fingerprint. Tham chiếu trên bill `NAPAS_INPLIBFTI2ZK14AV` **không xuất hiện** trong nội dung thông báo Agribank. Cần đối soát/duyệt, **không tự thu chỉ vì trùng tên và memo phổ thông**.
- Bill 8.000.000đ PHAM THI NGOC: có thời gian trên bill nhưng thiếu thông báo Agribank độc lập trong máy chủ; không tự thu từ ảnh hoặc chênh số dư.
- Những thay đổi ở luật đối soát tài chính và migration chỉ được phát hành sau kiểm thử/đánh giá chống trùng; không cập nhật ledger production ngoài quy trình cho phép.

## 6. Nguồn mã chịu trách nhiệm
- `bill-amount-rules.mjs`: AI trích xuất đúng chữ và chuẩn beneficiary không dấu.
- `bill-app-preview.mjs`: bộ ghép bằng chứng **chỉ đọc**, không quyết định ghi thu.
- `chat_bank_app_collect`: RPC duy nhất được phép ghi thu sau xác minh độc lập, khóa, kiểm tra trùng.
- `taphoa_agribank_notifications`: lưu nguyên văn thông báo, fingerprint, 3 thời điểm nguồn khác nhau.
- `bank-report-dashboard.js`: giờ/ngày, cảnh báo review và status đã thu, phải phân biệt nguồn bằng chứng.
