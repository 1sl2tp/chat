(()=>{
'use strict';

const MENU_ID='composerActionMenu';
const SECTION_ATTR='data-admin-composer-section';
const ACTION_ATTR='data-admin-composer-action';
const QUOTE_MODAL_MODE='QUOTE_MODAL';
const QUOTE_MODAL_OWNER='admin-quote-modal';
let quoteModulePromise=null;
let quoteOverlay=null;
let credentialsOverlay=null;
let quoteReturnFocus=null;
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
function activeContact(){
  const id=activeContactId();
  if(!id)return null;
  const rows=window.V21ContactStore?.snapshot?.()||[];
  return rows.find(row=>String(row?.id||'')===id)||null;
}
function interactionController(){return window.V21InteractionController||null;}
function lockQuoteBackground(){
  const lease=interactionController()?.enter?.(QUOTE_MODAL_MODE,{owner:QUOTE_MODAL_OWNER,lockBaseUi:true});
  if(!lease)return false;
  quoteReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{quoteReturnFocus?.blur?.();}catch{}
  return true;
}
function unlockQuoteBackground({restoreFocus=true}={}){
  interactionController()?.exit?.(QUOTE_MODAL_MODE,{owner:QUOTE_MODAL_OWNER});
  const returnNode=quoteReturnFocus;
  quoteReturnFocus=null;
  if(restoreFocus&&returnNode?.isConnected){
    window.setTimeout(()=>{try{returnNode.focus({preventScroll:true});}catch{}},0);
  }
}

function actionMenu(){return document.getElementById(MENU_ID);}
function menuSurface(){return actionMenu()?.querySelector?.('.composer-action-menu-surface')||null;}
function hideMenu(){
  const owner=window.V21ComposerActionMenu;
  if(owner?.close){owner.close();return true;}
  const menu=actionMenu();
  if(!menu)return false;
  try{menu.hidePopover?.();}catch{}
  delete menu.dataset.fallbackOpen;
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


function iconSvg(kind){
  return window.V21Icons?.markup?.(kind,{size:22})||'';
}
function actionButton({action='',label='',kind='quote'}={}){
  const button=document.createElement('button');
  button.type='button';
  button.className='composer-action-menu-item admin-composer-menu-item';
  button.setAttribute('role','menuitem');
  button.setAttribute(ACTION_ATTR,action);
  button.innerHTML=`<span class="composer-action-menu-icon" aria-hidden="true">${iconSvg(kind)}</span><span class="composer-action-menu-label">${label}</span>`;
  return button;
}
function makeLabel(text){
  const node=document.createElement('div');
  node.className='admin-composer-menu-label';
  node.textContent=text;
  return node;
}
function ensureAdminMenu(){
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
      actionButton({action:'credentials',label:'Thông tin đăng nhập',kind:'key'}),
    );
    surface.insertBefore(section,sendLabel.nextSibling);
  }
  syncVisibility();
  return section;
}
function syncVisibility(){
  const admin=Boolean(currentAdmin());
  const contact=Boolean(activeContactId());
  document.documentElement.dataset.adminComposerActions=String(admin);
  const surface=menuSurface();
  if(!surface)return admin;
  const label=surface.querySelector('[data-admin-composer-send-label]');
  const section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(label)label.hidden=!admin;
  if(section)section.hidden=!admin;
  if(section){
    for(const button of section.querySelectorAll(`[${ACTION_ATTR}]`))button.disabled=!admin||!contact;
  }
  return admin;
}

async function quoteClient(){
  if(window.V21QuoteClient)return window.V21QuoteClient;
  if(!quoteModulePromise)quoteModulePromise=import('./quote-client.js').then(()=>window.V21QuoteClient||null);
  return quoteModulePromise;
}
async function sendAdminText(value,contactId,reason='admin-chat-send'){
  const text=String(value||'').trim();
  const target=String(contactId||'').trim();
  if(!text||!target)throw new Error('conversation_not_ready');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const messageState=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`admin-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  if(messageStore?.send&&messageState.ready&&String(messageState.currentContactId||'')===target){
    await messageStore.send({clientId,text,contactId:target,conversationId:messageState.currentConversationId||null,reply:null});
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({clientId,text,contactId:target,conversationId:null,reply:null});
  }
  void sync?.wake?.({reason});
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
  const root=document.getElementById('globalOverlayRoot');
  if(!root)throw new Error('quote_overlay_unavailable');
  closeQuote({restoreFocus:false});
  if(!lockQuoteBackground())throw new Error('quote_modal_busy');
  let sources=Array.isArray(client.sources)?client.sources:[];
  if(typeof client.listSources==='function'){
    try{sources=await client.listSources();}catch{}
  }
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
  root.appendChild(overlay);
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
      await sendAdminText(quote.url,contactId,'quote-link-send');
      closeQuote();
      setTransientHint('Đã gửi link báo giá');
    }catch(error){status.textContent=String(error?.message||error||'Không thể gửi báo giá');setBusy(false);}
  });
  return true;
}

function closeCredentials({restoreFocus=true}={}){
  const hadOverlay=Boolean(credentialsOverlay);
  if(credentialsOverlay){credentialsOverlay.remove();credentialsOverlay=null;}
  unlockQuoteBackground({restoreFocus});
  return hadOverlay;
}

async function openCredentials(contactId){
  const contact=activeContact();
  if(!contact||String(contact.id||'')!==String(contactId||''))throw new Error('contact_not_ready');
  const username=String(contact.username||'').trim().replace(/^@/,'');
  const displayName=String(contact.display_name||contact.name||username||'Khách hàng').trim();
  if(!username)throw new Error('username_missing');
  const root=document.getElementById('globalOverlayRoot');
  if(!root)throw new Error('credentials_overlay_unavailable');
  closeCredentials({restoreFocus:false});
  if(!lockQuoteBackground())throw new Error('credentials_modal_busy');

  const overlay=document.createElement('section');
  overlay.className='admin-composer-quote-overlay';
  overlay.dataset.adminComposerCredentials='';
  overlay.innerHTML=`
    <button type="button" class="admin-composer-quote-backdrop" data-credentials-close aria-label="Đóng"></button>
    <div class="admin-composer-quote-card" role="dialog" aria-modal="true" aria-label="Thông tin đăng nhập">
      <h2 class="admin-composer-quote-title">Thông tin đăng nhập</h2>
      <input class="admin-composer-quote-source" data-credentials-username value="${username}" readonly aria-label="Tên đăng nhập">
      <input class="admin-composer-quote-source" data-credentials-password type="password" autocomplete="new-password" minlength="6" maxlength="128" placeholder="Mật khẩu gửi cho khách" aria-label="Mật khẩu">
      <p class="admin-composer-quote-status" data-credentials-status>Nhập mật khẩu. Hệ thống sẽ đặt đúng mật khẩu này rồi gửi cho khách.</p>
      <div class="admin-composer-quote-actions">
        <button type="button" class="admin-composer-quote-cancel" data-credentials-close>Hủy</button>
        <button type="button" class="admin-composer-quote-send" data-credentials-send>Đặt mật khẩu & gửi</button>
      </div>
    </div>`;
  root.appendChild(overlay);
  credentialsOverlay=overlay;

  const password=overlay.querySelector('[data-credentials-password]');
  const status=overlay.querySelector('[data-credentials-status]');
  const send=overlay.querySelector('[data-credentials-send]');
  const closeButtons=[...overlay.querySelectorAll('[data-credentials-close]')];
  const setBusy=busy=>{
    send.disabled=Boolean(busy);
    password.disabled=Boolean(busy);
    for(const button of closeButtons)button.disabled=Boolean(busy);
  };
  for(const button of closeButtons)button.addEventListener('click',closeCredentials);
  send.addEventListener('click',async()=>{
    const plainPassword=String(password.value||'');
    if(plainPassword.length<6){
      status.textContent='Mật khẩu cần ít nhất 6 ký tự';
      password.focus({preventScroll:true});
      return;
    }
    setBusy(true);
    status.textContent='Đang đặt mật khẩu và gửi…';
    try{
      const profile=window.V21AccountProfileStore;
      if(!profile?.adminSaveUser)throw new Error('account_profile_unavailable');
      const result=await profile.adminSaveUser({
        targetAccountId:String(contactId),
        username,
        displayName,
        password:plainPassword,
      });
      if(!result?.ok)throw new Error(result?.message||'password_update_failed');
      const text=[
        'Thông tin đăng nhập TAPHOA Chat',
        `Tài khoản: ${username}`,
        `Mật khẩu: ${plainPassword}`,
        'Đăng nhập: https://chat.taphoa.xyz',
      ].join('\n');
      await sendAdminText(text,contactId,'account-credentials-send');
      password.value='';
      closeCredentials();
      setTransientHint('Đã gửi thông tin đăng nhập');
    }catch(error){
      status.textContent=String(error?.message||error||'Không thể gửi thông tin đăng nhập');
      setBusy(false);
    }
  });
  window.setTimeout(()=>password.focus({preventScroll:true}),0);
  return true;
}

async function runAction(action){
  if(!currentAdmin())return false;
  const contactId=activeContactId();
  if(!contactId)return false;
  hideMenu();
  if(action==='quote'){
    try{return await openQuote(contactId);}catch{setTransientHint('Không thể mở báo giá');return false;}
  }
  if(action==='credentials'){
    try{return await openCredentials(contactId);}catch{setTransientHint('Không thể mở thông tin đăng nhập');return false;}
  }
  if(action==='call-link'){
    const client=window.TaphoaCallInviteClient||null;
    if(!client?.createAndSend){setTransientHint('Link gọi chưa sẵn sàng');return false;}
    setTransientHint('Đang gửi link gọi…',2400);
    try{await client.createAndSend({contactId});setTransientHint('Đã gửi link gọi');return true;}
    catch{setTransientHint('Không thể gửi link gọi',2600);return false;}
  }
  return false;
}

function bind(){
  const plus=document.getElementById('composer-plus-btn');
  if(!plus)return false;
  ensureAdminMenu();
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const button=target?.closest?.(`[${ACTION_ATTR}]`);
    if(!button||button.disabled)return;
    event.preventDefault();
    event.stopPropagation();
    void runAction(String(button.getAttribute(ACTION_ATTR)||''));
  },true);
  document.addEventListener('v21-auth-state',()=>{ensureAdminMenu();syncVisibility();});
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
  openCredentials,
  activeContactId,
});
})();
