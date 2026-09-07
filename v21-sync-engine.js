(()=>{
'use strict';
const VERSION='V21.72.15';
const PULL_LIMIT=200;
let client=null;
let accountId=null;
let appSessionId=null;
let syncing=false;
let wakePending=false;
let wakeHint=0;
let currentContactId=null;
let currentConversationId=null;
let lastReason='idle';
let contactEpoch=0;
const dirtyActiveMessageIds=new Set();
let readMarkTimer=0;
let readMarkConversationId=null;

function authStore(){return window.V21AuthSessionStore||null;}
function cache(){return window.V21CacheStore||null;}
function media(){return window.V21MediaCache||null;}
function shell(){return window.ChatAppShell||null;}
function contacts(){return window.V21ContactStore||null;}
function messages(){return window.V21MessageStore||null;}
function authSnapshot(){return authStore()?.snapshot?.()||{state:'GUEST'};}
function online(){return navigator.onLine!==false;}
function baseMimeType(value){
  return String(value||'').split(';',1)[0].trim().toLowerCase();
}

function contactIdForConversation(conversationId){
  const id=String(conversationId||'');
  if(!id)return null;
  const row=contacts()?.snapshot?.().find(item=>String(item?.conversation_id||'')===id)||null;
  return row?.id?String(row.id):null;
}

async function refreshMessageSessionFromMedia(messageId,conversationId){
  const id=String(messageId||'');
  if(!id||!accountId)return null;
  const parent=await cache()?.getMessage?.(accountId,id);
  if(!parent)return null;
  const assets=await media()?.listForMessage?.({accountId,messageId:id})||[];
  const enriched={...parent,_media_assets:assets};
  await cache()?.putMessage?.(accountId,enriched);
  const contactId=contactIdForConversation(conversationId||parent.conversation_id);
  if(contactId)messages()?.mergeForContact?.(enriched,{contactId,conversationId:conversationId||parent.conversation_id});
  return enriched;
}

function conversationHydrationKey(conversationId){
  return `conversation_hydrated:${String(conversationId||'')}`;
}

async function isConversationHydrated(conversationId){
  if(!accountId||!conversationId)return false;
  return Boolean(await cache()?.getMeta?.(accountId,conversationHydrationKey(conversationId),false));
}

async function setConversationHydrated(conversationId,value=true){
  if(!accountId||!conversationId)return false;
  await cache()?.setMeta?.(accountId,conversationHydrationKey(conversationId),Boolean(value));
  return Boolean(value);
}

function canonicalContact(payload){
  return payload?{
    id:payload.id,
    username:payload.username,
    display_name:payload.display_name,
    role:payload.role,
    avatar_path:payload.avatar_path||null,
    locked_at:payload.locked_at||null,
    conversation_id:payload.conversation_id||null,
    preview_text:payload.preview_text||null,
    preview_kind:payload.preview_kind||'text',
    latest_at:payload.latest_at||null,
    has_unread:Boolean(payload.has_unread),
    version:Number(payload.version)||0,
    updated_at:payload.updated_at||null,
    deleted_at:payload.deleted_at||null
  }:null;
}

function canonicalMessage(payload){
  return payload?{
    id:payload.id,
    conversation_id:payload.conversation_id,
    sender_account_id:payload.sender_account_id,
    client_id:payload.client_id,
    body:payload.body,
    reply_to_message_id:payload.reply_to_message_id?String(payload.reply_to_message_id):null,
    reply_preview:payload.reply_preview?String(payload.reply_preview):null,
    reply_sender_account_id:payload.reply_sender_account_id?String(payload.reply_sender_account_id):null,
    created_at:payload.created_at,
    updated_at:payload.updated_at||payload.created_at,
    deleted_at:payload.deleted_at||null,
    version:Number(payload.version)||0
  }:null;
}


function mediaPreviewLabel(kind){
  if(kind==='image')return 'Ảnh';
  if(kind==='audio')return 'Ghi âm';
  return 'Tệp';
}

function messagePreviewContract(row){
  const body=String(row?.body||'').replace(/\s+/g,' ').trim();
  const firstMedia=(Array.isArray(row?._media_assets)?row._media_assets:[]).find(item=>item&&!item.deleted_at)||null;
  if(body)return{preview_text:body,preview_kind:firstMedia?'mixed':'text'};
  if(firstMedia)return{preview_text:mediaPreviewLabel(firstMedia.kind),preview_kind:firstMedia.kind||'file'};
  return{preview_text:'',preview_kind:'text'};
}

function migrateLegacyCachedMediaBody(row){
  if(!row)return row;
  const assets=Array.isArray(row._media_assets)?row._media_assets.filter(item=>item&&!item.deleted_at):[];
  if(!assets.length)return row;
  if(String(row.body||'').trim()!=='Ảnh')return row;
  return{...row,body:'',_legacy_media_body_migrated:true};
}

function canonicalMedia(payload){
  if(!payload?.id)return null;
  return{
    id:String(payload.id),
    conversation_id:payload.conversation_id?String(payload.conversation_id):null,
    message_id:payload.message_id?String(payload.message_id):null,
    owner_account_id:payload.owner_account_id?String(payload.owner_account_id):null,
    kind:String(payload.kind||'file'),
    file_name:payload.file_name?String(payload.file_name):null,
    mime_type:String(payload.mime_type||'application/octet-stream'),
    size_bytes:Number(payload.size_bytes)||0,
    duration_ms:Number(payload.duration_ms)||null,
    storage_key:payload.storage_key?String(payload.storage_key):null,
    content_hash:payload.content_hash?String(payload.content_hash):null,
    width_px:Number(payload.width_px)||null,
    height_px:Number(payload.height_px)||null,
    sort_index:Number(payload.sort_index)||0,
    version:Number(payload.version)||0,
    created_at:payload.created_at||null,
    updated_at:payload.updated_at||payload.created_at||null,
    deleted_at:payload.deleted_at||null
  };
}

async function enrichMessageWithMedia(row){
  if(!row?.id||!accountId)return row;
  const assets=await media()?.listForMessage?.({accountId,messageId:row.id})||[];
  return assets.length?{...row,_media_assets:assets.map(canonicalMedia).filter(Boolean)}:row;
}

function enrichRowsFromMediaIndex(rows,mediaIndex){
  const index=mediaIndex instanceof Map?mediaIndex:new Map();
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const assets=index.get(String(row?.id||''))||[];
    const enriched=assets.length?{...row,_media_assets:assets.map(canonicalMedia).filter(Boolean)}:row;
    return migrateLegacyCachedMediaBody(enriched);
  });
}

function wakeMediaDownload(meta){
  if(!meta?.id||meta.deleted_at||!client||!online())return;
  if(String(meta.conversation_id||'')!==String(currentConversationId||'')||!chatVisible())return;
  // Realtime/media events only prewarm the currently visible conversation.
  // Inactive and historical media stay metadata-only until a mounted Renderer
  // requests the Blob through ensureMediaRemote().
  void ensureMediaRemote({accountId:String(accountId||''),assetId:String(meta.id)});
}

function markActiveMessageDirty(messageId,conversationId){
  const id=String(messageId||'');
  if(!id||String(conversationId||'')!==String(currentConversationId||''))return false;
  dirtyActiveMessageIds.add(id);
  return true;
}

