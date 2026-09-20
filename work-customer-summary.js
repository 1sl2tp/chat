(()=>{
'use strict';

const REFRESH_MS=60000;
const MOBILE_CHAT_SWIPE_DISTANCE_PX=48;
const MOBILE_CHAT_SWIPE_EDGE_INSET_PX=28;
const MOBILE_CHAT_SWIPE_DOMINANCE=1.2;
const MOBILE_TAB_DOUBLE_TAP_MS=250;
let timer=0;
let realtimeChannel=null;
let realtimeRefreshTimer=0;
let loading=false;
let generation=0;
let rowsCache=[];
let forceOverview=false;
let selectedWorkCustomerId='';
let mobileSwipe=null;
let mobileConversationReturnState={kind:'directory',contact:null};
let mobileAccountMenu=null;
let mobileTopTabTap={key:'',timer:0,lastAt:0};
let pendingReorderKey='';
const completionBusy=new Set();

function root(){return document.querySelector('[data-work-summary-root]');}
function authStore(){return window.V21AuthSessionStore||null;}
function snapshot(){return authStore()?.snapshot?.()||{state:'BOOTING',account:null};}
function client(){return authStore()?.getClient?.()||null;}
function shellSnapshot(){return window.ChatAppShell?.ScreenSession?.snapshot?.()||{route:'work',activeContact:null};}
function activeContact(){return shellSnapshot()?.activeContact||null;}
function navigation(){return window.ChatAppShell?.NavigationCommand||null;}
function mobileDirectoryAllowed(){
  return !window.matchMedia?.('(min-width:64rem) and (hover:hover) and (pointer:fine)')?.matches;
}

function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined&&text!==null)el.textContent=String(text);
  return el;
}

function syncDirectoryChatTab(isDirectory=true){
  const tab=document.querySelector('[data-top-tab="chat"]');
  if(!tab)return false;
  if(!isDirectory)return true;
  const label=tab.querySelector('[data-chat-tab-label]');
  const avatar=tab.querySelector('[data-chat-tab-avatar]');
  if(label)label.textContent='Trò chuyện';
  if(avatar)avatar.hidden=true;
  tab.removeAttribute('data-contact-identity');
  return true;
}

function resetWorkSelectionForDirectory(){
  selectedWorkCustomerId='';
  forceOverview=true;
  return true;
}

function mobileDirectoryOpen(){
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
  if(snapshot().state!=='AUTHENTICATED'){
    hideMobileDirectory('guest-auth');
    navigation()?.openChat?.();
    window.ChatAppShell?.AuthUI?.openLogin?.();
    return false;
  }
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
      <button type="button" class="mobile-account-menu-row" role="menuitem" data-mobile-account-action="directory">Danh bạ</button>
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
    if(action==='directory'){
      navigation()?.openChat?.();
      showMobileDirectory('account-menu-directory');
      return;
    }
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
  if(snapshot().state!=='AUTHENTICATED'){
    closeMobileAccountMenu();
    hideMobileDirectory('guest-auth');
    navigation()?.openChat?.();
    window.ChatAppShell?.AuthUI?.openLogin?.();
    return true;
  }
  const menu=ensureMobileAccountMenu();
  if(!menu)return false;
  menu.hidden=false;
  menu.dataset.open='true';
  return true;
}

