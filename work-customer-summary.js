(()=>{
'use strict';

const REFRESH_MS=60000;
const MOBILE_CHAT_SWIPE_DISTANCE_PX=56;
const MOBILE_CHAT_SWIPE_DOMINANCE=1.2;
let timer=0;
let loading=false;
let generation=0;
let rowsCache=[];
let forceOverview=false;
let selectedWorkCustomerId='';
let mobileSwipe=null;
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
  return !window.matchMedia?.('(min-width:68rem) and (hover:hover) and (pointer:fine)')?.matches;
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

function showMobileDirectory(reason='directory'){
  if(!mobileDirectoryAllowed())return false;
  const app=document.getElementById('appShell');
  const layer=document.getElementById('shellNavigationLayer');
  if(!app||!layer)return false;
  app.dataset.mobileDirectory='true';
  layer.dataset.mobileDirectory='true';
  layer.dataset.open='true';
  layer.setAttribute('aria-hidden','false');
  app.dataset.mobileDirectoryReason=String(reason||'directory');
  resetWorkSelectionForDirectory();
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

function swipeIgnoredTarget(target){
  return Boolean(target?.closest?.('textarea,input,select,[contenteditable="true"],button,a,#thread-bottom-container'));
}

function bindMobileChatSwipe(){
  const chat=document.getElementById('chatScreen');
  if(!chat)return false;

  const reset=()=>{mobileSwipe=null;};
  const onTouchStart=event=>{
    if(!mobileDirectoryAllowed()||shellSnapshot().route!=='chat'||event.touches?.length!==1||swipeIgnoredTarget(event.target)){
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
    event.stopImmediatePropagation();
    if(event.cancelable)event.preventDefault();
    if(dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX){
      showMobileDirectory('swipe-left');
      return;
    }
    if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX){
      hideMobileDirectory('swipe-right-work');
      selectedWorkCustomerId='';
      forceOverview=false;
      navigation()?.openWork?.();
      pinWorkOuterScroll();
      renderCurrent();
    }
  };
  const onTouchCancel=()=>reset();

  chat.addEventListener('touchstart',onTouchStart,{passive:true});
  chat.addEventListener('touchmove',onTouchMove,{passive:false});
  chat.addEventListener('touchend',onTouchEnd,{passive:false});
  chat.addEventListener('touchcancel',onTouchCancel,{passive:true});
  return true;
}

function bindLegacyEdgeSwipeBlocker(){
  const app=document.getElementById('appShell');
  if(!app)return false;
  let edgeSwipe=null;
  const reset=()=>{edgeSwipe=null;};

  const onTouchStart=event=>{
    if(!mobileDirectoryAllowed()||event.touches?.length!==1||event.target?.closest?.('#chatScreen')){
      reset();
      return;
    }
    const touch=event.touches[0];
    if(touch.clientX>30){reset();return;}
    edgeSwipe={startX:touch.clientX,startY:touch.clientY};
  };
  const onTouchMove=event=>{
    if(!edgeSwipe||event.touches?.length!==1)return;
    const touch=event.touches[0];
    const dx=touch.clientX-edgeSwipe.startX;
    const dy=touch.clientY-edgeSwipe.startY;
    if(dx>12&&dx>Math.abs(dy)*MOBILE_CHAT_SWIPE_DOMINANCE){
      if(event.cancelable)event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const onTouchEnd=event=>{
    if(!edgeSwipe)return;
    const state=edgeSwipe;
    const touch=event.changedTouches?.[0];
    reset();
    if(!touch)return;
    const dx=touch.clientX-state.startX;
    const dy=touch.clientY-state.startY;
    if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX&&dx>Math.abs(dy)*MOBILE_CHAT_SWIPE_DOMINANCE){
      if(event.cancelable)event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  app.addEventListener('touchstart',onTouchStart,{passive:true,capture:true});
  app.addEventListener('touchmove',onTouchMove,{passive:false,capture:true});
  app.addEventListener('touchend',onTouchEnd,{passive:false,capture:true});
  app.addEventListener('touchcancel',reset,{passive:true,capture:true});
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

function sortItemsForReconcile(records=[]){
  return records.slice().sort((a,b)=>{
    const aCompleted=Boolean(a.completed)&&a.itemKey!==pendingReorderKey;
    const bCompleted=Boolean(b.completed)&&b.itemKey!==pendingReorderKey;
    if(aCompleted!==bCompleted)return aCompleted?1:-1;
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
  shell.append(node('strong','work-summary-state-title','Tổng hợp hàng hóa'));
  shell.append(node('span','work-summary-state-text',message));
  host.append(shell);
}

function renderOverviewRow(summary,index){
  const row=summary.row||{};
  const customerId=String(row.customer_id||'');
  const card=node('div','work-summary-overview-row work-summary-customer work-summary-overview-grid-row');
  card.dataset.customerId=customerId;
  card.append(node('span','work-summary-overview-index',String(index+1)));
  const name=node('button','work-summary-overview-name',row.display_name||row.username||'Khách hàng');
  name.type='button';
  name.setAttribute('data-work-summary-customer',customerId);
  name.setAttribute('aria-label',`Mở công việc của ${row.display_name||row.username||'khách hàng'}`);
  card.append(name);
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
    host.append(node('div','work-summary-state work-summary-state-muted','Chưa có khách nào có hàng chưa hoàn thành.'));
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
  toggle.type='button';
  toggle.dataset.workItemToggle='true';
  toggle.dataset.customerId=String(customerId||'');
  toggle.dataset.itemKey=itemKey;
  toggle.setAttribute('role','checkbox');
  toggle.setAttribute('aria-checked',String(completed));
  toggle.setAttribute('aria-label',completed?'Bỏ đánh dấu hoàn thành':'Đánh dấu hoàn thành');
  toggle.textContent=completed?'✓':'';

  const main=node('div','work-summary-item-main');
  main.append(node('span','work-summary-item-name',itemName(item)||'Chưa rõ'));
  main.append(node('strong','work-summary-item-qty',quantityText(item)));
  li.append(toggle,main);
  return li;
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
  const all=node('button','work-summary-all','Tất cả');
  all.type='button';
  all.dataset.workSummaryAll='true';
  const title=node('div','work-summary-header-title');
  title.append(node('strong','work-summary-heading',row?.display_name||row?.username||contact?.name||'Khách hàng'));
  title.append(node('span','work-summary-subheading',`${remainingRecords.length} mã · ${formatNumber(remainingProductCount)} sản phẩm`));
  header.append(all,title);
  host.append(header);

  if(!records.length){
    host.append(node('div','work-summary-state work-summary-state-muted','Khách này chưa có dòng hàng đủ tên và số lượng.'));
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

function schedule(){
  if(timer)clearInterval(timer);
  timer=window.setInterval(()=>{void refresh('interval');},REFRESH_MS);
}

document.addEventListener('v21-auth-state',()=>{
  selectedWorkCustomerId='';
  forceOverview=false;
  void refresh('auth-state');
});
document.addEventListener('v21-active-contact-change',()=>{
  hideMobileDirectory('contact-selected');
  selectedWorkCustomerId='';
  forceOverview=false;
  renderCurrent();
});
document.addEventListener('navigation-change',event=>{
  if(event?.detail?.route==='work'){
    hideMobileDirectory('work-route');
    pinWorkOuterScroll();
    renderCurrent();
    return;
  }
  if(event?.detail?.route==='chat'&&activeContact()?.id){
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
    return;
  }

  const chatTab=event.target?.closest?.('[data-top-tab="chat"]');
  if(chatTab&&mobileDirectoryAllowed()){
    window.queueMicrotask(()=>showMobileDirectory('chat-tab'));
    return;
  }

  const directoryButton=event.target?.closest?.('[data-shell-command="sidebar.open"]');
  if(directoryButton&&mobileDirectoryAllowed()){
    window.queueMicrotask(()=>showMobileDirectory('menu-button'));
    return;
  }

  const workTarget=event.target?.closest?.('[data-top-tab="work"],[data-nav-target="work"]');
  if(workTarget){
    const app=document.getElementById('appShell');
    if(app?.dataset.mobileDirectory==='true')resetWorkSelectionForDirectory();
    hideMobileDirectory('work-tab');
    pinWorkOuterScroll();
    void refresh('open-work');
  }
});

bindMobileChatSwipe();
bindLegacyEdgeSwipeBlocker();
schedule();
void refresh('boot');
window.setTimeout(()=>{
  if(shellSnapshot().route==='chat'&&mobileDirectoryAllowed())showMobileDirectory('chat-default');
},0);

window.V21WorkCustomerSummary=Object.freeze({
  refresh,
  renderCurrent,
  showMobileDirectory,
  hideMobileDirectory
});
})();
