(()=>{
'use strict';
const VERSION='V21.72.5';
const TERMINAL=new Set(['REJECTED','CANCELLED','ENDED','MISSED']);
let currentCall=null;
let busy=false;
let expiryTimer=0;
let generation=0;
let lastReason='boot';
let lastError=null;
let pendingLocalEndCallId=null;
let micReadyPromise=null;
let mediaActivePromise=null;

function authStore(){return window.V21AuthSessionStore||null;}
function shell(){return window.ChatAppShell||null;}
function mediaSession(){return window.V21LiveKitSession||null;}
function authSnapshot(){return authStore()?.snapshot?.()||{state:'GUEST'};}
function authenticated(){const s=authSnapshot();return s.state==='AUTHENTICATED'&&Boolean(s.account?.id&&s.appSessionId);}
function client(){return authStore()?.getClient?.()||null;}
function callCommand(){return shell()?.CallCommand||null;}
function clearExpiry(){if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=0;}}
function refreshButton(){callCommand()?.refresh?.();}
function setBusy(value){busy=Boolean(value);refreshButton();}

const PENDING_END_PREFIX='taphoa-v21-call-pending-end:';
function pendingEndKey(appSessionId){
  const id=String(appSessionId||'');
  return id?`${PENDING_END_PREFIX}${id}`:'';
}
function persistPendingEnd(callId){
  const id=String(callId||'');
  const s=authSnapshot();
  if(!id||!s.appSessionId||!s.account?.id)return false;
  pendingLocalEndCallId=id;
  try{
    localStorage.setItem(pendingEndKey(s.appSessionId),JSON.stringify({
      callId:id,appSessionId:String(s.appSessionId),accountId:String(s.account.id),createdAt:Date.now()
    }));
  }catch{}
  return true;
}
function restorePersistedPendingEnd(){
  const s=authSnapshot();
  const key=pendingEndKey(s.appSessionId);
  if(!key||!s.account?.id)return null;
  try{
    const raw=JSON.parse(localStorage.getItem(key)||'null');
    if(
      raw&&String(raw.appSessionId||'')===String(s.appSessionId)&&
      String(raw.accountId||'')===String(s.account.id)&&
      String(raw.callId||'')
    ){
      pendingLocalEndCallId=String(raw.callId);
      return pendingLocalEndCallId;
    }
  }catch{}
  return null;
}
function clearPersistedPendingEnd(appSessionId=authSnapshot()?.appSessionId){
  const key=pendingEndKey(appSessionId);
  if(key){try{localStorage.removeItem(key);}catch{}}
  pendingLocalEndCallId=null;
  return true;
}

function canonical(raw){
  if(!raw||typeof raw!=='object')return null;
  const id=String(raw.id||'');
  const status=String(raw.status||'').toUpperCase();
  if(!id||!status)return null;
  return{
    id,
    conversationId:String(raw.conversation_id||''),
    callerAccountId:String(raw.caller_account_id||''),
    calleeAccountId:String(raw.callee_account_id||''),
    callerAppSessionId:String(raw.caller_app_session_id||''),
    acceptedAppSessionId:raw.accepted_app_session_id?String(raw.accepted_app_session_id):null,
    clientId:String(raw.client_id||''),
    type:String(raw.type||'audio'),
    status,
    direction:String(raw.direction||''),
    peerAccountId:String(raw.peer_account_id||''),
    peerName:String(raw.peer_name||raw.peer_username||'Liên hệ'),
    peerUsername:String(raw.peer_username||''),
    createdAt:raw.created_at||null,
    ringExpiresAt:raw.ring_expires_at||null,
    acceptedAt:raw.accepted_at||null,
    callerMicReadyAt:raw.caller_mic_ready_at||null,
    calleeMicReadyAt:raw.callee_mic_ready_at||null,
    micGateOpenAt:raw.mic_gate_open_at||null,
    callerMediaReadyAt:raw.caller_media_ready_at||null,
    calleeMediaReadyAt:raw.callee_media_ready_at||null,
    mediaStartedAt:raw.media_started_at||null,
    endedAt:raw.ended_at||null,
    durationMs:raw.duration_ms==null?null:Math.max(0,Number(raw.duration_ms)||0),
    endedBy:raw.ended_by?String(raw.ended_by):null,
    updatedAt:raw.updated_at||null,
    version:Math.max(1,Number(raw.version)||1)
  };
}

function emit(reason){
  document.dispatchEvent(new CustomEvent('v21-call-engine-state',{detail:{
    reason:String(reason||lastReason),busy,error:lastError,
    pendingLocalEndCallId,
    call:currentCall?{...currentCall}:null
  }}));
}

function scheduleExpiry(call){
  clearExpiry();
  if(call?.status!=='RINGING'||!call.ringExpiresAt)return;
  const due=Date.parse(call.ringExpiresAt);
  if(!Number.isFinite(due))return;
  const delay=Math.max(0,due-Date.now()+40);
  expiryTimer=setTimeout(()=>{
    expiryTimer=0;
    void refreshCallById(call.id,{reason:'ring-expiry'});
  },Math.min(delay,2147483647));
}

function applyCanonical(raw,{reason='apply'}={}){
  const call=canonical(raw);
  lastReason=reason;
  lastError=null;
  clearExpiry();

  if(!call){
    currentCall=null;
    pendingLocalEndCallId=null;
    void mediaSession()?.leave?.({reason:'canonical-empty',intentional:true});
    callCommand()?.resetFromEngine?.(reason,null);
    emit(reason);
    return null;
  }

  if(currentCall&&currentCall.id!==call.id){
    const currentCreated=Date.parse(currentCall.createdAt||'');
    const incomingCreated=Date.parse(call.createdAt||'');
    if(!Number.isFinite(incomingCreated)||
       (Number.isFinite(currentCreated)&&currentCreated>=incomingCreated)){
      emit(`${reason}:stale-call-ignored`);
      return currentCall;
    }
  }

  if(TERMINAL.has(call.status)){
    if(currentCall&&currentCall.id!==call.id){
      emit(`${reason}:stale-terminal-ignored`);
      return currentCall;
    }
    if(pendingLocalEndCallId===call.id)clearPersistedPendingEnd();
    currentCall=null;
    void mediaSession()?.leave?.({reason:`terminal:${call.status}`,intentional:true});
    callCommand()?.resetFromEngine?.(reason,call);
    emit(reason);
    return null;
  }

  currentCall=call;
  if(call.status==='RINGING'){
    if(call.direction==='incoming'){
      callCommand()?.receiveIncoming?.(call.peerAccountId,call.peerName,call);
    }else{
      callCommand()?.enterOutgoing?.(call.peerAccountId,call.peerName,call);
    }
    scheduleExpiry(call);
    void mediaSession()?.warm?.();
  }else if(call.status==='ACCEPTED'){
    // ACCEPTED only means both users agreed to call. Media is a separate
    // two-stage barrier: mic permission/device readiness first, then real
    // two-way audio playback readiness. Until both barriers are canonical,
    // keep the UI in CONNECTING.
    void mediaSession()?.ensureJoined?.(call);
    void mediaSession()?.syncCanonical?.(call);
    if(call.mediaStartedAt&&mediaSession()?.isMediaHealthy?.(call.id)){
      callCommand()?.enterActive?.(call.peerAccountId,call.peerName,call);
    }else{
      callCommand()?.enterConnecting?.(call.peerAccountId,call.peerName,call);
    }
  }
  emit(reason);
  return call;
}

function mapError(error,fallback='call_failed'){
  const text=String(error?.message||error?.details||fallback);
  for(const code of [
    'peer_busy','call_in_progress','call_forbidden','call_not_found','contact_not_found',
    'contact_not_allowed','session_revoked','authentication_required','call_not_joinable',
    'call_session_forbidden','call_not_authorized'
  ]){
    if(text.includes(code))return code;
  }
  return fallback;
}

async function rpc(name,args){
  const api=client();
  if(!api||!authenticated())throw new Error('authentication_required');
  const {data,error}=await api.rpc(name,args);
  if(error)throw error;
  return data;
}

async function startOutgoing({contactId,contactName}={}){
  const target=String(contactId||'');
  if(!target||busy||currentCall||!authenticated())return false;
  const token=++generation;
  setBusy(true);
  lastError=null;
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_start',{
      p_app_session_id:s.appSessionId,
      p_contact_id:target,
      p_client_id:String(window.V21RuntimeId?.create?.()||`call-${Date.now()}`)
    });
    if(token!==generation)return false;
    const call=applyCanonical(raw,{reason:'start'});
    if(!call){callCommand()?.forceReset?.();return false;}
    return true;
  }catch(error){
    if(token!==generation)return false;
    lastError=mapError(error,'call_start_failed');
    currentCall=null;
    clearExpiry();
    callCommand()?.forceReset?.();
    emit('start-error');
    return false;
  }finally{
    if(token===generation)setBusy(false);
  }
}

