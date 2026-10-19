package xyz.taphoa.agrinotifier;
import android.app.job.*;
import android.content.*;
import android.os.PersistableBundle;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
/** Durable network upload, no direct bank or ledger access. */
public final class UploadJobService extends JobService {
 static final String URL="https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-agribank-notification-ingest";
 static final java.util.concurrent.ExecutorService EXEC=Executors.newSingleThreadExecutor();
 static void queue(Context ctx,String pkg,String title,String body,long millis){
  PersistableBundle b=new PersistableBundle();
  b.putString("package_name",pkg);b.putString("title",title);b.putString("body",body);
  b.putLong("posted_at_ms",millis);
  // Stable per-event id avoids overwriting queued notifications after process restart.
  int id=50000+Math.floorMod((pkg+"\n"+title+"\n"+body+"\n"+millis).hashCode(),900000000);
  JobInfo job=new JobInfo.Builder(id,new ComponentName(ctx,UploadJobService.class))
   .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
   .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL)
   .setExtras(b).build();
  ((JobScheduler)ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE)).schedule(job);
 }
 @Override public boolean onStartJob(JobParameters p){
  EXEC.execute(()->jobFinished(p,!send(p)));return true;
 }
 @Override public boolean onStopJob(JobParameters p){return true;}
 private boolean send(JobParameters p){
  String token=getSharedPreferences("config",MODE_PRIVATE).getString("device_token","");
  if(!token.matches("[a-f0-9]{48,128}"))return false;
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
   if(status>=200&&status<300) {
    getSharedPreferences("config",MODE_PRIVATE).edit().putLong("last_sent_at",System.currentTimeMillis()).apply();
    return true;
   }
   return status==400||status==422; // Invalid or secret content: do not retry.
  }catch(Exception ex){return false;}
  finally{if(c!=null)c.disconnect();}
 }
 static String q(String s){
  if(s==null)s="";StringBuilder out=new StringBuilder("\"");
  for(char c:s.toCharArray()){
   if(c=='"'||c=='\\')out.append('\\').append(c);
   else if(c=='\n')out.append("\\n");
   else if(c=='\r')out.append("\\r");
   else if(c=='\t')out.append("\\t");
   else if(c<32)out.append(' ');
   else out.append(c);
  }
  return out.append('"').toString();
 }
}