function swipeIgnoredTarget(target){
  return Boolean(target?.closest?.('textarea,input,select,button,a,[role="button"],[contenteditable="true"],#thread-bottom-container'));
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
    if(touch.clientX<MOBILE_CHAT_SWIPE_EDGE_INSET_PX||touch.clientX>window.innerWidth-MOBILE_CHAT_SWIPE_EDGE_INSET_PX){
      reset();
      return;
    }
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

function runMobileTopTabSingle(key){
  if(key==='chat'){
    if(shellSnapshot().route==='work')restoreConversationFromWork('chat-tab');
    else if(!activeContact()?.id&&!mobileDirectoryOpen())showMobileDirectory('chat-tab');
    return;
  }
  if(key==='work'&&shellSnapshot().route!=='work')openWorkFromMobileConversation('work-tab');
}

function runMobileTopTabDouble(key){
  if(key==='chat'){
    navigation()?.openChat?.();
    showMobileDirectory('chat-tab-double');
    return;
  }
  if(key==='work'){
    if(shellSnapshot().route!=='work')rememberConversationBeforeWork();
    hideMobileDirectory('work-tab-double');
    selectedWorkCustomerId='';
    forceOverview=true;
    resetWorkSelectionForDirectory();
    navigation()?.openWork?.();
    pinWorkOuterScroll();
    renderCurrent();
  }
}

function handleMobileTopTabTap(key){
  const now=Date.now();
  if(mobileTopTabTap.timer&&mobileTopTabTap.key===key&&now-mobileTopTabTap.lastAt<=MOBILE_TAB_DOUBLE_TAP_MS){
    clearTimeout(mobileTopTabTap.timer);
    mobileTopTabTap={key:'',timer:0,lastAt:0};
    runMobileTopTabDouble(key);
    return true;
  }
  if(mobileTopTabTap.timer){
    clearTimeout(mobileTopTabTap.timer);
    const previous=mobileTopTabTap.key;
    mobileTopTabTap={key:'',timer:0,lastAt:0};
    runMobileTopTabSingle(previous);
  }
  mobileTopTabTap.key=key;
  mobileTopTabTap.lastAt=now;
  mobileTopTabTap.timer=window.setTimeout(()=>{
    const pending=mobileTopTabTap.key;
    mobileTopTabTap={key:'',timer:0,lastAt:0};
    runMobileTopTabSingle(pending);
  },MOBILE_TAB_DOUBLE_TAP_MS);
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
      handleMobileTopTabTap('chat');
      return;
    }

    const workTab=target.closest('[data-top-tab="work"],[data-nav-target="work"]');
    if(workTab){
      event.preventDefault();
      event.stopImmediatePropagation();
      handleMobileTopTabTap('work');
    }
  },true);
  return true;
}

function itemName(item={}){
  return String(item?.name||item?.rawEvidence||'').trim();
}

function numericQuantity(item={}){
  if(item?.quantity===null||item?.quantity===undefined||item?.quantity==='')return null;
  const quantity=Number(item.quantity);
  return Number.isFinite(quantity)&&quantity>0?quantity:null;
}

function validSummaryItems(result={}){
  const items=Array.isArray(result?.items)?result.items:[];
  return items.filter(item=>Boolean(String(item?.name||'').trim())&&numericQuantity(item)!==null);
}

function summaryProductCount(items=[]){
  return items.reduce((sum,item)=>sum+(numericQuantity(item)||0),0);
}

function formatNumber(value){
  const n=Number(value);
  if(!Number.isFinite(n))return String(value??'');
  if(Number.isInteger(n))return String(n);
  try{return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(n);}
  catch{return String(n);}
}

function quantityText(item={}){
  const quantity=numericQuantity(item);
  return quantity===null?'?':formatNumber(quantity);
}

function resultFor(row={}){
  const result=row?.result_json&&typeof row.result_json==='object'?row.result_json:{};
  void result.totalLines;
  void result.totals;
  return result;
}

function rowSummary(row={}){
  const remainingRecords=reconcileRecords(row).filter(record=>!record.completed);
  const items=remainingRecords.map(record=>record.item);
  return{
    row,
    items,
    codeCount:items.length,
    productCount:summaryProductCount(items)
  };
}

function normalizeKeyText(value){
  return String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
}

function itemBaseKey(item={}){
  return `v1|${normalizeKeyText(itemName(item))}|${formatNumber(numericQuantity(item))}`;
}

function reconcileRecords(row={}){
  const completed=new Set((Array.isArray(row?.completed_item_keys)?row.completed_item_keys:[]).map(String));
  const occurrences=new Map();
  return validSummaryItems(resultFor(row)).map((item,index)=>{
    const base=itemBaseKey(item);
    const occurrence=(occurrences.get(base)||0)+1;
    occurrences.set(base,occurrence);
    const itemKey=`${base}|${occurrence}`;
    return{item,index,itemKey,completed:completed.has(itemKey)};
  });
}

