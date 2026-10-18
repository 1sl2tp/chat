# SPEC-CHAT-BANK-AUTOCOLLECT-157 — Quản trị tự thu SMS Banking + bill (2026-10-18)

## E0 — SPEC LOCK
- **User outcome:** Admin có một nơi trong Chat > Cài đặt tài khoản để xem/truy cập trạng thái tự thu. Mặc định TẮT. Admin được phép thay đổi chế độ khi và chỉ khi các điều kiện kiểm thử cho phép; khách hàng không thấy/không điều khiển.
- **Given:** Đã kết nối một thiết bị ingest SMS Agribank, bill reader đọc ảnh trong Chat, bộ so khớp hiện chỉ xem trước. SMS thực tế trong Supabase đang là 0 nên KHÔNG thể kết luận tự thu production đủ an toàn.
- **When:** Admin mở Cài đặt; Admin nhấn Bật hoặc Tắt; APK gửi SMS; khách gửi ảnh chuyển khoản; lỗi mạng/thiếu SMS/trùng ảnh/không rõ khách.
- **Then:** Panel hiển thị trạng thái thực tế đọc từ Supabase (không dựa localStorage). Mặc định OFF; chỉ cho phép ON sau khi readiness gate trên server đã xác minh. OFF phải chặn mọi tự ghi công nợ; đọc SMS, OCR bill, chống trùng và đối chiếu read-only tiếp tục. ON khi thật sự đủ điều kiện chỉ cho phép ghi thu *một lần* với duy nhất một SMS ngân hàng hợp lệ cho duy nhất một bill/khách và không có dấu hiệu trùng.
- **Canonical owners:** Auth admin qua v21_private.current_active_account_id; cấu hình trong Supabase; UI tại màn Cài đặt tài khoản (zalo-admin-link.js); đọc bill v21-bank-bill-event; nhận SMS v21-sms-ingest; ghi công nợ chỉ bởi một transaction DB riêng, chưa triển khai trong giai đoạn cấu hình này.
- **Hard stop:** Không có SMS thực, chưa test parser DD/MM HH:MM + độ tin cậy sender/thiết bị, chưa có bằng chứng SMS/bill match unique E2 ⇒ readiness=false, không thể bật. UI ghi rõ “Chưa sẵn sàng” thay vì công tắc ON giả.
- **MUST STAY:** Không ghi hoặc sửa taphoa_debt_ledger; không động Chat Realtime, media, Zalo, read-state, customer messages, Push, session/cache. Không có cron/poll/auto-retry mới, không log raw SMS, không gửi thông báo “Đã thu” khi chưa ghi.
- **Negative cases:** user/guest không xem/thao tác; session revoked; offline; click nhanh nhiều lần; cache stale; duplicate SMS fingerprint; ảnh trùng SHA-256; >1 ứng viên SMS/bill; SMS không đúng format/ngày thiếu năm; thiếu khóa API; tắt trong lúc job xử lý.
- **Security:** Admin RPC only, check server-side active session and role; no table writes from anon/authenticated; auditable who changed status. Database flag OFF enforced *at any eventual ledger writer*, not just UI. Ready flag owned by verified rollout, not mutable by browser.
- **Test matrix:** default=false; guest/user denied; admin GET; readiness=false denies enable; OFF allowed; no ledger writes; future true state requires isolated pilot + SMS real + rollback drills. Physical Safari/iPhone PWA E4 remains PENDING until observed.
- **Resource budget:** one admin RPC read when Settings opened, one RPC write on explicit click only; zero idle/poll/heartbeat changes; SMS and bill scanning keep existing event owners.
- **Rollback:** reset enabled=false on server first; revert UI code if regression. Never delete the existing SMS, bill, ledger or message data.
- **Status 2026-10-18:** E0 LOCKED. Building management foundation; automatic financial ledger writer is intentionally blocked until end-to-end proof with real bank messages.