async function flushActiveMessageVisuals(){
  if(!dirtyActiveMessageIds.size||!accountId||!currentConversationId)return 0;
  const ids=Array.from(dirtyActiveMessageIds);
  dirtyActiveMessageIds.clear();
  const mediaByMessage=await media()?.indexByMessage?.({accountId})||new Map();
  let applied=0;
  for(const id of ids){
    const cached=await cache()?.getMessage?.(accountId,id);
    if(!cached||cached.deleted_at)continue;
    const indexedAssets=mediaByMessage.get(String(id))||[];
    const cachedAssets=Array.isArray(cached?._media_assets)?cached._media_assets.filter(item=>item&&!item.deleted_at):[];
    const assets=(indexedAssets.length?indexedAssets:cachedAssets).map(canonicalMedia).filter(Boolean);
    const enriched=assets.length?{...cached,_media_assets:assets}:cached;
    const body=String(enriched?.body||'').trim();
    // Text RPC forbids an empty body. Therefore an empty message with no media
    // is an incomplete media parent whose child asset events have not arrived yet.
    if(!body&&!assets.length){
      dirtyActiveMessageIds.add(id);
      continue;
    }
    await cache()?.putMessage?.(accountId,enriched);
    const own=String(enriched.sender_account_id)===String(accountId);
    messages()?.apply?.(enriched,{remote:!own});
    applied+=1;
  }
  return applied;
}

async function patchContactSummary(conversationId,patch={}){
  if(!conversationId||!accountId)return false;
  const current=contacts()?.snapshot?.().find(row=>String(row.conversation_id||'')===String(conversationId));
  if(!current)return false;

  const safePatch={...(patch||{})};
  const currentLatest=Date.parse(current.latest_at||'')||0;
  const incomingLatest=Date.parse(safePatch.latest_at||'')||0;
  if(currentLatest&&incomingLatest&&incomingLatest<currentLatest){
    // A stale message/event may reconcile storage, but it must never move the
    // sidebar preview clock/content backwards. latest_at owns preview order.
    delete safePatch.latest_at;
    delete safePatch.preview_text;
    delete safePatch.preview_kind;
  }

  const next={...current,...safePatch};
  await cache()?.upsertContact?.(accountId,next);
  contacts()?.upsert?.(next);
  return true;
}

async function applyContactEvent(event){
  const payload=canonicalContact(event?.payload);
  if(!payload?.id)return false;
  const cached=(await cache()?.listContacts?.(accountId)||[]).find(item=>String(item.id)===String(payload.id));
  if(cached&&Number(cached.version||0)>=Number(payload.version||event.entity_version||0))return false;
  if(event.op==='delete'||payload.deleted_at){
    await cache()?.removeContact?.(accountId,payload.id);
    contacts()?.remove?.(payload.id);
  }else{
    const next={...(cached||{}),...payload};
    await cache()?.upsertContact?.(accountId,next);
    contacts()?.upsert?.(next);
  }
  return true;
}

async function applyMessageEvent(event){
  let payload=canonicalMessage(event?.payload);
  if(!payload?.id)return false;
  const cached=await cache()?.getMessage?.(accountId,payload.id);
  const nextVersion=Number(payload.version||event.entity_version||0);
  if(cached&&Number(cached.version||0)>=nextVersion)return false;
  if(event.op==='delete'||payload.deleted_at){
    await cache()?.removeMessage?.(accountId,payload.id);
    if(String(payload.conversation_id)===String(currentConversationId))messages()?.remove?.(payload.id);
    if(online())queueMicrotask(()=>{void syncContacts();});
    return true;
  }
  payload=migrateLegacyCachedMediaBody(payload);
  if(payload.client_id&&String(payload.id)!==String(payload.client_id))await cache()?.removeMessage?.(accountId,payload.client_id);
  const cleanPayload=payload?._legacy_media_body_migrated?(()=>{const next={...payload};delete next._legacy_media_body_migrated;return next;})():payload;
  await cache()?.putMessage?.(accountId,cleanPayload);
  payload=cleanPayload;
  const contactId=contactIdForConversation(payload.conversation_id);
  if(contactId)messages()?.mergeForContact?.(payload,{contactId,conversationId:payload.conversation_id});
  const own=String(payload.sender_account_id)===String(accountId);
  const visible=String(payload.conversation_id)===String(currentConversationId)&&chatVisible();
  const preview=messagePreviewContract(payload);
  await patchContactSummary(payload.conversation_id,{
    ...preview,latest_at:payload.created_at,
    has_unread:own?false:!visible
  });
  markActiveMessageDirty(payload.id,payload.conversation_id);
  if(!own&&visible)scheduleMarkRead(payload.conversation_id);
  return true;
}

async function applyReadEvent(event){
  const payload=event?.payload||null;
  if(!payload?.conversation_id||!payload?.account_id)return false;
  await cache()?.putReadState?.(accountId,payload);
  if(String(payload.account_id)===String(accountId))await patchContactSummary(payload.conversation_id,{has_unread:false});
  return true;
}

async function applyMediaEvent(event){
  const payload=canonicalMedia(event?.payload);
  if(!payload?.id)return false;
  if(event.op==='delete'||payload.deleted_at){
    await media()?.markDeleted?.({
      accountId,assetId:payload.id,
      meta:{...payload,deleted_at:payload.deleted_at||new Date().toISOString()}
    });
    if(payload.message_id){
      await refreshMessageSessionFromMedia(payload.message_id,payload.conversation_id);
      markActiveMessageDirty(payload.message_id,payload.conversation_id);
    }
    if(online())queueMicrotask(()=>{void syncContacts();});
  }else{
    await media()?.putRemoteMeta?.({accountId,assetId:payload.id,meta:payload});
    wakeMediaDownload(payload);
    const parent=payload.message_id
      ?await refreshMessageSessionFromMedia(payload.message_id,payload.conversation_id)
      :null;
    const parentPreview=parent?messagePreviewContract(parent):null;
    const hasParentText=Boolean(String(parent?.body||'').trim());
    const preview=hasParentText
      ?{...parentPreview,preview_kind:'mixed'}
      :{preview_text:mediaPreviewLabel(payload.kind),preview_kind:payload.kind||'file'};
    await patchContactSummary(payload.conversation_id,{
      ...preview,
      latest_at:parent?.created_at||payload.created_at||new Date().toISOString()
    });
    if(payload.message_id)markActiveMessageDirty(payload.message_id,payload.conversation_id);
  }
  return true;
}

async function applyEvent(event){
  if(!event?.entity_type)return false;
  if(event.entity_type==='account')return applyContactEvent(event);
  if(event.entity_type==='message')return applyMessageEvent(event);
  if(event.entity_type==='read_state')return applyReadEvent(event);
  if(event.entity_type==='media')return applyMediaEvent(event);
  return false;
}

async function pullAll(){
  if(!client||!accountId||!appSessionId||!online())return 0;
  const context=captureSyncOwnerContext();
  let cursor=Math.max(0,Number(await cache()?.getCursor?.(context.accountId))||0);
  if(!syncOwnerContextCurrent(context))return 0;
  let total=0;
  for(let page=0;page<20;page++){
    const {data,error}=await context.client.rpc('v21_sync_pull',{
      p_app_session_id:context.appSessionId,
      p_after_seq:cursor,
      p_limit:PULL_LIMIT
    });
    if(!syncOwnerContextCurrent(context))return total;
    if(error)throw error;
    const events=Array.isArray(data?.events)?data.events:[];
    for(const event of events){
      if(!syncOwnerContextCurrent(context))return total;
      await applyEvent(event);
      if(!syncOwnerContextCurrent(context))return total;
    }
    const next=Math.max(cursor,Number(data?.next_cursor)||cursor);
    if(next!==cursor)await cache()?.setCursor?.(context.accountId,next);
    if(!syncOwnerContextCurrent(context))return total;
    cursor=next;
    total+=events.length;
    if(!data?.has_more)break;
  }
  await flushActiveMessageVisuals();
  if(!syncOwnerContextCurrent(context))return total;
  return total;
}