async function refreshCallById(callId,{reason='call-refresh'}={}){
  const id=String(callId||'');
  if(!id||!authenticated())return null;
  const token=generation;
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_get',{p_app_session_id:s.appSessionId,p_call_id:id});
    if(token!==generation)return null;
    return applyCanonical(raw,{reason});
  }catch(error){
    if(token!==generation)return null;
    lastError=mapError(error,'call_refresh_failed');
    emit('refresh-error');
    return currentCall;
  }
}

async function retryPendingLocalEnd({reason='pending-end-retry'}={}){
  const id=String(pendingLocalEndCallId||'');
  if(!id||!authenticated())return null;
  const token=generation;
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_end',{p_app_session_id:s.appSessionId,p_call_id:id});
    if(token!==generation)return null;
    clearPersistedPendingEnd();
    return applyCanonical(raw,{reason});
  }catch(error){
    if(token!==generation)return null;
    lastError=mapError(error,'call_end_retry_failed');
    emit('pending-end-error');
    return currentCall;
  }
}

async function recover({reason='recover'}={}){
  if(!authenticated()){
    clearLocal('not-authenticated');
    return null;
  }
  if(pendingLocalEndCallId)return retryPendingLocalEnd({reason:`${reason}:pending-end`});
  const callId=String(currentCall?.id||'');
  if(callId)return refreshCallById(callId,{reason});
  return reconcile({reason});
}

