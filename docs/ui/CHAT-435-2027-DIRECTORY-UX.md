# CHAT-435 — Duyệt phương án thay thế danh bạ theo UI 2027/V46

**Ngày:** 23/11/2026 · **Trạng thái:** nhánh PR, chưa xác nhận E4/E5 trên thiết bị · **Owner:** duy nhất vùng layout danh bạ `mobile-ui-polish.css`, trong khối `CHAT-388`. Không thay component/dữ liệu nghiệp vụ.

## E0 — Từ ảnh hiện tại và CSS nguồn

Ảnh duyệt có hai cửa sổ song song: bên trái CHAT danh bạ với header Menu/Trò chuyện/Công việc, ô tìm kiếm, hàng lọc rồi danh sách; bên phải là thư viện cha V46. UX hiện tại chia một tác vụ chọn khách thành ba tầng cố định trước danh sách. Tin công nợ dài làm mỗi hàng cao khác nhau; thời gian nằm ở cột hẹp và tên bị co; các pill nặng cạnh tranh với tên.

Đọc thật `mobile-ui-polish.css`: `CHAT-388` là vùng điều khiển Top 1 (header), Top 2 (search/filter), Content (một scroller). Đường nhập `contact-directory-admin.js` chỉ chứa một input `#contactDirectorySearchInput`. P0 keyboard do `shell-form-viewport-policy.js` quản lý, không được lấy owner tại CSS. Các lớp cũ UI-240/UI-341/UI-359 vẫn tồn tại cho hồi quy và desktop, nhưng khối hiện hành CHAT-388 mới quyết định trình bày mobile ở mức specificity đầy đủ.

## E1 — Phương án được người dùng duyệt

```text
2027 UI-LIBRARY → CHAT-SCREEN → DIRECTORY-REGION
  HEADER (Trò chuyện chính / Công việc phụ, menu 44px)
  SEARCH-TOOLS (một input 16px + nhóm lọc nhẹ có thể mở rộng)
  CONTACT-LIST (một scroll owner, không cuộn toàn trang)
    CONTACT-ROW* (Avatar 40px | Name 20px + Preview 19px | Time 58px)
```

| Trước | Sau theo thư viện 2027 | Lý do |
| --- | --- | --- |
| Tab nổi/pill được tô nền | Tab chữ, selected underline 2px; vẫn 44px hit | Gọn header, giữ khả năng đổi route |
| Nút menu hình tròn có viền | Nút menu không viền, vẫn 44px hit | Giảm hình thừa |
| Search pill 999px | Search field bo 12px, nền/viền theo `ui-*` tokens | Chuẩn hóa hình học từ thư viện cha |
| Bộ lọc chip nền mạnh | Filter chữ, active underline, cùng vùng công cụ | Hạn chế cạnh tranh thị giác |
| Hàng cao thay đổi, preview hai dòng | Hàng có min 68px, preview 1 dòng ellipsis | Quét danh bạ nhanh, nhất quán |
| Time rail 60px | 58px, số căn phải | Trả diện tích cho tên |
| CSS mới chồng cuối file | Sửa ngay chủ `CHAT-388` | Không tạo thêm CSS owner |

**Nguồn thiết kế công khai**: [2027/V46](https://1sl2tp.github.io/2027/), [assistant-ui](https://github.com/assistant-ui/assistant-ui) (ThreadList anatomy và hierarchy), [React Aria](https://github.com/adobe/react-spectrum) (selection/focus/keyboard), [shadcn/ui](https://github.com/shadcn-ui/ui) (primitive semantics). Không sao chép code React, không cài dependency.

## E2 — Phạm vi sửa và kiểm thử

- Chỉ đổi presentation trong owner `CHAT-388`; không ghi thêm CSS ở cuối, không thêm DOM/JS/API.
- Kiểm thử `CHAT-435` xác nhận header/menu 44, input duy nhất 16px, filter và list một scroll owner, one-line preview 68px, rail 58px, keyboard/search mode, ScrollAnchor, cache public.
- Các test CHAT-388/390/393/395, CHAT-432 và UI-240 tiếp tục là hồi quy, **không xóa hoặc nới lỏng để lấy CI xanh**.
- Bump một epoch service worker cho **public shell**; không clear IndexedDB, auth/session, message/media/outbox/drafts.

## E3–E5 & Rollback

E3 chỉ đạt nếu PR Verify V21 thành công, merge đúng SHA, Pages deploy tự động và probe custom domain xác minh bản đang phục vụ. E4/E5 vẫn **CHƯA NGHIỆM THU**: cần chụp iPhone Safari/PWA, Android Chrome/PWA tại 320–430px; normal/filter/search/keyboard/long preview, quay lại danh bạ còn scroll, accessibility/VoiceOver, dark mode.

Rollback: revert đúng commit UI CHAT-435 và public-shell epoch; không xóa thông tin người dùng.
