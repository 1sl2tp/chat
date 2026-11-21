'use strict';
// CHAT-416: use the SAME presentation formatter as Chat/Directory in the SW.
// Optional import cannot block notifications when a public asset is offline.
try{importScripts('./chat-message-case.js');}catch{}
function chatPushDisplayPreview(value){
 const raw=String(value||'');
 try{return self.V21ChatMessageCase?.previewCase?.(raw)||raw;}catch{return raw;}
}
const RELEASE_VERSION='V21.72.73';
const MODULE_CONTRACT_VERSION='pwa-sw-v1';
// BANK-177: reload one-time cached shell for the live bank reconciliation table.
// Keep offline-first startup; do not add per-navigation network requests.
// IMG-286: refresh only the public Web/PWA shell for two verified image
// orientation defaults and corrected album thumbnails. Keep account-scoped
// IndexedDB, outbox, private media and auth sessions unchanged.
// CHAT-345: rotate only the public Web/PWA shell to deliver subtle
// pending text/media animation; keep account data, outbox and media intact.
// CHAT-385: rotate only the public shell for adaptive mobile header CSS/JS.
// Never clear message drafts, private IndexedDB or outbound queues.
// CHAT-386: invalidate only public shell CSS/JS; preserve accounts, drafts and outbox.
// CHAT-387: fresh SW/page coordination, public shell only. Keep private caches.
// CHAT-388: public Web/PWA shell only; private messages, drafts and outbox untouched.
// CHAT-389: header account menu + bottom search dock; single canonical release for Web/PWA.
// CHAT-394: refresh only the public shell for search-first layout and preserved directory scroll.
// CHAT-395: refresh public shell for compact three-zone directory; keep private caches.
// CHAT-397: public shell refresh for iOS Composer IME/geometry stability.
// CHAT-398: rotate public CSS/JS shell only; never clear drafts/outbox/account data.
// CHAT-399: only public chat presentation cache; keep private messages/outbox/drafts.
// CHAT-400: refresh public formatter only; preserve drafts, sessions and outbox.
// CHAT-401: refresh only the public order-reading UI; keep drafts, media and private outbox.
// CHAT-402: only presentation code refresh; no messages, drafts, or outbox edits.
// CHAT-403: refresh the read-only layout; do not touch drafts/outbox.
// CHAT-404: only read-only order display; no drafts or outbox changes.
// CHAT-405: only public message-layout CSS/JS; keep sessions, drafts and private outbox.
// CHAT-406: refresh the product-name reader without changing messages or outbox.
// CHAT-407: refresh public read-only message parser, keep drafts and outbox.
// CHAT-408: refresh the read-only daily summary UI; no private chat or outbox cache changes.
// CHAT-409: public OCR UI shell; do not evict private media, drafts or outbox.
// CHAT-410: public feature-readiness gate; no private media/draft cache resets.
// CHAT-418: public shell update only; private messages, drafts, photos, outbox stay intact.
// CHAT-427: refresh only public shell/status-bar metadata; preserve private messages, drafts and outbox.
// CHAT-428: status-bar scroll-under repaint only; never evict private drafts, photos or messages.
// CHAT-429: refresh PUBLIC app shell only; keep auth sessions, drafts, chats and media.
const SHELL_CACHE_EPOCH='pwa-chat-ui429-critical-layout-20261121';
const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH;
const AVATAR_CACHE_NAME='taphoa-chat-avatars-v1';
const SUPABASE_ASSET_HOST_RE=/^[a-z0-9]+\.supabase\.co$/i;
const AVATAR_CACHE_MAX=320;
/* Startup-only CacheStorage path for two public vendor scripts.
   Never cache auth, RPC, messages or other dynamic endpoints. */
const BOOT_VENDOR_URLS=new Set([
  'https://cdn.tailwindcss.com/',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js'
]);
function isBootVendorScript(request,url){
  return request.destination==='script'&&BOOT_VENDOR_URLS.has(url.href);
}
async function cachedBootVendorScript(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);
  if(cached)return cached;
  const fresh=await fetch(request);
  if(fresh&&(fresh.ok||fresh.type==='opaque')){
    void cache.put(request,fresh.clone()).catch(()=>{});
  }
  return fresh;
}
const SHELL=['./','./manifest.webmanifest','./icons/chat-app-180-v3.png','./icons/chat-app-192-v3.png','./icons/chat-app-512-v3.png','./icons/chat-maskable-512-v3.png','./icons/chat-notification-icon-192-v4.png','./icons/chat-notification-badge-96-v4.png','./chat-message-case.js'];
const adminPushClientState=new Map();
let adminPushBadgeCount=0;

