const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');

function harness(){
  const handlers={};
  const notices=[];
  const posted=[];
  const targeted=[];
  const opened=[];
  let clientsList=[];
  let badge=0;
  const self={
    location:{origin:'https://chat.taphoa.xyz'},
    addEventListener(type,fn){handlers[type]=fn},
    skipWaiting:async()=>{},
    clients:{
      claim:async()=>{},
      matchAll:async()=>clientsList,
      openWindow:async url=>{opened.push(String(url));return null;}
    },
    registration:{showNotification:async(title,options)=>{notices.push({title,options})}}
  };
  const navigator={
    setAppBadge:async value=>{badge=Number(value)||0},
    clearAppBadge:async()=>{badge=0}
  };
  const caches={keys:async()=>[],open:async()=>({addAll:async()=>{},put:async()=>{}}),delete:async()=>true,match:async()=>null};
  const ctx={self,navigator,caches,Request:class{},URL,fetch:async()=>({ok:true,clone(){return this}}),Date,Map,Promise,JSON,String,Number,Boolean,Object,Array,console};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  function client(id='c1'){
    return {id,url:'https://chat.taphoa.xyz/',focus:async()=>true,postMessage:data=>{posted.push(data);targeted.push({id,data})}};
  }
  async function dispatch(type,event){
    const waits=[];
    event.waitUntil=p=>waits.push(Promise.resolve(p));
    handlers[type](event);
    await Promise.all(waits);
  }
  return {handlers,notices,posted,targeted,opened,getBadge:()=>badge,setClients:v=>{clientsList=v},client,dispatch};
}

