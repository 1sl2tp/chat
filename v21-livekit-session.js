(()=>{
'use strict';
const VERSION='V21.72.5';
const SDK_URL='https://cdn.jsdelivr.net/npm/livekit-client@2.22.2/dist/livekit-client.umd.min.js';
const PEER_LOSS_CONFIRM_MS=4000;
let sdkPromise=null;
let warmPromise=null;
let room=null;
let roomCallId='';
let latestCanonicalCall=null;
let joining=false;
let connected=false;
let reconnecting=false;
let localMicPermissionReady=false;
let micPreflightPromise=null;
let micReadySubmitted=false;
let localMicPublished=false;
let remoteAudioSubscribed=false;
let remotePlaybackReady=false;
let active=false;
let mediaReadySubmitted=false;
let intentionalLeave=false;
let generation=0;
let lastReason='boot';
let lastError=null;
let peerLossTimer=0;
const audioElements=new Set();

function authStore(){return window.V21AuthSessionStore||null;}
function callEngine(){return window.V21CallEngine||null;}
function authSnapshot(){return authStore()?.snapshot?.()||{state:'GUEST'};}
function authenticated(){const s=authSnapshot();return s.state==='AUTHENTICATED'&&Boolean(s.appSessionId&&s.account?.id);}
function client(){return authStore()?.getClient?.()||null;}
function online(){return navigator.onLine!==false;}

function emit(reason){
  lastReason=String(reason||lastReason);
  document.dispatchEvent(new CustomEvent('v21-livekit-state',{detail:snapshot()}));
}

function clearPeerLossTimer(){
  if(peerLossTimer){clearTimeout(peerLossTimer);peerLossTimer=0;}
}

function resetFlags(){
  joining=false;
  connected=false;
  reconnecting=false;
  localMicPermissionReady=false;
  micPreflightPromise=null;
  micReadySubmitted=false;
  localMicPublished=false;
  remoteAudioSubscribed=false;
  remotePlaybackReady=false;
  active=false;
  mediaReadySubmitted=false;
  latestCanonicalCall=null;
  clearPeerLossTimer();
}

function cleanupAudio(){
  for(const el of audioElements){
    try{el.pause?.();}catch{}
    try{el.remove?.();}catch{}
  }
  audioElements.clear();
}

function loadSdk(){
  if(window.LivekitClient?.Room)return Promise.resolve(window.LivekitClient);
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-v21-livekit-sdk]');
    if(existing){
      existing.addEventListener('load',()=>window.LivekitClient?.Room?resolve(window.LivekitClient):reject(new Error('livekit_sdk_unavailable')),{once:true});
      existing.addEventListener('error',()=>reject(new Error('livekit_sdk_load_failed')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=SDK_URL;
    script.async=true;
    script.crossOrigin='anonymous';
    script.dataset.v21LivekitSdk='true';
    script.addEventListener('load',()=>window.LivekitClient?.Room?resolve(window.LivekitClient):reject(new Error('livekit_sdk_unavailable')),{once:true});
    script.addEventListener('error',()=>reject(new Error('livekit_sdk_load_failed')),{once:true});
    document.head.appendChild(script);
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}

async function warm(){
  if(!authenticated()||!online())return false;
  if(warmPromise)return warmPromise;
  warmPromise=(async()=>{
    const api=client();
    const sdk=loadSdk().catch(()=>null);
    const fn=api?.functions?.invoke?.('v21-livekit-token',{body:{action:'warm'}}).catch?.(()=>null);
    await Promise.all([sdk,fn]);
    return Boolean(window.LivekitClient?.Room);
  })().finally(()=>{warmPromise=null;});
  return warmPromise;
}

async function tokenFor(call){
  const s=authSnapshot();
  const api=client();
  if(!api||!authenticated())throw new Error('authentication_required');
  const {data,error}=await api.functions.invoke('v21-livekit-token',{
    body:{callId:String(call.id),appSessionId:String(s.appSessionId)}
  });
  if(error)throw error;
  if(!data?.serverUrl||!data?.participantToken)throw new Error(String(data?.error||'livekit_token_failed'));
  return data;
}

function remoteParticipantCount(){return Number(room?.remoteParticipants?.size||0);}

async function attachAudio(track,next){
  let el=null;
  try{
    el=track.attach();
    if(!el)return false;
    el.autoplay=true;
    el.playsInline=true;
    el.style.position='fixed';
    el.style.width='1px';
    el.style.height='1px';
    el.style.opacity='0';
    el.style.pointerEvents='none';
    el.style.inset='auto 0 0 auto';
    document.body.appendChild(el);
    audioElements.add(el);
    try{await next?.startAudio?.();}catch{}
    const playResult=el.play?.();
    if(playResult&&typeof playResult.then==='function')await playResult;
    return true;
  }catch(error){
    lastError=String(error?.message||error||'remote_audio_playback_blocked');
    return false;
  }
}

function detachAudio(track){
  try{
    for(const el of track.detach?.()||[]){
      audioElements.delete(el);
      el.remove?.();
    }
  }catch{}
}

async function preflightMicrophone(call){
  if(localMicPermissionReady)return true;
  if(micPreflightPromise)return micPreflightPromise;
  if(!navigator.mediaDevices?.getUserMedia){
    lastError='microphone_unavailable';
    emit('microphone-unavailable');
    return false;
  }
  const localGeneration=generation;
  micPreflightPromise=(async()=>{
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true,
        channelCount:1
      }});
      if(localGeneration!==generation||String(call?.id||'')!==String(roomCallId||''))return false;
      const tracks=stream.getAudioTracks?.()||[];
      const ok=tracks.some(track=>track&&track.readyState==='live'&&track.enabled!==false);
      if(!ok)throw new Error('microphone_not_ready');
      // Preflight must not hold the hardware open while waiting for Supabase.
      // Stop the temporary track immediately after device health is proven.
      try{for(const track of stream.getTracks?.()||[])track.stop?.();}catch{}
      stream=null;
      localMicPermissionReady=true;
      lastError=null;
      emit('microphone-permission-ready');
      if(!micReadySubmitted){
        micReadySubmitted=true;
        const ack=await callEngine()?.markMicReady?.({callId:String(call.id)});
        if(!ack||String(ack.id)!==String(call.id)){
          micReadySubmitted=false;
          emit('microphone-ready-submit-failed');
          return false;
        }
        latestCanonicalCall=ack;
        emit('microphone-ready-submitted');
        if(ack.micGateOpenAt||ack.mic_gate_open_at)await syncCanonical(ack);
      }
      return true;
    }catch(error){
      if(localGeneration!==generation)return false;
      lastError=String(error?.name||error?.message||error||'microphone_permission_failed');
      localMicPermissionReady=false;
      micReadySubmitted=false;
      emit('microphone-permission-failed');
      return false;
    }finally{
      try{for(const track of stream?.getTracks?.()||[])track.stop?.();}catch{}
      micPreflightPromise=null;
    }
  })();
  return micPreflightPromise;
}

