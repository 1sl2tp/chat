# TELE-003 · Danh bạ 143 tài khoản Chat

Phạm vi đã được người dùng chốt: chỉ lấy tất cả tài khoản public.v21_accounts có role=user và deleted_at IS NULL. Kết quả SELECT lúc kiểm tra: 143 tài khoản, cả 143 có tên. KHÔNG lấy 350 Zalo contacts, không dùng 125 zalo_user_links làm bộ lọc, không phân loại dựa trên tin nhắn đã gửi.

Mỗi tài khoản Chat có contactKey chat:<uuid> và Telegram Topic title lấy tên trong Chat. Các tài khoản chưa có tin nhắn vẫn có trong kế hoạch. Khi trùng tên, thêm hậu tố định danh ngắn. Telegram Topic không phải native contact của Telegram.

Phần hiện có ở nhánh TELE-003 là projection và reconciliation plan (keep/rename/create) với test mô phỏng 143 khách. Hoàn toàn chưa tạo 143 Topic thật, chưa ghi DB, chưa gọi Telegram. Topic TELE-002 threadId=60 chỉ là topic giả lập đã xác nhận bằng ảnh.

Để tạo 143 Topic thật an toàn và sau này chat hai chiều, cần mapping bền vững giữa chat_account_id và (telegram_chat_id, telegram_thread_id), unique hai phía, tạo mapping theo trạng thái reserved trước khi gọi Telegram, không tự retry trường hợp kết quả không chắc chắn. Ngoài ra cần quyền admin, rate limit, idempotency, và lấy sự kiện từ canonical Chat sau khi lưu. Không được gửi từ Render trực tiếp, sửa dữ liệu khách, ghi thu hoặc tạo đơn.

Trong giai đoạn này dự án có quy tắc không tự sửa dữ liệu DB production, vì vậy chưa áp dụng migration hoặc tạo hàng loạt Topic thiếu mapping. Không thêm cron/polling/log trùng hệ thống.
