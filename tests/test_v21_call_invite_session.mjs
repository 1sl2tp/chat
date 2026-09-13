import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath=new URL('../guest-call-session.js',import.meta.url);
const source=fs.existsSync(sourcePath)?fs.readFileSync(sourcePath,'utf8'):'';

let micRequests=0;
let disconnects=0;
let microphoneEnabled=0;
let startAudioCalls=0;
let playCalls=0;
let playbackMode='ok';
const fetchCalls=[];
const roomInstances=[];
const stateEvents=[];

class FakeRoom{
  constructor(){
    this.handlers=new Map();
    this.remoteParticipants=new Map();
    this.localParticipant={
      isMicrophoneEnabled:false,
      setMicrophoneEnabled:async enabled=>{
        this.localParticipant.isMicrophoneEnabled=Boolean(enabled);
        if(enabled)microphoneEnabled+=1;
        return true;
      },
    };
    roomInstances.push(this);
  }
  on(event,handler){this.handlers.set(event,handler);return this;}
  async connect(){return true;}
  async disconnect(){disconnects+=1;}
  async startAudio(){
    startAudioCalls+=1;
    if(playbackMode==='start-fail')throw new Error('audio context blocked');
    return true;
  }
  emit(event,...args){return this.handlers.get(event)?.(...args);}
}

const window={
  LivekitClient:{
    Room:FakeRoom,
    RoomEvent:{Disconnected:'disconnected',TrackSubscribed:'trackSubscribed'},
    Track:{Kind:{Audio:'audio'}},
  },
};
const navigator={
  mediaDevices:{
    getUserMedia:async()=>{
      micRequests+=1;
      return {
        getTracks:()=>[{stop(){}}],
        getAudioTracks:()=>[{readyState:'live',enabled:true,stop(){}}],
      };
    },
  },
};
const fetch=async(url,options={})=>{
  const body=JSON.parse(String(options.body||'{}'));
  fetchCalls.push({url:String(url),body,headers:options.headers||{}});
  if(body.action==='join'){
    return {ok:true,json:async()=>({ok:true,serverUrl:'wss://example.livekit.cloud',participantToken:'invite-token'})};
  }
  if(body.action==='connected')return {ok:true,json:async()=>({ok:true})};
  throw new Error(`unexpected action ${body.action}`);
};
function makeAudioElement(){
  return {
    autoplay:false,
    playsInline:false,
    style:{},
    isConnected:false,
    async play(){
      playCalls+=1;
      if(playbackMode==='play-fail')throw new Error('NotAllowedError');
      return true;
    },
    pause(){},
    remove(){this.isConnected=false;},
  };
}
function makeRemoteAudioTrack(){
  return {
    kind:'audio',
    attach(){return makeAudioElement();},
  };
}
const document={
  head:{appendChild(){throw new Error('SDK must use preloaded test LiveKit');}},
  body:{appendChild(el){el.isConnected=true;}},
  querySelector(){return null;},
  createElement(){throw new Error('SDK must use preloaded test LiveKit');},
  dispatchEvent(event){stateEvents.push(event.detail||null);return true;},
};
class CustomEvent{
  constructor(type,{detail}={}){this.type=type;this.detail=detail;}
}

const context=vm.createContext({window,navigator,fetch,document,CustomEvent,console,setTimeout,clearTimeout,URL,Promise});
vm.runInContext(source,context,{filename:'guest-call-session.js'});

assert.ok(window.TaphoaGuestCallSession,'session API is exposed');
assert.equal(micRequests,0,'module load never asks for microphone');
assert.equal(fetchCalls.length,0,'module load never mints a token');

