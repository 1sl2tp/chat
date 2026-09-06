(()=>{
'use strict';

const VERSION='V21.71';
const DB_NAME='taphoa-v21-cache';
const DB_VERSION=1;
let dbPromise=null;

function req(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('idb_request_failed'));
  });
}

function txDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve(true);
    tx.onabort=()=>reject(tx.error||new Error('idb_tx_aborted'));
    tx.onerror=()=>reject(tx.error||new Error('idb_tx_failed'));
  });
}

function open(){
  if(dbPromise)return dbPromise;
  if(!('indexedDB' in window)){
    dbPromise=Promise.reject(new Error('indexeddb_unavailable'));
    return dbPromise;
  }
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('meta')){
        const store=db.createObjectStore('meta',{keyPath:'key'});
        store.createIndex('by_account','account_id',{unique:false});
      }
      if(!db.objectStoreNames.contains('contacts')){
        const store=db.createObjectStore('contacts',{keyPath:'cache_key'});
        store.createIndex('by_account','account_id',{unique:false});
      }
      if(!db.objectStoreNames.contains('messages')){
        const store=db.createObjectStore('messages',{keyPath:'cache_key'});
        store.createIndex('by_account','account_id',{unique:false});
        store.createIndex('by_account_conversation_created',['account_id','conversation_id','created_at'],{unique:false});
      }
      if(!db.objectStoreNames.contains('read_states')){
        const store=db.createObjectStore('read_states',{keyPath:'cache_key'});
        store.createIndex('by_account','owner_account_id',{unique:false});
      }
      if(!db.objectStoreNames.contains('outbox')){
        const store=db.createObjectStore('outbox',{keyPath:'cache_key'});
        store.createIndex('by_account_created',['account_id','created_at'],{unique:false});
        store.createIndex('by_account_contact',['account_id','contact_id'],{unique:false});
      }
      if(!db.objectStoreNames.contains('media')){
        const store=db.createObjectStore('media',{keyPath:'cache_key'});
        store.createIndex('by_account','account_id',{unique:false});
        store.createIndex('by_account_access',['account_id','last_accessed_at'],{unique:false});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('indexeddb_open_failed'));
  });
  return dbPromise;
}

function contactKey(accountId,id){return `${accountId}:contact:${id}`;}
function messageKey(accountId,id){return `${accountId}:message:${id}`;}
function readKey(ownerAccountId,conversationId,accountId){return `${ownerAccountId}:read:${conversationId}:${accountId}`;}
function outboxKey(accountId,clientId){return `${accountId}:outbox:${clientId}`;}
function mediaKey(accountId,assetId){return `${accountId}:media:${assetId}`;}
function metaKey(accountId,name){return `${accountId}:meta:${name}`;}

async function getMeta(accountId,name,fallback=null){
  const db=await open();
  const tx=db.transaction('meta','readonly');
  const row=await req(tx.objectStore('meta').get(metaKey(accountId,name)));
  await txDone(tx);
  return row?.value ?? fallback;
}

async function setMeta(accountId,name,value){
  const db=await open();
  const tx=db.transaction('meta','readwrite');
  tx.objectStore('meta').put({key:metaKey(accountId,name),account_id:String(accountId),name,value,updated_at:Date.now()});
  await txDone(tx);
  return value;
}

async function replaceContacts(accountId,contacts=[]){
  const db=await open();
  const tx=db.transaction('contacts','readwrite');
  const store=tx.objectStore('contacts');
  const index=store.index('by_account');
  await new Promise((resolve,reject)=>{
    const cursor=index.openCursor(IDBKeyRange.only(String(accountId)));
    cursor.onerror=()=>reject(cursor.error||new Error('contacts_cursor_failed'));
    cursor.onsuccess=()=>{
      const c=cursor.result;
      if(!c){resolve();return;}
      c.delete();
      c.continue();
    };
  });
  for(const item of (Array.isArray(contacts)?contacts:[])){
    if(!item?.id)continue;
    store.put({...item,cache_key:contactKey(accountId,item.id),account_id:String(accountId)});
  }
  await txDone(tx);
  return true;
}

async function listContacts(accountId){
  const db=await open();
  const tx=db.transaction('contacts','readonly');
  const rows=await req(tx.objectStore('contacts').index('by_account').getAll(IDBKeyRange.only(String(accountId))));
  await txDone(tx);
  return (rows||[]).map(({cache_key,account_id,...rest})=>rest).sort((a,b)=>String(a.display_name||a.username||'').localeCompare(String(b.display_name||b.username||'')));
}