function isSupabasePublicAvatar(request,url){
  return request.destination==='image'&&
    SUPABASE_ASSET_HOST_RE.test(url.hostname)&&
    url.pathname.startsWith('/storage/v1/object/public/v21-avatars/');
}

async function trimAvatarCache(cache){
  const keys=await cache.keys();
  const extra=keys.length-AVATAR_CACHE_MAX;
  if(extra<=0)return;
  await Promise.all(keys.slice(0,extra).map(request=>cache.delete(request)));
}

async function cachedAvatarResponse(request){
  const cache=await caches.open(AVATAR_CACHE_NAME);
  const cached=await cache.match(request,{ignoreVary:true});
  if(cached)return cached;
  const fresh=await fetch(request);
  if(fresh&&(fresh.ok||fresh.type==='opaque')){
    await cache.put(request,fresh.clone()).catch(()=>{});
    void trimAvatarCache(cache).catch(()=>{});
  }
  return fresh;
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      // Never seed a newly activated worker with a browser-HTTP-cached old
      // index.html. iOS installed PWAs must install the currently published build.
      await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})));
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>
      (key.startsWith('taphoa-chat-shell-')&&key!==CACHE_NAME)||
      (key.startsWith('taphoa-chat-avatars-')&&key!==AVATAR_CACHE_NAME)
    ).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function setAdminPushBadge(count){
  adminPushBadgeCount=Math.max(0,Number(count)||0);
  try{
    if(adminPushBadgeCount>0&&typeof navigator?.setAppBadge==='function')await navigator.setAppBadge(adminPushBadgeCount);
    else if(adminPushBadgeCount===0&&typeof navigator?.clearAppBadge==='function')await navigator.clearAppBadge();
  }catch{}
  return adminPushBadgeCount;
}
async function clearAdminPushBadge(){return setAdminPushBadge(0);}
async function bumpAdminPushBadge(){return setAdminPushBadge(adminPushBadgeCount+1);}
function notifyBadgeDirty(clients){
  for(const client of clients||[]){
    try{client.postMessage?.({type:'ADMIN_PUSH_BADGE_DIRTY'});}catch{}
  }
}
function notifyMessageDirty(clients,payload={}){
  const message={
    type:'ADMIN_PUSH_MESSAGE_DIRTY',
    conversationId:String(payload.conversation_id||''),
    contactId:String(payload.contact_id||''),
    messageId:String(payload.message_id||''),
    title:String(payload.title||'Tin nhắn mới').slice(0,90),
    body:chatPushDisplayPreview(String(payload.body||'').slice(0,140))
  };
  for(const client of clients||[]){
    try{client.postMessage?.(message);}catch{}
  }
}

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
  if(event.data?.type==='ADMIN_PUSH_STATE'&&event.source?.id){
    const state={...event.data,updatedAt:Date.now()};
    adminPushClientState.set(event.source.id,state);
  }
  if(event.data?.type==='ADMIN_PUSH_BADGE_SET'){
    void setAdminPushBadge(event.data?.count);
  }
  if(event.data?.type==='ADMIN_PUSH_CLEAR'){
    if(event.source?.id)adminPushClientState.delete(event.source.id);
    void clearAdminPushBadge();
  }
});

/* CHAT-387 — Push delivery is the only time the SW queries live view state.
   New/updated iOS PWA workers have an empty adminPushClientState map. A
   MessageChannel response avoids treating that old/empty snapshot as current.
   The bounded fallback neither polls nor makes network requests. */
