(()=>{
'use strict';

const SDK_URL='https://cdn.jsdelivr.net/npm/livekit-client@2.22.2/dist/livekit-client.umd.min.js';
let sdkPromise=null;
let room=null;
let connected=false;
let state='idle';
let lastError=null;
let activeKey='';
let activeEndpoint='';
let activeApiKey='';
let localMicPublished=false;
let remoteAudioSubscribed=false;
let remotePlaybackReady=false;
let mediaReady=false;
const remoteAudio=new Set();
const remoteTracks=new Set();
const remoteAttachments=new Map();

function snapshot(){
  return {
    state,
    error:lastError,
    connected,
    localMicPublished,
    remoteAudioSubscribed,
    remotePlaybackReady,
    mediaReady,
  };
}

function emit(reason='state'){
  mediaReady=Boolean(connected&&localMicPublished&&remoteAudioSubscribed&&remotePlaybackReady);
  if(connected)state=mediaReady?'active':'connected';
  try{
    if(typeof CustomEvent==='function'){
      document.dispatchEvent?.(new CustomEvent('taphoa-guest-call-session-state',{
        detail:{...snapshot(),reason:String(reason||'state')},
      }));
    }
  }catch{}
}

function removeAttachment(track){
  const el=remoteAttachments.get(track)||null;
  if(el){
    remoteAttachments.delete(track);
    remoteAudio.delete(el);
    try{el.pause?.();}catch{}
    try{el.remove?.();}catch{}
  }
  try{
    for(const detached of track?.detach?.()||[]){
      remoteAudio.delete(detached);
      try{detached.pause?.();}catch{}
      try{detached.remove?.();}catch{}
    }
  }catch{}
}

function cleanupRemoteAudio({clearTracks=true}={}){
  for(const el of remoteAudio){
    try{el.pause?.();}catch{}
    try{el.remove?.();}catch{}
  }
  remoteAudio.clear();
  remoteAttachments.clear();
  if(clearTracks)remoteTracks.clear();
  remoteAudioSubscribed=remoteTracks.size>0;
  remotePlaybackReady=false;
  mediaReady=false;
}

function loadSdk(){
  if(window.LivekitClient?.Room)return Promise.resolve(window.LivekitClient);
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector?.('script[data-taphoa-guest-livekit]');
    if(existing){
      existing.addEventListener('load',()=>window.LivekitClient?.Room?resolve(window.LivekitClient):reject(new Error('livekit_sdk_unavailable')),{once:true});
      existing.addEventListener('error',()=>reject(new Error('livekit_sdk_load_failed')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=SDK_URL;
    script.async=true;
    script.crossOrigin='anonymous';
    script.dataset.taphoaGuestLivekit='true';
    script.addEventListener('load',()=>window.LivekitClient?.Room?resolve(window.LivekitClient):reject(new Error('livekit_sdk_unavailable')),{once:true});
    script.addEventListener('error',()=>reject(new Error('livekit_sdk_load_failed')),{once:true});
    document.head.appendChild(script);
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}

async function jsonPost(endpoint,body,{apiKey='',accessToken=''}={}){
  const headers={'content-type':'application/json'};
  if(apiKey)headers.apikey=String(apiKey);
  if(accessToken)headers.authorization=`Bearer ${String(accessToken)}`;
  const response=await fetch(String(endpoint),{
    method:'POST',
    headers,
    body:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){
    const error=new Error(String(data?.error||`request_failed_${response.status||0}`));
    error.code=String(data?.error||'request_failed');
    throw error;
  }
  return data||{};
}

async function post(action,{key=activeKey,endpoint=activeEndpoint,apiKey=activeApiKey}={}){
  return jsonPost(endpoint,{action,key:String(key||'')},{apiKey});
}

async function preflightMicrophone(){
  if(!navigator?.mediaDevices?.getUserMedia)throw new Error('microphone_unavailable');
  const stream=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},
    video:false,
  });
  try{
    const tracks=stream?.getAudioTracks?.()||[];
    if(!tracks.some(track=>track&&track.readyState==='live'&&track.enabled!==false)){
      throw new Error('microphone_not_ready');
    }
    return true;
  }finally{
    try{for(const track of stream?.getTracks?.()||[])track.stop?.();}catch{}
  }
}

async function attachRemoteTrack(track,nextRoom){
  if(!track||nextRoom!==room)return false;
  remoteTracks.add(track);
  remoteAudioSubscribed=remoteTracks.size>0;
  let el=remoteAttachments.get(track)||null;
  try{
    if(!el||!el.isConnected){
      if(el){
        remoteAttachments.delete(track);
        remoteAudio.delete(el);
        try{el.remove?.();}catch{}
      }
      el=track.attach?.();
      if(!el)throw new Error('remote_audio_attach_failed');
      el.autoplay=true;
      el.playsInline=true;
      el.style.position='fixed';
      el.style.width='1px';
      el.style.height='1px';
      el.style.opacity='0';
      el.style.pointerEvents='none';
      document.body?.appendChild?.(el);
      remoteAttachments.set(track,el);
      remoteAudio.add(el);
    }
    const started=nextRoom.startAudio?.();
    if(started&&typeof started.then==='function')await started;
    const played=el.play?.();
    if(played&&typeof played.then==='function')await played;
    if(nextRoom!==room)return false;
    remotePlaybackReady=remoteAttachments.size>0;
    if(lastError==='remote_audio_playback_blocked')lastError=null;
    emit('remote-audio-playable');
    return true;
  }catch(error){
    if(el){
      remoteAttachments.delete(track);
      remoteAudio.delete(el);
      try{el.pause?.();}catch{}
      try{el.remove?.();}catch{}
    }
    remotePlaybackReady=remoteAttachments.size>0;
    lastError='remote_audio_playback_blocked';
    emit('remote-audio-blocked');
    return false;
  }
}

async function retryAudio(){
  const current=room;
  if(!current||!connected||remoteTracks.size===0)return false;
  let ok=false;
  for(const track of [...remoteTracks]){
    if(await attachRemoteTrack(track,current))ok=true;
  }
  emit(ok?'remote-audio-retry-ok':'remote-audio-retry-failed');
  return Boolean(ok&&mediaReady);
}

async function connectWithToken(sdk,tokenData){
  if(!tokenData?.serverUrl||!tokenData?.participantToken)throw new Error('livekit_token_failed');
  const next=new sdk.Room();
  room=next;
  cleanupRemoteAudio();
  localMicPublished=false;
  connected=false;
  const disconnectedEvent=sdk.RoomEvent?.Disconnected||'disconnected';
  const trackSubscribedEvent=sdk.RoomEvent?.TrackSubscribed||'trackSubscribed';
  const trackUnsubscribedEvent=sdk.RoomEvent?.TrackUnsubscribed||'trackUnsubscribed';
  next.on?.(trackSubscribedEvent,(track)=>{
    if(next!==room)return;
    if(track?.kind==='audio'||track?.kind===sdk.Track?.Kind?.Audio){
      remoteTracks.add(track);
      remoteAudioSubscribed=true;
      emit('remote-audio-subscribed');
      void attachRemoteTrack(track,next);
    }
  });
  next.on?.(trackUnsubscribedEvent,(track)=>{
    if(next!==room)return;
    if(track?.kind==='audio'||track?.kind===sdk.Track?.Kind?.Audio){
      removeAttachment(track);
      remoteTracks.delete(track);
      remoteAudioSubscribed=remoteTracks.size>0;
      remotePlaybackReady=remoteAttachments.size>0;
      emit('remote-audio-unsubscribed');
    }
  });
  next.on?.(disconnectedEvent,()=>{
    if(next!==room)return;
    connected=false;
    localMicPublished=false;
    state='disconnected';
    cleanupRemoteAudio();
    emit('disconnected');
  });
  await next.connect(String(tokenData.serverUrl),String(tokenData.participantToken));
  if(next!==room)throw new Error('livekit_room_replaced');
  connected=true;
  state='connected';
  emit('room-connected');
  await next.localParticipant?.setMicrophoneEnabled?.(true,{
    echoCancellation:true,
    noiseSuppression:true,
    autoGainControl:true,
    channelCount:1,
  });
  localMicPublished=Boolean(next.localParticipant?.isMicrophoneEnabled??true);
  if(!localMicPublished)throw new Error('microphone_publish_failed');
  emit('microphone-published');
  return true;
}

function failJoin(error){
  lastError=String(error?.code||error?.name||error?.message||error||'call_join_failed');
  state='error';
  connected=false;
  localMicPublished=false;
  const current=room;
  room=null;
  try{current?.disconnect?.();}catch{}
  cleanupRemoteAudio();
  emit('join-error');
  return false;
}

async function joinGuest({key,endpoint,apiKey=''}={}){
  if(connected)return true;
  if(state==='joining')return false;
  const normalizedKey=String(key||'').trim();
  const normalizedEndpoint=String(endpoint||'').trim();
  if(!normalizedKey||!normalizedEndpoint){
    state='error';
    lastError='invalid_invite';
    emit('invalid-invite');
    return false;
  }

  activeKey=normalizedKey;
  activeEndpoint=normalizedEndpoint;
  activeApiKey=String(apiKey||'').trim();
  state='joining';
  lastError=null;
  emit('joining');

  try{
    await preflightMicrophone();
    const [sdk,tokenData]=await Promise.all([
      loadSdk(),
      post('join',{key:activeKey,endpoint:activeEndpoint,apiKey:activeApiKey}),
    ]);
    await connectWithToken(sdk,tokenData);
    await post('connected',{key:activeKey,endpoint:activeEndpoint,apiKey:activeApiKey});
    return true;
  }catch(error){
    return failJoin(error);
  }
}

async function joinAdmin({inviteId,endpoint,apiKey='',accessToken=''}={}){
  if(connected)return true;
  if(state==='joining')return false;
  const normalizedInviteId=String(inviteId||'').trim();
  const normalizedEndpoint=String(endpoint||'').trim();
  const normalizedAccessToken=String(accessToken||'').trim();
  if(!normalizedInviteId||!normalizedEndpoint||!normalizedAccessToken){
    state='error';
    lastError='invalid_admin_invite';
    emit('invalid-admin-invite');
    return false;
  }

  state='joining';
  lastError=null;
  emit('joining');
  try{
    await preflightMicrophone();
    const [sdk,tokenData]=await Promise.all([
      loadSdk(),
      jsonPost(normalizedEndpoint,{action:'join',inviteId:normalizedInviteId},{apiKey,accessToken:normalizedAccessToken}),
    ]);
    await connectWithToken(sdk,tokenData);
    await jsonPost(normalizedEndpoint,{action:'connected',inviteId:normalizedInviteId},{apiKey,accessToken:normalizedAccessToken});
    return true;
  }catch(error){
    return failJoin(error);
  }
}

async function leave({reason='leave'}={}){
  const current=room;
  room=null;
  connected=false;
  localMicPublished=false;
  state=reason==='ended'?'ended':'idle';
  lastError=null;
  if(current){
    try{await current.localParticipant?.setMicrophoneEnabled?.(false);}catch{}
    try{await current.disconnect?.();}catch{}
  }
  cleanupRemoteAudio();
  emit(reason);
}

window.TaphoaGuestCallSession={joinGuest,joinAdmin,retryAudio,leave,snapshot};
})();
