# CHAT NEXT — Quy tắc tên phiên bản và vòng sửa

Áp dụng từ **CHAT-NEXT-015 / V15 — Tên phiên bản & nhật ký chỉnh sửa**, 18/11/2026.

> **QUY TẮC BẮT BUỘC:** Trước mỗi lần sửa demo phải đọc đầy đủ [`UI_UX_RULES.md`](./UI_UX_RULES.md). Mọi thay đổi theo cây L0–L5, sửa tại chủ sở hữu cha, không chắp vá. Chỉ nâng phiên bản **đã phát hành** sau khi qua cổng kiểm thử và xuất bản; E4/E5 chưa thử thiết bị thật phải ghi PENDING.

## Hai số phiên bản độc lập

- **CHAT-NEXT-015 / V15**: vòng thiết kế của bản demo giao diện Chat Next, có thể xem ở thanh trên cùng và mở “Nhật ký sửa”. Đây KHÔNG phải phiên bản Chat Web/PWA/APK production.
- **V21.72.39**: phiên bản phát hành riêng của ứng dụng Chat production ở nhánh `main`. Không tăng số V21 khi chỉ sửa demo.

## Bắt buộc ở mọi vòng sửa giao diện tiếp theo

1. Mỗi vòng có mã duy nhất `CHAT-NEXT-NNN`, tên ngắn có nghĩa (ví dụ “Căn trục composer”), ngày VN, mô tả thay đổi, trạng thái nghiệm thu E0–E5.
2. Tăng số vòng một lần cho một tập thay đổi có thể nghiệm thu. Không tái sử dụng số cũ hoặc đánh đồng số commit/CI với vòng giao diện.
3. Đồng bộ `<title>`, `data-design-id`, `data-design-round`, nhãn ngay đầu trang `Vnn`, tiêu đề/lịch sử trong `#versionHistory` và tài liệu này. Số vòng hiển thị trên **mobile lẫn desktop**.
4. Bản nguồn `1sl2tp/chat:design/chat-next-ux-20261118/docs/chat-next/demo/index.html` và bản demo xuất bản `1sl2tp/songoku:demos/chat-next/index.html` phải có cùng nội dung. Kiểm thử trên nhánh riêng của Songoku, CI đạt rồi mới merge. Không tự sửa Chat production hoặc dữ liệu thật.
5. CI phải chặn phiên bản không đồng nhất. Khi sửa demo, tăng `V` ở nguồn, cập nhật lịch sử, đồng bộ sang Songoku và kiểm thử trước khi phát hành. Không gọi phiên bản đã xuất bản nếu Pages chưa đạt. Bản sửa lỗi test cũng thuộc vòng đang phát triển, không tự coi là bản phát hành mới.
6. Không đánh dấu E4/E5 đạt nếu chưa có kiểm thử trình duyệt/thiết bị thực tế. Báo cáo cùng mỗi vòng: tên, số, mục sửa, bằng chứng kiểm thử, link demo và commit.

## Quy tắc phân công: Demo thiết kế, Chat production tham chiếu hành vi

**Nguồn chuẩn:** CHAT NEXT chỉ chịu trách nhiệm thiết kế bố cục, hình học, phân cấp nội dung, token giao diện, mô tả tương tác, kịch bản và nghiệm thu. Ứng dụng `1sl2tp/chat` trên `main` là nguồn tham khảo ưu tiên cho các hành vi đã chạy ổn định. Không sao chép bừa code, không chỉnh production để phục vụ demo.

### Trình tự bắt buộc cho mỗi hạng mục

1. **Khảo sát:** xác định mục đích người dùng, vùng giao diện, nút/trạng thái, thiết bị và màn hình; chụp hiện trạng demo và xác định điểm lệch.
2. **Tra cứu Chat hiện tại:** tìm chính xác module và test sở hữu hành vi; đọc rule/skill liên quan; ghi `file/module`, điều kiện kích hoạt, kết quả, trạng thái lỗi. Nếu Chat chưa có hành vi đó, ghi rõ **CHƯA CÓ**, không tự gán là chuẩn.
3. **Đặc tả:** lập bảng `màn hình → thành phần → sự kiện → hành vi tham chiếu → trạng thái hiển thị → điều kiện nghiệm thu`; phân biệt mô phỏng demo và hành động thật.
4. **Thiết kế:** chỉ thay đổi phần bố cục/hình học/copy của CHAT NEXT cần thiết; ưu tiên một chủ sở hữu cho viewport, vùng cuộn và composer. Không tự tạo cơ chế nghiệp vụ/đồng bộ/đẩy thông báo mới trong demo.
5. **Kiểm thử:** desktop, iPhone Safari/PWA, Android Chrome/PWA; mở/đóng bàn phím, nhập nhiều dòng, tin cuối, đọc tin cũ, ảnh dài, popup, Back; test tĩnh không thay thế E4/E5.
6. **Phát hành:** đồng bộ mã demo từ Chat design sang Songoku, CI hai repo đạt mới gộp, Pages đạt mới báo xuất bản. Nếu chưa đạt, giữ nguyên số vòng và sửa tiếp.
7. **Nhật ký:** mỗi vòng giao diện ghi mục sửa, nguồn tham chiếu Chat, ảnh/log/CI/Pages, trạng thái E0–E5, vấn đề tồn đọng. Sửa tài liệu quy tắc hoặc test trong cùng vòng không tự tăng số V.

