const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const listeners=new Map();
const document={addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;}};
const cachedMessage={id:'m1',conversation_id:'CONV',sender_account_id:'B',client_id:'c1',body:'cached',created_at:'2026-01-01'};
const cache={open:async()=>true,listContacts:async()=>[],getConversationId:async()=>'CONV',listMessages:async()=>[cachedMessage],listOutboxForContact:async()=>[],getMeta:async()=>false,setMeta:async()=>true,setConversationId:async()=>true,isInitialized:async()=>true,getCursor:async()=>0,setCursor:async()=>true,putMessages:async()=>true,replaceContacts:async()=>true,putReadState:async()=>true,putMessage:async()=>true,listOutbox:async()=>[]};
const calls={prime:0};
const messages={stashCurrentView(){},restoreSession(){return null},setContext(){},replace(){},primeSession(){calls.prime++},merge(){},apply(){},reset(){},captureCurrentView(){return null}};
let snapshotFailures=0;
const client={rpc:async(name)=>{if(name==='v21_sync_snapshot'){snapshotFailures++;return{data:null,error:new TypeError('Load failed')}}if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};if(name==='v21_unread_count')return{data:0,error:null};if(name==='v21_mark_read')return{data:true,error:null};if(name==='v21_contacts_sidebar')return{data:[],error:null};return{data:null,error:null}}};
const ctx={console,window:null,document,CustomEvent,Blob,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,navigator:{onLine:true},queueMicrotask,setTimeout,clearTimeout};ctx.window=ctx;
ctx.V21AuthSessionStore={snapshot:()=>({state:'AUTHENTICATED',appSessionId:'S',account:{id:'ME'}}),getClient:()=>client};
ctx.V21CacheStore=cache;ctx.V21MediaCache={indexByMessage:async()=>new Map(),putRemoteMeta:async()=>true,listForMessage:async()=>[],get:async()=>null,ensureRemote:async()=>null};
ctx.V21MessageStore=messages;ctx.V21ContactStore={replace(){},snapshot:()=>[],clear(){}};ctx.ChatAppShell={snapshot:()=>({route:'chat',sidebarOpen:false,activeContact:null}),UnreadIndicator:{snapshot:()=>0,set(){}}};
vm.createContext(ctx);vm.runInContext(code,ctx);assert(ctx.V21SyncEngine);
(async()=>{await new Promise(r=>setTimeout(r,0));let rejected=false,result;try{result=await ctx.V21SyncEngine.openContact('B')}catch(error){rejected=true}
assert.strictEqual(snapshotFailures>0,true);assert.strictEqual(rejected,false,'transient canonical snapshot failure must not reject openContact');assert.strictEqual(result,true);assert.strictEqual(calls.prime>0,true);console.log('V21.72.15 openContact network recovery PASS')})().catch(error=>{console.error(error);process.exit(1)});