async function publishMicrophoneIfGateOpen(call){
  const gate=call?.micGateOpenAt||call?.mic_gate_open_at||null;
  if(!gate||!room||!connected||reconnecting||!localMicPermissionReady)return false;
  if(localMicPublished)return true;
  const localGeneration=generation;
  try{
    await room.localParticipant.setMicrophoneEnabled(true,{
      echoCancellation:true,
      noiseSuppression:true,
      autoGainControl:true,
      channelCount:1
    });
    if(localGeneration!==generation||String(call?.id||'')!==String(roomCallId||''))return false;
    localMicPublished=Boolean(room.localParticipant.isMicrophoneEnabled);
    emit(localMicPublished?'microphone-published':'microphone-publish-failed');
    if(localMicPublished)void maybeSubmitMediaReady('local-mic-published');
    return localMicPublished;
  }catch(error){
    if(localGeneration!==generation)return false;
    lastError=String(error?.message||error||'microphone_publish_failed');
    localMicPublished=false;
    emit('microphone-publish-error');
    return false;
  }
}

async function maybeSubmitMediaReady(reason='media-ready'){
  if(active||mediaReadySubmitted||!room||!connected||reconnecting||!localMicPublished||!remoteAudioSubscribed||!remotePlaybackReady||remoteParticipantCount()<1)return false;
  const callId=String(roomCallId||'');
  if(!callId)return false;
  mediaReadySubmitted=true;
  emit(`${reason}:submitting`);
  const call=await callEngine()?.markMediaReady?.({callId});
  if(!call||String(call.id)!==callId){
    mediaReadySubmitted=false;
    emit(`${reason}:submit-failed`);
    return false;
  }
  latestCanonicalCall=call;
  active=Boolean(call.mediaStartedAt||call.media_started_at) && isMediaHealthy(callId);
  emit(`${reason}:submitted`);
  return true;
}

