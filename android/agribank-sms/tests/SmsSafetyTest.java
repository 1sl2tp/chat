package xyz.taphoa.agribanksms;
public final class SmsSafetyTest {
    public static void main(String[] args) {
        require(SmsSafety.isAgribankSender("AGRIBANK"));
        require(SmsSafety.isAgribankSender("VM-AGRIBANK"));
        require(SmsSafety.isAgribankSender("AM-AGRIBANK"));
        require(!SmsSafety.isAgribankSender("MYAGRIBANK"));
        require(!SmsSafety.isAgribankSender("AGRIBANK-FAKE"));
        require(!SmsSafety.isAgribankSender("VIETINBANK"));
        require(!SmsSafety.appearsSensitive("TK 123 ghi có +648.000 VND"));
        require(SmsSafety.appearsSensitive("Ma OTP: 123456"));
        require(SmsSafety.appearsSensitive("Mã xác thực: 123456"));
        require(SmsSafety.appearsSensitive("Mật khẩu đăng nhập 123456"));
        System.out.println("SMS_FILTER_TESTS_PASS");
    }
    private static void require(boolean good){ if(!good) throw new AssertionError("SMS filter failed"); }
}
