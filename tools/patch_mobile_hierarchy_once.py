from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# ---- work-customer-summary.js ----
work_path = ROOT / 'work-customer-summary.js'
work = work_path.read_text('utf-8')

old = "let mobileSwipe=null;\nlet pendingReorderKey='';"
new = "let mobileSwipe=null;\nlet mobileConversationReturnState={kind:'directory',contact:null};\nlet mobileAccountMenu=null;\nlet pendingReorderKey='';"
assert old in work, 'missing mobile state insertion point'
work = work.replace(old, new, 1)

nav_block = r'''function showMobileDirectory\(reason='directory'\)\{.*?\nfunction itemName'''
nav_replacement = r'''function mobileDirectoryOpen(){
  const app=document.getElementById('appShell');
  return Boolean(app?.dataset?.mobileDirectory==='true');
}

function conversationStateNow(){
  if(mobileDirectoryOpen())return{kind:'directory',contact:null};
  const contact=activeContact();
  if(contact?.id){
    return{kind:'contact',contact:{id:String(contact.id),name:String(contact.name||'Liên hệ')}};
  }
  return{kind:'directory',contact:null};
}

function rememberConversationBeforeWork(){
  mobileConversationReturnState=conversationStateNow();
  if(mobileConversationReturnState.kind==='directory')resetWorkSelectionForDirectory();
  else{
    selectedWorkCustomerId='';
    forceOverview=false;
  }
  return mobileConversationReturnState;
}

function showMobileDirectory(reason='directory'){
  if(!mobileDirectoryAllowed())return false;
  const app=document.getElementById('appShell');
  const layer=document.getElementById('shellNavigationLayer');
  if(!app||!layer)return false;
  closeMobileAccountMenu();
  app.dataset.mobileDirectory='true';
  layer.dataset.mobileDirectory='true';
  layer.dataset.open='true';
  layer.setAttribute('aria-hidden','false');
  app.dataset.mobileDirectoryReason=String(reason||'directory');
  resetWorkSelectionForDirectory();
  navigation()?.clearActiveContact?.();
  syncDirectoryChatTab(true);
  void window.V21ContactStore?.refresh?.();
  return true;
}

function hideMobileDirectory(reason='chat'){
  const app=document.getElementById('appShell');
  const layer=document.getElementById('shellNavigationLayer');
  if(!app||!layer)return false;
  app.dataset.mobileDirectory='false';
  layer.dataset.mobileDirectory='false';
  app.dataset.mobileDirectoryReason=String(reason||'chat');
  if(app.dataset.desktopSidebarPersistent!=='true'){
    layer.dataset.open='false';
    layer.setAttribute('aria-hidden','true');
  }
  return true;
}

function pinWorkOuterScroll(){
  if(shellSnapshot().route!=='work')return false;
  const scroll=document.getElementById('scrollRoot');
  if(!scroll)return false;
  scroll.scrollTop=0;
  return true;
}

function openWorkFromMobileConversation(reason='mobile-work'){
  if(!mobileDirectoryAllowed())return false;
  const previous=rememberConversationBeforeWork();
  hideMobileDirectory(reason);
  if(previous.kind==='directory')resetWorkSelectionForDirectory();
  else{
    selectedWorkCustomerId='';
    forceOverview=false;
  }
  navigation()?.openWork?.();
  pinWorkOuterScroll();
  renderCurrent();
  return true;
}

function restoreConversationFromWork(reason='work-back'){
  if(!mobileDirectoryAllowed())return false;
  const state=mobileConversationReturnState||{kind:'directory',contact:null};
  if(state.kind==='contact'&&state.contact?.id){
    hideMobileDirectory(reason);
    forceOverview=false;
    selectedWorkCustomerId='';
    navigation()?.openContact?.(state.contact.id,state.contact.name);
    return true;
  }
  navigation()?.openChat?.();
  showMobileDirectory(reason);
  return true;
}

function closeMobileAccountMenu(){
  if(!mobileAccountMenu)return false;
  mobileAccountMenu.dataset.open='false';
  mobileAccountMenu.hidden=true;
  return true;
}

function ensureMobileAccountMenu(){
  if(mobileAccountMenu?.isConnected)return mobileAccountMenu;
  const host=document.querySelector('[data-global-overlay-root]')||document.body;
  if(!host)return null;
  const wrap=document.createElement('div');
  wrap.className='mobile-account-menu';
  wrap.dataset.mobileAccountMenu='';
  wrap.dataset.open='false';
  wrap.hidden=true;
  wrap.innerHTML=`
    <button type="button" class="mobile-account-menu-backdrop" data-mobile-account-close aria-label="Đóng menu"></button>
    <div class="mobile-account-menu-panel" role="menu" aria-label="Tài khoản">
      <button type="button" class="mobile-account-menu-row" role="menuitem" data-mobile-account-action="account">Tài khoản</button>
      <button type="button" class="mobile-account-menu-row" role="menuitem" data-mobile-account-action="settings">Cài đặt</button>
      <button type="button" class="mobile-account-menu-row" role="menuitem" data-mobile-account-action="logout">Thoát</button>
    </div>`;
  wrap.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest('[data-mobile-account-close]')){
      closeMobileAccountMenu();
      return;
    }
    const action=target.closest('[data-mobile-account-action]')?.getAttribute('data-mobile-account-action')||'';
    if(!action)return;
    closeMobileAccountMenu();
    if(action==='account'){
      document.querySelector('[data-account-self-edit]')?.click?.();
      return;
    }
    if(action==='settings'){
      void window.V21ZaloAccountAdmin?.open?.();
      return;
    }
    if(action==='logout'){
      const logout=document.querySelector('[data-auth-command="logout"]');
      if(logout)logout.click();
      else window.V21AuthSessionStore?.logout?.();
    }
  });
  host.appendChild(wrap);
  mobileAccountMenu=wrap;
  return wrap;
}

function openMobileAccountMenu(){
  if(!mobileDirectoryAllowed())return false;
  const menu=ensureMobileAccountMenu();
  if(!menu)return false;
  menu.hidden=false;
  menu.dataset.open='true';
  return true;
}

function swipeIgnoredTarget(target){
  return Boolean(target?.closest?.('textarea,input,select,[contenteditable="true"],#thread-bottom-container'));
}

function bindMobileHierarchySwipe(){
  const app=document.getElementById('appShell');
  if(!app)return false;
  const reset=()=>{mobileSwipe=null;};
  const onTouchStart=event=>{
    if(!mobileDirectoryAllowed()||event.touches?.length!==1||swipeIgnoredTarget(event.target)||mobileAccountMenu?.dataset.open==='true'){
      reset();
      return;
    }
    const touch=event.touches[0];
    mobileSwipe={startX:touch.clientX,startY:touch.clientY,claimed:false};
  };
  const onTouchMove=event=>{
    if(!mobileSwipe||event.touches?.length!==1)return;
    const touch=event.touches[0];
    const dx=touch.clientX-mobileSwipe.startX;
    const dy=touch.clientY-mobileSwipe.startY;
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>18){reset();return;}
    if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*MOBILE_CHAT_SWIPE_DOMINANCE){
      mobileSwipe.claimed=true;
      if(event.cancelable)event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const onTouchEnd=event=>{
    if(!mobileSwipe)return;
    const state=mobileSwipe;
    const touch=event.changedTouches?.[0];
    reset();
    if(!touch)return;
    const dx=touch.clientX-state.startX;
    const dy=touch.clientY-state.startY;
    const horizontal=Math.abs(dx)>=MOBILE_CHAT_SWIPE_DISTANCE_PX&&Math.abs(dx)>Math.abs(dy)*MOBILE_CHAT_SWIPE_DOMINANCE;
    if(!horizontal)return;
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();

    const route=shellSnapshot().route;
    if(route==='work'){
      if(dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX)restoreConversationFromWork('swipe-left-chat');
      return;
    }
    if(route!=='chat')return;
    if(mobileDirectoryOpen()){
      if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX)openWorkFromMobileConversation('directory-swipe-right');
      return;
    }
    if(activeContact()?.id){
      if(dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX){
        showMobileDirectory('chat-swipe-left');
        return;
      }
      if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX)openWorkFromMobileConversation('chat-swipe-right');
      return;
    }
    if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX)openWorkFromMobileConversation('directory-swipe-right');
  };

  app.addEventListener('touchstart',onTouchStart,{passive:true,capture:true});
  app.addEventListener('touchmove',onTouchMove,{passive:false,capture:true});
  app.addEventListener('touchend',onTouchEnd,{passive:false,capture:true});
  app.addEventListener('touchcancel',reset,{passive:true,capture:true});
  return true;
}

function bindMobileNavigationClicks(){
  document.addEventListener('click',event=>{
    if(!mobileDirectoryAllowed())return;
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const hamburger=target.closest('[data-shell-command="sidebar.open"]');
    if(hamburger){
      event.preventDefault();
      event.stopImmediatePropagation();
      openMobileAccountMenu();
      return;
    }

    const chatTab=target.closest('[data-top-tab="chat"]');
    if(chatTab){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(shellSnapshot().route==='work')restoreConversationFromWork('chat-tab');
      else if(!activeContact()?.id&&!mobileDirectoryOpen())showMobileDirectory('chat-tab');
      return;
    }

    const workTab=target.closest('[data-top-tab="work"],[data-nav-target="work"]');
    if(workTab){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(shellSnapshot().route!=='work')openWorkFromMobileConversation('work-tab');
    }
  },true);
  return true;
}

function itemName'''

