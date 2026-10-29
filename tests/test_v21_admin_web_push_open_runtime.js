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
  let contactReady=false;
  let directory=[];
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
    NavigationCommand:{openContact(id){if(!contactReady)return false;openCalls.push(String(id));return true}},
    snapshot(){return{route:'chat',activeContact:{id:openCalls.at(-1)||''}}}
  };
  const sync={snapshot(){return{currentConversationId:'conv-current',currentContactId:openCalls.at(-1)||''}}};
  const windowObj={
    V21AuthSessionStore:authStore,
    ChatAppShell:shell,
    V21SyncEngine:sync,
    V21ContactStore:{snapshot:()=>directory},
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
  return{
    api:ctx.window.V21AdminPush,documentListeners,windowListeners,swListeners,swMessages,openCalls,historyCalls,
    setContactReady(value){contactReady=Boolean(value)},
    setDirectory(rows){directory=rows}
  };
}

(async()=>{
  const h=harness();
  assert.equal(h.openCalls.length,0,'cold-open must wait until canonical contact store is ready');
  assert(h.api.snapshot().pendingOpen,'cold-open target must remain pending');
  h.setDirectory([{id:'cold-1',conversation_id:'conv-cold'}]);
  h.setContactReady(true);
  h.documentListeners['v21-contact-store-change']({detail:{reason:'replace'}});
  await Promise.resolve();
  assert.equal(h.openCalls[0],'cold-1','contact-store ready event must retry canonical route');
  assert(h.historyCalls.length>=1,'cold-open query must be removed after routing');

  h.setDirectory([{id:'live-2',conversation_id:'conv-2'},{id:'live-3',conversation_id:'conv-3'}]);
  const opened=await h.api.handleOpen({contactId:'live-2',conversationId:'conv-2'});
  assert.equal(opened,true);
  assert.equal(h.openCalls.at(-1),'live-2');

  h.swListeners.message({data:{type:'ADMIN_PUSH_OPEN',contactId:'live-3',conversationId:'conv-3'}});
  await Promise.resolve();
  assert.equal(h.openCalls.at(-1),'live-3','existing-window SW click must use same open handler');

  // Some iOS/Android payloads contain conversation_id but no contact_id.
  // Resolve the canonical customer after directory hydration, without
  // switching to another or the previously viewed conversation.
  h.setDirectory([{id:'customer-from-conv',conversation_id:'conv-only'}]);
  const resolved=await h.api.handleOpen({conversationId:'conv-only'});
  assert.equal(resolved,true,'conversation-only PWA notification must open');
  assert.equal(h.openCalls.at(-1),'customer-from-conv');

  // A stale contact hint can still exist, but it must never override the
  // conversation's canonical owner (or the user's previous open thread).
  h.setDirectory([
    {id:'existing-but-wrong',conversation_id:'conv-other'},
    {id:'actual-owner',conversation_id:'conv-target'}
  ]);
  const corrected=await h.api.handleOpen({
    contactId:'existing-but-wrong',conversationId:'conv-target'
  });
  assert.equal(corrected,true);
  assert.equal(h.openCalls.at(-1),'actual-owner','canonical conversation overrides stale existing hint');

  h.setDirectory([{id:'existing-but-wrong',conversation_id:'conv-other'}]);
  const held=await h.api.handleOpen({contactId:'existing-but-wrong',conversationId:'conv-not-loaded'});
  assert.equal(held,false,'unknown canonical conversation must stay pending, not open a wrong contact');
  assert.equal(h.openCalls.at(-1),'actual-owner');
  assert.equal(h.api.snapshot().pendingOpen.conversationId,'conv-not-loaded');
  h.setDirectory([
    {id:'existing-but-wrong',conversation_id:'conv-other'},
    {id:'deleted-owner',conversation_id:'conv-not-loaded',deleted_at:'2026-01-01'}
  ]);
  h.documentListeners['v21-contact-store-change']({detail:{reason:'replace'}});
  await Promise.resolve();
  assert.equal(h.openCalls.at(-1),'actual-owner','deleted contact cannot satisfy push route');
  h.setDirectory([{id:'loaded-owner',conversation_id:'conv-not-loaded'}]);
  h.documentListeners['v21-contact-store-change']({detail:{reason:'replace'}});
  await Promise.resolve();
  assert.equal(h.openCalls.at(-1),'loaded-owner','pending route opens only after valid contact hydration');
  h.setDirectory([]);
  const pending=await h.api.handleOpen({conversationId:'conv-late'});
  assert.equal(pending,false,'missing customer remains pending during cold hydration');
  h.setDirectory([{id:'customer-late',conversation_id:'conv-late'}]);
  h.documentListeners['v21-contact-store-change']({detail:{reason:'replace'}});
  await Promise.resolve();
  assert.equal(h.openCalls.at(-1),'customer-late','deferred push resolves when contacts load');

  h.documentListeners['v21-auth-state']({detail:{state:'GUEST',account:null}});
  assert.equal(h.swMessages.at(-1).type,'ADMIN_PUSH_CLEAR','logout must clear SW foreground suppression state');

  h.documentListeners.visibilitychange();
  h.windowListeners.focus();
  assert(h.swMessages.some(message=>message.type==='ADMIN_PUSH_STATE'),'foreground state must stay synchronized');

  console.log('admin web push open route runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
