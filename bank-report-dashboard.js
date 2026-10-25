(()=>{'use strict';
// BANK-191: Admin reconciliation with explicit Agribank collection.
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
 viewer:root.querySelector('[data-bank-viewer]'),
 review:root.querySelector('[data-bank-review-modal]')
};
const filters=[
 ['all','Tất cả'],['matched','Đã thu · Khớp'],['waiting_bank','Bill chờ Agribank'],
 ['bank_only','Agribank chưa khớp'],['bank_all','Tất cả tiền vào Agribank'],['review','Cần kiểm tra'],['wrong_day','Sai ngày'],
 ['manual_bank','Đã thu thủ công Agribank'],['duplicate','Trùng'],['non_bill','Không phải bill'],['test_excluded','Test (loại)']
];
// Match customer names with or without Vietnamese accents and flexible spaces.
function bankCustomerSearchKey(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi-VN')
  .replace(/\s+/g,' ').trim();
}
function bankCustomerSearchMatches(customers,query){
 const key=bankCustomerSearchKey(query);
 if(!key)return customers.slice(0,8);
 const terms=key.split(' ').filter(Boolean);
 return customers.filter(a=>{
  const name=bankCustomerSearchKey(a.name);
  return terms.every(term=>name.includes(term));
 }).slice(0,12);
}
const money=x=>x===null||x===undefined||x===''||!Number.isFinite(Number(x))?'—':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(Number(x)/1000);
const localDate=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(x=>x.type===t)?.value||'';return part('year')+'-'+part('month')+'-'+part('day');};
// Agribank notification bodies use "20:58 23/10/2026" (local Vietnam time).
// Dashboard data arrives as "2026-10-23 20:58:00"; format only the view.
function agribankDisplayTime(raw,fallbackDay=''){
 const value=String(raw||'').trim();
 const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/);
 if(iso)return iso[4]+':'+iso[5]+' '+iso[3]+'/'+iso[2]+'/'+iso[1];
 const bank=value.match(/^(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/);
 if(bank)return bank[1]+':'+bank[2]+' '+bank[3]+'/'+bank[4]+'/'+bank[5];
 const time=value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
 const day=String(fallbackDay||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(time&&day)return time[1]+':'+time[2]+' '+day[3]+'/'+day[2]+'/'+day[1];
 return '—';
}
const localTime=x=>{
 if(!x)return'—';
 const s=String(x).trim();
 // Bank/bill transfer_at_vn is a local wall-clock timestamp (no timezone).
 if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)&&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(s))return s.slice(11,16);
 // sent_at is timestamptz, often ISO UTC; slicing it showed 16:04 instead
 // of 23:04 Vietnam time for C Sâm's repeated 235 bill.
 const parsed=new Date(s);
 if(Number.isFinite(parsed.getTime()))
   return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',
     hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(parsed);
 return s.length>=16?s.slice(11,16):s;
};
const statusText={
 matched:'Đã thu · Đối soát',waiting_bank:'Chờ Agribank · Chưa thu',bank_only:'Chờ bill · Chưa thu',
 review:'Cần kiểm tra · Chưa thu',wrong_day:'Sai ngày',duplicate:'Bill trùng',
 non_bill:'Không phải bill',reading:'Đang đọc ảnh',test_excluded:'Tiền test (loại)'
};
const isAiScanIssue=row=>/^(?:amount_scan_|ai_scan_|ai_year_error_)/i.test(String(row?.reason||''));
function scanIssueLabel(raw){
 const reason=String(raw||'');
 if(/ai_year_error_bank_verified_prior_day_review/i.test(reason))return 'Agribank đã xác nhận · AI đọc sai năm · Cần xử lý ghi thu ngày cũ';
 if(/gemini_key_missing|gemini_http_(?:400|401|403)/i.test(reason))return 'Khóa/API Gemini không hợp lệ — cần kiểm tra';
 if(/gemini_http_429/i.test(reason))return 'Gemini hết hạn mức — sẽ thử lại';
 if(/gemini_http_5[0-9][0-9]|aborted|aborterror|worker_interrupted/i.test(reason))return 'AI quét lỗi hoặc quá thời gian — đang chờ thử lại';
 if(/retry_exhausted|old_unresolved|queue_expired/i.test(reason))return 'Đã hết lượt thử — cần Admin xem chứng từ';
 return 'AI chưa phân loại được ảnh — cần kiểm tra thủ công';
}
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
  const [report,states,credits]=await Promise.all([
   client.rpc('chat_bank_dashboard',{p_app_session_id:auth.appSessionId,p_day:day}),
   client.rpc('chat_bank_manual_collection_statuses',{p_app_session_id:auth.appSessionId,p_day:day}),
   client.rpc('chat_bank_all_credit_statuses',{p_app_session_id:auth.appSessionId,p_day:day})
  ]);
  if(report.error)throw report.error;
  if(states.error)throw states.error;
  if(credits.error)throw credits.error;
  if(id!==requestId||!active||ui.date.value!==day)return;
  const data=report.data;
  current={...data,manual_collections:Array.isArray(states.data)?states.data:[],
    bank_credits:Array.isArray(credits.data)?credits.data:[]};
  paint(current);focusPushRecord(current);
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
 const expanded=new Set([...ui.groups.querySelectorAll('.bank-report-detail[open]')]
  .map(node=>node.dataset.bankNoticeId?'notice:'+node.dataset.bankNoticeId:
   node.dataset.bankReceiptId?'receipt:'+node.dataset.bankReceiptId:'').filter(Boolean));
 const scrollOwner=document.getElementById('scrollRoot');
 const scrollTop=scrollOwner?.scrollTop??null;
 const handled=new Set((data?.manual_collections||[]).map(x=>String(x.notice_id)));
 const outstanding=(data?.bank_only||[]).filter(x=>!handled.has(String(x.notice_id))).length;
 const incoming=Array.isArray(data?.bank_credits)?data.bank_credits:[];
 ui.summary.replaceChildren(
  cardValue('Giao dịch đã thu · đối soát',String(s.matched_count||0)),
  cardValue('Đã thu có chứng từ (÷1.000)',money(s.matched_amount),true)
 );
 ui.status.replaceChildren(
  cardValue('Bill chưa ghi thu',String(s.bill_only_count||0),false,true),
  cardValue('Agribank cần xử lý',String(outstanding),false,true),
   cardValue('Đã thu thủ công Agribank',String((data?.manual_collections||[]).length),false,true),
   cardValue('Agribank tiền vào · đủ nguồn',String(incoming.length),false,true),
   cardValue('Tổng tiền vào Agribank (÷1.000)',money(incoming.reduce((sum,x)=>sum+(Number(x.amount_vnd)||0),0)),false,true),
  cardValue('Bill sai ngày',String(s.old_date_count||0),false,true),
  cardValue('Ảnh trùng',String(s.duplicate_count||0),false,true),
  cardValue('Ảnh AI chưa kết luận',String((data?.bills||[]).filter(isAiScanIssue).length),false,true)
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
 for(const node of ui.groups.querySelectorAll('.bank-report-detail')){
  const key=node.dataset.bankNoticeId?'notice:'+node.dataset.bankNoticeId:
   node.dataset.bankReceiptId?'receipt:'+node.dataset.bankReceiptId:'';
  if(expanded.has(key))node.open=true;
 }
 if(scrollOwner&&scrollTop!==null)scrollOwner.scrollTop=scrollTop;
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
 for(const name of ['Khách hàng','Đã thu','Chưa thu','Trùng','Sai ngày','Tiền đã thu'])thead.appendChild(el('th','',name));
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
// BANK-183: show unlinked same-amount customer images as review candidates.
// Chat send time is only a *hint*, never a substitute for the bill's bank time.
// Read-only suggestions. Neither a nearby upload nor matching money is proof.
function possibleUnlinkedBills(bank,allBills){
 const bankTs=Date.parse(String(bank.transfer_at||''));
 if(!Number.isFinite(bankTs)||!Number.isSafeInteger(Number(bank.amount_vnd)))return [];
 return (allBills||[]).filter(b=>{
  if(!b||!['amount_read','review'].includes(String(b.status||''))||
     b.notice_id||!b.receipt_id||!b.asset_id)return false;
  const sent=Date.parse(String(b.sent_at||''));
  if(!Number.isFinite(sent))return false;
  const nearby=Math.abs(sent-bankTs)<=20*60000;
  return Number(b.amount_vnd)===Number(bank.amount_vnd)&&
    (nearby||String(b.sent_at||'').slice(0,10)===String(bank.transfer_at||'').slice(0,10))
    || nearby&&b.amount_vnd==null&&b.status==='review'&&
    b.reason==='multiple_transactions_ambiguous';
 });
}
function detailLine(row,isBank=false,candidates=[]){
 const type=isBank?'bank_only':row.report_status;
 const recorded=!isBank&&type==='matched'&&Boolean(row.ledger_id);
 const manualRecord=isBank?(current?.manual_collections||[]).find(m=>String(m.notice_id)===String(row.notice_id)):null;
 const wrap=el('details','bank-report-detail');
 if(row.receipt_id)wrap.dataset.bankReceiptId=String(row.receipt_id);
 if(row.notice_id)wrap.dataset.bankNoticeId=String(row.notice_id);
 const top=el('summary','bank-report-detail-top');
 const label=isBank&&!manualRecord&&!candidates.length
  ?el('button','bank-report-quick-collect','Thu tiền')
  :el('span','bank-report-detail-status bank-status-'+
    (manualRecord?'bank_manual':isBank&&candidates.length?'review':type),
    manualRecord?'Đã thu thủ công':isBank&&candidates.length?'Có bill cần kiểm tra':
      !isBank&&isAiScanIssue(row)?'AI chưa kết luận':statusText[type]||'Cần kiểm tra');
 if(isBank&&!manualRecord&&!candidates.length){
  label.type='button';
  label.setAttribute('aria-label','Thu '+money(row.amount_vnd)+' từ Agribank');
  label.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   void openCollectionDialog(row);
  });
 }
 const left=el('span','bank-report-detail-time',isBank?localTime(row.bank_time):localTime(row.bill_time||row.sent_at));
 const amt=el('strong','bank-report-detail-amount',money(isBank?row.amount_vnd:row.amount_vnd));
 append(top,left,amt,label);wrap.appendChild(top);
 const content=el('div','bank-report-detail-content');
 append(content,cell('Giờ bill',isBank?(candidates.length?'Có ảnh cần kiểm tra':'Chưa xác định bill'):(row.bill_time||'Không đọc được')),
  cell('Giờ Agribank',row.bank_time?agribankDisplayTime(row.bank_time,ui.date.value):'Chưa có thông báo'),
  cell('Giờ khách gửi ảnh',isBank?'—':(row.sent_at?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(row.sent_at)):'—')),
  cell('Mã giao dịch',row.transfer_reference||'—'),
  cell('Thông báo ngân hàng',isBank?'#'+row.notice_id:(row.notice_id?'#'+row.notice_id:'Chưa có')),
  cell('Tình trạng',manualRecord?(manualRecord.mode==='linked_existing'
   ?'Đã liên kết khoản nhập tay':'Đã thu thủ công từ Agribank')
  :isBank&&candidates.length?'Chưa đối soát · Chưa ghi thu':statusText[type]||row.status||'Chưa rõ'));
 if(!isBank){
  content.appendChild(cell('Ghi thu công nợ',
    recorded?'Đã ghi thu · Sổ #'+row.ledger_id:'Chưa ghi thu'));
  const noticeState=row.collection_notice_state||'pending';
  const noticeText=row.collection_ack_sent?'Đã gửi cho khách':
    noticeState==='muted'?'Đã tắt theo cài đặt thông báo':
    noticeState==='retry'?'Gửi lỗi · Hệ thống sẽ thử lại':
    'Đang chờ gửi xác nhận';
  content.appendChild(cell('Tin xác nhận thu',
    recorded?noticeText:'Chưa gửi vì chưa ghi thu'));
 }
 if(manualRecord){
  content.appendChild(cell('Khách đã thu',manualRecord.customer_name||'—'));
  content.appendChild(cell('Sổ công nợ','#'+manualRecord.ledger_id));
  content.appendChild(cell('Nội dung thu',manualRecord.note||'—'));
 }
 if(isBank&&candidates.length&&!manualRecord){
  content.appendChild(el('p','bank-report-detail-reason',
    'Có '+candidates.length+' ảnh khách gửi có khả năng liên quan (cùng tiền hoặc gần giờ ngân hàng). '
    +'Ảnh lịch sử nhiều dòng và ảnh gửi lại phải được xác minh thủ công; chưa ghi thu.'));
  const matches=el('div','bank-report-candidate-list');
  for(const candidate of candidates.slice(0,10)){
   const name=String(candidate.customer_name||'Khách chưa rõ');
   const hour=candidate.sent_at?new Intl.DateTimeFormat('vi-VN',{
      timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'
    }).format(new Date(candidate.sent_at)):'—';
   const btn=el('button','bank-report-action','Xem ảnh '+name+' · gửi '+hour+
     (candidate.amount_vnd==null?' · chưa đọc được số tiền':''));
   btn.type='button';btn.addEventListener('click',()=>{void showBill(candidate);});
   matches.appendChild(btn);
  }
  content.appendChild(matches);
  const audit=el('button','bank-report-action bank-review-open','Lập biên bản ngoại lệ');
  audit.type='button';audit.addEventListener('click',()=>void openReviewDialog(row,candidates));
  const act=el('div','bank-report-detail-actions');act.appendChild(audit);
  const manual=el('button','bank-report-action','Thu sau khi xác minh');
  manual.type='button';
  manual.addEventListener('click',()=>{void openCollectionDialog(row);});
  act.appendChild(manual);
  content.appendChild(act);
 }
 if(row.reason&&!isBank){
  let reason='Ghi chú: '+row.reason;
  if(isAiScanIssue(row))reason='Lỗi quét ảnh: '+scanIssueLabel(row.reason);
  else if(row.reason==='bank_image_amount_only_no_collection'){
    if(row.report_status==='review'&&row.bill_time)
      reason='Có thông báo Agribank cùng tiền và gần giờ, nhưng ảnh chỉ đủ dữ liệu số tiền. Cần kiểm tra trước khi ghi thu.';
    else if(!row.bill_time)
      reason='Ảnh chỉ đọc được số tiền, chưa xác định được thời gian giao dịch. Chưa ghi thu.';
    else reason='Đã đọc được số tiền và giờ từ ảnh, nhưng chưa đủ xác nhận Agribank. Chưa ghi thu.';
  }else if(row.report_status==='matched')reason='Đã kiểm chứng Agribank và hạch toán vào sổ công nợ.';
  content.appendChild(el('p','bank-report-detail-reason',reason));
}
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
// BANK-222: full bank money-in is distinct from an uploaded transfer bill.
// A posted bank credit never offers another collection action.
function bankCreditLine(row,allBills){
 const kind=String(row.collection_kind||'unmatched');
 const valid=kind==='auto_collected'||kind==='manual_collected';
 const wrap=el('details','bank-report-detail');
 wrap.dataset.bankNoticeId=String(row.notice_id);
 const top=el('summary','bank-report-detail-top');
 const state=kind==='auto_collected'?'Đã thu · Đối soát':
   kind==='manual_collected'?'Đã thu thủ công':
   kind==='review_inconsistent'?'Liên kết cần kiểm tra':'Chưa thu · Cần xử lý';
 const badge=el('span','bank-report-detail-status bank-status-'+
   (kind==='auto_collected'?'matched':kind==='manual_collected'?'bank_manual':'review'),state);
 append(top,el('span','bank-report-detail-time',localTime(row.bank_time)),
    el('strong','bank-report-detail-amount',money(row.amount_vnd)),badge);
 wrap.appendChild(top);
 const content=el('div','bank-report-detail-content');
 append(content,cell('Giờ Agribank',agribankDisplayTime(row.bank_time,ui.date.value)),
   cell('Tiền vào Agribank (÷1.000)',money(row.amount_vnd)),
   cell('Thông báo Agribank','#'+row.notice_id),
   cell('Khách đã liên kết',row.customer_name||'Chưa xác định'),
   cell('Sổ công nợ',valid&&row.ledger_id?'#'+row.ledger_id:'Chưa có bút toán xác minh'),
   cell('Trạng thái',state));
 const actions=el('div','bank-report-detail-actions');
 if(kind==='auto_collected'&&row.asset_id){
  const match=(allBills||[]).find(x=>String(x.receipt_id||'')===String(row.receipt_id));
  const btn=el('button','bank-report-action','Xem ảnh bill đã khớp');
  btn.type='button';btn.addEventListener('click',()=>void showBill(match||row));
  actions.appendChild(btn);
 }
 if(row.customer_id){
  const btn=el('button','bank-report-action','Mở hội thoại khách');
  btn.type='button';
  btn.addEventListener('click',()=>window.ChatAppShell?.NavigationCommand
    ?.openContact?.(row.customer_id,row.customer_name||'Khách hàng'));
  actions.appendChild(btn);
 }
 if(kind==='unmatched'){
  const candidates=possibleUnlinkedBills(row,allBills);
  if(candidates.length){
   content.appendChild(el('p','bank-report-detail-reason',
     'Có '+candidates.length+' ảnh khả nghi: cùng tiền không đủ xác nhận đã thu.'));
   candidates.slice(0,8).forEach(b=>{
    const btn=el('button','bank-report-action','Xem ảnh '+(b.customer_name||'khách'));
    btn.type='button';btn.addEventListener('click',()=>void showBill(b));
    actions.appendChild(btn);
   });
  }
  const btn=el('button','bank-report-action','Thu sau khi xác minh');
  btn.type='button';btn.addEventListener('click',()=>void openCollectionDialog(row));
  actions.appendChild(btn);
 }
 if(kind==='review_inconsistent'){
  content.appendChild(el('p','bank-report-detail-reason',
   'Liên kết ngân hàng/sổ chưa hợp lệ. Không xác nhận thu hoặc thu lại trước khi kiểm tra.'));
 }
 content.appendChild(actions);wrap.appendChild(content);
 return wrap;
}
function renderGroups(data){
 const allBills=Array.isArray(data?.bills)?data.bills:[];
 const bankOnly=Array.isArray(data?.bank_only)?data.bank_only:[];
 const credits=Array.isArray(data?.bank_credits)?data.bank_credits:[];
 const selected=filter==='all' ? (selectedCustomer?allBills.filter(r=>String(r.customer_id)===selectedCustomer):[])
   :allBills.filter(r=>r.report_status===filter||(filter==='review'&&r.report_status==='reading'));
 const fullCredits=filter==='all'||filter==='bank_all'||filter==='manual_bank';
 const banks=(filter==='all'||filter==='bank_all')?
    (selectedCustomer?credits.filter(r=>String(r.customer_id)===selectedCustomer):credits):
   filter==='manual_bank'?credits.filter(r=>r.collection_kind==='manual_collected'):
   filter==='bank_only'?bankOnly:[];
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
   el('strong','bank-report-customer-name',fullCredits?'Toàn bộ tiền vào Agribank · theo trạng thái':'Agribank chưa khớp'),
   el('span','bank-report-customer-count',banks.length+' giao dịch · '+money(banks.reduce((sum,x)=>sum+Number(x.amount_vnd||0),0))+' (÷1.000)')));
  banks.forEach(row=>block.appendChild(fullCredits?
    bankCreditLine(row,allBills):detailLine(row,true,possibleUnlinkedBills(row,allBills))));
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

