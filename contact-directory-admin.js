(()=>{
'use strict';

const GROUPS=Object.freeze([
  ['customer','KH'],
  ['cm','CM'],
  ['ncc','TK NCC'],
  ['friend','Bạn bè'],
  ['other','Khác'],
]);
const GROUP_KEYS=new Set(GROUPS.map(([key])=>key));
const PINNED_REPORT_ID='fc3ec480-60d2-4749-b7af-5f4ae71eb14e';
function isPinnedReportContact(item){
  // Pin only the canonical bank report contact; never pin a matching name.
  return String(item?.id||'')===PINNED_REPORT_ID;
}
let query='';
let filter='all';
// DIR-342: Admin sidebar is two real navigation scopes, not an extra
// contact group. Personal chats and NCC conversations stay in Trò chuyện.
let directorySection='chat';
let groupMap=new Map();
let loadedAdminId='';
let nccReady=false;
let loadingGroups=false;
let syncQueued=false;
let syncScrollToTop=false;

function authStore(){return window.V21AuthSessionStore||null;}
function contactStore(){return window.V21ContactStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function groupKey(value){
  const key=String(value||'').trim().toLowerCase();
  return GROUP_KEYS.has(key)?key:'other';
}
function groupForContact(contactId){
  const admin=currentAdmin();
  if(!admin?.id||String(loadedAdminId)!==String(admin.id))return null;
  return groupKey(groupMap.get(String(contactId||'')));
}
function syncNccCapability(){
  for(const button of document.querySelectorAll('[data-contact-directory-filter="ncc"]'))button.disabled=!nccReady;
  for(const option of document.querySelectorAll('[data-contact-group-select] option[value="ncc"]'))option.disabled=!nccReady;
}
function publishGroupsChanged(){
  document.dispatchEvent(new CustomEvent('v21-contact-groups-change'));
}
function normalizeText(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLocaleLowerCase('vi')
    .trim();
}
function activityTime(item){
  const parsed=Date.parse(String(item?.latest_at||''));
  return Number.isFinite(parsed)?parsed:0;
}
function sortDirectoryContacts(items=[],{reorder=true}={}){
  // Normalize once for both paths; search/filter must not bypass deleted-row guards.
  const active=[...(Array.isArray(items)?items:[])].filter(item=>item?.id&&!item?.deleted_at);
  if(!reorder)return active;
  return active.sort((a,b)=>{
    const pinned=Number(isPinnedReportContact(b))-Number(isPinnedReportContact(a));
    if(pinned)return pinned;
    const activity=activityTime(b)-activityTime(a);
    if(activity)return activity;
    return 0;
  });
}
async function invokeBody(body){
  const client=authStore()?.getClient?.();
  if(!client||!currentAdmin())throw new Error('admin_required');
  const {data,error}=await client.functions.invoke('v21-zalo-admin',{body});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.code||'directory_update_failed');
  return data;
}
function installStyle(){
  if(document.getElementById('contact-directory-admin-style'))return;
  const style=document.createElement('style');
  style.id='contact-directory-admin-style';
  style.textContent=`
    .contact-directory-tools{position:static;z-index:4;box-sizing:border-box;flex:0 0 auto;display:grid;gap:7px;padding:8px 8px 7px;background:var(--theme-surface-primary,#fff)}
    /* DIR-342: two distinct sidebar scopes, without changing header chat/photo routes. */
    .contact-directory-sections{display:grid;grid-template-columns:1fr 1fr;gap:3px;min-width:0;padding:3px;border-radius:15px;background:var(--theme-surface-secondary,#f3f3f3)}
    .contact-directory-section{appearance:none;border:0;border-radius:12px;min-height:42px;padding:7px 8px;background:transparent;color:var(--theme-content-secondary,#616872);font-family:inherit;font-size:14px;font-weight:600;line-height:1.25;cursor:pointer}
    .contact-directory-section[data-active="true"]{background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);box-shadow:0 1px 4px #00000013}
    .contact-directory-section:focus-visible{outline:2px solid var(--theme-content-accent,#377ad6);outline-offset:2px}
    .contact-directory-work-tools{display:grid;gap:8px;padding:5px 1px 2px}
    .contact-directory-work-item{display:grid;gap:3px;min-height:64px;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;padding:10px 12px;background:var(--theme-surface-primary,#fff)}
    .contact-directory-work-item strong{font-size:14px;font-weight:700;line-height:1.3}
    .contact-directory-work-item span{color:var(--theme-content-secondary,#667085);font-size:12px;line-height:1.35}
    .contact-directory-work-bank-heading{box-sizing:border-box;padding:13px 11px 7px;color:var(--theme-content-primary,#171717);font-size:13px;font-weight:700;line-height:1.35}
    .contact-directory-work-item [data-ncc-launch]{width:100%;margin-top:6px;text-align:center}
    .contact-directory-tools[data-directory-section="chat"] .contact-directory-work-tools,
    .contact-directory-tools[data-directory-section="work"] :is(.contact-directory-search-field,.contact-directory-filter-line){display:none!important}
    .contact-directory-work-bank-heading[hidden],.contact-directory-work-tools[hidden]{display:none!important}
    /* DIR-343: On iPhone/Android, the top header is the ONLY Chat/Work
       selector while Admin directory is open. Desktop keeps its own panel. */
    @media(max-width:63.999rem){
      #appShell[data-mobile-directory="true"] .contact-directory-sections{display:none!important}
    }
    /* UI-247: reusable ChatGPT-like search surface, without altering focus/scroll owners. */
    .contact-directory-search-field{position:relative;width:100%;min-width:0}
    .contact-directory-search-icon{position:absolute;z-index:1;inset-inline-start:14px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:var(--theme-content-tertiary,#999);pointer-events:none}
    .contact-directory-search-field:focus-within .contact-directory-search-icon{color:var(--theme-content-secondary,#666)}
    .contact-directory-search{box-sizing:border-box;width:100%;height:44px;border:1px solid var(--theme-border-default,#dedede);border-radius:16px;padding:0 12px 0 42px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-size:16px;outline:none}
    .contact-directory-search:focus{border-color:#9ab7e6;box-shadow:0 0 0 2px rgba(78,132,216,.1)}
    /* UI-344: filter rail and the more-arrow share one 44px tap row.
       Keep a 44px hit target but draw a 36px circle, aligned with the
       visible mobile filter chips; no partial label sits under the arrow. */
    .contact-directory-filter-line{display:flex;align-items:center;gap:8px;min-width:0;min-height:44px;box-sizing:border-box;padding-inline:2px}
    .contact-directory-filters{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;min-height:44px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;scroll-padding-inline:8px}
    .contact-directory-filters::-webkit-scrollbar{display:none}
    .contact-directory-filter-line:has(.contact-directory-filter-more:not([hidden])) .contact-directory-filters{
      -webkit-mask-image:linear-gradient(to right,#000 0%,#000 calc(100% - 20px),transparent 100%);
      mask-image:linear-gradient(to right,#000 0%,#000 calc(100% - 20px),transparent 100%)
    }
    .contact-directory-filter-line:has(.contact-directory-filter-more[data-direction="previous"]) .contact-directory-filters{
      -webkit-mask-image:linear-gradient(to right,transparent 0%,#000 20px,#000 100%);
      mask-image:linear-gradient(to right,transparent 0%,#000 20px,#000 100%)
    }
    .contact-directory-filter-more{appearance:none;position:relative;isolation:isolate;display:grid;place-items:center;align-self:center;flex:0 0 44px;box-sizing:border-box;width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--theme-content-primary,#171717);cursor:pointer;-webkit-tap-highlight-color:transparent}
    .contact-directory-filter-more::before{content:"";position:absolute;z-index:-1;inset:4px;border:1px solid var(--theme-border-default,#dedede);border-radius:999px;background:var(--theme-surface-secondary,#f3f3f3)}
    .contact-directory-filter-more::after{content:"";box-sizing:border-box;width:9px;height:9px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:translateX(-1px) rotate(45deg)}
    .contact-directory-filter-more[data-direction="previous"]::after{transform:translateX(1px) rotate(-135deg)}
    .contact-directory-filter-more[hidden]{display:none!important}
    @media(max-width:63.999rem){
      #appShell[data-auth-state="authenticated"] #shellNavigationLayer .contact-directory-filter-line{align-items:center;gap:8px!important;min-height:44px;padding-inline:2px}
      #appShell[data-auth-state="authenticated"] #shellNavigationLayer .contact-directory-filters{align-items:center;min-height:44px;gap:8px!important}
      #appShell[data-auth-state="authenticated"] #shellNavigationLayer .contact-directory-filter-more{
        position:relative;isolation:isolate;align-self:center;box-sizing:border-box;
        width:44px;height:44px;min-height:44px;flex:0 0 44px;
        border:0!important;border-radius:999px;background:transparent!important;
      }
    }
    .contact-directory-filter{appearance:none;min-height:44px;flex:0 0 auto;border:0;border-radius:999px;padding:0 10px;background:var(--theme-surface-secondary,#f3f3f3);color:var(--theme-content-secondary,#666);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
    .contact-directory-filter[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff)}
    .contact-directory-filter:focus-visible,.contact-directory-filter-more:focus-visible{
      outline:2px solid var(--theme-content-accent,#377ad6);outline-offset:2px
    }
    .contact-directory-empty{padding:18px 10px;text-align:center;color:var(--theme-content-secondary,#777);font-size:13px}
    .zalo-account-group-select{box-sizing:border-box;min-height:32px;border:1px solid var(--theme-border-default,#ddd);border-radius:999px;padding:0 24px 0 9px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .zalo-account-group-select:disabled{opacity:.55;cursor:default}
    @media(max-width:640px){.contact-directory-tools{margin-top:-12px;padding-inline:6px}.zalo-account-group-select{min-width:72px;max-width:88px}}
  `;
  document.head.appendChild(style);
}
// DIR-343: on the directory root, reuse the existing top segmented
// control for Trò chuyện | Công việc. Photos is reachable inside a chat,
// not a third tab on the outer directory. Never change the actual route.
function mobileDirectoryHeaderVisible(){
  return Boolean(currentAdmin())&&
    window.matchMedia?.('(max-width:63.999rem)')?.matches===true&&
    document.getElementById('appShell')?.dataset.mobileDirectory==='true';
}
function syncMobileDirectoryHeader(){
  const switcher=document.querySelector('#regionTop .top-mode-switch');
  const chat=switcher?.querySelector('[data-top-tab="chat"]');
  const right=switcher?.querySelector('[data-top-tab="photos"]');
  if(!switcher||!chat||!right)return false;
  const visible=mobileDirectoryHeaderVisible();
  const wanted=visible?'Công việc':'Ảnh';
  if(right.textContent!==wanted)right.textContent=wanted;
  right.setAttribute('aria-label',wanted);
  // The second control is an Admin work switch on the directory, a real
  // Photos route only after entering a conversation.
  right.setAttribute('title',visible?'Công việc: sản phẩm và chuyển khoản':'Xem ảnh');
  switcher.setAttribute('aria-label',visible?'Trò chuyện và Công việc':'Trò chuyện và ảnh');
  switcher.dataset.directoryOwner=visible?'true':'false';
  if(visible){
    chat.setAttribute('aria-selected',String(directorySection==='chat'));
    right.setAttribute('aria-selected',String(directorySection==='work'));
  }else{
    const route=document.getElementById('appShell')?.dataset.route||'chat';
    chat.setAttribute('aria-selected',String(route==='chat'));
    right.setAttribute('aria-selected',String(route==='photos'));
  }
  return visible;
}
function directoryTools(){return document.querySelector('[data-contact-directory-tools]');}
function removeDirectoryTools(){
  directoryTools()?.remove();
  document.querySelector('[data-contact-work-bank-heading]')?.remove();
  const host=document.querySelector('[data-v21-contact-list]');
  host?.querySelector('.contact-directory-empty')?.remove();
  for(const row of host?.querySelectorAll?.('[data-contact-row]')||[])row.hidden=false;
}
function ensureDirectoryTools(){
  if(!currentAdmin()){
    removeDirectoryTools();
    return null;
  }
  const host=document.querySelector('[data-v21-contact-list]');
  const body=host?.closest?.('.wm-sidebar-body');
  const nav=host?.closest?.('.wm-sidebar-navigation');
  if(!host||!body||!nav)return null;
  let tools=directoryTools();
  if(tools)return tools;
  tools=document.createElement('div');
  tools.className='contact-directory-tools';
  tools.dataset.contactDirectoryTools='';
  tools.innerHTML=`
    <div class="contact-directory-sections" role="tablist" aria-label="Trò chuyện hoặc Công việc">
      <button type="button" role="tab" class="contact-directory-section" data-contact-directory-section="chat" aria-controls="contactDirectoryChatView">Trò chuyện</button>
      <button type="button" role="tab" class="contact-directory-section" data-contact-directory-section="work" aria-controls="contactDirectoryWorkView" aria-label="Công việc: sản phẩm, phiếu NCC và chuyển khoản">Công việc</button>
    </div>
    <div class="contact-directory-search-field" id="contactDirectoryChatView">
      <svg class="contact-directory-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"><circle cx="10.75" cy="10.75" r="6.75"></circle><path d="m16 16 4.5 4.5"></path></svg>
      <input class="contact-directory-search" type="search" autocomplete="off" placeholder="Tìm tên hoặc tài khoản" aria-label="Tìm danh bạ" data-contact-directory-search>
    </div>
    <div class="contact-directory-filter-line">
      <div class="contact-directory-filters" role="group" aria-label="Lọc danh bạ, cuộn ngang để xem thêm">
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="all">Tất cả</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="unread">Chưa đọc</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="customer">KH</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="cm">CM</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="ncc" disabled>TK NCC</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="friend">Bạn bè</button>
        <button type="button" class="contact-directory-filter" data-contact-directory-filter="other">Khác</button>
      </div>
      <button type="button" class="contact-directory-filter-more" data-contact-directory-filter-more data-direction="next" aria-label="Xem thêm nhóm" hidden></button>
    </div>
    <div class="contact-directory-work-tools" id="contactDirectoryWorkView" data-contact-work-tools hidden>
      <div class="contact-directory-work-item"><strong>Sản phẩm · Phiếu NCC</strong><span>Ảnh phiếu nhập, liên kết sản phẩm và kiểm tra giá vốn</span><div data-contact-work-ncc-slot></div></div>
    </div>`;
  body.insertBefore(tools,nav);
  let bankHeading=nav.querySelector('[data-contact-work-bank-heading]');
  if(!bankHeading){
    bankHeading=document.createElement('div');
    bankHeading.className='contact-directory-work-bank-heading';
    bankHeading.dataset.contactWorkBankHeading='';
    bankHeading.textContent='Chuyển khoản · Đối soát';
    nav.insertBefore(bankHeading,host);
  }
  const setDirectorySection=(next,{restore=false}={})=>{
    directorySection=next==='work'?'work':'chat';
    tools.dataset.directorySection=directorySection;
    for(const tab of tools.querySelectorAll('[data-contact-directory-section]')){
      const selected=tab.dataset.contactDirectorySection===directorySection;
      tab.dataset.active=String(selected);
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
    }
    tools.querySelector('[data-contact-work-tools]').hidden=directorySection!=='work';
    bankHeading.hidden=directorySection!=='work';
    nav.setAttribute('aria-label',directorySection==='work'?'Công việc':'Danh bạ');
    syncMobileDirectoryHeader();
    if(!restore)syncDirectoryRows({reorder:false,scrollToTop:true});
  };
  for(const tab of tools.querySelectorAll('[data-contact-directory-section]')){
    tab.addEventListener('click',()=>setDirectorySection(tab.dataset.contactDirectorySection));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const next=tab.dataset.contactDirectorySection==='chat'?'work':'chat';
      setDirectorySection(next);
      tools.querySelector('[data-contact-directory-section="'+next+'"]').focus();
    });
  }
  setDirectorySection(directorySection,{restore:true});
  const rail=tools.querySelector('.contact-directory-filters');
  const more=tools.querySelector('[data-contact-directory-filter-more]');
  function syncFilterArrow(){
    if(!rail||!more)return;
    const scrollable=rail.scrollWidth>rail.clientWidth+3;
    more.hidden=!scrollable;
    const atEnd=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-3;
    more.dataset.direction=atEnd?'previous':'next';
    more.setAttribute('aria-label',atEnd?'Xem các nhóm trước':'Xem thêm nhóm');
  }
  rail?.addEventListener('scroll',syncFilterArrow,{passive:true});
  more?.addEventListener('click',()=>{
    if(!rail)return;
    const atEnd=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-3;
    rail.scrollBy({left:atEnd?-rail.scrollWidth:Math.max(100,rail.clientWidth*.7),behavior:'smooth'});
  });
  window.addEventListener('resize',()=>{if(tools.isConnected)syncFilterArrow();},{passive:true});
  queueMicrotask(syncFilterArrow);
  const input=tools.querySelector('[data-contact-directory-search]');
  input.value=query;
  input.addEventListener('input',()=>{query=String(input.value||'');syncDirectoryRows({reorder:false});});
  for(const button of tools.querySelectorAll('[data-contact-directory-filter]')){
    const selected=button.dataset.contactDirectoryFilter===filter;
    button.dataset.active=String(selected);
    button.setAttribute('aria-pressed',String(selected));
    button.addEventListener('click',()=>{
      filter=String(button.dataset.contactDirectoryFilter||'all');
      for(const peer of tools.querySelectorAll('[data-contact-directory-filter]')){
        const active=peer===button;
        peer.dataset.active=String(active);
        peer.setAttribute('aria-pressed',String(active));
      }
      syncDirectoryRows({reorder:false});
    });
  }
  return tools;
}
function matchesDirectory(item){
  // The bank report is operational work, never a customer chat; the UUID
  // distinguishes it from contacts whose display names resemble the report.
  // The default keeps source-isolated legacy contact-filter tests equivalent.
  const section=typeof directorySection==='string'?directorySection:'chat';
  if(section==='work')return typeof isPinnedReportContact==='function'&&isPinnedReportContact(item);
  if(typeof isPinnedReportContact==='function'&&isPinnedReportContact(item))return false;
  const wanted=normalizeText(query);
  if(wanted){
    const haystack=normalizeText(`${item?.display_name||''} ${item?.username||''}`);
    if(!haystack.includes(wanted))return false;
  }
  if(filter==='all')return true;
  // The canonical contact summary already owns unread state. Never guess
  // urgency from a financial keyword, a Zalo preview or the pinned report.
  if(filter==='unread')return item?.has_unread===true||Number(item?.unread_count||0)>0;
  return groupKey(groupMap.get(String(item?.id||'')))===filter;
}
function syncDirectoryRows({scrollToTop=false,reorder=true}={}){
  if(!currentAdmin()){
    removeDirectoryTools();
    return;
  }
  ensureDirectoryTools();
  const host=document.querySelector('[data-v21-contact-list]');
  if(!host)return;
  const scrollHost=host.closest('.wm-sidebar-navigation');
  const viewport=window.V21DirectoryViewport;
  const scrollAnchor=viewport?.capture?.(scrollHost,host)||null;
  const previousScrollTop=scrollHost?.scrollTop||0;
  const contacts=sortDirectoryContacts(contactStore()?.snapshot?.()||[],{reorder});
  const rowsById=new Map([...host.querySelectorAll('[data-contact-row]')].map(row=>[String(row.dataset.contactId||''),row]));
  host.querySelector('.contact-directory-empty')?.remove();
  let visible=0;
  let cursor=host.firstElementChild;
  for(const item of contacts){
    const row=rowsById.get(String(item.id));
    if(!row)continue;
    const show=matchesDirectory(item);
    row.dataset.contactPinned=isPinnedReportContact(item)?'report':'';
    row.hidden=!show;
    if(show)visible+=1;
    if(reorder){
      if(row===cursor)cursor=cursor.nextElementSibling;
      else host.insertBefore(row,cursor);
    }
  }
  if(!visible&&contacts.length){
    const empty=document.createElement('div');
    empty.className='contact-directory-empty';
    empty.textContent=directorySection==='work'?'Chưa có báo cáo chuyển khoản trong danh bạ':
      filter==='unread'&&!query?'Không có cuộc trò chuyện chưa đọc':'Không tìm thấy';
    host.appendChild(empty);
  }
  if(scrollHost){
    if(scrollToTop)scrollHost.scrollTop=0;
    else if(scrollAnchor)viewport.restore(scrollHost,host,scrollAnchor);
    else scrollHost.scrollTop=previousScrollTop;
  }
}
function setPopupError(message=''){
  const node=document.querySelector('[data-zalo-account-admin-modal] [data-zalo-account-error]');
  if(!node)return;
  node.textContent=String(message||'');
  node.hidden=!message;
}
function syncAdminGroupControls(){
  if(!currentAdmin())return;
  const modal=document.querySelector('[data-zalo-account-admin-modal]');
  if(!modal)return;
  for(const row of modal.querySelectorAll('[data-account-id]')){
    const accountId=String(row.dataset.accountId||'');
    const actions=row.querySelector('.zalo-account-row-actions');
    if(!accountId||!actions)continue;
    let group=row.querySelector('.zalo-account-row-group');
    if(!group){
      group=document.createElement('div');
      group.className='zalo-account-row-group';
      row.insertBefore(group,actions);
    }
    const existing=group.querySelector('[data-contact-group-select]');
    if(existing){
      if(!existing.disabled)existing.value=groupKey(groupMap.get(accountId));
      existing.querySelector('option[value="ncc"]')?.toggleAttribute('disabled',!nccReady);
      continue;
    }
    const select=document.createElement('select');
    select.className='zalo-account-group-select';
    select.dataset.contactGroupSelect='';
    select.setAttribute('aria-label','Nhóm khách hàng');
    for(const [key,label] of GROUPS){
      const option=document.createElement('option');
      option.value=key;option.textContent=label;option.disabled=key==='ncc'&&!nccReady;
      select.appendChild(option);
    }
    select.value=groupKey(groupMap.get(accountId));
    select.addEventListener('change',async()=>{
      const next=groupKey(select.value);
      const previous=groupKey(groupMap.get(accountId));
      if(next===previous)return;
      select.disabled=true;setPopupError('');
      try{
        await invokeBody({action:'set_group',target_account_id:accountId,contact_group:next});
        groupMap.set(accountId,next);
        syncDirectoryRows();
        publishGroupsChanged();
      }catch(error){
        select.value=previous;
        setPopupError(String(error?.message||'Không thể đổi nhóm'));
      }finally{select.disabled=false;}
    });
    group.appendChild(select);
  }
}
async function ensureGroups({force=false}={}){
  const admin=currentAdmin();
  if(!admin?.id)return false;
  const adminId=String(admin.id);
  if(!force&&loadedAdminId===adminId)return true;
  if(loadingGroups)return false;
  loadingGroups=true;
  try{
    const data=await invokeBody({action:'directory_groups'});
    if(String(currentAdmin()?.id||'')!==adminId)return false;
    groupMap=new Map((Array.isArray(data?.groups)?data.groups:[]).map(row=>[String(row.id),groupKey(row.contact_group)]));
    nccReady=data?.ncc_enabled===true;
    syncNccCapability();
    loadedAdminId=adminId;
    syncDirectoryRows();
    publishGroupsChanged();
    syncAdminGroupControls();
    return true;
  }catch{
    return false;
  }finally{
    loadingGroups=false;
    // SPEC-CHAT-DIRECTORY-GROUPS-AUTH-RACE-20261102: if account B
    // authenticated while A's directory_groups request was in flight,
    // B's first refresh was skipped by loadingGroups. Retry once under
    // the new account after A settles, without publishing A's groups to B.
    const nextAdminId=String(currentAdmin()?.id||'');
    if(nextAdminId&&nextAdminId!==adminId&&nextAdminId!==String(loadedAdminId||'')){
      scheduleSync();
    }
  }
}
function scheduleSync({scrollToTop=false}={}){
  if(scrollToTop)syncScrollToTop=true;
  if(syncQueued)return;
  syncQueued=true;
  queueMicrotask(()=>{
    scrollToTop=syncScrollToTop;
    syncScrollToTop=false;
    syncQueued=false;
    ensureDirectoryTools();
    syncDirectoryRows({scrollToTop});
    syncAdminGroupControls();
    void ensureGroups();
  });
}
function resetForAuth(){
  const admin=currentAdmin();
  const id=String(admin?.id||'');
  if(id!==loadedAdminId){groupMap=new Map();loadedAdminId='';nccReady=false;}
  query='';filter='all';directorySection='chat';
  // SPEC-CHAT-DIRECTORY-AUTH-FILTER-20261102: keep the mounted search
  // and category pills consistent with the cleared account-scoped model.
  const tools=directoryTools();
  const input=tools?.querySelector('[data-contact-directory-search]');
  if(input)input.value='';
  if(tools){
    tools.dataset.directorySection='chat';
    const work=tools.querySelector('[data-contact-work-tools]');
    if(work)work.hidden=true;
    const heading=document.querySelector('[data-contact-work-bank-heading]');
    if(heading)heading.hidden=true;
    for(const tab of tools.querySelectorAll('[data-contact-directory-section]')){
      const selected=tab.dataset.contactDirectorySection==='chat';
      tab.dataset.active=String(selected);
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
    }
  }
  for(const button of tools?.querySelectorAll('[data-contact-directory-filter]')||[]){
    button.dataset.active=String(button.dataset.contactDirectoryFilter==='all');
    button.setAttribute('aria-pressed',String(button.dataset.contactDirectoryFilter==='all'));
  }
  scheduleSync();
  syncMobileDirectoryHeader();
}

