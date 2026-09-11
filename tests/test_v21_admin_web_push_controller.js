const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const file=path.join(__dirname,'..','admin-push-controller.js');
assert(fs.existsSync(file),'admin-push-controller.js must exist');
const code=fs.readFileSync(file,'utf8');

function makeHarness({role='admin',permission='default',standalone=false,userAgent='Mozilla/5.0 Chrome/140',unread=0}={}){
  let permissionRequests=0;
  let localUnsubscribes=0;
  let subscribeOptions=null;
  let unreadCount=Math.max(0,Number(unread)||0);
  let appBadge=0;
  const invokeCalls=[];
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
  };
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
      async refreshUnread(){return unreadCount}
    },
    addEventListener(type,fn){listeners['w:'+type]=fn},
    matchMedia:()=>({matches:standalone}),
  };
  const location={href:'https://chat.taphoa.xyz/',search:'',protocol:'https:',hostname:'chat.taphoa.xyz'};
  const history={replaceState(){}};
  const ctx={window:windowObj,document,navigator,Notification,location,history,URL,URLSearchParams,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),encodeURIComponent,String,Number,Boolean,Object,Array,Promise,console,setTimeout:fn=>{fn();return 1},clearTimeout(){}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return{
    api:ctx.window.V21AdminPush,pushManager,subscription,invokeCalls,swMessages,
    getPermissionRequests:()=>permissionRequests,getLocalUnsubscribes:()=>localUnsubscribes,getSubscribeOptions:()=>subscribeOptions,
    getAppBadge:()=>appBadge,getTitle:()=>document.title,getFaviconHref:()=>favicon.href,setUnread:value=>{unreadCount=Math.max(0,Number(value)||0)}
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

  badge.setUnread(0);
  const unread0=await badge.api.refreshUnreadBadge();
  assert.equal(unread0,0);
  assert.equal(badge.getAppBadge(),0,'reading all messages must clear PWA badge');
  assert.equal(badge.getTitle(),'TAPHOA Chat');
  assert.equal(badge.getFaviconHref(),'./icons/chat-192.png');
  assert.deepEqual(badge.swMessages.at(-1),{type:'ADMIN_PUSH_BADGE_SET',count:0});

  console.log('admin web push controller runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
