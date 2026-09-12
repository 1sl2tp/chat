import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath=new URL('../guest-call-session.js',import.meta.url);
const source=fs.existsSync(sourcePath)?fs.readFileSync(sourcePath,'utf8'):'';

let micRequests=0;
let disconnects=0;
let microphoneEnabled=0;
const fetchCalls=[];

class FakeRoom{
  constructor(){
    this.localParticipant={
      setMicrophoneEnabled:async enabled=>{
        if(enabled)microphoneEnabled+=1;
        return true;
      },
    };
  }
  on(){return this;}
  async connect(){return true;}
  async disconnect(){disconnects+=1;}
}

const window={
  LivekitClient:{Room:FakeRoom,RoomEvent:{Disconnected:'disconnected'}},
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
  fetchCalls.push({url:String(url),body});
  if(body.action==='join'){
    return {ok:true,json:async()=>({ok:true,serverUrl:'wss://example.livekit.cloud',participantToken:'guest-token'})};
  }
  if(body.action==='connected')return {ok:true,json:async()=>({ok:true})};
  throw new Error(`unexpected action ${body.action}`);
};
const document={
  head:{appendChild(){throw new Error('SDK must use preloaded test LiveKit');}},
  querySelector(){return null;},
  createElement(){throw new Error('SDK must use preloaded test LiveKit');},
};

const context=vm.createContext({window,navigator,fetch,document,console,setTimeout,clearTimeout,URL,Promise});
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
assert.equal(window.TaphoaGuestCallSession.snapshot().connected,true);

await window.TaphoaGuestCallSession.leave({reason:'test'});
assert.equal(disconnects,1,'leave disconnects LiveKit room');
assert.equal(window.TaphoaGuestCallSession.snapshot().connected,false);

console.log('guest call media session contract PASS');
