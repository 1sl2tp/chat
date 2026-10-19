package xyz.taphoa.agrinotifier;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

/**
 * Explicit, reversible screen-awake controls for a dedicated bank-notification phone.
 * Does NOT unlock a secured phone, wake Agribank Plus, or read additional app data.
 */
final class ScreenAwakeControls {
 private static final String PREF="screen_awake_controls";
 private static final String PREVIOUS="original_screen_timeout";
 private static final String SET_VALUE="applied_screen_timeout";
 private static final String ACTIVE="system_timeout_active";
 private static final String FOREGROUND="keep_taphoa_screen_on";
 private static final int[] TIMEOUTS_MS={15*60*1000,30*60*1000,60*60*1000,6*60*60*1000,24*60*60*1000};
 private final Activity activity;
 private final SharedPreferences pref;
 private final TextView status;
 private final Spinner duration;
 private final CheckBox foreground;

 private ScreenAwakeControls(Activity activity,LinearLayout page){
  this.activity=activity;
  this.pref=activity.getSharedPreferences(PREF,Activity.MODE_PRIVATE);

  TextView header=new TextView(activity);
  header.setTextSize(18);
  header.setText("Giữ màn hình sáng khi trực Agribank");
  page.addView(header);

  TextView info=new TextView(activity);
  info.setText("Cách 1: cho phép TAPHOA giữ sáng khi đang mở.\\n"+
    "Cách 2: cấp quyền sửa cài đặt hệ thống để tăng thời gian tự tắt màn hình, kể cả khi chuyển sang Agribank Plus. "+
    "Không tự mở khóa máy, không bảo đảm Agribank gửi thông báo ngay. Nên dùng máy riêng, cắm sạc và giữ an toàn màn hình khóa.");
  page.addView(info);

  foreground=new CheckBox(activity);
  foreground.setText("Giữ màn hình sáng khi đang mở TAPHOA (không cần quyền)");
  foreground.setChecked(pref.getBoolean(FOREGROUND,false));
  foreground.setOnCheckedChangeListener((b,on)->{
   pref.edit().putBoolean(FOREGROUND,on).apply();
   applyForeground(on);
   refresh();
  });
  page.addView(foreground);
  applyForeground(foreground.isChecked());

  Button permission=new Button(activity);
  permission.setText("Cấp quyền thay đổi thời gian tắt màn hình");
  permission.setOnClickListener(v->requestSystemPermission());
  page.addView(permission);

  TextView chooser=new TextView(activity);
  chooser.setText("Chọn thời gian tự tắt khi không chạm vào màn hình:");
  page.addView(chooser);

  duration=new Spinner(activity);
  ArrayAdapter<String> options=new ArrayAdapter<>(activity,
    android.R.layout.simple_spinner_item,
    new String[]{"15 phút","30 phút","1 giờ","6 giờ","24 giờ (máy trực riêng)"});
  options.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
  duration.setAdapter(options);
  duration.setSelection(1);
  page.addView(duration);

  Button apply=new Button(activity);
  apply.setText("Áp dụng thời gian tự tắt đã chọn");
  apply.setOnClickListener(v->confirmAndApply(TIMEOUTS_MS[duration.getSelectedItemPosition()]));
  page.addView(apply);

  Button restore=new Button(activity);
  restore.setText("Khôi phục thời gian màn hình cũ");
  restore.setOnClickListener(v->restoreOriginal());
  page.addView(restore);

  status=new TextView(activity);
  page.addView(status);
  refresh();
 }

 static ScreenAwakeControls install(Activity activity, LinearLayout parent){
  return new ScreenAwakeControls(activity,parent);
 }

 private void applyForeground(boolean keep){
  if(keep) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
 }

 private boolean canWrite(){
  return Settings.System.canWrite(activity);
 }