work, count = re.subn(nav_block, nav_replacement, work, count=1, flags=re.S)
assert count == 1, 'failed to replace mobile navigation block'

events_pattern = r'''document\.addEventListener\('v21-auth-state'.*?window\.V21WorkCustomerSummary=Object\.freeze\(\{'''
events_replacement = r'''document.addEventListener('v21-auth-state',()=>{
  selectedWorkCustomerId='';
  forceOverview=false;
  mobileConversationReturnState={kind:'directory',contact:null};
  closeMobileAccountMenu();
  void refresh('auth-state');
});
document.addEventListener('v21-active-contact-change',event=>{
  selectedWorkCustomerId='';
  if(event?.detail?.contact?.id){
    hideMobileDirectory('contact-selected');
    forceOverview=false;
  }else if(mobileDirectoryAllowed()&&mobileDirectoryOpen()){
    forceOverview=true;
  }
  renderCurrent();
});
document.addEventListener('navigation-will-change',event=>{
  if(!mobileDirectoryAllowed())return;
  if(event?.detail?.from==='chat'&&event?.detail?.to==='work')rememberConversationBeforeWork();
});
document.addEventListener('navigation-change',event=>{
  if(event?.detail?.route==='work'){
    hideMobileDirectory('work-route');
    pinWorkOuterScroll();
    renderCurrent();
    return;
  }
  if(event?.detail?.route==='chat'&&activeContact()?.id){
    hideMobileDirectory('chat-route-contact');
    forceOverview=false;
    renderCurrent();
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void refresh('visible');
});
document.addEventListener('click',event=>{
  const all=event.target?.closest?.('[data-work-summary-all]');
  if(all){
    selectedWorkCustomerId='';
    forceOverview=true;
    renderOverview(rowsCache);
    return;
  }

  const overviewCustomer=event.target?.closest?.('[data-work-summary-customer]');
  if(overviewCustomer){
    openOverviewCustomer(overviewCustomer.getAttribute('data-work-summary-customer'));
    return;
  }

  const toggle=event.target?.closest?.('[data-work-item-toggle]');
  if(toggle){
    const customerId=String(toggle.dataset.customerId||'');
    const itemKey=String(toggle.dataset.itemKey||'');
    const completed=toggle.getAttribute('aria-checked')!=='true';
    if(customerId&&itemKey)void setCompleted(customerId,itemKey,completed);
  }
});

bindMobileHierarchySwipe();
bindMobileNavigationClicks();
schedule();
void refresh('boot');
window.setTimeout(()=>{
  if(shellSnapshot().route==='chat'&&mobileDirectoryAllowed()){
    mobileConversationReturnState={kind:'directory',contact:null};
    showMobileDirectory('chat-default');
  }
},0);

window.V21WorkCustomerSummary=Object.freeze({'''

