(()=>{
'use strict';

const SOURCES=Object.freeze([
  ['hang-thuong','Hàng thường'],
  ['hang-u','Hàng U'],
  ['masan','Hàng masan'],
  ['sua','Sữa'],
  ['thuoc-la','Thuốc lá'],
]);

let targetAccountId='';
let mountQueued=false;

function authStore(){return window.V21AuthSessionStore||null;}
function contactStore(){return window.V21ContactStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function targetContact(){
  return contactStore()?.snapshot?.().find(item=>String(item?.id||'')===String(targetAccountId||''))||null;
}
function errorText(error){
  const raw=String(error?.message||error||'Không thể tạo báo giá').trim();
  const known={
    admin_required:'Chỉ Admin được tạo báo giá',
    unauthorized:'Phiên đăng nhập đã hết hạn',
    source_not_found:'Nguồn không tồn tại',
    quote_empty:'Nguồn này chưa có giá bán',
    quote_create_failed:'Không thể lưu báo giá',
    conversation_not_ready:'Đoạn chat chưa sẵn sàng',
    authentication_required:'Phiên đăng nhập chưa sẵn sàng',
  };
  return known[raw]||raw;
}

function installStyle(){
  if(document.getElementById('v21-quote-admin-style'))return;
  const style=document.createElement('style');
  style.id='v21-quote-admin-style';
  style.textContent=`
    .quote-admin-block{display:grid;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--theme-border-default,#dedede)}
    .quote-admin-open,.quote-admin-create,.quote-admin-action{appearance:none;min-height:46px;border:1px solid var(--theme-border-default,#dedede);border-radius:16px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-weight:600;cursor:pointer}
    .quote-admin-open:hover,.quote-admin-action:hover{background:var(--theme-surface-secondary,#f3f3f3)}
    .quote-admin-panel{display:grid;gap:10px}
    .quote-admin-scope{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .quote-admin-scope button{appearance:none;min-height:40px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;background:var(--theme-surface-secondary,#f3f3f3);color:var(--theme-content-secondary,#666);font:inherit;font-size:13px;font-weight:650;cursor:pointer}
    .quote-admin-scope button[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .quote-admin-source{width:100%;min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;padding:0 10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit}
    .quote-admin-create{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .quote-admin-create:disabled,.quote-admin-action:disabled{opacity:.55;cursor:default}
    .quote-admin-status{margin:0;min-height:18px;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .quote-admin-result{display:grid;gap:8px;padding:10px;border:1px solid var(--theme-border-default,#dedede);border-radius:14px;background:var(--theme-surface-secondary,#f7f7f7)}
    .quote-admin-result-copy{font-size:12px;color:var(--theme-content-secondary,#666)}
    .quote-admin-url{width:100%;height:40px;border:1px solid var(--theme-border-default,#dedede);border-radius:10px;padding:0 9px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;font-size:12px}
    .quote-admin-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    [data-quote-hidden="true"]{display:none!important}
  `;
  document.head.appendChild(style);
}

async function createQuote({scope='all',sourceKey=''}={}){
  if(!currentAdmin())throw new Error('admin_required');
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const sessionResult=await client.auth.getSession();
  const accessToken=String(sessionResult?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const body=scope==='source'
    ?{scope:'source',source_key:String(sourceKey||'')}
    :{scope:'all'};
  const {data,error}=await client.functions.invoke('v21-quote',{
    body,
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(error)throw error;
  if(!data?.ok||!data?.url)throw new Error(data?.error||'quote_create_failed');
  return data;
}

async function sendQuoteLink(url){
  const text=String(url||'').trim();
  if(!text||!targetAccountId)throw new Error('conversation_not_ready');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const messageState=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`quote-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  if(
    messageStore?.send&&
    messageState.ready&&
    String(messageState.currentContactId||'')===String(targetAccountId)
  ){
    await messageStore.send({
      clientId,
      text,
      contactId:targetAccountId,
      conversationId:messageState.currentConversationId||null,
      reply:null,
    });
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({
      clientId,
      text,
      contactId:targetAccountId,
      conversationId:null,
      reply:null,
    });
  }
  void sync?.wake?.({reason:'quote-link-send'});
  return true;
}

async function copyQuoteLink(url){
  const text=String(url||'').trim();
  if(!text)throw new Error('quote_url_missing');
  await navigator.clipboard.writeText(text);
  return true;
}

function mountQuotePanel(){
  if(!currentAdmin()||!targetAccountId)return false;
  const overlay=document.querySelector('[data-profile-overlay]');
  if(!overlay)return false;
  const title=String(overlay.querySelector('#shell-profile-title')?.textContent||'').trim();
  if(title!=='Thông tin liên hệ')return false;
  const adminActions=overlay.querySelector('[data-profile-admin-actions]');
  if(!adminActions||adminActions.parentElement?.querySelector('[data-quote-admin-block]'))return Boolean(adminActions);

  const target=targetContact();
  const host=document.createElement('section');
  host.className='quote-admin-block';
  host.dataset.quoteAdminBlock='';
  host.innerHTML=`
    <button type="button" class="quote-admin-open" data-quote-open>Báo giá</button>
    <div class="quote-admin-panel" data-quote-panel data-quote-hidden="true">
      <div class="quote-admin-scope" role="group" aria-label="Phạm vi báo giá">
        <button type="button" data-quote-scope="all" data-active="true">Tất cả</button>
        <button type="button" data-quote-scope="source" data-active="false">Theo nguồn</button>
      </div>
      <select class="quote-admin-source" data-quote-source data-quote-hidden="true" aria-label="Nguồn báo giá">
        ${SOURCES.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}
      </select>
      <button type="button" class="quote-admin-create" data-quote-create>Tạo link</button>
      <p class="quote-admin-status" data-quote-status></p>
      <div class="quote-admin-result" data-quote-result data-quote-hidden="true">
        <div class="quote-admin-result-copy" data-quote-result-copy></div>
        <input class="quote-admin-url" data-quote-url readonly aria-label="Link báo giá">
        <div class="quote-admin-actions">
          <button type="button" class="quote-admin-action" data-quote-copy>Sao chép</button>
          <button type="button" class="quote-admin-action" data-quote-send>Gửi</button>
        </div>
      </div>
    </div>`;
  adminActions.parentElement.insertBefore(host,adminActions);

  const openButton=host.querySelector('[data-quote-open]');
  const panel=host.querySelector('[data-quote-panel]');
  const sourceSelect=host.querySelector('[data-quote-source]');
  const createButton=host.querySelector('[data-quote-create]');
  const status=host.querySelector('[data-quote-status]');
  const result=host.querySelector('[data-quote-result]');
  const resultCopy=host.querySelector('[data-quote-result-copy]');
  const urlInput=host.querySelector('[data-quote-url]');
  const copyButton=host.querySelector('[data-quote-copy]');
  const sendButton=host.querySelector('[data-quote-send]');
  const scopeButtons=[...host.querySelectorAll('[data-quote-scope]')];
  let scope='all';
  let quote=null;

  function setStatus(value=''){status.textContent=String(value||'');}
  function setBusy(busy){
    createButton.disabled=Boolean(busy);
    copyButton.disabled=Boolean(busy);
    sendButton.disabled=Boolean(busy);
  }
  function chooseScope(next){
    scope=next==='source'?'source':'all';
    for(const button of scopeButtons)button.dataset.active=String(button.dataset.quoteScope===scope);
    sourceSelect.dataset.quoteHidden=String(scope!=='source');
    quote=null;
    result.dataset.quoteHidden='true';
    setStatus('');
  }

  openButton.addEventListener('click',()=>{
    const opening=panel.dataset.quoteHidden==='true';
    panel.dataset.quoteHidden=String(!opening);
    openButton.textContent=opening?'Đóng báo giá':'Báo giá';
    if(opening)setStatus(target?`Gửi cho ${String(target.display_name||target.username||'khách hàng')}`:'');
  });
  for(const button of scopeButtons)button.addEventListener('click',()=>chooseScope(button.dataset.quoteScope));

  createButton.addEventListener('click',async()=>{
    setBusy(true);setStatus('Đang tạo link…');result.dataset.quoteHidden='true';
    try{
      quote=await createQuote({scope,sourceKey:sourceSelect.value});
      urlInput.value=String(quote.url||'');
      const label=scope==='source'?(quote.source_name||sourceSelect.selectedOptions?.[0]?.textContent||'Theo nguồn'):'Tất cả';
      resultCopy.textContent=`${label} · ${Number(quote.item_count)||0} sản phẩm`;
      result.dataset.quoteHidden='false';
      setStatus('Đã tạo báo giá');
    }catch(error){
      quote=null;
      setStatus(errorText(error));
    }finally{setBusy(false);}
  });

  copyButton.addEventListener('click',async()=>{
    if(!quote?.url)return;
    setBusy(true);
    try{await copyQuoteLink(quote.url);setStatus('Đã sao chép link');}
    catch(error){setStatus(errorText(error));}
    finally{setBusy(false);}
  });

  sendButton.addEventListener('click',async()=>{
    if(!quote?.url)return;
    setBusy(true);setStatus('Đang gửi…');
    try{await sendQuoteLink(quote.url);setStatus('Đã gửi link báo giá');}
    catch(error){setStatus(errorText(error));}
    finally{setBusy(false);}
  });
  return true;
}

function scheduleMount(){
  if(mountQueued)return;
  mountQueued=true;
  queueMicrotask(()=>{mountQueued=false;mountQuotePanel();});
}

installStyle();
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const manage=target?.closest?.('[data-contact-manage]');
  if(!manage)return;
  targetAccountId=String(manage.dataset.contactId||'');
  window.setTimeout(scheduleMount,0);
},true);
new MutationObserver(scheduleMount).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('v21-auth-state',scheduleMount);

window.V21QuoteClient=Object.freeze({
  create:createQuote,
  sendQuoteLink,
  copyQuoteLink,
  sources:SOURCES,
  mount:mountQuotePanel,
});
})();
