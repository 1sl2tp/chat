import {validateSyncConfig,exactAdminCommand,exactBotAndChat,
  canonicalTopicRows,exactCreatedTopic} from './sync-core.mjs';

// TELE-005 only. No customer message forwarding, no Zalo, no sales/collections writes.
// A single fresh Telegram /sync143 from the configured ADMIN is required for POST /run.
// Mapping rows are claimed BEFORE createForumTopic; uncertain requests never retry.
const API='https://api.telegram.org/bot';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff'};
const respond=(code:number,data:unknown)=>new Response(JSON.stringify(data),{status:code,headers});
let running=false,lastAttempt=0;
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

type StateRow={chat_account_id:string;state:string;telegram_thread_id:number|null};
type Account={id:string;display_name:string};

async function telegram(token:string,method:string,body:Record<string,unknown>={}):Promise<any>{
  const response=await fetch(API+token+'/'+method,{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify(body),
    signal:AbortSignal.timeout(14000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true){
    if(response.status===429)throw Error('telegram_rate_limited');
    const d=String(data?.description||'').toLowerCase();
    if(d.includes('bot_topic_wrong_home'))throw Error('telegram_wrong_topic_home');
    throw Error('telegram_'+method+'_rejected');
  }
  return data.result;
}
function supabaseEnv(){
  const base=String(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
  const service=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
  if(!base.startsWith('https://')||!service)throw Error('backend_secrets_missing');
  return {base,service};
}
async function rest(path:string,opts:{method?:string;body?:unknown;prefer?:string}={}):Promise<any>{
  const {base,service}=supabaseEnv();
  const response=await fetch(base+'/rest/v1/'+path,{
    method:opts.method||'GET',
    headers:{'content-type':'application/json',accept:'application/json',
      apikey:service,authorization:'Bearer '+service,
      ...(opts.prefer?{Prefer:opts.prefer}:{})},
    ...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)}),
    signal:AbortSignal.timeout(14000),
  });
  if(!response.ok)throw Error('chat_mapping_db_http_'+response.status);
  if((opts.prefer||'').includes('return=minimal'))return null;
  return await response.json().catch(()=>null);
}
function topicTable(filters:string){
  return 'v21_telegram_topic_links?'+filters;
}
const chatTable='v21_accounts?select=id,display_name&role=eq.user&deleted_at=is.null&order=id.asc&limit=200';
async function accounts():Promise<{chat_account_id:string;topic_title:string}[]>{
  const found=await rest(chatTable) as Account[];
  return canonicalTopicRows(found);
}
async function mapping(chat:string):Promise<StateRow[]>{
  const rows=await rest(topicTable('select=chat_account_id,state,telegram_thread_id&telegram_chat_id=eq.'+
    encodeURIComponent(chat)+'&limit=200')) as StateRow[];
  if(!Array.isArray(rows)||rows.length>200)throw Error('mapping_snapshot_invalid');
  return rows;
}
async function reserve(chat:string,rows:{chat_account_id:string;topic_title:string}[]){
  if(!rows.length)return;
  const payload=rows.map(x=>({telegram_chat_id:Number(chat),chat_account_id:x.chat_account_id,
    topic_title:x.topic_title,state:'reserved'}));
  await rest(topicTable('on_conflict=telegram_chat_id,chat_account_id'),{
    method:'POST',body:payload,prefer:'resolution=ignore-duplicates,return=minimal'});
}
async function patchClaim(chat:string,id:string,state:'reserved'|'needs_review',body:Record<string,unknown>){
  const query='telegram_chat_id=eq.'+encodeURIComponent(chat)+
    '&chat_account_id=eq.'+encodeURIComponent(id)+'&state=eq.'+state+
    '&select=chat_account_id,state,telegram_thread_id';
  const result=await rest(topicTable(query),{method:'PATCH',body,prefer:'return=representation'});
  if(!Array.isArray(result)||result.length!==1)throw Error('mapping_claim_not_unique_or_missing');
  return result[0];
}
async function attemptOne(token:string,chat:string,row:{chat_account_id:string;topic_title:string}){
  // Claim with state transition BEFORE the external, non-idempotent Telegram call.
  await patchClaim(chat,row.chat_account_id,'reserved',{
    state:'needs_review',last_error_code:'create_in_flight'});
  let topicId:number;
  try{
    const created=await telegram(token,'createForumTopic',{
      chat_id:chat,name:row.topic_title});
    topicId=exactCreatedTopic(created);
  }catch{
    // Leave needs_review, do not retry. Timeout could mean Topic was created.
    return {created:false,needsReview:true};
  }
  try{
    const final=await patchClaim(chat,row.chat_account_id,'needs_review',{
      state:'active',telegram_thread_id:topicId,last_error_code:null});
    if(Number(final.telegram_thread_id)!==topicId||final.state!=='active')throw Error('mapping_ack_mismatch');
    return {created:true,needsReview:false};
  }catch{
    // Topic may exist; preserve needs_review for human reconciliation.
    return {created:false,needsReview:true};
  }
}
Deno.serve(async req=>{
  const route=new URL(req.url).pathname.split('/').at(-1);
  if(route==='status'&&req.method==='GET'){
    try{
      const rows=await mapping(String(Deno.env.get('TELEGRAM_PILOT_CHAT_ID')||''));
      const accountsCount=(await accounts()).length;
      const count=(state:string)=>rows.filter(r=>r.state===state).length;
      return respond(200,{ok:true,source:'v21_accounts',accounts:accountsCount,
        activeTopics:count('active'),reserved:count('reserved'),
        needsReview:count('needs_review'),noZaloImport:true});
    }catch{return respond(502,{ok:false,code:'read_only_status_failed'});}
  }
  if(route!=='run'||req.method!=='POST')return respond(404,{ok:false,code:'not_found'});
  const config=validateSyncConfig({
    TELEGRAM_BOT_TOKEN:Deno.env.get('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_ADMIN_USER_ID:Deno.env.get('TELEGRAM_ADMIN_USER_ID'),
    TELEGRAM_PILOT_CHAT_ID:Deno.env.get('TELEGRAM_PILOT_CHAT_ID')});
  if(!config.valid)return respond(409,{ok:false,code:'config_incomplete'});
  if(running||Date.now()-lastAttempt<30000)return respond(429,{ok:false,code:'busy_or_cooldown'});
  running=true;lastAttempt=Date.now();
  try{
    const bot=await telegram(config.token,'getMe');
    const chat=await telegram(config.token,'getChat',{chat_id:config.chat});
    exactBotAndChat(bot,chat,config.admin);
    const webhook=await telegram(config.token,'getWebhookInfo');
    if(String(webhook?.url||''))return respond(409,{ok:false,code:'another_webhook_owner'});
    const all=await accounts();
    const previous=await mapping(config.chat);
    const updates=await telegram(config.token,'getUpdates',{timeout:0,limit:100,allowed_updates:['message']});
    const command=exactAdminCommand(updates,config.admin,config.chat);
    if(!command)return respond(403,{ok:false,code:'missing_fresh_admin_sync_command',
      instruction:'Send /sync143 in the private TAPHOA Chat bot, then invoke POST /run once.'});
    // Acknowledge only the command and older updates, not future customer messages.
    await telegram(config.token,'getUpdates',{offset:command.offset,timeout:0,limit:1});
    const known=new Set(previous.map(m=>m.chat_account_id));
    await reserve(config.chat,all.filter(row=>!known.has(row.chat_account_id)));
    const saved=await mapping(config.chat);
    const reserved=new Set(saved.filter(row=>row.state==='reserved').map(row=>row.chat_account_id));
    const toCreate=all.filter(row=>reserved.has(row.chat_account_id));
    let created=0,needsReview=0;
    // Maximum 3 simultaneous Telegram create calls, rate limited in controlled groups.
    for(let i=0;i<toCreate.length;i+=3){
      const chunk=toCreate.slice(i,i+3);
      const results=await Promise.all(chunk.map(row=>attemptOne(config.token,config.chat,row)));
      created+=results.filter(x=>x.created).length;
      needsReview+=results.filter(x=>x.needsReview).length;
      if(needsReview)break; // fail closed: never continue bulk creation after uncertain outcome.
      await pause(220);
    }
    return respond(needsReview?207:200,{ok:needsReview===0,
      state:needsReview?'needs_manual_review':'batch_completed',
      source:'143_chat_accounts',created,needsReview,
      note:'No Chat/Zalo messages, sales, debt or bank writes.'});
  }catch{
    return respond(502,{ok:false,code:'sync_failed_closed',
      note:'No automatic retries. Inspect topic mapping rows before another run.'});
  }finally{running=false;}
});
