import {normalizeChatId,normalizeThreadId,ensureTopicDelivery} from './core.mjs';
function classifyTelegramError(description){
  const text=String(description||'').toLowerCase();
  if(text.includes('bot_topic_wrong_home'))return 'topic_wrong_home';
  if(text.includes('message thread not found')||text.includes('topic_id_invalid'))return 'topic_unavailable';
  if(text.includes('too many requests'))return 'rate_limited';
  if(text.includes('chat not found'))return 'chat_not_found';
  if(text.includes('not enough rights')||text.includes('not an administrator'))return 'missing_permission';
  return 'api_rejected';
}
export function createTelegramApi({token,fetchImpl=fetch}={}){
  const secret=String(token||'').trim();
  if(!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(secret))throw new Error('telegram_token_missing_or_invalid');
  async function call(method,payload={}){
    const response=await fetchImpl('https://api.telegram.org/bot'+secret+'/'+method,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000),
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.ok!==true){
      const err=new Error('telegram_'+method+'_'+classifyTelegramError(data?.description));
      err.code=classifyTelegramError(data?.description);
      throw err;
    }
    return data.result;
  }
  return Object.freeze({
    getMe:()=>call('getMe'),
    getChat:chatId=>call('getChat',{chat_id:normalizeChatId(chatId)}),
    createTopic:(chatId,name)=>call('createForumTopic',{chat_id:normalizeChatId(chatId),name:String(name).slice(0,128)}),
    sendProbe:async(chatId,threadId,text)=>{
      const result=await call('sendMessage',{
        chat_id:normalizeChatId(chatId),message_thread_id:normalizeThreadId(threadId),
        text:String(text),disable_notification:true,
      });
      return ensureTopicDelivery(result,threadId);
    },
  });
}
export function validateTarget({bot,chat,mode}){
  if(bot?.is_bot!==true)throw new Error('telegram_getme_not_bot');
  if(mode==='private'){
    if(bot?.has_topics_enabled!==true)throw new Error('telegram_private_topics_not_enabled');
    if(chat?.type!=='private')throw new Error('telegram_expected_private_chat');
  }else if(mode==='group'){
    if(chat?.type!=='supergroup'||chat?.is_forum!==true)throw new Error('telegram_expected_forum_supergroup');
  }else throw new Error('telegram_unknown_mode');
  return true;
}
