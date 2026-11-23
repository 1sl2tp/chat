# CHAT Quality Watch · QW-V01

Đây là bộ **công cụ QA dành cho developer/AI**, nằm ngoài ứng dụng TAPHOA Chat. Không thêm JavaScript, CSS, thư viện mạng, service worker hoặc runtime vào PWA. Nguồn UI/UX cha–con tham khảo là `1sl2tp/2027`, nhưng CHAT chỉ thay mã theo owner gốc đã ghi trong README; không sao chép UI hoặc ghép hai dự án theo đường dữ liệu.

## Các nguồn GitHub uy tín đã tích hợp

| Nguồn | Gói/skill đã chọn | Mục đích |
| --- | --- | --- |
| [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) | `modern-web-guidance@1.0.1`, `.agents/skills/modern-web-guidance/SKILL.md` | Tư vấn HTML/CSS/JS, form, bàn phím, container query, Safari fallback; tham khảo trước khi sửa UI |
| [microsoft/playwright](https://github.com/microsoft/playwright) | `@playwright/test@1.65.1` | Browser automation cho shell **localhost** không đăng nhập |
| [dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) | `@axe-core/playwright@4.14.0` | Ghi nhận accessibility baseline, ưu tiên lỗi có bằng chứng |

Phiên bản được cố định trong `qa/package.json`; Node.js yêu cầu >=22.12.0. Browser và dependencies **chỉ cài trên CI/developer**, không đóng gói vào `chat.taphoa.xyz`.

## Hai tầng kiểm tra

- **Mỗi giờ** (`17 * * * *`, UTC): `Chat Quality Watch` kiểm nhanh cú pháp JS và các hồi quy giao diện CHAT-437 đến CHAT-441, policy read-only. Đây là công việc GitHub Actions, **không phải thêm polling vào ứng dụng**, và chỉ hoạt động sau khi workflow xuất hiện trên nhánh mặc định `main`.
- **Mỗi ngày lúc 09:43 VN** (`43 2 * * *`, UTC), hoặc khi PR QA được kiểm tra: dựng canonical HTML trên runner tạm, cài gói test, mở chỉ `http://127.0.0.1:8765` trong Chromium desktop/mobile giả lập, chặn **toàn bộ network ngoài localhost**, khóa Service Worker và ghi accessibility report/screenshots mẫu đăng nhập công khai. Không có user/session/token/data thật.
- CI/browser test không phải E4/E5: **không** chứng minh iOS Safari/PWA, Android hardware keyboard, delivery realtime, login hay gửi/nhận tin thật. Test axe ban đầu ở chế độ báo cáo để lập baseline; chỉ bổ sung hard-fail khi có kiểm thử mục tiêu và không gây false positive.

## Quy trình tự sửa có kiểm soát

AI lịch mỗi giờ đọc HEAD, `CURRENT_WORK.md`, guardrails, PR mở, bằng chứng CI; chọn **một owner/một lỗi/một patch**, dùng Modern Web Guidance tra cứu cách triển khai, tự tạo nhánh và PR nháp với test/rollback nếu có bằng chứng mới. **Không auto-merge**, không tự đẩy trực tiếp `main`, không deploy thủ công, không gửi tin thật/đơn/thu tiền, không chạy bill OCR ảnh khách, không cập nhật Supabase/DB production, không thêm cron realtime, không thay token/secret.

CI xanh không đồng nghĩa UI hoàn hảo. Mỗi lỗi cần E0–E5 và nghiệm thu device thật trước khi khẳng định đã xử lý hoàn toàn. Nếu bài kiểm tra thất bại lặp hai lần thì dừng retry, đọc log, bảo vệ app đang chạy; không tạo vòng lặp commit/PR.

**Rollback:** revert PR chỉ gồm `qa/`, `.agents/skills/modern-web-guidance/`, `tests/test_chat_quality_sources_20261123.cjs`, `.github/workflows/chat-quality-watch.yml` và tài liệu liên quan. Không sửa `app.js`, `shell.js`, `index.source.html`, `index.html`, `version.json`, `sw.js`, Supabase hoặc dữ liệu khách trong patch QW-V01.
