package xyz.taphoa.agribanksms;
import android.content.*;
import android.database.*;
import android.database.sqlite.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class SmsStore extends SQLiteOpenHelper {
    SmsStore(Context ctx){super(ctx,"taphoa_agribank_queue.db",null,1);}
    @Override public void onCreate(SQLiteDatabase d){
        d.execSQL("CREATE TABLE sms (_id INTEGER PRIMARY KEY AUTOINCREMENT,sender TEXT NOT NULL,body TEXT NOT NULL,sms_at INTEGER NOT NULL,fingerprint TEXT UNIQUE NOT NULL,sent INTEGER DEFAULT 0,created_at INTEGER)");
    }
    @Override public void onUpgrade(SQLiteDatabase d,int oldVersion,int newVersion){}
    private static String fingerprint(String text){
        try {
            byte[] bytes=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder out=new StringBuilder();
            for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b & 255));
            return out.toString();
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    boolean save(String sender,String body,long when){
        if(!SmsSafety.isAgribankSender(sender)||SmsSafety.appearsSensitive(body))return false;
        String normalized=sender.trim().toUpperCase(Locale.ROOT);
        ContentValues v=new ContentValues();
        v.put("sender",normalized);v.put("body",body);v.put("sms_at",when);
        v.put("fingerprint",fingerprint(normalized+"\n"+when+"\n"+body));
        v.put("created_at",System.currentTimeMillis());
        return getWritableDatabase().insertWithOnConflict("sms",null,v,SQLiteDatabase.CONFLICT_IGNORE)!=-1;
    }
    static class Message {
        final long id,at; final String sender,body;
        Message(long id,long at,String sender,String body){this.id=id;this.at=at;this.sender=sender;this.body=body;}
    }
    List<Message> pending(){
        List<Message> results=new ArrayList<>();
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT _id,sms_at,sender,body FROM sms WHERE sent=0 ORDER BY _id LIMIT 50",null)){
            while(c.moveToNext())results.add(new Message(c.getLong(0),c.getLong(1),c.getString(2),c.getString(3)));
        }
        return results;
    }
    int count(int sent){
        try(Cursor c=getReadableDatabase().rawQuery(
            "SELECT count(*) FROM sms WHERE sent="+(sent==0?0:1),null)){
            return c.moveToFirst()?c.getInt(0):0;
        }
    }
    void sent(long id){
        ContentValues v=new ContentValues();v.put("sent",1);
        getWritableDatabase().update("sms",v,"_id=?",new String[]{String.valueOf(id)});
    }
}