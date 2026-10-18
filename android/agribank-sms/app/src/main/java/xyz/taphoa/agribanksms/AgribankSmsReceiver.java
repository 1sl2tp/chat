package xyz.taphoa.agribanksms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * Watches incoming SMS locally. Does not transmit SMS, credentials,
 * account data or any other data to a server.
 */
public final class AgribankSmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0 || parts[0] == null) return;
        if (!SmsSafety.isAgribankSender(parts[0].getDisplayOriginatingAddress())) return;
        StringBuilder body = new StringBuilder();
        for (SmsMessage part : parts) if (part != null && part.getMessageBody() != null)
            body.append(part.getMessageBody());
        if (SmsSafety.appearsSensitive(body.toString())) return;
        context.getSharedPreferences("agribank_sms_state", Context.MODE_PRIVATE)
            .edit().putLong("last_observed_at", System.currentTimeMillis()).apply();
    }
}