async function applySnapshot(data,{requestedConversationId=null,requestedContactId=null}={}){
  if(!data||!accountId)return false;
  const contactRows=Array.isArray(data.contacts)?data.contacts.map(canonicalContact).filter(Boolean):[];
  await cache()?.replaceContacts?.(accountId,contactRows);
  contacts()?.replace?.(contactRows);

  const mediaRows=(Array.isArray(data.media_assets)?data.media_assets:[]).map(canonicalMedia).filter(Boolean);
  const mediaByMessage=new Map();
  for(const asset of mediaRows){
    await media()?.putRemoteMeta?.({accountId,assetId:asset.id,meta:asset});
    if(asset.message_id){
      const list=mediaByMessage.get(String(asset.message_id))||[];
      list.push(asset);mediaByMessage.set(String(asset.message_id),list);
    }
  }

  const rows=Array.isArray(data.messages)?data.messages.map(canonicalMessage).filter(Boolean).map(row=>{
    const assets=mediaByMessage.get(String(row.id))||[];
    const enrichedRow=assets.length?{...row,_media_assets:assets}:row;
    const migrated=migrateLegacyCachedMediaBody(enrichedRow);
    if(migrated?._legacy_media_body_migrated){const clean={...migrated};delete clean._legacy_media_body_migrated;return clean;}
    return migrated;
  }):[];
  if(rows.length)await cache()?.putMessages?.(accountId,rows);

  const stillActive=
    requestedConversationId&&
    String(requestedConversationId)===String(currentConversationId||'')&&
    (!requestedContactId||String(requestedContactId)===String(currentContactId||''));
  if(stillActive&&rows.length){
    messages()?.merge?.(rows,{conversationId:String(requestedConversationId),contactId:String(requestedContactId||currentContactId||'')});
  }

  for(const row of (Array.isArray(data.read_states)?data.read_states:[]))await cache()?.putReadState?.(accountId,row);
  return true;
}

async function initializeFromServer(){
  if(!client||!appSessionId||!accountId||!online())return false;
  const requestedConversationId=currentConversationId?String(currentConversationId):null;
  const requestedContactId=currentContactId?String(currentContactId):null;
  const {data,error}=await client.rpc('v21_sync_snapshot',{
    p_app_session_id:appSessionId,
    p_conversation_id:requestedConversationId,
    p_message_limit:100
  });
  if(error)throw error;
  await applySnapshot(data,{requestedConversationId,requestedContactId});
  await cache()?.setCursor?.(accountId,Number(data?.server_cursor)||0);
  await cache()?.setInitialized?.(accountId,true);
  if(requestedConversationId)await setConversationHydrated(requestedConversationId,true);
  return true;
}

async function canonicalReconcileActive(){
  if(!client||!appSessionId||!accountId||!online())return false;
  const requestedConversationId=currentConversationId?String(currentConversationId):null;
  const requestedContactId=currentContactId?String(currentContactId):null;
  const {data,error}=await client.rpc('v21_sync_snapshot',{
    p_app_session_id:appSessionId,
    p_conversation_id:requestedConversationId,
    p_message_limit:100
  });
  if(error)throw error;
  await applySnapshot(data,{requestedConversationId,requestedContactId});
  if(requestedConversationId)await setConversationHydrated(requestedConversationId,true);
  return true;
}

async function ensureConversation(contactId,{context=null}={}){
  const ownerAccountId=String(context?.accountId||accountId||'');
  const ownerAppSessionId=String(context?.appSessionId||appSessionId||'');
  const requestClient=context?.client||client;
  if(!ownerAccountId||!contactId)return null;
  let conversationId=await cache()?.getConversationId?.(ownerAccountId,contactId);
  if(context&&!syncOwnerContextCurrent(context))return null;
  if(conversationId)return String(conversationId);
  if(!online()||!requestClient||!ownerAppSessionId)return null;
  const {data,error}=await requestClient.rpc('v21_conversation_open',{
    p_app_session_id:ownerAppSessionId,p_contact_id:String(contactId)
  });
  if(context&&!syncOwnerContextCurrent(context))return null;
  if(error||!data)return null;
  conversationId=String(data);
  await cache()?.setConversationId?.(ownerAccountId,contactId,conversationId);
  if(context&&!syncOwnerContextCurrent(context))return null;
  return conversationId;
}

function mediaAssetsFromOutbox(item){
  if(item?.kind==='media'&&Array.isArray(item.assets))return item.assets;
  if(item?.kind==='images'&&Array.isArray(item.assets))return item.assets.map(asset=>({...asset,kind:'image'}));
  if(item?.kind==='image'&&item.asset)return[{...item.asset,kind:'image'}];
  if(item?.kind==='audio'&&item.asset)return[{...item.asset,kind:'audio'}];
  return[];
}

function outboxAsLocal(item,conversationId){
  const sourceAssets=mediaAssetsFromOutbox(item);
  const mediaAssets=sourceAssets.map((asset,index)=>{
    const kind=String(asset?.kind||'image');
    return canonicalMedia({
      id:asset.asset_id,
      conversation_id:conversationId||item.conversation_id||null,
      message_id:String(item.client_id),
      owner_account_id:String(item.account_id||accountId||''),
      kind,file_name:kind==='file'?(asset.file_name||null):null,mime_type:asset.mime_type,size_bytes:asset.size_bytes,
      duration_ms:kind==='audio'?Number(asset.duration_ms)||null:null,
      storage_key:asset.storage_key||null,width_px:kind==='image'?(asset.width_px||null):null,
      height_px:kind==='image'?(asset.height_px||null):null,sort_index:Number(asset.sort_index??index)||0,
      created_at:item.created_at||new Date().toISOString()
    });
  }).filter(Boolean);
  return{
    id:String(item.client_id),
    client_id:String(item.client_id),
    conversation_id:String(conversationId||item.conversation_id||''),
    sender_account_id:String(item.account_id||accountId||''),
    body:String(item.body||''),
    reply_to_message_id:item.reply_to_message_id?String(item.reply_to_message_id):null,
    reply_preview:item.reply_preview?String(item.reply_preview):null,
    _reply_sender:item._reply_sender||null,
    created_at:String(item.created_at||new Date().toISOString()),
    updated_at:String(item.created_at||new Date().toISOString()),
    deleted_at:null,
    version:0,
    _media_assets:mediaAssets,
    _local_state:item.failed?'failed':'pending'
  };
}

async function hydrateCurrentFromCache(){
  return hydrateContactFromCache(currentContactId,{renderMode:'replace',epoch:contactEpoch});
}

