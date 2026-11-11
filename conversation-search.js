(()=>{
'use strict';
// P1-SEARCH-287. Only search the already-loaded active conversation. A search
// must not call Supabase, reveal another account, change read state or scroll
// outside the canonical Conversation Bridge owner.
const OWNER='conversation-search';
const MODE='MESSAGE_SEARCH';
let overlay=null;
let returnFocus=null;
let searchScope=null;
let scheduledFrame=0;

function scope(){
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const message=window.V21MessageStore?.snapshot?.()||{};
 const shell=window.ChatAppShell?.snapshot?.()||{};
 return{
  accountId:String(auth.account?.id||''),
  appSessionId:String(auth.appSessionId||''),
  contactId:String(message.currentContactId||''),
  conversationId:String(message.currentConversationId||''),
  authenticated:auth.state==='AUTHENTICATED'&&message.ready===true,
  route:String(shell.route||'')
 };
}
function sameScope(a,b){
 return Boolean(a&&b&&a.authenticated&&b.authenticated&&
  a.accountId===b.accountId&&a.appSessionId===b.appSessionId&&
  a.contactId===b.contactId&&a.conversationId===b.conversationId&&
  a.route==='chat'&&b.route==='chat');
}
function close({restoreFocus=true}={}){
 if(!overlay)return false;
 const node=overlay;
 overlay=null;
 searchScope=null;
 if(scheduledFrame){cancelAnimationFrame(scheduledFrame);scheduledFrame=0;}
 node.remove();
 if(window.V21InteractionController?.snapshot?.().owner===OWNER){
  window.V21InteractionController.exit(MODE,{owner:OWNER});
 }
 const focus=returnFocus;returnFocus=null;
 if(restoreFocus&&focus?.isConnected){
  window.setTimeout(()=>{try{focus.focus({preventScroll:true});}catch{}},0);
 }
 return true;
}
function formatTime(timestamp){
 const ms=Number(timestamp);
 if(!(ms>0))return 'Không có giờ';
 const date=new Date(ms);
 if(Number.isNaN(date.getTime()))return 'Không có giờ';
 return date.toLocaleString('vi-VN',{
  timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:false
 });
}
function open(){
 const initial=scope();
 if(!initial.authenticated||!initial.contactId||initial.route!=='chat')return false;
 close({restoreFocus:false});
 const lease=window.V21InteractionController?.enter?.(
  MODE,{owner:OWNER,lockBaseUi:true}
 );
 if(!lease)return false;
 const root=document.querySelector('[data-global-overlay-root]');
 if(!root){
  window.V21InteractionController?.exit?.(MODE,{owner:OWNER});
  return false;
 }
 returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 searchScope=initial;
 const node=document.createElement('div');
 // Reuse the single platform-owned viewport/keyboard rules for the existing
 // message-forward sheet, rather than registering a competing iOS listener.
 node.className='message-forward-overlay conversation-search-overlay';
 node.innerHTML=`
  <button type="button" class="message-forward-backdrop" data-search-close aria-label="Đóng tìm kiếm"></button>
  <section class="message-forward-card conversation-search-card" role="dialog" aria-modal="true" aria-label="Tìm tin trong hội thoại">
   <div class="message-forward-head">
    <h2 class="message-forward-title">Tìm tin nhắn</h2>
    <button type="button" class="message-forward-close conversation-search-close" data-search-close aria-label="Đóng">×</button>
   </div>
   <input class="message-forward-search conversation-search-input" type="search" inputmode="search" autocomplete="off" maxlength="120" placeholder="Tìm nội dung tin nhắn…" aria-label="Tìm trong tin đã tải">
   <p class="conversation-search-status" role="status" aria-live="polite">Nhập ít nhất 2 ký tự để tìm.</p>
   <div class="message-forward-list conversation-search-results" role="list" aria-label="Kết quả tìm kiếm"></div>
   <p class="conversation-search-note">Chỉ tìm trong tin đã tải của hội thoại này. Để tìm tin cũ hơn, mở “Xem tin / ngày cũ hơn” rồi tìm lại.</p>
  </section>`;
 root.appendChild(node);
 overlay=node;
 const input=node.querySelector('.conversation-search-input');
 const results=node.querySelector('.conversation-search-results');
 const status=node.querySelector('.conversation-search-status');
 const render=()=>{
  if(overlay!==node)return;
  if(!sameScope(searchScope,scope())){close({restoreFocus:false});return;}
  const value=String(input?.value||'').trim();
  results.replaceChildren();
  if(value.length<2){
   status.textContent='Nhập ít nhất 2 ký tự để tìm.';
   return;
  }
  const found=window.V21ConversationBridge?.searchLoaded?.({query:value,limit:60});
  if(!found){
   status.textContent='Chưa thể tìm trong hội thoại này.';
   return;
  }
  status.textContent=found.total
   ?`Có ${found.total} tin phù hợp trong ${found.loaded} tin đã tải`+
     (found.total>found.hits.length?` · hiển thị ${found.hits.length} tin mới nhất`:'')
   :`Không tìm thấy trong ${found.loaded} tin đã tải.`;
  for(const hit of found.hits){
   const button=document.createElement('button');
   button.type='button';
   button.className='conversation-search-hit';
   button.setAttribute('role','listitem');
   button.setAttribute('aria-label','Xem tin nhắn '+formatTime(hit.createdAt));
   const meta=document.createElement('span');
   meta.className='conversation-search-hit-meta';
   meta.textContent=(hit.sender==='self'?'Bạn':'Khách')+' · '+formatTime(hit.createdAt);
   const preview=document.createElement('span');
   preview.className='conversation-search-hit-preview';
   preview.textContent=hit.preview;
   button.append(meta,preview);
   button.addEventListener('click',()=>{
    if(!sameScope(searchScope,scope())){close({restoreFocus:false});return;}
    const opened=window.V21ConversationBridge?.revealLoadedMessage?.(hit.id)===true;
    if(opened)close({restoreFocus:false});
    else status.textContent='Tin này đã thay đổi. Hãy tìm lại.';
   });
   results.appendChild(button);
  }
 };
 const schedule=()=>{
  if(scheduledFrame)cancelAnimationFrame(scheduledFrame);
  scheduledFrame=requestAnimationFrame(()=>{scheduledFrame=0;render();});
 };
 input?.addEventListener('input',schedule);
 for(const button of node.querySelectorAll('[data-search-close]')){
  button.addEventListener('click',()=>close());
 }
 node.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();close();return;
  }
  if(event.key!=='Tab')return;
  const focusable=[...node.querySelectorAll('input,button')].filter(element=>
   !element.disabled&&element.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){
   event.preventDefault();last.focus({preventScroll:true});
  }else if(!event.shiftKey&&document.activeElement===last){
   event.preventDefault();first.focus({preventScroll:true});
  }
 });
 render();
 window.setTimeout(()=>{if(overlay===node)input?.focus({preventScroll:true});},0);
 return true;
}

// Every account/contact/route transition invalidates cached result identity.
// In-flight UI frames cannot revive private results after a scope change.
document.addEventListener('v21-active-contact-change',()=>close({restoreFocus:false}));
document.addEventListener('v21-conversation-switch',event=>{
 if(event?.detail?.phase==='start')close({restoreFocus:false});
});
document.addEventListener('v21-auth-state',()=>{
 if(overlay&&!sameScope(searchScope,scope()))close({restoreFocus:false});
});
document.addEventListener('navigation-change',event=>{
 if(event?.detail?.route!=='chat')close({restoreFocus:false});
});
document.addEventListener('v21-interaction-abort',()=>close({restoreFocus:false}));
window.V21ConversationSearch=Object.freeze({open,close,isOpen:()=>Boolean(overlay)});
})();
