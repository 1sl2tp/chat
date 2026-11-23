# CHAT-440 — Chỉ một nguồn hiển thị thông báo theo màn đang xem

Nguồn sự cố: ảnh iPhone 17:26 ngày 23/11/2026 có banner OS “C Hường dv” khi chính hội thoại đang hiển thị tin mới. Hiện trạng có hai nguồn UI: native iOS Web Push và in-app toast / danh bạ / hội thoại.

## Ma trận hiển thị chính/phụ

| Bối cảnh | Banner hệ điều hành | Toast trong Chat | Dấu chưa đọc / xem trước |
|---|---|---|---|
| Khóa màn hình / app nền | Có, một lần theo ID tin | Không | Đồng bộ từ sổ tin chưa đọc |
| Mở khóa, đang ở danh bạ mobile | Không | Không | Dòng đúng khách hiện bản xem trước + chưa đọc |
| Mở khóa, đang ở hội thoại nhận tin | Không | Không | Tin xuất hiện trực tiếp trong hội thoại |
| Mở khóa, đang ở hội thoại khách khác | Không (PWA mobile) | Một toast gọn; click tới đúng chat | Dòng khách gửi có trạng thái chưa đọc |
| Không có client foreground xác minh được | Có | Không từ client nền | Đồng bộ khi mở app |
| Cuộc gọi / lời mời / thông báo nghiệp vụ | Giữ quy tắc riêng | Giữ quy tắc riêng | Không trộn vào unread Chat |

## Sửa tại owner, không tạo owner mới

- `admin-push-controller.js`: trạng thái mobile-directory riêng, không dùng `activeContact` lưu từ lần xem trước để nhận là hội thoại đang đọc. Danh bạ đã có unread + preview nên không tạo toast thứ hai.
- `sw.js`: tăng thời gian hỏi trạng thái live iOS khi bàn phím/khóa màn hình đang chuyển tiếp (220 → 700 ms); không tin cache trạng thái foreground khi WebKit treo do khóa màn hình. Khi chọn đúng thread, đóng notification đã lưu của thread ấy, không đóng của khách khác.
- Chỉ dedup OS Push khi `message_id` **giống hệt** (không dựa vào cùng nội dung, người gửi hoặc thời điểm); SW giữ khóa tạm giới hạn 150 ID và đối chiếu notification đang hiển thị sau worker restart. Tin thực sự mới cùng khách vẫn được hiển thị riêng.
- Push `ADMIN_PUSH_MESSAGE_DIRTY` vẫn luôn chuyển cho SyncEngine để cập nhật danh bạ và hội thoại. Không tự thêm unread từ một bản Push lặp.
- Không sửa dữ liệu tin, backend, Zalo, xác minh bill hoặc thu tiền; không gửi tin thật trong các test.

## E0–E5

- E0: ảnh lỗi 17:26; có native banner trùng khi hội thoại đang hiển thị.
- E1: quy tắc cha/con một nguồn báo mỗi màn, không tạo UI banner phụ.
- E2: thay hai owner có sẵn và sửa chính regression runtime SW/controller.
- E3: chạy `test_v21_admin_web_push_sw_runtime.js`, `test_v21_admin_web_push_controller.js`, `test_chat440_contextual_push_policy_20261123.cjs` và toàn bộ Verify V21.
- E4: cần xác nhận trực tiếp iPhone PWA mở/khoá, danh bạ, A→B, bàn phím mở, khi WebKit trả lời chậm, Android PWA và desktop.
- E5: chỉ gộp khi CI xanh. Release `V21.72.79` + PWA public-shell cache epoch mới; **không xóa auth, tin, ảnh, nháp hoặc outbox**.

Lưu ý: iOS có thể hiển thị notification nếu ứng dụng bị hệ điều hành treo hoặc không thể trả lời truy vấn foreground; trong trường hợp đó ưu tiên không làm mất tin nhắn trên màn hình khóa. Chỉ đánh giá hết trùng banner sau nghiệm thu thực.