async function reconcile({reason='reconcile'}={}){
  if(!authenticated()){
    clearLocal('not-authenticated');
    return null;
  }
  const token=generation;
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_reconcile',{p_app_session_id:s.appSessionId});
    if(token!==generation)return null;
    return applyCanonical(raw,{reason});
  }catch(error){
    if(token!==generation)return null;
    lastError=mapError(error,'call_reconcile_failed');
    emit('reconcile-error');
    return currentCall;
  }
}

async function acceptCurrent(){
  const call=currentCall;
  if(!call||call.status!=='RINGING'||call.direction!=='incoming'||busy)return false;
  const token=generation;
  setBusy(true);
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_accept',{p_app_session_id:s.appSessionId,p_call_id:call.id});
    if(token!==generation)return false;
    const next=applyCanonical(raw,{reason:'accept'});
    return Boolean(next?.status==='ACCEPTED');
  }catch(error){
    if(token!==generation)return false;
    lastError=mapError(error,'call_accept_failed');
    emit('accept-error');
    void recover({reason:'accept-recover'});
    return false;
  }finally{if(token===generation)setBusy(false);}
}

async function markMicReady({callId}={}){
  const id=String(callId||currentCall?.id||'');
  if(!id||!currentCall||currentCall.id!==id||currentCall.status!=='ACCEPTED'||!authenticated())return null;
  if(micReadyPromise)return micReadyPromise;
  const token=generation;
  micReadyPromise=(async()=>{
    try{
      const s=authSnapshot();
      const raw=await rpc('v21_call_mic_ready',{p_app_session_id:s.appSessionId,p_call_id:id});
      if(token!==generation)return null;
      const call=canonical(raw);
      if(!call||call.id!==id||call.status!=='ACCEPTED')return null;
      currentCall=call;
      lastReason='mic-ready-ack';
      lastError=null;
      emit('mic-ready-ack');
      return call;
    }catch(error){
      if(token!==generation)return null;
      lastError=mapError(error,'mic_ready_failed');
      emit('mic-ready-error');
      return null;
    }finally{
      micReadyPromise=null;
    }
  })();
  return micReadyPromise;
}