function recordSourceMessageIndex(record={}){
  const value=Number(record?.item?.sourceMessageIndex);
  return Number.isFinite(value)&&value>=0?value:null;
}

function sortItemsForReconcile(records=[]){
  return records.slice().sort((a,b)=>{
    const aCompleted=Boolean(a.completed)&&a.itemKey!==pendingReorderKey;
    const bCompleted=Boolean(b.completed)&&b.itemKey!==pendingReorderKey;
    if(aCompleted!==bCompleted)return aCompleted?1:-1;

    if(!aCompleted&&!bCompleted){
      const aSource=recordSourceMessageIndex(a);
      const bSource=recordSourceMessageIndex(b);
      if(aSource!==null||bSource!==null){
        if(aSource===null)return 1;
        if(bSource===null)return -1;
        if(aSource!==bSource)return bSource-aSource;
      }
    }

    // Preserve the customer's line order inside one source message.
    return Number(a.index)-Number(b.index);
  });
}

function detailBody(){
  return root()?.querySelector?.('.work-summary-body.work-summary-detail')||null;
}

function captureDetailScroll(){
  const body=detailBody();
  return body?Number(body.scrollTop)||0:0;
}

function restoreDetailScroll(scrollTop=0){
  const body=detailBody();
  if(!body)return false;
  body.scrollTop=Math.max(0,Number(scrollTop)||0);
  return true;
}

function renderShell(message,kind='muted'){
  const host=root();
  if(!host)return;
  host.replaceChildren();
  const shell=node('div',`work-summary-state work-summary-state-${kind}`);
  shell.setAttribute('role',kind==='error'?'alert':'status');
  shell.setAttribute('aria-live',kind==='error'?'assertive':'polite');
  shell.append(node('strong','work-summary-state-title','Tổng hợp hàng hóa'));
  shell.append(node('span','work-summary-state-text',message));
  host.append(shell);
}

function renderOverviewRow(summary,index){
  const row=summary.row||{};
  const customerId=String(row.customer_id||'');
  const customerName=row.display_name||row.username||'Khách hàng';
  const card=node('button','work-summary-overview-row work-summary-customer work-summary-overview-grid-row');
  card.type='button';
  card.dataset.customerId=customerId;
  card.dataset.workSummaryCustomer=customerId;
  card.setAttribute('aria-label',`Mở công việc của ${customerName}`);
  card.append(node('span','work-summary-overview-index',String(index+1)));
  card.append(node('span','work-summary-overview-name',customerName));
  card.append(node('span','work-summary-overview-code',formatNumber(summary.codeCount)));
  card.append(node('span','work-summary-overview-product',formatNumber(summary.productCount)));
  return card;
}

function renderOverview(rows=[]){
  const host=root();
  if(!host)return;
  host.replaceChildren();

  const summaries=rows.map(rowSummary).filter(summary=>summary.codeCount>0);
  const header=node('div','work-summary-header');
  const title=node('div','work-summary-header-title');
  title.append(node('strong','work-summary-heading','Tổng hợp'));
  title.append(node('span','work-summary-subheading',`${summaries.length} khách có hàng`));
  header.append(title);
  host.append(header);

  if(!summaries.length){
    const empty=node('div','work-summary-state work-summary-state-muted','Chưa có khách nào có hàng chưa hoàn thành.');
    empty.setAttribute('role','status');
    empty.setAttribute('aria-live','polite');
    host.append(empty);
    return;
  }

  const body=node('div','work-summary-body work-summary-overview');
  const grid=node('div','work-summary-overview-grid');
  const head=node('div','work-summary-overview-head work-summary-overview-grid-row');
  head.append(node('span','work-summary-overview-index','STT'));
  head.append(node('span','work-summary-overview-name','Tên'));
  head.append(node('span','work-summary-overview-code','Mã'));
  head.append(node('span','work-summary-overview-product','Sản phẩm'));
  grid.append(head);
  const listScroll=node('div','work-summary-overview-list-scroll');
  summaries.forEach((summary,index)=>listScroll.append(renderOverviewRow(summary,index)));
  grid.append(listScroll);

  const totalCodes=summaries.reduce((sum,summary)=>sum+summary.codeCount,0);
  const totalProducts=summaries.reduce((sum,summary)=>sum+summary.productCount,0);
  const total=node('div','work-summary-overview-grand-total work-summary-overview-grid-row');
  total.append(node('span','work-summary-overview-index',''));
  total.append(node('strong','work-summary-overview-name','Tổng'));
  total.append(node('strong','work-summary-overview-code',formatNumber(totalCodes)));
  total.append(node('strong','work-summary-overview-product',formatNumber(totalProducts)));
  grid.append(total);

  body.append(grid);
  host.append(body);
}

