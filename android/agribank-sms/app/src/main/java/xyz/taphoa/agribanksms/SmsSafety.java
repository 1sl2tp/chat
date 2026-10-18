package xyz.taphoa.agribanksms;

import java.text.Normalizer;
import java.util.Locale;

final class SmsSafety {
    private SmsSafety() {}

    static boolean isAgribankSender(String sender) {
        if (sender == null) return false;
        String s = sender.trim().toUpperCase(Locale.ROOT);
        return s.equals("AGRIBANK") || s.matches("^[A-Z]{2}-AGRIBANK$");
    }

    static boolean appearsSensitive(String message) {
        if (message == null || message.isEmpty()) return true;
        String s = Normalizer.normalize(message, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").toUpperCase(Locale.ROOT);
        return s.contains("OTP") || s.contains("ONE TIME PASSWORD")
                || s.contains("MA XAC THUC") || s.contains("MA BAO MAT")
                || s.contains("MA DANG NHAP") || s.contains("MA KICH HOAT")
                || s.contains("MAT KHAU") || s.contains("PASSWORD")
                || s.contains("PIN CODE") || s.contains("MA PIN");
    }
}