(async()=>{
  const payload={title:'Cha yêu',body:'Xin chào',tag:'chat:conv-1',conversation_id:'conv-1',contact_id:'user-1',icon:'./icons/chat-192.png'};

  const bg=harness();
  bg.setClients([]);
  await bg.dispatch('push',{data:{json:()=>payload}});
  assert.equal(bg.notices.length,1,'background push must show one notification');
  assert.equal(bg.notices[0].options.tag,'chat:conv-1');
  assert.equal(bg.notices[0].options.icon,'./icons/chat-notification-icon-192-v4.png','notification must use dedicated crisp icon');
  assert.equal(bg.notices[0].options.badge,'./icons/chat-notification-badge-96-v4.png','notification badge must use dedicated monochrome asset');
  assert.equal(bg.getBadge(),1,'background push increments provisional app badge');

  const authoritative=harness();
  const authoritativeClient=authoritative.client('c-authoritative');
  authoritative.setClients([authoritativeClient]);
  await authoritative.dispatch('message',{data:{type:'ADMIN_PUSH_BADGE_SET',count:4},source:authoritativeClient});
  assert.equal(authoritative.getBadge(),4,'page unread count must set authoritative app badge');
  await authoritative.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:true,route:'chat',conversationId:'conv-2',contactId:'user-2'},source:authoritativeClient});
  assert.equal(authoritative.getBadge(),4,'focusing the app must not clear unread badge');

  const same=harness();
  const sameClient=same.client('c1');same.setClients([sameClient]);
  await same.dispatch('message',{data:{type:'ADMIN_PUSH_BADGE_SET',count:2},source:sameClient});
  await same.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:true,route:'chat',conversationId:'conv-1',contactId:'user-1'},source:sameClient});
  await same.dispatch('push',{data:{json:()=>payload}});
  assert.equal(same.notices.length,0,'focused same conversation must suppress system notification');
  assert.equal(same.getBadge(),2,'suppressed same-conversation push must preserve other unread badge count');
  assert(same.posted.some(message=>
    message.type==='ADMIN_PUSH_MESSAGE_DIRTY'&&
    message.conversationId==='conv-1'&&
    message.contactId==='user-1'
  ),'same-conversation push must still wake the visible page so thread/sidebar update immediately');

  const other=harness();
  const otherClient=other.client('c1');other.setClients([otherClient]);
  await other.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:true,route:'chat',conversationId:'conv-2',contactId:'user-2'},source:otherClient});
  await other.dispatch('push',{data:{json:()=>payload}});
  assert.equal(other.notices.length,1,'different conversation must still notify');

  // The mobile PWA is visibly open in Chat but currently viewing a
  // different contact. The in-app list/thread handles the new event; no
  // duplicate system notification should appear.
  const mobile=harness();
  const mobileClient=mobile.client('mobile');
  mobileClient.visibilityState='visible';
  mobile.setClients([mobileClient]);
  await mobile.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:false,platform:'ios-pwa',route:'chat',conversationId:'conv-2'},source:mobileClient});
  await mobile.dispatch('push',{data:{json:()=>payload}});
  assert.equal(mobile.notices.length,0,'visible iOS PWA Chat suppresses notification even on another contact');
  assert(mobile.posted.some(message=>message.type==='ADMIN_PUSH_MESSAGE_DIRTY'),'foreground mobile must still receive dirty wake');

  const hidden=harness();
  const hiddenClient=hidden.client('hidden');
  hiddenClient.visibilityState='hidden';
  hidden.setClients([hiddenClient]);
  await hidden.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:true,platform:'ios-pwa',route:'chat',conversationId:'conv-2'},source:hiddenClient});
  await hidden.dispatch('push',{data:{json:()=>payload}});
  assert.equal(hidden.notices.length,1,'hidden PWA must receive a system notification even if visibility state message is stale');

  const work=harness();
  const workClient=work.client('work');
  workClient.visibilityState='visible';
  work.setClients([workClient]);
  await work.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,platform:'android-pwa',route:'work',conversationId:'conv-2'},source:workClient});
  await work.dispatch('push',{data:{json:()=>payload}});
  assert.equal(work.notices.length,1,'mobile Work route keeps message notification enabled');

  const call=harness();
  const callClient=call.client('call');
  callClient.visibilityState='visible';
  call.setClients([callClient]);
  await call.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,platform:'ios-pwa',route:'chat',conversationId:'conv-2'},source:callClient});
  await call.dispatch('push',{data:{json:()=>({...payload,kind:'call_invite',invite_id:'invite-1'})}});
  assert.equal(call.notices.length,1,'incoming call notification must remain available');

  const click=harness();
  const clickClient=click.client('c9');click.setClients([clickClient]);
  await click.dispatch('message',{data:{type:'ADMIN_PUSH_BADGE_SET',count:3},source:clickClient});
  let closed=false;
  await click.dispatch('notificationclick',{notification:{data:{conversationId:'conv-1',contactId:'user-1'},close(){closed=true}}});
  assert.equal(closed,true);
  assert.deepEqual(click.posted[0],{type:'ADMIN_PUSH_OPEN',conversationId:'conv-1',contactId:'user-1'});
  assert.equal(click.opened.length,0);
  assert.equal(click.getBadge(),3,'notification click must not clear unread from other messages');

  // A notification on an installed PWA must not wake an arbitrary older web
  // tab. Matching Chat clients are selected by platform and activity.
  const multi=harness();
  const regularTab=multi.client('ordinary-browser-tab');
  const installedPwa=multi.client('installed-pwa');
  regularTab.visibilityState='visible';
  installedPwa.visibilityState='hidden';
  multi.setClients([regularTab,installedPwa]);
  await multi.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',platform:'web',visible:true,
    focused:true,route:'chat',contactId:'other'},source:regularTab});
  await multi.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',platform:'ios-pwa',visible:false,
    focused:false,route:'chat',contactId:'user-1'},source:installedPwa});
  await multi.dispatch('notificationclick',{notification:{data:{kind:'message',
    conversationId:'conv-1',contactId:'user-1'},close(){}}});
  assert.equal(multi.targeted.at(-1).id,'installed-pwa',
    'notification must focus matching installed PWA rather than the first web tab');
  assert.equal(multi.targeted.at(-1).data.contactId,'user-1');

  const cold=harness();cold.setClients([]);
  await cold.dispatch('notificationclick',{notification:{data:{conversationId:'conv-1',contactId:'user-1'},close(){}}});
  assert.equal(cold.opened.length,1);
  assert(cold.opened[0].includes('push_contact=user-1'));
  assert(cold.opened[0].includes('push_conversation=conv-1'));

  // Failed focus must not silently consume the click. One cold deep link is
  // opened instead, with exact conversation/contact identities intact.
  const focusFail=harness();
  const refused=focusFail.client('focus-rejected');
  refused.focus=async()=>{throw new Error('focus denied')};
  focusFail.setClients([refused]);
  await focusFail.dispatch('notificationclick',{notification:{data:{
    kind:'message',conversationId:'conv-focus',contactId:'hint-focus'
  },close(){}}});
  assert.equal(focusFail.posted.length,0,'never message a window that failed focus');
  assert.equal(focusFail.opened.length,1,'focus rejection must open exactly one deep link');
  assert.equal(new URL(focusFail.opened[0]).searchParams.get('push_conversation'),'conv-focus');
  assert.equal(new URL(focusFail.opened[0]).searchParams.get('push_contact'),'hint-focus');

  // If focus works but postMessage fails, navigate the same client instead of
  // creating a duplicate tab or losing the click.
  const messageFail=harness();
  const existing=messageFail.client('message-rejected');
  const navigations=[];
  existing.postMessage=()=>{throw new Error('message port unavailable')};
  existing.navigate=async url=>{navigations.push(url);return existing};
  messageFail.setClients([existing]);
  await messageFail.dispatch('notificationclick',{notification:{data:{
    kind:'message',conversationId:'conv-nav',contactId:'hint-nav'
  },close(){}}});
  assert.equal(navigations.length,1,'one bounded same-client navigation');
  assert.equal(new URL(navigations[0]).searchParams.get('push_conversation'),'conv-nav');
  assert.equal(messageFail.opened.length,0,'successful same-client navigation must not open another window');

  // Without navigate(), failed postMessage must use exactly one openWindow.
  const noNavigate=harness();
  const stranded=noNavigate.client('no-navigate');
  stranded.postMessage=()=>{throw new Error('port closed')};
  noNavigate.setClients([stranded]);
  await noNavigate.dispatch('notificationclick',{notification:{data:{
    conversationId:'conv-port',contactId:'hint-port'
  },close(){}}});
  assert.equal(noNavigate.opened.length,1);
  assert.equal(new URL(noNavigate.opened[0]).searchParams.get('push_conversation'),'conv-port');

  // A failed bank click remains a bank dashboard intent, never a Chat thread.
  const bankFallback=harness();
  const bankClient=bankFallback.client('bank-failed');
  bankClient.focus=async()=>{throw new Error('cannot activate')};
  bankFallback.setClients([bankClient]);
  await bankFallback.dispatch('notificationclick',{notification:{data:{
    kind:'bank_reconciliation',contactId:'report-contact',
    bankDay:'2026-10-28',bankNoticeId:'notice-id',bankStatus:'matched'
  },close(){}}});
  assert.equal(bankFallback.opened.length,1);
  const bankUrl=new URL(bankFallback.opened[0]);
  assert.equal(bankUrl.searchParams.get('push_bank_day'),'2026-10-28');
  assert.equal(bankUrl.searchParams.get('push_bank_notice'),'notice-id');
  assert.equal(bankUrl.searchParams.get('push_bank_status'),'matched');

  // Friend and call intents retain their own cold-open identity.
  const special=harness();
  special.setClients([]);
  await special.dispatch('notificationclick',{notification:{data:{
    kind:'zalo_friend_accepted'
  },close(){}}});
  await special.dispatch('notificationclick',{notification:{data:{
    kind:'call_invite',inviteId:'invite-1',contactId:'caller-1'
  },close(){}}});
  assert.equal(new URL(special.opened[0]).searchParams.get('push_friend'),'1');
  assert.equal(new URL(special.opened[1]).searchParams.get('push_call_invite'),'invite-1');
  assert.equal(new URL(special.opened[1]).searchParams.get('push_contact'),'caller-1');

  console.log('admin web push service worker runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