 private void requestSystemPermission(){
  if(canWrite()){
   status.setText("Đã có quyền sửa cài đặt hệ thống. Chọn thời gian rồi bấm Áp dụng.");
   return;
  }
  Intent intent=new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
      Uri.parse("package:"+activity.getPackageName()));
  try{
   activity.startActivity(intent);
  }catch(Exception e){
   try{activity.startActivity(new Intent(Settings.ACTION_SETTINGS));}
   catch(Exception ignored){status.setText("Không mở được cài đặt quyền trên điện thoại này.");}
  }
 }

 private void confirmAndApply(int requestedMs){
  if(!canWrite()){
   status.setText("Chưa được cấp quyền. Hãy bấm Cấp quyền trước; APK không thể tự cấp quyền.");
   return;
  }
  new AlertDialog.Builder(activity)
   .setTitle("Cho phép màn hình sáng lâu hơn?")
   .setMessage("Thao tác sẽ thay đổi thời gian tự tắt màn hình của CẢ điện thoại, kể cả khi mở Agribank Plus. "+
     "Có thể hao pin, nóng máy và lộ thông tin nếu bỏ quên thiết bị đang mở. "+
     "Không tự mở khóa mã PIN hay vân tay. Bạn có thể khôi phục thời gian cũ ngay tại đây.")
   .setNegativeButton("Hủy",null)
   .setPositiveButton("Đồng ý, áp dụng",(d,w)->applyTimeout(requestedMs))
   .show();
 }

 private void applyTimeout(int requestedMs){
  if(!canWrite()){status.setText("Quyền đã bị thu hồi.");return;}
  try{
   int old=Settings.System.getInt(activity.getContentResolver(),
     Settings.System.SCREEN_OFF_TIMEOUT,30000);
   boolean previouslyActive=pref.getBoolean(ACTIVE,false);
   // Never replace a saved original timeout on subsequent option changes.
   int original=previouslyActive?pref.getInt(PREVIOUS,old):old;
   if(!Settings.System.putInt(activity.getContentResolver(),
       Settings.System.SCREEN_OFF_TIMEOUT,requestedMs)){
    status.setText("Android từ chối thay đổi thời gian màn hình.");
    return;
   }
   int actual=Settings.System.getInt(activity.getContentResolver(),
       Settings.System.SCREEN_OFF_TIMEOUT,old);
   pref.edit().putInt(PREVIOUS,original).putInt(SET_VALUE,actual)
     .putBoolean(ACTIVE,true).apply();
   status.setText("Đã đổi thành "+format(actual)+
     (actual!=requestedMs?" (thiết bị có thể giới hạn thời gian tối đa).":"")+
     " Khi muốn tắt chế độ, bấm Khôi phục thời gian cũ.");
  }catch(SecurityException e){
   status.setText("Android không cho phép đổi cài đặt; kiểm tra quyền hệ thống.");
  }catch(Exception e){
   status.setText("Không thay đổi được thời gian màn hình trên thiết bị này.");
  }
 }

 private void restoreOriginal(){
  if(!pref.getBoolean(ACTIVE,false)){
   status.setText("TAPHOA chưa lưu thời gian màn hình nào cần khôi phục.");
   return;
  }
  if(!canWrite()){
   status.setText("Cấp lại quyền sửa cài đặt hệ thống rồi khôi phục.");
   return;
  }
  try{
   int current=Settings.System.getInt(activity.getContentResolver(),
     Settings.System.SCREEN_OFF_TIMEOUT,30000);
   int last=pref.getInt(SET_VALUE,-1);
   if(current!=last){
    // Respect a deliberate subsequent change from Android settings or another app.
    pref.edit().remove(PREVIOUS).remove(SET_VALUE).remove(ACTIVE).apply();
    status.setText("Cài đặt đã thay đổi bên ngoài TAPHOA; giữ nguyên lựa chọn hiện tại của bạn.");
    return;
   }
   int before=pref.getInt(PREVIOUS,30000);
   if(!Settings.System.putInt(activity.getContentResolver(),
       Settings.System.SCREEN_OFF_TIMEOUT,before)){
    status.setText("Android từ chối khôi phục. Bạn có thể đặt lại trong Cài đặt > Màn hình.");
    return;
   }
   pref.edit().remove(PREVIOUS).remove(SET_VALUE).remove(ACTIVE).apply();
   status.setText("Đã khôi phục thời gian màn hình trước đó: "+format(before)+".");
  }catch(Exception e){
   status.setText("Không khôi phục được. Mở Cài đặt > Màn hình > Thời gian chờ.");
  }
 }

 private static String format(int ms){
  if(ms>=3600000)return (ms/3600000)+" giờ";
  if(ms>=60000)return (ms/60000)+" phút";
  return Math.max(1,ms/1000)+" giây";
 }

 void refresh(){
  if(status==null)return;
  int current=Settings.System.getInt(activity.getContentResolver(),
    Settings.System.SCREEN_OFF_TIMEOUT,30000);
  status.setText("Quyền sửa cài đặt: "+(canWrite()?"đã cấp":"chưa cấp")+
    ". Thời gian tự tắt hiện tại: "+format(current)+"."+
    (pref.getBoolean(ACTIVE,false)?" TAPHOA đã lưu thiết lập cũ để khôi phục.":"")+
    (foreground.isChecked()?" Giữ sáng khi TAPHOA mở: BẬT.":""));
 }
}
