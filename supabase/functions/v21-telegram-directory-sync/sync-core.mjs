// TELE-005: pure validation for one-time, admin-authorized Chat→Telegram Topic bootstrap.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc=new TextEncoder();
function cutUtf8(s,n){let result='';for(const ch of String(s)){if(enc.encode(result+ch).length>n)break;result+=ch;}return result.trimEnd();}
function tag(id){let h=2166136261;for(const c of enc.encode(id)){h=Math.imul(h^c,16777619);}return (h>>>0).toString(16).padStart(8,'0').slice(0,6);}
export function validateSyncConfig(env){
  const token=String(env?.TELEGRAM_BOT_TOKEN||'').trim();
  const admin=String(env?.TELEGRAM_ADMIN_USER_ID||'').trim();
  const chat=String(env?.TELEGRAM_PILOT_CHAT_ID||'').trim();
  return {token,admin,chat,valid:/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(token)&&
    /^[1-9][0-9]{4,18}$/.test(admin)&&chat===admin};
}
export function exactAdminCommand(updates,admin,chat,nowSeconds=Math.floor(Date.now()/1000)){
  if(!Array.isArray(updates))return null;
  const found=updates.filter(u=>{
    const m=u?.message;
    return Number.isSafeInteger(u?.update_id)&&u.update_id>=0&&
      m?.chat?.type==='private'&&String(m?.chat?.id)===String(chat)&&
      String(m?.from?.id)===String(admin)&&m?.from?.is_bot!==true&&
      String(m?.text||'').trim()==='/sync143'&&
      Number.isSafeInteger(m?.date)&&m.date<=nowSeconds+60&&
      m.date>=nowSeconds-600&&
      !m.forward_origin&&!m.forward_from&&!m.sender_chat&&!m.is_automatic_forward;
  }).sort((a,b)=>b.update_id-a.update_id);
  return found.length?{updateId:found[0].update_id,offset:found[0].update_id+1}:null;
}
export function exactBotAndChat(bot,chat,admin){
  if(bot?.is_bot!==true||String(bot?.username||'').toLowerCase()!=='taphoa_chat_bridge_bot'||
    bot?.has_topics_enabled!==true)throw Error('wrong_bot_or_topics_disabled');
  if(chat?.type!=='private'||String(chat?.id)!==String(admin))throw Error('wrong_private_chat');
  return true;
}
export function canonicalTopicRows(accounts){
  if(!Array.isArray(accounts)||accounts.length!==143)throw Error('chat_count_changed_from_143');
  const distinct=new Set(),rows=[];
  for(const a of accounts){
    const id=String(a?.id||'').toLowerCase();
    if(!UUID.test(id)||distinct.has(id))throw Error('duplicate_or_invalid_chat_account');
    distinct.add(id);
    const title=cutUtf8(String(a?.display_name||'').replace(/[\u0000-\u001f\u007f-\u009f]+/g,' ').replace(/\s+/g,' ').trim(),128);
    if(!title)throw Error('chat_account_name_missing');
    rows.push({chat_account_id:id,topic_title:title});
  }
  rows.sort((a,b)=>a.chat_account_id.localeCompare(b.chat_account_id));
  const count=new Map();
  for(const a of rows){const key=a.topic_title.normalize('NFC').toLocaleLowerCase('vi');count.set(key,(count.get(key)||0)+1);}
  return rows.map(a=>{
    const key=a.topic_title.normalize('NFC').toLocaleLowerCase('vi');
    const suffix=count.get(key)>1?' · '+tag(a.chat_account_id):'';
    return {...a,topic_title:cutUtf8(a.topic_title,128-enc.encode(suffix).length)+suffix};
  });
}
export function exactCreatedTopic(created){
  const id=Number(created?.message_thread_id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('telegram_thread_id_invalid');
  return id;
}