function renderDetailItem(record,customerId){
  const {item,itemKey,completed}=record;
  const li=node('li',`work-summary-item${completed?' is-completed':''}${itemKey===pendingReorderKey?' is-just-updated':''}`);
  li.dataset.itemKey=itemKey;

  const toggle=node('button','work-summary-check');
  const busyKey=`${String(customerId||'')}::${String(itemKey||'')}`;
  const busy=completionBusy.has(busyKey);
  toggle.type='button';
  toggle.dataset.workItemToggle='true';
  toggle.dataset.customerId=String(customerId||'');
  toggle.dataset.itemKey=itemKey;
  toggle.setAttribute('role','checkbox');
  toggle.setAttribute('aria-checked',String(completed));
  toggle.setAttribute('aria-busy',String(busy));
  toggle.setAttribute('aria-label',completed?'Bỏ đánh dấu hoàn thành':'Đánh dấu hoàn thành');
  toggle.disabled=busy;
  toggle.textContent=completed?'✓':'';

  const main=node('div','work-summary-item-main');
  main.append(node('span','work-summary-item-name',itemName(item)||'Chưa rõ'));
  main.append(node('strong','work-summary-item-qty',quantityText(item)));
  li.append(toggle,main);
  return li;
}

function workDetailBackMode(){
  if(!mobileDirectoryAllowed())return 'overview';
  if(shellSnapshot().route!=='work')return 'overview';
  if(selectedWorkCustomerId)return 'overview';
  return mobileConversationReturnState?.kind==='contact'?'conversation':'overview';
}

function renderCustomerDetail(row,contact){
  const host=root();
  if(!host)return;
  host.replaceChildren();

  const customerId=String(row?.customer_id||contact?.id||'');
  const allRecords=row?reconcileRecords(row):[];
  const records=sortItemsForReconcile(allRecords);
  const remainingRecords=allRecords.filter(record=>!record.completed);
  const remainingProductCount=summaryProductCount(remainingRecords.map(record=>record.item));

  const header=node('div','work-summary-header work-summary-detail-header');
  const backMode=workDetailBackMode();
  const all=node('button','work-summary-all',backMode==='conversation'?'Quay lại':'Tất cả');
  all.type='button';
  all.dataset.workSummaryAll='true';
  if(backMode==='conversation')all.dataset.workSummaryBack='conversation';
  else all.dataset.workSummaryBack='overview';
  const title=node('div','work-summary-header-title');
  title.append(node('strong','work-summary-heading',row?.display_name||row?.username||contact?.name||'Khách hàng'));
  title.append(node('span','work-summary-subheading',`${remainingRecords.length} mã · ${formatNumber(remainingProductCount)} sản phẩm`));
  header.append(all,title);
  host.append(header);

  if(!records.length){
    const empty=node('div','work-summary-state work-summary-state-muted','Khách này chưa có dòng hàng đủ tên và số lượng.');
    empty.setAttribute('role','status');
    empty.setAttribute('aria-live','polite');
    host.append(empty);
    return;
  }

  const body=node('div','work-summary-body work-summary-detail');
  const list=node('ol','work-summary-list');
  records.forEach(record=>list.append(renderDetailItem(record,customerId)));
  body.append(list);
  host.append(body);
}