async function upsertContact(accountId,item){
  if(!item?.id)return false;
  const db=await open();
  const tx=db.transaction('contacts','readwrite');
  tx.objectStore('contacts').put({...item,cache_key:contactKey(accountId,item.id),account_id:String(accountId)});
  await txDone(tx);
  return true;
}

async function removeContact(accountId,id){
  const db=await open();
  const tx=db.transaction('contacts','readwrite');
  tx.objectStore('contacts').delete(contactKey(accountId,id));
  await txDone(tx);
  return true;
}

async function putMessage(accountId,row){
  if(!row?.id)return false;
  const db=await open();
  const tx=db.transaction('messages','readwrite');
  const normalized={
    ...row,
    cache_key:messageKey(accountId,row.id),
    account_id:String(accountId),
    conversation_id:String(row.conversation_id||''),
    created_at:String(row.created_at||new Date().toISOString()),
    version:Number(row.version)||0
  };
  tx.objectStore('messages').put(normalized);
  await txDone(tx);
  return true;
}

async function putMessages(accountId,rows=[]){
  const db=await open();
  const tx=db.transaction('messages','readwrite');
  const store=tx.objectStore('messages');
  for(const row of (Array.isArray(rows)?rows:[])){
    if(!row?.id)continue;
    store.put({
      ...row,
      cache_key:messageKey(accountId,row.id),
      account_id:String(accountId),
      conversation_id:String(row.conversation_id||''),
      created_at:String(row.created_at||new Date().toISOString()),
      version:Number(row.version)||0
    });
  }
  await txDone(tx);
  return true;
}

async function getMessage(accountId,id){
  const db=await open();
  const tx=db.transaction('messages','readonly');
  const row=await req(tx.objectStore('messages').get(messageKey(accountId,id)));
  await txDone(tx);
  if(!row)return null;
  const {cache_key,account_id,...rest}=row;
  return rest;
}

async function listMessages(accountId,conversationId,limit=100){
  const db=await open();
  const tx=db.transaction('messages','readonly');
  const index=tx.objectStore('messages').index('by_account_conversation_created');
  const lower=[String(accountId),String(conversationId),''];
  const upper=[String(accountId),String(conversationId),'\uffff'];
  const rows=await req(index.getAll(IDBKeyRange.bound(lower,upper)));
  await txDone(tx);
  return (rows||[])
    .filter(row=>!row.deleted_at)
    .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)))
    .slice(-Math.max(1,Number(limit)||100))
    .map(({cache_key,account_id,...rest})=>rest);
}

async function removeMessage(accountId,id){
  const db=await open();
  const tx=db.transaction('messages','readwrite');
  tx.objectStore('messages').delete(messageKey(accountId,id));
  await txDone(tx);
  return true;
}

async function putReadState(ownerAccountId,row){
  if(!row?.conversation_id||!row?.account_id)return false;
  const db=await open();
  const tx=db.transaction('read_states','readwrite');
  tx.objectStore('read_states').put({
    ...row,
    cache_key:readKey(ownerAccountId,row.conversation_id,row.account_id),
    owner_account_id:String(ownerAccountId),
    version:Number(row.version)||0
  });
  await txDone(tx);
  return true;
}

async function putOutbox(accountId,item){
  if(!item?.client_id)return false;
  const db=await open();
  const tx=db.transaction('outbox','readwrite');
  tx.objectStore('outbox').put({
    ...item,
    cache_key:outboxKey(accountId,item.client_id),
    account_id:String(accountId),
    contact_id:String(item.contact_id||''),
    created_at:String(item.created_at||new Date().toISOString()),
    attempts:Number(item.attempts)||0
  });
  await txDone(tx);
  return true;
}

async function listOutbox(accountId){
  const db=await open();
  const tx=db.transaction('outbox','readonly');
  const lower=[String(accountId),''];
  const upper=[String(accountId),'\uffff'];
  const rows=await req(tx.objectStore('outbox').index('by_account_created').getAll(IDBKeyRange.bound(lower,upper)));
  await txDone(tx);
  return (rows||[]).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(({cache_key,account_id,...rest})=>rest);
}

async function listOutboxForContact(accountId,contactId){
  const db=await open();
  const tx=db.transaction('outbox','readonly');
  const rows=await req(tx.objectStore('outbox').index('by_account_contact').getAll(IDBKeyRange.only([String(accountId),String(contactId)])));
  await txDone(tx);
  return (rows||[]).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(({cache_key,account_id,...rest})=>rest);
}

async function removeOutbox(accountId,clientId){
  const db=await open();
  const tx=db.transaction('outbox','readwrite');
  tx.objectStore('outbox').delete(outboxKey(accountId,clientId));
  await txDone(tx);
  return true;
}

async function updateOutbox(accountId,item){return putOutbox(accountId,item);}