const REVIEW_REASONS=[
 ['missing_time','Bill thiếu giờ giao dịch'],
 ['missing_date','Bill thiếu ngày giao dịch'],
 ['missing_reference','Không có mã giao dịch chung'],
 ['statement_multiple_rows','Ảnh lịch sử / biến động số dư nhiều dòng'],
 ['same_transaction_multiple_images','Nhiều ảnh có nội dung trùng nhau'],
 ['other','Khác (phải giải trình cụ thể)']
];
function closeReviewDialog(){
 if(!ui.review)return;
 ui.review.hidden=true;ui.review.replaceChildren();
}
async function openReviewDialog(bank,candidates){
 if(!active||!isReportContact()||!ui.review||!Array.isArray(candidates)||!candidates.length)return;
 closeReviewDialog();
 const noticeId=Number(bank.notice_id);
 if(!Number.isSafeInteger(noticeId)||noticeId<=0)return;
 const overlay=el('div','bank-review-overlay');
 overlay.setAttribute('role','presentation');
 const form=el('form','bank-review-form');
 form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');
 form.setAttribute('aria-label','Biên bản đối soát ngoại lệ');
 const headline=append(el('div','bank-review-heading'),
   append(el('div',''),el('strong','','Biên bản đối soát ngoại lệ'),
     el('small','', 'Đây là biên bản kiểm tra · KHÔNG tự ghi công nợ')),
   el('button','bank-report-image-close','Đóng'));
 headline.querySelector('button').type='button';
 headline.querySelector('button').addEventListener('click',closeReviewDialog);
 form.appendChild(headline);
 form.appendChild(append(el('div','bank-review-bank'),
   el('strong','',money(bank.amount_vnd)+' · Agribank #'+noticeId),
   el('span','', 'Giờ ngân hàng: '+agribankDisplayTime(bank.bank_time,ui.date.value)+
     ' · Đã có tiền, chưa xác nhận thu cho khách')));
 const guidance=el('p','bank-review-instruction',
   'Chọn đúng MỘT ảnh chứng cứ chính. Có thể đính kèm thêm ảnh cùng khách để giải trình. '
  +'Giờ gửi Chat không thay thế ngày/giờ chuyển khoản trên ảnh.');
 form.appendChild(guidance);
 const pickArea=el('fieldset','bank-review-picks');pickArea.appendChild(el('legend','','Chứng cứ chính'));
 const radios=[];
 let supportingField=el('div','bank-review-support');
 const evidence=candidates.slice(0,18);
 for(const candidate of evidence){
  const label=el('label','bank-review-choice');
  const input=el('input');
  input.type='radio';input.name='review-primary';input.value=String(candidate.receipt_id);
  const text=el('span','',''+(candidate.customer_name||'Khách chưa rõ')+
    ' · '+(candidate.amount_vnd!=null?money(candidate.amount_vnd):'chưa đọc chắc số tiền')+
    ' · gửi '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',
      hour:'2-digit',minute:'2-digit'}).format(new Date(candidate.sent_at)));
  const view=el('button','bank-report-action','Xem ảnh');view.type='button';
  view.addEventListener('click',()=>void showBill(candidate));
  append(label,input,text,view);pickArea.appendChild(label);
  radios.push(input);
  input.addEventListener('change',()=>{
   supportingField.replaceChildren(el('strong','','Ảnh bổ sung (cùng khách, tùy chọn)'));
   for(const other of evidence){
    if(other.receipt_id===candidate.receipt_id||
       other.customer_id!==candidate.customer_id)continue;
    const c=el('label','bank-review-support-option');
    const check=el('input');check.type='checkbox';check.value=String(other.receipt_id);
    append(c,check,el('span','',
      (other.amount_vnd==null?'Ảnh chưa đọc đủ số tiền':money(other.amount_vnd))+
      ' · gửi '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',
        hour:'2-digit',minute:'2-digit'}).format(new Date(other.sent_at))));
    supportingField.appendChild(c);
   }
  });
 }
 form.appendChild(pickArea);
 form.appendChild(supportingField);
 const reasonLabel=el('label','bank-review-label','Nguyên nhân cần Admin kiểm tra');
 const reason=el('select','bank-review-select');
 const placeholder=el('option','','Chọn nguyên nhân…');placeholder.value='';
 reason.appendChild(placeholder);
 for(const [key,label] of REVIEW_REASONS){
  const opt=el('option','',label);opt.value=key;reason.appendChild(opt);
 }
 reason.required=true;reasonLabel.appendChild(reason);form.appendChild(reasonLabel);
 const explanationLabel=el('label','bank-review-label','Giải trình (bắt buộc, tối thiểu 30 ký tự)');
 const explanation=el('textarea','bank-review-explanation');
 explanation.placeholder='Ví dụ: Đã mở ảnh gốc, kiểm tra nội dung… Bill thiếu giờ/ngày; chưa xác định được mã chung…';
 explanation.rows=4;explanation.maxLength=2000;explanation.minLength=30;explanation.required=true;
 explanationLabel.appendChild(explanation);form.appendChild(explanationLabel);
 const confirm=el('label','bank-review-consent');
 const verified=el('input');verified.type='checkbox';verified.required=true;
 append(confirm,verified,el('span','','Tôi đã trực tiếp kiểm tra ảnh gốc và thông báo Agribank; hiểu rằng ghi biên bản này CHƯA ghi thu cho khách.'));
 form.appendChild(confirm);
 const warn=el('p','bank-review-warning','Biên bản được lưu vĩnh viễn kèm người xác nhận và bằng chứng tại thời điểm kiểm tra. Không tự thay đổi công nợ.');
 form.appendChild(warn);
 const feedback=el('div','bank-review-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 form.appendChild(feedback);
 const buttons=el('div','bank-review-actions');
 const cancel=el('button','bank-report-action','Hủy');cancel.type='button';cancel.addEventListener('click',closeReviewDialog);
 const save=el('button','bank-review-save','Lưu biên bản · Chưa ghi thu');
 save.type='submit';append(buttons,cancel,save);form.appendChild(buttons);
 const previous=el('div','bank-review-history');
 form.appendChild(previous);
 append(overlay,form);ui.review.hidden=false;ui.review.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeReviewDialog();});
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const client=window.V21AuthSessionStore?.getClient?.();
 if(!auth.appSessionId||!client){
  feedback.textContent='Phiên Admin hết hạn. Vui lòng đăng nhập lại.';save.disabled=true;return;
 }
 const existing=await client.rpc('chat_bank_manual_exception_get',
   {p_app_session_id:auth.appSessionId,p_notice_id:noticeId});
 if(ui.review.hidden)return;
 if(existing.error){
  feedback.textContent='Không thể đọc lịch sử giải trình. Chưa thể lưu biên bản.';
  save.disabled=true;return;
 }
 const histories=existing.data?.reviews||[];
 if(histories.length){
  save.disabled=true;
  feedback.textContent='Khoản Agribank này đã có biên bản; không lập thêm để tránh trùng. Chưa ghi thu.';
  previous.appendChild(el('strong','','Biên bản đã ghi trước đây'));
  for(const h of histories){
   const at=new Date(h.recorded_at);
   previous.appendChild(el('p','',
     (Number.isFinite(at.getTime())?at.toLocaleString('vi-VN'):'')+
     ' · '+(REVIEW_REASONS.find(x=>x[0]===h.reason_code)?.[1]||h.reason_code)+
     ' · '+h.explanation+' · Chưa ghi thu'));
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(histories.length){feedback.textContent='Đã có biên bản cho khoản này.';return;}
  const picked=radios.find(x=>x.checked);
  if(!picked||!reason.value||!verified.checked||explanation.value.trim().length<30){
   feedback.textContent='Chưa đủ ảnh chính, nguyên nhân, giải trình hoặc xác nhận đã xem chứng cứ.';
   return;
  }
  const selected=evidence.find(x=>String(x.receipt_id)===picked.value);
  if(!selected)return;
  const support=[...supportingField.querySelectorAll('input:checked')].map(x=>x.value);
  save.disabled=true;cancel.disabled=true;feedback.textContent='Đang ghi biên bản…';
  try{
   const {data,error}=await client.rpc('chat_bank_manual_exception_record',{
    p_app_session_id:auth.appSessionId,p_notice_id:noticeId,
    p_primary_receipt_id:selected.receipt_id,
    p_supporting_receipt_ids:support,p_reason_code:reason.value,
    p_explanation:explanation.value.trim(),p_original_checked:true
   });
   if(error)throw error;
   if(!data?.ok||data.ledger_written!==false)throw Error('Phản hồi xác nhận chưa hợp lệ');
   feedback.textContent=(data.state==='requires_additional_proof'
     ?'Đã lưu biên bản · Chứng cứ chưa đủ rõ; cần kiểm tra bổ sung.'
     :'Đã lưu biên bản chứng cứ · Chưa ghi thu công nợ.');
   save.hidden=true;cancel.textContent='Đóng';
   previous.appendChild(el('p','bank-review-saved','Mã biên bản: '+data.review_id));
  }catch(error){
   feedback.textContent='Chưa lưu được biên bản: '+String(error?.message||error).slice(0,150);
   save.disabled=false;
  }finally{cancel.disabled=false;}
 });
}
// BANK-191: explicit real collection, or link a previously entered manual receipt.
async function openCollectionDialog(bank){
 if(!active||!isReportContact()||!ui.review)return;
 closeReviewDialog();
 const noticeId=Number(bank.notice_id);
 if(!Number.isSafeInteger(noticeId)||noticeId<=0)return;
 const overlay=el('div','bank-review-overlay'),form=el('form','bank-review-form');
 form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');
 form.setAttribute('aria-label','Thu tiền từ Agribank');
 const heading=append(el('div','bank-review-heading'),
  append(el('div',''),el('strong','','Thu tiền Agribank'),
   el('small','','Ghi thu công nợ ngay · Có nội dung thu')),
  el('button','bank-report-image-close','Đóng'));
 heading.querySelector('button').type='button';
 heading.querySelector('button').addEventListener('click',closeReviewDialog);
 form.appendChild(heading);
 form.appendChild(append(el('div','bank-review-bank'),
  el('strong','',money(bank.amount_vnd)+' · Agribank #'+noticeId),
  el('span','','Giờ ngân hàng: '+agribankDisplayTime(bank.bank_time,ui.date.value))));
 const info=el('p','bank-review-instruction','Đang kiểm tra khoản thu nhập tay…');form.appendChild(info);
 const customerLabel=el('div','bank-review-label');
 const customerCaption=el('label','','Thu cho khách hàng');
 const customerSearch=el('input','bank-review-select bank-review-customer-search');
 customerSearch.id='bank-review-search-'+noticeId;
 customerCaption.htmlFor=customerSearch.id;
 customerSearch.type='search';customerSearch.placeholder='Gõ tên khách hàng…';
 customerSearch.autocomplete='off';customerSearch.spellcheck=false;
 customerSearch.disabled=true;
 customerSearch.setAttribute('role','combobox');
 customerSearch.setAttribute('aria-autocomplete','list');
 customerSearch.setAttribute('aria-expanded','false');
 const customerList=el('div','bank-review-customer-results');
 customerList.id='bank-review-customers-'+noticeId;customerList.hidden=true;
 customerList.setAttribute('role','listbox');
 customerSearch.setAttribute('aria-controls',customerList.id);
 const customerHelp=el('small','bank-review-customer-help','Gõ tên không dấu cũng tìm được. Chạm vào đúng khách để chọn.');
 customerLabel.append(customerCaption,customerSearch,customerHelp,customerList);
 form.appendChild(customerLabel);
 const previous=el('div','bank-review-existing');form.appendChild(previous);
 const noteLabel=el('label','bank-review-label','Nội dung thu (bắt buộc)');
 const note=el('textarea','bank-review-explanation');
 note.rows=3;note.minLength=5;note.maxLength=1000;note.required=true;
 note.value='Thu chuyển khoản Agribank · '+agribankDisplayTime(bank.bank_time,ui.date.value);
 noteLabel.appendChild(note);form.appendChild(noteLabel);
 const consent=el('label','bank-review-consent');
 const verified=el('input');verified.type='checkbox';verified.required=true;
 append(consent,verified,el('span','','Tôi đã kiểm tra tiền Agribank và chọn đúng khách. Khoản đã nhập tay phải liên kết, không thu hai lần.'));
 form.appendChild(consent);
 const feedback=el('div','bank-review-feedback');feedback.setAttribute('role','status');form.appendChild(feedback);
 const actions=el('div','bank-review-actions');
 const cancel=el('button','bank-report-action','Hủy');cancel.type='button';cancel.addEventListener('click',closeReviewDialog);
 const save=el('button','bank-review-save','Thu tiền');save.type='submit';save.disabled=true;
 append(actions,cancel,save);form.appendChild(actions);overlay.appendChild(form);
 ui.review.hidden=false;ui.review.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeReviewDialog();});
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const client=window.V21AuthSessionStore?.getClient?.();
 if(!auth.appSessionId||!client){info.textContent='Phiên Admin hết hạn.';return;}
 let prepared=null,candidates=[],priorSelector=null;
 let selectedCustomerId='',customers=[],displayed=[],activeIndex=0;
 try{
  const {data,error}=await client.rpc('chat_bank_manual_collection_prepare',{
   p_app_session_id:auth.appSessionId,p_notice_id:noticeId});
  if(ui.review.hidden)return;
  if(error)throw error;
  if(!data?.ok)throw Error(data?.status||'Giao dịch chưa đủ điều kiện thu');
  prepared=data;
  if(data.already_recorded){
   info.textContent='Khoản Agribank này đã được xử lý.';
   feedback.textContent='Sổ thu #'+data.already_recorded.ledger_id+' · Không thu lần hai.';
   return;
  }
  customers=Array.isArray(data.customers)?data.customers.filter(a=>a.id&&a.name):[];
  candidates=Array.isArray(data.possible_existing)?data.possible_existing:[];
  customerSearch.disabled=false;
  info.textContent='Gõ tên khách để tìm, chạm chọn rồi nhập nội dung thu.';
  const closeCustomerList=()=>{
   customerList.hidden=true;customerSearch.setAttribute('aria-expanded','false');
   customerSearch.removeAttribute('aria-activedescendant');
  };
  const refreshExisting=()=>{
   previous.replaceChildren();priorSelector=null;
   const matches=candidates.filter(m=>m.customer_id===selectedCustomerId);
   if(matches.length){
    previous.appendChild(el('p','bank-review-warning',
     'Đã nhập tay '+matches.length+' khoản cùng số tiền. Chọn sổ thu để liên kết, không trừ công nợ lần hai.'));
    const label=el('label','bank-review-label','Khoản thu đã nhập');
    priorSelector=el('select','bank-review-select');priorSelector.required=true;
    const first=el('option','','Chọn khoản thu đã ghi…');first.value='';priorSelector.appendChild(first);
    for(const m of matches){
     const at=new Date(m.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
     const op=el('option','','#'+m.ledger_id+' · '+at+' · '+(m.note||'Thu tay'));
     op.value=String(m.ledger_id);priorSelector.appendChild(op);
    }
    label.appendChild(priorSelector);previous.appendChild(label);
    save.textContent='Liên kết khoản đã thu';
   }else{
    previous.appendChild(el('p','bank-review-instruction',
     'Chưa có khoản thu cùng số tiền. Bấm Thu tiền sẽ trừ công nợ ngay.'));
    save.textContent='Thu '+money(bank.amount_vnd);
   }
  };
  const chooseCustomer=(item)=>{
   if(!item)return;
   selectedCustomerId=String(item.id);
   customerSearch.value=String(item.name);
   customerSearch.setAttribute('aria-label','Đã chọn: '+item.name);
   customerSearch.setAttribute('aria-invalid','false');
   closeCustomerList();
   refreshExisting();
   save.disabled=false;
   customerSearch.blur();
  };
  const paintCustomers=()=>{
   displayed=bankCustomerSearchMatches(customers,customerSearch.value);
   activeIndex=0;customerList.replaceChildren();
   if(!displayed.length){
    customerList.appendChild(el('div','bank-review-customer-empty','Không thấy khách hàng. Thử tên khác.'));
   }else{
    displayed.forEach((item,index)=>{
     const button=el('button','bank-review-customer-option',item.name);
     button.type='button';button.id=customerList.id+'-'+index;
     button.setAttribute('role','option');
     button.setAttribute('aria-selected','false');
     button.addEventListener('click',()=>chooseCustomer(item));
     customerList.appendChild(button);
    });
   }
   customerList.hidden=false;customerSearch.setAttribute('aria-expanded','true');
   highlightCustomer();
  };
  const highlightCustomer=()=>{
   const buttons=[...customerList.querySelectorAll('.bank-review-customer-option')];
   buttons.forEach((btn,i)=>{
    btn.dataset.active=String(i===activeIndex);
    btn.setAttribute('aria-selected',String(i===activeIndex));
   });
   if(buttons[activeIndex]){
    customerSearch.setAttribute('aria-activedescendant',buttons[activeIndex].id);
   }else customerSearch.removeAttribute('aria-activedescendant');
  };
  customerSearch.addEventListener('focus',()=>{
   if(!customerSearch.disabled)paintCustomers();
  });
  customerSearch.addEventListener('input',()=>{
   // Typing is NOT a customer selection; force a deliberate choice.
   selectedCustomerId='';priorSelector=null;
   customerSearch.removeAttribute('aria-label');
   customerSearch.setAttribute('aria-invalid','false');
   previous.replaceChildren();
   save.disabled=true;save.textContent='Thu tiền';
   paintCustomers();
  });
  customerSearch.addEventListener('keydown',event=>{
   if(event.key==='Escape'&& !customerList.hidden){
    event.preventDefault();closeCustomerList();return;
   }
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    if(customerList.hidden){paintCustomers();return;}
    if(displayed.length){
     activeIndex=(activeIndex+(event.key==='ArrowDown'?1:-1)+displayed.length)%displayed.length;
     highlightCustomer();
    }
   }else if(event.key==='Enter'){
    event.preventDefault();
    if(!customerList.hidden && displayed[activeIndex])chooseCustomer(displayed[activeIndex]);
   }
  });
  // List is an in-form scrollable panel, not an iOS native select picker.
  customerList.addEventListener('pointerdown',event=>event.stopPropagation());
  form.addEventListener('click',event=>{
   if(!customerLabel.contains(event.target))closeCustomerList();
  });
 }catch(error){
  info.textContent='Không mở được giao dịch để thu.';
  feedback.textContent=String(error?.message||error).slice(0,180);return;
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!prepared||!verified.checked||note.value.trim().length<5)return;
  if(!selectedCustomerId){
   customerSearch.setAttribute('aria-invalid','true');
   feedback.textContent='Bạn cần gõ và chọn đúng khách hàng trong danh sách.';
   customerSearch.focus({preventScroll:true});return;
  }
  if(priorSelector&&!priorSelector.value){
   feedback.textContent='Chọn khoản đã nhập tay để liên kết, tránh ghi thu trùng.';return;
  }
  save.disabled=true;cancel.disabled=true;feedback.textContent='Đang ghi nhận…';
  try{
   const {data,error}=await client.rpc('chat_bank_manual_collect',{
    p_app_session_id:auth.appSessionId,p_notice_id:noticeId,
    p_customer_id:selectedCustomerId,p_note:note.value.trim(),
    p_existing_ledger_id:priorSelector?Number(priorSelector.value):null
   });
   if(error)throw error;
   if(!data?.ok)throw Error(data?.status==='possible_manual_collection'
    ?'Phát hiện khoản thu tay mới. Đóng và mở lại để liên kết.'
    :data?.status||'Không ghi thu được');
   feedback.textContent=data.debt_changed
    ?'Đã thu công nợ · Sổ #'+data.ledger_id
    :'Đã liên kết khoản đã thu · Sổ #'+data.ledger_id+' · Không thu lần hai';
   save.hidden=true;cancel.textContent='Đóng';await reload();
  }catch(error){
   feedback.textContent='Chưa thu: '+String(error?.message||error).slice(0,180);
   save.disabled=false;
  }finally{cancel.disabled=false;}
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
 if(should){dateReady();void reload();}else{requestId++;selectedCustomer=null;closeViewer();closeReviewDialog();current=null;}
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