async function hydrateContactFromCache(contactId,{renderMode='replace',epoch=contactEpoch,mediaIndex=null}={}){
  const target=String(contactId||'');
  if(!accountId||!target)return{conversationId:null,rows:[]};
  const conversationId=await cache()?.getConversationId?.(accountId,target);
  const resolvedConversationId=conversationId?String(conversationId):null;
  const cached=resolvedConversationId?await cache()?.listMessages?.(accountId,resolvedConversationId,100):[];
  const needsLegacyMediaIndex=(cached||[]).some(row=>
    !Array.isArray(row?._media_assets)&&String(row?.body||'').trim()===''
  );
  const mediaByMessage=mediaIndex instanceof Map
    ?mediaIndex
    :(needsLegacyMediaIndex?await media()?.indexByMessage?.({accountId})||new Map():new Map());
  const enriched=enrichRowsFromMediaIndex(cached,mediaByMessage).map(row=>{
    if(!row?._legacy_media_body_migrated)return row;
    const clean={...row};delete clean._legacy_media_body_migrated;
    void cache()?.putMessage?.(accountId,clean);
    return clean;
  });
  const pending=await cache()?.listOutboxForContact?.(accountId,target)||[];
  const localPending=pending.map(item=>outboxAsLocal(item,resolvedConversationId));
  const rows=[...enriched,...localPending];
  messages()?.primeSession?.({contactId:target,conversationId:resolvedConversationId,rows});

  const stillActive=epoch===contactEpoch&&String(currentContactId||'')===target;
  if(stillActive){
    currentConversationId=resolvedConversationId;
    messages()?.setContext?.({contactId:target,conversationId:resolvedConversationId});
    if(renderMode==='merge'&&rows.length){
      messages()?.merge?.(rows,{conversationId:resolvedConversationId,contactId:target});
    }else if(renderMode==='replace'){
      messages()?.replace?.(rows,{conversationId:resolvedConversationId,contactId:target});
    }
    document.dispatchEvent(new CustomEvent('v21-conversation-context',{detail:{accountId,currentContactId:target,currentConversationId:resolvedConversationId}}));
  }
  return{conversationId:resolvedConversationId,rows};
}

async function prewarmCachedContacts(contactRows,excludeContactId=null){
  if(!accountId)return 0;
  const candidates=(Array.isArray(contactRows)?contactRows:[])
    .filter(row=>row?.id&&String(row.id)!==String(excludeContactId||''));
  if(!candidates.length)return 0;
  const outbox=await cache()?.listOutbox?.(accountId)||[];
  const outboxByContact=new Map();
  for(const item of outbox){
    const key=String(item?.contact_id||'');
    if(!key)continue;
    const list=outboxByContact.get(key)||[];list.push(item);outboxByContact.set(key,list);
  }
  let primed=0;
  await Promise.all(candidates.map(async contact=>{
    const target=String(contact.id);
    const conversationId=contact.conversation_id?String(contact.conversation_id):await cache()?.getConversationId?.(accountId,target);
    const resolved=conversationId?String(conversationId):null;
    const cached=resolved?await cache()?.listMessages?.(accountId,resolved,100):[];
    const rows=[
      ...cached.map(row=>{
        const migrated=migrateLegacyCachedMediaBody(row);
        const clean={...migrated};delete clean._legacy_media_body_migrated;return clean;
      }),
      ...(outboxByContact.get(target)||[]).map(item=>outboxAsLocal(item,resolved))
    ];
    if(messages()?.primeSession?.({contactId:target,conversationId:resolved,rows,ifAbsent:true}))primed+=1;
  }));
  return primed;
}

function isTransientSyncError(error){
  const status=Number(error?.statusCode||error?.status||error?.status_code||0)||0;
  const message=String(error?.message||error?.details||error||'').toLowerCase();
  if(status===408||status===425||status===429||status>=500)return true;
  if(status>=400&&status<500)return false;
  return /failed to fetch|network|load failed|timeout|timed out|connection|offline|abort/i.test(message);
}

async function openContact(contactId){
  const target=contactId?String(contactId):null;
  const previousContactId=currentContactId?String(currentContactId):null;
  const epoch=++contactEpoch;
  let switchMounted=false;
  const publishSwitch=phase=>{
    document.dispatchEvent(new CustomEvent('v21-conversation-switch',{
      detail:{
        phase:String(phase||''),
        epoch,
        contactId:target,
        previousContactId,
        conversationId:currentConversationId
      }
    }));
  };
  publishSwitch('start');

  try{
    dirtyActiveMessageIds.clear();
    messages()?.stashCurrentView?.();
    currentContactId=target;
    currentConversationId=null;

    if(!target||!accountId){
      messages()?.setContext?.({contactId:null,conversationId:null});
      messages()?.replace?.([],{conversationId:null,contactId:null});
      publishSwitch('mounted');
      switchMounted=true;
      return false;
    }

    const restored=messages()?.restoreSession?.(target)||null;
    if(restored){
      currentConversationId=restored.conversationId?String(restored.conversationId):null;
      document.dispatchEvent(new CustomEvent('v21-conversation-context',{detail:{accountId,currentContactId:target,currentConversationId}}));
    }else{
      messages()?.setContext?.({contactId:target,conversationId:null});
      messages()?.replace?.([],{conversationId:null,contactId:target});
    }

    const hydrated=await hydrateContactFromCache(target,{renderMode:restored?'merge':'replace',epoch});
    if(epoch!==contactEpoch||String(currentContactId||'')!==target)return false;

    // The contact's local/session view is now mounted. Release the scroll gate
    // before any optional network work; the viewport owner settles it over two
    // animation frames so stale arrow state from the previous contact cannot flash.
    publishSwitch('mounted');
    switchMounted=true;

    let conversationId=hydrated.conversationId||currentConversationId||null;
  if(!conversationId&&online())conversationId=await ensureConversation(target);
  if(epoch!==contactEpoch||String(currentContactId||'')!==target)return false;

  if(conversationId){
    currentConversationId=String(conversationId);
    messages()?.setContext?.({contactId:target,conversationId:currentConversationId});
    await cache()?.setConversationId?.(accountId,target,currentConversationId);
    document.dispatchEvent(new CustomEvent('v21-conversation-context',{detail:{accountId,currentContactId:target,currentConversationId}}));

    // First canonical hydration belongs to Conversation Root/openContact, not
    // to generic realtime/manual sync. Cache/UI is already visible; snapshot
    // only merges canonical data for this context and is generation-guarded.
    if(online()&&!await isConversationHydrated(currentConversationId)){
      try{
        await canonicalReconcileActive();
      }catch(error){
        if(!isTransientSyncError(error))throw error;
        console.warn('[V21SyncEngine] transient openContact refresh failure',{
          contactId:target,conversationId:currentConversationId,error
        });
        void wake({reason:'open-contact-network-recovery'});
      }
      if(epoch!==contactEpoch||String(currentContactId||'')!==target)return false;
    }
  }

    if(chatVisible())scheduleMarkRead(currentConversationId);
    if(online())void wake({reason:'open-contact'});
    return true;
  }finally{
    if(!switchMounted)publishSwitch('abort');
  }
}

async function queueText({clientId,text,contactId,conversationId,reply=null}={}){
  const context=captureSyncOwnerContext();
  if(!context.accountId||!context.appSessionId)throw new Error('authentication_required');
  const target=String(contactId||currentContactId||'');
  const scopedConversation=conversationId?String(conversationId):null;
  const body=String(text||'').trim();
  if(!target)throw new Error('contact_required');
  if(!body)throw new Error('invalid_message');
  const id=String(clientId||window.V21RuntimeId.create());
  const cachedConversation=await cache()?.getConversationId?.(context.accountId,target)||null;
  if(!syncOwnerContextCurrent(context))throw syncContextChangedError();
  const resolvedConversation=cachedConversation?String(cachedConversation):scopedConversation;
  const item={
    client_id:id,
    contact_id:target,
    conversation_id:resolvedConversation||null,
    body,
    reply_to_message_id:reply?.id?String(reply.id):null,
    reply_preview:reply?.text?String(reply.text).slice(0,160):null,
    _reply_sender:reply?.sender==='self'?'self':(reply?.sender==='remote'?'remote':null),
    created_at:new Date().toISOString(),
    attempts:0
  };
  await cache()?.putOutbox?.(context.accountId,item);
  if(!syncOwnerContextCurrent(context)){
    await cache()?.removeOutbox?.(context.accountId,id);
    throw syncContextChangedError();
  }
  if(resolvedConversation)await cache()?.putMessage?.(context.accountId,outboxAsLocal(item,resolvedConversation));
  if(!syncOwnerContextCurrent(context)){
    await cache()?.removeOutbox?.(context.accountId,id);
    if(resolvedConversation)await cache()?.removeMessage?.(context.accountId,id);
    throw syncContextChangedError();
  }
  if(online())void wake({reason:'outbox'});
  return outboxAsLocal(item,resolvedConversation);
}

