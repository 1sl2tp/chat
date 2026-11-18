# CHAT NEXT V32 — Header theo ngữ cảnh (ứng viên, chưa phát hành)

Ngày: 19/11/2026 · Chỉ là **wireframe chạy thử**, tách biệt Chat V21 production và demo V30.

## Chủ sở hữu L0–L5
- L1 `.shell`: một chiều cao hiển thị; trên touch sử dụng VisualViewport khi bàn phím thật mở, không bổ sung container cuộn.
- L2 `.chat`: một grid chia chỗ cho Header / Conversation / Composer; vùng keyboard mô phỏng chỉ xuất hiện khi thử `?states=1`.
- L3 `.chat-header`: trạng thái NORMAL 48px, READING 0px, TYPING 44px ở mobile. Desktop giữ khung đang có.
- L3 `.conversation`: **duy nhất vùng cuộn tin nhắn**. Khi row Header đổi kích thước, bù `scrollTop` theo chênh tọa độ top để giữ điểm đọc; đang theo đuôi thì giữ đuôi.
- L3 `.composer`: chiếm chiều cao nội dung riêng; ô nhập không tự sở hữu keyboard viewport.
- L4/L5: nút Back luôn đạt 44px khi hiển thị; nhận diện khách ở normal; khi typing ẩn avatar và hành động phụ.

## Hành vi chính/phụ
- Bình thường: nút quay lại, tên khách; gọi và tùy chọn là phụ.
- Cuộn xuống đọc lịch sử: Header **ra khỏi grid** (0px), lấy chỗ cho Conversation.
- Cuộn ngược: Header trở lại **dạng nổi** với `data-header-peek=true`, không chiếm lại row, không đổi scrollTop.
- Về đầu lịch sử: khôi phục Header bình thường.
- Bàn phím mở: Header 44px giữ Back + tên; ẩn gọi/menu/avatar; Composer vẫn nằm trên native keyboard, vùng tin nhận diện tích còn lại.
- Chuyển khách: bản nháp giữ riêng trong RAM, chưa gửi thật. Không đọc/gửi dữ liệu thật.

## Kiểm thử
- Mở `index.html?states=1#chat` trên mobile/narrow để dùng ba nút trạng thái **Bình thường / Cuộn đọc / Bàn phím**.
- Thử cuộn tin xuống rồi lên: header biến mất và nổi trở lại; khi cuộn đọc, tin đang nhìn không được nhảy.
- Bấm ô gõ với bàn phím thật trên Safari/Chrome: xác minh vùng nhập và tin cuối, nhập 1/2/5/8 dòng, thử dấu tiếng Việt/IME.
- Chuyển giữa Lan/Minh/Nhóm công việc: đúng tên, bản nháp riêng; Back và ô tìm kiếm.
- Test breakpoint 320/360/375/390/430, tablet touch, desktop rộng. Thử xoay màn và safe-area.
- E0: ảnh + quy tắc kiến trúc + mã V31 đối chiếu. E1: V32 ở nhánh riêng. E2: biên dịch JS và kiểm hợp đồng nguồn (chưa phải ảnh thật). E3/E4/E5: PENDING cho tới khi có CI, Pages và phép đo thiết bị thực.

**Không thay** `main`, `index.source.html`, Supabase, Zalo, media, push, Realtime hoặc cơ sở dữ liệu. Không coi URL raw preview là GitHub Pages đã phát hành.
