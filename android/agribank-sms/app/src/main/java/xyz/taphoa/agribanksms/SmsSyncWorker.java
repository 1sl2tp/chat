package xyz.taphoa.agribanksms;
import android.content.*;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public final class SmsSyncWorker extends Worker {
    static final String PREFS="taphoa_sms_settings";
    static final String URL="https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-sms-ingest";
    public SmsSyncWorker(@NonNull Context ctx,@NonNull WorkerParameters params){super(ctx,params);}
    static void schedule(Context ctx){
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(SmsSyncWorker.class)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(ctx).enqueue(request);
    }
    @NonNull @Override public Result doWork(){
        Context ctx=getApplicationContext();
        SharedPreferences prefs=ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        String token=prefs.getString("token","").trim();
        if(!token.matches("[a-f0-9]{48,128}"))return Result.success();
        try(SmsStore db=new SmsStore(ctx)){
            List<SmsStore.Message> pending=db.pending();
            for(SmsStore.Message item:pending){
                HttpURLConnection connection=null;
                try {
                    JSONObject json=new JSONObject();
                    json.put("sender",item.sender);json.put("body",item.body);
                    json.put("sms_timestamp_ms",item.at);
                    connection=(HttpURLConnection)new java.net.URL(URL).openConnection();
                    connection.setRequestMethod("POST");
                    connection.setDoOutput(true);
                    connection.setConnectTimeout(15000);connection.setReadTimeout(15000);
                    connection.setRequestProperty("Content-Type","application/json");
                    connection.setRequestProperty("x-device-token",token);
                    connection.getOutputStream().write(json.toString().getBytes(StandardCharsets.UTF_8));
                    int status=connection.getResponseCode();
                    if(status>=200 && status<300){
                        db.sent(item.id);
                        prefs.edit().putLong("last_sync",System.currentTimeMillis()).putString("error","Đã đồng bộ").apply();
                    }else if(status==401 || status==403){
                        prefs.edit().putString("error","Mã kết nối không hợp lệ").apply();
                        return Result.failure();
                    }else if(status==422){
                        prefs.edit().putString("error","Một SMS không hợp lệ; chờ kiểm tra").apply();
                        return Result.failure();
                    }else{
                        prefs.edit().putString("error","Máy chủ lỗi "+status+"; sẽ thử lại").apply();
                        return Result.retry();
                    }
                }catch(Exception e){
                    prefs.edit().putString("error","Không có kết nối; sẽ gửi lại").apply();
                    return Result.retry();
                }finally{if(connection!=null)connection.disconnect();}
            }
            if(pending.size()==50) schedule(ctx);
            return Result.success();
        }catch(Exception e){
            prefs.edit().putString("error","Lỗi hàng đợi; sẽ thử lại").apply();
            return Result.retry();
        }
    }
}