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
const money=x=>Number.isFinite(Number(x))?new Intl.NumberFormat('vi-VN').format(Number(x))+'đ':'—';
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
let active=false,filter='all',current=null,requestId=0,loading=false,queued=false;
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
  current=data;paint(data);
  const when=new Date(data.updated_at);
  ui.stamp.textContent='Dữ liệu '+(Number.isFinite(when.getTime())?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(when):'mới nhất')+(data.closed?' · Đã khóa sổ':' · Đang mở sổ');
 }catch(error){
  if(id===requestId&&active){ui.stamp.textContent='Chưa lấy được dữ liệu. Bấm Làm mới.';ui.groups.replaceChildren(el('p','bank-report-empty','Không tải được bảng đối soát.'));}
 }finally{loading=false;if(queued){queued=false;void reload();}}
}
function cardValue(name,value,highlight=false){
 return append(el('div','bank-report-stat'+(highlight?' bank-report-stat-primary':'')),el('div','bank-report-stat-name',name),el('strong','bank-report-stat-number',value));
}
function paint(data){
 const s=data?.summary||{};ui.summary.replaceChildren(
  cardValue('Đã khớp',String(s.matched_count||0)+' giao dịch',true),
  cardValue('Tiền xác nhận',money(s.matched_amount)),
  cardValue('Bill chờ ngân hàng',String(s.bill_only_count||0)),
  cardValue('Ngân hàng chờ bill',String(s.bank_only_count||0)),
  cardValue('Bill sai ngày',String(s.old_date_count||0)),
  cardValue('Ảnh trùng',String(s.duplicate_count||0))
 );
 renderTable(data);
 ui.tabs.replaceChildren(...filters.map(([key,label])=>{
  const button=el('button','bank-report-filter'+(filter===key?' is-selected':''),label);
  button.type='button';button.dataset.filter=key;button.setAttribute('aria-pressed',String(filter===key));
  button.addEventListener('click',()=>{filter=key;paint(data);});
  return button;
 }));
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
  const tr=el('tr','bank-report-table-item');tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Xem chi tiết '+g.name);
  for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,money(g.money)])tr.appendChild(el('td','',v));
  const jump=()=>{filter='all';paint(data);root.querySelector('[data-bank-customer="'+g.id+'"]')?.scrollIntoView?.({block:'start',behavior:'smooth'});};
  tr.addEventListener('click',jump);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump();}});
  tbody.appendChild(tr);
 }
 if(!tbody.children.length){const tr=el('tr');const td=el('td','','Chưa có bill của khách ngày này');td.colSpan=6;tr.appendChild(td);tbody.appendChild(tr);}
 table.appendChild(tbody);ui.table.replaceChildren(table);
}
function detailLine(row,isBank=false){
 const type=isBank?'bank_only':row.report_status;
 const wrap=el('details','bank-report-detail');
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
 let rows=allBills.filter(r=>filter==='all'||r.report_status===filter||(filter==='review'&&r.report_status==='reading'));
 const banks=(filter==='all'||filter==='bank_only')?bankOnly:[];
 const grouped=new Map();
 for(const row of rows){
  const key=String(row.customer_id||'none'),g=grouped.get(key)||{id:key,name:row.customer_name||'Khách chưa rõ',rows:[],amount:0,matched:0};
  g.rows.push(row);
  if(row.report_status==='matched'){g.matched++;g.amount+=Number(row.amount_vnd)||0;}
  grouped.set(key,g);
 }
 ui.groups.replaceChildren();
 const sorted=[...grouped.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'vi'));
 for(const group of sorted){
  const block=el('section','bank-report-customer');block.dataset.bankCustomer=group.id;
  const header=append(el('div','bank-report-customer-head'),
   el('strong','bank-report-customer-name',group.name),
   el('span','bank-report-customer-count',group.matched+'/'+group.rows.length+' bill khớp · '+money(group.amount)));
  block.appendChild(header);
  group.rows.sort((a,b)=>String(a.bill_time||a.sent_at).localeCompare(String(b.bill_time||b.sent_at)));
  group.rows.forEach(row=>block.appendChild(detailLine(row)));
  ui.groups.appendChild(block);
 }
 if(banks.length){
  const block=el('section','bank-report-customer');
  block.appendChild(append(el('div','bank-report-customer-head'),el('strong','bank-report-customer-name','Agribank có tiền · chưa biết khách'),el('span','bank-report-customer-count',banks.length+' giao dịch · '+money(banks.reduce((s,x)=>s+Number(x.amount_vnd||0),0)))));
  banks.forEach(row=>block.appendChild(detailLine(row,true)));
  ui.groups.prepend(block);
 }
 if(!sorted.length&&!banks.length)ui.groups.appendChild(el('p','bank-report-empty','Không có giao dịch thuộc bộ lọc này.'));
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
 if(should){dateReady();void reload();}else{requestId++;closeViewer();current=null;}
}
ui.refresh.addEventListener('click',()=>void reload());
ui.date.addEventListener('change',()=>{filter='all';current=null;void reload();});
document.addEventListener('v21-active-contact-change',synchronize);
document.addEventListener('v21-contact-store-change',synchronize);
document.addEventListener('v21-auth-state',synchronize);
document.addEventListener('v21-conversation-context',synchronize);
document.addEventListener('v21-bank-report-dirty',()=>{if(active)void reload();});
document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden)void reload();});
window.V21BankReportDashboard={refresh:()=>void reload(),snapshot:()=>({active,day:ui.date.value,matched:current?.summary?.matched_count||0})};
synchronize();
})();