async function foregroundClientState(client){
  if(client?.visibilityState==='hidden')return null; // phone locked/app background
  if(client?.visibilityState&&client.visibilityState!=='visible')return null;
  let live=null;
  const canAskLive=typeof MessageChannel==='function'&&
    typeof client?.postMessage==='function';
  if(canAskLive){
    live=await new Promise(resolve=>{
      let channel;
      try{channel=new MessageChannel();}catch{resolve(null);return;}
      let settled=false;
      const finish=state=>{
        if(settled)return;
        settled=true;clearTimeout(timeout);
        try{channel.port1.close();channel.port2.close();}catch{}
        resolve(state&&typeof state==='object'?state:null);
      };
      const timeout=setTimeout(()=>finish(null),220);
      channel.port1.onmessage=event=>finish(event.data);
      try{client.postMessage({type:'ADMIN_PUSH_STATE_REQUEST'},[channel.port2]);}
      catch{finish(null);}
    });
  }
  const cached=adminPushClientState.get(client?.id);
  // A locked iPhone may suspend the page before WebKit updates the client's
  // visibilityState. If a live query times out, NEVER trust its recent
  // visible-cache as evidence that the screen is still unlocked.
  const state=canAskLive?live:
    (cached&&Date.now()-cached.updatedAt<30000?cached:null);
  if(!state||state.visible!==true)return null;
  // document.hasFocus() is often false in an actively typing iOS PWA.
  // Client visibility + the actual Chat route is the foreground criterion.
  return state;
}

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload=null;
    try{payload=event.data?.json?.()||null;}catch{return;}
    if(!payload||typeof payload!=='object')return;
    const kind=String(payload.kind||'message');
    const conversationId=String(payload.conversation_id||'');
    const inviteId=String(payload.invite_id||'');
    const bankPush=kind==='bank_reconciliation';
    const missedPush=kind==='missed_chat_call';
    const friendPush=kind==='zalo_friend_accepted';
    const missedCallId=String(payload.call_id||'');
    const bankDay=String(payload.bank_day||'');
    const bankNoticeId=String(payload.bank_notice_id||'');
    const bankReceiptId=String(payload.bank_receipt_id||'');
    const bankStatus=String(payload.bank_event_kind||'');
    // BANK-350: bank Push keeps the report fresh, but lock-screen alerts are
    // restricted to a recognized bill with a verified positive OCR amount.
    // Older/unknown payloads are silent, never an English internal error.
    const billAmount=Number(payload.bill_amount_vnd);
    const visibleBankBill=bankPush&&payload.bank_alert_allowed===true&&
      ['bill_waiting','review','matched'].includes(bankStatus)&&
      Boolean(bankReceiptId)&&Number.isSafeInteger(billAmount)&&billAmount>0;
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    // BANK-302: the bank report must refresh even when an open iOS/Android PWA
    // suppresses a lock-screen notification. Bank events NEVER count as Chat
    // unread messages or trigger message pulls.
    if(bankPush){
      for(const client of clients){
        try{client.postMessage?.({
          type:'ADMIN_PUSH_BANK_DIRTY',bankDay,bankReceiptId,bankNoticeId,bankStatus,bankAmountVnd:billAmount
        });}catch{}
      }
    }
    // A verified ledger supersedes BOTH preceding "AI retry" / "bill waiting"
    // notifications and the older unmatched bank-credit notice. Do this BEFORE
    // foreground suppression: an open PWA must not leave old "Chưa ghi thu"
    // cards in Notification Center after the confirmed collection.
    if(bankPush&&bankStatus==='matched'){
      const oldTags=[];
      if(bankReceiptId)oldTags.push('bank:receipt:'+bankReceiptId);
      if(bankNoticeId)oldTags.push('bank:notice:'+bankNoticeId);
      try{
        if(typeof self.registration.getNotifications==='function'){
          for(const tag of oldTags){
            const old=await self.registration.getNotifications({tag});
            for(const note of old||[])note.close?.();
          }
        }
      }catch{
        // Missing notification APIs must never prevent showing the verified
        // collection confirmation. A later push or opening the report still
        // reads the canonical ledger.
        console.warn('bank_push_stale_cleanup_unavailable');
      }
    }
    // Preserve BANK_DIRTY for a visible report, but suppress unrelated bank
    // credit, scanner errors, non-bills and duplicate-image OS notifications.
    if(bankPush&&!visibleBankBill)return;
    // Financial events are not message events. Do not trigger a Chat sync pull
    // or unread recount just to display a bank notification.
    if(!bankPush&&!missedPush&&!friendPush&&kind!=='call_invite')notifyMessageDirty(clients,payload);
    const foreground=kind==='call_invite'||missedPush||friendPush
      ?[]
      :await Promise.all(clients.map(async client=>({
        client,state:await foregroundClientState(client)
      })));
    const readingSame=foreground.some(({state})=>Boolean(
      state&&state.route==='chat'&&
      (bankPush
        ?String(payload.contact_id||'')!==''&&String(state.contactId||'')===String(payload.contact_id||'')
        :conversationId!==''&&String(state.conversationId||'')===conversationId)
    ));
    // In mobile Chat the canonical thread renders its own messages; other
    // conversations get a compact IN-APP toast from admin-push-controller.js.
    // A native OS banner while typing in the SAME chat is a duplicate.
    // Other routes (Work, directory, hidden/locked) keep system delivery.
    const visibleMobileChat=foreground.some(({state})=>Boolean(
      state&&state.route==='chat'&&
      /^(ios|android)-(pwa|web)$/.test(String(state.platform||''))
    ));
    if(readingSame||visibleMobileChat)return;

    // Render finance copy locally from a NUMBER, never display backend
    // status/reason text or English exception names on iPhone/Android.
    const bankTitle='TAPHOA · Đã nhận diện bill';
    const bankBody='Số tiền: '+new Intl.NumberFormat('vi-VN').format(billAmount)+'đ'+
      (bankStatus==='matched'?' · Đã ghi thu':' · Chưa ghi thu');
    await self.registration.showNotification(bankPush?bankTitle:String(payload.title||'TAPHOA Chat'),{
      body:bankPush?bankBody:(kind==='message'?
        chatPushDisplayPreview(payload.body||'Tin nhắn mới'):
        String(payload.body||(kind==='call_invite'?'Cuộc gọi đến':'Tin nhắn mới'))),
      icon:'./icons/chat-notification-icon-192-v4.png',
      badge:'./icons/chat-notification-badge-96-v4.png',
      tag:bankPush?'bank:receipt:'+bankReceiptId:
        String(payload.tag||(kind==='call_invite'?`call-invite:${inviteId}`:`chat:${conversationId}`)),
      renotify:!bankPush,
      data:{
        kind,
        inviteId,
        conversationId,
        contactId:String(payload.contact_id||''),
        bankDay,bankNoticeId,bankReceiptId,bankStatus,missedCallId,
      }
    });
    if(!bankPush&&!missedPush&&!friendPush&&kind!=='call_invite'){
      await bumpAdminPushBadge();
      notifyBadgeDirty(clients);
    }
  })());
});

