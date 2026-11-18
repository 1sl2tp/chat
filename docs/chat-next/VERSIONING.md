# CHAT NEXT — Quy tắc tên phiên bản và vòng sửa

Áp dụng từ **CHAT-NEXT-015 / V15 — Tên phiên bản & nhật ký chỉnh sửa**, 18/11/2026.

## Hai số phiên bản độc lập

- **CHAT-NEXT-015 / V15**: vòng thiết kế của bản demo giao diện Chat Next, có thể xem ở thanh trên cùng và mở “Nhật ký sửa”. Đây KHÔNG phải phiên bản Chat Web/PWA/APK production.
- **V21.72.39**: phiên bản phát hành riêng của ứng dụng Chat production ở nhánh `main`. Không tăng số V21 khi chỉ sửa demo.

## Bắt buộc ở mọi vòng sửa giao diện tiếp theo

1. Mỗi vòng có mã duy nhất `CHAT-NEXT-NNN`, tên ngắn có nghĩa (ví dụ “Căn trục composer”), ngày VN, mô tả thay đổi, trạng thái nghiệm thu E0–E5.
2. Tăng số vòng một lần cho một tập thay đổi có thể nghiệm thu. Không tái sử dụng số cũ hoặc đánh đồng số commit/CI với vòng giao diện.
3. Đồng bộ `<title>`, `data-design-id`, `data-design-round`, nhãn ngay đầu trang `Vnn`, tiêu đề/lịch sử trong `#versionHistory` và tài liệu này. Số vòng hiển thị trên **mobile lẫn desktop**.
4. Bản nguồn `1sl2tp/chat:design/chat-next-ux-20261118/docs/chat-next/demo/index.html` và bản demo xuất bản `1sl2tp/songoku:demos/chat-next/index.html` phải có cùng nội dung. Kiểm thử trên nhánh riêng của Songoku, CI đạt rồi mới merge. Không tự sửa Chat production hoặc dữ liệu thật.
5. Không đánh dấu E4/E5 đạt nếu chưa có kiểm thử trình duyệt/thiết bị thực tế. Báo cáo cùng mỗi vòng: tên, số, mục sửa, bằng chứng kiểm thử, link demo và commit.

## Nhật ký gần nhất

| Vòng | Tên | Ngày | Phạm vi |
|---|---|---|---|
| V23 | Căn lề và nhóm ảnh gọn trên iPhone | 18/11/2026 | Nhóm ảnh giới hạn chiều cao, nhãn demo nhỏ hơn, căn lề tin và vùng nhập; chỉ demo |
| V22 | Zoom thực và điều hướng ảnh | 18/11/2026 | Bỏ max-width giới hạn zoom, thêm double tap và điều hướng bàn phím; chỉ demo |
| V21 | Trình xem ảnh có ảnh thu nhỏ | 18/11/2026 | Căn giữa ảnh chính, dải thumbnail, chọn ảnh, vuốt trái/phải, zoom hai lần; chỉ demo |
| V20 | Nhóm ảnh chẵn/lẻ cân đối | 18/11/2026 | Gallery mẫu 1–5+, 2/4 chia cột, 3 ảnh nổi bật, 5+ hiển thị +N; viewer chỉ đi trong nhóm |
| V19 | Căn trục yêu cầu hàng | 18/11/2026 | Lưới tên hàng/số lượng/đơn vị, ghi chú tách vùng; dữ liệu nguồn được giữ nguyên; chưa xác nhận đơn |
| V18 | Phân cấp nội dung dễ đọc | 18/11/2026 | Chữ/màu theo vai trò; tin thường, ghi chú, yêu cầu hàng, media và nháp; không suy diễn nghiệp vụ |
| V17 | Chi tiết giao diện đồng bộ | 18/11/2026 | Một bộ token cho chữ, icon, viền, bán kính và khoảng cách nội bộ; kiểm tâm icon trong `?geometry=1` |
| V16 | Căn trục ô gõ và nội dung | 18/11/2026 | Đồng nhất trục L4 khi cuộn desktop; chuẩn L5 48/44px, khe đều, kiểm hình học nút/textarea qua `?geometry=1` |
| V15 | Tên phiên bản & nhật ký chỉnh sửa | 18/11/2026 | Nhãn phiên bản trên trang, lịch sử V11–V15 và quy ước cập nhật |
| V14 | Khung phân cấp và trục L0–L5 | 18/11/2026 | Trục đồng nhất cho header, tin nhắn, composer, note |
| V13 | Ảnh và media mẫu | 18/11/2026 | Thumbnail 4:3, xem ảnh lớn và zoom |
| V12 | Tinh chỉnh chi tiết giao diện | 18/11/2026 | Spacing, icon, nút và tương phản |
| V11 | Điều hướng và bàn phím | 18/11/2026 | Điều hướng Back, ô soạn, vùng bàn phím |

**V19**: E0/E1: thay đổi nhánh thiết kế và test đã ghi; E2/E3 chỉ được công nhận sau khi CI + Pages thành công; E4/E5 PENDING trên thiết bị thật. **V16**: E0/E1 hoàn tất trên nhánh thiết kế; E2/E3 xác minh bằng CI/Pages; E4/E5 cần thử thiết bị thực. V15: E0/E1 (thay đổi source) hoàn tất; E2/E3 xác minh bằng test & Pages; E4/E5 vẫn chờ thử trên iPhone/Android thực tế. Ứng dụng production không bị thay đổi.
