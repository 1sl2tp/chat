export function summarizeNotification({body='',media=[]}={}){
  const text=String(body||'').trim().replace(/\s+/g,' ');
  if(text)return text.slice(0,140);
  const first=Array.isArray(media)?media[0]:null;
  if(first?.kind==='image')return 'Ảnh';
  if(first?.kind==='audio')return 'Ghi âm';
  if(first?.kind==='file')return String(first.file_name||'Tệp').slice(0,80);
  return 'Tin nhắn mới';
}

export const isGoneStatus=status=>Number(status)===404||Number(status)===410;

export function retryDelaySeconds(attempt){
  return Math.min(300,10*(2**Math.max(0,Number(attempt||1)-1)));
}

export function buildNotificationPayload(row={}){
  return {
    notification_id:String(row.outbox_id??''),
    message_id:String(row.message_id??''),
    conversation_id:String(row.conversation_id??''),
    contact_id:String(row.sender_account_id??''),
    title:String(row.sender_display_name||row.sender_username||'Tin nhắn mới'),
    body:summarizeNotification({body:row.body,media:row.media}),
    tag:`chat:${String(row.conversation_id??'')}`,
    icon:'./icons/chat-192.png'
  };
}
