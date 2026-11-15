// TELE-003: pure projection and planning only. No Telegram API or database writes.
import {normalizeChatId,normalizeThreadId} from './core.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const enc=new TextEncoder();
function cleanName(v){return String(v||'').replace(/[\u0000-\u001f\u007f-\u009f]+/g,' ').replace(/\s+/g,' ').trim();}
function truncateUtf8(v,max){
  let s='';
  for(const char of String(v)){if(enc.encode(s+char).length>max)break;s+=char;}
  return s.trimEnd();
}
function title(v){return truncateUtf8(cleanName(v)||'Liên hệ chưa đặt tên',128);}
function tag(key){
  let h=2166136261;
  for(const b of enc.encode(key)){h^=b;h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0').slice(0,6);
}
function zaloId(v){
  const id=String(v||'').trim();
  if(!id||id.length>160||/[\u0000-\u001f\u007f]/.test(id))throw Error('telegram_zalo_identity_invalid');
  return id;
}
function unique(items,key,label){
  const seen=new Set();
  for(const x of items){
    const val=String(x?.[key]||'');
    if(seen.has(val))throw Error('telegram_duplicate_'+label);
    seen.add(val);
  }
}
export function projectChatDirectory({accounts=[],links=[],contacts=[],includeUnlinkedZalo=false}={}){
  // Caller MUST scope snapshot by Chat Admin permissions before invoking.
  const active=(Array.isArray(accounts)?accounts:[]).filter(x=>x?.role==='user'&&!x?.deleted_at&&UUID.test(String(x?.id||'')));
  unique(active,'id','chat_accounts');
  const linked=Array.isArray(links)?links:[];
  unique(linked,'chat_account_id','zalo_links');
  const byAccount=new Map(linked.map(l=>[String(l.chat_account_id),l]));
  const byZalo=new Map();
  for(const z of Array.isArray(contacts)?contacts:[]){
    const id=zaloId(z?.zalo_id);
    if(byZalo.has(id))throw Error('telegram_duplicate_zalo_contacts');
    byZalo.set(id,z);
  }
  const used=new Set(),out=[];
  for(const a of active){
    const id=String(a.id).toLowerCase(),link=byAccount.get(String(a.id));
    let z=null;
    if(link?.zalo_id){
      const zid=zaloId(link.zalo_id);
      if(used.has(zid))throw Error('telegram_duplicate_zalo_link_target');
      used.add(zid);
      z=byZalo.get(zid)||null;
    }
    if(z?.thread_type==='group')continue; // Group bridge has different routing.
    out.push({contactKey:'chat:'+id,chatAccountId:id,
      zaloId:link?.zalo_id?String(link.zalo_id):null,
      name:title(z?.alias_name||a.display_name||z?.display_name||a.username),
      replyEligible:Boolean(link?.zalo_id),state:link?.zalo_id?'linked_chat':'chat_only'});
  }
  if(includeUnlinkedZalo){
    const referenced=new Set(linked.map(l=>String(l.zalo_id||'')).filter(Boolean));
    for(const [id,z] of byZalo){
      if(referenced.has(id)||z?.thread_type==='group')continue;
      out.push({contactKey:'zalo:'+id,chatAccountId:null,zaloId:id,
        name:title(z.alias_name||z.display_name||z.profile_name),
        replyEligible:false,state:'unlinked_zalo'});
    }
  }
  unique(out,'contactKey','contact_keys');
  out.sort((a,b)=>a.contactKey.localeCompare(b.contactKey));
  const counts=new Map();
  for(const c of out){
    const k=c.name.normalize('NFC').toLocaleLowerCase('vi');
    counts.set(k,(counts.get(k)||0)+1);
  }
  return out.map(c=>{
    const repeated=counts.get(c.name.normalize('NFC').toLocaleLowerCase('vi'))>1;
    const suffix=repeated?' · '+tag(c.contactKey):'';
    return Object.freeze({...c,topicTitle:truncateUtf8(c.name,128-enc.encode(suffix).length)+suffix});
  });
}
export function planTopicDirectory({directory,mappings=[],chatId,maxCreates=3}={}){
  const target=normalizeChatId(chatId),cap=Number(maxCreates);
  if(!Number.isSafeInteger(cap)||cap<0||cap>3)throw Error('telegram_pilot_create_cap_invalid');
  const rows=Array.isArray(directory)?directory:[];
  if(rows.length>1000)throw Error('telegram_directory_snapshot_too_large');
  unique(rows,'contactKey','input_contact_keys');
  const active=(Array.isArray(mappings)?mappings:[]).filter(m=>String(m.telegram_chat_id)===target&&m.state!=='disabled');
  unique(active,'contact_key','existing_contact_keys');
  const ids=new Set();
  for(const mapping of active){
    const id=normalizeThreadId(mapping.telegram_thread_id);
    if(ids.has(id))throw Error('telegram_duplicate_topic_ownership');
    ids.add(id);
  }
  const existing=new Map(active.map(m=>[String(m.contact_key),m]));
  const actions=[];let creates=0;
  for(const c of rows){
    if(!c?.contactKey||!c?.topicTitle||!['linked_chat','chat_only','unlinked_zalo'].includes(c.state)){
      throw Error('telegram_directory_contact_invalid');
    }
    const m=existing.get(String(c.contactKey));
    if(!m){
      if(creates>=cap)continue;
      creates++;
      actions.push({type:'create',contactKey:c.contactKey,title:c.topicTitle,
        replyEligible:false,sourceState:c.state});
    }else{
      actions.push({type:String(m.topic_name||'')===c.topicTitle?'keep':'rename',
        contactKey:c.contactKey,threadId:normalizeThreadId(m.telegram_thread_id),
        title:c.topicTitle,replyEligible:c.replyEligible,sourceState:c.state});
    }
  }
  return Object.freeze({mode:'plan_only',telegramChatId:target,
    contacts:rows.length,created:0,plannedCreates:creates,
    actions:Object.freeze(actions.map(a=>Object.freeze(a)))});
}
