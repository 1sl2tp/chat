(()=>{
'use strict';

const OWNER='message-forward';
let overlay=null;
let returnFocus=null;

function mode(){
  return window.V21InteractionMode?.MESSAGE_FORWARD||'MESSAGE_FORWARD';
}

function searchKey(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g,' ')
    .trim();
}

function canForward(message){
  const auth=window.V21AuthSessionStore?.snapshot?.()||{};
  const id=String(message?.id||'');
  return auth.state==='AUTHENTICATED' &&
    auth.account?.role==='admin' &&
    String(message?.status||'sent')==='sent' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function contacts(){
  const active=String(window.V21MessageStore?.snapshot?.().currentContactId||'');
  const selfId=String(window.V21AuthSessionStore?.snapshot?.().account?.id||'');
  return (window.V21ContactStore?.snapshot?.()||[])
    .filter(contact=>contact?.id&&String(contact.id)!==active&&String(contact.id)!==selfId)
    .sort((a,b)=>String(a.display_name||a.username||'').localeCompare(String(b.display_name||b.username||''),'vi'));
}

function contactName(contact){
  return String(contact?.display_name||contact?.username||'Khách hàng').trim()||'Khách hàng';
}

function close({restoreFocus=true}={}){
  if(!overlay)return false;
  const current=overlay;
  overlay=null;
  current.remove();
  window.V21InteractionController?.exit?.(mode(),{owner:OWNER});
  const focus=returnFocus;
  returnFocus=null;
  if(restoreFocus&&focus?.isConnected){
    window.setTimeout(()=>{try{focus.focus({preventScroll:true});}catch{}},0);
  }
  return true;
}

async function forwardTo(message,contact,{statusNode=null,listNode=null}={}){
  const name=contactName(contact);
  if(statusNode)statusNode.textContent=`Đang chuyển tiếp tới ${name}…`;
  if(listNode)for(const button of listNode.querySelectorAll('button'))button.disabled=true;
  try{
    await window.V21SyncEngine?.forwardMessage?.({
      sourceMessageId:String(message?.id||''),
      text:String(message?.text||''),
      targetContactId:String(contact?.id||''),
      clientId:window.V21RuntimeId.create()
    });
    if(statusNode)statusNode.textContent=`Đã chuyển tiếp tới ${name}`;
    window.setTimeout(()=>close({restoreFocus:false}),220);
    return true;
  }catch(error){
    if(statusNode)statusNode.textContent='Không thể chuyển tiếp. Vui lòng thử lại.';
    if(listNode)for(const button of listNode.querySelectorAll('button'))button.disabled=false;
    console.warn('[message-forward] failed',error);
    return false;
  }
}

function open(message){
  if(!canForward(message))return false;
  close({restoreFocus:false});
  const lease=window.V21InteractionController?.enter?.(
    mode(),
    {owner:OWNER,lockBaseUi:true}
  );
  if(!lease)return false;

  returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const root=document.querySelector('[data-global-overlay-root]')||document.body;
  const node=document.createElement('div');
  node.className='message-forward-overlay';
  node.innerHTML=`
    <button type="button" class="message-forward-backdrop" data-forward-close aria-label="Đóng"></button>
    <section class="message-forward-card" role="dialog" aria-modal="true" aria-label="Chuyển tiếp tin nhắn">
      <div class="message-forward-head">
        <h2 class="message-forward-title">Chuyển tiếp</h2>
        <button type="button" class="message-forward-close" data-forward-close aria-label="Đóng"></button>
      </div>
      <input class="message-forward-search" type="search" inputmode="search" autocomplete="off" placeholder="Tìm khách hàng…" aria-label="Tìm khách hàng">
      <div class="message-forward-list" role="list"></div>
      <p class="message-forward-status" aria-live="polite"></p>
    </section>`;
  root.appendChild(node);
  overlay=node;

  const closeButton=node.querySelector('.message-forward-close');
  if(closeButton)closeButton.innerHTML=window.V21Icons?.markup?.('close',{size:20})||'×';
  const input=node.querySelector('.message-forward-search');
  const list=node.querySelector('.message-forward-list');
  const status=node.querySelector('.message-forward-status');
  const rows=contacts();

  const render=()=>{
    const query=searchKey(input?.value||'');
    const filtered=rows.filter(contact=>{
      if(!query)return true;
      return searchKey(`${contact.display_name||''} ${contact.username||''}`).includes(query);
    });
    list.replaceChildren();
    if(!filtered.length){
      const empty=document.createElement('div');
      empty.className='message-forward-empty';
      empty.textContent='Không tìm thấy khách hàng';
      list.appendChild(empty);
      return;
    }
    for(const contact of filtered){
      const button=document.createElement('button');
      button.type='button';
      button.className='message-forward-contact';
      button.setAttribute('role','listitem');
      const name=contactName(contact);
      const initials=name.split(/\s+/).filter(Boolean).slice(-2).map(part=>part[0]||'').join('').toUpperCase()||'KH';
      const avatar=document.createElement('span');
      avatar.className='message-forward-avatar';
      avatar.textContent=initials;
      const label=document.createElement('span');
      label.className='message-forward-name';
      label.textContent=name;
      button.append(avatar,label);
      button.addEventListener('click',()=>{void forwardTo(message,contact,{statusNode:status,listNode:list});});
      list.appendChild(button);
    }
  };

  for(const button of node.querySelectorAll('[data-forward-close]')){
    button.addEventListener('click',()=>close());
  }
  input?.addEventListener('input',render);
  node.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
  });
  render();
  window.setTimeout(()=>{try{input?.focus({preventScroll:true});}catch{}},0);
  return true;
}

document.addEventListener('v21-interaction-abort',()=>{
  if(overlay)close({restoreFocus:false});
});

window.V21MessageForward=Object.freeze({
  canForward,
  open,
  close,
  contacts
});
})();
