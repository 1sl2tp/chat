const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const file=path.join(__dirname,'..','admin-push-controller.js');
assert(fs.existsSync(file),'admin-push-controller.js must exist');
const code=fs.readFileSync(file,'utf8');

function makeHarness({role='admin',permission='default',standalone=false,userAgent='Mozilla/5.0 Chrome/140',unread=0,dom=false}={}){
  let permissionRequests=0;
  let localUnsubscribes=0;
  let subscribeOptions=null;
  let unreadCount=Math.max(0,Number(unread)||0);
  let appBadge=0;
  const invokeCalls=[];
  const wakeCalls=[];
  const subscription={
    endpoint:'https://push.example/sub-1',
    toJSON(){return{endpoint:this.endpoint,keys:{p256dh:'p256dh-key',auth:'auth-key'}}},
    async unsubscribe(){localUnsubscribes++;return true;}
  };
  const pushManager={
    current:null,
    async getSubscription(){return this.current},
    async subscribe(options){subscribeOptions=options;this.current=subscription;return subscription;}
  };
  const functions={
    async invoke(name,{body}={}){
      invokeCalls.push({name,body});
      if(body.action==='public_key')return{data:{ok:true,public_key:'AQIDBA'},error:null};
      if(body.action==='status')return{data:{ok:true,enabled:true},error:null};
      if(body.action==='subscribe')return{data:{ok:true,subscription:{enabled:true}},error:null};
      if(body.action==='unsubscribe')return{data:{ok:true},error:null};
      return{data:{ok:false,code:'invalid_action'},error:null};
    }
  };
  const authStore={
    snapshot(){return{state:'AUTHENTICATED',account:{id:role==='admin'?'admin-1':'user-1',role},deviceId:'device-1'}},
    getClient(){return{functions}}
  };
  const listeners={};
  const favicon={
    href:'./icons/chat-192.png',
    getAttribute(name){return name==='href'?this.href:null},
    setAttribute(name,value){if(name==='href')this.href=String(value)}
  };
  const document={
    visibilityState:'visible',
    title:'TAPHOA Chat',
    hasFocus:()=>true,
    querySelector(selector){return selector==='link[rel~="icon"]'?favicon:null},
    addEventListener(type,fn){listeners['d:'+type]=fn},
    dispatchEvent(event){listeners['d:'+event?.type]?.(event);return true},
  };
  const appendedToasts=[];
  if(dom){
    const elements=new Map();
    document.getElementById=id=>elements.get(id)||null;
    document.createElement=tag=>({
      tagName:String(tag).toUpperCase(),style:{},children:[],attributes:{},listeners:{},removed:false,
      setAttribute(name,value){this.attributes[name]=String(value)},
      append(...nodes){this.children.push(...nodes)},
      addEventListener(name,callback){this.listeners[name]=callback},
      remove(){this.removed=true;if(elements.get(this.id)===this)elements.delete(this.id)}
    });
    document.body={appendChild(node){appendedToasts.push(node);elements.set(node.id,node);return node}};
  }
  const swMessages=[];
  const serviceWorker={
    ready:Promise.resolve({pushManager}),
    controller:{postMessage:data=>swMessages.push(data)},
    addEventListener(type,fn){listeners['sw:'+type]=fn}
  };
  const navigator={
    serviceWorker,userAgent,standalone,
    async setAppBadge(value){appBadge=Math.max(0,Number(value)||0)},
    async clearAppBadge(){appBadge=0}
  };
  const Notification={
    get permission(){return permission},
    async requestPermission(){permissionRequests++;return permission==='default'?'granted':permission;}
  };
  const windowObj={
    V21AuthSessionStore:authStore,
    ChatAppShell:{
      snapshot:()=>({route:'chat',activeContact:{id:'contact-1'}}),
      UnreadIndicator:{snapshot:()=>unreadCount}
    },
    V21SyncEngine:{
      snapshot:()=>({currentConversationId:'conv-1',currentContactId:'contact-1'}),
      async refreshUnread(){return unreadCount},
      async wake(options){wakeCalls.push(options||{});return true}
    },
    addEventListener(type,fn){listeners['w:'+type]=fn},
    matchMedia:()=>({matches:standalone}),
  };
  const location={href:'https://chat.taphoa.xyz/',search:'',protocol:'https:',hostname:'chat.taphoa.xyz'};
  const history={replaceState(){}};
  const ctx={window:windowObj,document,navigator,Notification,CustomEvent:class CustomEvent{constructor(type,opts={}){this.type=type;this.detail=opts.detail}},location,history,URL,URLSearchParams,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),encodeURIComponent,String,Number,Boolean,Object,Array,Promise,console,setTimeout:fn=>{fn();return 1},clearTimeout(){}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return{
    api:ctx.window.V21AdminPush,pushManager,subscription,invokeCalls,swMessages,
    getPermissionRequests:()=>permissionRequests,getLocalUnsubscribes:()=>localUnsubscribes,getSubscribeOptions:()=>subscribeOptions,
    getAppBadge:()=>appBadge,getTitle:()=>document.title,getFaviconHref:()=>favicon.href,setUnread:value=>{unreadCount=Math.max(0,Number(value)||0)},
    emitServiceWorkerMessage:data=>listeners['sw:message']?.({data}),
    getWakeCalls:()=>wakeCalls.slice(),getToasts:()=>appendedToasts.slice()
  };
}

