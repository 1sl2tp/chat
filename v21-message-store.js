(()=>{
'use strict';
const VERSION='V21.71';
let currentContactId=null;
let currentConversationId=null;
const sessions=new Map();

function shell(){return window.ChatAppShell||null;}
function bridge(){return window.V21ConversationBridge||null;}
function sync(){return window.V21SyncEngine||null;}
function auth(){return window.V21AuthSessionStore?.snapshot?.()||{state:'GUEST'};}
function selfAccountId(){return auth().account?.id||null;}
function authenticated(){const s=auth();return s.state==='AUTHENTICATED'&&Boolean(s.appSessionId&&s.account?.id);}
function sessionKey(contactId){return String(contactId||'');}
function cloneRow(row){
  if(!row)return row;
  return{
    ...row,
    _media_assets:Array.isArray(row._media_assets)?row._media_assets.map(asset=>({...asset})):row._media_assets
  };
}
function logicalRowKey(row){
  return `${String(row?.sender_account_id||'')}::${String(row?.client_id||row?.id||'')}`;
}
function isCanonicalRow(row){
  const id=String(row?.id||'');
  const clientId=String(row?.client_id||'');
  return Boolean(
    id&&clientId&&id!==clientId&&!row?._local_state
  );
}
function mergeLogicalRow(existing,incoming){
  if(!existing)return cloneRow(incoming);
  if(!incoming)return cloneRow(existing);

  const existingCanonical=isCanonicalRow(existing);
  const incomingCanonical=isCanonicalRow(incoming);
  let preferred=incoming;
  let fallback=existing;

  if(existingCanonical!==incomingCanonical){
    preferred=incomingCanonical?incoming:existing;
    fallback=incomingCanonical?existing:incoming;
  }else{
    const existingVersion=Number(existing?.version)||0;
    const incomingVersion=Number(incoming?.version)||0;
    if(existingVersion>incomingVersion){
      preferred=existing;fallback=incoming;
    }else if(existingVersion===incomingVersion){
      const existingUpdated=String(existing?.updated_at||existing?.created_at||'');
      const incomingUpdated=String(incoming?.updated_at||incoming?.created_at||'');
      if(existingUpdated>incomingUpdated){
        preferred=existing;fallback=incoming;
      }
    }
  }

  const next={...cloneRow(fallback),...cloneRow(preferred)};
  if(isCanonicalRow(preferred))delete next._local_state;
  const preferredMedia=Array.isArray(preferred?._media_assets)?preferred._media_assets.filter(Boolean):[];
  const fallbackMedia=Array.isArray(fallback?._media_assets)?fallback._media_assets.filter(Boolean):[];
  if(!preferredMedia.length&&fallbackMedia.length){
    next._media_assets=fallbackMedia.map(asset=>({...asset}));
  }
  return next;
}
function sortRows(rows){
  return rows.sort((a,b)=>
    String(a?.created_at||'').localeCompare(String(b?.created_at||''))||
    String(a?.id||'').localeCompare(String(b?.id||''))
  );
}
function rowSignature(row){
  const media=(Array.isArray(row?._media_assets)?row._media_assets:[]).map(asset=>[
    String(asset?.id||''),Number(asset?.version)||0,String(asset?.deleted_at||''),Number(asset?.sort_index)||0
  ]);
  return JSON.stringify([
    logicalRowKey(row),String(row?.id||''),Number(row?.version)||0,String(row?.body||''),
    String(row?._local_state||''),media
  ]);
}
function rowsSignature(rows){return (Array.isArray(rows)?rows:[]).map(rowSignature).join('\n');}
function normalizeRows(rows){
  const byKey=new Map();
  for(const row of (Array.isArray(rows)?rows:[])){
    if(!row)continue;
    const key=logicalRowKey(row);
    byKey.set(key,mergeLogicalRow(byKey.get(key),row));
  }
  return sortRows(Array.from(byKey.values()));
}
function rememberSession(contactId,conversationId,rows,{viewState=null}={}){
  const key=sessionKey(contactId);
  if(!key)return null;
  const previous=sessions.get(key)||null;
  const normalized=normalizeRows(rows);
  const next={
    contactId:key,
    conversationId:conversationId?String(conversationId):null,
    rows:normalized,
    signature:rowsSignature(normalized),
    viewState:viewState??previous?.viewState??null,
    updatedAt:Date.now()
  };
  sessions.set(key,next);
  return next;
}
function mergeSessionRows(session,rows){
  const byKey=new Map((session?.rows||[]).map(row=>[logicalRowKey(row),cloneRow(row)]));
  for(const row of (Array.isArray(rows)?rows:[])){
    if(!row)continue;
    const key=logicalRowKey(row);
    byKey.set(key,mergeLogicalRow(byKey.get(key),row));
  }
  const merged=sortRows(Array.from(byKey.values()));
  session.rows=merged;
  session.signature=rowsSignature(merged);
  session.updatedAt=Date.now();
  return merged;
}

function mergeForContact(row,{contactId,conversationId}={}){
  if(!row?.id)return false;
  const target=sessionKey(contactId);
  if(!target)return false;
  const targetConversation=normalizeConversationId(conversationId||row.conversation_id);
  let session=sessions.get(target)||null;
  if(session?.conversationId&&targetConversation&&String(session.conversationId)!==String(targetConversation))return false;
  if(!session)session=rememberSession(target,targetConversation,[]);
  if(!session)return false;
  if(!session.conversationId&&targetConversation)session.conversationId=targetConversation;
  mergeSessionRows(session,[row]);
  return true;
}

function setContext({contactId,conversationId}={}){
  currentContactId=contactId?String(contactId):null;
  currentConversationId=conversationId?String(conversationId):null;
  return{currentContactId,currentConversationId};
}

function normalizeConversationId(value){
  const id=String(value||'').trim();
  return id||null;
}
function activeConversationMatches(targetConversation){
  const target=normalizeConversationId(targetConversation);
  if(!target)return true;
  return Boolean(currentConversationId)&&String(currentConversationId)===target;
}
function resolveRowsConversation(rows,explicitConversation=null){
  const explicit=normalizeConversationId(explicitConversation);
  let inferred=null;
  for(const row of (Array.isArray(rows)?rows:[])){
    const id=normalizeConversationId(row?.conversation_id);
    if(!id)continue;
    if(inferred&&inferred!==id)return{valid:false,conversationId:null};
    inferred=id;
  }
  if(explicit&&inferred&&explicit!==inferred)return{valid:false,conversationId:null};
  return{valid:true,conversationId:explicit||inferred||null};
}

function stashCurrentView(){
  if(!currentContactId)return false;
  const session=sessions.get(sessionKey(currentContactId));
  if(!session)return false;
  session.viewState=bridge()?.captureViewState?.()||session.viewState||null;
  return true;
}

function reset(){
  currentContactId=null;currentConversationId=null;
  sessions.clear();
  bridge()?.clear?.();
}

function hasSession(contactId){
  const key=sessionKey(contactId);
  return Boolean(key&&sessions.has(key));
}

function primeSession({contactId,conversationId,rows,ifAbsent=false}={}){
  const key=sessionKey(contactId);
  if(!key)return false;
  if(ifAbsent&&sessions.has(key))return false;
  rememberSession(key,conversationId,rows);
  return true;
}

function restoreSession(contactId){
  const key=sessionKey(contactId);
  const session=key?sessions.get(key):null;
  if(!session)return null;
  setContext({contactId:key,conversationId:session.conversationId});
  bridge()?.replace?.(session.rows,{selfId:selfAccountId(),viewState:session.viewState||null});
  return{
    contactId:key,
    conversationId:session.conversationId,
    size:session.rows.length,
    updatedAt:session.updatedAt
  };
}

function replace(rows,{conversationId=currentConversationId,contactId=currentContactId}={}){
  const targetContact=contactId?String(contactId):null;
  const boundary=resolveRowsConversation(rows,conversationId);
  if(!boundary.valid)return 0;
  const targetConversation=boundary.conversationId;
  const previous=targetContact?sessions.get(sessionKey(targetContact)):null;
  const normalized=normalizeRows(rows);
  const nextSignature=rowsSignature(normalized);
  const sameActive=
    String(currentContactId||'')===String(targetContact||'')&&
    String(currentConversationId||'')===String(targetConversation||'');
  const sameVisual=sameActive&&previous?.signature===nextSignature&&bridge()?.snapshot?.().size===normalized.length;
  const viewState=previous?.viewState||null;
  rememberSession(targetContact,targetConversation,normalized,{viewState});
  setContext({contactId:targetContact,conversationId:targetConversation});
  if(sameVisual)return normalized.length;
  return bridge()?.replace?.(normalized,{selfId:selfAccountId(),viewState})||0;
}

function merge(rows,{conversationId=currentConversationId,contactId=currentContactId}={}){
  const targetContact=contactId?String(contactId):null;
  const boundary=resolveRowsConversation(rows,conversationId);
  if(!targetContact||!boundary.valid)return 0;
  const targetConversation=boundary.conversationId;
  let session=sessions.get(sessionKey(targetContact));
  if(!session){
    session=rememberSession(targetContact,targetConversation,[]);
  }else if(targetConversation&&!session.conversationId){
    session.conversationId=targetConversation;
  }
  const beforeSignature=session.signature||rowsSignature(session.rows||[]);
  const merged=mergeSessionRows(session,rows);
  const changed=beforeSignature!==session.signature;
  const active=
    String(currentContactId||'')===String(targetContact)&&
    activeConversationMatches(targetConversation);
  if(!active||!changed)return merged.length;
  if(targetConversation)currentConversationId=targetConversation;
  return bridge()?.reconcile?.(Array.isArray(rows)?rows:[],{selfId:selfAccountId()})?.size??merged.length;
}

function apply(row,{remote}={}){
  if(!row?.id)return false;
  if(!activeConversationMatches(row.conversation_id))return false;
  if(currentContactId){
    let session=sessions.get(sessionKey(currentContactId));
    if(!session)session=rememberSession(currentContactId,currentConversationId,[]);
    if(session)mergeSessionRows(session,[row]);
  }
  return bridge()?.append?.(row,{selfId:selfAccountId(),remote:Boolean(remote)} )||false;
}

function remove(id){
  const key=String(id||'');
  if(!key)return false;
  if(currentContactId){
    const session=sessions.get(sessionKey(currentContactId));
    if(session){
      session.rows=session.rows.filter(row=>String(row?.id||'')!==key&&String(row?.client_id||'')!==key);
      session.signature=rowsSignature(session.rows);
      session.updatedAt=Date.now();
    }
  }
  return bridge()?.remove?.(id)||false;
}

function isReady(){return authenticated()&&Boolean(currentContactId);}

async function activate(contactId){
  stashCurrentView();
  currentContactId=contactId?String(contactId):null;
  currentConversationId=null;
  if(!currentContactId){bridge()?.clear?.();return false;}
  restoreSession(currentContactId);
  return sync()?.openContact?.(currentContactId)||false;
}

async function send({clientId,text,contactId,conversationId,reply=null}={}){
  if(!isReady())throw new Error('conversation_not_ready');
  const target=String(contactId||currentContactId||'');
  const scopedConversation=conversationId||((target===currentContactId)?currentConversationId:null)||null;
  if(!target)throw new Error('conversation_not_ready');
  return sync()?.queueText?.({clientId,text,contactId:target,conversationId:scopedConversation,reply});
}

async function sendMedia({clientId,text='',assets,contactId,conversationId,reply=null}={}){
  if(!authenticated())throw new Error('conversation_not_ready');
  const target=String(contactId||currentContactId||'');
  if(!target)throw new Error('conversation_not_ready');
  const list=Array.isArray(assets)?assets.filter(Boolean):[];
  if(!list.length)throw new Error('media_asset_required');
  const scopedConversation=conversationId||((target===currentContactId)?currentConversationId:null)||null;
  if(!scopedConversation)throw new Error('conversation_not_ready');
  if(list.some(asset=>String(asset?.conversationId||'')!==String(scopedConversation))){
    throw new Error('media_scope_mismatch');
  }
  return sync()?.queueMediaFiles?.({
    clientId,text,assets:list,contactId:target,
    conversationId:scopedConversation,
    reply,
    deferWake:true
  });
}

async function refreshUnread(){return sync()?.refreshUnread?.()||0;}
async function reconcileCurrent(){return sync()?.wake?.({reason:'message-reconcile'})||false;}

window.V21MessageStore={
  version:VERSION,isReady,send,sendMedia,activate,refreshUnread,reconcileCurrent,selfAccountId,
  setContext,replace,merge,apply,remove,reset,primeSession,restoreSession,stashCurrentView,hasSession,mergeForContact,
  snapshot(){return{
    currentContactId,currentConversationId,selfAccountId:selfAccountId(),ready:isReady(),sessionCount:sessions.size
  };}
};
})();
