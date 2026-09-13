(()=>{
'use strict';

const MODE='ORDER_DRAFT_MODAL';
const OWNER='admin-order-draft';
let overlay=null;
let returnFocus=null;
let currentDraft=null;
const searchTimers=new Map();
const searchVersions=new Map();

function authStore(){return window.V21AuthSessionStore||null;}
function interactionController(){return window.V21InteractionController||null;}
function overlayRoot(){return document.getElementById('globalOverlayRoot');}
function clean(value){return String(value??'').trim();}
function money(value){
  const amount=Number(value);
  if(!Number.isFinite(amount))return '';
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(amount);
}
function shortTime(value){
  const time=Date.parse(String(value||''));
  if(!Number.isFinite(time))return '';
  return new Intl.DateTimeFormat('vi-VN',{
    day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
  }).format(new Date(time));
}
function errorText(error){
  const code=String(error?.message||error||'order_draft_failed').replace(/^FunctionsHttpError:\s*/,'').trim();
  const known={
    authentication_required:'Cần đăng nhập Admin.',
    admin_required:'Chỉ Admin được thao tác đơn tạm.',
    contact_not_found:'Không tìm thấy khách hàng.',
    conversation_mismatch:'Đoạn chat không khớp khách hàng.',
    draft_not_found:'Không tìm thấy đơn tạm.',
    line_not_found:'Không tìm thấy dòng hàng.',
    product_not_found:'Sản phẩm không còn tồn tại.',
    invalid_draft_line:'Số lượng không hợp lệ.',
    invalid_price:'Giá không hợp lệ.',
    product_name_required:'Nhập tên sản phẩm.',
  };
  return known[code]||code;
}

async function invoke(action,payload={}){
  const client=authStore()?.getClient?.();
  if(!client)throw new Error('authentication_required');
  const session=await client.auth.getSession();
  const accessToken=String(session?.data?.session?.access_token||'');
  if(!accessToken)throw new Error('authentication_required');
  const {data,error}=await client.functions.invoke('v21-order-draft',{
    body:{action,...payload},
    headers:{authorization:`Bearer ${accessToken}`},
  });
  if(error||!data?.ok)throw new Error(String(data?.error||error?.message||'order_draft_failed'));
  return data;
}

function installStyle(){
  if(document.getElementById('v21-admin-order-draft-style'))return;
  const style=document.createElement('style');
  style.id='v21-admin-order-draft-style';
  style.textContent=`
    .admin-order-draft-overlay{position:fixed;inset:0;z-index:175;display:grid;place-items:center;padding:12px;pointer-events:auto}
    .admin-order-draft-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)}
    .admin-order-draft-card{position:relative;z-index:1;width:min(96vw,760px);max-height:min(92vh,820px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:10px;padding:14px;border:1px solid var(--theme-border-default,#dedede);border-radius:18px;background:var(--theme-surface-primary,#fff);box-shadow:0 18px 50px rgba(0,0,0,.18);overflow:hidden}
    .admin-order-draft-card[data-view="list"]{width:min(94vw,470px);grid-template-rows:auto auto minmax(0,1fr)}
    .admin-order-draft-head{display:flex;align-items:center;gap:10px;min-width:0}
    .admin-order-draft-title{margin:0;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:750;color:var(--theme-content-primary,#171717)}
    .admin-order-draft-close{width:36px;height:36px;border:0;border-radius:50%;background:var(--theme-surface-secondary,#f4f4f4);color:var(--theme-content-primary,#171717);font:700 20px/1 system-ui;cursor:pointer}
    .admin-order-draft-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .admin-order-draft-status[data-error="true"]{color:#b42318}
    .admin-order-draft-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:0 2px;color:var(--theme-content-tertiary,#777);font-size:11px;font-weight:700}
    .admin-order-draft-list{min-height:0;overflow:auto;display:grid;align-content:start;gap:8px;padding:1px}
    .admin-order-draft-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:stretch}
    .admin-order-draft-left,.admin-order-draft-product{min-width:0;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717)}
    .admin-order-draft-left{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:center;gap:7px;padding:7px}
    .admin-order-draft-qty{box-sizing:border-box;width:100%;min-height:38px;border:1px solid var(--theme-border-default,#d7d7d7);border-radius:9px;background:var(--theme-surface-secondary,#f7f7f7);color:var(--theme-content-primary,#171717);text-align:center;font:700 14px/1.2 system-ui;padding:0 4px}
    .admin-order-draft-raw{min-width:0;overflow-wrap:anywhere;font-size:13px;line-height:1.35}
    .admin-order-draft-product{display:grid;align-content:center;gap:3px;padding:8px 10px;text-align:left;cursor:pointer;font:inherit}
    .admin-order-draft-product-name{min-width:0;overflow-wrap:anywhere;font-size:13px;font-weight:700;line-height:1.3}
    .admin-order-draft-product-price{font-size:12px;color:var(--theme-content-secondary,#666)}
    .admin-order-draft-product[data-empty="true"]{color:var(--theme-content-secondary,#666);font-weight:650}
    .admin-order-draft-search{grid-column:1/-1;display:grid;gap:7px;padding:8px;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;background:var(--theme-surface-secondary,#f7f7f7)}
    .admin-order-draft-search[hidden]{display:none}
    .admin-order-draft-search-input,.admin-order-draft-new-name,.admin-order-draft-new-price{box-sizing:border-box;width:100%;min-height:40px;border:1px solid var(--theme-border-default,#d7d7d7);border-radius:10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;padding:0 10px}
    .admin-order-draft-results{display:grid;gap:5px;max-height:210px;overflow:auto}
    .admin-order-draft-result,.admin-order-draft-add,.admin-order-draft-new-save,.admin-order-draft-new-cancel{min-height:40px;border:1px solid var(--theme-border-default,#dedede);border-radius:10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit;cursor:pointer}
    .admin-order-draft-result{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px;text-align:left}
    .admin-order-draft-result span:first-child{min-width:0;overflow-wrap:anywhere;font-size:13px;font-weight:650}
    .admin-order-draft-result span:last-child{flex:0 0 auto;font-size:12px;color:var(--theme-content-secondary,#666)}
    .admin-order-draft-add{font-weight:700}
    .admin-order-draft-new{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:6px}
    .admin-order-draft-new-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .admin-order-draft-new-save{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);font-weight:700}
    .admin-order-draft-footer{display:flex;justify-content:flex-end}
    .admin-order-draft-send{min-width:132px;min-height:42px;border:0;border-radius:12px;background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);font:700 14px/1 system-ui;cursor:pointer}
    .admin-order-draft-draft{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;padding:10px 12px;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);text-align:left;cursor:pointer;font:inherit}
    .admin-order-draft-draft-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
    .admin-order-draft-draft-progress{font-size:12px;color:var(--theme-content-secondary,#666)}
    .admin-order-draft-draft-time{grid-column:1/-1;font-size:11px;color:var(--theme-content-tertiary,#777)}
    .admin-order-draft-empty{padding:18px 6px;text-align:center;color:var(--theme-content-secondary,#666);font-size:13px}
    @media(max-width:520px){
      .admin-order-draft-overlay{padding:8px}
      .admin-order-draft-card{width:min(98vw,760px);max-height:94vh;padding:10px;border-radius:15px}
      .admin-order-draft-row,.admin-order-draft-columns{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
      .admin-order-draft-left{grid-template-columns:46px minmax(0,1fr);gap:5px;padding:6px}
      .admin-order-draft-product{padding:7px}
      .admin-order-draft-new{grid-template-columns:minmax(0,1fr) 104px}
    }
  `;
  document.head.appendChild(style);
}

function setStatus(text,error=false){
  const node=overlay?.querySelector?.('[data-draft-status]');
  if(!node)return;
  node.textContent=String(text||'');
  node.dataset.error=String(Boolean(error));
}
function lock(){
  const lease=interactionController()?.enter?.(MODE,{owner:OWNER,lockBaseUi:true});
  if(!lease)return false;
  returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{returnFocus?.blur?.();}catch{}
  return true;
}
function unlock({restoreFocus=true}={}){
  interactionController()?.exit?.(MODE,{owner:OWNER});
  const node=returnFocus;
  returnFocus=null;
  if(restoreFocus&&node?.isConnected){
    window.setTimeout(()=>{try{node.focus({preventScroll:true});}catch{}},0);
  }
}
function clearSearchTimers(){
  for(const timer of searchTimers.values())window.clearTimeout(timer);
  searchTimers.clear();
  searchVersions.clear();
}
function close({restoreFocus=true}={}){
  clearSearchTimers();
  if(overlay){overlay.remove();overlay=null;}
  currentDraft=null;
  unlock({restoreFocus});
  return true;
}
function buildOverlay(){
  installStyle();
  const root=overlayRoot();
  if(!root)throw new Error('order_draft_overlay_unavailable');
  if(overlay)return overlay;
  if(!lock())throw new Error('order_draft_modal_busy');
  const section=document.createElement('section');
  section.className='admin-order-draft-overlay';
  section.dataset.adminOrderDraft='';
  section.innerHTML=`
    <button type="button" class="admin-order-draft-backdrop" data-draft-close aria-label="Đóng"></button>
    <div class="admin-order-draft-card" role="dialog" aria-modal="true" aria-label="Đơn tạm">
      <div class="admin-order-draft-head">
        <h2 class="admin-order-draft-title" data-draft-title>Đơn tạm</h2>
        <button type="button" class="admin-order-draft-close" data-draft-close aria-label="Đóng">×</button>
      </div>
      <p class="admin-order-draft-status" data-draft-status data-error="false"></p>
      <div class="admin-order-draft-list" data-draft-body></div>
    </div>`;
  for(const button of section.querySelectorAll('[data-draft-close]'))button.addEventListener('click',()=>close());
  root.appendChild(section);
  overlay=section;
  return section;
}
function resetCard(view='editor'){
  const section=buildOverlay();
  const card=section.querySelector('.admin-order-draft-card');
  if(!card)throw new Error('order_draft_card_unavailable');
  card.dataset.view=view;
  card.innerHTML=`
    <div class="admin-order-draft-head">
      <h2 class="admin-order-draft-title" data-draft-title>${view==='list'?'Đơn tạm':'Đơn tạm'}</h2>
      <button type="button" class="admin-order-draft-close" data-draft-close aria-label="Đóng">×</button>
    </div>
    <p class="admin-order-draft-status" data-draft-status data-error="false"></p>
    <div class="admin-order-draft-list" data-draft-body></div>`;
  card.querySelector('[data-draft-close]')?.addEventListener('click',()=>close());
  return card;
}
function loading(view,title,text){
  const card=resetCard(view);
  const titleNode=card.querySelector('[data-draft-title]');
  if(titleNode)titleNode.textContent=title;
  setStatus(text,false);
  return card;
}
function replaceLine(next){
  if(!currentDraft||!Array.isArray(currentDraft.lines))return;
  currentDraft.lines=currentDraft.lines.map(line=>String(line.id)===String(next.id)?{...line,...next}:line);
}
function renderProductButton(button,line){
  button.replaceChildren();
  const name=document.createElement('span');
  name.className='admin-order-draft-product-name';
  const price=document.createElement('span');
  price.className='admin-order-draft-product-price';
  const has=Boolean(line?.productId&&line?.productName);
  button.dataset.empty=String(!has);
  if(has){
    name.textContent=String(line.productName);
    price.textContent=money(line.unitPrice);
  }else{
    name.textContent='Chọn sản phẩm';
    price.textContent='Tên sản phẩm · Giá';
  }
  button.append(name,price);
}
function findLine(lineId){
  return currentDraft?.lines?.find?.(line=>String(line.id)===String(lineId))||null;
}
function searchVersion(lineId){
  const next=(searchVersions.get(lineId)||0)+1;
  searchVersions.set(lineId,next);
  return next;
}
function renderNewProductForm(searchBox,line){
  const existing=searchBox.querySelector('[data-draft-new]');
  if(existing){existing.remove();return;}
  const form=document.createElement('div');
  form.className='admin-order-draft-new';
  form.dataset.draftNew='';
  form.innerHTML=`
    <input class="admin-order-draft-new-name" data-draft-new-name aria-label="Tên sản phẩm" placeholder="Tên sản phẩm">
    <input class="admin-order-draft-new-price" data-draft-new-price aria-label="Giá" inputmode="numeric" placeholder="Giá">
    <div class="admin-order-draft-new-actions">
      <button type="button" class="admin-order-draft-new-cancel" data-draft-new-cancel>Hủy</button>
      <button type="button" class="admin-order-draft-new-save" data-draft-new-save>Lưu sản phẩm</button>
    </div>`;
  searchBox.appendChild(form);
  const name=form.querySelector('[data-draft-new-name]');
  const price=form.querySelector('[data-draft-new-price]');
  form.querySelector('[data-draft-new-cancel]')?.addEventListener('click',()=>form.remove());
  form.querySelector('[data-draft-new-save]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    setStatus('Đang thêm sản phẩm…');
    try{
      const data=await invoke('create_product',{
        draftId:currentDraft.id,
        lineId:line.id,
        name:name.value,
        price:price.value,
      });
      replaceLine(data.line);
      renderProductButton(searchBox.parentElement.querySelector('[data-draft-product]'),data.line);
      searchBox.hidden=true;
      setStatus('Đã lưu sản phẩm và chọn vào dòng.');
    }catch(error){
      setStatus(errorText(error),true);
      button.disabled=false;
    }
  });
  name.focus({preventScroll:true});
}
function renderSearchResults(searchBox,line,products){
  const results=searchBox.querySelector('[data-draft-results]');
  if(!results)return;
  results.replaceChildren();
  if(!products.length){
    const empty=document.createElement('div');
    empty.className='admin-order-draft-empty';
    empty.textContent='Không có sản phẩm phù hợp.';
    results.appendChild(empty);
  }else{
    for(const product of products){
      const button=document.createElement('button');
      button.type='button';
      button.className='admin-order-draft-result';
      const name=document.createElement('span');
      name.textContent=String(product.name||'');
      const price=document.createElement('span');
      price.textContent=money(product.price);
      button.append(name,price);
      button.addEventListener('click',async()=>{
        button.disabled=true;
        setStatus('Đang chọn sản phẩm…');
        try{
          const data=await invoke('select_product',{
            draftId:currentDraft.id,
            lineId:line.id,
            productId:product.id,
          });
          replaceLine(data.line);
          renderProductButton(searchBox.parentElement.querySelector('[data-draft-product]'),data.line);
          searchBox.hidden=true;
          setStatus('Đã chọn sản phẩm.');
        }catch(error){setStatus(errorText(error),true);button.disabled=false;}
      });
      results.appendChild(button);
    }
  }
}
async function runSearch(searchBox,line,query){
  const version=searchVersion(String(line.id));
  const results=searchBox.querySelector('[data-draft-results]');
  if(results)results.textContent='Đang tìm…';
  try{
    const data=await invoke('search_products',{query});
    if(searchVersions.get(String(line.id))!==version)return;
    renderSearchResults(searchBox,line,Array.isArray(data.products)?data.products:[]);
  }catch(error){
    if(searchVersions.get(String(line.id))!==version)return;
    if(results)results.textContent='Không thể tìm sản phẩm. Gõ lại để thử.';
    setStatus(errorText(error),true);
  }
}
function openSearch(row,line){
  const searchBox=row.querySelector('[data-draft-search]');
  if(!searchBox)return;
  if(!searchBox.hidden){searchBox.hidden=true;return;}
  searchBox.hidden=false;
  if(!searchBox.dataset.ready){
    searchBox.dataset.ready='true';
    searchBox.innerHTML=`
      <input class="admin-order-draft-search-input" data-draft-search-input aria-label="Tìm sản phẩm" placeholder="Tìm tên sản phẩm">
      <div class="admin-order-draft-results" data-draft-results></div>
      <button type="button" class="admin-order-draft-add" data-draft-add>+ Thêm mới</button>`;
    const input=searchBox.querySelector('[data-draft-search-input]');
    input.addEventListener('input',()=>{
      const key=String(line.id);
      const prior=searchTimers.get(key);
      if(prior)window.clearTimeout(prior);
      searchTimers.set(key,window.setTimeout(()=>{
        searchTimers.delete(key);
        void runSearch(searchBox,line,input.value);
      },180));
    });
    searchBox.querySelector('[data-draft-add]')?.addEventListener('click',()=>renderNewProductForm(searchBox,line));
  }
  const input=searchBox.querySelector('[data-draft-search-input]');
  input?.focus?.({preventScroll:true});
  void runSearch(searchBox,line,input?.value||'');
}
function renderDraftRow(line){
  const row=document.createElement('div');
  row.className='admin-order-draft-row';
  row.dataset.draftLine=String(line.id);

  const left=document.createElement('div');
  left.className='admin-order-draft-left';
  const quantity=document.createElement('input');
  quantity.className='admin-order-draft-qty';
  quantity.type='number';
  quantity.min='0.01';
  quantity.step='any';
  quantity.inputMode='decimal';
  quantity.value=String(line.quantity);
  quantity.dataset.draftQuantity='';
  quantity.setAttribute('aria-label','Số lượng');
  const raw=document.createElement('span');
  raw.className='admin-order-draft-raw';
  raw.dataset.draftRawName='';
  raw.textContent=String(line.rawName||'');
  left.append(quantity,raw);

  const product=document.createElement('button');
  product.type='button';
  product.className='admin-order-draft-product';
  product.dataset.draftProduct='';
  renderProductButton(product,line);

  const search=document.createElement('div');
  search.className='admin-order-draft-search';
  search.dataset.draftSearch='';
  search.hidden=true;

  quantity.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();quantity.blur();}
  });
  quantity.addEventListener('change',async()=>{
    const prior=Number(findLine(line.id)?.quantity||line.quantity);
    const next=Number(quantity.value);
    if(!Number.isFinite(next)||next<=0){quantity.value=String(prior);setStatus('Số lượng không hợp lệ.',true);return;}
    quantity.disabled=true;
    setStatus('Đang lưu số lượng…');
    try{
      const data=await invoke('update_quantity',{
        draftId:currentDraft.id,
        lineId:line.id,
        quantity:next,
      });
      replaceLine(data.line);
      quantity.value=String(data.line.quantity);
      setStatus('Đã lưu.');
    }catch(error){
      quantity.value=String(prior);
      setStatus(errorText(error),true);
    }finally{quantity.disabled=false;}
  });
  product.addEventListener('click',()=>openSearch(row,findLine(line.id)||line));

  row.append(left,product,search);
  return row;
}
function renderEditor(draft){
  currentDraft=draft;
  const card=resetCard('editor');
  const title=card.querySelector('[data-draft-title]');
  if(title)title.textContent=String(draft?.customerName||'Đơn tạm');
  const body=card.querySelector('[data-draft-body]');
  body.replaceChildren();

  const columns=document.createElement('div');
  columns.className='admin-order-draft-columns';
  columns.innerHTML='<span>SL + tên gốc</span><span>Tên sản phẩm · Giá</span>';
  card.insertBefore(columns,body);

  for(const line of draft?.lines||[])body.appendChild(renderDraftRow(line));
  if(!(draft?.lines||[]).length){
    const empty=document.createElement('div');
    empty.className='admin-order-draft-empty';
    empty.textContent='Đơn tạm chưa có dòng hàng.';
    body.appendChild(empty);
  }

  const footer=document.createElement('div');
  footer.className='admin-order-draft-footer';
  const send=document.createElement('button');
  send.type='button';
  send.className='admin-order-draft-send';
  send.textContent='Gửi đơn';
  send.addEventListener('click',()=>close());
  footer.appendChild(send);
  card.appendChild(footer);
  setStatus('Tự lưu khi đổi số lượng hoặc chọn sản phẩm.');
  return true;
}
function renderDraftList(drafts){
  currentDraft=null;
  const card=resetCard('list');
  const body=card.querySelector('[data-draft-body]');
  body.replaceChildren();
  const rows=Array.isArray(drafts)?drafts:[];
  if(!rows.length){
    const empty=document.createElement('div');
    empty.className='admin-order-draft-empty';
    empty.textContent='Chưa có đơn tạm.';
    body.appendChild(empty);
  }else{
    for(const draft of rows){
      const button=document.createElement('button');
      button.type='button';
      button.className='admin-order-draft-draft';
      const name=document.createElement('span');
      name.className='admin-order-draft-draft-name';
      name.textContent=String(draft.customerName||'Liên hệ');
      const progress=document.createElement('span');
      progress.className='admin-order-draft-draft-progress';
      progress.textContent=Number(draft.total)>0?`${Number(draft.mapped)||0}/${Number(draft.total)||0}`:'';
      const time=document.createElement('span');
      time.className='admin-order-draft-draft-time';
      time.textContent=shortTime(draft.updatedAt||draft.createdAt);
      button.append(name,progress,time);
      button.addEventListener('click',()=>void openDraft(draft.id));
      body.appendChild(button);
    }
  }
  setStatus(`${rows.length} đơn tạm`);
  return true;
}
async function createFromParsed({contactId,conversationId=null,customerName='',items=[]}={}){
  loading('editor',clean(customerName)||'Đơn tạm','Đang tạo đơn tạm…');
  try{
    const data=await invoke('create_from_lines',{contactId,conversationId,customerName,lines:items});
    if(!data?.draft?.id)throw new Error('draft_create_failed');
    renderEditor(data.draft);
    return data.draft;
  }catch(error){setStatus(errorText(error),true);throw error;}
}
async function openDraft(draftId){
  loading('editor','Đơn tạm','Đang mở đơn tạm…');
  try{
    const data=await invoke('get',{draftId});
    if(!data?.draft?.id)throw new Error('draft_not_found');
    renderEditor(data.draft);
    return data.draft;
  }catch(error){setStatus(errorText(error),true);throw error;}
}
async function openList(){
  loading('list','Đơn tạm','Đang tải…');
  try{
    const data=await invoke('list');
    renderDraftList(Array.isArray(data.drafts)?data.drafts:[]);
    return true;
  }catch(error){setStatus(errorText(error),true);throw error;}
}

window.V21AdminOrderDraft=Object.freeze({
  createFromParsed,
  openDraft,
  openList,
  close,
});
})();