async function queueMediaFiles({clientId,text='',assets,contactId,conversationId,reply=null,deferWake=false}={}){
  if(!accountId||!appSessionId)throw new Error('authentication_required');
  const context=captureSyncOwnerContext();
  const ownerAccountId=String(context.accountId||'');
  const target=String(contactId||currentContactId||'');
  if(!target)throw new Error('contact_required');
  const list=Array.isArray(assets)?assets.filter(Boolean):[];
  if(!list.length)throw new Error('media_asset_required');
  if(list.length>12)throw new Error('media_assets_count_out_of_range');
  if(list.some(asset=>String(asset?.kind||'').toLowerCase()!=='image')&&list.length>1){
    throw new Error('mixed_media_not_supported');
  }
  const contextCurrent=()=>syncOwnerContextCurrent(context);

  const cachedConversation=conversationId||await cache()?.getConversationId?.(ownerAccountId,target)||null;
  if(!contextCurrent())throw syncContextChangedError();
  const resolved=String(cachedConversation||await ensureConversation(target,{context})||'');
  if(!contextCurrent())throw syncContextChangedError();
  if(!resolved)throw new Error('conversation_required');

  const normalized=[];
  for(const [index,asset] of list.entries()){
    const kind=String(asset?.kind||'').toLowerCase();
    if(kind!=='image'&&kind!=='audio'&&kind!=='file')throw new Error('invalid_media_kind');
    if(!asset?.assetId)throw new Error('media_asset_required');
    if(asset.accountId&&String(asset.accountId)!==ownerAccountId)throw new Error('media_account_mismatch');
    if(asset.conversationId&&String(asset.conversationId)!==resolved)throw new Error('media_scope_mismatch');
    const record=await media()?.get?.({accountId:ownerAccountId,assetId:asset.assetId});
    if(!contextCurrent())throw syncContextChangedError();
    if(!(record?.blob instanceof Blob))throw new Error(`${kind}_blob_missing`);
    const mimeType=baseMimeType(asset.mimeType||record.blob.type||(kind==='audio'?'audio/webm':kind==='image'?'image/jpeg':'application/octet-stream'));
    if(kind==='image'&&!mimeType.startsWith('image/'))throw new Error('image_type_required');
    if(kind==='audio'&&!mimeType.startsWith('audio/'))throw new Error('audio_type_required');
    if(kind==='file'&&(mimeType.startsWith('image/')||mimeType.startsWith('audio/')))throw new Error('file_type_required');
    const sizeBytes=Number(asset.sizeBytes)||Number(record.blob.size)||0;
    if(sizeBytes<1||sizeBytes>15728640)throw new Error('media_size_out_of_range');
    const next={
      kind,asset_id:String(asset.assetId),
      storage_key:`${ownerAccountId}/${resolved}/${String(asset.assetId)}`,
      mime_type:mimeType,size_bytes:sizeBytes,
      file_name:kind==='file'?String(asset.fileName||'').trim().slice(0,255)||null:null,
      sort_index:Number(asset.sortIndex??index)||0,uploaded:false
    };
    if(kind==='file'&&!next.file_name)throw new Error('file_name_required');
    if(kind==='image'){
      next.width_px=Number(asset.widthPx)||null;
      next.height_px=Number(asset.heightPx)||null;
      next.content_hash=asset.contentHash||null;
      next.duration_ms=null;
    }else if(kind==='audio'){
      next.width_px=null;next.height_px=null;next.content_hash=null;
      {
      const rawDuration=Number(asset.durationMs);
      next.duration_ms=Number.isFinite(rawDuration)&&rawDuration>0?Math.round(rawDuration):null;
    }
    }else{
      next.width_px=null;next.height_px=null;next.content_hash=null;next.duration_ms=null;
    }
    normalized.push(next);
  }

  const id=String(clientId||window.V21RuntimeId.create());
  const createdAt=new Date().toISOString();
  const item={
    kind:'media',account_id:ownerAccountId,client_id:id,contact_id:target,conversation_id:resolved,
    body:String(text||'').trim(),
    reply_to_message_id:reply?.id?String(reply.id):null,
    reply_preview:reply?.text?String(reply.text).slice(0,160):null,
    _reply_sender:reply?.sender==='self'?'self':(reply?.sender==='remote'?'remote':null),
    created_at:createdAt,attempts:0,failed:false,assets:normalized
  };
  await cache()?.putOutbox?.(ownerAccountId,item);
  if(!contextCurrent()){
    await cache()?.removeOutbox?.(ownerAccountId,id);
    throw syncContextChangedError();
  }

  const local=outboxAsLocal(item,resolved);
  try{
    await cache()?.putMessage?.(ownerAccountId,local);
  }catch(error){
    await cache()?.removeOutbox?.(ownerAccountId,id);
    throw error;
  }
  if(!contextCurrent()){
    await cache()?.removeOutbox?.(ownerAccountId,id);
    await cache()?.removeMessage?.(ownerAccountId,id);
    throw syncContextChangedError();
  }
  if(online()&&!deferWake)void wake({reason:'media-outbox'});
  return local;
}

function isStorageAlreadyExistsError(error){
  const status=Number(error?.statusCode||error?.status||error?.status_code||0)||0;
  const message=String(error?.message||error?.error||'').toLowerCase();
  return status===409||message.includes('already exists')||message.includes('duplicate');
}

function imageUploadBody(record,asset){
  const blob=record?.blob;
  if(!(blob instanceof Blob))throw new Error('image_blob_missing');
  const type=String(asset?.mime_type||blob.type||'image/jpeg').toLowerCase();
  if(Number(blob.size)<=0)throw new Error('image_blob_empty');
  if(typeof File!=='function')return blob;
  if(blob instanceof File&&String(blob.type||'').toLowerCase()===type)return blob;
  const ext=type==='image/png'?'png':type==='image/webp'?'webp':type==='image/gif'?'gif':'jpg';
  return new File([blob],`${String(asset?.asset_id||'image')}.${ext}`,{type,lastModified:Date.now()});
}

function fileUploadBody(record,asset){
  const blob=record?.blob;
  if(!(blob instanceof Blob))throw new Error('file_blob_missing');
  if(Number(blob.size)<=0)throw new Error('file_blob_empty');
  const type=baseMimeType(asset?.mime_type||blob.type||'application/octet-stream');
  const name=String(asset?.file_name||'file').trim().slice(0,255)||'file';
  if(typeof File==='function'){
    if(
      blob instanceof File &&
      baseMimeType(blob.type)===type &&
      String(blob.name||'')===name
    )return blob;
    return new File([blob],name,{type,lastModified:Number(blob.lastModified)||Date.now()});
  }
  return typeof blob.slice==='function'?blob.slice(0,blob.size,type):blob;
}

