# BANK-366 — Chống lặp thông báo Agribank có FT xác thực

**Ngày:** 23/11/2026. **Phạm vi:** nguồn GitHub CHAT, ingest Edge (mã chờ review), không sửa dữ liệu production hoặc hạch toán lịch sử. **Bằng chứng:** bill E Trang Tuân 360.000đ, 08:14 ngày 22/11.

## Phát hiện đọc-only (không chuyển dữ liệu tài chính)
- Receipt đã scan: `amount_read`, đúng 360.000đ, 08:14, account Agribank đuôi 9999, có FT reference, nhưng `match_preview=waiting_bank_event`, không có ledger/link.
- Hai bank notifications #424/#425: cùng nội dung nguyên văn, cùng FT, ngày/giờ ngân hàng, số tiền và đích, nhưng `posted_at` thiết bị khác nhau khoảng 20 phút; code BANK-306 dùng `posted_at_ms` cho fingerprint nên sinh hai hashes.
- Preview `previewBillAppMatch` cố ý chặn `qualified.length>1`. SQL `chat_bank_app_collect` còn **chặn riêng** nếu có tín dụng Agribank khác cùng số tiền ±60 giây, kể cả hai thông báo là replay giống nhau. Không thay đổi guard SQL ở đây và không tự backfill ngày 22.

## Thay đổi mã nguồn đề nghị
1. Khi có `officialCreditWindow` hợp lệ cho đúng tài khoản đích, số tiền dương, **chính xác một FT14** nằm trong nội dung giao dịch, tạo fingerprint mạnh dùng toàn bộ nội dung ngân hàng, không dùng thời điểm push Android. Thiếu FT/khác ref/sai thời gian/ngày/đích → giữ nguyên fingerprint cũ.
2. Đọc đối chiếu một cửa sổ bank time ±5 phút và đúng amount/status/package, giới hạn 100 hàng; nếu **body bank giống hệt** một hàng trước thì trả `duplicate:true` **trước khi insert**. Lỗi truy vấn/giới hạn → 503, fail closed.
3. Không xóa/sửa các notice đã có, không gộp các giao dịch chỉ vì cùng tiền/giờ/tên, không cập nhật receipt, RPC hay Supabase schema, không gửi tin và không chạy cron mới.
4. Cùng device: unique `(device_id,fingerprint)` xử lý replay đồng thời. Khác device: read-before-insert ngăn replay tuần tự; **không cam kết ngăn mọi race hai thiết bị đồng thời**, cần thiết kế ràng buộc DB riêng sau khi audit lịch sử.

## Giới hạn tài chính và xử lý ca E Trang Tuân
- BANK-366 là **phòng ngừa dữ liệu mới**, **không thể** tự làm hai dòng #424/#425 biến mất hoặc cho phép RPC ghi thu khoản cũ. Hệ thống cần người có quyền xác minh đúng 1 giao dịch đã vào ngân hàng và sổ công nợ (kể cả thu tay trước đó), sau đó sử dụng quy trình admin có kiểm soát.
- Không tự gọi `chat_bank_app_collect` cho ngày 22/11 khi hiện đã là 23/11. Không bỏ `duplicate_or_ambiguous`, không xóa notice, không tác động production DB.
- Chỉ merge/deploy sau khi test V21 và có review của chủ sở hữu nghiệp vụ do ingest có khả năng đánh thức auto collect **cho các ngày tương lai**.

## Chứng cứ & nghiệm thu
- Bài test `tests/test_bank366_agribank_ft_replay_identity_20261123.mjs` kiểm replay khác posted time, FT khác, amount/date/time/account khác, giấy tờ thiếu FT, cùng phút nhiều chuyển khoản thật, và fail-closed path.
- CI: Verify V21 toàn phần, kiểm lỗi bank306/307/309, typescript / Edge bundle; không chứng minh live DB/PWA khi chỉ xanh unit tests.
- Rollback: revert commit PR theo SHA; không xóa hoặc backfill dữ liệu lịch sử.
