package xyz.taphoa.agribanksms;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Telephony;
import android.text.InputType;
import android.widget.*;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class MainActivity extends Activity {
    private LinearLayout layout;
    private TextView status,oldMessages;
    private EditText token;
    private SharedPreferences prefs;
    private int ink=Color.rgb(16,39,66), green=Color.rgb(17,119,71);
    private TextView line(String text,int sp,boolean emphasized){
        TextView view=new TextView(this);
        view.setText(text);view.setTextSize(sp);view.setTextColor(emphasized?green:ink);
        view.setPadding(0,13,0,13);return view;
    }
    private Button action(String title,Runnable task) {
        Button b=new Button(this);b.setText(title);b.setAllCaps(false);
        b.setOnClickListener(v->task.run());return b;
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        prefs=getSharedPreferences(SmsSyncWorker.PREFS,Context.MODE_PRIVATE);
        ScrollView scroll=new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(245,248,251));
        layout=new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int dp=(int)(18*getResources().getDisplayMetrics().density);
        layout.setPadding(dp,dp,dp,dp);
        scroll.addView(layout);setContentView(scroll);
        layout.addView(line("TAPHOA · SMS AGRIBANK v0.2",24,true));
        layout.addView(line("Chỉ SMS mới gửi lên Supabase. Tin cũ hiển thị để xem; chưa ghi thu và chưa phân loại.",14,false));
        layout.addView(action("Cấp quyền đọc / nhận SMS",()->
           requestPermissions(new String[]{Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS},41)));
        layout.addView(line("Kết nối Supabase",19,true));
        layout.addView(line("Nhập mã thiết bị TAPHOA được cấp riêng. KHÔNG nhập OTP hoặc mật khẩu ngân hàng.",13,false));
        token=new EditText(this);token.setHint("Mã kết nối 48 ký tự");
        token.setSingleLine(true);
        token.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(prefs.getString("token",""));
        layout.addView(token);
        layout.addView(action("Lưu mã và đồng bộ",()->{
            String value=token.getText().toString().trim();
            if(!value.matches("[a-f0-9]{48,128}")) {
                status.setText("Mã không hợp lệ; cần 48–128 ký tự HEX.");
                return;
            }
            prefs.edit().putString("token",value).putString("error","Đã lưu mã, chờ SMS mới").apply();
            SmsSyncWorker.schedule(this);
            refreshStatus();
        }));
        layout.addView(line("Trạng thái tự nhận SMS",19,true));
        status=line("",14,false);layout.addView(status);
        layout.addView(action("Kiểm tra trạng thái / Gửi lại",()->{
            SmsSyncWorker.schedule(this);refreshStatus();loadOldMessages();
        }));
        layout.addView(line("SMS AGRIBANK cũ (chỉ xem)",17,true));
        oldMessages=line("",13,false);layout.addView(oldMessages);
        layout.addView(line("Ghi chú: tự nhận SMS khi màn hình khóa / vuốt đóng ứng dụng, nếu Android cho phép chạy nền. Force stop, tắt nguồn hoặc tắt quyền SMS sẽ làm ngừng nhận.",12,false));
        refreshStatus();loadOldMessages();
    }
    private String format(long ms) {
        if(ms<=0)return "Chưa có";
        return new SimpleDateFormat("dd/MM/yyyy HH:mm:ss",new Locale("vi","VN")).format(new Date(ms));
    }
    private void refreshStatus(){
        if(status==null)return;
        boolean allowed=checkSelfPermission(Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED;
        String tokenValue=prefs.getString("token","");
        try(SmsStore db=new SmsStore(this)){
            status.setText("Quyền SMS: "+(allowed?"Đã cấp":"CHƯA CẤP")
               +"\nMã Supabase: "+(tokenValue.matches("[a-f0-9]{48,128}")?"Đã lưu":"CHƯA NHẬP")
               +"\nSMS nền nhận gần nhất: "+format(prefs.getLong("last_received",0))
               +"\nChưa gửi: "+db.count(0)+" tin"
               +"\nĐã gửi thành công: "+db.count(1)+" tin"
               +"\nĐồng bộ gần nhất: "+format(prefs.getLong("last_sync",0))
               +"\nTrạng thái: "+prefs.getString("error","Chưa gửi lần nào"));
        }catch(Exception ex){status.setText("Không đọc được hàng đợi SMS.");}
    }
    private void loadOldMessages(){
        if(oldMessages==null)return;
        if(checkSelfPermission(Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED){
            oldMessages.setText("Cần cấp quyền SMS.");return;
        }
        StringBuilder out=new StringBuilder();
        try(Cursor c=getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI,
            new String[]{Telephony.Sms.ADDRESS,Telephony.Sms.BODY,Telephony.Sms.DATE},
            Telephony.Sms.ADDRESS+" LIKE ?",new String[]{"%AGRIBANK"},
            Telephony.Sms.DEFAULT_SORT_ORDER)){
            if(c!=null)while(c.moveToNext()&&out.length()<16000){
                String sender=c.getString(0),body=c.getString(1);
                if(!SmsSafety.isAgribankSender(sender)||SmsSafety.appearsSensitive(body))continue;
                out.append(sender).append(" · ").append(format(c.getLong(2)))
                    .append("\n").append(body).append("\n\n");
            }
        }catch(Exception e){out.append("Không đọc được hộp thư SMS.");}
        oldMessages.setText(out.length()==0?"Chưa có tin Agribank phù hợp.":out.toString());
        oldMessages.setTextIsSelectable(true);
    }
    @Override protected void onResume(){
        super.onResume();refreshStatus();loadOldMessages();SmsSyncWorker.schedule(this);
    }
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] results){
        super.onRequestPermissionsResult(code,names,results);
        if(code==41){refreshStatus();loadOldMessages();}
    }
}