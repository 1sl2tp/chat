// TELE-002: pure, offline-testable safety checks for the Telegram smoke test.
// No Chat database, bank, Zalo, or real customer writes.
const USER_ID=/^[1-9][0-9]{4,18}$/;
export const PILOT_BOT_USERNAME='taphoa_chat_bridge_bot';

export function pilotConfig(env){
  const token=String(env?.TELEGRAM_BOT_TOKEN||'').trim();
  const admin=String(env?.TELEGRAM_ADMIN_USER_ID||'').trim();
  const chat=String(env?.TELEGRAM_PILOT_CHAT_ID||'').trim();
  const missing=[];
  if(!/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(token))missing.push('TELEGRAM_BOT_TOKEN');
  if(!USER_ID.test(admin))missing.push('TELEGRAM_ADMIN_USER_ID');
  if(!USER_ID.test(chat)||admin!==chat)missing.push('TELEGRAM_PILOT_CHAT_ID');
  return {valid:missing.length===0,missing,token,admin,chat};
}
export function verifyTelegramBot(bot){
  if(bot?.is_bot!==true||String(bot.username||'').toLowerCase()!==PILOT_BOT_USERNAME){
    throw new Error('pilot_wrong_bot');
  }
  if(bot.has_topics_enabled!==true)throw new Error('pilot_threads_disabled');
  return true;
}
export function verifyPilotChat(chat,adminId){
  if(chat?.type!=='private'||String(chat.id)!==String(adminId)){
    throw new Error('pilot_wrong_target');
  }
  return true;
}
export function selectPilotCommand(updates,adminId,chatId){
  const list=Array.isArray(updates)?updates:[];
  let highest=null;
  let selected=null;
  for(const update of list){
    if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)continue;
    highest=Math.max(highest??0,update.update_id);
    const m=update?.message;
    if(String(m?.chat?.id??'')!==String(chatId)||m?.chat?.type!=='private')continue;
    if(String(m?.from?.id??'')!==String(adminId)||m?.from?.is_bot===true)continue;
    if(String(m?.text||'').trim()!=='/pilot')continue;
    // Accept only ordinary messages, never forwarded or replies from another sender.
    if(m.forward_origin||m.forward_from||m.sender_chat||m.is_automatic_forward)continue;
    if(!selected)selected={updateId:update.update_id,messageId:m.message_id};
  }
  return {selected,ackOffset:highest==null?null:highest+1};
}
export function exactTopicAck(sent,topicId,chatId){
  const threadId=Number(topicId);
  if(!Number.isSafeInteger(threadId)||threadId<=0)throw new Error('pilot_topic_invalid');
  if(String(sent?.chat?.id)!==String(chatId))throw new Error('pilot_wrong_chat_ack');
  if(sent?.is_topic_message!==true||sent?.message_thread_id!==threadId){
    throw new Error('pilot_wrong_topic_ack');
  }
  if(!Number.isSafeInteger(sent?.message_id))throw new Error('pilot_message_ack_missing');
  return {threadId,messageId:sent.message_id};
}
