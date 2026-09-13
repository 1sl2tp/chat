(()=>{
'use strict';

const MENU_ID='composerActionMenu';
const SECTION_ATTR='data-admin-composer-section';
const ACTION_ATTR='data-admin-composer-action';
const ORDER_ATTR='data-admin-order-action';
const LEGACY_PROFILE_SELECTOR='[data-quote-admin-block],[data-call-invite-admin-block]';
let quoteModulePromise=null;
let quoteOverlay=null;
let transientHintTimer=0;
let suppressQueued=false;

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

function installStyle(){
  if(document.getElementById('v21-admin-composer-actions-style'))return;
  const style=document.createElement('style');
  style.id='v21-admin-composer-actions-style';
  style.textContent=`
    .admin-composer-menu-label{padding:7px 12px 4px;color:var(--theme-content-tertiary,#888);font-size:11px;font-weight:700;line-height:14px;text-transform:uppercase;letter-spacing:.04em}
    .admin-composer-menu-divider{height:1px;margin:6px 8px;background:var(--theme-border-default,#e5e5e5)}
    .admin-composer-menu-note{margin-left:auto;color:var(--theme-content-tertiary,#999);font-size:11px;font-weight:500}
    .admin-composer-menu-item[disabled]{opacity:.48;cursor:default}
    .admin-composer-quote-overlay{position:fixed;inset:0;z-index:170;display:grid;place-items:center;padding:18px}
    .admin-composer-quote-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)}
    .admin-composer-quote-card{position:relative;z-index:1;width:min(92vw,360px);display:grid;gap:12px;padding:16px;border:1px solid var(--theme-border-default,#dedede);border-radius:20px;background:var(--theme-surface-primary,#fff);box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .admin-composer-quote-title{margin:0;font-size:17px;font-weight:700}
    .admin-composer-quote-scopes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .admin-composer-quote-scopes button,.admin-composer-quote-send,.admin-composer-quote-cancel{min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;background:var(--theme-surface-secondary,#f5f5f5);color:var(--theme-content-primary,#171717);font:inherit;font-weight:650}
    .admin-composer-quote-scopes button[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-source{width:100%;min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;padding:0 10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit}
    .admin-composer-quote-source[hidden]{display:none}
    .admin-composer-quote-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .admin-composer-quote-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
    .admin-composer-quote-send{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-send:disabled,.admin-composer-quote-cancel:disabled{opacity:.5}
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
      actionButton({action:'create',label:'Tạo đơn',order:true}),
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
  const surface=menuSurface();
  if(!surface)return false;
  const label=surface.querySelector('[data-admin-composer-send-label]');
  const section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(label)label.hidden=!admin;
  if(section)section.hidden=!admin;
  if(section){
    for(const button of section.querySelectorAll(`[${ACTION_ATTR}]`)){
      button.disabled=!contact;
    }
  }
  return admin;
}

function suppressLegacyProfileActions(){
  let removed=false;
  for(const node of document.querySelectorAll(LEGACY_PROFILE_SELECTOR)){
    node.remove();
    removed=true;
  }
  return removed;
}
function scheduleLegacySuppression(){
  if(suppressQueued)return;
  suppressQueued=true;
  queueMicrotask(()=>{
    suppressQueued=false;
    suppressLegacyProfileActions();
  });
}

async function quoteClient(){
  if(window.V21QuoteClient)return window.V21QuoteClient;
  if(!quoteModulePromise){
    quoteModulePromise=import('./quote-client.js').then(()=>window.V21QuoteClient||null);
  }
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
  if(
    messageStore?.send&&
    messageState.ready&&
    String(messageState.currentContactId||'')===target
  ){
    await messageStore.send({
      clientId,
      text,
      contactId:target,
      conversationId:messageState.currentConversationId||null,
      reply:null,
    });
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({
      clientId,
      text,
      contactId:target,
      conversationId:null,
      reply:null,
    });
  }
  void sync?.wake?.({reason:'quote-link-send'});
  return true;
}
function closeQuote(){
  if(!quoteOverlay)return false;
  quoteOverlay.remove();
  quoteOverlay=null;
  return true;
}
async function openQuote(contactId){
  const client=await quoteClient();
  if(!client?.create)throw new Error('quote_client_unavailable');
  closeQuote();
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
  document.getElementById('globalOverlayRoot')?.appendChild(overlay);
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
    setBusy(true);
    status.textContent='Đang tạo và gửi…';
    try{
      const quote=await client.create({scope,sourceKey:scope==='source'?source.value:''});
      await sendQuoteTextLink(quote.url,contactId);
      closeQuote();
      setTransientHint('Đã gửi link báo giá');
    }catch(error){
      status.textContent=String(error?.message||error||'Không thể gửi báo giá');
      setBusy(false);
    }
  });
  return true;
}

async function runAction(action){
  const contactId=activeContactId();
  if(!currentAdmin()||!contactId)return false;
  hideMenu();
  if(action==='quote'){
    try{return await openQuote(contactId);}catch(error){setTransientHint('Không thể mở báo giá');return false;}
  }
  if(action==='call-link'){
    const client=window.TaphoaCallInviteClient||null;
    if(!client?.createAndSend){setTransientHint('Link gọi chưa sẵn sàng');return false;}
    setTransientHint('Đang gửi link gọi…',2400);
    try{
      await client.createAndSend({contactId});
      setTransientHint('Đã gửi link gọi');
      return true;
    }catch(error){
      setTransientHint('Không thể gửi link gọi',2600);
      return false;
    }
  }
  return false;
}

function bind(){
  const plus=document.getElementById('composer-plus-btn');
  if(!plus)return false;
  ensureAdminMenu();
  suppressLegacyProfileActions();
  new MutationObserver(scheduleLegacySuppression).observe(document.documentElement,{childList:true,subtree:true});
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
  document.addEventListener('v21-auth-state',()=>{ensureAdminMenu();syncVisibility();scheduleLegacySuppression();});
  document.addEventListener('v21-message-store-state',syncVisibility);
  document.addEventListener('navigation-change',syncVisibility);
  return true;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();

window.V21AdminComposerActions=Object.freeze({
  mount:ensureAdminMenu,
  run:runAction,
  openQuote,
  activeContactId,
  suppressLegacyProfileActions,
});
})();
