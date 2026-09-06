const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','audio-capture-policy.js'),'utf8');
const listeners={};
const constraintsSeen=[];
let stopped=0;
const makeTrack=(id='mic-1')=>({
  kind:'audio',readyState:'live',enabled:true,
  stop(){if(this.readyState==='ended')return;stopped++;this.readyState='ended';},
  getSettings(){return{deviceId:id,channelCount:1}},
  addEventListener(type,fn){this['on_'+type]=fn}
});
const makeStream=(id='mic-1')=>{
  const primary=makeTrack(id);
  const duplicate=makeTrack(id+'-duplicate');
  return{
    primary,duplicate,
    getAudioTracks(){return[primary,duplicate]},
    getTracks(){return[primary,duplicate]}
  };
};
const localStorage={data:new Map(),getItem(k){return this.data.get(k)||null},setItem(k,v){this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}};
let deviceList=[{kind:'audioinput',deviceId:'mic-1',label:'Built-in Mic'}];
const mediaDevices={
  async getUserMedia(c){constraintsSeen.push(c);return makeStream('mic-1')},
  async enumerateDevices(){return deviceList},
  addEventListener(type,fn){listeners[type]=fn}
};
const events=[];
const document={dispatchEvent(e){events.push(e);return true}};
class CE{constructor(type,init={}){this.type=type;this.detail=init.detail}}
const ctx={window:null,navigator:{mediaDevices},document,CustomEvent:CE,localStorage,Map,Set,String,Number,Boolean,Object,Array,Date,Math,Promise,Error,DOMException};
ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(code,ctx);
const p=ctx.V21AudioCapturePolicy;assert(p);
(async()=>{
  const stream=await p.acquire({owner:'recorder',purpose:'recording'});
  const audio=constraintsSeen[0].audio;
  assert.strictEqual(audio.echoCancellation,true);
  assert.strictEqual(audio.noiseSuppression,true);
  assert.strictEqual(audio.autoGainControl,true);
  assert.strictEqual(audio.channelCount,1);
  assert.strictEqual(p.active().owner,'recorder');
  let busy='';
  try{await p.acquire({owner:'call',purpose:'call'})}catch(e){busy=e.message}
  assert.strictEqual(busy,'audio_capture_busy');
  assert.strictEqual(p.preferredDeviceId(),'mic-1');
  assert.strictEqual(p.release(stream,{owner:'recorder'}),true);
  assert.strictEqual(stopped,2,'duplicate input track must be stopped and primary released once');
  deviceList=[{kind:'audioinput',deviceId:'',label:''}];
  await p.refreshDevices();
  assert.strictEqual(p.preferredDeviceId(),'mic-1','hidden pre-permission ids must not clear the pinned mic');
  deviceList=[{kind:'audioinput',deviceId:'mic-2',label:'USB Mic'}];
  await p.refreshDevices();
  assert.strictEqual(p.preferredDeviceId(),'','removed pinned mic must be released');
  assert.strictEqual(p.claimExternal({owner:'call:1'}),true);
  assert.strictEqual(p.claimExternal({owner:'call:2'}),false);
  assert.strictEqual(p.releaseExternal({owner:'call:1'}),true);
  assert.strictEqual(typeof listeners.devicechange,'function');
  console.log('V21.72.16 audio capture policy runtime PASS');
})().catch(e=>{console.error(e);process.exit(1)});
