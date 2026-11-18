# CHAT-NEXT-016 — Căn trục ô gõ và nội dung

**Ngày**: 18/11/2026 (VN) · **Kênh**: demo-design, không phải Chat V21 production.

## Given / When / Then

- Given: Trên desktop Chromium/Firefox với scrollbar chiếm chiều ngang, khung tin nhắn V14 có thể bị dịch so với header/composer/note; khi mở thread dài hoặc nhập nhiều dòng dễ nhận ra.
- When: Mở bản demo và một hội thoại, nhập một hoặc nhiều dòng, xem ở 320, 360, 375, 390, 414, 430, 1024, 1280, 1440 và 1920px.
- Then: L4 dùng cùng trục cho các dải, thanh cuộn hội thoại vẫn hoạt động bằng wheel/trackpad/touch nhưng track không chiếm bề ngang; L5 giữ 2 nút vuông bằng nhau, gap đối xứng, đáy ô gõ và nút gửi ngang nhau, lề chữ theo token.

## Owner và thông số khóa

- **L4**: `chat-width` V14 là chủ sở hữu, V16 chỉ loại bỏ độ lệch do độ rộng scrollbar trong `.conversation`. Không đổi `scrollTop`, virtualization, DOM message, hoặc thêm custom wheel/touch handlers.
- **L5**: `--frame-control` 48px (≤360px: 44px), `--frame-control-gap` 8px (≤360px: 6px), `--frame-input-pad-x` 14px (≤360px: 12px), `--frame-input-pad-y` 11px; dòng 24px, tối đa 120px. Field 16px nhằm tránh iOS auto-zoom. Input vẫn là textarea native, cuộn bên trong khi nhiều dòng.
- **Đo thực**: `?geometry=1#chat/lan` bật panel đo `getBoundingClientRect` cho L4 và L5: độ rộng 2 nút, 2 khoảng trống, lề chữ, sai số đáy. Mốc 1px là ngưỡng nghiệm thu thiết kế, không phải tự tuyên bố E4.
- **Tradeoff**: Trên desktop thanh scrollbar hội thoại được ẩn *về hình*, nhưng cuộn chuột/trackpad vẫn native. Cần thử khả năng phát hiện vùng cuộn và hỗ trợ truy cập khi dùng thực tế; nếu bất tiện, không nhập V16 vào production khi chưa có phương án scrollbar đối xứng.

## MUST-STAY / negative / rollback

- Không nối mạng, đăng nhập, gửi tin thật, thu tiền, sửa Zalo/Supabase/Chat main hay build APK. Demo chỉ RAM và static Pages.
- Không thêm polling, listeners cho việc gõ/scroll ở trạng thái bình thường; kiểm toán chỉ chạy khi user tự thêm `?geometry=1`.
- Giữ Back, tìm kiếm, danh bạ, tin dài và ảnh giả lập, nút gửi chỉ thêm nháp local.
- E2: chạy Node VM demo harness + static contract trên Chat/Songoku; E3: CI 2 repo + Pages.
- E4/E5 **PENDING** đến khi test iPhone Safari/PWA, Android Chrome/PWA và desktop với scrollbar classic/overlay, mở bàn phím, gõ 1/5/8 dòng, cuộn, focus.
- Rollback: revert khối CSS V16, phép đo L5 và nhãn V16; không động DB.