work, count = re.subn(events_pattern, events_replacement, work, count=1, flags=re.S)
assert count == 1, 'failed to replace mobile event wiring'

# Expose transition helpers for diagnostics/testing without changing their ownership.
work = work.replace(
    'refresh,\n  renderCurrent,\n  showMobileDirectory,\n  hideMobileDirectory',
    'refresh,\n  renderCurrent,\n  showMobileDirectory,\n  hideMobileDirectory,\n  openWorkFromMobileConversation,\n  restoreConversationFromWork,\n  openMobileAccountMenu,\n  closeMobileAccountMenu',
    1,
)

work_path.write_text(work, 'utf-8')

# ---- shell.js: physically retire the old left-edge mobile sidebar gesture ----
shell_path = ROOT / 'shell.js'
shell = shell_path.read_text('utf-8')
edge_pattern = r'''\nconst MOBILE_SIDEBAR_EDGE_PX=28;.*?\nbindMobileSidebarEdgeSwipe\(\);\n'''
shell, count = re.subn(edge_pattern, '\n', shell, count=1, flags=re.S)
assert count == 1, 'failed to remove legacy mobile edge sidebar gesture'

old_shell_click = """    if(command==='sidebar.open')setSidebar(true);\n    if(command==='sidebar.close')setSidebar(false);"""
new_shell_click = """    if(command==='sidebar.open'){\n      if(desktopSidebarPersistent)setSidebar(true);\n      return;\n    }\n    if(command==='sidebar.close')setSidebar(false);"""
assert old_shell_click in shell, 'missing shell sidebar click owner'
shell = shell.replace(old_shell_click, new_shell_click, 1)
shell_path.write_text(shell, 'utf-8')

