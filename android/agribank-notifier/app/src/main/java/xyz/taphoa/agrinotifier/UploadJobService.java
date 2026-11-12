package xyz.taphoa.agrinotifier;
import android.app.job.*;
import android.content.*;
import android.os.PersistableBundle;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
/** BANK-304 durable upload, explicit local diagnostics, no bank/ledger access. */
public final class UploadJobService extends JobService {
 static final String URL="https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-agribank-notification-ingest";
 static final java.util.concurrent.ExecutorService EXEC=Executors.newSingleThreadExecutor();
 static void queue(Context ctx,String pkg,String title,String body,long millis){
  PersistableBundle b=new PersistableBundle();
  b.putString("package_name",pkg);b.putString("title",title);b.putString("body",body);
  b.putLong("posted_at_ms",millis);
  int id=50000+Math.floorMod((pkg+"\n"+title+"\n"+body+"\n"+millis).hashCode(),900000000);
  JobInfo job=new JobInfo.Builder(id,new ComponentName(ctx,UploadJobService.class))
   .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
   .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL)
   .setExtras(b).build();
  try{
   int result=((JobScheduler)ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE)).schedule(job);
   ctx.getSharedPreferences("config",MODE_PRIVATE).edit()
    .putLong("last_enqueue_at",System.currentTimeMillis())
    .putString("last_upload_error",result==JobScheduler.RESULT_SUCCESS?"":"schedule_failed")
    .apply();
  }catch(Exception e){
   ctx.getSharedPreferences("config",MODE_PRIVATE).edit()
    .putString("last_upload_error","schedule_exception").apply();
  }
 }
 @Override public boolean onStartJob(JobParameters p){
  EXEC.execute(()->jobFinished(p,!send(p)));return true;
 }
 @Override public boolean onStopJob(JobParameters p){
  // If Android interrupts this worker, retry the durable scheduled event.
  return true;
 }
 static String q(String s){
  if(s==null)s="";StringBuilder out=new StringBuilder("\"");
  for(char c:s.toCharArray()){
   if(c=='\"'||c=='\\')out.append('\\').append(c);
   else if(c=='\n')out.append("\\n");
   else if(c=='\r')out.append("\\r");
   else if(c=='\t')out.append("\\t");
   else if(c<32)out.append(' ');
   else out.append(c);
  }
  return out.append('\"').toString();
 }
 private boolean send(JobParameters p){
  android.content.SharedPreferences prefs=getSharedPreferences("config",MODE_PRIVATE);
  String token=prefs.getString("device_token","");
  prefs.edit().putLong("last_attempt_at",System.currentTimeMillis()).apply();
  if(!token.matches("[a-f0-9]{48,128}")){
   prefs.edit().putString("last_upload_error","missing_pairing_token").apply();
   return false; // Keep durable event pending until pairing is restored.
  }
  PersistableBundle x=p.getExtras();HttpURLConnection c=null;
  try{
   String json="{\"package_name\":"+q(x.getString("package_name"))+
    ",\"title\":"+q(x.getString("title"))+
    ",\"body\":"+q(x.getString("body"))+
    ",\"posted_at_ms\":"+x.getLong("posted_at_ms")+"}";
   c=(HttpURLConnection)new URL(URL).openConnection();
   c.setConnectTimeout(13000);c.setReadTimeout(13000);
   c.setRequestMethod("POST");c.setDoOutput(true);
   c.setRequestProperty("content-type","application/json");
   c.setRequestProperty("x-device-token",token);
   try(OutputStream out=c.getOutputStream()){out.write(json.getBytes(StandardCharsets.UTF_8));}
   int status=c.getResponseCode();
   prefs.edit().putInt("last_http_status",status).apply();
   if(status>=200&&status<300){
    prefs.edit().putLong("last_sent_at",System.currentTimeMillis())
      .putString("last_upload_error","").apply();
    return true;
   }
   if(status==400||status==422){
    // Invalid/sensitive notification is terminal, but NEVER claim delivery.
    prefs.edit().putString("last_upload_error","server_rejected_"+status).apply();
    return true;
   }
   if(status==401||status==403){
    // Token may be re-paired while this persisted job is waiting: preserve
    // the original event for bounded Android backoff rather than drop it.
    prefs.edit().putString("last_upload_error","pairing_rejected_"+status).apply();
    return false;
   }
   prefs.edit().putString("last_upload_error","retry_http_"+status).apply();
   return false;
  }catch(Exception ex){
   prefs.edit().putString("last_upload_error","retry_network_error").apply();
   return false;
  }finally{if(c!=null)c.disconnect();}
 }
}
