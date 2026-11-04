# BANK-233 — Báo cáo ghi thu Agribank thủ công sau khi bỏ số đồng lẻ

## E0 · Bằng chứng
Ngày 2026-11-04, Agribank notification #198 thực nhận **16.000.008 VND**, đã có `chat_bank_manual_collections.mode='collected'` và liên kết sổ thu `taphoa_debt_ledger.entry_type='collection', amount_vnd=-16000` (đơn vị ledger là nghìn VND). Người dùng chụp ảnh báo cáo hiện `Liên kết cần kiểm tra`, dù đã ghi thu thủ công **16.000.000 VND**.

Nguyên nhân: `chat_bank_all_credit_statuses` trong BANK-222 chỉ tìm ledger bằng số tiền ngân hàng chính xác `-(n.amount_vnd::numeric/1000)`, tức `-16000.008`, nên không tìm được sổ `-16000`. Trường hợp này **không phải lỗi ghi tiền** mà là lỗi điều kiện JOIN trong báo cáo.

## E1 · Sửa nhỏ nhất
Migration `supabase/migrations/20261104195700_bank233_manual_round_down_status.sql` thay đúng một predicate trong LEFT JOIN với ledger của `chat_bank_manual_collections`: chấp nhận ledger đúng số tiền gốc theo quy tắc cũ **hoặc** ledger làm tròn xuống bội 1.000 theo quy tắc thu thủ công mới, với ngân hàng nhận tối thiểu 1.000 VND.

Giữ nguyên điều kiện bắt buộc:
- Có bản ghi liên kết theo đúng notification, ledger ID và customer ID.
- `entry_type='collection'`; sai khách, mất ledger, lệch tiền vẫn là `review_inconsistent`.
- Luồng thu tự động `chat_bank_app_collection_links` và JOIN kiểm số tiền tự động vẫn **không thay đổi**.
- Hàm vẫn yêu cầu phiên Admin hợp lệ, không có lệnh INSERT/UPDATE/DELETE giao dịch, không gửi Chat/Zalo, không thêm polling/cron.

## E2 · Kiểm thử
`tests/test_bank233_manual_round_down_status_20261104.cjs` bảo đảm toàn bộ thân hàm trùng với BANK-222 ngoại trừ đúng một JOIN được sửa. Thử giả lập bản ghi khớp `16.000.008 → 16.000.000`, trường hợp theo số lẻ cũ, sai ledger, sai khách, thiếu liên kết, sai loại và khoản dưới 1.000 VND. Verify V21 PASS trên commit `7ef4df93fb36e5fa3b578056abf6eadd598cd28e`: https://github.com/1sl2tp/chat/actions/runs/41834369247.

## E3 · Triển khai và xác minh
Supabase migration `bank233_manual_rounded_receipt_report_20261104` áp dụng thành công ngày 2026-11-04. SQL SELECT sau triển khai xác nhận:
- Predicate JOIN mới đã có trên production, điều kiện owner/type và điều kiện thu tự động được giữ nguyên.
- Với notification #198, nhánh mới phân loại `manual_collected`, hiển thị ở Chat là **Đã thu thủ công**.
- Còn 1 bản ghi thu thủ công được xác nhận hợp lệ trong báo cáo ngày; 0 bản ghi thu thủ công có liên kết nhưng sai ledger theo predicate mới.
- Không thay đổi bản ghi tiền, liên kết hoặc thông báo ngân hàng.

## E4–E5 · Chờ thao tác hiển thị trên thiết bị
Người dùng đóng/mở lại báo cáo hoặc chạm làm mới để tải lại RPC; chưa có bằng chứng ảnh màn hình sau reload. Không được bấm Thu lần nữa cho notification #198. Nếu cần rollback chỉ khôi phục định nghĩa `chat_bank_all_credit_statuses` của BANK-222 sau khi đánh giá ảnh hưởng; không sửa ledger.
