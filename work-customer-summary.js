(()=>{
'use strict';

const REFRESH_MS=60000;
let timer=0;
let loading=false;
let generation=0;

function root(){return document.querySelector('[data-work-summary-root]');}
function authStore(){return window.V21AuthSessionStore||null;}
function snapshot(){return authStore()?.snapshot?.()||{state:'BOOTING',account:null};}
function client(){return authStore()?.getClient?.()||null;}

function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined&&text!==null)el.textContent=String(text);
  return el;
}

function formatTime(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  try{return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);}
  catch{return date.toLocaleString();}
}

function quantityText(item={}){
  if(item.quantity===null||item.quantity===undefined||item.quantity==='')return '?';
  const quantity=Number(item.quantity);
  const label=Number.isFinite(quantity)?String(quantity):String(item.quantity);
  return item.unit?`${label} ${String(item.unit)}`:label;
}

function totalText(result={}){
  const parts=[];
  const totalLines=Number(result.totalLines)||0;
  parts.push(`${totalLines} dòng`);
  for(const total of Array.isArray(result.totals)?result.totals:[]){
    const quantity=Number(total?.quantity);
    if(!Number.isFinite(quantity)||quantity<=0)continue;
    parts.push(total?.unit?`${quantity} ${String(total.unit)}`:`${quantity} SL`);
  }
  return parts.join(' · ');
}

function sourceLabel(item={}){
  const source=String(item.source||'').toLowerCase();
  if(source.includes('image')&&source.includes('text'))return 'ẢNH + TEXT';
  if(source.includes('image'))return 'ẢNH';
  if(source.includes('admin-context'))return 'NGỮ CẢNH';
  return '';
}

function renderItem(item,index){
  const li=node('li','work-summary-item');
  const main=node('div','work-summary-item-main');
  const name=node('span','work-summary-item-name',item?.name||item?.rawEvidence||'Chưa rõ');
  const qty=node('strong','work-summary-item-qty',quantityText(item));
  main.append(name,qty);
  li.append(main);

  const badges=[];
  const source=sourceLabel(item);
  if(source)badges.push(source);
  if(item?.ambiguous)badges.push('NGHI NGỜ');
  if(item?.inferred)badges.push('SUY LUẬN');
  if(badges.length){
    const meta=node('div','work-summary-item-meta');
    for(const label of badges)meta.append(node('span','work-summary-badge',label));
    li.append(meta);
  }

  const evidence=String(item?.rawEvidence||'').trim();
  if(evidence&&(item?.ambiguous||item?.inferred)){
    const original=node('div','work-summary-evidence');
    original.append(node('span','work-summary-evidence-label','Gốc: '));
    original.append(document.createTextNode(evidence));
    li.append(original);
  }
  li.dataset.index=String(index+1);
  return li;
}

function renderCustomer(row){
  const result=row?.result_json&&typeof row.result_json==='object'?row.result_json:{};
  const items=Array.isArray(result.items)?result.items:[];
  const card=node('section','work-summary-customer');
  card.dataset.customerId=String(row?.customer_id||'');

  const head=node('div','work-summary-customer-head');
  const titleWrap=node('div','work-summary-customer-title');
  titleWrap.append(node('strong','work-summary-customer-name',row?.display_name||row?.username||'Khách hàng'));
  const stamp=formatTime(row?.last_scanned_at);
  if(stamp)titleWrap.append(node('span','work-summary-customer-time',stamp));
  head.append(titleWrap,node('span','work-summary-total',totalText(result)));
  card.append(head);

  if(row?.last_error){
    card.append(node('div','work-summary-warning',`Lần quét gần nhất có lỗi: ${String(row.last_error)}`));
  }

  if(!items.length){
    card.append(node('div','work-summary-empty-customer','Không có dòng hàng được xác định.'));
    return card;
  }

  const list=node('ol','work-summary-list');
  list.start=1;
  items.forEach((item,index)=>list.append(renderItem(item,index)));
  card.append(list);
  return card;
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

function renderRows(rows=[]){
  const host=root();
  if(!host)return;
  host.replaceChildren();

  const header=node('div','work-summary-header');
  const title=node('div','work-summary-header-title');
  title.append(node('strong','work-summary-heading','Tổng hợp hàng hóa'));
  title.append(node('span','work-summary-subheading',`${rows.length} khách có kết quả quét`));
  header.append(title);
  host.append(header);

  if(!rows.length){
    host.append(node('div','work-summary-state work-summary-state-muted','Chưa có kết quả quét.'));
    return;
  }

  const body=node('div','work-summary-body');
  for(const row of rows)body.append(renderCustomer(row));
  host.append(body);
}

async function refresh(reason='timer'){
  const host=root();
  if(!host||loading)return false;
  const auth=snapshot();
  if(auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin'){
    renderShell('Đăng nhập Admin để xem kết quả quét.');
    return false;
  }
  const db=client();
  if(!db){renderShell('Chưa sẵn sàng kết nối dữ liệu.','error');return false;}

  loading=true;
  const requestGeneration=++generation;
  host.dataset.loading='true';
  if(!host.querySelector('.work-summary-customer'))renderShell('Đang tải kết quả quét…');
  try{
    const {data,error}=await db.rpc('chat_customer_summary_work_feed');
    if(error)throw error;
    if(requestGeneration!==generation)return false;
    renderRows(Array.isArray(data)?data:[]);
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

document.addEventListener('v21-auth-state',()=>{void refresh('auth-state');});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void refresh('visible');
});
document.addEventListener('click',event=>{
  const target=event.target?.closest?.('[data-top-tab="work"],[data-nav-target="work"]');
  if(target)void refresh('open-work');
});

schedule();
void refresh('boot');

window.V21WorkCustomerSummary=Object.freeze({refresh});
})();