// Notification clicks must target the active Chat/PWA client, not the first
// arbitrary tab returned by matchAll (which may belong to another window).
function preferredNotificationClient(clients,contactId,conversationId){
  const origin=self.location.origin;
  const candidates=(clients||[]).filter(client=>{
    try{return new URL(client.url).origin===origin;}catch{return false;}
  });
  const score=client=>{
    const state=adminPushClientState.get(client.id)||{};
    const pwa=String(state.platform||'').endsWith('-pwa')||state.platform==='pwa';
    return (pwa?100:0)+
      (contactId&&String(state.contactId||'')===contactId?30:0)+
      (conversationId&&String(state.conversationId||'')===conversationId?25:0)+
      (client.visibilityState==='visible'?8:0)+
      (state.focused?4:0)+(state.route==='chat'?2:0);
  };
  candidates.sort((a,b)=>score(b)-score(a));
  return candidates[0]||null;
}

self.addEventListener('notificationclick',event=>{
  event.notification?.close?.();
  event.waitUntil((async()=>{
    const data=event.notification?.data||{};
    const kind=String(data.kind||'message');
    const inviteId=String(data.inviteId||'');
    const conversationId=String(data.conversationId||'');
    const contactId=String(data.contactId||'');
    const bankDay=String(data.bankDay||'');
    const bankNoticeId=String(data.bankNoticeId||'');
    const bankReceiptId=String(data.bankReceiptId||'');
    const bankStatus=String(data.bankStatus||'');
    const missedCallId=String(data.missedCallId||'');
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=preferredNotificationClient(clients,contactId,conversationId);
    // One canonical deep link for both cold open and failed existing-client
    // delivery. Keep message, call, bank and friend intent fields intact.
    const target=new URL('./',self.location.origin);
    if(contactId)target.searchParams.set('push_contact',contactId);
    if(conversationId)target.searchParams.set('push_conversation',conversationId);
    if(kind==='call_invite'&&inviteId)target.searchParams.set('push_call_invite',inviteId);
    if(kind==='zalo_friend_accepted')target.searchParams.set('push_friend','1');
    if(kind==='missed_chat_call'&&missedCallId)target.searchParams.set('push_missed_chat_call',missedCallId);
    if(kind==='bank_reconciliation'){
      if(bankDay)target.searchParams.set('push_bank_day',bankDay);
      if(bankNoticeId)target.searchParams.set('push_bank_notice',bankNoticeId);
      if(bankReceiptId)target.searchParams.set('push_bank_receipt',bankReceiptId);
      if(bankStatus)target.searchParams.set('push_bank_status',bankStatus);
    }
    if(client){
      let focused=false;
      try{
        if(typeof client.focus!=='function'||typeof client.postMessage!=='function')
          throw new Error('notification_client_unavailable');
        await client.focus();
        focused=true;
        if(kind==='call_invite'){
          client.postMessage({type:'ADMIN_PUSH_OPEN',kind:'call_invite',inviteId,conversationId,contactId});
        }else if(kind==='bank_reconciliation'){
          client.postMessage({type:'ADMIN_PUSH_OPEN',kind,contactId,
            bankDay,bankNoticeId,bankReceiptId,bankStatus});
        }else if(kind==='missed_chat_call'){
          client.postMessage({type:'ADMIN_PUSH_OPEN',kind,contactId,missedCallId});
        }else if(kind==='zalo_friend_accepted'){
          client.postMessage({type:'ADMIN_PUSH_OPEN',kind});
        }else{
          client.postMessage({type:'ADMIN_PUSH_OPEN',conversationId,contactId});
        }
        return;
      }catch{
        // Focus succeeded but messaging failed: reuse that same window first.
        // A rejected focus must instead use a visible cold-open target.
        if(focused&&typeof client.navigate==='function'){
          try{
            const navigated=await client.navigate(target.toString());
            if(navigated){
              try{await navigated.focus?.();}catch{}
              return;
            }
          }catch{}
        }
      }
    }
    // Single sequential fallback; never open a second window when the
    // existing client accepted the click or navigated successfully.
    await self.clients.openWindow(target.toString());
  })());
});

