package xyz.taphoa.agribanksms;
import android.content.*;
import android.provider.Telephony;
import android.telephony.SmsMessage;
public final class AgribankSmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx,Intent intent) {
        if(intent==null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction()))return;
        SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if(parts==null||parts.length==0||parts[0]==null)return;
        String sender=parts[0].getDisplayOriginatingAddress();
        if(!SmsSafety.isAgribankSender(sender))return;
        StringBuilder all=new StringBuilder();
        for(SmsMessage sms:parts)if(sms!=null && sms.getMessageBody()!=null)all.append(sms.getMessageBody());
        String body=all.toString();
        if(SmsSafety.appearsSensitive(body))return;
        long at=parts[0].getTimestampMillis();
        if(at<=0)at=System.currentTimeMillis();
        try(SmsStore db=new SmsStore(ctx)){
            if(db.save(sender,body,at)){
                ctx.getSharedPreferences(SmsSyncWorker.PREFS,Context.MODE_PRIVATE)
                    .edit().putLong("last_received",System.currentTimeMillis()).apply();
                SmsSyncWorker.schedule(ctx);
            }
        }catch(Exception ignored){}
    }
}