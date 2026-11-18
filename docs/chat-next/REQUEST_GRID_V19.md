# CHAT-NEXT-019 — Căn trục danh sách yêu cầu lấy hàng

Ngày: 18/11/2026 (giờ Việt Nam). Phạm vi: **bản demo tĩnh** CHAT NEXT, không phải ứng dụng Chat V21 production.

## Mục tiêu

Trình bày rõ ràng yêu cầu lấy hàng do khách gửi trong hội thoại: phân biệt **tên mặt hàng**, **số lượng**, **đơn vị**, **ghi chú**, **thời điểm**. Tránh các hàng chữ ngẫu nhiên lệch trục ngang/dọc, đặc biệt trên iPhone 320–430px và desktop.

## Chủ sở hữu dữ liệu duy nhất

- Renderer chỉ xử lý tin có `kind: 'order'` và `payload.items` đã khai báo trong demo. Không đoán đơn hàng từ câu nhắn, từ khóa "2 th", chữ "đã giao" hay ảnh.
- Lọc các mục không có tên/đơn vị chuỗi hoặc số lượng không phải số nguyên dương an toàn. Nếu không còn mục hợp lệ, trả về thông báo thiếu dữ liệu; **không tự tạo mặt hàng**.
- Danh sách hiển thị và phần **Xem nội dung mẫu** được dựng từ **cùng một tập mục hợp lệ**. Ghi chú `payload.note` được trình bày riêng nhưng không bị sửa nội dung nguồn; giữ xuống dòng khi có.
- Màu chỉ biểu thị phân cấp đọc, **không** biểu thị đã xác nhận, đã giao, đã thu hoặc đã gửi. Bản xem nhanh gắn nhãn **chưa xác nhận**.

## Quy tắc hình học

| Vùng | Chuẩn |
|---|---|
| Khung yêu cầu | Tối đa 420px, không tràn cột đọc chung, tự thu hẹp ở màn nhỏ |
| Mặt hàng | Cột mềm `minmax(0,1fr)`, chữ dài `overflow-wrap:anywhere` |
| Số lượng | Cột cố định 112px; màn ≤360px dùng 102px |
| Đơn vị | Cột con cố định 52px; màn ≤360px dùng 46px |
| Khoảng giữa hai cột | 12px; màn ≤360px còn 8px |
| Chữ nội dung | 14/20px; nhãn 11.5/17px; số dạng tabular |
| Ghi chú | Vùng riêng có đường phân cách trung tính, nội dung không rút gọn |
| Thời gian | Giữ ở ngoài thẻ, theo owner `stamp` V18 |

Mọi trục trên áp dụng **chỉ** với `.message-stream .order-message`, không thêm scroll owner, không làm thay đổi các tầng khung L0–L5, composer, bàn phím, media, hội thoại thường hoặc danh bạ.

## Kiểm thử

1. Với yêu cầu mẫu 2 thùng sữa + 3 hộp bánh + ghi chú: render đúng hai hàng, số và đơn vị ở cột riêng; phần nội dung đọc lại khớp 100% cùng payload.
2. Với mặt hàng dài hoặc dữ liệu không hợp lệ: chữ tự bọc, không tràn cột, không tạo hàng ảo. Trường hợp tất cả sai → hiển thị thiếu mẫu.
3. 320/360/375/390/414/430px, tablet, 1024/1440/1920px; sáng/tối; phóng cỡ chữ trong hệ thống: thử chụp ảnh và đo cột. Chưa có ảnh thiết bị thực → không báo đạt E4/E5.
4. Kiểm thử hồi quy Back/Forward, nháp mẫu, focus bàn phím, media viewer, scroll hội thoại, khả năng chọn/copy nội dung nguồn.

## Trạng thái và giới hạn

- E0: đã rà soát nguồn V18.
- E1: đã sửa bản demo thử nghiệm + thêm test contract.
- E2/E3: chờ kết quả Verify V21 / đồng bộ Songoku Pages; không gọi PASS khi thiếu CI.
- E4/E5: PENDING — cần screenshot/đo thực tế trên iPhone Safari/PWA, Android Chrome/PWA và desktop.

Không gửi tin thật, không đọc thông báo/bill, không cập nhật Supabase, nợ, hóa đơn, tài khoản hoặc trạng thái giao hàng. Không merge nhánh thử vào Chat `main` hay tự deploy Chat production.

Rollback: revert riêng commit có đánh dấu `CHAT-NEXT-019` và nhãn V19; trở về thẻ V18 mà không đụng luồng dữ liệu thật.
