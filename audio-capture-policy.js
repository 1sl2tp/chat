(()=>{
'use strict';

const RELEASE_VERSION='V21.72.23';
const MODULE_CONTRACT_VERSION='audio-capture-v1';
const DEVICE_KEY='taphoa.v21.audio.inputDeviceId';
const BASE=Object.freeze({
  echoCancellation:true,
  noiseSuppression:true,
  autoGainControl:true,
  channelCount:1
});

let activeStream=null;
let activeOwner='';
let externalOwner='';
let preferredDeviceIdValue=readPreferredDeviceId();
let inputDevices=[];
let refreshPromise=null;

function mediaDevices(){return navigator.mediaDevices||null;}
function readPreferredDeviceId(){
  try{return String(localStorage.getItem(DEVICE_KEY)||'');}catch{return'';}
}
function persistPreferredDeviceId(value){
  preferredDeviceIdValue=String(value||'');
  try{
    if(preferredDeviceIdValue)localStorage.setItem(DEVICE_KEY,preferredDeviceIdValue);
    else localStorage.removeItem(DEVICE_KEY);
  }catch{}
}
function emit(reason,detail={}){
  try{
    document.dispatchEvent(new CustomEvent('v21-audio-capture-state',{
      detail:{...snapshot(),reason:String(reason||'change'),...detail}
    }));
  }catch{}
}
function constraints({pinDevice=true}={}){
  const audio={...BASE};
  if(pinDevice&&preferredDeviceIdValue)audio.deviceId={exact:preferredDeviceIdValue};
  return audio;
}
function liveKitOptions(){
  const options={...BASE};
  if(preferredDeviceIdValue)options.deviceId=preferredDeviceIdValue;
  return options;
}
function tracks(stream){
  return Array.from(stream?.getAudioTracks?.()||stream?.getTracks?.()||[])
    .filter(track=>track?.kind==='audio'||typeof track?.kind==='undefined');
}
function stopStream(stream){
  for(const track of Array.from(stream?.getTracks?.()||[])){
    try{track.stop?.();}catch{}
  }
}
function rememberTrackDevice(track){
  const id=String(track?.getSettings?.()?.deviceId||'');
  if(id&&id!==preferredDeviceIdValue){
    persistPreferredDeviceId(id);
    emit('device-pinned',{deviceId:id});
  }
}
function isPinnedDeviceFailure(error){
  const name=String(error?.name||'');
  return ['OverconstrainedError','NotFoundError','DevicesNotFoundError'].includes(name);
}
function normalizeSingleTrack(stream){
  const audioTracks=tracks(stream).filter(track=>track?.readyState!=='ended');
  if(!audioTracks.length){
    stopStream(stream);
    throw new Error('microphone_not_ready');
  }
  const primary=audioTracks[0];
  for(const duplicate of audioTracks.slice(1)){
    try{duplicate.stop?.();}catch{}
  }
  return primary;
}
async function acquire({owner,purpose='default'}={}){
  const captureOwner=String(owner||'').trim();
  if(!captureOwner)throw new Error('audio_capture_owner_required');
  if(activeStream){
    if(activeOwner===captureOwner)return activeStream;
    throw new Error('audio_capture_busy');
  }
  if(externalOwner)throw new Error('audio_capture_busy');
  const devices=mediaDevices();
  if(!devices?.getUserMedia)throw new Error('microphone_unavailable');

  let stream=null;
  try{
    try{
      stream=await devices.getUserMedia({audio:constraints({pinDevice:true})});
    }catch(error){
      if(!preferredDeviceIdValue||!isPinnedDeviceFailure(error))throw error;
      persistPreferredDeviceId('');
      emit('pinned-device-unavailable');
      stream=await devices.getUserMedia({audio:constraints({pinDevice:false})});
    }

    if(activeStream||externalOwner){
      stopStream(stream);
      throw new Error('audio_capture_busy');
    }
    const primary=normalizeSingleTrack(stream);
    activeStream=stream;
    activeOwner=captureOwner;
    rememberTrackDevice(primary);
    try{
      primary.addEventListener?.('ended',()=>{
        if(activeStream!==stream)return;
        activeStream=null;
        activeOwner='';
        emit('track-ended',{purpose:String(purpose||'default')});
      },{once:true});
    }catch{}
    emit('acquired',{purpose:String(purpose||'default')});
    return stream;
  }catch(error){
    if(stream&&stream!==activeStream)stopStream(stream);
    throw error;
  }
}
function release(stream,{owner=''}={}){
  if(!stream)return false;
  const expectedOwner=String(owner||'');
  if(stream===activeStream&&expectedOwner&&expectedOwner!==activeOwner)return false;
  stopStream(stream);
  if(stream===activeStream){
    const releasedOwner=activeOwner;
    activeStream=null;
    activeOwner='';
    emit('released',{owner:releasedOwner});
  }
  return true;
}
function claimExternal({owner}={}){
  const value=String(owner||'').trim();
  if(!value)return false;
  if(activeStream)return false;
  if(externalOwner&&externalOwner!==value)return false;
  externalOwner=value;
  emit('external-claimed');
  return true;
}
function releaseExternal({owner}={}){
  const value=String(owner||'').trim();
  if(!externalOwner)return false;
  if(value&&value!==externalOwner)return false;
  const releasedOwner=externalOwner;
  externalOwner='';
  emit('external-released',{owner:releasedOwner});
  return true;
}
async function refreshDevices(){
  if(refreshPromise)return refreshPromise;
  const devices=mediaDevices();
  if(!devices?.enumerateDevices)return[];
  refreshPromise=(async()=>{
    const all=await devices.enumerateDevices();
    inputDevices=Array.from(all||[]).filter(device=>device?.kind==='audioinput');
    const knownDeviceIds=inputDevices
      .map(device=>String(device.deviceId||''))
      .filter(Boolean);
    if(
      preferredDeviceIdValue &&
      knownDeviceIds.length>0 &&
      !knownDeviceIds.includes(preferredDeviceIdValue)
    ){
      persistPreferredDeviceId('');
      emit('preferred-device-removed');
    }else{
      emit('devices-refreshed');
    }
    return inputDevices.map(device=>({
      deviceId:String(device.deviceId||''),
      label:String(device.label||''),
      groupId:String(device.groupId||'')
    }));
  })().finally(()=>{refreshPromise=null;});
  return refreshPromise;
}
function preferredDeviceId(){return preferredDeviceIdValue;}
function snapshot(){
  return{
    version:RELEASE_VERSION,
    moduleContractVersion:MODULE_CONTRACT_VERSION,
    owner:activeOwner||externalOwner||null,
    mode:activeStream?'stream':(externalOwner?'external':'idle'),
    preferredDeviceId:preferredDeviceIdValue||null,
    inputCount:inputDevices.length,
    mixing:false,
    echoCancellation:true,
    noiseSuppression:true,
    autoGainControl:true,
    channelCount:1
  };
}

try{
  mediaDevices()?.addEventListener?.('devicechange',()=>{
    void refreshDevices().catch(()=>{});
  });
}catch{}
void refreshDevices().catch(()=>{});

window.V21AudioCapturePolicy=Object.freeze({
  version:RELEASE_VERSION,
  moduleContractVersion:MODULE_CONTRACT_VERSION,
  constraints,
  liveKitOptions,
  acquire,
  release,
  claimExternal,
  releaseExternal,
  refreshDevices,
  preferredDeviceId,
  active:snapshot
});
})();
