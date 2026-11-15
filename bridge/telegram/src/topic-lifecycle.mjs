// TELE-004: pure state transitions, not a live worker.
import {normalizeChatId,normalizeThreadId} from './core.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reserveTopic({chatId,accountId,title}){
 const id=String(accountId||'').toLowerCase();
 if(!UUID.test(id)||!String(title||'').trim())throw Error('telegram_invalid_account_reservation');
 return {telegram_chat_id:normalizeChatId(chatId),
   chat_account_id:id,telegram_thread_id:null,
   topic_title:String(title).trim(),state:'reserved'};
}
export function confirmTopic(reserved,{threadId,chatId}){
 if(reserved?.state!=='reserved')throw Error('telegram_not_reserved');
 if(String(reserved.telegram_chat_id)!==normalizeChatId(chatId))throw Error('telegram_wrong_chat');
 return {...reserved,state:'active',telegram_thread_id:normalizeThreadId(threadId)};
}
export function uncertainTopic(reserved,reason='unknown'){
 if(reserved?.state!=='reserved')throw Error('telegram_not_reserved');
 const allowed=new Set(['network_timeout','api_rejected','mapping_update_failed','unknown']);
 return {...reserved,state:'needs_review',
   last_error_code:allowed.has(reason)?reason:'unknown'};
}
export function shouldCreateTopic(mapping){
 // Reservation must be newly inserted atomically with an idempotent unique key.
 // Existing reserved/uncertain/active/disabled rows can never auto-trigger another create.
 return mapping===null;
}
