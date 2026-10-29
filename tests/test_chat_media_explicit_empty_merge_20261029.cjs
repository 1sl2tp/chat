'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-message-store.js'),'utf8');
const frames=[];
const ctx={
 console,window:null,Array,Map,Set,Object,String,Number,Boolean,Date,JSON,Math,
 V21AuthSessionStore:{snapshot:()=>({state:'AUTHENTICATED',appSessionId:'S',account:{id:'ME'}})},
 V21ConversationBridge:{
  snapshot:()=>({size:0}),replace(rows,opts){
   frames.push({rows:rows.map(r=>({
      id:r.id,body:r.body,version:r.version,
      assets:Array.isArray(r._media_assets)?r._media_assets.map(a=>a.id):null
   })),viewState:opts?.viewState??null});
   return rows.length;
  },
  reconcile(rows){return{size:rows.length};},append(){return true;},
  clear(){return true;},captureViewState(){return null;},remove(){return true;}
 }
};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(source,ctx);
const store=ctx.V21MessageStore;
const base={
 id:'message-1',client_id:'client-1',sender_account_id:'ME',
 conversation_id:'CONV',created_at:'2026-10-29T02:00:00Z',
 updated_at:'2026-10-29T02:00:00Z',body:'With media',version:1
};
const media=id=>({id,conversation_id:'CONV',kind:'image',sort_index:0});
const snapshot=()=>{store.restoreSession('C');return frames.at(-1).rows[0];};
assert.equal(store.primeSession({contactId:'C',conversationId:'CONV',
 rows:[{...base,_media_assets:[media('A')]}]}),true);
assert.deepEqual(snapshot().assets,['A']);

assert.equal(store.mergeForContact({...base,version:2,body:'Edited text only'},
 {contactId:'C',conversationId:'CONV'}),true);
assert.deepEqual(snapshot().assets,['A'],
 'a canonical message row with no media property must retain last-good attachment');
assert.equal(snapshot().body,'Edited text only');

assert.equal(store.mergeForContact({...base,version:2,body:'Edited text only',_media_assets:[]},
 {contactId:'C',conversationId:'CONV'}),true);
assert.deepEqual(snapshot().assets,[],
 'an explicit empty list after the last asset deletion must override stale attachments');

assert.equal(store.mergeForContact({...base,version:3,_media_assets:[media('B')]},
 {contactId:'C',conversationId:'CONV'}),true);
assert.deepEqual(snapshot().assets,['B'],'partial canonical collection must not restore old A');
assert.equal(store.mergeForContact({...base,version:4,_media_assets:[]},
 {contactId:'C',conversationId:'CONV'}),true);
assert.deepEqual(snapshot().assets,[],'all assets deleted again');
assert.equal(store.mergeForContact({...base,version:3,_media_assets:[media('B')]},
 {contactId:'C',conversationId:'CONV'}),true);
assert.deepEqual(snapshot().assets,[],'stale lower-version message must not revive deleted media');
assert.equal(store.mergeForContact({...base,conversation_id:'FOREIGN',version:9,_media_assets:[media('Z')]},
 {contactId:'C',conversationId:'CONV'}),false);
assert.deepEqual(snapshot().assets,[],'foreign conversation must not affect current session');

console.log('CHAT explicit empty media snapshot wins over stale fallback; omitted media retains cache PASS');
