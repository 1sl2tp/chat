(()=>{
'use strict';
const VERSION='V21.72.5';
let client=null;
let channel=null;
let channelState='CLOSED';
let reconnectTimer=0;
let reconnectAttempt=0;
let recoveryTimer=0;
let recoveryAttempt=0;
let presencePublishTimer=0;
let generation=0;
let lifecycle=Promise.resolve();
let lastInteractionAt=Date.now();
let remotePresence=[];
const RECOVERY_BACKOFF_MS=[5000,10000,20000,30000];

function authStore(){return window.V21AuthSessionStore||null;}
function sync(){return window.V21SyncEngine||null;}
function callEngine(){return window.V21CallEngine||null;}
function shell(){return window.ChatAppShell||null;}
function snapshot(){return authStore()?.snapshot?.()||{state:'GUEST'};}
function authenticated(){const s=snapshot();return s.state==='AUTHENTICATED'&&Boolean(s.appSessionId&&s.account?.id);}
function online(){return navigator.onLine!==false;}
function clearTimer(){if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=0;}}
function clearRecoveryTimer(){if(recoveryTimer){clearTimeout(recoveryTimer);recoveryTimer=0;}}
function clearPresenceTimer(){if(presencePublishTimer){clearTimeout(presencePublishTimer);presencePublishTimer=0;}}

function localPresencePayload(){
  const auth=snapshot();
  const syncState=sync()?.snapshot?.()||{};
  const shellState=shell()?.snapshot?.()||{};
  const isOnline=authenticated()&&online();
  const visible=!document.hidden;
  const route=String(shellState.route||'');
  const conversationId=String(syncState.currentConversationId||'');
  const activeConversation=Boolean(isOnline&&visible&&route==='chat'&&conversationId);
  const state=!isOnline?'OFFLINE':activeConversation?'ACTIVE_CHAT':'ONLINE_IDLE';
  return{
    accountId:String(auth.account?.id||''),
    appSessionId:String(auth.appSessionId||''),
    state,online:isOnline,visible,route,
    conversationId:activeConversation?conversationId:null,
    lastInteractionAt:new Date(lastInteractionAt).toISOString(),
    updatedAt:new Date().toISOString()
  };
}

function emitPresence(){
  document.dispatchEvent(new CustomEvent('v21-presence-change',{
    detail:{local:localPresencePayload(),remote:remotePresence.map(item=>({...item}))}
  }));
}

function refreshRemotePresence(source=channel){
  const auth=snapshot();
  const ownSession=String(auth.appSessionId||'');
  const state=source?.presenceState?.()||{};
  const rows=[];
  for(const entries of Object.values(state)){
    for(const meta of (Array.isArray(entries)?entries:[])){
      const appSessionId=String(meta?.appSessionId||meta?.app_session_id||'');
      if(appSessionId&&appSessionId===ownSession)continue;
      const accountId=String(meta?.accountId||meta?.account_id||'');
      if(!accountId)continue;
      rows.push({
        accountId,appSessionId,
        state:String(meta?.state||'ONLINE_IDLE'),
        online:meta?.online!==false,
        visible:Boolean(meta?.visible),
        route:String(meta?.route||''),
        conversationId:meta?.conversationId||meta?.conversation_id||null,
        lastInteractionAt:meta?.lastInteractionAt||meta?.last_interaction_at||null,
        updatedAt:meta?.updatedAt||meta?.updated_at||null
      });
    }
  }
  remotePresence=rows;
  emitPresence();
}

async function publishPresence(){
  clearPresenceTimer();
  emitPresence();
  if(!channel||channelState!=='SUBSCRIBED'||!authenticated()||!online())return false;
  try{
    await channel.track?.(localPresencePayload());
    return true;
  }catch{return false;}
}

function schedulePresencePublish(delay=120){
  clearPresenceTimer();
  presencePublishTimer=setTimeout(()=>{presencePublishTimer=0;void publishPresence();},Math.max(0,Number(delay)||0));
}

function markInteraction(){
  lastInteractionAt=Date.now();
  schedulePresencePublish(350);
}

function enqueue(task){
  const run=lifecycle.then(task,task);
  lifecycle=run.catch(()=>{});
  return run;
}

async function detachCurrent(){
  const old=channel;
  channel=null;
  channelState='CLOSED';
  remotePresence=[];
  emitPresence();
  if(old&&client){
    try{await old.untrack?.();}catch{}
    try{await client.removeChannel(old);}catch{}
  }
}

function stop(){
  const request=++generation;
  clearTimer();
  clearRecoveryTimer();
  clearPresenceTimer();
  reconnectAttempt=0;
  recoveryAttempt=0;
  return enqueue(async()=>{
    await detachCurrent();
    return request===generation;
  });
}

function schedule(immediate=false){
  if(!authenticated()||!online()||reconnectTimer)return;
  const delay=immediate?0:Math.min(8000,600*(2**Math.min(reconnectAttempt,4)));
  reconnectAttempt+=1;
  reconnectTimer=setTimeout(()=>{reconnectTimer=0;void start();},delay);
}

function scheduleRecovery(){
  if(!authenticated()||!online()||document.hidden||recoveryTimer||channelState==='SUBSCRIBED')return;
  const index=Math.min(recoveryAttempt,RECOVERY_BACKOFF_MS.length-1);
  const delay=RECOVERY_BACKOFF_MS[index];
  recoveryAttempt+=1;
  recoveryTimer=setTimeout(async()=>{
    recoveryTimer=0;
    if(!authenticated()||!online()||document.hidden||channelState==='SUBSCRIBED')return;
    await sync()?.wake?.({reason:'realtime-backoff-recovery'});
    await callEngine()?.recover?.({reason:'realtime-backoff-recovery'});
    if(channelState!=='SUBSCRIBED')scheduleRecovery();
  },delay);
}

function start(){
  const request=++generation;
  clearTimer();
  return enqueue(async()=>{
    await detachCurrent();
    if(request!==generation||!authenticated()||!online())return false;

    client=authStore()?.getClient?.()||client;
    if(!client)return false;
    if(!await authStore()?.syncRealtimeAuth?.()){
      if(request===generation){schedule(false);scheduleRecovery();}
      return false;
    }
    if(request!==generation||!authenticated()||!online())return false;

    const s=snapshot();
    const local=request;
    const next=client.channel(`v21-realtime-${s.appSessionId}`,{
      config:{presence:{key:String(s.appSessionId)}}
    })
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'v21_sync_events',
        filter:`target_account_id=eq.${s.account.id}`
      },payload=>{
        if(local!==generation||channel!==next)return;
        const seq=Number(payload?.new?.seq)||0;
        void sync()?.wake?.({reason:'realtime',hintSeq:seq});
      })
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'v21_session_events',
        filter:`target_app_session_id=eq.${s.appSessionId}`
      },()=>{
        if(local!==generation||channel!==next)return;
        void authStore()?.handleRevoked?.();
      })
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'v21_call_events',
        filter:`target_account_id=eq.${s.account.id}`
      },payload=>{
        if(local!==generation||channel!==next)return;
        const row=payload?.new||{};
        callEngine()?.wake?.({kind:row.kind,callId:row.call_id,seq:row.seq});
      })
      .on('presence',{event:'sync'},()=>{
        if(local!==generation||channel!==next)return;
        refreshRemotePresence(next);
      });

    if(local!==generation)return false;
    channel=next;
    next.subscribe(status=>{
      if(local!==generation||channel!==next)return;
      channelState=String(status||'UNKNOWN');
      if(status==='SUBSCRIBED'){
        reconnectAttempt=0;
        recoveryAttempt=0;
        clearTimer();
        clearRecoveryTimer();
        void publishPresence();
        void sync()?.wake?.({reason:'realtime-subscribed'});
        void callEngine()?.recover?.({reason:'realtime-subscribed'});
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
        schedule(false);
        scheduleRecovery();
      }
    });
    return true;
  });
}

