# Hướng dẫn triển khai duy nhất — BANK-287 và các bản OCR bill ngân hàng

> **Đọc trước mỗi lần phát hành OCR/đối soát/thu tự động. Không đoán nhánh, repo, project hoặc tạo token mới chỉ vì một workflow báo thiếu secret.**

## BANK-293 — Chữ viết tắt “thg” trên bill Techcombank

- Ảnh thực sự in `12 thg 11, 2026 lúc 9:17` (ngày đầy đủ, `thg` = tháng), không phải chữ “tháng” như nhận định đầu tiên. Parser mới phải phân biệt ngày có dấu phẩy, tháng viết tắt và hậu tố giờ; đồng thời **so sánh lại giờ in với thời gian giao dịch**. Ngày không hợp lệ hoặc giờ mâu thuẫn vẫn phải về `review`.
- Sau khi cập nhật BANK-291/292 lên production, bill Cô Ngọc tt 2.000.000đ đã được tái đọc **một lần**, nhưng bị `printed_date_invalid` và vẫn **chưa thu**. Tại thời điểm này `attempt_count=2`, bill `review`, ledger NULL, Agribank #269 chưa gắn bill. Mở rộng ngân sách tối đa **3 lần AI tổng cộng** cho *chính* bằng chứng đã đối chiếu với một bank credit độc lập: không gọi lần thứ tư, không biến số tiền trong ảnh thành bằng chứng ngân hàng.
- Khi hoàn tất CI, chỉ có worker `v21-bank-bill-event` cần cập nhật thêm parser/guard; `v21-agribank-notification-ingest v2` đã chứa cơ chế đánh thức và không đổi source. Nếu GitHub Actions thiếu secret, ghi rõ và không làm nhầm source/branch. Trước một lần thử lại bill cũ, kiểm tra ngân hàng, khách, ledger/link và ngày VN một lần nữa. Không ghi thu thủ công bằng SQL, không gửi tin nhắn thử.

## BANK-291/292 — Techcombank comma date và Agribank đến sau

- Source duy nhất `1sl2tp/chat:main` và project `vtqhbhrkdxirqeqkgylo`; code của **hai** Edge function `v21-bank-bill-event` và `v21-agribank-notification-ingest` phải cùng release BANK-291/292, `verify_jwt=false`. Không lấy từ repo TAPHOA hoặc 1988, không thay token/secret và không deploy branch fix trực tiếp.
- Chữ bill Techcombank `12 tháng 11, 2026` là ngày **DD tháng MM, YYYY** đầy đủ; parser không được gọi đây là `printed_date_invalid` khi ngày hợp lệ. Luồng ngân hàng có thể đến chậm vài phút: event mới phải đánh thức đúng worker, không thêm cron/polling.
- Retry một lần cho `review/bill_printed_datetime_conflict` chỉ để **đọc lại ảnh gốc** sau khi kiểm chứng **một** Agribank credit đúng số tiền/phút/tài khoản/nội dung, trong ngày VN và trước khi có bất kỳ link thu nào. Không dùng trạng thái OCR cũ để tự ghi tiền. Bill `amount_read` có thể khớp lại bằng OCR đã lưu và không gọi Gemini.
- Chỉ đánh dấu `ĐÃ THU` sau khi kiểm tra RPC ngân hàng chuẩn đã tạo đúng một ledger/link, không tự sửa `raw_read`, số dư, `status` bằng SQL hoặc gửi thông báo khách trong tests. Giao dịch BANK-290 #268 đã thu: tuyệt đối không lặp.
- Chạy BANK-291/292 và Verify V21, phát hành qua workflow có khóa `main` sau khi CI PASS; đọc lại cả hai Edge versions/hashes. Nếu Actions không có secret trong ngữ cảnh runner, chỉ dùng ngoại lệ deploy trực tiếp có đối chiếu nguồn `main` và phải ghi nhật ký, không khởi tạo token mới.

## BANK-290 — Giao dịch C Hà Trang #268 đã thu, CẤM ghi thu trùng

