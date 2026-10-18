# TAPHOA SMS Agribank v0.1
Android 8+ local SMS reader. Only messages from \`AGRIBANK\` (or two-letter carrier prefix \`VM-AGRIBANK\`) are shown. Messages that contain OTP, passwords or verification-code markers are ignored.

No INTERNET permission. No network connections. No debt ledger changes. SMS sender branding can be spoofed and is not proof of funds.

Install the unsigned-from-Play but **debug-signed** APK from the Actions artifact; open app and grant READ_SMS/RECEIVE_SMS; tap "Làm mới danh sách".
Build: Gradle 8.9, AGP 8.7.3, Android SDK 35, Java 17.
