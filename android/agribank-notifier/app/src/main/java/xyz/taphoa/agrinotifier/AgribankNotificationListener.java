package xyz.taphoa.agrinotifier;
import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Locale;
/** Only official Agribank Plus, no SMS or any other app's notifications. */
public final class AgribankNotificationListener extends NotificationListenerService {
 static final String PACKAGE="com.vnpay.Agribank3g";
 @Override public void onNotificationPosted(StatusBarNotification posted){
  if(posted==null||!PACKAGE.equals(posted.getPackageName()))return;
  Notification n=posted.getNotification();if(n==null||n.extras==null)return;
  Bundle e=n.extras;
  String title=String.valueOf(e.getCharSequence(Notification.EXTRA_TITLE,""));
  String body=String.valueOf(e.getCharSequence(Notification.EXTRA_BIG_TEXT,
    e.getCharSequence(Notification.EXTRA_TEXT,"")));
  if(body.trim().isEmpty()||body.length()>2200)return;
  String upper=(title+" "+body).toUpperCase(Locale.ROOT);
  if(upper.contains("OTP")||upper.contains("SOFT OTP")||upper.contains("MẬT KHẨU")
    ||upper.contains("MÃ XÁC THỰC")||upper.contains("PASSWORD")
    ||upper.contains("PIN"))return;
  if(!upper.matches("(?s).*(GHI CÓ|BIẾN ĐỘNG|NHẬN TIỀN|TIỀN VÀO|CỘNG TIỀN|\\+\\s*[0-9]).*"))return;
  String token=getSharedPreferences("config",MODE_PRIVATE).getString("device_token","");
  if(!token.matches("[a-f0-9]{48,128}"))return;
  UploadJobService.queue(this,PACKAGE,title,body,Math.max(1L,posted.getPostTime()));
 }
}