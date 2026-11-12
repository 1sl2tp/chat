package xyz.taphoa.agrinotifier;

import android.app.Notification;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * BANK-304: only official Agribank Plus notifications. Keep the original
 * notification local until it passes the safe credit-candidate filter.
 * An event is NOT proof of a bank deposit: the Edge parser and bank-collection
 * RPC remain the only downstream financial gate.
 */
public final class AgribankNotificationListener extends NotificationListenerService {
 static final String PACKAGE="com.vnpay.Agribank3g";
 private static final Pattern SENSITIVE=Pattern.compile(
   "\\b(?:OTP|SOFT\\s*OTP|PIN|PASSWORD|PASSCODE)\\b|"+
   "MA XAC THUC|MA BAO MAT|MA DANG NHAP|MAT KHAU|MA PIN|MA OTP");
 private static final Pattern CREDIT=Pattern.compile(
   "\\+\\s*\\d|GHI CO|NHAN TIEN|TIEN VAO|CONG TIEN|SO TIEN NHAN|"+
   "BIEN DONG TANG|PHAT SINH TANG|PHAT SINH CO|SO DU TANG|DUOC CONG|"+
   "BIEN DONG SO DU|THONG BAO BIEN DONG|THAY DOI SO DU");
 private static String fold(String text){
  return Normalizer.normalize(String.valueOf(text),Normalizer.Form.NFD)
    .replaceAll("[\\u0300-\\u036f]","").replace("đ","d").replace("Đ","D")
    .toUpperCase(Locale.ROOT);
 }
 static boolean isSensitive(String title,String body){
  return SENSITIVE.matcher(fold(title+" "+body)).find();
 }
 static boolean isCandidate(String title,String body){
  String normalized=fold(title+" "+body);
  return !isSensitive(title,body)&&CREDIT.matcher(normalized).find();
 }
 static String extractBody(Bundle extras){
  if(extras==null)return "";
  String regular=String.valueOf(extras.getCharSequence(Notification.EXTRA_TEXT,""));
  String big=String.valueOf(extras.getCharSequence(Notification.EXTRA_BIG_TEXT,""));
  String best=big.trim().length()>regular.trim().length()?big:regular;
  CharSequence[] lines=extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
  if(lines!=null&&lines.length>0){
   StringBuilder joined=new StringBuilder();
   for(CharSequence line:lines){
    if(line!=null&&joined.length()<2200){
     if(joined.length()>0)joined.append('\n');
     joined.append(line);
    }
   }
   if(joined.length()>best.length())best=joined.toString();
  }
  return best;
 }
 private void mark(String key,long when){
  getSharedPreferences("config",MODE_PRIVATE).edit().putLong(key,when).apply();
 }
 @Override public void onListenerConnected(){
  super.onListenerConnected();
  getSharedPreferences("config",MODE_PRIVATE).edit()
   .putBoolean("listener_connected",true)
   .putLong("listener_connected_at",System.currentTimeMillis()).apply();
 }
 @Override public void onListenerDisconnected(){
  getSharedPreferences("config",MODE_PRIVATE).edit()
   .putBoolean("listener_connected",false)
   .putLong("listener_disconnected_at",System.currentTimeMillis()).apply();
  // Request a bounded system-managed rebind; never bypass Android user consent.
  requestRebind(new ComponentName(this,AgribankNotificationListener.class));
  super.onListenerDisconnected();
 }
 @Override public void onNotificationPosted(StatusBarNotification posted){
  if(posted==null||!PACKAGE.equals(posted.getPackageName()))return;
  mark("last_bank_notification_seen_at",System.currentTimeMillis());
  Notification notification=posted.getNotification();
  if(notification==null||notification.extras==null)return;
  Bundle extras=notification.extras;
  String title=String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE,""));
  String body=extractBody(extras);
  if(body.trim().isEmpty()||body.length()>2200)return;
  if(!isCandidate(title,body))return;
  mark("last_credit_candidate_at",System.currentTimeMillis());
  String token=getSharedPreferences("config",MODE_PRIVATE)
    .getString("device_token","");
  if(!token.matches("[a-f0-9]{48,128}")){
   getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_upload_error","missing_pairing_token").apply();
   return;
  }
  UploadJobService.queue(this,PACKAGE,title,body,Math.max(1L,posted.getPostTime()));
 }
}