function openOverviewCustomer(customerId){
  const id=String(customerId||'');
  const row=rowsCache.find(item=>String(item?.customer_id||'')===id)||null;
  if(!id||!row)return false;
  selectedWorkCustomerId=id;
  forceOverview=false;
  renderCustomerDetail(row,{id,name:row.display_name||row.username||'Khách hàng'});
  return true;
}

function renderCurrent(){
  const contact=activeContact();
  if(forceOverview){
    renderOverview(rowsCache);
    return;
  }
  const targetId=String(selectedWorkCustomerId||contact?.id||'');
  if(!targetId){
    renderOverview(rowsCache);
    return;
  }
  const row=rowsCache.find(item=>String(item?.customer_id||'')===targetId)||null;
  const context=selectedWorkCustomerId
    ?{id:targetId,name:row?.display_name||row?.username||'Khách hàng'}
    :contact;
  renderCustomerDetail(row,context);
}

function setCachedCompleted(row,itemKey,completed){
  const set=new Set((Array.isArray(row?.completed_item_keys)?row.completed_item_keys:[]).map(String));
  if(completed)set.add(String(itemKey));
  else set.delete(String(itemKey));
  row.completed_item_keys=Array.from(set);
}

function syncCompletionControlBusy(customerId,itemKey,busy){
  const host=root();
  if(!host)return false;
  const targetCustomer=String(customerId||'');
  const targetItem=String(itemKey||'');
  let changed=false;
  host.querySelectorAll('[data-work-item-toggle]').forEach(control=>{
    if(String(control.dataset.customerId||'')!==targetCustomer)return;
    if(String(control.dataset.itemKey||'')!==targetItem)return;
    control.disabled=Boolean(busy);
    control.setAttribute('aria-busy',String(Boolean(busy)));
    changed=true;
  });
  return changed;
}

async function setCompleted(customerId,itemKey,completed){
  const db=client();
  const key=`${customerId}::${itemKey}`;
  if(!db||completionBusy.has(key))return false;
  const row=rowsCache.find(item=>String(item?.customer_id||'')===String(customerId))||null;
  if(!row)return false;

  completionBusy.add(key);
  const before=Array.isArray(row.completed_item_keys)?row.completed_item_keys.slice():[];
  const scrollTop=captureDetailScroll();
  pendingReorderKey=String(itemKey);
  setCachedCompleted(row,itemKey,completed);
  renderCurrent();
  syncCompletionControlBusy(customerId,itemKey,true);
  restoreDetailScroll(scrollTop);

  const reorderTimer=window.setTimeout(()=>{
    if(pendingReorderKey!==String(itemKey))return;
    const currentScroll=captureDetailScroll();
    pendingReorderKey='';
    renderCurrent();
    restoreDetailScroll(currentScroll);
  },360);

  try{
    const {error}=await db.rpc('chat_customer_summary_set_completed',{
      p_customer_id:String(customerId),
      p_item_key:String(itemKey),
      p_completed:Boolean(completed)
    });
    if(error)throw error;
    return true;
  }catch(error){
    window.clearTimeout(reorderTimer);
    row.completed_item_keys=before;
    if(pendingReorderKey===String(itemKey))pendingReorderKey='';
    const rollbackScroll=captureDetailScroll();
    renderCurrent();
    restoreDetailScroll(rollbackScroll);
    console.error('[work-customer-summary completion]',error);
    return false;
  }finally{
    completionBusy.delete(key);
    syncCompletionControlBusy(customerId,itemKey,false);
  }
}