function schedulePeerLossConfirm(reason='peer-left'){
  clearPeerLossTimer();
  const localGeneration=generation;
  const callId=String(roomCallId||'');
  if(!callId||!online()||reconnecting)return;
  peerLossTimer=setTimeout(()=>{
    peerLossTimer=0;
    if(localGeneration!==generation||String(roomCallId||'')!==callId)return;
    if(!online()||reconnecting||!connected||remoteParticipantCount()>0)return;
    void callEngine()?.confirmPeerLost?.({callId,reason});
  },PEER_LOSS_CONFIRM_MS);
}

function markDegraded(reason='media-degraded'){
  active=false;
  remotePlaybackReady=false;
  callEngine()?.mediaDegraded?.(reason);
  emit(reason);
}

function bindRoomEvents(next,sdk,localGeneration){
  const {RoomEvent,Track}=sdk;
  next.on(RoomEvent.ParticipantConnected,()=>{
    if(localGeneration!==generation||next!==room)return;
    clearPeerLossTimer();
    emit('participant-connected');
  });
  next.on(RoomEvent.ParticipantDisconnected,()=>{
    if(localGeneration!==generation||next!==room||intentionalLeave)return;
    remoteAudioSubscribed=false;
    remotePlaybackReady=false;
    markDegraded('peer-possibly-disconnected');
    if(!reconnecting&&online())schedulePeerLossConfirm('peer-left-confirmed');
  });
  next.on(RoomEvent.TrackSubscribed,(track)=>{
    if(localGeneration!==generation||next!==room)return;
    if(track?.kind===Track.Kind.Audio||track?.kind==='audio'){
      remoteAudioSubscribed=true;
      void (async()=>{
        remotePlaybackReady=await attachAudio(track,next);
        if(localGeneration!==generation||next!==room)return;
        emit(remotePlaybackReady?'remote-audio-playable':'remote-audio-blocked');
        if(remotePlaybackReady)void maybeSubmitMediaReady('remote-audio-playable');
      })();
    }
  });
  next.on(RoomEvent.TrackUnsubscribed,(track)=>{
    if(localGeneration!==generation||next!==room)return;
    if(track?.kind===Track.Kind.Audio||track?.kind==='audio'){
      detachAudio(track);
      remoteAudioSubscribed=false;
      remotePlaybackReady=false;
      mediaReadySubmitted=false;
      markDegraded('remote-audio-lost');
    }
  });
  next.on(RoomEvent.Reconnecting,()=>{
    if(localGeneration!==generation||next!==room)return;
    reconnecting=true;
    clearPeerLossTimer();
    markDegraded('reconnecting');
  });
  next.on(RoomEvent.Reconnected,()=>{
    if(localGeneration!==generation||next!==room)return;
    reconnecting=false;
    connected=true;
    emit('reconnected');
    void callEngine()?.recover?.({reason:'livekit-reconnected'});
    if(latestCanonicalCall)void syncCanonical(latestCanonicalCall);
  });
  next.on(RoomEvent.Disconnected,()=>{
    if(localGeneration!==generation||next!==room||intentionalLeave)return;
    connected=false;
    reconnecting=false;
    localMicPublished=false;
    remoteAudioSubscribed=false;
    remotePlaybackReady=false;
    mediaReadySubmitted=false;
    markDegraded('livekit-disconnected');
    if(online())setTimeout(()=>void callEngine()?.recover?.({reason:'livekit-disconnected-recover'}),250);
  });
}

async function syncCanonical(call){
  if(!call||String(call.id||'')!==String(roomCallId||''))return false;
  latestCanonicalCall=call;
  if(String(call.status||'').toUpperCase()!=='ACCEPTED')return false;
  if(call.micGateOpenAt||call.mic_gate_open_at)await publishMicrophoneIfGateOpen(call);
  const hasServerActive=Boolean(call.mediaStartedAt||call.media_started_at);
  active=hasServerActive&&isMediaHealthy(call.id);
  emit(active?'canonical-active':'canonical-connecting');
  return active;
}