async function markMediaReady({callId}={}){
  const id=String(callId||currentCall?.id||'');
  if(!id||!currentCall||currentCall.id!==id||currentCall.status!=='ACCEPTED'||!authenticated())return null;
  if(mediaActivePromise)return mediaActivePromise;
  const token=generation;
  mediaActivePromise=(async()=>{
    try{
      const s=authSnapshot();
      const raw=await rpc('v21_call_media_ready',{p_app_session_id:s.appSessionId,p_call_id:id});
      if(token!==generation)return null;
      const call=canonical(raw);
      if(!call||call.id!==id||call.status!=='ACCEPTED')return null;
      currentCall=call;
      lastReason='media-ready-ack';
      lastError=null;
      // Do NOT self-promote to ACTIVE here. The server emits CALL_MEDIA_ACTIVE
      // only after both caller and callee have marked media readiness. Both
      // browsers transition from that canonical event/recovery barrier.
      emit('media-ready-ack');
      return call;
    }catch(error){
      if(token!==generation)return null;
      lastError=mapError(error,'media_ready_failed');
      emit('media-ready-error');
      return null;
    }finally{
      mediaActivePromise=null;
    }
  })();
  return mediaActivePromise;
}

function mediaDegraded(reason='media-degraded'){
  const call=currentCall;
  if(!call||call.status!=='ACCEPTED')return false;
  callCommand()?.enterConnecting?.(call.peerAccountId,call.peerName,call);
  lastReason=String(reason||'media-degraded');
  emit(lastReason);
  return true;
}

async function confirmPeerLost({callId,reason='peer-left-confirmed'}={}){
  const id=String(callId||currentCall?.id||'');
  if(!id||!currentCall||currentCall.id!==id||currentCall.status!=='ACCEPTED'||!authenticated())return false;
  const token=generation;
  try{
    // Client only reports a suspicion. Canonical END is allowed only after the
    // server checks the real LiveKit room membership. This prevents transient
    // ParticipantDisconnected/offline events from becoming false CALL_END.
    const refreshed=await refreshCallById(id,{reason:`${reason}:confirm`});
    if(token!==generation||!refreshed||refreshed.id!==id||refreshed.status!=='ACCEPTED')return false;
    if(mediaSession()?.snapshot?.().remoteParticipants>0)return false;
    const s=authSnapshot();
    const api=client();
    if(!api)throw new Error('authentication_required');
    const {data,error}=await api.functions.invoke('v21-livekit-confirm-peer',{
      body:{callId:id,appSessionId:s.appSessionId}
    });
    if(error)throw error;
    if(token!==generation)return false;
    if(data?.ended&&data?.call){
      applyCanonical(data.call,{reason});
      return true;
    }
    lastReason=`${reason}:${String(data?.reason||'not-confirmed')}`;
    lastError=null;
    emit(lastReason);
    return false;
  }catch(error){
    if(token!==generation)return false;
    lastError=mapError(error,'peer_confirmation_unavailable');
    emit('peer-confirm-error');
    return false;
  }
}

