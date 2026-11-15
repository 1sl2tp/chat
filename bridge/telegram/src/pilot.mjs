#!/usr/bin/env node
import {DEMO_CONTACTS,normalizedPilotContacts,normalizeChatId,normalizeThreadId,topicMessageFor} from './core.mjs';
import {createTelegramApi,validateTarget} from './api.mjs';
import {readPilotDirectory,parseAllowlist} from './backend.mjs';
export function parseArgs(args=[]){
  for(const arg of args){
    if(arg==='--apply'||arg==='--source=backend'||arg==='--mode=group'||arg==='--mode=private')continue;
    if(arg.startsWith('--existing-thread-id='))continue;
    throw new Error('telegram_unknown_argument');
  }
  const modes=args.filter(a=>a.startsWith('--mode='));
  if(modes.length>1)throw new Error('telegram_multiple_modes');
  const existing=args.filter(a=>a.startsWith('--existing-thread-id='));
  if(existing.length>1)throw new Error('telegram_multiple_thread_ids');
  return {apply:args.includes('--apply'),source:args.includes('--source=backend')?'backend':'demo',
    mode:modes[0]?.slice(7)||'private',
    existingThreadId:existing.length?normalizeThreadId(existing[0].split('=')[1]):null};
}
export async function runPilot(args,{env=process.env,fetchImpl=fetch,log=console.log}={}){
  const config=parseArgs(args);
  const contacts=config.source==='backend'
    ?await readPilotDirectory({baseUrl:env.CHAT_SUPABASE_URL,serviceRoleKey:env.CHAT_SUPABASE_SERVICE_ROLE_KEY,
      accountIds:parseAllowlist(env.TELEGRAM_PILOT_ACCOUNT_IDS),fetchImpl})
    :normalizedPilotContacts(DEMO_CONTACTS);
  if(!config.apply){
    log(JSON.stringify({stage:'dry-run',mode:config.mode,source:config.source,
      ready:contacts.map(contact=>({name:contact.name,accountId:contact.accountId,linkedToZalo:Boolean(contact.zaloId)})),
      changedProduction:false,sentToTelegram:false},null,2));
    return {stage:'dry-run',contacts:contacts.length};
  }
  const api=createTelegramApi({token:env.TELEGRAM_BOT_TOKEN,fetchImpl});
  const chatId=normalizeChatId(env.TELEGRAM_PILOT_CHAT_ID);
  const bot=await api.getMe(),chat=await api.getChat(chatId);
  validateTarget({bot,chat,mode:config.mode});
  const contact=contacts[0];
  if(!contact)throw new Error('telegram_no_pilot_contact');
  const threadId=config.existingThreadId??normalizeThreadId(
    (await api.createTopic(chatId,'🧪 '+contact.name)).message_thread_id);
  try{
    const ack=await api.sendProbe(chatId,threadId,topicMessageFor(contact));
    log(JSON.stringify({stage:'telegram-probe-passed',mode:config.mode,
      accountId:contact.accountId,topicId:threadId,messageId:ack.messageId,
      note:'Chỉ gửi vào Telegram quản trị. Chưa có đồng bộ dữ liệu hoặc gửi Zalo.'},null,2));
    return {stage:'telegram-probe-passed',threadId};
  }catch(error){
    log(JSON.stringify({stage:'telegram-probe-failed',topicId:threadId,
      error:String(error?.message||'telegram_error'),
      note:'Giữ thread_id để kiểm tra; KHÔNG coi là đã gửi. Có thể thử mode=group.'},null,2));
    throw error;
  }
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).pathname===new URL(import.meta.url).pathname){
  runPilot(process.argv.slice(2)).catch(error=>{
    console.error('Telegram pilot:',String(error?.message||error));
    process.exitCode=1;
  });
}
