# Hướng dẫn triển khai duy nhất — BANK-287 và các bản OCR bill ngân hàng

> **Đọc trước mỗi lần phát hành OCR/đối soát/thu tự động. Không đoán nhánh, repo, project hoặc tạo token mới chỉ vì một workflow báo thiếu secret.**

## Đích triển khai cố định

| Thành phần | Giá trị chuẩn |
|---|---|
| GitHub repository | `1sl2tp/chat` |
| Source branch được phép triển khai | `main` (sau PR và Verify V21 PASS) |
| Source Edge Function | `supabase/functions/v21-bank-bill-event/` từ **chính commit main đã kiểm thử** |
| Supabase project ref | `vtqhbhrkdxirqeqkgylo` (`chat-bh-get`) |
| Supabase function | `v21-bank-bill-event` |
| GitHub release workflow | `.github/workflows/deploy-bank-bill-edge.yml` (`Deploy Bank Bill OCR Edge`) |
| Runtime JWT mode | `verify_jwt=false` (giữ nguyên xác thực riêng bằng `x-internal-dispatch-key`) |
| Backend SQL ghi thu | `public.chat_bank_app_collect` — giữ các điều kiện chống thu trùng/ngày hiện tại |

**Không** triển khai từ `1sl2tp/taphoaxyz`, `1sl2tp/1988`, nhánh tính năng, bản sao lưu hoặc file đã trích từ lịch sử. Nhánh sửa chỉ được merge vào `1sl2tp/chat:main` sau khi kiểm thử. Không thay đổi Supabase project, không tự đẩy thủ công, không chỉnh DB production hoặc ghi thu để thử deploy.

## Trạng thái triển khai đã xác minh (12/11/2026)

- Function `v21-bank-bill-event` tại đúng project `vtqhbhrkdxirqeqkgylo` đã nâng **v33 → v34 ACTIVE** từ mã nguồn đã merge của `1sl2tp/chat:main`; độc lập xác minh mọi file **5/5 khớp byte-for-byte** với GitHub main, JWT mode giữ `false`, BANK-287 có trong runtime `bill-app-preview.mjs`.
- Bản v34 được phát hành **trực tiếp qua kết nối Supabase đã được cấp quyền** theo yêu cầu tiếp tục sửa của chủ sở hữu, **không phải** job deploy GitHub Actions. Phải nêu rõ ngoại lệ này trong báo cáo; không xem đây là cơ chế tự động thường xuyên, không dùng việc này để che giấu thiếu secret Actions.
- Trong các lần sửa kế tiếp, **không redeploy v34 nếu không có mã thay đổi**. Ưu tiên phát hành qua workflow trên `main`; khi GitHub job không nhận `SUPABASE_ACCESS_TOKEN`, chỉ rà soát secret/permission tại đúng repo và không tự tạo/chép token.
- Khoản C Hà Trang 10.157.000đ 11/11 vẫn ở `amount_read`, chưa được ghi thu. Không ép thành `received` hoặc ghi nợ trực tiếp; Admin xác minh thủ công trên notification #268 bằng luồng hiện có.

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

Để xử lý khoản cũ, Admin sử dụng hộp thoại `Thu sau khi xác minh` trên thông báo Agribank #268, chọn đúng C Hà Trang, kiểm tra bút toán có sẵn và ký xác nhận. Hệ thống dùng `chat_bank_manual_collect` có kiểm tra quyền/khóa và chống thu trùng. Không gọi SQL `INSERT`/ `UPDATE` trực tiếp lên sổ nợ, không tự thu bằng service role hoặc sửa trạng thái bill thành `received` để giả vờ đã thu.

## Hoàn tác

Revert PR qua `main` theo cùng workflow, xác minh Edge version/mã nguồn sau phát hành. Không rollback bằng cách xóa ledger, bill, bank notice hoặc các chứng từ đã ghi nhận.