installStyle();
document.addEventListener('v21-mobile-directory-change',syncMobileDirectoryHeader);
document.addEventListener('navigation-change',syncMobileDirectoryHeader);
// This listener runs after the mobile gesture owner has deliberately yielded
// its Chat-tab click when the directory is open. It prevents Photos routing
// while reusing the on-screen second tab as "Công việc".
document.addEventListener('click',event=>{
  if(!mobileDirectoryHeaderVisible())return;
  const tab=event.target instanceof Element?event.target.closest('[data-top-tab]'):null;
  if(!tab)return;
  const next=tab.dataset.topTab==='chat'?'chat':tab.dataset.topTab==='photos'?'work':null;
  if(!next)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  directoryTools()?.querySelector('[data-contact-directory-section="'+next+'"]')?.click();
  syncMobileDirectoryHeader();
},true);
// Contact-store patches (notably mark-read) must never reset the directory viewport.
// Real activity reorders rows inside syncDirectoryRows(), which already preserves scrollTop.
document.addEventListener('v21-contact-store-change',()=>scheduleSync());
// DIR-346: Chat–Zalo rows are rendered asynchronously after the overlay
// itself has already mounted. The overlay-root MutationObserver cannot see
// that nested list replacement; attach group controls on the direct event.
document.addEventListener('v21-zalo-account-rows-rendered',event=>{
  const modal=document.querySelector('[data-zalo-account-admin-modal]');
  if(!currentAdmin()||!modal||event.detail?.modal!==modal)return;
  syncAdminGroupControls();
  void ensureGroups();
});
document.addEventListener('v21-auth-state',resetForAuth);
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const contact=target?.closest?.('[data-contact-select]');
  if(contact&&currentAdmin()){
    const host=document.querySelector('[data-v21-contact-list]');
    if(host?.contains(contact)){
      const input=directoryTools()?.querySelector('[data-contact-directory-search]');
      if(query||String(input?.value||'')){
        query='';
        if(input)input.value='';
        syncDirectoryRows({reorder:false});
      }
    }
  }
  if(target?.closest?.('[data-zalo-account-admin-open]')){
    window.setTimeout(scheduleSync,0);
    void ensureGroups({force:true});
  }
});
const overlayRoot=document.querySelector('[data-global-overlay-root]')||document.body;
// Dialog-internal DOM changes belong to the dialog; only direct overlay
// additions/removals need directory reconciliation.
new MutationObserver(scheduleSync).observe(overlayRoot,{childList:true});
scheduleSync();

window.V21ContactDirectoryAdmin=Object.freeze({sortDirectoryContacts,isPinnedReportContact,sync:syncDirectoryRows,groupForContact,refreshGroups:()=>ensureGroups({force:true}),nccEnabled:()=>nccReady});
})();
