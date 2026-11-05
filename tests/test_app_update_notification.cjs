const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app-update-controller.js'),'utf8');
function setup(responder){
 const events=[];const appended=[];const listeners={};let fetchCalls=0;
 const elements={appShell:{dataset:{authState:'authenticated'}}};
 const document={readyState:'loading',body:{appendChild(el){el.isConnected=true;appended.push(el);}},documentElement:{dataset:{}},visibilityState:'visible',hidden:false,
  querySelector(sel){if(sel==='meta[name="app-release-version"]')return {content:'V21.72.39'};if(sel==='meta[name="app-build-id"]')return {content:'old-build'};return null;},
  getElementById(id){return elements[id]||null;},createElement(tag){return {tagName:tag,isConnected:false,setAttribute(){},addEventListener(){},append(){},remove(){this.isConnected=false;}};},
  addEventListener(name,callback){listeners[name]=callback;},dispatchEvent(event){events.push(event.detail);}};
 const context={document,window:{ChatAppShell:{snapshot(){return {authState:'AUTHENTICATED'};}},addEventListener(){}},
  navigator:{},location:{protocol:'https:',hostname:'chat.taphoa.xyz',href:'https://chat.taphoa.xyz/',replace(){}},
  fetch:async()=>{fetchCalls++;return responder();},CustomEvent:class{constructor(name,opts){this.detail=opts.detail;}},
  URL,Date,sessionStorage:{getItem(){return null;},setItem(){}},setTimeout(){return 1;},setInterval(){},console};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,document,events,appended,listeners,get calls(){return fetchCalls;},controller:context.window.V21AppUpdateController};
}
test('new build shows update notice for authenticated web/PWA session',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({version:'V21.72.40',build_id:'new-build'})}));
 assert.equal(await h.controller.check(),true);
 assert.equal(h.controller.snapshot().pendingBuild,'new-build');
 assert.equal(h.document.documentElement.dataset.appUpdatePending,'new-build');
 assert.ok(h.events.some(e=>e.reason==='update-found'));
 assert.equal(h.appended.length,1,'authenticated session must receive a visible update notice');
 assert.equal(h.appended[0].id,'chatUpdateNotice');
 assert.equal(h.appended[0].isConnected,true);
});
test('HTTP errors emit diagnostics instead of silently claiming current',async()=>{
 const h=setup(()=>({ok:false,status:503}));
 assert.equal(await h.controller.check(),false);
 assert.ok(h.events.some(e=>e.reason==='check-failed'&&e.message==='version_http_503'));
});
test('missing build id emits diagnostic',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({version:''})}));
 assert.equal(await h.controller.check(),false);
 assert.ok(h.events.some(e=>e.reason==='check-failed'&&e.message==='version_missing_build_id'));
});
test('superseded pending update clears its prompt',async()=>{
 let next='new-build';const h=setup(()=>({ok:true,json:async()=>({build_id:next})}));
 assert.equal(await h.controller.check(),true);
 next='old-build';
 assert.equal(await h.controller.check(),false);
 assert.equal(h.controller.snapshot().pendingBuild,'');
 assert.equal(h.document.documentElement.dataset.appUpdatePending,undefined);
});

test('startup checks manifest without waiting for stalled iOS service worker registration',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({build_id:'new-build'})}));
 h.context.navigator.serviceWorker={register:()=>new Promise(()=>{}),addEventListener(){}};
 h.listeners.DOMContentLoaded();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls,1,'manifest request must not be blocked by SW registration');
 assert.equal(h.controller.snapshot().pendingBuild,'new-build');
 assert.equal(h.appended.length,1,'visible update notice must be mounted');
});

test('foreground version check is not blocked by a stalled registered worker update',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({build_id:'new-build'})}));
 h.context.navigator.serviceWorker={
   register:async()=>({update:()=>new Promise(()=>{}),addEventListener(){},waiting:null}),
   addEventListener(){}
 };
 h.listeners.DOMContentLoaded();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls,1,'manifest fetch should start without waiting for worker');
 assert.equal(h.controller.snapshot().pendingBuild,'new-build');
 assert.equal(h.appended.length,1);
 assert.equal(await h.controller.check({reason:'focus'}),true,'subsequent checks should not hang');
});
