const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','app-update-controller.js'),'utf8');
const listeners={};
const editor={value:'draft'};
const tray={childElementCount:0};
const reply={hidden:true};
const document={
  readyState:'loading',visibilityState:'visible',documentElement:{dataset:{}},
  querySelector(sel){
    if(sel==='meta[name="app-release-version"]')return {content:'V21.72.39'};
    if(sel==='meta[name="app-build-id"]')return {content:'build-a'};
    return null;
  },
  getElementById(id){return id==='editor'?editor:id==='attachmentTray'?tray:id==='replyContext'?reply:null},
  addEventListener(type,fn){listeners['d:'+type]=fn},
  dispatchEvent(){return true}
};
const windowObj={
  V21InteractionController:{snapshot:()=>({mode:'NONE'})},
  V21AudioCapturePolicy:{active:()=>({mode:'idle'})},
  V21SyncEngine:{snapshot:()=>({syncing:false,wakePending:false})},
  addEventListener(type,fn){listeners['w:'+type]=fn}
};
const serviceWorker={addEventListener(){},register:async()=>null};
const session=new Map();
let replaces=0,lastUrl='';
const ctx={
  window:windowObj,document,navigator:{serviceWorker},
  location:{
    protocol:'https:',hostname:'chat.taphoa.xyz',href:'https://chat.taphoa.xyz/',
    replace(url){replaces++;lastUrl=String(url)},reload(){throw new Error('reload fallback should not be used')}
  },
  URL,
  sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v))},
  fetch:async()=>({ok:true,json:async()=>({version:'V21.72.39',build_id:'build-b'})}),
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
  CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},
  console,Date,String,Number,Boolean,Object,Array,Map,Set,Promise
};
vm.createContext(ctx);vm.runInContext(code,ctx);
const controller=ctx.window.V21AppUpdateController;assert(controller);
(async()=>{
  assert.strictEqual(controller.currentBuild,'build-a');
  await controller.check({reason:'draft'});
  assert.strictEqual(replaces,0,'draft must defer reload');
  editor.value='';
  ctx.window.V21SyncEngine.snapshot=()=>({syncing:true,wakePending:false});
  await controller.check({reason:'syncing'});
  assert.strictEqual(replaces,0,'active sync must defer reload');
  ctx.window.V21SyncEngine.snapshot=()=>({syncing:false,wakePending:false});
  await controller.check({reason:'safe'});
  assert.strictEqual(replaces,1,'safe session must auto replace without F5');
  assert(lastUrl.includes('__build=build-b'),'reload URL must be keyed by the new build');
  console.log('V21.72.39 build-aware app update runtime PASS');
})().catch(e=>{console.error(e);process.exit(1)});
