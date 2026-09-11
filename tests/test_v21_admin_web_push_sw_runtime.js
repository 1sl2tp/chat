const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');

function harness(){
  const handlers={};
  const notices=[];
  const posted=[];
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
    return {id,url:'https://chat.taphoa.xyz/',focus:async()=>true,postMessage:data=>posted.push(data)};
  }
  async function dispatch(type,event){
    const waits=[];
    event.waitUntil=p=>waits.push(Promise.resolve(p));
    handlers[type](event);
    await Promise.all(waits);
  }
  return {handlers,notices,posted,opened,getBadge:()=>badge,setClients:v=>{clientsList=v},client,dispatch};
}

(async()=>{
  const payload={title:'Cha yêu',body:'Xin chào',tag:'chat:conv-1',conversation_id:'conv-1',contact_id:'user-1',icon:'./icons/chat-192.png'};

  const bg=harness();
  bg.setClients([]);
  await bg.dispatch('push',{data:{json:()=>payload}});
  assert.equal(bg.notices.length,1,'background push must show one notification');
  assert.equal(bg.notices[0].options.tag,'chat:conv-1');
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

  const other=harness();
  const otherClient=other.client('c1');other.setClients([otherClient]);
  await other.dispatch('message',{data:{type:'ADMIN_PUSH_STATE',visible:true,focused:true,route:'chat',conversationId:'conv-2',contactId:'user-2'},source:otherClient});
  await other.dispatch('push',{data:{json:()=>payload}});
  assert.equal(other.notices.length,1,'different conversation must still notify');

  const click=harness();
  const clickClient=click.client('c9');click.setClients([clickClient]);
  await click.dispatch('message',{data:{type:'ADMIN_PUSH_BADGE_SET',count:3},source:clickClient});
  let closed=false;
  await click.dispatch('notificationclick',{notification:{data:{conversationId:'conv-1',contactId:'user-1'},close(){closed=true}}});
  assert.equal(closed,true);
  assert.deepEqual(click.posted[0],{type:'ADMIN_PUSH_OPEN',conversationId:'conv-1',contactId:'user-1'});
  assert.equal(click.opened.length,0);
  assert.equal(click.getBadge(),3,'notification click must not clear unread from other messages');

  const cold=harness();cold.setClients([]);
  await cold.dispatch('notificationclick',{notification:{data:{conversationId:'conv-1',contactId:'user-1'},close(){}}});
  assert.equal(cold.opened.length,1);
  assert(cold.opened[0].includes('push_contact=user-1'));
  assert(cold.opened[0].includes('push_conversation=conv-1'));

  console.log('admin web push service worker runtime PASS');
})().catch(error=>{console.error(error);process.exit(1)});
