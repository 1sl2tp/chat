---
name: date-time-audit
description: Audit date/time ownership, formatting, timezone, boundaries, sorting and timestamp consistency in this repository.
---

# Skill: Ngày giờ / Date-time audit

## Mục tiêu
Rà soát toàn bộ chức năng đang dùng ngày giờ trong repo này. Không mặc định rằng mọi màn hình có cùng quy tắc thời gian. Phải tìm owner, hợp đồng dữ liệu và test hiện hữu trước khi sửa.

## Quy trình bắt buộc
1. Đọc README, AGENTS.md (nếu có), CURRENT_WORK.md và README_MAINTENANCE.md (nếu có), cùng các guardrail liên quan; tuân thủ owner và phạm vi repo.
2. Tìm trong source thực tế các từ khóa: Date, Date.now, Intl.DateTimeFormat, toISOString, timestamp, created_at, updated_at, timezone, UTC, Asia/Ho_Chi_Minh, hôm nay, hôm qua, ngày, tháng, lịch, sort, filter.
3. Lập bảng: chức năng / đường dẫn source / nguồn timestamp / timezone / cách hiển thị / logic lọc-sắp xếp / test / mức rủi ro. Không kết luận đã bao phủ toàn repo khi chưa có inventory.
4. Xác minh hợp đồng: lưu trữ timestamp UTC hay offset-aware; hiển thị theo múi giờ người dùng hay quy tắc nghiệp vụ; phân biệt ngày lịch và khoảng 24 giờ; định dạng vi-VN; giờ 24h; thời gian từ server và client.
5. Kiểm thử tối thiểu: 23:59→00:00, đầu/cuối tháng, 28/29 tháng 2, 31/12→01/01, dữ liệu cũ/mới, timestamp thiếu hoặc sai, thiết bị đổi múi giờ, lệch đồng hồ, DST của vùng khác nếu có, thứ tự cùng timestamp, khoảng lọc inclusive/exclusive.
6. Đối chiếu cùng một sự kiện giữa các màn hình liên quan, API và bản ghi. Không thay đổi dữ liệu thật để thử nghiệm.
7. Chỉ sửa đúng source owner với diff nhỏ; thêm regression test trước hoặc cùng patch. Không đổi định dạng dữ liệu, backend, realtime, cron, polling hay cache chỉ để sửa nhãn ngày.
8. Chạy test/build phù hợp, xác minh CI/deploy/production nếu có quyền. Báo rõ PASS, FAIL, chưa kiểm chứng; không gọi commit là đã triển khai.

## Checklist kết quả
- [ ] Inventory các đường đi ngày giờ trong source
- [ ] Quy tắc timezone và timestamp được chứng minh
- [ ] Ngày giờ hiển thị thống nhất với nghiệp vụ
- [ ] Bộ lọc và thứ tự đúng ở ranh giới ngày/tháng/năm
- [ ] Kiểm thử hồi quy có bằng chứng
- [ ] Các thay đổi đã được kiểm chứng tại môi trường tương ứng

## Quy tắc mở rộng Skill
Mỗi chức năng đang tồn tại (chat-scroll, keyboard, search, debt, payment, reports, media, auth, notifications, caching, deploy, v.v.) được đề xuất thành Skill riêng **sau khi** tìm thấy owner/source/test thực tế. Không tạo Skill rỗng hoặc tự nhận đã rà soát toàn bộ. Một incident → một owner → một patch → một lượt kiểm chứng.
