'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
const platform=fs.readFileSync(path.join(root,'shell-form-viewport-policy.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

// P0 owns page-level zoom, not message/media/keyboard components.
assert.match(html,/<meta name="viewport"[^>]*maximum-scale=1,user-scalable=no/);
assert.match(html,/:root\\[data-chat-standalone="true"\\] #appShell\\s*\\{\\s*touch-action:pan-x pan-y;/);
assert.match(sw,/pwa-chat-viewport-lock-20261102/);
assert.match(html,/id="globalOverlayRoot"/);
assert.match(html,/\\.image-review-main\\s*\\{[^}]*touch-action:none/s);

const start=platform.indexOf('function standaloneShellRuntime(){');
const end=platform.indexOf('const vv=window.visualViewport||null;',start);
assert(start>=0&&end>start);
const guard=platform.slice(start,end);

function initialize({displayMode=false,iosStandalone=false}={}){
  const handlers=new Map();
  let prevented=0;
  const app={};
  const viewer={};
  const shell={contains:target=>target===app};
  const document={
    documentElement:{dataset:{}},
    getElementById:id=>id==='appShell'?shell:null,
    addEventListener:(name,fn,options)=>handlers.set(name,{fn,options})
  };
  vm.runInNewContext(guard,{
    document,
    navigator:{standalone:iosStandalone},
    window:{matchMedia:()=>({matches:displayMode})}
  });
  function gesture(target,cancelable=true){
    const event={target,cancelable,preventDefault(){prevented++;}};
    for(const {fn} of handlers.values())fn(event);
    return prevented;
  }
  return{handlers,document,gesture,app,viewer};
}

const browser=initialize();
assert.equal(browser.handlers.size,0,'browser tab retains page zoom');
assert.equal(browser.document.documentElement.dataset.chatStandalone,undefined);

for(const options of [{displayMode:true},{iosStandalone:true}]){
  const pwa=initialize(options);
  assert.equal(pwa.document.documentElement.dataset.chatStandalone,'true');
  assert.deepEqual([...pwa.handlers.keys()],['gesturestart','gesturechange']);
  for(const {options:listener} of pwa.handlers.values()){
    assert.equal(listener.passive,false);
    assert.equal(listener.capture,true);
  }
  assert.equal(pwa.gesture(pwa.app),2,'app shell may not page-pinch in iOS PWA');
  assert.equal(pwa.gesture(pwa.viewer),2,'separate image viewer retains gestures');
  assert.equal(pwa.gesture(pwa.app,false),2,'noncancelable native gestures are untouched');
}
console.log('CHAT standalone viewport zoom contract + image-viewer exception PASS');