async function refresh(reason='timer'){
  const host=root();
  if(!host||loading)return false;
  const auth=snapshot();
  if(auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin'){
    rowsCache=[];
    renderShell('Đăng nhập Admin để xem kết quả quét.');
    return false;
  }
  const db=client();
  if(!db){renderShell('Chưa sẵn sàng kết nối dữ liệu.','error');return false;}

  loading=true;
  const detailScrollTop=captureDetailScroll();
  const requestGeneration=++generation;
  host.dataset.loading='true';
  if(!rowsCache.length)renderShell('Đang tải kết quả quét…');
  try{
    const {data,error}=await db.rpc('chat_customer_summary_work_feed');
    if(error)throw error;
    if(requestGeneration!==generation)return false;
    rowsCache=Array.isArray(data)?data.map(row=>({...row})):[];
    renderCurrent();
    restoreDetailScroll(detailScrollTop);
    if(shellSnapshot().route==='work')pinWorkOuterScroll();
    host.dataset.lastRefreshReason=String(reason||'refresh');
    host.dataset.lastRefreshedAt=new Date().toISOString();
    return true;
  }catch(error){
    console.error('[work-customer-summary]',error);
    renderShell('Không tải được tổng hợp hàng hóa.','error');
    return false;
  }finally{
    loading=false;
    host.removeAttribute('data-loading');
  }
}

function stopRealtimeSubscription(){
  if(realtimeRefreshTimer){clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=0;}
  const db=client();
  if(realtimeChannel&&db?.removeChannel)void db.removeChannel(realtimeChannel);
  realtimeChannel=null;
}

function scheduleRealtimeRefresh(reason='realtime-summary'){
  if(realtimeRefreshTimer)clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=window.setTimeout(()=>{
    realtimeRefreshTimer=0;
    void refresh(reason);
  },160);
}

function syncRealtimeSubscription(){
  stopRealtimeSubscription();
  const auth=snapshot();
  const db=client();
  if(auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin'||!db?.channel)return false;
  realtimeChannel=db
    .channel(`work-customer-summary-${String(auth.account?.id||'admin').slice(0,8)}`)
    .on('postgres_changes',{
      event:'*',
      schema:'public',
      table:'chat_customer_summary_state'
    },()=>scheduleRealtimeRefresh('realtime-summary'))
    .subscribe();
  return true;
}

function schedule(){
  if(timer)clearInterval(timer);
  timer=window.setInterval(()=>{void refresh('interval');},REFRESH_MS);
}

document.addEventListener('v21-auth-state',()=>{
  syncRealtimeSubscription();
  selectedWorkCustomerId='';
  forceOverview=false;
  mobileConversationReturnState={kind:'directory',contact:null};
  closeMobileAccountMenu();
  const auth=snapshot();
  if(mobileDirectoryAllowed()&&auth.state!=='AUTHENTICATED'){
    hideMobileDirectory('guest-auth');
    navigation()?.openChat?.();
    window.ChatAppShell?.AuthUI?.openLogin?.();
  }else if(mobileDirectoryAllowed()&&auth.state==='AUTHENTICATED'&&shellSnapshot().route==='chat'&&!activeContact()?.id){
    showMobileDirectory('auth-directory');
  }
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
  if(document.visibilityState==='visible'){
    if(!realtimeChannel)syncRealtimeSubscription();
    void refresh('visible');
  }
});
document.addEventListener('click',event=>{
  const all=event.target?.closest?.('[data-work-summary-all]');
  if(all){
    if(all.dataset.workSummaryBack==='conversation'&&mobileDirectoryAllowed()){
      restoreConversationFromWork('work-detail-back');
      return;
    }
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
syncRealtimeSubscription();
void refresh('boot');
window.addEventListener('beforeunload',stopRealtimeSubscription,{once:true});
window.setTimeout(()=>{
  const auth=snapshot();
  if(auth.state==='AUTHENTICATED'&&shellSnapshot().route==='chat'&&mobileDirectoryAllowed()){
    mobileConversationReturnState={kind:'directory',contact:null};
    showMobileDirectory('chat-default');
  }else if(auth.state==='GUEST'&&mobileDirectoryAllowed()){
    hideMobileDirectory('guest-boot');
    navigation()?.openChat?.();
    window.ChatAppShell?.AuthUI?.openLogin?.();
  }
},0);

window.V21WorkCustomerSummary=Object.freeze({
  refresh,
  renderCurrent,
  showMobileDirectory,
  hideMobileDirectory,
  openWorkFromMobileConversation,
  restoreConversationFromWork,
  openMobileAccountMenu,
  closeMobileAccountMenu,
  syncRealtimeSubscription,
  stopRealtimeSubscription
});
})();
