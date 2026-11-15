export const DEMO_CONTACTS=Object.freeze([
  Object.freeze({accountId:'00000000-0000-4000-8000-000000000001',name:'Khách thử 01',zaloId:null}),
  Object.freeze({accountId:'00000000-0000-4000-8000-000000000002',name:'Khách thử 02',zaloId:null}),
  Object.freeze({accountId:'00000000-0000-4000-8000-000000000003',name:'Khách thử 03',zaloId:null}),
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizedPilotContacts(rows){
  const seen=new Set(),result=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const accountId=String(row?.accountId||'').trim();
    const name=String(row?.name||'').replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,128);
    if(!UUID.test(accountId)||!name||seen.has(accountId))continue;
    seen.add(accountId);
    result.push({accountId,name,zaloId:String(row?.zaloId||'').trim()||null});
    if(result.length===3)break;
  }
  return result;
}
export function normalizeChatId(value){
  const raw=String(value??'').trim();
  if(!/^-?[0-9]{1,20}$/.test(raw)||raw==='0')throw new Error('telegram_chat_id_invalid');
  return raw;
}
export function normalizeThreadId(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error('telegram_thread_id_invalid');
  return n;
}
export function topicMessageFor(contact){
  const name=String(contact?.name||'').trim();
  if(!name)throw new Error('telegram_contact_name_missing');
  return '🧪 Kiểm thử Telegram Topic\n'
    +'Liên hệ thử: '+name+'\n'
    +'Đây chỉ là tin kiểm thử trong Telegram của quản trị viên. '
    +'Không có tin nhắn nào được gửi đến Zalo hay khách hàng.';
}
export function ensureTopicDelivery(response,threadId){
  const expected=normalizeThreadId(threadId),actual=Number(response?.message_thread_id);
  if(!Number.isSafeInteger(actual)||actual!==expected)throw new Error('telegram_thread_ack_mismatch');
  return {messageId:response.message_id,threadId:actual};
}
export function routeTelegramReply(update,{chatId,adminUserId,topicToAccount}){
  const msg=update?.message;
  if(!msg||msg.chat?.id==null||msg.from?.id==null)return null;
  if(String(msg.chat.id)!==normalizeChatId(chatId))return null;
  if(String(msg.from.id)!==String(adminUserId))return null;
  if(!msg.is_topic_message)return null;
  const threadId=Number(msg.message_thread_id);
  if(!Number.isSafeInteger(threadId)||threadId<=0)return null;
  const accountId=topicToAccount?.get?.(threadId);
  if(!accountId||!UUID.test(String(accountId)))return null;
  return {accountId:String(accountId),threadId,telegramMessageId:msg.message_id,
    text:String(msg.text||'').trim(),hasMedia:Boolean(msg.photo?.length||msg.document||msg.voice||msg.video)};
}
