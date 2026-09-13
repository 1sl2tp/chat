(()=>{
'use strict';

const FUNCTION_NAME='v21-order-source';
let panel=null;
let preset='today';
let includeAll=false;
let customRange={from:'',to:''};
let rows=[];
let requestSeq=0;
let corePromise=null;
let orderGroup={sourceMessageIds:[],text:'',firstCreatedAt:'',lastCreatedAt:'',count:0,images:[]};
let groupSplitResult=null;

function authStore(){return window.V21AuthSessionStore||null;}
function clean(value){return String(value??'').trim();}
function currentContact(){
  const shell=window.ChatAppShell?.snapshot?.()||window.ChatAppShell?.ScreenSession?.snapshot?.()||{};
  const contact=shell.activeContact||{};
  if(contact?.id)return{id:String(contact.id),name:String(contact.name||'Liên hệ')};
  const message=window.V21MessageStore?.snapshot?.()||{};
  const id=clean(message.currentContactId);
  if(!id)return null;
  const list=window.V21ContactStore?.snapshot?.()||[];
  const row=Array.isArray(list)?list.find(item=>String(item?.id||'')===id):null;
  return{id,name:String(row?.display_name||row?.username||'Liên hệ')};
}
function core(){
  if(!corePromise)corePromise=import('./order-source-core.mjs');
  return corePromise;
}
async function invoke(action,payload={}){
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const session=await client.auth.getSession();
  const accessToken=String(session?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const {data,error}=await client.functions.invoke(FUNCTION_NAME,{
    body:{action,...payload},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(data?.ok===true)return data;
  throw new Error(String(data?.error||error?.message||'order_source_failed'));
}
function dateValue(value){
  const d=value instanceof Date?value:new Date(value||Date.now());
  if(Number.isNaN(d.getTime()))return'';
  const p=n=>String(n).padStart(2,'0');
  return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function timeText(value){
  const d=new Date(value||0);
  if(Number.isNaN(d.getTime()))return'';
  return new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(d);
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
}
function errorText(error){
  const code=String(error?.message||error||'order_source_failed').replace(/^FunctionsHttpError:\s*/,'').trim();
  const known={
    authentication_required:'Cần đăng nhập Admin.',
    admin_required:'Chỉ Admin được xem nguồn tin.',
    conversation_not_found:'Chưa có cuộc trò chuyện với khách này.',
    invalid_date_range:'Khoảng ngày chưa hợp lệ.',
    source_image_not_found:'Không đọc được ảnh của khách trong đoạn chat này.',
    image_unavailable:'Không tải được ảnh để AI đọc.',
    ai_unavailable:'AI chưa dùng được — vẫn có thể Tách nhanh phần chữ.',
    invalid_response:'AI chưa dùng được — vẫn có thể Tách nhanh phần chữ.',
    ai_not_configured:'AI chưa dùng được — vẫn có thể Tách nhanh phần chữ.',
    ai_response_invalid:'AI chưa dùng được — vẫn có thể Tách nhanh phần chữ.',
  };
  return known[code]||code;
}
function installStyle(){
  if(document.getElementById('v21-admin-order-source-style'))return;
  const style=document.createElement('style');
  style.id='v21-admin-order-source-style';
  style.textContent=`
    html[data-order-source-open="true"] #conversationContentAxis,
    html[data-order-source-open="true"] #guestAuthThread,
    html[data-order-source-open="true"] #thread-bottom-container{display:none!important}
    html[data-order-source-open="true"] #scrollRoot{overflow:hidden!important}
    html[data-order-source-open="true"] #threadContent{position:relative;min-height:0;height:100%;margin-bottom:0;padding-bottom:0;overflow:hidden}
    #adminOrderSourcePanel{position:absolute;inset:0;box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717)}
    #appShell[data-auth-state="authenticated"][data-desktop-workspace="true"] #adminOrderSourcePanel{inset-inline-end:var(--desktop-work-width)}
    #adminOrderSourcePanel[hidden]{display:none!important}
    .order-source-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--theme-border-default,#e7e7e7)}
    .order-source-head-copy{min-width:0;flex:1}.order-source-head-copy strong,.order-source-head-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.order-source-head-copy strong{font-size:15px}.order-source-head-copy small{margin-top:2px;color:var(--theme-content-secondary,#6b6b6b);font-size:11px}
    .order-source-close{width:34px;height:34px;border:0;border-radius:50%;background:var(--theme-surface-secondary,#f3f3f3);font-size:20px;cursor:pointer}
    .order-source-range{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid var(--theme-border-default,#e7e7e7);background:var(--theme-surface-primary,#fff)}
    .order-source-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.order-source-presets button{min-height:36px;border:1px solid var(--theme-border-default,#ddd);border-radius:10px;background:var(--theme-surface-secondary,#f6f6f6);font:650 12px/1 system-ui;cursor:pointer}.order-source-presets button[aria-pressed="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .order-source-options{display:flex;align-items:center;gap:10px;min-width:0}.order-source-options label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--theme-content-secondary,#666)}.order-source-custom{margin-left:auto;display:flex;align-items:center;gap:5px}.order-source-custom input{min-width:0;max-width:132px;height:32px;border:1px solid var(--theme-border-default,#ddd);border-radius:8px;padding:0 6px;background:var(--theme-surface-primary,#fff);font-size:12px}
    .order-source-scroll{min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 12px 20px;display:grid;align-content:start;gap:8px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    .order-source-message{display:grid;gap:7px;padding:10px;border:1px solid #10a37f;border-radius:13px;background:var(--theme-surface-primary,#fff);box-shadow:inset 3px 0 0 #10a37f}
    .order-source-message-top{display:flex;align-items:center;gap:8px}.order-source-count{margin-left:auto;font-size:11px;font-weight:700;color:#0b7a5f}
    .order-source-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.45;user-select:text;-webkit-user-select:text}.order-source-time{font-size:11px;color:var(--theme-content-tertiary,#888)}
    .order-source-images{padding:8px 9px;border:1px solid var(--theme-border-default,#e1e1e1);border-radius:9px;background:var(--theme-surface-secondary,#f6f6f6);font-size:12px;color:var(--theme-content-secondary,#666)}
    .order-source-actions{display:flex;gap:6px;flex-wrap:wrap}.order-source-actions button{min-height:32px;padding:0 10px;border:1px solid var(--theme-border-default,#ddd);border-radius:9px;background:var(--theme-surface-secondary,#f6f6f6);font-size:12px;font-weight:650;cursor:pointer}.order-source-actions button[data-source-action="quick"]{background:#eef8f5;color:#08765a}.order-source-actions button[data-source-action="ignore"]{margin-left:auto}
    .order-source-result{display:grid;gap:4px;padding:8px;border-radius:9px;background:var(--theme-surface-secondary,#f6f6f6);font-size:12px;line-height:1.4}.order-source-result strong{font-size:11px}.order-source-unresolved{color:#9a3412}.order-source-uncertain{color:#9a3412;font-size:11px}.order-source-empty,.order-source-status{padding:18px 8px;text-align:center;color:var(--theme-content-secondary,#666);font-size:13px}.order-source-status[data-error="true"]{color:#b42318}
    @media(max-width:639px){.order-source-presets{grid-template-columns:1fr 1fr}.order-source-options{align-items:flex-start;flex-direction:column}.order-source-custom{margin-left:0;width:100%}.order-source-custom input{max-width:none;flex:1}}
  `;
  document.head.appendChild(style);
}
function ensurePanel(){
  installStyle();
  if(panel?.isConnected)return panel;
  const host=document.getElementById('threadContent');
  if(!host)throw new Error('order_source_host_unavailable');
  panel=document.createElement('section');
  panel.id='adminOrderSourcePanel';
  panel.hidden=true;
  panel.innerHTML=`
    <header class="order-source-head">
      <div class="order-source-head-copy"><strong data-source-customer>Tin báo hàng</strong><small data-source-summary>Chỉ tin khách gửi</small></div>
      <button type="button" class="order-source-close" data-source-close aria-label="Đóng">×</button>
    </header>
    <div class="order-source-range">
      <nav class="order-source-presets" aria-label="Thời gian">
        <button type="button" data-source-preset="today">Hôm nay</button>
        <button type="button" data-source-preset="yesterday">Hôm qua</button>
        <button type="button" data-source-preset="week">Tuần này</button>
        <button type="button" data-source-preset="custom">Tùy chọn</button>
      </nav>
      <div class="order-source-options">
        <label><input type="checkbox" data-source-include-all> Hiện tất cả tin khách</label>
        <div class="order-source-custom" data-source-custom hidden>
          <input type="date" data-source-date="from" aria-label="Từ ngày">
          <span>→</span>
          <input type="date" data-source-date="to" aria-label="Đến ngày">
        </div>
      </div>
    </div>
    <div id="adminOrderSourceScroll" class="order-source-scroll"></div>`;
  host.insertBefore(panel,host.firstChild);
  panel.querySelector('[data-source-close]')?.addEventListener('click',close);
  panel.addEventListener('click',onClick);
  panel.addEventListener('change',onChange);
  return panel;
}
function setOpen(open){
  ensurePanel();
  panel.hidden=!open;
  document.documentElement.dataset.orderSourceOpen=String(Boolean(open));
  return open;
}
function close(){setOpen(false);return true;}
function emptyOrderGroup(){return{sourceMessageIds:[],text:'',firstCreatedAt:'',lastCreatedAt:'',count:0,images:[]};}
function resetOrderGroup(){
  orderGroup=emptyOrderGroup();
  groupSplitResult=null;
}
function renderResult(result){
  if(!result)return'';
  if(result.error)return`<div class="order-source-result"><div class="order-source-unresolved">${escapeHtml(result.error)}</div></div>`;
  const entries=Array.isArray(result.previewEntries)?result.previewEntries:[];
  return`<div class="order-source-result">
    ${entries.map(entry=>entry.type==='unresolved'
      ?`<div class="order-source-unresolved">Chưa tách · ${escapeHtml(entry.text||'')}</div>`
      :`<div><b>${escapeHtml(entry.quantityLabel||entry.quantity||'')}</b> ${escapeHtml(entry.name||'')}${entry.uncertain?'<span class="order-source-uncertain"> · ?</span>':''}</div>`).join('')}
    ${!entries.length?'<div>Không có dòng để tách.</div>':''}
  </div>`;
}
function renderOrderGroup(){
  const first=timeText(orderGroup.firstCreatedAt);
  const last=timeText(orderGroup.lastCreatedAt);
  const timeRange=first&&last&&first!==last?`${first} → ${last}`:(first||last);
  const images=Array.isArray(orderGroup.images)?orderGroup.images:[];
  return`<article class="order-source-message" data-source-order-group>
    <div class="order-source-message-top">
      <time class="order-source-time">${escapeHtml(timeRange)}</time>
      <span class="order-source-count">${orderGroup.count} tin</span>
    </div>
    ${orderGroup.text?`<div class="order-source-text">${escapeHtml(orderGroup.text)}</div>`:''}
    ${images.length?`<div class="order-source-images">Ảnh · ${images.length} · Bấm AI để đọc chữ viết tay</div>`:''}
    <div class="order-source-actions">
      <button type="button" data-source-action="quick">Tách nhanh</button>
      <button type="button" data-source-action="ai">AI</button>
      <button type="button" data-source-action="ignore">Bỏ qua</button>
    </div>
    ${renderResult(groupSplitResult)}
  </article>`;
}
function render(){
  ensurePanel();
  const contact=currentContact();
  const customer=panel.querySelector('[data-source-customer]');
  const summary=panel.querySelector('[data-source-summary]');
  const scroll=panel.querySelector('#adminOrderSourceScroll');
  if(customer)customer.textContent=contact?`Khách: ${contact.name}`:'Chưa chọn khách';
  if(summary)summary.textContent=contact
    ?`Chỉ tin khách gửi · ${orderGroup.count} ${includeAll?'tin':'tin phù hợp'}`
    :'Chỉ tin khách gửi';
  for(const button of panel.querySelectorAll('[data-source-preset]'))button.setAttribute('aria-pressed',String(button.dataset.sourcePreset===preset));
  const include=panel.querySelector('[data-source-include-all]');
  if(include)include.checked=includeAll;
  const custom=panel.querySelector('[data-source-custom]');
  if(custom)custom.hidden=preset!=='custom';
  for(const input of panel.querySelectorAll('[data-source-date]'))input.value=customRange[input.dataset.sourceDate]||'';
  if(!scroll)return;
  if(!contact){scroll.innerHTML='<div class="order-source-empty">Chọn khách trong Danh bạ để xem tin báo hàng.</div>';return;}
  if(!orderGroup.count){scroll.innerHTML='<div class="order-source-empty">Không có tin báo hàng phù hợp trong khoảng này. Có thể bật “Hiện tất cả tin khách”.</div>';return;}
  scroll.innerHTML=renderOrderGroup();
}
function setStatus(text,error=false){
  const scroll=ensurePanel().querySelector('#adminOrderSourceScroll');
  if(scroll)scroll.innerHTML=`<div class="order-source-status" data-error="${Boolean(error)}">${escapeHtml(text)}</div>`;
}
async function computeRange(){
  const helper=await core();
  if(preset==='custom'){
    if(!customRange.from||!customRange.to)throw new Error('invalid_date_range');
    return helper.rangeForPreset('custom',Date.now(),new Date().getTimezoneOffset(),customRange);
  }
  return helper.rangeForPreset(preset,Date.now(),new Date().getTimezoneOffset());
}
async function refresh(){
  const seq=++requestSeq;
  const contact=currentContact();
  if(!contact){rows=[];resetOrderGroup();render();return false;}
  setStatus('Đang tổng hợp tin khách…');
  try{
    const range=await computeRange();
    const data=await invoke('list',{contactId:contact.id,from:range.from,to:range.to,includeAll});
    if(seq!==requestSeq)return false;
    rows=Array.isArray(data.items)?data.items:[];
    const helper=await core();
    orderGroup=helper.customerOrderSourceGroup(rows);
    if(!Array.isArray(orderGroup.images))orderGroup.images=[];
    groupSplitResult=null;
    render();
    return true;
  }catch(error){
    if(seq!==requestSeq)return false;
    rows=[];
    resetOrderGroup();
    setStatus(errorText(error),true);
    return false;
  }
}
async function setGroupState(messageIds,state){
  const contact=currentContact();
  const ids=Array.from(new Set((Array.isArray(messageIds)?messageIds:[]).map(clean).filter(Boolean)));
  if(!contact?.id||!ids.length)return false;
  for(const messageId of ids)await invoke('set_state',{contactId:contact.id,messageId,state});
  for(const row of rows){if(ids.includes(String(row.messageId||'')))row.state=state;}
  return true;
}
async function splitGroup(mode){
  const contact=currentContact();
  const imageAssetIds=(Array.isArray(orderGroup.images)?orderGroup.images:[]).map(image=>clean(image?.assetId)).filter(Boolean);
  if(!contact?.id||!orderGroup.count)return false;
  if(mode==='quick'&&!orderGroup.text){
    groupSplitResult={items:[],unresolved:[],error:imageAssetIds.length?'Ảnh chỉ đọc bằng AI.':'Không có dòng chữ để tách.'};
    render();
    return true;
  }
  if(mode==='ai'&&!orderGroup.text&&!imageAssetIds.length)return false;
  groupSplitResult={items:[],unresolved:[],error:mode==='ai'?'AI đang đọc/tách…':'Đang tách nhanh…'};
  render();
  try{
    const client=window.V21OrderScribeClient;
    if(!client?.[mode])throw new Error('invalid_response');
    const data=await client[mode]({
      contactId:contact.id,
      text:orderGroup.text,
      imageAssetIds:mode==='ai'?imageAssetIds:[],
    });
    const helper=await core();
    const splitResult={items:data.items||[],unresolved:data.unresolved||[],error:''};
    splitResult.previewEntries=helper.orderSplitPreviewEntries(splitResult);
    groupSplitResult=splitResult;
  }catch(error){
    groupSplitResult={items:[],unresolved:[],error:errorText(error)};
  }
  render();
  return true;
}
async function ignoreGroup(){
  const ids=[...orderGroup.sourceMessageIds];
  if(!ids.length)return false;
  await setGroupState(ids,'ignored');
  const helper=await core();
  orderGroup=helper.customerOrderSourceGroup(rows);
  if(!Array.isArray(orderGroup.images))orderGroup.images=[];
  groupSplitResult=null;
  render();
  return true;
}
function onClick(event){
  const button=event.target.closest?.('[data-source-preset],[data-source-action]');
  if(!button)return;
  const nextPreset=button.dataset.sourcePreset;
  if(nextPreset){
    preset=String(nextPreset);
    if(preset==='custom'&&(!customRange.from||!customRange.to)){
      const today=dateValue(new Date());
      customRange={from:today,to:today};
    }
    render();
    void refresh();
    return;
  }
  const action=String(button.dataset.sourceAction||'');
  if(action==='quick'||action==='ai')void splitGroup(action);
  else if(action==='ignore')void ignoreGroup();
}
function onChange(event){
  const target=event.target;
  if(target?.matches?.('[data-source-include-all]')){includeAll=Boolean(target.checked);void refresh();return;}
  if(target?.matches?.('[data-source-date]')){
    customRange={...customRange,[target.dataset.sourceDate]:String(target.value||'')};
    if(customRange.from&&customRange.to)void refresh();
  }
}
async function open(options={}){
  const contact=currentContact();
  if(!contact?.id)throw new Error('contact_required');
  if(options?.preset)preset=String(options.preset);
  ensurePanel();
  setOpen(true);
  await refresh();
  return true;
}

document.addEventListener('v21-active-contact-change',()=>{
  requestSeq++;
  resetOrderGroup();
  if(panel&&!panel.hidden)void refresh();
});

document.addEventListener('v21-auth-state',event=>{
  if(event?.detail?.state!=='AUTHENTICATED'&&panel&&!panel.hidden)close();
});

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const row=target?.closest?.('[data-contact-row]');
  if(!row||!panel||panel.hidden)return;
  const before=String(currentContact()?.id||'');
  window.setTimeout(()=>{
    const after=String(currentContact()?.id||'');
    if(!after||after===before)return;
    requestSeq++;
    resetOrderGroup();
    rows=[];
    void refresh();
  },0);
},true);

window.V21AdminOrderSource=Object.freeze({open,close,refresh});
})();
