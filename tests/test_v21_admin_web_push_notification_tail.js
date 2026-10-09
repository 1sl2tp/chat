// Notification click is a one-shot visual navigation intent, not a
// second canonical message/realtime owner. Run via Verify V21 test glob.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const script=fs.readFileSync(path.join(__dirname,'..','admin-push-controller.js'),'utf8');
function harness({cold=false}={}){
  const listeners=new Map(),raf=[],timers=new Map(),events=[];
  let idSeq=1,active='previous',messageContact='previous',allowed=!cold,resetCount=0;
  const root={scrollHeight:920,clientHeight:320,scrollTop:0,style:{visibility:''}};
  const notify=(type,event)=>{for(const cb of listeners.get(type)||[])cb(event)};
  const document={
    title:'TAPHOA Chat',visibilityState:'visible',hasFocus:()=>true,
    getElementById:k=>k==='scrollRoot'?root:null,querySelector:()=>null,
    addEventListener(type,cb){const key='d:'+type;listeners.set(key,[...(listeners.get(key)||[]),cb])},
    removeEventListener(type,cb){const key='d:'+type;listeners.set(key,(listeners.get(key)||[]).filter(x=>x!==cb))}
  };
  const messageStore={
    snapshot:()=>({currentContactId:messageContact}),
    beginNotificationTail(target){events.push('begin:'+target);return true},
    endNotificationTail(){events.push('end');resetCount++},
    showNotificationTailForActive(target){events.push('same:'+target);root.scrollTop=600;return true}
  };
  const shell={
    snapshot:()=>({route:'chat',activeContact:{id:active}}),
    NavigationCommand:{openContact(target){if(!allowed)return false;active=target;events.push('open:'+target);return true}}
  };
  const functions={async invoke(){return{data:{ok:true,enabled:false},error:null}}};
  const serviceWorker={
    controller:{postMessage(){}},
    ready:Promise.resolve({pushManager:{async getSubscription(){return null}}}),
    addEventListener(type,cb){listeners.set('sw:'+type,[cb])}
  };
  const navigator={serviceWorker,userAgent:'Mozilla/5.0',standalone:false};
  const Notification={permission:'granted',async requestPermission(){return'granted'}};
  const windowObj={
    V21AuthSessionStore:{snapshot:()=>({state:'AUTHENTICATED',account:{id:'admin',role:'admin'}}),getClient:()=>({functions})},
    ChatAppShell:shell,V21MessageStore:messageStore,
    V21ConversationBridge:{snapshot:()=>({viewportMode:'FOLLOW_TAIL'})},
    V21SyncEngine:{snapshot:()=>({currentContactId:messageContact,currentConversationId:'conv'})},
    addEventListener(type,cb){listeners.set('w:'+type,[cb])},
    matchMedia:()=>({matches:false})
  };
  const location={href:cold?'https://chat.taphoa.xyz/?push_contact=B&push_conversation=c-B':'https://chat.taphoa.xyz/',
    search:cold?'?push_contact=B&push_conversation=c-B':''};
  const ctx={
    window:windowObj,document,navigator,Notification,location,
    history:{state:null,replaceState(){}},URL,URLSearchParams,Uint8Array,
    atob:v=>Buffer.from(v,'base64').toString('binary'),
    requestAnimationFrame:fn=>{const key=idSeq++;raf.push({key,fn});return key},
    cancelAnimationFrame:key=>{const i=raf.findIndex(x=>x.key===key);if(i>=0)raf.splice(i,1)},
    setTimeout:(fn)=>{const key=idSeq++;timers.set(key,fn);return key},
    clearTimeout:key=>timers.delete(key),
    console
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  return{
    api:ctx.window.V21AdminPush,root,events,
    setReady(v){allowed=v},
    mounted(target){messageContact=target;notify('d:v21-conversation-switch',{detail:{phase:'mounted',contactId:target}})},
    emitContactReady(){notify('d:v21-contact-store-change',{detail:{reason:'replace'}})},
    frame(count=1){for(let i=0;i<count;i++){const next=raf.shift();if(next)next.fn()}},
    get resetCount(){return resetCount}
  };
}
(async()=>{
  const h=harness();
  const opened=await h.api.handleOpen({kind:'message',contactId:'B',conversationId:'c-B'});
  assert.equal(opened,true);
  assert.equal(h.root.style.visibility,'hidden','must conceal old scroll position BEFORE mounting');
  assert.deepEqual(h.events.slice(0,2),['begin:B','open:B']);
  h.mounted('B');
  h.root.scrollTop=h.root.scrollHeight-h.root.clientHeight;
  h.frame(5);
  assert.equal(h.root.style.visibility,'','reveal only after stable tail');
  assert.equal(h.resetCount,1,'one intent must end exactly once');

  h.root.scrollTop=21;
  await h.api.handleOpen({kind:'message',contactId:'B',conversationId:'c-B'});
  assert(h.events.includes('same:B'),'same-contact notification must force existing tail owner');
  assert.equal(h.root.style.visibility,'hidden');
  h.frame(5);
  assert.equal(h.root.style.visibility,'');
  assert.equal(h.root.scrollTop,600);

  h.setReady(false);
  const failed=await h.api.handleOpen({kind:'message',contactId:'X',conversationId:'c-X'});
  assert.equal(failed,false);
  assert.equal(h.root.style.visibility,'','failed contact open must never leave thread hidden');

  const cold=harness({cold:true});
  assert(cold.api.snapshot().pendingOpen,'cold push must wait for contacts/auth');
  cold.setReady(true);
  cold.emitContactReady();
  await Promise.resolve();
  assert.equal(cold.root.style.visibility,'hidden','cold open masks previous viewport');
  cold.mounted('B');
  cold.root.scrollTop=cold.root.scrollHeight-cold.root.clientHeight;
  cold.frame(5);
  assert.equal(cold.root.style.visibility,'');
  console.log('admin notification tail opens without visible scrolling PASS');
})().catch(error=>{console.error(error);process.exit(1)});