(async()=>{
  const user=makeHarness({role:'user'});
  const userStatus=await user.api.status();
  assert.equal(userStatus.admin,false);
  assert.equal(userStatus.supported,false);
  const userEnable=await user.api.enable();
  assert.equal(userEnable.code,'admin_required');
  assert.equal(user.getPermissionRequests(),0,'normal user must never request notification permission');

  const admin=makeHarness({role:'admin',permission:'default'});
  const enabled=await admin.api.enable();
  assert.equal(enabled.ok,true);
  assert.equal(admin.getPermissionRequests(),1,'admin explicit enable requests permission once');
  assert.equal(admin.getSubscribeOptions().userVisibleOnly,true);
  assert(admin.getSubscribeOptions().applicationServerKey instanceof Uint8Array);
  const subscribeCall=admin.invokeCalls.find(call=>call.body.action==='subscribe');
  assert(subscribeCall,'subscribe Edge action required');
  assert.equal(subscribeCall.body.subscription.endpoint,'https://push.example/sub-1');
  assert.equal(subscribeCall.body.subscription.keys.p256dh,'p256dh-key');
  assert.equal(subscribeCall.body.subscription.keys.auth,'auth-key');
  assert.equal(subscribeCall.body.device_id,'device-1');
  assert(subscribeCall.body.platform);

  const denied=makeHarness({role:'admin',permission:'denied'});
  const deniedResult=await denied.api.enable();
  assert.equal(deniedResult.code,'blocked');
  assert.equal(denied.getPermissionRequests(),0,'already denied must not re-prompt');

  const disable=makeHarness({role:'admin',permission:'granted'});
  disable.pushManager.current=disable.subscription;
  const disabled=await disable.api.disable();
  assert.equal(disabled.ok,true);
  assert.equal(disable.getLocalUnsubscribes(),1);
  assert(disable.invokeCalls.some(call=>call.body.action==='unsubscribe'));

  const badge=makeHarness({role:'admin',permission:'granted',unread:3});
  assert.equal(typeof badge.api.refreshUnreadBadge,'function','controller must expose unread badge refresh');
  const unread3=await badge.api.refreshUnreadBadge();
  assert.equal(unread3,3);
  assert.equal(badge.getAppBadge(),3,'PWA badge must match authoritative unread count');
  assert.equal(badge.getTitle(),'(3) TAPHOA Chat','browser title must show unread count');
  assert(badge.getFaviconHref().startsWith('data:image/svg+xml,'),'browser favicon must show unread state');
  assert.deepEqual(badge.swMessages.at(-1),{type:'ADMIN_PUSH_BADGE_SET',count:3});

  badge.emitServiceWorkerMessage({type:'ADMIN_PUSH_MESSAGE_DIRTY',conversationId:'conv-1',contactId:'user-1',messageId:'message-1'});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(badge.getWakeCalls().at(-1)?.reason,'admin-push-message','push delivery must wake canonical message/contact sync');

  badge.setUnread(0);
  const unread0=await badge.api.refreshUnreadBadge();
  assert.equal(unread0,0);
  assert.equal(badge.getAppBadge(),0,'reading all messages must clear PWA badge');
  assert.equal(badge.getTitle(),'TAPHOA Chat');
  assert.equal(badge.getFaviconHref(),'./icons/chat-192.png');
  assert.deepEqual(badge.swMessages.at(-1),{type:'ADMIN_PUSH_BADGE_SET',count:0});

  // MSG-364: same conversation is already rendered by canonical realtime: no toast.
  const foreground=makeHarness({role:'admin',permission:'granted',dom:true});
  foreground.emitServiceWorkerMessage({type:'ADMIN_PUSH_MESSAGE_DIRTY',conversationId:'conv-1',messageId:'same-1',title:'Người gửi',body:'Đang xem'});
  assert.equal(foreground.getToasts().length,0,'active conversation should not show a duplicate toast');
  foreground.emitServiceWorkerMessage({type:'ADMIN_PUSH_MESSAGE_DIRTY',conversationId:'conv-2',contactId:'contact-2',messageId:'other-1',title:'Khách mới',body:'Có đơn hàng cần xem'});
  assert.equal(foreground.getToasts().length,1,'different conversation should show one foreground toast');
  assert.equal(foreground.getToasts()[0].children[0].textContent,'Khách mới');
  assert.equal(foreground.getToasts()[0].children[1].textContent,'Có đơn hàng cần xem');
  foreground.emitServiceWorkerMessage({type:'ADMIN_PUSH_MESSAGE_DIRTY',conversationId:'conv-2',messageId:'other-1',title:'Khách mới'});
  assert.equal(foreground.getToasts().length,1,'repeated push for same message must not duplicate toast');
  foreground.emitServiceWorkerMessage({type:'ADMIN_PUSH_BANK_DIRTY',bankStatus:'matched',bankReceiptId:'receipt-1',bankNoticeId:'notice-1',bankAmountVnd:890000,bankDay:'2026-11-14'});
  assert.equal(foreground.getToasts().length,2,'verified bank collection should show confirmation');
  assert(foreground.getToasts()[1].textContent.includes('890.000đ'),'matched toast shows the correct verified amount');
  foreground.emitServiceWorkerMessage({type:'ADMIN_PUSH_BANK_DIRTY',bankStatus:'matched',bankReceiptId:'receipt-1',bankNoticeId:'notice-1',bankAmountVnd:890000});
  assert.equal(foreground.getToasts().length,2,'duplicate matched bank event must not show twice');
  // Existing headless harness has no DOM: the message still wakes canonical sync.
  assert(badge.getWakeCalls().some(call=>call.reason==='admin-push-message'));

  console.log('admin web push controller runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
