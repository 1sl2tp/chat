/* CHAT-447: reuse approved CHAT session; read-only 0v host. */
(function(){
'use strict';
function createReadHost({session,client}){
 let owner=null,db=null,allowed=new Map(),closed=false,generation=0;
 function current(){
  const s=session(),c=client();
  if(closed||s?.state!=='AUTHENTICATED'||!s.account?.id||!s.appSessionId||!c)throw Error('session_unavailable');
  if(owner&&(owner.accountId!==s.account.id||owner.appSessionId!==s.appSessionId||db!==c))throw Error('session_changed');
  if(!owner){owner={accountId:s.account.id,appSessionId:s.appSessionId};db=c}
  return owner;
 }
 function start(){const s=current();return {accountId:s.accountId,epoch:'approved-host-session',approved:true}}
 function close(){closed=true;allowed.clear();generation++}
 async function read(kind,id){
  const s=current(),seq=++generation;let result;
  if(kind==='directory'){
   result=await db.rpc('v21_contacts_sidebar',{p_app_session_id:s.appSessionId});
  }else if(kind==='thread'){
   if(typeof id!=='string'||!allowed.has(id))throw Error('contact_forbidden');
   const room=allowed.get(id);if(!room)return [];
   result=await db.rpc('v21_sync_snapshot',{p_app_session_id:s.appSessionId,p_conversation_id:room,p_message_limit:100});
  }else throw Error('read_not_allowed');
  current();if(seq!==generation)throw Error('stale_read');if(result.error)throw Error('read_failed');
  if(kind==='directory'){
   if(!Array.isArray(result.data)||result.data.length>5000)throw Error('bad_directory');
   const next=new Map(),rows=[];
   for(const x of result.data){if(!x?.id||x.locked_at||x.deleted_at)continue;if(next.has(x.id))throw Error('duplicate_contact');next.set(x.id,x.conversation_id||null);rows.push({id:x.id,display_name:x.display_name,role:x.role,conversation_id:x.conversation_id||null,preview_text:x.preview_text,latest_at:x.latest_at,has_unread:x.has_unread})}
   allowed=next;return rows;
  }
  if(result.data?.account_id!==s.accountId||!Array.isArray(result.data.messages)||result.data.messages.length>100)throw Error('bad_snapshot');
  const room=allowed.get(id);if(result.data.messages.some(x=>x.conversation_id!==room))throw Error('foreign_message');
  return result.data.messages.map(x=>({id:x.id,conversation_id:x.conversation_id,sender_account_id:x.sender_account_id,body:x.body,created_at:x.created_at,deleted_at:x.deleted_at}));
 }
 return Object.freeze({start,read,close,valid(){try{current();return true}catch{return false}}});
}
if(typeof module==='object'&&module.exports){module.exports={createReadHost};return}
if(new URLSearchParams(location.search).get('ui')!=='0v')return;
let launched=false;
function open(){
 if(launched||document.querySelector('dialog[open]'))return;
 const auth=window.V21AuthSessionStore;
 if(auth?.snapshot()?.state!=='AUTHENTICATED')return;
 const host=createReadHost({session:()=>auth.snapshot(),client:()=>auth.getClient()});
 let scope;try{scope=host.start()}catch{return}
 launched=true;
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','0v · Chỉ đọc');
 dialog.style.cssText='box-sizing:border-box;position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;background:white;color:#111;display:grid;grid-template-rows:44px minmax(0,1fr)';
 const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #ddd;font:14px system-ui';
 const title=document.createElement('span');title.textContent='0v · Dữ liệu CHAT · Chỉ đọc';
 const exit=document.createElement('button');exit.type='button';exit.textContent='Về CHAT';exit.style.cssText='min-height:44px;padding:0 12px';bar.append(title,exit);
 const frame=document.createElement('iframe');frame.title='0v · Danh bạ và hội thoại';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.style.cssText='width:100%;height:100%;border:0;min-height:0';frame.src='./0v-read.html';
 let port=null,ended=false;
 function cleanup(){if(ended)return;ended=true;host.close();port?.close();frame.remove();dialog.remove();document.removeEventListener('v21-auth-state',authChange);window.removeEventListener('pagehide',cleanup)}
 function authChange(){if(!host.valid())cleanup()}
 exit.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',cleanup,{once:true});document.addEventListener('v21-auth-state',authChange);window.addEventListener('pagehide',cleanup,{once:true});
 frame.addEventListener('load',()=>{
  if(ended||!host.valid()||port){cleanup();return}
  const channel=new MessageChannel();port=channel.port1;
  port.onmessage=async e=>{const m=e.data;if(ended||!m||!Number.isSafeInteger(m.seq)||!['directory','thread'].includes(m.kind))return;try{const rows=await host.read(m.kind,m.id);if(!ended&&host.valid())port.postMessage({seq:m.seq,rows});else cleanup()}catch{if(!ended){if(!host.valid())cleanup();else port.postMessage({seq:m.seq,error:true})}}};
  // Opaque sandbox origin; transfer only a private read port to the local frame.
  frame.contentWindow.postMessage({type:'chat-0v-read-init',scope},'*',[channel.port2]);
 });
 dialog.append(bar,frame);document.body.append(dialog);try{dialog.showModal()}catch{cleanup()}
}
document.addEventListener('v21-auth-state',open);open();
})();