const joined=await window.TaphoaGuestCallSession.joinGuest({
  key:'opaque-key-abcdefghijklmnopqrstuvwxyz',
  endpoint:'https://example.supabase.co/functions/v1/v21-call-invite-guest',
  apiKey:'publishable-key',
});
assert.equal(joined,true);
assert.equal(micRequests,1,'explicit guest join asks for microphone once');
assert.equal(microphoneEnabled,1,'explicit guest join publishes microphone');
assert.deepEqual(fetchCalls.map(call=>call.body.action),['join','connected']);
let snapshot=window.TaphoaGuestCallSession.snapshot();
assert.equal(snapshot.connected,true);
assert.equal(snapshot.localMicPublished,true,'room connection alone must prove local microphone publication');
assert.equal(snapshot.remoteAudioSubscribed,false,'room connection is not yet two-way audio');
assert.equal(snapshot.remotePlaybackReady,false,'room connection is not yet speaker playback');
assert.equal(snapshot.mediaReady,false,'do not claim healthy media before remote audio plays');

roomInstances.at(-1).emit('trackSubscribed',makeRemoteAudioTrack());
await new Promise(resolve=>setTimeout(resolve,0));
await new Promise(resolve=>setTimeout(resolve,0));
snapshot=window.TaphoaGuestCallSession.snapshot();
assert.equal(startAudioCalls,1,'remote audio unlock is attempted');
assert.equal(playCalls,1,'attached remote audio is explicitly played');
assert.equal(snapshot.remoteAudioSubscribed,true);
assert.equal(snapshot.remotePlaybackReady,true);
assert.equal(snapshot.mediaReady,true,'two-way audio is healthy only after mic publish + remote playback');
assert.ok(stateEvents.some(detail=>detail?.mediaReady===true),'media-ready transition is observable by page/Admin UI');

await window.TaphoaGuestCallSession.leave({reason:'test'});
assert.equal(disconnects,1,'leave disconnects LiveKit room');
assert.equal(window.TaphoaGuestCallSession.snapshot().connected,false);

assert.equal(typeof window.TaphoaGuestCallSession.joinAdmin,'function','Admin join is an explicit sibling action');
playbackMode='play-fail';
const adminJoined=await window.TaphoaGuestCallSession.joinAdmin({
  inviteId:'123e4567-e89b-12d3-a456-426614174000',
  endpoint:'https://example.supabase.co/functions/v1/v21-call-invite-admin',
  apiKey:'publishable-key',
  accessToken:'admin-access-token',
});
assert.equal(adminJoined,true);
assert.equal(micRequests,2,'Admin mic is requested only by explicit joinAdmin');
assert.equal(microphoneEnabled,2,'Admin explicit join publishes microphone once');
const adminCalls=fetchCalls.slice(-2);
assert.deepEqual(adminCalls.map(call=>call.body.action),['join','connected']);
assert.equal(adminCalls[0].body.inviteId,'123e4567-e89b-12d3-a456-426614174000');
assert.equal(adminCalls[0].headers.authorization,'Bearer admin-access-token');

roomInstances.at(-1).emit('trackSubscribed',makeRemoteAudioTrack());
await new Promise(resolve=>setTimeout(resolve,0));
await new Promise(resolve=>setTimeout(resolve,0));
snapshot=window.TaphoaGuestCallSession.snapshot();
assert.equal(snapshot.connected,true,'LiveKit room can stay connected when speaker playback is blocked');
assert.equal(snapshot.localMicPublished,true);
assert.equal(snapshot.remoteAudioSubscribed,true);
assert.equal(snapshot.remotePlaybackReady,false,'speaker playback failure must be visible');
assert.equal(snapshot.mediaReady,false,'speaker playback failure must never be reported as a healthy call');
assert.equal(snapshot.error,'remote_audio_playback_blocked','speaker playback failure must not be swallowed');

await window.TaphoaGuestCallSession.leave({reason:'test-admin'});
assert.equal(disconnects,2,'Admin leave disconnects invite room');
assert.equal(window.TaphoaGuestCallSession.snapshot().connected,false);

console.log('guest/Admin invite two-way audio health contract PASS');
