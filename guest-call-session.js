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
const remoteAudio=new Set();

function snapshot(){
  return {state,error:lastError,connected};
}

function cleanupRemoteAudio(){
  for(const el of remoteAudio){
    try{el.pause?.();}catch{}
    try{el.remove?.();}catch{}
  }
  remoteAudio.clear();
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

function attachRemoteTrack(track,nextRoom){
  try{
    const el=track?.attach?.();
    if(!el)return;
    el.autoplay=true;
    el.playsInline=true;
    el.style.position='fixed';
    el.style.width='1px';
    el.style.height='1px';
    el.style.opacity='0';
    el.style.pointerEvents='none';
    document.body?.appendChild?.(el);
    remoteAudio.add(el);
    try{nextRoom?.startAudio?.();}catch{}
    const play=el.play?.();
    if(play&&typeof play.catch==='function')play.catch(()=>{});
  }catch{}
}

async function connectWithToken(sdk,tokenData){
  if(!tokenData?.serverUrl||!tokenData?.participantToken)throw new Error('livekit_token_failed');
  const next=new sdk.Room();
  const disconnectedEvent=sdk.RoomEvent?.Disconnected||'disconnected';
  const trackSubscribedEvent=sdk.RoomEvent?.TrackSubscribed||'trackSubscribed';
  next.on?.(trackSubscribedEvent,(track)=>{
    if(track?.kind==='audio'||track?.kind===sdk.Track?.Kind?.Audio)attachRemoteTrack(track,next);
  });
  next.on?.(disconnectedEvent,()=>{
    if(next!==room)return;
    connected=false;
    state='disconnected';
    cleanupRemoteAudio();
  });
  await next.connect(String(tokenData.serverUrl),String(tokenData.participantToken));
  room=next;
  await next.localParticipant?.setMicrophoneEnabled?.(true,{
    echoCancellation:true,
    noiseSuppression:true,
    autoGainControl:true,
    channelCount:1,
  });
  connected=true;
  state='connected';
  return true;
}

function failJoin(error){
  lastError=String(error?.code||error?.name||error?.message||error||'call_join_failed');
  state='error';
  connected=false;
  const current=room;
  room=null;
  try{current?.disconnect?.();}catch{}
  cleanupRemoteAudio();
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
    return false;
  }

  activeKey=normalizedKey;
  activeEndpoint=normalizedEndpoint;
  activeApiKey=String(apiKey||'').trim();
  state='joining';
  lastError=null;

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
    return false;
  }

  state='joining';
  lastError=null;
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
  state=reason==='ended'?'ended':'idle';
  lastError=null;
  if(current){
    try{await current.localParticipant?.setMicrophoneEnabled?.(false);}catch{}
    try{await current.disconnect?.();}catch{}
  }
  cleanupRemoteAudio();
}

window.TaphoaGuestCallSession={joinGuest,joinAdmin,leave,snapshot};
})();
