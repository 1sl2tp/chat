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

## Build locally
Android Studio: open this folder, use Java 17, Android SDK 35, run `app:assembleDebug`.
Github Actions: **Build TAPHOA Agribank Notifier APK** > artifact `TAPHOA-Agribank-Notifier-debug-APK`.

The artifact is a test/debug Android APK; don't treat it as a verified Play Store release.