async function rejectCurrent(){
  const call=currentCall;
  if(!call||call.status!=='RINGING'||call.direction!=='incoming'||busy)return false;
  const token=generation;
  setBusy(true);
  try{
    const s=authSnapshot();
    const raw=await rpc('v21_call_reject',{p_app_session_id:s.appSessionId,p_call_id:call.id});
    if(token!==generation)return false;
    applyCanonical(raw,{reason:'reject'});
    return true;
  }catch(error){
    if(token!==generation)return false;
    lastError=mapError(error,'call_reject_failed');
    emit('reject-error');
    void recover({reason:'reject-recover'});
    return false;
  }finally{if(token===generation)setBusy(false);}
}

async function stopCurrent({reason='hangup'}={}){
  const call=currentCall;
  if(!call)return true;
  if(busy)return false;
  const token=generation;
  setBusy(true);
  const accepted=call.status==='ACCEPTED';
  if(accepted){
    persistPendingEnd(call.id);
    callCommand()?.endOptimistic?.(reason);
    // UI and microphone stop immediately, but keep the room attached until
    // CALL_END is persisted. This avoids a peer-disconnect race stealing
    // ended_by from the user who actually tapped Kết thúc.
    await mediaSession()?.quiet?.({reason:`${reason}:quiet`});
  }
  try{
    const s=authSnapshot();
    let name='v21_call_end';
    if(call.status==='RINGING')name=call.direction==='incoming'?'v21_call_reject':'v21_call_cancel';
    const raw=await rpc(name,{p_app_session_id:s.appSessionId,p_call_id:call.id});
    if(token!==generation)return false;
    if(accepted)clearPersistedPendingEnd();
    applyCanonical(raw,{reason});
    return true;
  }catch(error){
    if(token!==generation)return false;
    lastError=mapError(error,'call_stop_failed');
    emit('stop-error');
    if(accepted)await mediaSession()?.leave?.({reason:`${reason}:rpc-failed`,intentional:true});
    else void recover({reason:'stop-recover'});
    return false;
  }finally{if(token===generation)setBusy(false);}
}

function clearLocal(reason='clear-local'){
  generation+=1;
  clearExpiry();
  busy=false;
  currentCall=null;
  // RAM state is cleared, but a persisted pending END intentionally survives
  // reload/local reset until the server confirms END or auth revocation cleanup.
  pendingLocalEndCallId=null;
  micReadyPromise=null;
  mediaActivePromise=null;
  lastError=null;
  lastReason=reason;
  void mediaSession()?.leave?.({reason,intentional:true});
  callCommand()?.forceReset?.();
  refreshButton();
  emit(reason);
  return true;
}

function wake(signal={}){
  const kind=String(signal?.kind||'CALL_SIGNAL');
  const callId=String(signal?.callId||signal?.call_id||'');
  if(currentCall?.id&&callId&&currentCall.id!==callId&&currentCall.status==='ACCEPTED')return false;
  if(callId){
    void refreshCallById(callId,{reason:`signal:${kind}`});
    return true;
  }
  void reconcile({reason:`signal:${kind}`});
  return true;
}

document.addEventListener('v21-auth-state',event=>{
  if(event.detail?.state==='AUTHENTICATED'){
    restorePersistedPendingEnd();
    void recover({reason:'auth'});
  }else clearLocal('auth-reset');
});
window.V21CallEngine=Object.freeze({
  version:VERSION,startOutgoing,acceptCurrent,markMicReady,markMediaReady,rejectCurrent,stopCurrent,
  mediaDegraded,confirmPeerLost,
  reconcile,recover,refreshCallById,wake,clearLocal,clearPersistedPendingEnd,restorePersistedPendingEnd,
  snapshot(){return{busy,lastReason,lastError,pendingLocalEndCallId,call:currentCall?{...currentCall}:null};}
});

queueMicrotask(()=>{
  if(authenticated()){
    restorePersistedPendingEnd();
    void recover({reason:'boot'});
  }
});
})();
