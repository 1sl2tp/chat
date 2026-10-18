# Nhận diện bill KH: AI đọc — code duyệt — thư viện chung

Trạng thái: **BẢN THẢO, CHƯA TRIỂN KHAI TRÊN CHAT CHẠY THẬT**. Phạm vi đầu tiên: tài khoản KH test. Không chuyển số dư khi mới có kết quả AI; chỉ code được phép ghi bút toán.

## Phân loại ba ảnh do chủ hệ thống cung cấp

1. Bill Techcombank 9.270.000đ, người nhận BUI XUAN TUNG, tài khoản Agribank 2901181999999, 18/10/2026 10:07, mã FT26292115078746: đủ bộ trường, cần kiểm tra trùng toàn cục trước khi ghi thu 9.270 (đơn vị nghìn đồng).
2. Bill VCB 3.000.000đ ghi người nhận DO THI THOA và ngân hàng nhận Techcombank: sai đích nhận. HOLD ngay khi đọc chắc, không ghi thu, thông báo khách dừng chuyển thêm và liên hệ quản trị. Không thể ngăn hệ thống ngân hàng thực tế tiếp nhận tiền.
3. Ảnh QR VietinBank tài khoản BUI XUAN TUNG 197981999999: QR chỉ là đề nghị chuyển khoản, KHÔNG phải chứng từ giao dịch thành công. Đánh dấu NON_BILL, không báo thu. Khoản "Đã thu 3.000 · Thu tiền mặt" có sẵn trong Chat là giao dịch thủ công ĐỘC LẬP, không được cộng lại từ QR.

## Luồng sự kiện, nhiều ảnh, chống lag

- Sự kiện KH gửi ảnh mới: DB lưu asset_id, message_id, customer_id, sent_at UTC. UI gửi ảnh xong ngay, không đợi AI. Chỉ quét ảnh KH; ảnh Admin và nhóm khác không kích hoạt.
- Tính SHA256 từ dữ liệu tệp thật ở server, không tin hash do client đưa. Nếu asset đã quét hoặc SHA đã có kết quả đủ thì KHÔNG gọi AI lần nữa.
- Nếu khách gửi nhiều ảnh liền, nhóm thông báo theo khách: im lặng 60–90 giây từ ảnh cuối, tối đa 120 giây từ ảnh đầu. Mỗi ảnh vẫn quét và lưu kết quả riêng, không gộp 2 ảnh thành một giao dịch. Khi thấy đích nhận sai, cảnh báo ngay sau khi kiểm tra xong, không chờ hết cửa sổ nhóm. Thông báo còn lại có thể gộp thành một tin. Không spam theo lần retry.
- Hàng đợi xử lý bất đồng bộ chạy phía server để khi Admin đóng trình duyệt không mất việc; giới hạn tối đa 1 job đồng thời mỗi KH, số worker toàn cục có hạn, quota tiền/calls/timeout. Không tải ảnh hoặc gọi AI trong luồng vẽ giao diện. Không quét lại toàn bộ lịch sử mỗi lần mở Chat, không dùng cron/polling diện rộng. Cửa sổ chờ 1–2 phút đòi hỏi bộ lập lịch theo sự kiện bền vững; không hứa hẹn chạy được khi chỉ dùng browser timer hoặc Edge Function sleep không đảm bảo.
- Một ảnh có tối đa 1 lần Vision đầu tiên và tối đa 1 retry nếu lỗi provider tạm thời; không retry khi lỗi vì trường bị che. Model không được dùng quyền ghi ledger hay tự gửi tin. Khoá Gemini chỉ lưu trong môi trường server.

## Thư viện bill chung toàn khách hàng

Canonical: bảng receipt toàn cục lưu lịch sử mọi ảnh đã xử lý. Trường tối thiểu:
receipt_id, customer_id, asset_id UNIQUE, message_id, sent_at, sent_day_vn, image_sha256(server), content_hash_source, width_px, height_px, size_bytes, mime_type, scan_state, scan_attempts, scanned_at, model_id, extracted_json, amount_vnd, receiving_name, receiving_bank, receiving_account, sending_bank, transfer_reference nullable, transaction_datetime_vn, datetime_precision, decision, reason, duplicate_of, ledger_id, notified_at.

Các trạng thái: QUEUED -> SCANNING -> RECEIVED | DUPLICATE | HOLD | REVIEW | NON_BILL; RETRY_WAIT/SCAN_FAILED có giới hạn. Tất cả trạng thái có thể xem ở Chat; cờ quét phải ở DB để đổi thiết bị không gọi AI lần nữa.

Dedupe 3 cấp: (a) asset_id replay / cùng SHA256 tệp => trùng tệp; (b) cùng ngân hàng chuyển + mã giao dịch chuẩn hoá (nếu có) => trùng giao dịch dù ảnh bị crop khác hash; (c) cùng người nhận/STK + số tiền + thời điểm giao dịch theo độ chính xác ảnh (phút hoặc giây) => NGHI TRÙNG, cho REVIEW không tự ghi lần hai. Cùng số tiền hoặc cùng kích thước ảnh đơn lẻ KHÔNG đủ quyết định trùng. So toàn hệ thống, không chỉ một khách. Lịch sử bill đã nhập trong bảng C Hà Trang muốn dùng làm dữ liệu chống trùng phải được kiểm tra và nhập thành historical_reference, KHÔNG sinh bút toán thu tiền cũ.