- Xác minh trực tiếp ngày **12/11/2026 lúc khoảng 07:45 VN**: khách C Hà Trang, ngân hàng Agribank **#268** (10.157.000đ, 21:53 ngày 11/11) có **một** `chat_bank_manual_collections` mode `collected`, ledger **#848** lúc **07:43:27 ngày 12/11**, amount `-10157` (đơn vị 1.000đ) và **một** tin xác nhận trong Chat với client ID `taphoa:bank-manual:268:collection`. Tin xác nhận báo nợ sau thu **0**.
- Bill ảnh `88706591-590e-4acb-8911-338ac1cd0ef7` vẫn `amount_read`, `ledger_id=NULL` vì đã ghi thu theo **manual bank link**, không phải auto receipt link. **Không được tự thu lần hai, gọi lại RPC thu, ép chuyển trạng thái receipt thành `received`, backfill auto link, gửi lại tin Chat/Zalo hoặc chỉnh ledger #848.**
- Các đoạn phía dưới mô tả khoản “chưa thu” là lịch sử **trước 07:43 ngày 12/11**, đã được mục BANK-290 và đầu `CURRENT_WORK.md` thay thế. Nếu hiển thị UI khác ledger, điều tra ở chế độ read-only; bút toán tài chính và thông báo khách đã có thật.
- E4 ledger và tin xác nhận Chat đã xác minh; E5 iPhone/PWA và Zalo **chưa được xác minh** trong đợt rà soát này. Không triển khai lại v34 chỉ vì đối soát giao dịch cũ.

## Đích triển khai cố định

| Thành phần | Giá trị chuẩn |
|---|---|
| GitHub repository | `1sl2tp/chat` |
| Source branch được phép triển khai | `main` (sau PR và Verify V21 PASS) |
| Source Edge Function | `supabase/functions/v21-bank-bill-event/` từ **chính commit main đã kiểm thử** |
| Supabase project ref | `vtqhbhrkdxirqeqkgylo` (`chat-bh-get`) |
| Supabase functions | `v21-bank-bill-event` và `v21-agribank-notification-ingest` (BANK-291 event wake) |
| GitHub release workflow | `.github/workflows/deploy-bank-bill-edge.yml` (`Deploy Bank Bill OCR Edge`) |
| Runtime JWT mode | `verify_jwt=false` (giữ nguyên xác thực riêng bằng `x-internal-dispatch-key`) |
| Backend SQL ghi thu | `public.chat_bank_app_collect` — giữ các điều kiện chống thu trùng/ngày hiện tại |

**Không** triển khai từ `1sl2tp/taphoaxyz`, `1sl2tp/1988`, nhánh tính năng, bản sao lưu hoặc file đã trích từ lịch sử. Nhánh sửa chỉ được merge vào `1sl2tp/chat:main` sau khi kiểm thử. Không thay đổi Supabase project, không tự đẩy thủ công, không chỉnh DB production hoặc ghi thu để thử deploy.

## Trạng thái triển khai đã xác minh (12/11/2026)

- Function `v21-bank-bill-event` tại đúng project `vtqhbhrkdxirqeqkgylo` đã nâng **v33 → v34 ACTIVE** từ mã nguồn đã merge của `1sl2tp/chat:main`; độc lập xác minh mọi file **5/5 khớp byte-for-byte** với GitHub main, JWT mode giữ `false`, BANK-287 có trong runtime `bill-app-preview.mjs`.
- Bản v34 được phát hành **trực tiếp qua kết nối Supabase đã được cấp quyền** theo yêu cầu tiếp tục sửa của chủ sở hữu, **không phải** job deploy GitHub Actions. Phải nêu rõ ngoại lệ này trong báo cáo; không xem đây là cơ chế tự động thường xuyên, không dùng việc này để che giấu thiếu secret Actions.
- Trong các lần sửa kế tiếp, **không redeploy v34 nếu không có mã thay đổi**. Ưu tiên phát hành qua workflow trên `main`; khi GitHub job không nhận `SUPABASE_ACCESS_TOKEN`, chỉ rà soát secret/permission tại đúng repo và không tự tạo/chép token.
- **Cập nhật BANK-290 lúc 07:43 ngày 12/11:** Khoản C Hà Trang **ĐÃ THU THỦ CÔNG** tại Agribank #268, ledger #848, đã có một tin xác nhận Chat. Ảnh bill vẫn `amount_read` là do liên kết receipt chưa xác minh, **không phải còn nợ**. Không thu hoặc gửi xác nhận lần hai.

## Ghi chú về token/credential (12/11/2026)

