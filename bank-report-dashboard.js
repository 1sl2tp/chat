(()=>{'use strict';
// BANK-177: a live, read-only reconciliation TABLE inside the existing report contact.
// Canonical message/read-state Realtime remains the only wake owner, no polling.
const REPORT_ID='fc3ec480-60d2-4749-b7af-5f4ae71eb14e';
const stage=document.getElementById('stageLayout');
const root=document.getElementById('bankReportDashboard');
if(!stage||!root)return;
const ui={
 date:root.querySelector('[data-bank-date]'),
 refresh:root.querySelector('[data-bank-refresh]'),
 summary:root.querySelector('[data-bank-summary]'),
 status:root.querySelector('[data-bank-status]'),
 table:root.querySelector('[data-bank-table]'),
 tabs:root.querySelector('[data-bank-filters]'),
 groups:root.querySelector('[data-bank-groups]'),
 stamp:root.querySelector('[data-bank-updated]'),
 viewer:root.querySelector('[data-bank-viewer]')
};
const filters=[
 ['all','Tất cả'],['matched','Đã khớp'],['waiting_bank','Bill chờ Agribank'],
 ['bank_only','Agribank chờ bill'],['review','Cần xem'],['wrong_day','Sai ngày'],
 ['duplicate','Trùng'],['non_bill','Không phải bill'],['test_excluded','Test (loại)']
];
const money=x=>x===null||x===undefined||x===''||!Number.isFinite(Number(x))?'—':new Intl.NumberFormat('vi-VN').format(Number(x))+'đ';
const localDate=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(x=>x.type===t)?.value||'';return part('year')+'-'+part('month')+'-'+part('day');};
const localTime=x=>{
 if(!x)return'—';
 const s=String(x).replace('T',' ');
 return s.length>=16?s.slice(11,16):s;
};
const statusText={
 matched:'Đã đối soát',waiting_bank:'Chờ Agribank',bank_only:'Chờ bill',
 review:'Cần kiểm tra',wrong_day:'Sai ngày',duplicate:'Bill trùng',
 non_bill:'Không phải bill',reading:'Đang đọc ảnh',test_excluded:'Tiền test (loại)'
};
let active=false,filter='all',selectedCustomer=null,current=null,requestId=0,loading=false,queued=false,pendingPush=null;
let imageObjectUrl=null;
const el=(tag,className='',value='')=>{
 const node=document.createElement(tag);if(className)node.className=className;
 if(value!==undefined&&value!==null)node.textContent=String(value);
 return node;
};
const append=(parent,...kids)=>{kids.forEach(x=>parent.appendChild(x));return parent;};
const cell=(label,value)=>append(el('div','bank-report-field'),el('span','bank-report-field-label',label),el('strong','bank-report-field-value',value));
function isReportContact(){
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const contact=window.ChatAppShell?.ScreenSession?.snapshot?.()?.activeContact;
 const contacts=window.V21ContactStore?.snapshot?.()||[];
 const actual=Array.isArray(contacts)?contacts.find(x=>String(x.id)===String(contact?.id)):null;
 return auth.state==='AUTHENTICATED'&&auth.account?.role==='admin'&&Boolean(contact?.id)&&
   (String(contact.id)===REPORT_ID||actual?.username==='taphoa_bao_cao');
}
function dateReady(){
 const today=localDate();ui.date.max=today;
 if(!ui.date.value||ui.date.value>today||ui.date.value<'2026-10-19')ui.date.value=today;
 return ui.date.value;
}
async function reload(){
 if(!active||document.hidden)return;
 if(loading){queued=true;return;}
 loading=true;const id=++requestId;
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const client=window.V21AuthSessionStore?.getClient?.();
 const day=dateReady();
 ui.stamp.textContent='Đang cập nhật…';
 try{
  if(!auth.appSessionId||!client)throw Error('Chưa có phiên Admin');
  const {data,error}=await client.rpc('chat_bank_dashboard',{p_app_session_id:auth.appSessionId,p_day:day});
  if(error)throw error;
  if(id!==requestId||!active||ui.date.value!==day)return;
  current=data;paint(data);focusPushRecord(data);
  const when=new Date(data.updated_at);
  ui.stamp.textContent='Dữ liệu '+(Number.isFinite(when.getTime())?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(when):'mới nhất')+(data.closed?' · Đã khóa sổ':' · Đang mở sổ');
 }catch(error){
  if(id===requestId&&active){ui.stamp.textContent='Chưa lấy được dữ liệu. Bấm Làm mới.';ui.groups.replaceChildren(el('p','bank-report-empty','Không tải được bảng đối soát.'));}
 }finally{loading=false;if(queued){queued=false;void reload();}}
}
function cardValue(name,value,highlight=false,compact=false){
 return append(el('div','bank-report-stat'+(highlight?' bank-report-stat-primary':'')+(compact?' bank-report-stat-compact':'')),
  el('span','bank-report-stat-name',name),el('strong','bank-report-stat-number',value));
}
function paint(data){
 const s=data?.summary||{};
 ui.summary.replaceChildren(
  cardValue('Giao dịch đã khớp',String(s.matched_count||0)),
  cardValue('Tiền đã xác nhận',money(s.matched_amount),true)
 );
 ui.status.replaceChildren(
  cardValue('Bill chờ ngân hàng',String(s.bill_only_count||0),false,true),
  cardValue('Ngân hàng chờ bill',String(s.bank_only_count||0),false,true),
  cardValue('Bill sai ngày',String(s.old_date_count||0),false,true),
  cardValue('Ảnh trùng',String(s.duplicate_count||0),false,true)
 );
 renderTable(data);
 const mainKeys=new Set(['all','matched','waiting_bank','bank_only','review']);
 const makeFilter=([key,label])=>{
   const b=el('button','bank-report-filter'+(filter===key?' is-selected':''),label);
   b.type='button';b.dataset.filter=key;b.setAttribute('aria-pressed',String(filter===key));
   b.addEventListener('click',()=>{filter=key;selectedCustomer=null;paint(data);});
   return b;
 };
 const primary=filters.filter(([key])=>mainKeys.has(key)).map(makeFilter);
 const secondary=filters.filter(([key])=>!mainKeys.has(key));
 const more=el('details','bank-report-filter-more'+(!mainKeys.has(filter)?' is-selected':''));
 const summary=el('summary','bank-report-filter-more-trigger',!mainKeys.has(filter)?'Khác · đang lọc':'Khác');
 summary.setAttribute('aria-label','Các trạng thái đối soát khác');
 const menu=el('div','bank-report-filter-more-menu');
 for(const item of secondary){
  const b=makeFilter(item);
  b.addEventListener('click',()=>{more.open=false;});
  menu.appendChild(b);
 }
 append(more,summary,menu);
 ui.tabs.replaceChildren(...primary,more);
 renderGroups(data);
}
function renderTable(data){
 const bills=Array.isArray(data?.bills)?data.bills:[],byCustomer=new Map();
 for(const r of bills){
  if(r.report_status==='non_bill'||r.report_status==='test_excluded')continue;
  const key=String(r.customer_id||'unknown');
  const g=byCustomer.get(key)||{id:key,name:r.customer_name||'Khách chưa rõ',matched:0,waiting:0,duplicate:0,old:0,money:0};
  if(r.report_status==='matched'){g.matched++;g.money+=Number(r.amount_vnd)||0;}
  if(['waiting_bank','reading','review'].includes(r.report_status))g.waiting++;
  if(r.report_status==='duplicate')g.duplicate++;
  if(r.report_status==='wrong_day')g.old++;
  byCustomer.set(key,g);
 }
 const table=el('table','bank-report-table');
 const head=el('thead'),thead=el('tr');
 for(const name of ['Khách hàng','Khớp','Chờ','Trùng','Sai ngày','Đã thu'])thead.appendChild(el('th','',name));
 head.appendChild(thead);table.appendChild(head);
 const tbody=el('tbody');
 for(const g of [...byCustomer.values()].sort((a,b)=>b.money-a.money||a.name.localeCompare(b.name,'vi'))){
  const tr=el('tr','bank-report-table-item'+(selectedCustomer===g.id?' is-selected':''));tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Xem chi tiết '+g.name);tr.setAttribute('aria-expanded',String(selectedCustomer===g.id));
  for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,money(g.money)])tr.appendChild(el('td','',v));
  const jump=()=>{selectedCustomer=selectedCustomer===g.id?null:g.id;filter='all';paint(data);if(selectedCustomer)root.querySelector('[data-bank-customer="'+g.id+'"]')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});};
  tr.addEventListener('click',jump);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump();}});
  tbody.appendChild(tr);
 }
 if(!tbody.children.length){const tr=el('tr');const td=el('td','','Chưa có bill của khách ngày này');td.colSpan=6;tr.appendChild(td);tbody.appendChild(tr);}
 table.appendChild(tbody);ui.table.replaceChildren(table);
}
function detailLine(row,isBank=false){
 const type=isBank?'bank_only':row.report_status;
 const wrap=el('details','bank-report-detail');
 if(row.receipt_id)wrap.dataset.bankReceiptId=String(row.receipt_id);
 if(row.notice_id)wrap.dataset.bankNoticeId=String(row.notice_id);
 const top=el('summary','bank-report-detail-top');
 const label=el('span','bank-report-detail-status bank-status-'+type,statusText[type]||'Cần kiểm tra');
 const left=el('span','bank-report-detail-time',isBank?localTime(row.bank_time):localTime(row.bill_time||row.sent_at));
 const amt=el('strong','bank-report-detail-amount',money(isBank?row.amount_vnd:row.amount_vnd));
 append(top,left,amt,label);wrap.appendChild(top);
 const content=el('div','bank-report-detail-content');
 append(content,cell('Giờ bill',isBank?'Chưa có bill':(row.bill_time||'Không đọc được')),
  cell('Giờ Agribank',isBank?(row.bank_time||'—'):(row.bank_time||'Chưa có thông báo')),
  cell('Giờ khách gửi ảnh',isBank?'—':(row.sent_at?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(row.sent_at)):'—')),
  cell('Mã giao dịch',row.transfer_reference||'—'),
  cell('Thông báo ngân hàng',isBank?'#'+row.notice_id:(row.notice_id?'#'+row.notice_id:'Chưa có')),
  cell('Tình trạng',statusText[type]||row.status||'Chưa rõ'));
 if(row.reason&&!isBank)content.appendChild(el('p','bank-report-detail-reason','Ghi chú: '+row.reason));
 const actions=el('div','bank-report-detail-actions');
 if(!isBank&&row.asset_id){
  const b=el('button','bank-report-action','Xem ảnh bill');b.type='button';
  b.addEventListener('click',()=>{void showBill(row);});actions.appendChild(b);
 }
 if(!isBank&&row.customer_id){
  const b=el('button','bank-report-action','Mở hội thoại khách');b.type='button';
  b.addEventListener('click',()=>{window.ChatAppShell?.NavigationCommand?.openContact?.(row.customer_id,row.customer_name||'Khách hàng');});actions.appendChild(b);
 }
 content.appendChild(actions);wrap.appendChild(content);
 return wrap;
}
function renderGroups(data){
 const allBills=Array.isArray(data?.bills)?data.bills:[];
 const bankOnly=Array.isArray(data?.bank_only)?data.bank_only:[];
 const selected=filter==='all' ? (selectedCustomer?allBills.filter(r=>String(r.customer_id)===selectedCustomer):[])
   :allBills.filter(r=>r.report_status===filter||(filter==='review'&&r.report_status==='reading'));
 const banks=(filter==='all'||filter==='bank_only')?bankOnly:[];
 const grouped=new Map();
 for(const row of selected){
  const key=String(row.customer_id||'none'),g=grouped.get(key)||{id:key,name:row.customer_name||'Khách chưa rõ',rows:[],amount:0,matched:0};
  g.rows.push(row);
  if(row.report_status==='matched'){g.matched++;g.amount+=Number(row.amount_vnd)||0;}
  grouped.set(key,g);
 }
 ui.groups.replaceChildren();
 if(filter==='all'&&!selectedCustomer&&!banks.length){
  ui.groups.appendChild(el('div','bank-report-detail-hint','Chạm một khách hàng trong bảng để xem từng bill và giờ đối soát.'));
  return;
 }
 const title=el('div','bank-report-detail-section-head');
 title.appendChild(el('strong','','Chi tiết giao dịch'));
 if(selectedCustomer){
  const close=el('button','bank-report-dismiss','Đóng chi tiết');close.type='button';
  close.addEventListener('click',()=>{selectedCustomer=null;paint(data);});
  title.appendChild(close);
 }
 ui.groups.appendChild(title);
 if(banks.length){
  const block=el('section','bank-report-customer bank-report-bank-only');
  block.appendChild(append(el('div','bank-report-customer-head'),
   el('strong','bank-report-customer-name','Agribank có tiền · chưa có bill'),
   el('span','bank-report-customer-count',banks.length+' giao dịch · '+money(banks.reduce((s,x)=>s+Number(x.amount_vnd||0),0)))));
  banks.forEach(row=>block.appendChild(detailLine(row,true)));
  ui.groups.appendChild(block);
 }
 const sorted=[...grouped.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'vi'));
 for(const group of sorted){
  const block=el('section','bank-report-customer');block.dataset.bankCustomer=group.id;
  const different=group.rows.length-group.matched;
  const info=group.matched+' giao dịch khớp · '+money(group.amount)+(different?' · '+different+' ảnh khác':'');
  block.appendChild(append(el('div','bank-report-customer-head'),
   el('strong','bank-report-customer-name',group.name),
   el('span','bank-report-customer-count',info)));
  const entry=el('div','bank-report-customer-entries');
  group.rows.sort((a,b)=>String(a.bill_time||a.sent_at).localeCompare(String(b.bill_time||b.sent_at)));
  group.rows.forEach(row=>entry.appendChild(detailLine(row)));
  block.appendChild(entry);
  ui.groups.appendChild(block);
 }
 if(!sorted.length&&!banks.length)ui.groups.appendChild(el('p','bank-report-empty','Không có giao dịch thuộc bộ lọc này.'));
}
function openPush(intent={}){
  // A push click is user-driven. The table opens the day and transaction
  // even when it was already on another day, or the report contact is loading.
  const date=String(intent.bankDay||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  if(date<'2026-10-19'||date>localDate())return false;
  pendingPush={bankDay:date,bankNoticeId:String(intent.bankNoticeId||''),
    bankReceiptId:String(intent.bankReceiptId||''),bankStatus:String(intent.bankStatus||'')};
  const previous=ui.date.value;
  ui.date.value=date;
  selectedCustomer=null;
  filter='all';
  if(active){
    if(current&&previous===date&&String(current.date)===date)focusPushRecord(current);
    else void reload();
  }
  return true;
}
function focusPushRecord(data){
  if(!pendingPush||!active||ui.date.value!==pendingPush.bankDay)return;
  const target=pendingPush;
  const rows=Array.isArray(data?.bills)?data.bills:[];
  const bankRows=Array.isArray(data?.bank_only)?data.bank_only:[];
  const bill=rows.find(row=>
    (target.bankReceiptId&&String(row.receipt_id)===target.bankReceiptId)||
    (target.bankNoticeId&&String(row.notice_id)===target.bankNoticeId));
  const bank=bankRows.find(row=>target.bankNoticeId&&String(row.notice_id)===target.bankNoticeId);
  if(bill){
    selectedCustomer=String(bill.customer_id||'');
    filter='all';
    paint(data);
  }else if(bank){
    selectedCustomer=null;
    filter='bank_only';
    paint(data);
  }else{
    // The record may have been resolved since the push was sent.
    filter=target.bankStatus==='review'?'review':target.bankStatus==='matched'?'matched':'all';
    paint(data);
  }
  pendingPush=null;
  requestAnimationFrame(()=>{
    let row=null;
    for(const node of ui.groups.querySelectorAll('.bank-report-detail')){
      if(target.bankReceiptId&&node.dataset.bankReceiptId===target.bankReceiptId){row=node;break;}
      if(target.bankNoticeId&&node.dataset.bankNoticeId===target.bankNoticeId){row=node;break;}
    }
    if(row){row.open=true;row.scrollIntoView?.({block:'center',behavior:'smooth'});}
    else ui.groups.scrollIntoView?.({block:'start',behavior:'smooth'});
  });
}

function closeViewer(){
 if(imageObjectUrl){URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=null;}
 ui.viewer.hidden=true;ui.viewer.replaceChildren();
}
async function showBill(row){
 closeViewer();ui.viewer.hidden=false;
 const overlay=el('div','bank-report-image-overlay');
 const pane=el('div','bank-report-image-pane');
 const exit=el('button','bank-report-image-close','Đóng');exit.type='button';exit.addEventListener('click',closeViewer);
 const status=el('p','bank-report-image-status','Đang mở ảnh bill…');
 append(pane,exit,status);overlay.appendChild(pane);ui.viewer.appendChild(overlay);
 overlay.addEventListener('click',event=>{if(event.target===overlay)closeViewer();});
 try{
  const accountId=window.V21AuthSessionStore?.snapshot?.()?.account?.id;
  let cached=await window.V21MediaCache?.get?.({accountId,assetId:row.asset_id});
  if(!(cached?.blob instanceof Blob))cached=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId:row.asset_id});
  if(ui.viewer.hidden)return;
  if(!(cached?.blob instanceof Blob))throw Error('Không mở được ảnh');
  imageObjectUrl=URL.createObjectURL(cached.blob);
  const img=el('img','bank-report-image');
  img.src=imageObjectUrl;img.alt='Bill gốc của '+(row.customer_name||'khách');
  pane.replaceChild(img,status);
 }catch{
  status.textContent='Không tải được ảnh ở đây. Bạn có thể mở hội thoại khách để xem bản gốc.';
  const b=el('button','bank-report-action','Mở hội thoại khách');b.type='button';
  b.addEventListener('click',()=>{closeViewer();window.ChatAppShell?.NavigationCommand?.openContact?.(row.customer_id,row.customer_name||'Khách');});
  pane.appendChild(b);
 }
}
function synchronize(){
 const should=isReportContact();
 if(should===active)return;
 active=should;
 stage.dataset.bankReportActive=should?'true':'false';
 root.hidden=!should;
 if(should){dateReady();void reload();}else{requestId++;selectedCustomer=null;closeViewer();current=null;}
}
ui.refresh.addEventListener('click',()=>void reload());
ui.date.addEventListener('change',()=>{filter='all';selectedCustomer=null;current=null;void reload();});
document.addEventListener('v21-active-contact-change',synchronize);
document.addEventListener('v21-contact-store-change',synchronize);
document.addEventListener('v21-auth-state',synchronize);
document.addEventListener('v21-conversation-context',synchronize);
document.addEventListener('v21-bank-report-dirty',()=>{if(active)void reload();});
document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden)void reload();});
window.V21BankReportDashboard={refresh:()=>void reload(),openPush,snapshot:()=>({active,day:ui.date.value,matched:current?.summary?.matched_count||0})};
synchronize();
})();