const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','app-update-controller.js'),'utf8');
const listeners={};
const editor={value:'draft'};
const tray={childElementCount:0};
const reply={hidden:true};
const document={
  readyState:'loading',visibilityState:'visible',documentElement:{dataset:{}},
  querySelector(sel){return sel==='meta[name="app-release-version"]'?{content:'V21.72.16'}:null},
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
let reloads=0;
const ctx={
  window:windowObj,document,navigator:{serviceWorker},
  location:{protocol:'https:',hostname:'chat.taphoa.xyz',reload(){reloads++}},
  sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v))},
  fetch:async()=>({ok:true,json:async()=>({version:'V21.72.17'})}),
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
  CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},
  console,Date,String,Number,Boolean,Object,Array,Map,Set,Promise
};
vm.createContext(ctx);vm.runInContext(code,ctx);
const controller=ctx.window.V21AppUpdateController;assert(controller);
(async()=>{
  await controller.check({reason:'draft'});
  assert.strictEqual(reloads,0,'draft must defer reload');
  editor.value='';
  ctx.window.V21SyncEngine.snapshot=()=>({syncing:true,wakePending:false});
  await controller.check({reason:'syncing'});
  assert.strictEqual(reloads,0,'active sync must defer reload');
  ctx.window.V21SyncEngine.snapshot=()=>({syncing:false,wakePending:false});
  await controller.check({reason:'safe'});
  assert.strictEqual(reloads,1,'safe session must auto reload without F5');
  console.log('V21.72.16 app update runtime PASS');
})().catch(e=>{console.error(e);process.exit(1)});