- Chủ sở hữu xác nhận **đã có token/cấu hình kết nối**; không yêu cầu phát hành token khác, không đưa bất kỳ token/secret nào vào commit, log, tài liệu hay hội thoại.
- **Hai nguồn xác thực khác nhau:** Supabase connector trong ChatGPT có thể đã được cấp quyền truy cập, còn GitHub Actions yêu cầu một secret tên `SUPABASE_ACCESS_TOKEN` **trong repo GitHub**. Có connector **không chứng minh** secret Actions đã được cấu hình. Lỗi `Missing GitHub Actions secret SUPABASE_ACCESS_TOKEN` chỉ chứng minh secret không có mặt trong **ngữ cảnh job đó**, không có nghĩa là chủ sở hữu thiếu token.
- Nếu Actions fail tại gate này, **không** khởi tạo token mới, không sao chép bí mật ra giao diện, không tự chuyển nhánh/project hoặc bypass gate. Kiểm tra trạng thái secret/permission của đúng repo, workflow/event và tổ chức trước; chỉ cấp lại quyền cho đúng kênh theo quy trình được chủ sở hữu cho phép.
- Credential là thông tin bí mật: chỉ ghi lại **tên biến và nơi cấu hình**, tuyệt đối không ghi giá trị.

## Quy trình bắt buộc

1. Đọc `CURRENT_WORK.md`, `README_MAINTENANCE.md`, `README_RESOURCE_GUARDRAILS.md`, `README_NO_WAIT_WORKFLOW.md`. Kiểm tra không có một deploy/CI cùng incident đang chạy; không tạo job trùng.
2. Xác nhận repo chính xác `1sl2tp/chat`, nguồn `main`, commit HEAD dự kiến và PR đã merge. Workflow **fail-closed** nếu `GITHUB_REPOSITORY != 1sl2tp/chat` hoặc `GITHUB_REF != refs/heads/main`. Checkout phải trùng `GITHUB_SHA`, in repo/ref/SHA/project/function (không in token) vào GitHub Actions summary.
3. Chạy `Verify V21` và các kiểm thử hợp đồng `BANK-287`/OCR liên quan. Không bỏ qua lỗi test hoặc chạy thử trên giao dịch thật.
4. Chỉ dùng workflow triển khai hiện có từ `main`. Token dành cho GitHub Actions phải được cung cấp qua secrets của **chính** repo đó. Không dùng một connector session để âm thầm thay thế workflow không có credential; cần xác nhận rõ một ngoại lệ nếu muốn thay đổi cơ chế phát hành.
5. Đối chiếu kết quả deployment **ACTIVE**, version tăng, mã `bill-app-preview.mjs` trên production chứa logic `BANK-287`, trạng thái JWT không thay đổi. Tách bạch: GitHub merge/Verify PASS **không có nghĩa là Edge production đã cập nhật**.
6. Đọc log tối thiểu và xác minh mới không làm tăng ledger trùng, không thu sai khách, không phát tin thật trong test. E0–E5 đánh dấu riêng; chỉ báo xong khi đã kiểm chứng production.

## Giao dịch C Hà Trang 10.157.000đ ngày 11/11

Ảnh bill C Hà Trang chuyển **21:53 11/11/2026** và thông báo Agribank #268 đã nhận đúng tiền, nhưng OCR memo thiếu tiền tố `QR - ` mà Agribank tự thêm. PR [#248](https://github.com/1sl2tp/chat/pull/248) đã merge vào `main` và Verify PASS. Không dựa vào 08:00 để kích hoạt ghi thu. `public.chat_bank_app_collect` chỉ tự thu trong ngày giao dịch (giờ Việt Nam), nên đợt sửa mã hôm sau **không tự động ghi thu lại** khoản cũ.

**ĐÃ XỬ LÝ NGÀY 12/11:** Admin đã xác nhận thu thủ công qua luồng chuẩn; thông báo Agribank #268 đã liên kết ledger #848 và tạo đúng một tin xác nhận Chat. Đoạn hướng dẫn thu ở trạng thái cũ không còn áp dụng cho #268. Giữ nguyên `chat_bank_manual_collect` với kiểm tra quyền/khóa/chống thu trùng cho các giao dịch khác; không ghi thu lại khoản này, không gọi SQL `INSERT`/`UPDATE` lên sổ nợ và không sửa bill thành `received` để giả lập xác minh ảnh.

## Hoàn tác

Revert PR qua `main` theo cùng workflow, xác minh Edge version/mã nguồn sau phát hành. Không rollback bằng cách xóa ledger, bill, bank notice hoặc các chứng từ đã ghi nhận.
