'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function runtimeErrorMessage(error){');
const end=source.indexOf("\nconst mobile=",start);
assert(start>=0&&end>start,'runtime error owner section must exist');
const classes=new Set(['hidden']);
const node={textContent:'',classList:{
  contains:name=>classes.has(name),
  add:name=>classes.add(name),
  remove:name=>classes.delete(name)
}};
const modeLabel={textContent:''};
const registered={};
let errorLogs=0,warningLogs=0;
const context=vm.createContext({
  runtimeError:node,modeLabel,viewport:{mode:'FOLLOW_TAIL'},
  console:{error(){errorLogs++;},warn(){warningLogs++;}},
  location:{href:'https://chat.taphoa.xyz/',origin:'https://chat.taphoa.xyz',protocol:'https:'},
  URL,
  window:{addEventListener(type,callback){registered[type]=callback;}}
});
vm.runInContext(source.slice(start,end)+
  String.fromCharCode(10)+'globalThis.__ctrl=AppBootController;globalThis.__rejection=isOwnedRuntimeRejectionEvent;',context);
const boot=context.__ctrl;
assert.equal(boot.phase,'BOOT');
registered.unhandledrejection({reason:{message:'Temporary network response'}});
assert.equal(boot.phase,'ERROR');
assert.equal(node.textContent,'V21.72.39 runtime: Temporary network response');
assert.equal(classes.has('hidden'),false);
assert.equal(errorLogs,1);
// Repeat same failure: no duplicate banner update/logging.
registered.unhandledrejection({reason:{message:'Temporary network response'}});
assert.equal(errorLogs,1,'same visible fault must not be logged again');
assert.equal(boot.ready(),true,'successful render invariant resolves boot phase');
assert.equal(boot.phase,'READY');
assert.equal(modeLabel.textContent,'FOLLOW_TAIL');
assert.equal(node.textContent,'');
assert.equal(classes.has('hidden'),true);
// Unexpected first-party promise failure AFTER READY must stay visible.
registered.unhandledrejection({reason:{message:'Critical first-party failure'}});
assert.equal(boot.phase,'ERROR');
assert.equal(classes.has('hidden'),false);
assert.equal(node.textContent,'V21.72.39 runtime: Critical first-party failure');
assert.equal(boot.ready(),false,'second ready must never clear post-ready faults');
assert.equal(classes.has('hidden'),false);
// Exact Zalo WebView rejected bridge is external, but other rejections survive.
const currentLogs=errorLogs;
registered.unhandledrejection({reason:{message:'ReferenceError: zaloJSV2 is not defined'}});
assert.equal(errorLogs,currentLogs,'Zalo injected error must not enter Chat runtime owner');
assert.equal(warningLogs,1);
registered.unhandledrejection({reason:{message:'ReferenceError: ownedChatVar is not defined'}});
assert.equal(errorLogs,currentLogs+1);
assert.equal(node.textContent,'V21.72.39 runtime: ReferenceError: ownedChatVar is not defined');
// A truly fatal BOOT invariant keeps the banner even if ready is invoked.
const fatalEvents={};
const fatalContext=vm.createContext({
  runtimeError:{textContent:'',classList:{
    hidden:false,
    contains(name){return this.hidden;},
    add(name){this.hidden=true;},
    remove(name){this.hidden=false;}
  }},
  modeLabel:{textContent:''},viewport:{mode:'FOLLOW_TAIL'},
  console:{error(){},warn(){}},window:{addEventListener(type,callback){fatalEvents[type]=callback;}},
  location:{href:'https://chat.taphoa.xyz/',origin:'https://chat.taphoa.xyz',protocol:'https:'},URL
});
vm.runInContext(source.slice(start,end)+
  String.fromCharCode(10)+'globalThis.__ctrl=AppBootController;',fatalContext);
fatalEvents.error({message:'ReferenceError: first-party boot crash',error:{message:'first-party boot crash'},filename:'https://chat.taphoa.xyz/app.js'});
assert.equal(fatalContext.__ctrl.fatalBootError,true,'first-party synchronous startup errors are fatal');
assert.equal(fatalContext.__ctrl.ready(),false);
assert.equal(fatalContext.__ctrl.phase,'ERROR');
assert.equal(fatalContext.runtimeError.classList.hidden,false);
assert(source.includes('{fatal:true}'),'boot invariant call must pass fatal ownership');
console.log('CHAT runtime banner: recovered boot / fatal boot / post-ready / Zalo rejection / dedupe PASS');
