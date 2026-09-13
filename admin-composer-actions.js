(()=>{
'use strict';

const MENU_ID='composerActionMenu';
const SECTION_ATTR='data-admin-composer-section';
const ACTION_ATTR='data-admin-composer-action';
const ORDER_ATTR='data-admin-order-action';
const QUOTE_MODAL_MODE='QUOTE_MODAL';
const QUOTE_MODAL_OWNER='admin-quote-modal';
const ORDER_MODAL_MODE='ORDER_MODAL';
const ORDER_MODAL_OWNER='admin-order-modal';
let quoteModulePromise=null;
let quoteOverlay=null;
let quoteReturnFocus=null;
let orderOverlay=null;
let orderReturnFocus=null;
let lastChatSelection='';
let transientHintTimer=0;

function authStore(){return window.V21AuthSessionStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function activeContactId(){
  const messageState=window.V21MessageStore?.snapshot?.()||{};
  const fromMessage=String(messageState.currentContactId||'').trim();
  if(fromMessage)return fromMessage;
  const shellState=window.ChatAppShell?.ScreenSession?.snapshot?.()||{};
  return String(shellState.activeContact?.id||'').trim();
}
function interactionController(){return window.V21InteractionController||null;}
function lockModal(mode,owner){
  return interactionController()?.enter?.(mode,{owner,lockBaseUi:true})||null;
}
function unlockModal(mode,owner){
  return Boolean(interactionController()?.exit?.(mode,{owner}));
}
function lockQuoteBackground(){
  const lease=lockModal(QUOTE_MODAL_MODE,QUOTE_MODAL_OWNER);
  if(!lease)return false;
  quoteReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{quoteReturnFocus?.blur?.();}catch{}
  return true;
}
function unlockQuoteBackground({restoreFocus=true}={}){
  unlockModal(QUOTE_MODAL_MODE,QUOTE_MODAL_OWNER);
  const returnFocus=quoteReturnFocus;
  quoteReturnFocus=null;
  if(restoreFocus&&returnFocus?.isConnected){
    window.setTimeout(()=>{try{returnFocus.focus({preventScroll:true});}catch{}},0);
  }
}
function lockOrderBackground(){
  const lease=lockModal(ORDER_MODAL_MODE,ORDER_MODAL_OWNER);
  if(!lease)return false;
  orderReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{orderReturnFocus?.blur?.();}catch{}
  return true;
}
function unlockOrderBackground({restoreFocus=true}={}){
  unlockModal(ORDER_MODAL_MODE,ORDER_MODAL_OWNER);
  const returnFocus=orderReturnFocus;
  orderReturnFocus=null;
  if(restoreFocus&&returnFocus?.isConnected){
    window.setTimeout(()=>{try{returnFocus.focus({preventScroll:true});}catch{}},0);
  }
}
function actionMenu(){return document.getElementById(MENU_ID);}
function menuSurface(){return actionMenu()?.querySelector?.('.composer-action-menu-surface')||null;}
function isPopoverOpen(node){
  if(!node)return false;
  try{return node.matches(':popover-open');}catch{return node.dataset.adminOpen==='true';}
}
function hideMenu(){
  const menu=actionMenu();
  if(!menu)return false;
  try{menu.hidePopover?.();}catch{}
  menu.dataset.adminOpen='false';
  return true;
}
function showMenu(){
  const menu=actionMenu();
  if(!menu)return false;
  try{menu.showPopover?.();}catch{}
  menu.dataset.adminOpen='true';
  return true;
}
function setTransientHint(text,duration=1800){
  const hint=document.getElementById('composerHint');
  if(!hint)return;
  if(transientHintTimer)clearTimeout(transientHintTimer);
  const previous=hint.textContent;
  const next=String(text||'');
  hint.textContent=next;
  transientHintTimer=window.setTimeout(()=>{
    transientHintTimer=0;
    if(hint.textContent===next)hint.textContent=previous;
  },Math.max(600,Number(duration)||1800));
}
function selectedChatText(){
  const selected=String(window.getSelection?.()?.toString?.()||'').replace(/\r\n?/g,'\n').trim();
  return selected||lastChatSelection;
}
function captureChatSelection(){
  if(orderOverlay||quoteOverlay)return;
  const selection=window.getSelection?.();
  const text=String(selection?.toString?.()||'').replace(/\r\n?/g,'\n').trim();
  if(!text)return;
  const anchor=selection?.anchorNode instanceof Node?selection.anchorNode:null;
  const element=anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement;
  const insideChat=element instanceof Element&&Boolean(element.closest('#messageWindow,#scrollRoot,[data-chat-thread-node]'));
  if(insideChat)lastChatSelection=text;
}

function installStyle(){
  if(document.getElementById('v21-admin-composer-actions-style'))return;
  const style=document.createElement('style');
  style.id='v21-admin-composer-actions-style';
  style.textContent=`
    html[data-admin-composer-actions="true"] [data-quote-admin-block],
    html[data-admin-composer-actions="true"] [data-call-invite-admin-block]{display:none!important}
    .admin-composer-menu-label{padding:7px 12px 4px;color:var(--theme-content-tertiary,#888);font-size:11px;font-weight:700;line-height:14px;text-transform:uppercase;letter-spacing:.04em}
    .admin-composer-menu-divider{height:1px;margin:6px 8px;background:var(--theme-border-default,#e5e5e5)}
    .admin-composer-menu-note{margin-left:auto;color:var(--theme-content-tertiary,#999);font-size:11px;font-weight:500}
    .admin-composer-menu-item[disabled]{opacity:.48;cursor:default}
    .admin-composer-quote-overlay,.admin-composer-order-overlay{position:fixed;inset:0;z-index:170;display:grid;place-items:center;padding:18px;pointer-events:auto}
    .admin-composer-quote-backdrop,.admin-composer-order-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)}
    .admin-composer-quote-card,.admin-composer-order-card{position:relative;z-index:1;width:min(92vw,390px);display:grid;gap:12px;padding:16px;border:1px solid var(--theme-border-default,#dedede);border-radius:20px;background:var(--theme-surface-primary,#fff);box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .admin-composer-quote-title,.admin-composer-order-title{margin:0;font-size:17px;font-weight:700}
    .admin-composer-quote-scopes,.admin-composer-order-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .admin-composer-quote-scopes button,.admin-composer-quote-send,.admin-composer-quote-cancel,.admin-composer-order-modes button,.admin-composer-order-close,.admin-composer-order-copy{min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;background:var(--theme-surface-secondary,#f5f5f5);color:var(--theme-content-primary,#171717);font:inherit;font-weight:650;cursor:pointer}
    .admin-composer-quote-scopes button[data-active="true"],.admin-composer-order-modes button[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-source{width:100%;min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;padding:0 10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit}
    .admin-composer-quote-source[hidden],.admin-composer-order-result[hidden]{display:none}
    .admin-composer-quote-status,.admin-composer-order-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .admin-composer-quote-actions,.admin-composer-order-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
    .admin-composer-quote-send,.admin-composer-order-copy{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-send:disabled,.admin-composer-quote-cancel:disabled,.admin-composer-order-modes button:disabled,.admin-composer-order-copy:disabled,.admin-composer-order-close:disabled{opacity:.5;cursor:default}
    .admin-composer-order-note{margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:17px}
    .admin-composer-order-result{max-height:min(48vh,360px);overflow:auto;margin:0;padding:11px 12px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;background:var(--theme-surface-secondary,#f7f7f7);white-space:pre-wrap;font:500 14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--theme-content-primary,#171717)}
  `;
  document.head.appendChild(style);
}

function iconSvg(kind){
  const icons={
    quote:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 4h14v16H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    call:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7.2 4.5 10 8l-1.8 2.2c1.2 2.5 3.1 4.4 5.6 5.6L16 14l3.5 2.8-.9 2.7c-.3.8-1.1 1.3-2 1.2C9.4 19.8 4.2 14.6 3.3 7.4c-.1-.9.4-1.7 1.2-2l2.7-.9Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    order:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 4h10l2 3v13H5V7l2-3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  return icons[kind]||icons.order;
}
function actionButton({action='',label='',kind='order',order=false}={}){
  const button=document.createElement('button');
  button.type='button';
  button.className='composer-action-menu-item admin-composer-menu-item';
  button.setAttribute('role','menuitem');
  if(order){
    button.setAttribute(ORDER_ATTR,action);
    button.disabled=true;
  }else{
    button.setAttribute(ACTION_ATTR,action);
  }
  button.innerHTML=`<span class="composer-action-menu-icon" aria-hidden="true">${iconSvg(kind)}</span><span class="composer-action-menu-label">${label}</span>${order?'<span class="admin-composer-menu-note">Sắp có</span>':''}`;
  return button;
}
function makeLabel(text){
  const node=document.createElement('div');
  node.className='admin-composer-menu-label';
  node.textContent=text;
  return node;
}
function makeDivider(){
  const node=document.createElement('div');
  node.className='admin-composer-menu-divider';
  node.setAttribute('aria-hidden','true');
  return node;
}
function ensureAdminMenu(){
  installStyle();
  const surface=menuSurface();
  if(!surface)return null;
  let section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(!section){
    const sendLabel=makeLabel('Gửi');
    sendLabel.dataset.adminComposerSendLabel='';
    surface.insertBefore(sendLabel,surface.firstChild);
    section=document.createElement('div');
    section.setAttribute(SECTION_ATTR,'');
    section.append(
      actionButton({action:'quote',label:'Báo giá',kind:'quote'}),
      actionButton({action:'call-link',label:'Link gọi',kind:'call'}),
      makeDivider(),
      makeLabel('Đơn'),
      actionButton({action:'create',label:'Tạo đơn',kind:'order',order:false}),
      actionButton({action:'draft',label:'Đơn tạm',order:true}),
      actionButton({action:'delivered',label:'Đã giao',order:true}),
      actionButton({action:'debt',label:'Công nợ',order:true}),
    );
    surface.appendChild(section);
  }
  syncVisibility();
  return section;
}
function syncVisibility(){
  const admin=Boolean(currentAdmin());
  const contact=activeContactId();
  document.documentElement.dataset.adminComposerActions=String(admin);
  const surface=menuSurface();
  if(!surface)return admin;
  const label=surface.querySelector('[data-admin-composer-send-label]');
  const section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(label)label.hidden=!admin;
  if(section)section.hidden=!admin;
  if(section){
    for(const button of section.querySelectorAll(`[${ACTION_ATTR}]`))button.disabled=!contact;
  }
  return admin;
}

async function quoteClient(){
  if(window.V21QuoteClient)return window.V21QuoteClient;
  if(!quoteModulePromise)quoteModulePromise=import('./quote-client.js').then(()=>window.V21QuoteClient||null);
  return quoteModulePromise;
}
async function sendQuoteTextLink(url,contactId){
  const text=String(url||'').trim();
  const target=String(contactId||'').trim();
  if(!text||!target)throw new Error('conversation_not_ready');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const messageState=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`quote-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  if(messageStore?.send&&messageState.ready&&String(messageState.currentContactId||'')===target){
    await messageStore.send({clientId,text,contactId:target,conversationId:messageState.currentConversationId||null,reply:null});
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({clientId,text,contactId:target,conversationId:null,reply:null});
  }
  void sync?.wake?.({reason:'quote-link-send'});
  return true;
}
function closeQuote({restoreFocus=true}={}){
  const hadOverlay=Boolean(quoteOverlay);
  if(quoteOverlay){quoteOverlay.remove();quoteOverlay=null;}
  unlockQuoteBackground({restoreFocus});
  return hadOverlay;
}
async function openQuote(contactId){
  const client=await quoteClient();
  if(!client?.create)throw new Error('quote_client_unavailable');
  const overlayRoot=document.getElementById('globalOverlayRoot');
  if(!overlayRoot)throw new Error('quote_overlay_unavailable');
  closeQuote({restoreFocus:false});
  if(!lockQuoteBackground())throw new Error('quote_modal_busy');
  const sources=Array.isArray(client.sources)?client.sources:[];
  const overlay=document.createElement('section');
  overlay.className='admin-composer-quote-overlay';
  overlay.dataset.adminComposerQuote='';
  overlay.innerHTML=`
    <button type="button" class="admin-composer-quote-backdrop" data-quote-close aria-label="Đóng"></button>
    <div class="admin-composer-quote-card" role="dialog" aria-modal="true" aria-label="Báo giá">
      <h2 class="admin-composer-quote-title">Báo giá</h2>
      <div class="admin-composer-quote-scopes" role="group" aria-label="Phạm vi báo giá">
        <button type="button" data-quote-scope="all" data-active="true">Tất cả</button>
        <button type="button" data-quote-scope="source" data-active="false">Theo nguồn</button>
      </div>
      <select class="admin-composer-quote-source" data-quote-source hidden aria-label="Nguồn báo giá">${sources.map(([key,label])=>`<option value="${String(key)}">${String(label)}</option>`).join('')}</select>
      <p class="admin-composer-quote-status" data-quote-status></p>
      <div class="admin-composer-quote-actions">
        <button type="button" class="admin-composer-quote-cancel" data-quote-close>Hủy</button>
        <button type="button" class="admin-composer-quote-send" data-quote-send>Gửi báo giá</button>
      </div>
    </div>`;
  overlayRoot.appendChild(overlay);
  quoteOverlay=overlay;
  let scope='all';
  const source=overlay.querySelector('[data-quote-source]');
  const status=overlay.querySelector('[data-quote-status]');
  const send=overlay.querySelector('[data-quote-send]');
  const scopeButtons=[...overlay.querySelectorAll('[data-quote-scope]')];
  function setBusy(busy){
    send.disabled=Boolean(busy);
    for(const button of overlay.querySelectorAll('[data-quote-close]'))button.disabled=Boolean(busy);
  }
  for(const button of overlay.querySelectorAll('[data-quote-close]'))button.addEventListener('click',closeQuote);
  for(const button of scopeButtons)button.addEventListener('click',()=>{
    scope=button.dataset.quoteScope==='source'?'source':'all';
    for(const item of scopeButtons)item.dataset.active=String(item.dataset.quoteScope===scope);
    source.hidden=scope!=='source';
    status.textContent='';
  });
  send.addEventListener('click',async()=>{
    setBusy(true);status.textContent='Đang tạo và gửi…';
    try{
      const quote=await client.create({scope,sourceKey:scope==='source'?source.value:''});
      await sendQuoteTextLink(quote.url,contactId);
      closeQuote();
      setTransientHint('Đã gửi link báo giá');
    }catch(error){status.textContent=String(error?.message||error||'Không thể gửi báo giá');setBusy(false);}
  });
  return true;
}

function closeOrder({restoreFocus=true}={}){
  const hadOverlay=Boolean(orderOverlay);
  if(orderOverlay){orderOverlay.remove();orderOverlay=null;}
  unlockOrderBackground({restoreFocus});
  return hadOverlay;
}
function orderErrorText(error){
  const raw=String(error?.message||error||'Không thể tách đơn').replace(/^FunctionsHttpError:\s*/,'').trim();
  const known={
    quick_parse_failed:'Tin này không đủ rõ để tách nhanh. Chọn AI ghi đơn.',
    customer_message_not_found:'Chưa có tin khách để tạo đơn.',
    conversation_not_found:'Chưa tìm thấy đoạn chat.',
    ai_not_configured:'AI ghi đơn chưa được cấu hình.',
    ai_request_failed:'AI ghi đơn đang lỗi, thử lại sau.',
    ai_response_invalid:'AI trả kết quả không hợp lệ.',
    invalid_ai_span:'AI không giữ được nguyên văn. Kết quả đã bị từ chối.',
    ai_items_missing:'AI chưa tách được mặt hàng.',
  };
  return known[raw]||raw;
}
async function invokeOrderScribe(mode,contactId,text=''){
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const sessionResult=await client.auth.getSession();
  const accessToken=String(sessionResult?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const {data,error}=await client.functions.invoke('v21-order-scribe',{
    body:{action:mode,contactId,text:String(text||'')},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(error)throw new Error(String(data?.error||error?.message||'order_scribe_failed'));
  if(!data?.ok)throw new Error(String(data?.error||'order_scribe_failed'));
  return data;
}
async function copyText(value){
  const text=String(value||'');
  if(!text)return false;
  await navigator.clipboard.writeText(text);
  return true;
}
async function openOrder(contactId){
  const overlayRoot=document.getElementById('globalOverlayRoot');
  if(!overlayRoot)throw new Error('order_overlay_unavailable');
  closeOrder({restoreFocus:false});
  if(!lockOrderBackground())throw new Error('order_modal_busy');
  const sourceText=selectedChatText();
  const overlay=document.createElement('section');
  overlay.className='admin-composer-order-overlay';
  overlay.dataset.adminComposerOrder='';
  overlay.innerHTML=`
    <button type="button" class="admin-composer-order-backdrop" data-order-close aria-label="Đóng"></button>
    <div class="admin-composer-order-card" role="dialog" aria-modal="true" aria-label="Tạo đơn">
      <h2 class="admin-composer-order-title">Tạo đơn</h2>
      <p class="admin-composer-order-note">${sourceText?'Dùng đoạn tin đang chọn.':'Không chọn chữ: lấy tin khách mới nhất.'} Tên hàng luôn giữ nguyên văn.</p>
      <div class="admin-composer-order-modes" role="group" aria-label="Cách tách đơn">
        <button type="button" data-order-mode="quick">Tách nhanh</button>
        <button type="button" data-order-mode="ai">AI ghi đơn</button>
      </div>
      <p class="admin-composer-order-status" data-order-status>Chọn cách tách.</p>
      <pre class="admin-composer-order-result" data-order-result hidden></pre>
      <div class="admin-composer-order-actions">
        <button type="button" class="admin-composer-order-close" data-order-close>Đóng</button>
        <button type="button" class="admin-composer-order-copy" data-order-copy disabled>Sao chép</button>
      </div>
    </div>`;
  overlayRoot.appendChild(overlay);
  orderOverlay=overlay;
  const status=overlay.querySelector('[data-order-status]');
  const result=overlay.querySelector('[data-order-result]');
  const copy=overlay.querySelector('[data-order-copy]');
  const modeButtons=[...overlay.querySelectorAll('[data-order-mode]')];
  let output='';
  function setBusy(busy){
    for(const button of modeButtons)button.disabled=Boolean(busy);
    for(const button of overlay.querySelectorAll('[data-order-close]'))button.disabled=Boolean(busy);
    copy.disabled=Boolean(busy)||!output;
  }
  for(const button of overlay.querySelectorAll('[data-order-close]'))button.addEventListener('click',closeOrder);
  for(const button of modeButtons)button.addEventListener('click',async()=>{
    const mode=String(button.dataset.orderMode||'');
    for(const item of modeButtons)item.dataset.active=String(item===button);
    output='';result.hidden=true;result.textContent='';setBusy(true);
    status.textContent=mode==='ai'?'AI đang ghi đơn…':'Đang tách nhanh…';
    try{
      const data=await invokeOrderScribe(mode,contactId,sourceText);
      output=String(data.text||'').trim();
      if(!output)throw new Error('order_scribe_empty');
      result.textContent=output;
      result.hidden=false;
      status.textContent=`${Array.isArray(data.items)?data.items.length:0} dòng · ${data.source==='selection'?'đoạn đã chọn':'tin khách mới nhất'}`;
    }catch(error){
      status.textContent=orderErrorText(error);
    }finally{setBusy(false);}
  });
  copy.addEventListener('click',async()=>{
    if(!output)return;
    try{await copyText(output);status.textContent='Đã sao chép';}catch{status.textContent='Không thể sao chép';}
  });
  return true;
}

async function runAction(action){
  const contactId=activeContactId();
  if(!currentAdmin()||!contactId)return false;
  hideMenu();
  if(action==='quote'){
    try{return await openQuote(contactId);}catch{setTransientHint('Không thể mở báo giá');return false;}
  }
  if(action==='call-link'){
    const client=window.TaphoaCallInviteClient||null;
    if(!client?.createAndSend){setTransientHint('Link gọi chưa sẵn sàng');return false;}
    setTransientHint('Đang gửi link gọi…',2400);
    try{await client.createAndSend({contactId});setTransientHint('Đã gửi link gọi');return true;}
    catch{setTransientHint('Không thể gửi link gọi',2600);return false;}
  }
  if(action==='create'){
    try{return await openOrder(contactId);}catch{setTransientHint('Không thể mở tạo đơn');return false;}
  }
  return false;
}

function bind(){
  const plus=document.getElementById('composer-plus-btn');
  if(!plus)return false;
  ensureAdminMenu();
  plus.addEventListener('click',event=>{
    if(!currentAdmin())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ensureAdminMenu();
    const menu=actionMenu();
    if(!menu)return;
    isPopoverOpen(menu)?hideMenu():showMenu();
  },true);
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const button=target?.closest?.(`[${ACTION_ATTR}]`);
    if(!button||button.disabled)return;
    event.preventDefault();
    event.stopPropagation();
    void runAction(String(button.getAttribute(ACTION_ATTR)||''));
  },true);
  document.addEventListener('selectionchange',captureChatSelection);
  document.addEventListener('v21-auth-state',()=>{ensureAdminMenu();syncVisibility();});
  document.addEventListener('v21-message-store-state',syncVisibility);
  document.addEventListener('navigation-change',()=>{lastChatSelection='';syncVisibility();});
  return true;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();

window.V21AdminComposerActions=Object.freeze({
  mount:ensureAdminMenu,
  run:runAction,
  openQuote,
  openOrder,
  activeContactId,
});
})();
