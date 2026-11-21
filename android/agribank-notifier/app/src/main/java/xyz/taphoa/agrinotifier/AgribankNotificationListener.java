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
 private static volatile AgribankNotificationListener activeListener;
 static void recoverActiveFromUi(){
  AgribankNotificationListener service=activeListener;
  if(service!=null)service.recoverActive(false);
 }
 private synchronized void recoverActive(boolean force){
  android.content.SharedPreferences p=getSharedPreferences("config",MODE_PRIVATE);
  long now=System.currentTimeMillis();
  if(!force&&now-p.getLong("last_replay_checked_at",0)<120000L)return;
  int inspected=0,queued=0;
  try{
   StatusBarNotification[] active=getActiveNotifications();
   if(active!=null)for(StatusBarNotification entry:active){
    if(entry==null||!PACKAGE.equals(entry.getPackageName()))continue;
    if(++inspected>40)break;
    long post=entry.getPostTime();
    if(post<=0||post<now-48L*3600000||post>now+10L*60000)continue;
    Notification notification=entry.getNotification();
    if(notification==null||notification.extras==null)continue;
    String title=String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TITLE,""));
    String body=extractBody(notification.extras);
    if(body.trim().isEmpty()||body.length()>2200||!isCandidate(title,body))continue;
    // Reuse exact-package and sensitive-content filtering; bank RPC prevents double credit.
    if(processNotification(entry,true))queued++;
   }
   p.edit().putLong("last_replay_checked_at",now)
    .putInt("last_replay_queued_count",queued).putString("last_replay_error","").apply();
  }catch(Exception ignored){
   p.edit().putLong("last_replay_checked_at",now)
    .putString("last_replay_error","active_notifications_unavailable").apply();
  }
 }
 private void mark(String key,long when){
  getSharedPreferences("config",MODE_PRIVATE).edit().putLong(key,when).apply();
 }
 @Override public void onListenerConnected(){
  super.onListenerConnected();
  activeListener=this;
  getSharedPreferences("config",MODE_PRIVATE).edit()
   .putBoolean("listener_connected",true)
   .putLong("listener_connected_at",System.currentTimeMillis()).apply();
  recoverActive(true);
 }
 @Override public void onListenerDisconnected(){
  if(activeListener==this)activeListener=null;
  getSharedPreferences("config",MODE_PRIVATE).edit()
   .putBoolean("listener_connected",false)
   .putLong("listener_disconnected_at",System.currentTimeMillis()).apply();
  // Request a bounded system-managed rebind; never bypass Android user consent.
  requestRebind(new ComponentName(this,AgribankNotificationListener.class));
  super.onListenerDisconnected();
 }
 @Override public void onDestroy(){
  if(activeListener==this)activeListener=null;
  super.onDestroy();
 }
 private boolean processNotification(StatusBarNotification posted,boolean replay){
  if(posted==null||!PACKAGE.equals(posted.getPackageName()))return false;
  if(!replay)mark("last_bank_notification_seen_at",System.currentTimeMillis());
  Notification notification=posted.getNotification();
  if(notification==null||notification.extras==null)return false;
  Bundle extras=notification.extras;
  String title=String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE,""));
  String body=extractBody(extras);
  if(body.trim().isEmpty()||body.length()>2200){
   if(!replay)getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_bank_event_outcome","empty_or_oversize_body").apply();
   return false;
  }
  if(!isCandidate(title,body)){
   if(!replay)getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_bank_event_outcome",isSensitive(title,body)?"sensitive_ignored":"not_recognized_credit").apply();
   return false;
  }
  long now=System.currentTimeMillis();
  long postedAt=posted.getPostTime();
  if(postedAt<=0||postedAt<now-48L*3600000||postedAt>now+10L*60000)return false;
  if(!replay)mark("last_credit_candidate_at",now);
  String token=getSharedPreferences("config",MODE_PRIVATE)
    .getString("device_token","");
  if(!token.matches("[a-f0-9]{48,128}")){
   getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_upload_error","missing_pairing_token").apply();
   return false;
  }
  UploadJobService.queue(this,PACKAGE,title,body,postedAt);
  if(!replay)getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_bank_event_outcome","candidate_queued").apply();
  return true;
 }
 @Override public void onNotificationPosted(StatusBarNotification posted){
  processNotification(posted,false);
 }
}
