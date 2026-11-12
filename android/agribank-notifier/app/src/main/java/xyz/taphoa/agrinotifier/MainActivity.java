package xyz.taphoa.agrinotifier;
import android.app.Activity;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.Intent;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.text.format.DateFormat;
import android.widget.*;
import java.util.Arrays;
import java.util.Locale;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/** BANK-304: show why a bank notification has not reached Supabase. */
public final class MainActivity extends Activity {
 EditText token; TextView state; TextView diagnostics;
 ScreenAwakeControls screenControls;
 private static final java.util.concurrent.ExecutorService NET=Executors.newSingleThreadExecutor();
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  LinearLayout page=new LinearLayout(this);page.setOrientation(1);page.setPadding(28,45,28,20);
  TextView heading=new TextView(this);heading.setTextSize(21);
  heading.setText("TAPHOA · Nhận thông báo Agribank Plus");page.addView(heading);
  TextView note=new TextView(this);note.setText(
   "Chỉ chuyển thông báo Agribank Plus (không đọc SMS, OTP)."+
   "\n1. Tạo mã Agribank trong Cài đặt tài khoản Chat."+
   "\n2. Lưu mã ở đây, rồi cấp quyền truy cập thông báo Android."+
   "\n3. Bấm Kiểm tra kết nối máy chủ để xác nhận mã và mạng, KHÔNG tạo giao dịch.");
  page.addView(note);
  token=new EditText(this);token.setHint("Mã kết nối 64 ký tự");token.setSingleLine(true);
  token.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
  token.setText(getSharedPreferences("config",MODE_PRIVATE).getString("device_token",""));page.addView(token);
  Button save=new Button(this);save.setText("Lưu mã kết nối");page.addView(save);
  save.setOnClickListener(v->{
   String value=token.getText().toString().trim().toLowerCase(Locale.ROOT);
   if(!value.matches("[a-f0-9]{48,128}")){state.setText("Mã không hợp lệ.");return;}
   getSharedPreferences("config",MODE_PRIVATE).edit()
     .putString("device_token",value).putString("last_upload_error","").apply();
   refresh();
  });
  Button enable=new Button(this);enable.setText("Cấp quyền đọc thông báo");
  page.addView(enable);
  enable.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
  Button verify=new Button(this);verify.setText("Kiểm tra quyền");
  page.addView(verify);verify.setOnClickListener(v->refresh());
  Button probe=new Button(this);probe.setText("Kiểm tra kết nối máy chủ (không gửi bill)");
  page.addView(probe);probe.setOnClickListener(v->probeConnection());
  state=new TextView(this);page.addView(state);
  diagnostics=new TextView(this);diagnostics.setTextSize(14);
  diagnostics.setPadding(4,16,4,20);page.addView(diagnostics);
  screenControls=ScreenAwakeControls.install(this,page);
  ScrollView scroll=new ScrollView(this);scroll.addView(page);
  setContentView(scroll);refresh();
 }
 @Override public void onResume(){
  super.onResume();
  AgribankNotificationListener.recoverActiveFromUi();
  if(state!=null)refresh();
  if(screenControls!=null)screenControls.refresh();
 }
 static String time(long millis){
  return millis<=0?"Chưa có":DateFormat.format("dd/MM HH:mm:ss",millis).toString();
 }
 void refresh(){
  String allowed=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");
  String component=new ComponentName(this,AgribankNotificationListener.class).flattenToString();
  boolean ok=allowed!=null&&Arrays.asList(allowed.split(":")).contains(component);
  SharedPreferences p=getSharedPreferences("config",MODE_PRIVATE);
  String paired=p.getString("device_token","");
  String extra=paired.matches("[a-f0-9]{48,128}")?"Mã kết nối: Đã lưu":"Mã kết nối: Chưa hợp lệ";
  state.setText((ok?"Đã cấp quyền truy cập thông báo.":"CHƯA CẤP quyền đọc thông báo.")+"\n"+extra);
  int pending=0;
  try{
   JobScheduler jobs=(JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE);
   ComponentName service=new ComponentName(this,UploadJobService.class);
   if(jobs!=null)for(JobInfo job:jobs.getAllPendingJobs()){
    if(service.equals(job.getService()))pending++;
   }
  }catch(Exception ignored){}
  String connected=p.contains("listener_connected")?
    (p.getBoolean("listener_connected",false)?"Đã kết nối Android":"Mất kết nối Android"):
    "Chưa xác định";
  String error=p.getString("last_upload_error","");
  String checked=p.getString("last_probe_status","Chưa kiểm tra");
  diagnostics.setText(
   "TÌNH TRẠNG THỰC TẾ\n"+
   "Dịch vụ nhận thông báo: "+connected+"\n"+
   "Lần Agribank Plus phát thông báo mà APK thấy: "+time(p.getLong("last_bank_notification_seen_at",0))+"\n"+
   "Lần phát hiện có thể là tiền vào: "+time(p.getLong("last_credit_candidate_at",0))+"\n"+
   "Lần đưa vào hàng gửi: "+time(p.getLong("last_enqueue_at",0))+"\n"+
   "Lần thử gửi: "+time(p.getLong("last_attempt_at",0))+"\n"+
   "Lần máy chủ xác nhận HTTP thành công: "+time(p.getLong("last_sent_at",0))+"\n"+
   "Hàng chờ tải lên: "+pending+" sự kiện\n"+
   "HTTP gần nhất: "+p.getInt("last_http_status",0)+"\n"+
   "Lỗi gần nhất: "+(error.isEmpty()?"Không có lỗi đã ghi nhận":error)+"\n"+
   "Kiểm tra mã/mạng máy chủ: "+checked+"\n"+
   "Lưu ý: Máy chủ nhận thông báo ≠ ngân hàng đã xác nhận đối soát tiền.");
 }
 private void probeConnection(){
  SharedPreferences p=getSharedPreferences("config",MODE_PRIVATE);
  String key=p.getString("device_token","");
  if(!key.matches("[a-f0-9]{48,128}")){
   p.edit().putString("last_probe_status","Mã kết nối không hợp lệ").apply();refresh();return;
  }
  p.edit().putString("last_probe_status","Đang kiểm tra…").apply();refresh();
  NET.execute(()->{
   HttpURLConnection c=null;String result;
   try{
    c=(HttpURLConnection)new URL(UploadJobService.URL).openConnection();
    c.setConnectTimeout(12000);c.setReadTimeout(12000);
    c.setRequestMethod("POST");c.setDoOutput(true);
    c.setRequestProperty("content-type","application/json");
    c.setRequestProperty("x-device-token",key);
    try(OutputStream out=c.getOutputStream()){
     out.write("{\"kind\":\"health_probe\"}".getBytes(StandardCharsets.UTF_8));
    }
    int status=c.getResponseCode();
    // HTTP 200 plus the dedicated probe response marker is the only success.
    String response="";
    try(java.io.InputStream in=status>=200&&status<300?c.getInputStream():c.getErrorStream()){
     if(in!=null)response=new String(in.readNBytes(1024),StandardCharsets.UTF_8);
    }
    result=status==200&&response.contains("\"device_authorized\":true")?
      "Kết nối OK · Mã hợp lệ · Không có giao dịch giả":
      status==422?"Máy chủ chưa hỗ trợ kiểm tra kết nối; xem trạng thái tải thông báo bên dưới.":
      status==401||status==403?"Mã kết nối bị từ chối: HTTP "+status:
      "Lỗi máy chủ/mã kết nối: HTTP "+status;
   }catch(Exception ex){result="Không kết nối được máy chủ (kiểm tra mạng)";}
   finally{if(c!=null)c.disconnect();}
   p.edit().putString("last_probe_status",result).apply();
   runOnUiThread(()->{if(!isFinishing())refresh();});
  });
 }
}
