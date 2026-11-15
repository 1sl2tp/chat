import {pilotConfig,verifyTelegramBot,verifyPilotChat,selectPilotCommand,exactTopicAck,
  PILOT_BOT_USERNAME} from './pilot-core.mjs';

const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'},
});
let running=false;
let lastAttempt=0;

async function tg(token:string,method:string,body:Record<string,unknown>={}){
  const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
    signal:AbortSignal.timeout(12000),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true){
    const desc=String(data?.description||'').toLowerCase();
    if(desc.includes('bot_topic_wrong_home'))throw new Error('telegram_topic_wrong_home');
    if(desc.includes('message thread not found'))throw new Error('telegram_topic_unavailable');
    throw new Error('telegram_'+method+'_failed');
  }
  return data.result;
}

Deno.serve(async req=>{
  if(req.method!=='GET')return json(405,{ok:false,error:'method_not_allowed'});
  const url=new URL(req.url);
  if(!['/status','/probe'].some(s=>url.pathname.endsWith(s))){
    return json(404,{ok:false,error:'route_not_found'});
  }
  const env={
    TELEGRAM_BOT_TOKEN:Deno.env.get('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_ADMIN_USER_ID:Deno.env.get('TELEGRAM_ADMIN_USER_ID'),
    TELEGRAM_PILOT_CHAT_ID:Deno.env.get('TELEGRAM_PILOT_CHAT_ID'),
  };
  const config=pilotConfig(env);
  if(url.pathname.endsWith('/status')){
    // Public status intentionally reports only configuration PRESENCE, never token or admin ID.
    return json(200,{ok:true,mode:'pilot_only',configured:config.valid,
      missing:config.missing,bot:'@'+PILOT_BOT_USERNAME,
      note:'No Telegram message or production data is sent on /status.'});
  }
  if(!config.valid)return json(409,{ok:false,code:'pilot_setup_incomplete',missing:config.missing});
  if(running)return json(429,{ok:false,code:'pilot_already_running'});
  if(Date.now()-lastAttempt<30000)return json(429,{ok:false,code:'pilot_cooldown'});
  running=true;
  lastAttempt=Date.now();
  try{
    const me=await tg(config.token,'getMe');
    verifyTelegramBot(me);
    const hook=await tg(config.token,'getWebhookInfo');
    if(String(hook?.url||''))return json(409,{ok:false,code:'pilot_existing_webhook',
      note:'Will not replace another bot owner.'});
    // One-shot pull: never add a polling loop or cron to Chat/Render.
    const updates=await tg(config.token,'getUpdates',{limit:100,timeout:0,allowed_updates:['message']});
    const command=selectPilotCommand(updates,config.admin,config.chat);
    if(!command.selected)return json(200,{ok:true,state:'awaiting_admin_command',
      instruction:'Send /pilot to @'+PILOT_BOT_USERNAME+' from the admin Telegram account, then retry once.'});
    const chat=await tg(config.token,'getChat',{chat_id:config.chat});
    verifyPilotChat(chat,config.admin);
    // Consume the command before any write: retry cannot replay it after a failure.
    await tg(config.token,'getUpdates',{offset:command.ackOffset,limit:1,timeout:0,allowed_updates:['message']});
    const created=await tg(config.token,'createForumTopic',{
      chat_id:config.chat,name:'🧪 Khách thử TELE-002',
    });
    const topicId=Number(created?.message_thread_id);
    if(!Number.isSafeInteger(topicId)||topicId<=0)throw new Error('pilot_topic_create_invalid');
    const sent=await tg(config.token,'sendMessage',{
      chat_id:config.chat,message_thread_id:topicId,
      text:'🧪 Kiểm tra Telegram Topics thành công.\nChỉ là tin thử trong Telegram quản trị. Không gửi Zalo, không ghi Chat/TAPHOA.',
      disable_notification:true,
    });
    const ack=exactTopicAck(sent,topicId,config.chat);
    return json(200,{ok:true,state:'topic_probe_passed',threadId:ack.threadId,
      messageId:ack.messageId,productionChanged:false,
      note:'Review visually in Telegram. No customer data was used.'});
  }catch(error){
    // Return safe error codes only; do not log/send token or contents of Telegram updates.
    const reason=error instanceof Error?error.message:'pilot_failed';
    const safe=/^(pilot_[a-z_]+|telegram_(topic_wrong_home|topic_unavailable|[a-zA-Z]+_failed))$/.test(reason)
      ?reason:'pilot_request_failed';
    return json(502,{ok:false,code:safe,
      note:'No Zalo/Chat operation was executed. If a test Topic was created, inspect Telegram before retrying.'});
  }finally{running=false;}
});
