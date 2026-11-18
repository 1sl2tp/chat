# CHAT-NEXT-018 — Thang chữ, vai trò màu và phân loại nội dung

Ngày 18/11/2026, bản demo tĩnh. Tham khảo nguyên tắc phân cấp thông tin dễ đọc của ChatGPT **nhưng không sao chép giao diện**. Không áp dụng vào ứng dụng Chat V21 production.

## Vấn đề và quyết định

Ảnh người dùng đưa làm tham chiếu cho thứ bậc: tiêu đề mạnh, nội dung rõ, metadata xám, hành động riêng. V17 còn để tin chữ 14px, preview 12.5px, metadata 11px, các thẻ báo hàng dựng từ một mảng khác với raw text, dễ gây sai biệt bản trình bày và nguồn.

**Quy tắc duy nhất**: loại nội dung phải đến từ **trường kiểu dữ liệu đã khai báo**, không suy diễn từ các từ như "đã giao", "đã thanh toán", "2 thùng" trong tin nhắn; màu xanh chỉ cho hành động hoặc điều hướng, **không** biểu thị xác nhận nghiệp vụ. Mọi quyết định ghi thu/giao hàng thuộc backend có quyền và bằng chứng, không thuộc renderer.

## Bảng phân cấp (cỡ CSS pixel)

| Vai trò | Kích thước / dòng | Màu | Áp dụng |
|---|---|---|---|
| Tiêu đề trang | 24/32 (V17) | Primary `--ink` | Inbox |
| Tiêu đề thẻ yêu cầu | 16/23 | Primary | Danh sách khách gửi |
| Nội dung hội thoại | 15/23 | Primary | Tin gửi/nhận |
| Tên liên hệ | 14/21 | Primary | Danh bạ |
| Xem trước và ghi chú phụ | 13/19 | Secondary `--muted` | Inbox, ghi chú nghiệp vụ mẫu |
| Thời gian/trạng thái xem trước | 11.5/17 | Secondary | Timestamp/nháp |
| Hành động | 12–13 | Accent `--accent` | Link, nút được chọn |
| Input | 16/24 (V16) | Primary | Tránh zoom Safari iOS |

Màu sáng/tối lấy token semantic cũ, không hardcode màu theo từng loại tin. Đọc lướt theo thứ tự *ai gửi → nội dung → thời gian → hành động*. Không biến mỗi dòng thành một badge.

## Phân loại nguồn dữ liệu — đúng một chủ sở hữu

1. **Tin thường** (`other`, `mine`): giữ nguyên textContent, phía gửi xác định căn trái/phải, không tự đoán đơn đã giao.
2. **Ghi chú nhiều dòng** (`note`): chỉ khi tin được khai báo kiểu note; giữ toàn bộ chữ và xuống dòng nguyên văn, có viền trái trung tính để dễ quét. Không regex để tự chuyển nội dung nghiệp vụ.
3. **Yêu cầu hàng** (`order`): mock payload có `items [{name,amount,unit}]` và `note`; chính payload này dựng *cả* các hàng nhìn nhanh và bản chữ xem thêm. Không có dữ liệu → hiển thị thiếu mẫu, không tự bịa. Trạng thái: **chưa xác nhận**, không tự tạo đơn.
4. **Media** (`media`): ảnh minh họa có caption; không chuyển ảnh thành bill thật hay tự OCR.
5. **Nháp demo** (`message-preview`): hiển thị viền đứt trung tính và "Nháp demo · chưa gửi", khác trực quan với tin đã gửi.

## Given / When / Then

- Given hội thoại Lan với payload 2 thùng sữa hộp, 3 hộp bánh quy + ghi chú; When mở card, Then bảng và nội dung mẫu được tạo từ cùng payload và số lượng khớp.
- Given Hương có tin nhiều dòng, When mở Chat, Then nội dung gốc vẫn chọn/copy được, không đổi dấu hay mã.
- Given nhập và bấm gửi trong demo, When nháp được thêm, Then có nhãn chưa gửi và không gọi mạng.
- Given ảnh, ngày và danh bạ, When đổi Dark Mode hoặc kích thước 320–1920px, Then màu theo semantic roles và không che cột giờ, lề V14–V17 giữ nguyên.

## MUST-STAY và rollback

- Giữ nguyên L0–L5, VisualViewport, keyboard focus, cuộn native, nút gửi nháp, Back, context menu, media viewer, tabs, PWA production và dữ liệu thật.
- Không mạng, polling, auth, backend, Supabase, Zalo, thanh toán, tự duyệt hoặc đoán trạng thái nghiệp vụ.
- E0 source review; E1 demo code; E2 test VM + static contract; E3 CI 2 repo và Pages; E4/E5 **PENDING** đến khi đo screenshot thực trên iOS Safari/PWA, Android Chrome/PWA, desktop (sáng/tối, bàn phím, tin dài).
- Rollback: revert block `CHAT-NEXT-018`, hàm orderCard + class typed note/preview và nhãn V18 về V17. Không ảnh hưởng production.
