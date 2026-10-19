package xyz.taphoa.agrinotifier;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.ComponentName;
import android.provider.Settings;
import android.text.InputType;
import android.widget.*;
import java.util.Arrays;
import java.util.Locale;
public final class MainActivity extends Activity {
 EditText token; TextView state; ScreenAwakeControls screenControls;
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  LinearLayout page=new LinearLayout(this);page.setOrientation(1);page.setPadding(28,45,28,20);
  TextView heading=new TextView(this);heading.setTextSize(21);
  heading.setText("TAPHOA · Nhận thông báo Agribank Plus");page.addView(heading);
  TextView note=new TextView(this);note.setText("Chỉ lấy thông báo của Agribank Plus, không đọc SMS.\n1. Trong Chat > Cài đặt tài khoản, bấm Tạo mã Agribank.\n2. Dán mã vào dưới đây và lưu.\n3. Cấp quyền truy cập thông báo của Android.");page.addView(note);
  token=new EditText(this);token.setHint("Mã kết nối 64 ký tự");token.setSingleLine(true);
  token.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
  token.setText(getSharedPreferences("config",MODE_PRIVATE).getString("device_token",""));page.addView(token);
  Button save=new Button(this);save.setText("Lưu mã kết nối");page.addView(save);
  save.setOnClickListener(v->{
   String value=token.getText().toString().trim().toLowerCase(Locale.ROOT);
   if(!value.matches("[a-f0-9]{48,128}")){state.setText("Mã không hợp lệ.");return;}
   getSharedPreferences("config",MODE_PRIVATE).edit().putString("device_token",value).apply();
   state.setText("Đã lưu mã. Cấp quyền truy cập thông báo.");
  });
  Button enable=new Button(this);enable.setText("Cấp quyền đọc thông báo");page.addView(enable);
  enable.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
  Button verify=new Button(this);verify.setText("Kiểm tra quyền");page.addView(verify);
  verify.setOnClickListener(v->refresh());
  state=new TextView(this);page.addView(state);
  screenControls=ScreenAwakeControls.install(this,page);
  setContentView(page);refresh();
 }
 @Override public void onResume(){super.onResume();if(state!=null)refresh();if(screenControls!=null)screenControls.refresh();}
 void refresh(){
  String allowed=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");
  String component=new ComponentName(this,AgribankNotificationListener.class).flattenToString();
  boolean ok=allowed!=null&&Arrays.asList(allowed.split(":")).contains(component);
  state.setText(ok?"Đã cấp quyền. Đang đợi thông báo tiền vào Agribank Plus.":"Chưa có quyền truy cập thông báo.");
 }
}