function errorStatus(error){
  return Number(error?.statusCode||error?.status||error?.status_code||0)||0;
}

function isRetryableOutboxError(error){
  const status=errorStatus(error);
  const code=String(error?.code||'').trim();
  const message=String(error?.message||error||'').toLowerCase();
  if(status===408||status===425||status===429||status>=500)return true;
  if(status>=400&&status<500)return false;
  if(/^pgrst202$/i.test(code))return true;
  if(/^[0-9a-z]{5}$/i.test(code))return false;
  if(status===0){
    return /failed to fetch|network|load failed|timeout|timed out|connection|offline|abort/i.test(message);
  }
  return false;
}

function captureSyncOwnerContext(){
  return{
    accountId:String(accountId||''),
    appSessionId:String(appSessionId||''),
    client
  };
}

function syncOwnerContextCurrent(context){
  return Boolean(
    context&&
    String(context.accountId||'')===String(accountId||'')&&
    String(context.appSessionId||'')===String(appSessionId||'')&&
    context.client===client
  );
}

function syncContextChangedError(){
  const error=new Error('sync_context_changed');
  error.code='sync_context_changed';
  return error;
}

function captureFlushContext(){return captureSyncOwnerContext();}

function flushContextCurrent(context){
  return Boolean(context?.client&&syncOwnerContextCurrent(context));
}

function flushContextChangedError(){
  const error=new Error('sync_context_changed');
  error.code='sync_context_changed';
  return error;
}

async function flushMediaItem(item,conversationId,context=captureFlushContext()){
  const ownerAccountId=String(context?.accountId||'');
  const ownerAppSessionId=String(context?.appSessionId||'');
  const requestClient=context?.client||null;
  if(!ownerAccountId||!ownerAppSessionId||!requestClient)throw new Error('authentication_required');

  const assets=mediaAssetsFromOutbox(item);
  if(!assets.length)throw new Error('media_asset_required');
  if(item.kind!=='media'){
    item.kind='media';
    item.account_id=ownerAccountId;
    item.assets=assets;
    delete item.asset;
    await cache()?.updateOutbox?.(ownerAccountId,item);
  }

  for(const [index,asset] of assets.entries()){
    const kind=String(asset?.kind||'').toLowerCase();
    if(kind!=='image'&&kind!=='audio'&&kind!=='file')throw new Error('invalid_media_kind');
    if(!asset?.asset_id)throw new Error('media_asset_required');
    if(!asset.storage_key){
      asset.storage_key=`${ownerAccountId}/${conversationId}/${String(asset.asset_id)}`;
      await cache()?.updateOutbox?.(ownerAccountId,item);
    }
    const record=await media()?.get?.({accountId:ownerAccountId,assetId:asset.asset_id});
    if(!(record?.blob instanceof Blob))throw new Error(`${kind}_blob_missing`);

    let uploadBody=record.blob;
    if(kind==='image')uploadBody=imageUploadBody(record,asset);
    else if(kind==='file')uploadBody=fileUploadBody(record,asset);
    asset.mime_type=baseMimeType(uploadBody.type||asset.mime_type||record.blob.type||(kind==='audio'?'audio/webm':kind==='image'?'image/jpeg':'application/octet-stream'));
    asset.size_bytes=Number(uploadBody.size)||0;
    asset.sort_index=Number(asset.sort_index??index)||0;
    if(!asset.size_bytes)throw new Error(`${kind}_blob_empty`);
    if(asset.size_bytes>15728640)throw new Error('media_size_out_of_range');
    if(kind==='image'){
      if(!asset.mime_type.startsWith('image/'))throw new Error('image_type_required');
      asset.duration_ms=null;asset.file_name=null;
    }else if(kind==='audio'){
      if(!asset.mime_type.startsWith('audio/'))throw new Error('audio_type_required');
      {
      const rawDuration=Number(asset.duration_ms);
      asset.duration_ms=Number.isFinite(rawDuration)&&rawDuration>0?Math.round(rawDuration):null;
    }
      asset.file_name=null;asset.content_hash=null;asset.width_px=null;asset.height_px=null;
    }else{
      if(asset.mime_type.startsWith('image/')||asset.mime_type.startsWith('audio/'))throw new Error('file_type_required');
      asset.file_name=String(asset.file_name||'').trim().slice(0,255);
      if(!asset.file_name)throw new Error('file_name_required');
      asset.duration_ms=null;asset.content_hash=null;asset.width_px=null;asset.height_px=null;
    }

    if(!asset.uploaded){
      const {error:uploadError}=await requestClient.storage.from('v21-media').upload(
        asset.storage_key,uploadBody,
        {cacheControl:'3600',upsert:false,contentType:asset.mime_type||uploadBody.type||undefined}
      );
      if(uploadError&&!isStorageAlreadyExistsError(uploadError))throw uploadError;
      asset.uploaded=true;item.failed=false;
      await cache()?.updateOutbox?.(ownerAccountId,item);
    }
    if(!flushContextCurrent(context))throw flushContextChangedError();
  }

  const rpcAssets=assets.map((asset,index)=>({
    id:String(asset.asset_id),kind:String(asset.kind),storage_key:String(asset.storage_key),
    file_name:asset.kind==='file'?(String(asset.file_name||'').slice(0,255)||null):null,
    mime_type:String(asset.mime_type),size_bytes:Number(asset.size_bytes)||0,
    content_hash:asset.kind==='image'?(asset.content_hash||null):null,
    width_px:asset.kind==='image'?(Number(asset.width_px)||null):null,
    height_px:asset.kind==='image'?(Number(asset.height_px)||null):null,
    duration_ms:asset.kind==='audio'&&(Number(asset.duration_ms)>0)?Math.round(Number(asset.duration_ms)):null,
    sort_index:Number(asset.sort_index??index)||0
  }));

  let data,error;
  if(item.reply_to_message_id){
    ({data,error}=await requestClient.rpc('v21_media_reply_send',{
      p_app_session_id:ownerAppSessionId,
      p_conversation_id:conversationId,
      p_client_id:String(item.client_id),
      p_body:String(item.body||''),
      p_assets:rpcAssets,
      p_reply_to_message_id:String(item.reply_to_message_id)
    }));
  }else{
    ({data,error}=await requestClient.rpc('v21_media_images_send',{
      p_app_session_id:ownerAppSessionId,
      p_conversation_id:conversationId,
      p_client_id:String(item.client_id),
      p_body:String(item.body||''),
      p_assets:rpcAssets
    }));
  }
  if(error)throw error;

  const payload=Array.isArray(data)?data[0]:data;
  const messageRow=payload?.message||payload?.message_row||(payload?.conversation_id?payload:null);
  const mediaRows=(Array.isArray(payload?.media)?payload.media:rpcAssets.map(asset=>({
    ...asset,conversation_id:conversationId,message_id:messageRow?.id||item.client_id,
    owner_account_id:ownerAccountId,created_at:item.created_at
  }))).map(canonicalMedia).filter(Boolean).sort((a,b)=>Number(a.sort_index)-Number(b.sort_index));

  for(const mediaRow of mediaRows){
    await media()?.putRemoteMeta?.({accountId:ownerAccountId,assetId:mediaRow.id,meta:mediaRow});
  }

  let summaryRow={body:String(item.body||''),created_at:item.created_at,_media_assets:mediaRows};
  if(messageRow){
    let canonical=canonicalMessage(messageRow);
    if(canonical&&mediaRows.length)canonical={...canonical,_media_assets:mediaRows};
    if(canonical){
      summaryRow=canonical;
      if(String(canonical.id)!==String(item.client_id))await cache()?.removeMessage?.(ownerAccountId,item.client_id);
      const canonicalClientId=String(canonical.client_id||'');
      if(
        payload?.idempotent_reuse===true &&
        canonicalClientId &&
        canonicalClientId!==String(item.client_id) &&
        flushContextCurrent(context) &&
        String(conversationId)===String(currentConversationId)
      ){
        messages()?.remove?.(String(item.client_id));
      }
      await cache()?.putMessage?.(ownerAccountId,canonical);
      if(flushContextCurrent(context)&&String(conversationId)===String(currentConversationId)){
        messages()?.apply?.(canonical,{remote:false});
      }
    }
  }
  if(flushContextCurrent(context)){
    const summary=messagePreviewContract(summaryRow);
    await patchContactSummary(conversationId,{...summary,latest_at:summaryRow?.created_at||item.created_at});
  }
  return true;
}