### Danh mục cần chuẩn hóa

| Hạng mục | Demo CHAT NEXT chịu trách nhiệm | Nguồn hành vi ưu tiên |
|---|---|---|
| Khung màn hình, trục, khoảng cách, typography | Token L0–L5, kích thước, trạng thái và responsive | Đối chiếu giao diện Chat đang chạy |
| Danh sách hội thoại, mở chat, Back | Hình thức danh sách, preview, điều hướng mô phỏng | Chat hiện tại: route, scroll restore, draft |
| Ô nhập và bàn phím | Bố cục header/content/composer, không che tin cuối | `keyboard-inset-core.js`, `shell-form-viewport-policy.js`, skill `keyboard-viewport` và owner composer thực tế |
| Ảnh/media và popup | Grid ảnh, viewer, safe-area, vị trí overlay | Chat hiện tại: media/viewer và overlay |
| Tìm kiếm, menu, chia sẻ | Phân cấp nút, trạng thái mở/đóng, empty/error | Chat hiện tại: chức năng tương ứng |
| Gửi/nhận, realtime, thông báo | Chỉ trạng thái mẫu và kịch bản kiểm thử | Chat hiện tại; demo không gửi thật |

**Quy tắc riêng cho lỗi bàn phím V27–V30:** không thêm cơ chế neo/cuộn mới nếu chưa xác minh chủ sở hữu trong Chat production. Lấy cơ chế thực tế của Chat làm chuẩn hành vi, còn demo chỉ thể hiện khung và các trạng thái. Nghiệm thu cần thấy tin cuối (kể cả thời gian) ngay phía trên composer khi bàn phím mở, và giữ vị trí khi đọc tin cũ.

## Ứng viên thiết kế chưa phát hành (19/11/2026)

- **CHAT-NEXT-032 / V32 — Header thích ứng theo trạng thái**: nguyên mẫu độc lập tại `docs/chat-next/v32/index.html`, nhánh `design/chat-next-v32-adaptive-header-20261119`. Màn mobile: bình thường 48px; cuộn đọc 0px, kéo ngược thì Header nổi; mở bàn phím thật/giả lập 44px. Chỉ Conversation được cuộn, điểm đọc được bù theo tọa độ vùng cha. Phân biệt rõ main demo V30, khung V31 và bản ứng viên V32; **chưa đồng bộ Songoku/Pages hoặc sửa Chat production**. E0/E1 có mã và tài liệu; E2 kiểm tra nguồn/cú pháp; E3/E4/E5 PENDING cho tới khi có bằng chứng CI, Pages và nghiệm thu thật. Không ghi đây là phiên bản phát hành.

## Nhật ký gần nhất

| Vòng | Tên | Ngày | Phạm vi |
|---|---|---|---|
| V30 | Đo hình học tin cuối khi bật bàn phím | 18/11/2026 | So mép dưới tin cuối với vùng cuộn và bù vị trí; grid tự phân phối chiều cao; chỉ demo |
| V29 | Đồng bộ cuộn tin cuối khi bàn phím đổi kích thước | 18/11/2026 | ResizeObserver vùng đọc/nội dung và grid tracks, chỉ neo cuối khi đang ở cuối; chỉ demo |
| V28 | Giữ tin cuối khi bàn phím mở | 18/11/2026 | Neo đáy hội thoại sau khi VisualViewport thay đổi; giữ vị trí khi đọc tin cũ; chỉ demo |
| V27 | Vùng nhập nằm trên bàn phím iPhone | 18/11/2026 | VisualViewport giới hạn toàn khung, không cộng safe-area khi bàn phím mở; chỉ demo |
| V26 | Mở chat tại tin cuối và ô nhập | 18/11/2026 | Nhấn hội thoại luôn đến cuối, focus input sau khi chuyển màn; browser history giữ vị trí; chỉ demo |
| V25 | Sửa nhật ký trên iPhone | 18/11/2026 | Khắc phục bảng lịch sử bị cắt mép trái, neo theo viewport, cuộn riêng; chỉ demo |
| V24 | Đồng bộ phiên bản và kiểm tra CI | 18/11/2026 | Mỗi vòng sửa có V riêng; test bắt buộc nhãn, ID, lịch sử khớp nhau; chỉ demo |
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
