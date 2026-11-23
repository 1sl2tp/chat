# CHAT-441 — Chọn nhiều ảnh cùng lúc trên iPhone

## E0 · Lỗi gốc

Người dùng phản ánh không thể chọn nhiều ảnh ngay trong luồng gửi ảnh. Kiểm tra source chính của `1sl2tp/chat`:

- `index.source.html`: `#upload-photos` đã có `multiple accept="image/*"`.
- Tuy nhiên **nút + iPhone** sử dụng `RuntimeProfile.pickerMode === 'ios-native'` và mở `#upload-ios-source`, là `<input type=file>` **không có `multiple`**.
- `app.js addIOSNativeSourceFromInput()` chỉ lấy **`files[0]`**, gọi `ingestImageFiles([file])`. Đây là **hai điểm cụ thể** khiến nhiều ảnh không thể vào cùng một lượt chọn.
- Nhánh xử lý chung `ingestImageFiles(files)` đã chuẩn bị các ảnh, lưu vào khay và `commitMediaSendTransaction` hỗ trợ nhiều ảnh cùng một tin nhắn; không cần viết lại hệ thống upload.

## E1/E2 · Sửa đúng owner

- Cho `#upload-ios-source` dùng thuộc tính native `multiple`; giữ nguyên khả năng từ cùng sheet iOS chọn Photos, Camera và tệp (không tự đổi thành image-only, không xóa File).
- Dùng **toàn bộ FileList** theo thứ tự Photos trả về, xóa `input.value` ngay để chọn lặp lại ảnh vẫn hoạt động.
- Nếu chọn toàn ảnh, gọi **một** `ingestImageFiles(images)`. HEIC/HEIF, ảnh không có MIME nhưng có đuôi ảnh được dùng bộ nhận diện sẵn có. Nếu chọn PDF/Word/... thì vẫn qua luồng tệp đơn hiện tại. Với ảnh+tệp hỗn hợp chỉ nhận ảnh, báo rằng tệp còn lại cần chọn riêng để tránh một giao dịch gửi hỗn hợp chưa được outbox hỗ trợ.
- Không tự bấm Gửi. Khay xem trước giữ các thumbnail có nút bỏ/xem ảnh; tự gửi chỉ sau khi người dùng xác nhận.
- Chặn nút Gửi **cho đúng draft/hội thoại** trong lúc batch ảnh vẫn đang xử lý; mở khóa trong `finally` kể cả khi một ảnh lỗi. Không gắn chặn toàn cục làm ảnh hưởng hội thoại khác khi khách chuyển A→B.
- Giữ nguyên `MediaCache`, quyền riêng tư, session, media queue, ảnh đơn TAPHOA và logic gửi. Không gửi media thật hoặc thay Supabase.

## E3 · Kiểm thử hồi quy

`tests/test_chat441_ios_photo_multiselect_20261123.cjs` kiểm tra trực tiếp source handler iOS với nhiều ảnh (cả HEIC không MIME), một ảnh, chọn lại ngay, PDF, lựa chọn hỗn hợp và tệp không hỗ trợ. Đồng thời mô phỏng batch 3 ảnh chuẩn bị bất đồng bộ, kiểm tra khoá/mở nút Gửi và đúng thứ tự ảnh; yêu cầu Verify V21 toàn bộ đạt.

## E4/E5 · Nghiệm thu thiết bị

- iPhone Safari/PWA: chọn từ **+ → Thư viện ảnh**, thử cùng lúc 2/4/8 ảnh, ảnh HEIC, nút bỏ ảnh, hủy và chọn lại.
- Trước khi đủ thumbnail, nút Gửi không được gửi một phần; sau khi hoàn tất chọn được gửi cùng một tin.
- Kiểm tra một PDF riêng, chụp camera, ảnh ngang/dọc; đổi khách A→B giữa lúc đang xử lý ảnh, ảnh phải thuộc draft gốc.
- Android Chrome/PWA: nút `Thư viện ảnh` dùng input riêng đã có `multiple`; không đổi luồng này.
- Release `V21.72.80`, epoch public SW `pwa-chat-ui441-ios-multi-photo-selection-20261123`. **CI source pass không thay thế nghiệm thu trên iPhone thực tế**.
