(()=>{
'use strict';

const GROUPS=Object.freeze([
  ['customer','KH'],
  ['friend','Bạn bè'],
  ['other','Khác'],
]);
const GROUP_KEYS=new Set(GROUPS.map(([key])=>key));
let query='';
let filter='all';
let groupMap=new Map();
let loadedAdminId='';
let loadingGroups=false;
let syncQueued=false;

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
function sortDirectoryContacts(items=[]){
  return [...(Array.isArray(items)?items:[])]
    .filter(item=>item?.id&&!item?.deleted_at)
    .sort((a,b)=>{
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
    .contact-directory-tools{position:static;z-index:4;display:grid;gap:7px;padding:8px 8px 7px;background:var(--theme-surface-primary,#fff)}
    .contact-directory-search{box-sizing:border-box;width:100%;height:38px;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;padding:0 11px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-size:14px;outline:none}
    .contact-directory-search:focus{border-color:#9ab7e6;box-shadow:0 0 0 2px rgba(78,132,216,.1)}
    .contact-directory-filters{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none}
    .contact-directory-filters::-webkit-scrollbar{display:none}
    .contact-directory-filter{appearance:none;min-height:30px;flex:0 0 auto;border:0;border-radius:999px;padding:0 10px;background:var(--theme-surface-secondary,#f3f3f3);color:var(--theme-content-secondary,#666);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
    .contact-directory-filter[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff)}
    .contact-directory-empty{padding:18px 10px;text-align:center;color:var(--theme-content-secondary,#777);font-size:13px}
    .zalo-account-group-select{box-sizing:border-box;min-height:36px;border:1px solid var(--theme-border-default,#ddd);border-radius:10px;padding:0 28px 0 9px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .zalo-account-group-select:disabled{opacity:.55;cursor:default}
    @media(max-width:640px){.contact-directory-tools{padding-inline:6px}.zalo-account-group-select{min-width:104px}}
  `;
  document.head.appendChild(style);
}
function directoryTools(){return document.querySelector('[data-contact-directory-tools]');}
function removeDirectoryTools(){
  directoryTools()?.remove();
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
    <input class="contact-directory-search" type="search" autocomplete="off" placeholder="Tìm kiếm" aria-label="Tìm danh bạ" data-contact-directory-search>
    <div class="contact-directory-filters" role="group" aria-label="Lọc danh bạ">
      <button type="button" class="contact-directory-filter" data-contact-directory-filter="all">Tất cả</button>
      <button type="button" class="contact-directory-filter" data-contact-directory-filter="customer">KH</button>
      <button type="button" class="contact-directory-filter" data-contact-directory-filter="friend">Bạn bè</button>
      <button type="button" class="contact-directory-filter" data-contact-directory-filter="other">Khác</button>
    </div>`;
  body.insertBefore(tools,nav);
  const input=tools.querySelector('[data-contact-directory-search]');
  input.value=query;
  input.addEventListener('input',()=>{query=String(input.value||'');syncDirectoryRows();});
  for(const button of tools.querySelectorAll('[data-contact-directory-filter]')){
    button.dataset.active=String(button.dataset.contactDirectoryFilter===filter);
    button.addEventListener('click',()=>{
      filter=String(button.dataset.contactDirectoryFilter||'all');
      for(const peer of tools.querySelectorAll('[data-contact-directory-filter]'))peer.dataset.active=String(peer===button);
      syncDirectoryRows();
    });
  }
  return tools;
}
function matchesDirectory(item){
  const wanted=normalizeText(query);
  if(wanted){
    const haystack=normalizeText(`${item?.display_name||''} ${item?.username||''}`);
    if(!haystack.includes(wanted))return false;
  }
  if(filter==='all')return true;
  return groupKey(groupMap.get(String(item?.id||'')))===filter;
}
function syncDirectoryRows(){
  if(!currentAdmin()){
    removeDirectoryTools();
    return;
  }
  ensureDirectoryTools();
  const host=document.querySelector('[data-v21-contact-list]');
  if(!host)return;
  const scrollHost=host.closest('.wm-sidebar-navigation');
  const previousScrollTop=scrollHost?.scrollTop||0;
  const contacts=sortDirectoryContacts(contactStore()?.snapshot?.()||[]);
  const rowsById=new Map([...host.querySelectorAll('[data-contact-row]')].map(row=>[String(row.dataset.contactId||''),row]));
  host.querySelector('.contact-directory-empty')?.remove();
  let visible=0;
  let cursor=host.firstElementChild;
  for(const item of contacts){
    const row=rowsById.get(String(item.id));
    if(!row)continue;
    const show=matchesDirectory(item);
    row.hidden=!show;
    if(show)visible+=1;
    if(row===cursor)cursor=cursor.nextElementSibling;
    else host.insertBefore(row,cursor);
  }
  if(!visible&&contacts.length){
    const empty=document.createElement('div');
    empty.className='contact-directory-empty';
    empty.textContent='Không tìm thấy';
    host.appendChild(empty);
  }
  if(scrollHost)scrollHost.scrollTop=previousScrollTop;
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
    const existing=actions.querySelector('[data-contact-group-select]');
    if(existing){
      if(!existing.disabled)existing.value=groupKey(groupMap.get(accountId));
      continue;
    }
    const select=document.createElement('select');
    select.className='zalo-account-group-select';
    select.dataset.contactGroupSelect='';
    select.setAttribute('aria-label','Phân loại');
    for(const [key,label] of GROUPS){
      const option=document.createElement('option');
      option.value=key;option.textContent=label;select.appendChild(option);
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
      }catch(error){
        select.value=previous;
        setPopupError(String(error?.message||'Không thể đổi nhóm'));
      }finally{select.disabled=false;}
    });
    actions.insertBefore(select,actions.firstChild);
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
    loadedAdminId=adminId;
    syncDirectoryRows();
    syncAdminGroupControls();
    return true;
  }catch{
    return false;
  }finally{loadingGroups=false;}
}
function scheduleSync(){
  if(syncQueued)return;
  syncQueued=true;
  queueMicrotask(()=>{
    syncQueued=false;
    ensureDirectoryTools();
    syncDirectoryRows();
    syncAdminGroupControls();
    void ensureGroups();
  });
}
function resetForAuth(){
  const admin=currentAdmin();
  const id=String(admin?.id||'');
  if(id!==loadedAdminId){groupMap=new Map();loadedAdminId='';}
  query='';filter='all';
  scheduleSync();
}

installStyle();
document.addEventListener('v21-contact-store-change',scheduleSync);
document.addEventListener('v21-auth-state',resetForAuth);
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest?.('[data-zalo-account-admin-open]')){
    window.setTimeout(scheduleSync,0);
    void ensureGroups({force:true});
  }
});
const overlayRoot=document.querySelector('[data-global-overlay-root]')||document.body;
new MutationObserver(scheduleSync).observe(overlayRoot,{childList:true,subtree:true});
scheduleSync();

window.V21ContactDirectoryAdmin=Object.freeze({sortDirectoryContacts,sync:syncDirectoryRows,refreshGroups:()=>ensureGroups({force:true})});
})();

void import('./quote-client.js').catch(error=>console.warn('[quote-client]',error));