document.addEventListener('v21-auth-state',event=>{
  if(event.detail?.state==='AUTHENTICATED')void start();
  else void stop();
});
document.addEventListener('v21-auth-token-refreshed',()=>{if(authenticated())void start();});
window.addEventListener('online',()=>{
  if(!authenticated())return;
  recoveryAttempt=0;
  schedule(true);
  void sync()?.wake?.({reason:'online'});
  void callEngine()?.recover?.({reason:'online'});
  schedulePresencePublish(0);
});
window.addEventListener('offline',()=>{
  clearTimer();
  clearRecoveryTimer();
  schedulePresencePublish(0);
});
document.addEventListener('visibilitychange',()=>{
  schedulePresencePublish(0);
  if(document.hidden||!authenticated())return;
  recoveryAttempt=0;
  if(channelState!=='SUBSCRIBED'){
    schedule(true);
    scheduleRecovery();
  }
  void sync()?.wake?.({reason:'foreground'});
  void callEngine()?.recover?.({reason:'foreground'});
});
document.addEventListener('navigation-change',()=>schedulePresencePublish(0));
document.addEventListener('v21-active-contact-change',()=>schedulePresencePublish(0));
document.addEventListener('pointerdown',markInteraction,{passive:true,capture:true});
document.addEventListener('keydown',markInteraction,{passive:true,capture:true});
document.addEventListener('input',markInteraction,{passive:true,capture:true});

window.V21RealtimeSession={
  version:VERSION,start,stop,publishPresence,
  snapshot(){return{
    channelState,reconnectAttempt,recoveryAttempt,generation,
    recoveryActive:Boolean(recoveryTimer),authenticated:authenticated(),
    presence:{local:localPresencePayload(),remote:remotePresence.map(item=>({...item}))}
  };}
};

queueMicrotask(()=>{if(authenticated())void start();else emitPresence();});
})();
