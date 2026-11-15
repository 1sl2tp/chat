// TELE-003: Chat-only Topic plan. No reads from Zalo, Telegram calls, or DB writes.
import {normalizeChatId,normalizeThreadId} from './core.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bytes=new TextEncoder();
const clean=v=>String(v||'').replace(/[\u0000-\u001f\u007f-\u009f]+/g,' ').replace(/\s+/g,' ').trim();
function cut(v,n){let s='';for(const c of String(v)){if(bytes.encode(s+c).length>n)break;s+=c;}return s.trimEnd();}
function suffix(id){let h=2166136261;for(const b of bytes.encode(id)){h=Math.imul(h^b,16777619);}return (h>>>0).toString(16).padStart(8,'0').slice(0,6);}
function ensureUnique(rows,key,label){
  const s=new Set();for(const row of rows){const id=String(row?.[key]||'');if(!id||s.has(id))throw Error('telegram_duplicate_'+label);s.add(id);}
}
export function projectChatDirectory({accounts=[]}={}){
  if(!Array.isArray(accounts)||accounts.length>2000)throw Error('telegram_accounts_invalid');
  const active=accounts.filter(a=>a?.role==='user'&&!a.deleted_at&&UUID.test(String(a.id||'')));
  ensureUnique(active,'id','chat_account');
  const rows=active.map(a=>({contactKey:'chat:'+String(a.id).toLowerCase(),chatAccountId:String(a.id).toLowerCase(),
    name:cut(clean(a.display_name||a.username)||'Chưa đặt tên',128),state:'chat_active',replyEligible:false}));
  rows.sort((a,b)=>a.contactKey.localeCompare(b.contactKey));
  const counts=new Map();
  for(const row of rows){const k=row.name.normalize('NFC').toLocaleLowerCase('vi');counts.set(k,(counts.get(k)||0)+1);}
  return rows.map(row=>{
    const duplicate=counts.get(row.name.normalize('NFC').toLocaleLowerCase('vi'))>1;
    const end=duplicate?' · '+suffix(row.contactKey):'';
    return Object.freeze({...row,topicTitle:cut(row.name,128-bytes.encode(end).length)+end});
  });
}
export function planTopicDirectory({directory=[],mappings=[],chatId,maxCreates=3}={}){
  const target=normalizeChatId(chatId);
  if(!Number.isInteger(maxCreates)||maxCreates<0||maxCreates>200)throw Error('telegram_max_creates_invalid');
  if(!Array.isArray(directory)||directory.length>2000)throw Error('telegram_directory_invalid');
  ensureUnique(directory,'contactKey','contact_key');
  const current=(Array.isArray(mappings)?mappings:[]).filter(m=>String(m.telegram_chat_id)===target&&m.state!=='disabled');
  ensureUnique(current,'contact_key','mapping_account');
  const ids=new Set();
  for(const row of current){const t=normalizeThreadId(row.telegram_thread_id);if(ids.has(t))throw Error('telegram_duplicate_topic_ownership');ids.add(t);}
  const byKey=new Map(current.map(m=>[String(m.contact_key),m]));
  const actions=[];let creates=0;
  for(const row of directory){
    if(row.state!=='chat_active'||!UUID.test(row.chatAccountId||'')||
      row.contactKey!=='chat:'+row.chatAccountId||!row.topicTitle)throw Error('telegram_invalid_chat_contact');
    const old=byKey.get(row.contactKey);
    if(old)actions.push({type:old.topic_name===row.topicTitle?'keep':'rename',
      contactKey:row.contactKey,threadId:normalizeThreadId(old.telegram_thread_id),title:row.topicTitle});
    else if(creates<maxCreates){creates++;actions.push({type:'create',contactKey:row.contactKey,title:row.topicTitle});}
  }
  return Object.freeze({mode:'plan_only',chatId:target,total:directory.length,
    existing:current.length,plannedCreates:creates,createdTopics:0,
    actions:Object.freeze(actions.map(x=>Object.freeze(x)))});
}