async function flushOutbox(){
  if(!client||!accountId||!appSessionId||!online())return 0;
  const context=captureFlushContext();
  const ownerAccountId=context.accountId;
  const rows=await cache()?.listOutbox?.(ownerAccountId)||[];
  if(!flushContextCurrent(context))return 0;
  let sent=0;
  for(const item of rows){
    if(!flushContextCurrent(context))break;
    const legacyMediaKind=item.kind==='images'||item.kind==='image'||item.kind==='audio';
    if(legacyMediaKind&&item.failed&&item.retryable===false){
      // One compatibility retry through the unified media transport. Old
      // candidates may have terminal errors from image/audio-specific RPCs;
      // after conversion, any real validation error becomes terminal again.
      item.failed=false;item.retryable=true;item.next_retry_at=0;
      await cache()?.updateOutbox?.(ownerAccountId,item);
    }
    if(item.failed&&item.retryable===false)continue;
    if(Number(item.next_retry_at)>Date.now())continue;
    let conversationId=item.conversation_id?String(item.conversation_id):null;
    if(!conversationId){
      // Image transactions resolve and persist conversation_id before entering
      // Outbox. Never open a conversation here for media using a mutable global
      // account context.
      if(item.kind==='media'||item.kind==='images'||item.kind==='image'||item.kind==='audio'){
        item.failed=true;
        item.retryable=false;
        item.last_error='conversation_required';
        await cache()?.updateOutbox?.(ownerAccountId,item);
        continue;
      }
      conversationId=await ensureConversation(item.contact_id);
      if(!flushContextCurrent(context))break;
      if(!conversationId)break;
      item.conversation_id=conversationId;
      await cache()?.updateOutbox?.(ownerAccountId,item);
    }
    try{
      if(item.kind==='media'||item.kind==='images'||item.kind==='image'||item.kind==='audio'){
        await flushMediaItem(item,conversationId,context);
      }else{
        let data,error;
        if(item.reply_to_message_id){
          ({data,error}=await context.client.rpc('v21_message_reply_send',{
            p_app_session_id:context.appSessionId,
            p_conversation_id:conversationId,
            p_client_id:String(item.client_id),
            p_body:String(item.body),
            p_reply_to_message_id:String(item.reply_to_message_id)
          }));
        }else{
          ({data,error}=await context.client.rpc('v21_message_send',{
            p_app_session_id:context.appSessionId,
            p_conversation_id:conversationId,
            p_client_id:String(item.client_id),
            p_body:String(item.body)
          }));
        }
        if(error)throw error;
        const row=Array.isArray(data)?data[0]:data;
        if(row){
          if(String(row.id)!==String(item.client_id))await cache()?.removeMessage?.(ownerAccountId,item.client_id);
          const canonical=await enrichMessageWithMedia(canonicalMessage(row));
          await cache()?.putMessage?.(ownerAccountId,canonical);
          if(flushContextCurrent(context)&&String(conversationId)===String(currentConversationId)){
            messages()?.apply?.(canonical,{remote:false});
          }
        }
      }
      await cache()?.removeOutbox?.(ownerAccountId,item.client_id);
      if(item.kind==='media'||item.kind==='images'||item.kind==='image'||item.kind==='audio'){
        const sentAssetIds=Array.from(new Set(
          [
            ...(Array.isArray(item.assets)?item.assets.map(asset=>asset?.asset_id):[]),
            item.asset_id
          ].map(value=>String(value||'')).filter(Boolean)
        ));
        document.dispatchEvent(new CustomEvent('v21-media-outbox-sent',{
          detail:{
            clientId:String(item.client_id||''),
            accountId:String(ownerAccountId||''),
            contactId:String(item.contact_id||''),
            conversationId:String(conversationId||''),
            assetIds:sentAssetIds
          }
        }));
      }
      sent+=1;
      if(!flushContextCurrent(context))break;
    }catch(error){
      if(String(error?.code||error?.message||'')==='sync_context_changed')return sent;
      item.attempts=(Number(item.attempts)||0)+1;
      item.failed=true;
      item.retryable=isRetryableOutboxError(error);
      item.last_error_status=errorStatus(error)||null;
      item.last_error_code=String(error?.code||'').slice(0,40)||null;
      item.last_error=String(error?.message||error||'send_failed').slice(0,240);
      item.next_retry_at=item.retryable
        ?Date.now()+Math.min(30000,1000*(2**Math.min(item.attempts,5)))
        :0;
      await cache()?.updateOutbox?.(ownerAccountId,item);
      if(item.kind==='media'||item.kind==='images'||item.kind==='image'||item.kind==='audio'){
        const failedAssets=mediaAssetsFromOutbox(item);
        document.dispatchEvent(new CustomEvent('v21-media-outbox-error',{
          detail:{
            clientId:String(item.client_id||''),
            contactId:String(item.contact_id||''),
            conversationId:String(conversationId||''),
            assetIds:failedAssets.map(asset=>String(asset?.asset_id||'')).filter(Boolean),
            assetKinds:failedAssets.map(asset=>String(asset?.kind||'file')),
            code:String(item.last_error_code||''),
            status:item.last_error_status||null,
            message:String(item.last_error||'media_send_failed')
          }
        }));
      }
      if(flushContextCurrent(context)&&String(conversationId)===String(currentConversationId)){
        messages()?.apply?.(outboxAsLocal(item,conversationId),{remote:false});
      }
      continue;
    }
  }
  return sent;
}

async function refreshUnread(){
  if(!client||!appSessionId||!online()){return shell()?.UnreadIndicator?.snapshot?.()||0;}
  const {data,error}=await client.rpc('v21_unread_count',{p_app_session_id:appSessionId});
  if(error)return shell()?.UnreadIndicator?.snapshot?.()||0;
  const count=Math.max(0,Number(data)||0);
  shell()?.UnreadIndicator?.set?.(count);
  return count;
}

async function markRead(conversationId=currentConversationId){
  const target=String(conversationId||'');
  if(!client||!appSessionId||!target||!online())return false;
  const {error}=await client.rpc('v21_mark_read',{p_app_session_id:appSessionId,p_conversation_id:target});
  if(!error){
    await patchContactSummary(target,{has_unread:false});
    await refreshUnread();
  }
  return !error;
}

function scheduleMarkRead(conversationId=currentConversationId){
  const target=String(conversationId||'');
  if(!target)return false;
  readMarkConversationId=target;
  if(readMarkTimer)return true;
  readMarkTimer=setTimeout(()=>{
    readMarkTimer=0;
    const pending=readMarkConversationId;
    readMarkConversationId=null;
    if(!pending||String(currentConversationId||'')!==pending||!chatVisible())return;
    void markRead(pending);
  },120);
  return true;
}