## Quy tắc kiểm soát do CODE quyết định

1. Ảnh có phải biên lai chuyển khoản THÀNH CÔNG? QR nhận, hoá đơn bán hàng, ảnh chat, chuyển tiền lỗi, biên lai đang xử lý => NON_BILL/REVIEW, không thu.
2. Người nhận BUI XUAN TUNG chính xác sau chuẩn hoá Unicode/case/space. STK nhận 2901181999999 thuộc Agribank hoặc 197981999999 thuộc VietinBank. Nếu khác rõ => HOLD cảnh báo ngay. Số bị che/mờ => REVIEW. Không được suy ra số bị che từ kiến thức sẵn có về STK.
3. Số tiền nguyên VND dương và chia hết 1000 để ghi ledger theo đơn vị nghìn: 9.270.000đ -> bút toán collection −9.270. Không round, không chia lại hai lần.
4. So ngày giao dịch với ngày KH gửi ảnh trong múi giờ Asia/Ho_Chi_Minh. GD 17/10 gửi 18/10 => HOLD; không đối chiếu với ngày AI đọc lại. Không suy đoán giờ nếu bill chỉ có ngày.
5. Mã giao dịch là tùy chọn. Nếu thiếu mã nhưng đủ điều kiện khác và không nghi trùng thì có thể PASS. Nếu thời điểm và số tiền giống bill cũ => REVIEW.
6. Một DB transaction nguyên tử ghi receipt + có thể ghi đúng một collection qua writer canonical; dùng unique index, idempotency, transaction lock và outbox. AI không có quyền gọi writer trực tiếp. Không được tự động đảo hoặc ghi trùng "Thu tiền mặt" đã có sẵn.

## Quy tắc tin nhắn và tổng hợp

- Chỉ hiển thị "✅ Đã thu 9.270" khi bút toán canonical đã COMMIT thành công. Nếu chỉ đọc bill thì hiện "Đã đọc, chưa ghi thu".
- DUPLICATE: "Bill đã được ghi nhận trước đó; không ghi thu lần hai. Vui lòng không chuyển lại để thử."
- WRONG_RECIPIENT / WRONG_ACCOUNT: "Sai người nhận hoặc STK. Chưa ghi thu. Vui lòng dừng chuyển thêm và liên hệ quản trị."
- OLD_DATE: "Bill thuộc ngày giao dịch cũ so với ngày gửi. Chưa ghi thu; liên hệ quản trị."
- REVIEW: "Bill chưa rõ hoặc nghi trùng. Chưa ghi thu, đang cần kiểm tra."
- NON_BILL: lưu cờ đã quét nhưng không nhắn cảnh báo theo mặc định.
- Thông báo vào khách chỉ được gửi 1 lần / receipt_id + decision_version + target, tuân thủ opt-in và chống spam; các tin không khẩn có thể gộp cho đợt gửi nhiều ảnh.
- Báo cáo sau này lấy từ bảng canonical có customer, ngày gửi, ngày giao dịch, giá trị gốc VND, giá trị ghi thu nghìn đồng, mã, hash, trạng thái, reason, link ảnh, duplicate_of. Google Sheet chỉ là read model, không tự quyết định bút toán.

## Điều kiện nghiệm thu

Thử riêng KH test: 10 ảnh liên tục, ảnh trùng hash, ảnh crop cùng mã giao dịch, ảnh có/mất mã, QR, sai DO THI THOA, ảnh phản sáng/che STK, bill ngày cũ, cùng số tiền khác GD, 2 Admin đồng thời, ngắt mạng, AI 429/503. Đo thời gian gửi đến kết quả P50/P95 và số lần gọi AI; xác minh 0 double collection, 0 AI call lại cho ảnh terminal. Không bật tính năng thu tự động cho toàn bộ KH cho đến khi migration, worker, outbox, test end-to-end và rollback hoàn tất.

## Bảo vệ các khoản "Thu tiền mặt" đã ghi thủ công

Giao dịch Chat đã có thẻ "Đã thu X · Thu tiền mặt" là bút toán riêng do người vận hành tạo, không phải kết quả của AI. Khi triển khai quét bill mới, nếu asset/bill đã được đối chiếu thủ công và có liên kết với ledger cũ, gắn receipt vào ledger đó thay vì tạo bút toán mới. Trường hợp chưa có liên kết chứng minh nhưng số tiền/khách và thời điểm gần khớp bút toán thủ công, xếp REVIEW để Admin xác nhận, không tự tính lần hai và không tự hoàn tác khoản cũ. Bật tính năng mới không được tự ghi thu cho ảnh tồn kho lịch sử.
