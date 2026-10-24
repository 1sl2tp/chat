'use strict';
// UI-208: An authenticated PWA should receive a safe manual update action
// instead of silently being trapped on the previous release indefinitely.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','app-update-controller.js'),'utf8');
const listeners={};
const editor={value:'',tagName:'TEXTAREA'};
const tray={childElementCount:0};
const reply={hidden:true};
let activeCall=false;
const body={children:[],appendChild(node){node.isConnected=true;this.children.push(node)}};
function node(tag){
 return{tagName:tag.toUpperCase(),children:[],handlers:{},style:{},isConnected:false,
  textContent:'',id:'',type:'',setAttribute(k,v){this[k]=v},
  append(...items){this.children.push(...items)},
  addEventListener(type,fn){this.handlers[type]=fn},
  click(){this.handlers.click?.()},
  remove(){this.isConnected=false},
 };
}
const document={
 readyState:'loading',visibilityState:'visible',documentElement:{dataset:{}},
 activeElement:null,body,createElement:node,
 querySelector(sel){
  if(sel==='meta[name="app-release-version"]')return{content:'V21.72.39'};
  if(sel==='meta[name="app-build-id"]')return{content:'older-build'};
  if(sel.includes('data-call-ui-state'))return activeCall?{}:null;
  return null;
 },
 getElementById(id){return id==='editor'?editor:id==='attachmentTray'?tray:
  id==='replyContext'?reply:id==='appShell'?{dataset:{authState:'authenticated'}}:null},
 addEventListener(type,fn){listeners['doc:'+type]=fn},dispatchEvent(){return true}
};
let replaced='',reloadCount=0;
const location={
 protocol:'https:',hostname:'chat.taphoa.xyz',href:'https://chat.taphoa.xyz/',
 replace(url){replaced=url;reloadCount++;}
};
const windowObj={
 ChatAppShell:{snapshot:()=>({authState:'AUTHENTICATED',route:'chat'})},
 V21InteractionController:{snapshot:()=>({mode:'NONE'})},
 V21AudioCapturePolicy:{active:()=>({mode:'idle'})},
 V21SyncEngine:{snapshot:()=>({syncing:false,wakePending:false})},
 addEventListener(type,fn){listeners['window:'+type]=fn},
};
const navigator={serviceWorker:{addEventListener(){},register:async()=>null}};
const storage=new Map();
const ctx={
 window:windowObj,document,navigator,location,URL,
 sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,v)=>storage.set(key,v)},
 fetch:async()=>({ok:true,json:async()=>({version:'V21.72.39',build_id:'new-build'})}),
 setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
 CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},
 Date,String,Number,Object,Boolean,Promise,Array,Map,Set,console
};
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
 const api=windowObj.V21AppUpdateController;
 await api.check({reason:'mobile-pwa-open'});
 assert.equal(reloadCount,0,'must not interrupt an authenticated reader automatically');
 assert.equal(body.children.length,1,'show one upgrade notice to authenticated PWA');
 const banner=body.children[0];
 assert.equal(banner.id,'chatUpdateNotice');
 const button=banner.children[1];
 assert.equal(button.textContent,'Cập nhật');
 editor.value='Bản nháp chưa gửi';
 button.click();
 assert.equal(reloadCount,0,'button must preserve unfinished text');
 assert.match(banner.children[0].textContent,/tin nháp/);
 editor.value='';
 activeCall=true;button.click();
 assert.equal(reloadCount,0,'button must preserve an active call');
 activeCall=false;
 button.click();
 assert.equal(reloadCount,1,'explicit tap with no draft/call should update');
 assert(replaced.includes('__build=new-build'),'update must bypass stale old-SW cached navigation');
 console.log('UI-208 opt-in update: authenticated PWA, draft guard, call guard, new build PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