async function ensureJoined(call){
  if(!call||String(call.status||'').toUpperCase()!=='ACCEPTED'||!authenticated())return false;
  const callId=String(call.id||'');
  if(!callId)return false;
  latestCanonicalCall=call;
  if(room&&roomCallId===callId&&(connected||joining||reconnecting)){
    if(!localMicPermissionReady)void preflightMicrophone(call);
    void syncCanonical(call);
    return true;
  }
  if(!online())return false;

  await leave({reason:'switch-call',intentional:true});
  const localGeneration=++generation;
  roomCallId=callId;
  latestCanonicalCall=call;
  joining=true;
  intentionalLeave=false;
  lastError=null;
  emit('joining');

  try{
    const [sdk,token]=await Promise.all([loadSdk(),tokenFor(call)]);
    if(localGeneration!==generation)return false;
    const next=new sdk.Room({adaptiveStream:false,dynacast:false});
    room=next;
    bindRoomEvents(next,sdk,localGeneration);
    await next.connect(String(token.serverUrl),String(token.participantToken),{
      autoSubscribe:true,maxRetries:2,websocketTimeout:10000,peerConnectionTimeout:12000
    });
    if(localGeneration!==generation||next!==room)return false;
    connected=true;
    reconnecting=false;
    joining=false;
    emit('joined-muted');

    // Permission/device health is checked while still muted. The temporary
    // getUserMedia track is stopped immediately; LiveKit microphone publish
    // only happens after Supabase confirms BOTH sides passed this check.
    await preflightMicrophone(call);
    if(localGeneration!==generation||next!==room)return false;
    await syncCanonical(latestCanonicalCall||call);
    return true;
  }catch(error){
    if(localGeneration!==generation)return false;
    lastError=String(error?.message||error||'livekit_join_failed');
    joining=false;
    emit('join-error');
    await leave({reason:'join-error',intentional:true});
    // Join failure is not treated as an immediate CALL_END. Canonical recovery
    // remains authoritative; a later online/realtime recovery may rejoin.
    void callEngine()?.mediaDegraded?.('media-join-failed');
    return false;
  }
}

async function quiet({reason='quiet'}={}){
  const current=room;
  if(!current)return false;
  try{await current.localParticipant?.setMicrophoneEnabled?.(false);}catch{}
  localMicPublished=false;
  active=false;
  emit(reason);
  return true;
}

async function leave({reason='leave',intentional=true}={}){
  const old=room;
  const oldCallId=roomCallId;
  generation+=1;
  intentionalLeave=Boolean(intentional);
  room=null;
  roomCallId='';
  resetFlags();
  cleanupAudio();
  if(old){
    try{await old.localParticipant?.setMicrophoneEnabled?.(false);}catch{}
    try{await old.disconnect?.();}catch{}
  }
  emit(reason);
  intentionalLeave=false;
  return Boolean(old||oldCallId);
}

function isJoinedCall(callId){
  return Boolean(room&&String(roomCallId)===String(callId||''));
}

function isMediaHealthy(callId){
  return Boolean(
    room&&String(roomCallId)===String(callId||'')&&connected&&!reconnecting&&
    localMicPublished&&remoteAudioSubscribed&&remotePlaybackReady&&remoteParticipantCount()>0
  );
}

function snapshot(){
  return{
    version:VERSION,
    callId:roomCallId||null,
    joining,connected,reconnecting,
    localMicPermissionReady,micReadySubmitted,localMicPublished,
    remoteAudioSubscribed,remotePlaybackReady,
    active,mediaReadySubmitted,
    remoteParticipants:remoteParticipantCount(),
    lastReason,lastError,
    sdkLoaded:Boolean(window.LivekitClient?.Room)
  };
}

window.addEventListener('offline',()=>{
  if(!roomCallId)return;
  reconnecting=true;
  clearPeerLossTimer();
  markDegraded('network-offline-reconnecting');
});
window.addEventListener('online',()=>{
  if(!roomCallId)return;
  emit('network-online');
  void callEngine()?.recover?.({reason:'network-online'});
});
document.addEventListener('v21-auth-state',event=>{
  if(event.detail?.state!=='AUTHENTICATED')void leave({reason:'auth-reset',intentional:true});
});

window.V21LiveKitSession=Object.freeze({
  version:VERSION,warm,ensureJoined,syncCanonical,quiet,leave,isJoinedCall,isMediaHealthy,snapshot
});
})();
