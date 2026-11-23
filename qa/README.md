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


## QW-V02 · Kiểm thử đa trình duyệt + bảo mật mã nguồn (24/11/2026)

**Nguồn và vai trò:**
- [Microsoft Playwright](https://github.com/microsoft/playwright): Chromium desktop/mobile, Firefox desktop, WebKit desktop/mobile giả lập; chỉ mở localhost vô danh, chặn mọi request ra ngoài. Screenshot + báo cáo số đo hình học theo từng engine trong CI artifacts 7 ngày. **Chưa có ảnh chuẩn (golden baseline) được duyệt nên chưa gọi là visual pixel-regression.** Không đồng nhất WebKit Linux với iPhone Safari/PWA thật.
- [Deque axe-core](https://github.com/dequelabs/axe-core-npm): kiểm tra WCAG trên trang public shell; ghi nhận baseline, không che giấu lỗi hoặc tuyên bố toàn bộ accessibility PASS.
- [GitHub CodeQL v4](https://github.com/github/codeql-action): quét tĩnh lỗ hổng JS/TS dưới `.github/workflows/chat-security-audit.yml`; loại trừ `index.html` sinh tự động, vẫn quét `index.source.html` và mô-đun nghiệp vụ.
- [Gitleaks v8.30.1](https://github.com/gitleaks/gitleaks): dùng binary CLI phát hành chính thức và **SHA-256 đã xác minh**; không cần Gitleaks Action v2/license. Quét phần commit mới trong PR hoặc 10 commit gần đây khi chạy theo lịch; kết quả mặc định che toàn bộ secret, không tải report chứa secret lên artifact.
- [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance): đã cài ở QW-V01. Khi gặp code/cách xử lý cũ, truy vấn guide và xác minh hỗ trợ Safari/Chrome/Firefox trước khi cập nhật. Không tự động thay code bằng API mới nếu thiếu browser fallback.

**Chạy theo lịch:** Chat Quality Watch giữ **kiểm nhanh giờ 17 mỗi giờ** và browser sâu **09:43 VN hằng ngày**; Security Audit chạy **thứ Ba 10:12 VN hằng tuần**, ngoài ra chạy khi thay đổi nguồn JS/QA/CI trong PR. Thời điểm GitHub schedule có thể trễ, và nhánh PR chỉ có hiệu lực với schedule sau khi được merge.

**Phạm vi & bằng chứng:** chỉ `qa/`, `tests/`, `.github/` và tài liệu. Không thay runtime app, quyền truy cập người dùng, dữ liệu, service worker, database, Supabase hay push. Không kiểm tra gửi tin thật hoặc hành vi khi đăng nhập. CodeQL có thể phụ thuộc GitHub Code Scanning được bật; nếu repo không cho upload SARIF, đó là cấu hình quyền cần xử lý, không tự bỏ chặn kết quả. Trước merge cần CI PR xanh và xem log; không auto-merge hay tự phát hành production.

**Mở rộng khi có baseline thực:** duyệt screenshot cùng OS/browser/container CI rồi mới thêm `expect(page).toHaveScreenshot()` làm cảnh báo so sánh ảnh. Nhóm kết nối realtime/Push cần các fixture offline độc lập có bằng chứng, không chạy endpoint sống để “thử cho chắc”. Mọi thay thế cách cũ tuân thủ một incident → một owner → một patch → một PR/CI; quay lại QW-V01 bằng cách revert PR QW-V02 nếu rủi ro.