async function putMediaRecord(accountId,assetId,record){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('media','readwrite');
    const store=tx.objectStore('media');
    const cacheKey=mediaKey(accountId,assetId);
    tx.oncomplete=()=>resolve(true);
    tx.onabort=()=>reject(tx.error||new Error('idb_media_tx_aborted'));
    tx.onerror=()=>reject(tx.error||new Error('idb_media_tx_failed'));
    const getRequest=store.get(cacheKey);
    getRequest.onerror=()=>{try{tx.abort();}catch{};reject(getRequest.error||new Error('idb_media_get_failed'));};
    getRequest.onsuccess=()=>{
      try{
        store.put({
          ...(getRequest.result||{}),
          ...(record||{}),
          cache_key:cacheKey,
          account_id:String(accountId),
          asset_id:String(assetId),
          last_accessed_at:Date.now()
        });
      }catch(error){
        try{tx.abort();}catch{}
        reject(error);
      }
    };
  });
}

async function getMediaRecord(accountId,assetId){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('media','readonly');
    const store=tx.objectStore('media');
    let row=null;
    tx.oncomplete=()=>resolve(row);
    tx.onabort=()=>reject(tx.error||new Error('idb_media_read_tx_aborted'));
    tx.onerror=()=>reject(tx.error||new Error('idb_media_read_tx_failed'));
    const getRequest=store.get(mediaKey(accountId,assetId));
    getRequest.onerror=()=>reject(getRequest.error||new Error('idb_media_get_failed'));
    getRequest.onsuccess=()=>{row=getRequest.result||null;};
  });
}

async function removeMediaRecord(accountId,assetId){
  const db=await open();
  const tx=db.transaction('media','readwrite');
  tx.objectStore('media').delete(mediaKey(accountId,assetId));
  await txDone(tx);
  return true;
}

async function listMediaRecords(accountId){
  const db=await open();
  const tx=db.transaction('media','readonly');
  const rows=await req(tx.objectStore('media').index('by_account').getAll(IDBKeyRange.only(String(accountId))));
  await txDone(tx);
  return rows||[];
}

async function deleteByAccount(storeName,indexName,accountId){
  const db=await open();
  const tx=db.transaction(storeName,'readwrite');
  const index=tx.objectStore(storeName).index(indexName);
  await new Promise((resolve,reject)=>{
    const cursor=index.openCursor(IDBKeyRange.only(String(accountId)));
    cursor.onerror=()=>reject(cursor.error||new Error('cache_clear_cursor_failed'));
    cursor.onsuccess=()=>{
      const c=cursor.result;
      if(!c){resolve();return;}
      c.delete();
      c.continue();
    };
  });
  await txDone(tx);
}

async function clearAccount(accountId){
  const id=String(accountId||'');
  if(!id)return false;
  await Promise.all([
    deleteByAccount('meta','by_account',id),
    deleteByAccount('contacts','by_account',id),
    deleteByAccount('messages','by_account',id),
    deleteByAccount('read_states','by_account',id),
    deleteByAccount('media','by_account',id)
  ]);
  const db=await open();
  const tx=db.transaction('outbox','readwrite');
  const index=tx.objectStore('outbox').index('by_account_created');
  await new Promise((resolve,reject)=>{
    const cursor=index.openCursor(IDBKeyRange.bound([id,''],[id,'\uffff']));
    cursor.onerror=()=>reject(cursor.error||new Error('outbox_clear_failed'));
    cursor.onsuccess=()=>{const c=cursor.result;if(!c){resolve();return;}c.delete();c.continue();};
  });
  await txDone(tx);
  return true;
}

window.V21CacheStore={
  version:VERSION,open,
  getMeta,setMeta,
  getCursor:(accountId)=>getMeta(accountId,'sync_cursor',0),
  setCursor:(accountId,cursor)=>setMeta(accountId,'sync_cursor',Math.max(0,Number(cursor)||0)),
  isInitialized:(accountId)=>getMeta(accountId,'sync_initialized',false),
  setInitialized:(accountId,value)=>setMeta(accountId,'sync_initialized',Boolean(value)),
  getConversationId:(accountId,contactId)=>getMeta(accountId,`conversation:${contactId}`,null),
  setConversationId:(accountId,contactId,conversationId)=>setMeta(accountId,`conversation:${contactId}`,String(conversationId)),
  replaceContacts,listContacts,upsertContact,removeContact,
  putMessage,putMessages,getMessage,listMessages,removeMessage,
  putReadState,
  putOutbox,listOutbox,listOutboxForContact,removeOutbox,updateOutbox,
  putMediaRecord,getMediaRecord,removeMediaRecord,listMediaRecords,
  clearAccount
};
})();
