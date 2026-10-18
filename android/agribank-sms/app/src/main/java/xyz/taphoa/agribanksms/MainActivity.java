package xyz.taphoa.agribanksms;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Telephony;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Offline SMS reader. No INTERNET permission or banking ledger writes. */
public final class MainActivity extends Activity {
    private final int NAVY = Color.rgb(14,31,58);
    private final int GREEN = Color.rgb(18,113,79);
    private final int MUTED = Color.rgb(95,108,127);
    private LinearLayout root, results;
    private TextView summary, permissionText;

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable round(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color); d.setCornerRadius(dp(14)); return d;
    }
    private TextView text(String body, int size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(body); t.setTextSize(size); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(NAVY);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(245,248,251));
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18),dp(22),dp(18),dp(26));
        scroll.addView(root);
        setContentView(scroll);

        root.addView(text("TAPHOA  /  SMS BANKING",12,GREEN,true));
        TextView heading = text("Tin nhắn Agribank",27,NAVY,true);
        heading.setPadding(0,dp(10),0,dp(5));
        root.addView(heading);
        root.addView(text("Bản thử 0.1 · Chỉ đọc tại điện thoại",14,MUTED,false));

        LinearLayout notice = new LinearLayout(this);
        notice.setOrientation(LinearLayout.VERTICAL);
        notice.setPadding(dp(14),dp(14),dp(14),dp(14));
        notice.setBackground(round(Color.WHITE));
        LinearLayout.LayoutParams noticeLayout = new LinearLayout.LayoutParams(-1,-2);
        noticeLayout.setMargins(0,dp(18),0,dp(18));
        root.addView(notice,noticeLayout);
        notice.addView(text("KHÔNG KẾT NỐI INTERNET",13,GREEN,true));
        TextView desc = text("Chỉ xem SMS gửi từ AGRIBANK. Tin OTP và mật khẩu được ẩn. Chưa gửi lên TAPHOA, chưa xác nhận tiền vào, chưa ghi thu.",14,NAVY,false);
        desc.setPadding(0,dp(8),0,0);
        notice.addView(desc);

        permissionText = text("",14,NAVY,true);
        root.addView(permissionText);
        Button allow = new Button(this);
        allow.setText("Cấp quyền SMS");
        allow.setAllCaps(false);
        allow.setOnClickListener(v -> requestPermissions(
                new String[]{Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS},41));
        root.addView(allow);
        Button refresh = new Button(this);
        refresh.setText("Làm mới danh sách");
        refresh.setAllCaps(false);
        refresh.setOnClickListener(v -> loadMessages());
        root.addView(refresh);

        summary = text("",16,NAVY,true);
        summary.setPadding(0,dp(16),0,dp(12));
        root.addView(summary);
        results = new LinearLayout(this);
        results.setOrientation(LinearLayout.VERTICAL);
        root.addView(results);
        TextView footer = text("SMS có thể bị giả mạo người gửi. Ứng dụng chỉ phục vụ kiểm tra thử, không phải xác nhận ngân hàng đã nhận tiền.",12,MUTED,false);
        footer.setPadding(0,dp(20),0,0);
        root.addView(footer);
    }
    @Override protected void onResume() { super.onResume(); loadMessages(); }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if (requestCode == 41) loadMessages();
    }
    private boolean allowed() {
        return checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
    }
    private void message(String s) {
        TextView t = text(s,14,MUTED,false);
        t.setPadding(dp(4),dp(8),dp(4),dp(8));
        results.addView(t);
    }
    private void loadMessages() {
        if (results == null) return;
        results.removeAllViews();
        if (!allowed()) {
            permissionText.setText("Chưa có quyền đọc và nhận SMS");
            summary.setText("Nhấn 'Cấp quyền SMS' để bắt đầu");
            return;
        }
        permissionText.setText("✓ Đã cấp quyền SMS");
        int count = 0;
        try (Cursor cursor = getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI,
                new String[]{Telephony.Sms.ADDRESS,Telephony.Sms.BODY,Telephony.Sms.DATE},
                Telephony.Sms.ADDRESS + " LIKE ?",
                new String[]{"%AGRIBANK"},
                Telephony.Sms.DEFAULT_SORT_ORDER)) {
            if (cursor != null) {
                int address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS);
                int body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY);
                int date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE);
                while (cursor.moveToNext() && count < 100) {
                    String sender = cursor.getString(address);
                    String content = cursor.getString(body);
                    if (!SmsSafety.isAgribankSender(sender)
                            || SmsSafety.appearsSensitive(content)) continue;
                    addItem(sender,content,cursor.getLong(date));
                    count++;
                }
            }
            summary.setText("Số tin Agribank: " + count);
            if (count == 0) message("Chưa thấy SMS Agribank. Hãy kiểm tra SIM và dịch vụ SMS Banking.");
        } catch (SecurityException e) {
            summary.setText("Chưa được Android cấp quyền SMS");
            message("Hãy vào Cài đặt > Ứng dụng > TAPHOA SMS Agribank > Quyền.");
        } catch (RuntimeException e) {
            summary.setText("Chưa đọc được hộp thư SMS");
            message("Điện thoại hoặc ứng dụng SMS mặc định không cho phép truy vấn.");
        }
    }
    private void addItem(String sender,String body,long time) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14),dp(14),dp(14),dp(14));
        card.setBackground(round(Color.WHITE));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,0,0,dp(10));
        results.addView(card,p);
        String when = new SimpleDateFormat("dd/MM/yyyy HH:mm",new Locale("vi","VN"))
                .format(new Date(time));
        card.addView(text(sender + "  •  " + when,13,GREEN,true));
        TextView content = text(body,14,NAVY,false);
        content.setPadding(0,dp(9),0,0);
        content.setTextIsSelectable(true);
        content.setMaxLines(12);
        content.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(content);
    }
}
