const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app-update-controller.js'),'utf8');
function setup(responder){
 const events=[];const appended=[];const listeners={};const timers=new Map();let timerId=0;let fetchCalls=0;
 const elements={appShell:{dataset:{authState:'authenticated'}}};
 const document={readyState:'loading',body:{appendChild(el){el.isConnected=true;appended.push(el);}},documentElement:{dataset:{}},visibilityState:'visible',hidden:false,
  querySelector(sel){if(sel==='meta[name="app-release-version"]')return {content:'V21.72.39'};if(sel==='meta[name="app-build-id"]')return {content:'old-build'};return null;},
  getElementById(id){return elements[id]||null;},createElement(tag){return {tagName:tag,isConnected:false,style:{cssText:''},setAttribute(){},addEventListener(){},append(){},remove(){this.isConnected=false;}};},
  addEventListener(name,callback){listeners[name]=callback;},dispatchEvent(event){events.push(event.detail);}};
 const context={document,window:{ChatAppShell:{snapshot(){return {authState:'AUTHENTICATED'};}},addEventListener(){}},
  navigator:{},location:{protocol:'https:',hostname:'chat.taphoa.xyz',href:'https://chat.taphoa.xyz/',replace(){}},
  fetch:async(url,options)=>{fetchCalls++;return responder(url,options);},CustomEvent:class{constructor(name,opts){this.detail=opts.detail;}},
  URL,Date,sessionStorage:{getItem(){return null;},setItem(){}},AbortController,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){},console};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,document,events,appended,listeners,timers,get calls(){return fetchCalls;},controller:context.window.V21AppUpdateController};
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
 assert.match(h.appended[0].style.cssText,/z-index:2147483647/);
 assert.match(h.appended[0].style.cssText,/position:fixed/);
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
test('version-only manifest cannot falsely announce an update',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({version:'V21.72.99'})}));
 assert.equal(await h.controller.check(),false);
 assert.equal(h.controller.snapshot().pendingBuild,'');
 assert.equal(h.appended.length,0);
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

test('service worker registration completes even when update promise never settles',async()=>{
 const h=setup(()=>({ok:true,json:async()=>({build_id:'new-build'})}));
 let registrationCalls=0;
 h.context.navigator.serviceWorker={
   register:async()=>{registrationCalls++;return {update:()=>new Promise(()=>{}),addEventListener(){},waiting:null};},
   addEventListener(){}
 };
 h.listeners.DOMContentLoaded();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(registrationCalls,1);
 assert.equal(h.controller.snapshot().serviceWorker,true,'registration must not wait for update() to settle');
 assert.equal(h.controller.snapshot().pendingBuild,'new-build');
});

for(const phase of ['headers','body']){
 test(`stalled manifest ${phase} times out, coalesces checks and recovers without stale results`,async()=>{
  let resolveStale, signal;
  const stalled=new Promise(resolve=>{resolveStale=resolve;});
  let attempt=0;
  const h=setup((url,options)=>{
   signal=options.signal;
   if(++attempt===1)return phase==='headers'?stalled:{ok:true,json:()=>stalled};
   return {ok:true,json:async()=>({build_id:'recovered-build'})};
  });
  const first=h.controller.check();
  const duplicate=h.controller.check({reason:'focus'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls,1,'concurrent lifecycle triggers must share one request');
  const deadline=[...h.timers.values()].find(timer=>timer.ms===10000);
  assert.ok(deadline,'manifest headers and body need a bounded deadline');
  deadline.fn();
  assert.equal(await first,false);
  assert.equal(await duplicate,false);
  assert.equal(signal.aborted,true,'cancel the obsolete network request');
  assert.equal(h.timers.size,0,'deadline must be released after failure');
  assert.equal(h.calls,1,'timeout must not start an immediate retry');
  assert.ok(h.events.some(e=>e.reason==='check-failed'&&e.message==='version_timeout'));
  assert.equal(await h.controller.check({reason:'online'}),true);
  assert.equal(h.calls,2);
  assert.equal(h.timers.size,0,'success must release its deadline too');
  resolveStale(phase==='headers'?{ok:true,json:async()=>({build_id:'stale-build'})}:{build_id:'stale-build'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.controller.snapshot().pendingBuild,'recovered-build');
  assert.equal(h.appended.length,1,'late response cannot publish a stale notice');
 });
}