function chatVisible(){
  const ui=shell()?.snapshot?.()||{};
  return ui.route==='chat'&&!ui.sidebarOpen&&Boolean(currentConversationId);
}

async function doSync(reason){
  if(!accountId||!appSessionId||!client||!online())return false;
  lastReason=String(reason||'sync');

  // Generic wake/realtime is delta-only. Conversation snapshot hydration is
  // owned by openContact so network refresh can never replace UI context.
  const accountInitialized=Boolean(await cache()?.isInitialized?.(accountId));
  if(!accountInitialized)await initializeFromServer();
  else await pullAll();

  await flushOutbox();
  await pullAll();
  // Read state is a UI lifecycle action, not a generic sync side effect.
  // Calling markRead() from every realtime wake creates a feedback loop:
  // markRead -> read_state event -> realtime wake -> markRead.
  if(!chatVisible())await refreshUnread();
  return true;
}

function shortSyncFenceDelay(attempt){
  return new Promise(resolve=>setTimeout(resolve,[20,40,80,160][Math.min(attempt,3)]));
}

async function wake({reason='signal',hintSeq=0}={}){
  wakeHint=Math.max(wakeHint,Number(hintSeq)||0);
  wakePending=true;
  if(syncing)return false;
  syncing=true;
  let fenceAttempt=0;
  let succeeded=true;
  try{
    while(wakePending){
      wakePending=false;
      const ownerAccountId=String(accountId||'');
      await doSync(reason);
      if(!ownerAccountId||ownerAccountId!==String(accountId||'')){
        wakeHint=0;
        fenceAttempt=0;
        continue;
      }

      // Realtime only wakes SyncEngine, but the seq hint is a durable contract.
      // Read the hint again AFTER the async cursor read: a newer realtime event
      // may have arrived while IndexedDB was resolving, and clearing the older
      // hint here would otherwise erase the newer fence.
      if((Number(wakeHint)||0)>0){
        const cursor=Math.max(0,Number(await cache()?.getCursor?.(ownerAccountId))||0);
        const latestHint=Number(wakeHint)||0;
        if(latestHint>0&&cursor>=latestHint){
          wakeHint=0;
          fenceAttempt=0;
        }else if(latestHint>0&&online()&&fenceAttempt<4){
          await shortSyncFenceDelay(fenceAttempt++);
          wakePending=true;
        }
      }
    }
  }catch(error){
    succeeded=false;
  }finally{
    syncing=false;
    // Pending-wake handoff: if a newer signal was already coalesced when this
    // runner exits (including an error path), release the runner first and then
    // schedule one fresh pass. Realtime remains only a wake transport.
    if(wakePending&&accountId&&appSessionId&&client&&online()){
      queueMicrotask(()=>{
        if(wakePending&&!syncing)void wake({reason:'coalesced-handoff',hintSeq:wakeHint});
      });
    }
  }
  return succeeded;
}

async function ensureMediaRemote(request){
  const id=String(typeof request==='object'?request?.assetId:request||'');
  const requestedAccountId=String(
    (typeof request==='object'?request?.accountId:null)||accountId||''
  );
  const requestClient=client;
  if(!requestedAccountId||!id)return null;
  if(requestedAccountId!==String(accountId||''))return null;

  const existing=await media()?.get?.({accountId:requestedAccountId,assetId:id});
  if(existing?.blob instanceof Blob)return existing;
  if(
    requestedAccountId!==String(accountId||'')||
    requestClient!==client||
    !requestClient||
    !online()
  )return existing||null;

  const row=await media()?.ensureRemote?.({accountId:requestedAccountId,assetId:id,client:requestClient})||existing||null;
  if(requestedAccountId!==String(accountId||'')){
    // A logout/account replacement may clear this account while the Storage
    // request is in flight. Do not let the late completion repopulate old media.
    await media()?.remove?.({accountId:requestedAccountId,assetId:id});
    return null;
  }
  return row;
}

async function syncContacts(){
  if(!accountId)return[];
  if(!online()||!client||!appSessionId){
    const cached=await cache()?.listContacts?.(accountId)||[];
    contacts()?.replace?.(cached);
    return cached;
  }
  const {data,error}=await client.rpc('v21_contacts_sidebar',{p_app_session_id:appSessionId});
  if(error){await wake({reason:'contacts'});return contacts()?.snapshot?.()||[];}
  const rows=(Array.isArray(data)?data:[]).map(canonicalContact).filter(Boolean);
  await cache()?.replaceContacts?.(accountId,rows);
  for(const row of rows){if(row.conversation_id)await cache()?.setConversationId?.(accountId,row.id,row.conversation_id);}
  contacts()?.replace?.(rows);
  return rows;
}

async function hydrateAccount(){
  if(!accountId)return[];
  await cache()?.open?.();
  const cachedContacts=await cache()?.listContacts?.(accountId)||[];
  if(cachedContacts.length)contacts()?.replace?.(cachedContacts);
  return cachedContacts;
}

async function onAuth(detail){
  const state=detail?.state||authSnapshot().state;
  if(state!=='AUTHENTICATED'){
    client=authStore()?.getClient?.()||client;
    contactEpoch+=1;
    if(readMarkTimer){clearTimeout(readMarkTimer);readMarkTimer=0;}
    readMarkConversationId=null;
    accountId=null;appSessionId=null;currentContactId=null;currentConversationId=null;
    wakeHint=0;wakePending=false;
    messages()?.reset?.();
    return;
  }
  const snap=authSnapshot();
  client=authStore()?.getClient?.()||client;
  accountId=String(snap.account?.id||'');
  appSessionId=String(snap.appSessionId||'');
  if(!accountId||!appSessionId)return;
  const cachedContacts=await hydrateAccount();
  const active=shell()?.snapshot?.().activeContact;
  if(active?.id){
    if(String(currentContactId||'')!==String(active.id))await openContact(active.id);
  }else{
    void wake({reason:'auth'});
  }
  void prewarmCachedContacts(cachedContacts,active?.id||currentContactId||null);
}

async function clearAccount(id){
  if(!id)return false;
  if(String(id)===String(accountId)){
    messages()?.reset?.();
    contacts()?.clear?.();
  }
  return cache()?.clearAccount?.(id)||false;
}

document.addEventListener('v21-auth-state',event=>{void onAuth(event.detail);});
document.addEventListener('v21-active-contact-change',event=>{
  const id=event.detail?.contact?.id||null;
  void openContact(id);
});
document.addEventListener('navigation-change',event=>{
  if(event.detail?.route==='chat'&&currentConversationId){
    scheduleMarkRead(currentConversationId);
    void wake({reason:'navigation'});
  }
});

window.V21SyncEngine={
  version:VERSION,wake,openContact,queueText,queueMediaFiles,flushOutbox,refreshUnread,markRead,syncContacts,clearAccount,ensureMediaRemote,
  recoverActiveFromSnapshot:canonicalReconcileActive,
  snapshot(){return{accountId,appSessionId,currentContactId,currentConversationId,syncing,wakePending,wakeHint,lastReason,online:online()};}
};

window.V21PushSyncBridge={
  version:VERSION,
  consume(payload={}){
    const hint=Number(payload?.seq??payload?.cursor_hint??0)||0;
    return wake({reason:'push',hintSeq:hint});
  }
};

queueMicrotask(()=>{void onAuth(authSnapshot());});
})();
