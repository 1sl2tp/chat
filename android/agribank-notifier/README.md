# TAPHOA – Agribank Plus notification listener

Android APK for the official Agribank Plus package `com.vnpay.Agribank3g`.
No SMS permission, no Accessibility permission, no bank login or service key.
Android requires the owner to explicitly grant notification access in Android Settings.

## Install / pair
1. In Agribank Plus, enable OTT / account balance change push notifications.
2. In Chat, Admin > Cài đặt tài khoản > **Tạo mã Agribank**, copy the token.
3. Download the APK from GitHub Actions workflow artifact, install it on the same Android phone that receives Agribank Plus notifications.
4. In TAPHOA notifier paste and save token, then **Cấp quyền đọc thông báo** using Android system settings.
5. Check the Supabase table `taphoa_agribank_notifications` when a **real credit notification** arrives. Each notification is stored once; OTP is rejected.

This listener forwards app notifications from one exact package. No other app is queried. Android may not deliver notifications when disabled, silenced, restricted by battery policy, or if Agribank hides the amount; unrecognized content is not considered a verified credit. Unknown bank formats need read-only adaptation after observing the real text.

The APK does NOT change the user's debt ledger. The existing bank bill reader and financial release controls stay separate.

## Giữ màn hình sáng (tùy chọn, chỉ khi người dùng cho phép)

Từ APK TAPHOA > **Giữ màn hình sáng khi trực Agribank**:

- **Giữ màn hình sáng khi đang mở TAPHOA** chỉ dùng Android `FLAG_KEEP_SCREEN_ON`, không cần quyền. Khi chuyển sang Agribank Plus, chế độ này không còn tác dụng.
- Để tăng thời gian tự tắt màn hình **trên cả điện thoại**, bấm **Cấp quyền thay đổi thời gian tắt màn hình** rồi bật quyền Android “Cho phép sửa cài đặt hệ thống”. Quay lại TAPHOA, chọn **15 phút, 30 phút, 1 giờ, 6 giờ, 24 giờ**, bấm **Áp dụng**, đồng ý hộp thoại cảnh báo. Không tự động thay đổi cài đặt chỉ nhờ quyền được cấp.
- Bấm **Khôi phục thời gian màn hình cũ** để trả lại giá trị trước khi TAPHOA đổi. Nếu người dùng đã thay đổi thủ công trong Cài đặt hệ thống thì TAPHOA **không ghi đè** lại.
- Để giữ sáng khi Agribank Plus nằm ở màn hình trước, cần dùng cách thay đổi thời gian tắt màn hình hệ thống, **không phải** tính năng giữ sáng khi chỉ mở TAPHOA.
- Đây **không phải cơ chế bỏ khóa**: nút nguồn, PIN, vân tay, mật khẩu và giới hạn thiết bị do Android/nhà sản xuất áp dụng vẫn giữ nguyên. Màn hình sáng không bảo đảm Agribank Plus nhận push tức thì. Đặc biệt cẩn thận khi đặt 24 giờ trên điện thoại có tài khoản ngân hàng: hao pin, nóng và nguy cơ người khác xem được thông tin nếu máy đang mở.
- Có thể dùng **Tùy chọn nhà phát triển > Luôn bật màn hình khi sạc (Stay awake)** trên một điện thoại trực riêng đang cắm sạc, không cần cấp WRITE_SETTINGS cho TAPHOA. Khi cài lại bản debug APK từ CI, chữ ký có thể đổi; cần lưu mã kết nối và có thể phải gỡ/cài lại, cấp lại quyền đọc thông báo.

## Build locally
Android Studio: open this folder, use Java 17, Android SDK 35, run `app:assembleDebug`.
Github Actions: **Build TAPHOA Agribank Notifier APK** > artifact `TAPHOA-Agribank-Notifier-debug-APK`.

The artifact is a test/debug Android APK; don't treat it as a verified Play Store release.
