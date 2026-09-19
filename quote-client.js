(()=>{
'use strict';

const FALLBACK_SOURCES=Object.freeze([
  ['hang-thuong','Hàng thường'],
  ['hang-u','Hàng U'],
  ['sua','Sữa'],
  ['thuoc-la','Thuốc lá'],
  ['sheet-1150410221','#'],
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


async function listSources(){
  if(!currentAdmin())throw new Error('admin_required');
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const sessionResult=await client.auth.getSession();
  const accessToken=String(sessionResult?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const {data,error}=await client.functions.invoke('v21-quote',{
    body:{action:'sources'},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(error)throw error;
  const rows=Array.isArray(data?.sources)?data.sources:[];
  return rows.length
    ?rows.map(row=>[String(row?.source_key||''),String(row?.source_name||row?.source_key||'')]).filter(([key])=>key)
    :[...FALLBACK_SOURCES];
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
    <button type="button" class="quote-admin-open" data-quote-open>Link báo giá</button>
    <div class="quote-admin-panel" data-quote-panel data-quote-hidden="true">
      <div class="quote-admin-scope" role="group" aria-label="Phạm vi báo giá">
        <button type="button" data-quote-scope="all" data-active="true">Tất cả</button>
        <button type="button" data-quote-scope="source" data-active="false">Theo nguồn</button>
      </div>
      <select class="quote-admin-source" data-quote-source data-quote-hidden="true" aria-label="Nguồn báo giá">
        ${FALLBACK_SOURCES.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}
      </select>
      <button type="button" class="quote-admin-create" data-quote-create>Tạo link</button>
      <p class="quote-admin-status" data-quote-status></p>
      <div class="quote-admin-result" data-quote-result data-quote-hidden="true">
        <div class="quote-admin-result-copy" data-quote-result-copy></div>
        <input class="quote-admin-url" data-quote-url readonly aria-label="Link báo giá">
        <div class="quote-admin-actions">
          <button type="button" class="quote-admin-action" data-quote-copy>Sao chép link</button>
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
  const scopeButtons=[...host.querySelectorAll('[data-quote-scope]')];
  let scope='all';
  let quote=null;

  function setStatus(value=''){status.textContent=String(value||'');}
  function setBusy(busy){
    createButton.disabled=Boolean(busy);
    copyButton.disabled=Boolean(busy);
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
    openButton.textContent=opening?'Đóng link báo giá':'Link báo giá';
    if(opening){
      setStatus(target?`Tạo link cho ${String(target.display_name||target.username||'khách hàng')}`:'');
      void listSources().then(rows=>{
        const selected=sourceSelect.value;
        sourceSelect.replaceChildren(...rows.map(([key,label])=>{
          const option=document.createElement('option');
          option.value=key;
          option.textContent=label;
          return option;
        }));
        if(rows.some(([key])=>key===selected))sourceSelect.value=selected;
      }).catch(()=>{});
    }
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

  return true;
}

function scheduleMount(){
  if(mountQueued)return;
  mountQueued=true;
  queueMicrotask(()=>{mountQueued=false;mountQuotePanel();});
}

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
  copyQuoteLink,
  sources:FALLBACK_SOURCES,
  listSources,
  mount:mountQuotePanel,
});
})();