# ---- work-customer-summary.css ----
style_path = ROOT / 'work-customer-summary.css'
style = style_path.read_text('utf-8')
append = r'''

/* Mobile hierarchy navigation: Danh bạ is a Trò chuyện screen; hamburger owns only account actions. */
@media(max-width:63.999rem){
  #appShell[data-mobile-directory="true"] #shellNavigationLayer .shell-sidebar-account-footer{
    display:none!important;
  }
  #appShell[data-route="chat"] #chatScreen,
  #appShell[data-mobile-directory="true"] #shellNavigationLayer,
  #appShell[data-route="work"] #workThreadView{
    touch-action:pan-y;
  }
  [data-mobile-account-menu]{
    position:fixed;
    inset:0;
    z-index:120;
    pointer-events:none;
  }
  [data-mobile-account-menu][data-open="true"]{
    pointer-events:auto;
  }
  [data-mobile-account-menu][hidden]{display:none!important;}
  .mobile-account-menu-backdrop{
    position:absolute;
    inset:0;
    border:0;
    background:transparent;
  }
  .mobile-account-menu-panel{
    position:absolute;
    top:calc(env(safe-area-inset-top,0px) + 58px);
    left:12px;
    width:190px;
    box-sizing:border-box;
    overflow:hidden;
    border:1px solid var(--theme-border-default);
    border-radius:14px;
    background:var(--theme-surface-primary);
    box-shadow:0 10px 32px color-mix(in srgb,var(--theme-content-primary) 14%,transparent);
  }
  .mobile-account-menu-row{
    display:flex;
    width:100%;
    min-height:46px;
    align-items:center;
    padding:0 14px;
    border:0;
    border-radius:0;
    background:transparent;
    color:var(--theme-content-primary);
    font:inherit;
    font-size:15px;
    line-height:20px;
    text-align:left;
  }
  .mobile-account-menu-row+.mobile-account-menu-row{
    border-top:1px solid color-mix(in srgb,var(--theme-border-default) 70%,transparent);
  }
  .mobile-account-menu-row:active{
    background:var(--theme-surface-secondary);
  }
}
'''
assert 'data-mobile-account-menu' not in style, 'mobile account menu CSS already exists'
style_path.write_text(style + append, 'utf-8')

print('patched mobile hierarchy swipe + account menu + retired edge drawer')
