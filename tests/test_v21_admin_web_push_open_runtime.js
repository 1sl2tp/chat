const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const file=path.join(__dirname,'..','admin-push-controller.js');
const code=fs.readFileSync(file,'utf8');

function harness(){
  const documentListeners={};
  const windowListeners={};
  const swListeners={};
  const swMessages=[];
  const openCalls=[];
  const historyCalls=[];
  const authStore={
    snapshot(){return{state:'AUTHENTICATED',account:{id:'admin-1',role:'admin'},deviceId:'device-1'}},
    getClient(){return{functions:{async invoke(){return{data:{ok:true,enabled:false},error:null}}}}}
  };
  const document={
    visibilityState:'visible',
    hasFocus:()=>true,
    addEventListener(type,fn){documentListeners[type]=fn},
  };
  const serviceWorker={
    controller:{postMessage(message){swMessages.push(message)}},
    ready:Promise.resolve({pushManager:{async getSubscription(){return null}}}),
    addEventListener(type,fn){swListeners[type]=fn},
  };
  const navigator={serviceWorker,userAgent:'Mozilla/5.0 Chrome/140',standalone:false};
  const Notification={permission:'granted',async requestPermission(){return'granted'}};
  const shell={
    NavigationCommand:{openContact(id){openCalls.push(String(id));return true}},
    snapshot(){return{route:'chat',activeContact:{id:openCalls.at(-1)||''}}}
  };
  const sync={snapshot(){return{currentConversationId:'conv-current',currentContactId:openCalls.at(-1)||''}}};
  const windowObj={
    V21AuthSessionStore:authStore,
    ChatAppShell:shell,
    V21SyncEngine:sync,
    addEventListener(type,fn){windowListeners[type]=fn},
    matchMedia:()=>({matches:false}),
  };
  const location={
    href:'https://chat.taphoa.xyz/?push_contact=cold-1&push_conversation=conv-cold',
    search:'?push_contact=cold-1&push_conversation=conv-cold',
  };
  const history={state:null,replaceState(...args){historyCalls.push(args)}};
  const ctx={window:windowObj,document,navigator,Notification,location,history,URL,URLSearchParams,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),String,Number,Boolean,Object,Array,Promise,console};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return{api:ctx.window.V21AdminPush,documentListeners,windowListeners,swListeners,swMessages,openCalls,historyCalls};
}

(async()=>{
  const h=harness();
  assert.equal(h.openCalls[0],'cold-1','cold-open query must route through canonical contact command');
  assert(h.historyCalls.length>=1,'cold-open query must be removed after routing');

  const opened=await h.api.handleOpen({contactId:'live-2',conversationId:'conv-2'});
  assert.equal(opened,true);
  assert.equal(h.openCalls.at(-1),'live-2');

  h.swListeners.message({data:{type:'ADMIN_PUSH_OPEN',contactId:'live-3',conversationId:'conv-3'}});
  assert.equal(h.openCalls.at(-1),'live-3','existing-window SW click must use same open handler');

  h.documentListeners['v21-auth-state']({detail:{state:'GUEST',account:null}});
  assert.equal(h.swMessages.at(-1).type,'ADMIN_PUSH_CLEAR','logout must clear SW foreground suppression state');

  h.documentListeners.visibilitychange();
  h.windowListeners.focus();
  assert(h.swMessages.some(message=>message.type==='ADMIN_PUSH_STATE'),'foreground state must stay synchronized');

  console.log('admin web push open route runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
