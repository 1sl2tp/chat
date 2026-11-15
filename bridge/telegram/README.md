# TELE-001 — Telegram Topics pilot

Mục tiêu: thử Telegram iPhone/Android thay phần trình bày hội thoại, trong khi Chat Supabase và Zalo → Render không thay đổi. Đây là bản kiểm tra kỹ thuật, CHƯA triển khai đồng bộ tin khách hàng thật.

## Cách thử an toàn

- Chạy: node bridge/telegram/src/pilot.mjs
  Kết quả là danh sách ba khách HOÀN TOÀN GIẢ LẬP. Không cần bot, không truy cập mạng, không tạo Topic.
- Chạy: node --test bridge/telegram/test/*.test.mjs
  Chạy kiểm thử không gọi Telegram, không gọi Supabase.
- Khi có bot và quyền quản trị, runner riêng đặt TELEGRAM_BOT_TOKEN và TELEGRAM_PILOT_CHAT_ID qua secret manager; KHÔNG đăng token trong chat, repository hoặc URL.
- Tại BotFather (https://t.me/BotFather), tạo bot, bật Topics trong private chat, vào bot từ tài khoản Telegram chủ quản rồi nhấn Start. Xác minh getMe.has_topics_enabled=true.
- Một lệnh áp dụng, tạo tối đa một Topic thử + một tin thử trong Telegram chủ quản:
  node bridge/telegram/src/pilot.mjs --apply --mode=private
- Nếu private topics gặp lỗi Bot API, tự chuẩn bị một forum supergroup riêng tư, bot có quyền quản lý Topics, dùng group chat ID qua TELEGRAM_PILOT_CHAT_ID, rồi thử:
  node bridge/telegram/src/pilot.mjs --apply --mode=group
- Để kiểm tra lại topic đã tạo (không tạo thêm topic):
  node bridge/telegram/src/pilot.mjs --apply --existing-thread-id=12345
- Mặc định thử nội dung giả, không gửi tin tới khách Zalo, không ghi DB.
- Chỉ khi cần lấy đúng 1–3 account từ backend, dùng --source=backend và cấu hình riêng CHAT_SUPABASE_URL, CHAT_SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_PILOT_ACCOUNT_IDS (1–3 UUID phân cách dấu phẩy). Chế độ này chỉ đọc v21_accounts, zalo_user_links và zalo_contacts theo allowlist; không liệt kê toàn hệ thống và không cập nhật DB.

## Tiêu chuẩn thành công

1. Bot có quyền Topics, đích Telegram đúng loại private chat hoặc forum supergroup.
2. API createForumTopic trả về message_thread_id, gửi một tin thử theo ID đó.
3. Bot API xác nhận đúng message_thread_id trong kết quả sendMessage; nếu thiếu hoặc sai thì FAILED.
4. Trên Telegram của quản trị viên thấy Topic và tin thử, cùng tên khách minh họa.
5. Không có sự kiện mới ở Zalo, Chat production hoặc Taphoa.

Không tự fallback qua General khi Topic lỗi. Telegram private Topics có báo cáo BOT_TOPIC_WRONG_HOME và message thread not found trong tháng 11/2026; group forum là phương án thử dự phòng, không tự động chuyển tin.

## Sau khi kiểm chứng thực tế

Bản pilot này KHÔNG có lưu mapping, webhook nhận tin hay bridge trả lời Zalo. Chưa bật hoạt động hai chiều. Bước tiếp theo phải bổ sung migration service-only trong Supabase cho ánh xạ (chat_account_id, telegram_chat_id, message_thread_id), unique constraint và event outbox idempotent lấy từ v21_messages sau khi canonical commit. Việc gửi ngược cần whitelist Telegram sender ID, kiểm tra admin role/account scope và quyền Zalo, dedupe theo update_id; media dùng link ngắn hạn, vẫn lưu bản gốc trong backend. Không tạo cron/polling thứ hai cho message.

## An toàn, rollback

Không sửa Render, Edge Function Zalo, frontend/PWA, Supabase production, bank bill, lịch tự động. Telegram sao chép nội dung được gửi vào nó, nên không gửi tài liệu khách thật hoặc dữ liệu nhạy cảm trong smoke test. Để rollback mã chỉ cần xóa bridge/telegram; Topic thử có thể xóa thủ công trên Telegram quản trị.

Tham khảo:
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/api-changelog
- https://github.com/tdlib/telegram-bot-api/issues/905