// UI-208: On every online Web, mobile and installed PWA navigation, the
// published document is authoritative. The previous cache-first strategy
// returned old HTML even on manual reload, while active accounts deliberately
// deferred automatic reloads; that stranded B+ demo controls in PWA installs.
// Cached HTML is *only* an offline recovery option, never an online priority.
async function networkFirst(request,{navigation=false,event=null}={}){
  const networkRequest=new Request(request,{cache:'no-store'});
  try{
    const response=await fetch(networkRequest);
    if(response&&response.ok&&new URL(request.url).origin===self.location.origin){
      // CacheStorage may be unavailable in private Safari. Never hold back an
      // otherwise successful network navigation because storage failed.
      const saving=(async()=>{
        const cache=await caches.open(CACHE_NAME);
        await cache.put(request,response.clone());
        if(navigation)await cache.put('./',response.clone());
      })().catch(()=>{});
      if(event?.waitUntil)event.waitUntil(saving);
      else await saving;
    }
    return response;
  }catch(error){
    try{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(request);
      if(cached)return cached;
      if(navigation){
        const shell=await cache.match('./');
        if(shell)return shell;
      }
    }catch{}
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(isBootVendorScript(request,url)){
    event.respondWith(cachedBootVendorScript(request));
    return;
  }
  if(isSupabasePublicAvatar(request,url)){
    event.respondWith(cachedAvatarResponse(request));
    return;
  }
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/version.json')||url.pathname.endsWith('version.json')){
    event.respondWith(fetch(new Request(request,{cache: 'no-store'})));
    return;
  }
  if(request.mode==='navigate'){
    // Same freshness policy for iOS standalone, Android PWA and browser tabs.
    // Preserve deep-link query arguments, retain the last good offline shell.
    event.respondWith(networkFirst(request,{navigation:true,event}));
    return;
  }
  event.respondWith(networkFirst(request,{event}));
});
