// NCC-001: Chat Admin invoice inbox — separate from bank bill/collection and Zalo transports.
(()=>{
'use strict';
const auth=()=>window.V21AuthSessionStore||null;
const admin=()=>{const s=auth()?.snapshot?.()||{};return s.state==='AUTHENTICATED'&&s.account?.role==='admin';};
const money=n=>Number(n??0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText=Object.freeze({pending:'Chờ đọc',processing:'Đang đọc',not_invoice:'Không phải phiếu',needs_review:'Cần đối chiếu',matched:'Đã liên kết',duplicate:'Trùng phiếu',applied:'Đã ghi giá',failed:'Chưa đọc được'});
let dialog=null,docId='',busy=false,source='',supplierRows=[],lastDoc=null;
function notify(text){const el=dialog?.querySelector('[data-ncc-msg]');if(el)el.textContent=String(text||'');}
function updateBusy(on){busy=on;for(const x of dialog?.querySelectorAll('button')||[])x.disabled=on;}
async function call(action,other={}){
 const client=auth()?.getClient?.();if(!client||!admin())throw Error('not_ready');
 const {data,error}=await client.functions.invoke('v21-ncc-invoice',{body:{action,...other}});
 if(error||!data?.ok)throw Error(data?.code||'not_ready');
 return data;
}
function ensureStyle(){
 if(document.getElementById('ncc-invoice-admin-style'))return;
 const style=document.createElement('style');style.id='ncc-invoice-admin-style';
 style.textContent=`
 .ncc-launch{border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#0f172a;padding:7px 12px;font:600 13px system-ui;min-height:40px;cursor:pointer}
 .ncc-dialog{box-sizing:border-box;border:1px solid #d5d9e1;border-radius:17px;box-shadow:0 22px 60px #0003;width:min(940px,calc(100vw - 20px));max-height:90dvh;overflow:auto;padding:16px;background:#fff;color:#111827;font:14px system-ui}
 .ncc-dialog::backdrop{background:rgba(15,23,42,.42)}
 .ncc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:-16px;background:#fff;padding:9px 0;z-index:2}
 .ncc-head h2{font-size:18px;margin:0}.ncc-dialog button{cursor:pointer;min-height:38px;border-radius:10px;border:1px solid #d1d5db;background:#fff;padding:7px 11px;font:600 13px system-ui}
 .ncc-dialog button:disabled{opacity:.5;cursor:default}.ncc-dialog .ncc-primary{background:#171717;color:#fff;border-color:#171717}
 .ncc-docs{display:grid;gap:6px;margin:10px 0}.ncc-doc{display:flex;align-items:center;justify-content:space-between;text-align:left;gap:8px;width:100%}
 .ncc-doc small{color:#64748b}.ncc-line-table{width:100%;border-collapse:collapse;min-width:650px;font-size:12px}
 .ncc-line-table th,.ncc-line-table td{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left}
 .ncc-line-table th{font-size:11px;color:#667085}.ncc-line-table [data-ncc-money]{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
 .ncc-table-scroll{overflow-x:auto}.ncc-pane{display:grid;gap:8px;margin:12px 0}.ncc-pane img{max-height:260px;max-width:100%;object-fit:contain;border:1px solid #eee;border-radius:9px}
 .ncc-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ncc-dialog input[type="search"],.ncc-dialog input[type="number"]{box-sizing:border-box;min-height:40px;max-width:100%;font-size:16px;padding:6px 9px;border-radius:9px;border:1px solid #cbd5e1}
 .ncc-manual{border:1px solid #e2e8f0;background:#f8fafc;padding:12px;border-radius:12px;display:grid;gap:10px;margin:10px 0}
 .ncc-manual .ncc-controls>label{display:grid;gap:4px;flex:1;min-width:180px;font-weight:600}
 .ncc-typed-lines{display:grid;gap:7px;overflow-x:auto}
 .ncc-typed-row{display:grid;grid-template-columns:minmax(130px,2fr) minmax(64px,1fr) 72px 110px 105px 36px;align-items:center;gap:6px;min-width:540px}
 .ncc-typed-row input{width:100%;min-width:0;box-sizing:border-box}
 .ncc-typed-row strong{text-align:right;font-variant-numeric:tabular-nums}
 .ncc-manual select,.ncc-manual input[type="file"]{box-sizing:border-box;min-height:40px;width:100%;max-width:100%;padding:7px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font:inherit}
 .ncc-manual input[type="file"]{font-size:13px}.ncc-manual .ncc-hint{font-size:12px;color:#475569}
 .ncc-help{font-size:12px;color:#64748b;line-height:1.5}.ncc-msg{min-height:18px;color:#b45309;font-size:12px}
 @media(max-width:600px){.ncc-dialog{padding:10px;max-height:92dvh}.ncc-head{top:-10px}.ncc-dialog .ncc-pane{gap:6px}}
 `;
 document.head.appendChild(style);
}
// NCC-004: photo -> existing guarded upload/scan/detail path, with a chat-like
// preview and an inline table. No customer message or price write is made.
let photoBusy=false,photoPreviewUrl='';
function photoReady(){return admin()&&window.V21ContactDirectoryAdmin?.nccEnabled?.()===true;}
function photoOwner(){
 const s=auth()?.snapshot?.()||{};
 return admin()&&s.account?.id&&s.appSessionId?String(s.account.id)+'|'+String(s.appSessionId):'';
}
function photoNote(panel,text){
 const el=panel?.querySelector('[data-ncc-photo-status]');
 if(el)el.textContent=text;
}
function resetPhoto(panel=document.querySelector('[data-ncc-photo-composer]')){
 if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl='';}
 if(!panel)return;
 const input=panel.querySelector('[data-ncc-photo-file]');if(input)input.value='';
 const preview=panel.querySelector('[data-ncc-photo-preview]');
 if(preview){preview.hidden=true;preview.querySelector('img')?.removeAttribute('src');}
 panel.querySelector('[data-ncc-photo-result]')?.replaceChildren();
 panel.querySelector('[data-ncc-photo-send]')?.setAttribute('disabled','');
}
function photoSync(panel){
 if(!panel)return;
 const ready=photoReady(),file=panel.querySelector('[data-ncc-photo-file]')?.files?.[0];
 const valid=Boolean(file&&['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size>=100&&file.size<=4000000);
 const send=panel.querySelector('[data-ncc-photo-send]');
 if(send)send.disabled=photoBusy||!ready||!valid;
 panel.dataset.ready=String(ready);
 if(!ready)photoNote(panel,'Máy chủ NCC chưa kích hoạt. Có thể xem trước ảnh nhưng chưa gửi hoặc phân tích được.');
 else if(!photoBusy&&!file)photoNote(panel,'Chọn ảnh, rồi gửi để AI đọc bảng hàng ngay tại đây.');
}
function photoResult(panel,detail,id){
 const host=panel.querySelector('[data-ncc-photo-result]');if(!host)return;
 host.replaceChildren();
 const make=(parent,tag,value,cls='')=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(value!==undefined)e.textContent=String(value);parent.appendChild(e);return e;
 };
 const doc=detail?.document||{};
 make(host,'strong','Bảng hàng · '+(statusText[doc.status]||'Cần đối chiếu'),'ncc-photo-result-title');
 const lines=Array.isArray(detail?.lines)?detail.lines:[];
 if(lines.length){
  const wrap=make(host,'div','','ncc-photo-result-scroll');
  const table=make(wrap,'table','','ncc-photo-result-table');
  const tr=make(make(table,'thead'), 'tr');
  ['STT','Tên hàng','SL','Giá nhập','Liên kết'].forEach(x=>make(tr,'th',x));
  const body=make(table,'tbody');
  for(const line of lines){
   const row=make(body,'tr');
   [line.row_no??'',line.printed_name||'Chưa đọc rõ',line.quantity??'—',
    line.unit_price_vnd==null?'—':money(line.unit_price_vnd),
    line.product_code||'Chưa ghép'].forEach(x=>make(row,'td',x));
  }
 }else make(host,'p','Chưa có dòng hàng được xác minh. Kiểm tra ảnh và trạng thái phiếu.','ncc-help');
 make(host,'p','Bảng chỉ để đối chiếu, chưa tự sửa giá vốn hoặc ghi thu.','ncc-help');
 const button=make(host,'button','Chi tiết · Ghép sản phẩm','ncc-photo-manage');
 button.type='button';
 button.addEventListener('click',()=>{
  if(!admin())return;
  ensureDialog();if(!dialog.open)dialog.showModal();void view(id);
 });
}
async function sendPhoto(panel){
 if(photoBusy||!photoReady())return;
 const file=panel.querySelector('[data-ncc-photo-file]')?.files?.[0];
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<100||file.size>4000000){
  photoNote(panel,'Chọn ảnh JPG, PNG hoặc WebP tối đa 4 MB.');return;
 }
 const owner=photoOwner();if(!owner)return;
 const owned=()=>panel.isConnected&&owner===photoOwner();
 photoBusy=true;photoSync(panel);photoNote(panel,'Đang lưu ảnh phiếu nhập…');
 let id='',status='';
 try{
  const base64=await fileAsBase64(file);if(!owned())return;
  const saved=await call('manual_upload',{supplierId:'',mime:file.type,base64});
  if(!owned())return;
  id=String(saved.id||'');status=String(saved.status||'');
  if(!id){photoNote(panel,'Phiếu trùng hoặc chưa lưu được. Mở danh sách để kiểm tra.');return;}
  if(status!=='duplicate'){
   photoNote(panel,'Đã nhận ảnh. AI đang phân tích bảng hàng…');
   try{
    const scan=await call('scan',{id});if(!owned())return;
    status=String(scan.status||status);
   }catch{if(owned())photoNote(panel,'Ảnh đã lưu nhưng AI chưa đọc được. Có thể thử lại trong chi tiết.');}
  }
  const detail=await call('detail',{id});
  if(!owned())return;
  photoResult(panel,detail,id);
  if(status==='duplicate')photoNote(panel,'Ảnh đã có trước đó, không tạo phiếu trùng.');
  else if(['matched','needs_review'].includes(status))photoNote(panel,'Đã phân tích bảng hàng; kiểm tra lại trước khi ghép sản phẩm.');
  else if(status==='not_invoice')photoNote(panel,'Ảnh không phải phiếu nhập hợp lệ.');
  else if(status==='failed')photoNote(panel,'Ảnh chưa đọc rõ; chưa có dữ liệu được xác minh.');
 }catch{
  if(owned())photoNote(panel,id
   ?'Ảnh đã lưu nhưng chưa tải được bảng hàng. Mở danh sách phiếu để xem lại.'
   :'Chưa gửi được ảnh; máy chủ NCC chưa sẵn sàng. Không có giá nào bị thay đổi.');
 }finally{
  photoBusy=false;if(owned())photoSync(panel);
 }
}
function ensurePhotoComposer(slot){
 let panel=slot.querySelector('[data-ncc-photo-composer]');
 if(panel){photoSync(panel);return;}
 panel=document.createElement('section');panel.className='ncc-photo-composer';panel.dataset.nccPhotoComposer='';
 panel.innerHTML=[
  '<p class="ncc-photo-intro">Gửi ảnh phiếu nhập như chat · AI phân tích bảng hàng</p>',
  '<div data-ncc-photo-preview class="ncc-photo-preview" hidden><img alt="Ảnh chuẩn bị gửi"><span data-ncc-photo-name></span><button type="button" data-ncc-photo-remove aria-label="Bỏ ảnh">×</button></div>',
  '<div class="ncc-photo-actions"><label class="ncc-photo-attach">＋ Chọn ảnh<input type="file" data-ncc-photo-file accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh NCC"></label><button type="button" data-ncc-photo-send disabled>Gửi ảnh · Đọc bảng</button></div>',
  '<p data-ncc-photo-status class="ncc-photo-status" role="status" aria-live="polite"></p>',
  '<div data-ncc-photo-result class="ncc-photo-result" aria-live="polite"></div>'
 ].join('');
 slot.prepend(panel);
 const input=panel.querySelector('[data-ncc-photo-file]');
 input.addEventListener('change',()=>{
  const file=input.files?.[0];
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl='';}
  panel.querySelector('[data-ncc-photo-result]')?.replaceChildren();
  const preview=panel.querySelector('[data-ncc-photo-preview]');
  if(file&&['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size>=100&&file.size<=4000000){
   photoPreviewUrl=URL.createObjectURL(file);
   preview.querySelector('img').src=photoPreviewUrl;
   panel.querySelector('[data-ncc-photo-name]').textContent=file.name;
   preview.hidden=false;
  }else{
   preview.hidden=true;
   if(file)photoNote(panel,'Ảnh phải là JPG, PNG hoặc WebP, tối đa 4 MB.');
  }
  photoSync(panel);
 });
 panel.querySelector('[data-ncc-photo-remove]').addEventListener('click',()=>{resetPhoto(panel);photoSync(panel);});
 panel.querySelector('[data-ncc-photo-send]').addEventListener('click',()=>{void sendPhoto(panel);});
 photoSync(panel);
}
function ensureButton(){
 if(!admin()){
  resetPhoto();
  document.querySelector('[data-ncc-launch]')?.remove();
  return;
 }
 // DIR-347: exactly one launcher, reparented to the visible bank Work
 // surface; the old directory slot stays as a fallback for unready data.
 const report=document.getElementById('bankReportDashboard');
 const reportSlot=report?.querySelector('[data-bank-report-ncc-slot]');
 const directorySlot=document.querySelector('[data-contact-work-ncc-slot]');
 const slot=!report?.hidden&&reportSlot?reportSlot:(directorySlot||reportSlot);
 if(!slot)return;
 if(reportSlot)ensurePhotoComposer(reportSlot);
 const ready=photoReady();
 const existing=document.querySelector('[data-ncc-launch]');
 if(existing){
   if(existing.parentElement!==slot)slot.appendChild(existing);
   existing.hidden=Boolean(reportSlot&&slot===reportSlot&&!ready);
   existing.disabled=!ready;
   existing.textContent=ready?'Quản lý phiếu NCC':'Phiếu NCC · Chưa kích hoạt';
   return;
 }
 ensureStyle();
 const button=document.createElement('button');button.type='button';button.className='ncc-launch';
 button.dataset.nccLaunch='';button.disabled=!ready;
 button.hidden=Boolean(reportSlot&&slot===reportSlot&&!ready);
 button.textContent=ready?'Quản lý phiếu NCC':'Phiếu NCC · Chưa kích hoạt';
 button.addEventListener('click',()=>{void open();});
 slot.appendChild(button);
}
function ensureDialog(){
 if(dialog)return dialog;
 ensureStyle();
 dialog=document.createElement('dialog');dialog.className='ncc-dialog';
 dialog.innerHTML=`<div class="ncc-head"><h2>Phiếu nhập · TK NCC</h2><button type="button" data-ncc-close aria-label="Đóng">Đóng ×</button></div>
 <div class="ncc-help">Chỉ ảnh từ tài khoản được phân nhóm TK NCC. Không phải bill ngân hàng; không tự ghi thu hoặc thay đổi giá vốn.</div>
 <div data-ncc-msg class="ncc-msg" aria-live="polite"></div>
 <div data-ncc-content></div>`;
 dialog.querySelector('[data-ncc-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{docId='';source='';lastDoc=null;});
 document.body.appendChild(dialog);
 return dialog;
}
function content(){return dialog?.querySelector('[data-ncc-content]');}
async function open(){
 ensureDialog();dialog.showModal();await loadList();
}
async function loadList(){
 docId='';const host=content();if(!host)return;
 host.textContent='Đang tải phiếu…';notify('');
 try{
  const [inbox,directory,scanners]=await Promise.all([call('list'),call('suppliers'),call('scanner_list')]);
  const documents=inbox.documents||[];
  const accounts=directory.accounts||[];
  const assignedIds=new Set((scanners.assigned||[]).filter(x=>x.enabled===true).map(x=>String(x.account_id)));
  supplierRows=documents;
  host.innerHTML=`<section class="ncc-manual" aria-label="Thêm phiếu và gán tài khoản NCC">
   <strong>Nhập hàng · TK NCC</strong>
   <div class="ncc-controls"><label>Tài khoản Chat
     <select data-ncc-supplier><option value="">Chưa gán tài khoản (phiếu thủ công)</option>
     ${accounts.filter(a=>a.contact_group==='ncc'||assignedIds.has(String(a.id))).map(a=>`<option value="${escape(a.id)}">${escape(a.display_name||a.username||a.id)}</option>`).join('')}</select></label>
     <label>Chọn ảnh phiếu nhập
      <input type="file" data-ncc-file accept="image/jpeg,image/png,image/webp">
     </label></div>
   <div class="ncc-controls"><button type="button" class="ncc-primary" data-ncc-upload>Quét ảnh từ máy</button>
    <button type="button" data-ncc-create-manual>Nhập phiếu bằng tay</button>
    <button type="button" data-ncc-manage>Phân nhóm TK NCC</button>
    <button type="button" data-ncc-scanners>Cấp quyền quét ảnh</button></div>
   <div class="ncc-hint">Tài khoản thuộc TK NCC: ảnh họ gửi tự vào hàng chờ. Ảnh thủ công có thể để trống tài khoản. Không tự đổi giá vốn.</div>
   <div data-ncc-manage-panel hidden></div>
   <div data-ncc-scanner-panel hidden></div>
   <div data-ncc-typed-panel hidden></div></section>
   <div class="ncc-controls"><button type="button" data-ncc-refresh>Làm mới</button><span class="ncc-help">Danh sách ảnh NCC, tối đa 60 phiếu mới</span></div>
  <div class="ncc-docs">${supplierRows.map(x=>`<button type="button" class="ncc-doc" data-ncc-id="${escape(x.id)}"><span><strong>${escape(x.invoice_number||'Chưa có mã phiếu')}</strong> · ${escape(x.invoice_date||'Chưa rõ ngày')}<small> · ${escape(x.created_at?.slice(0,10)||'')}</small></span><small>${escape(statusText[x.status]||'Chờ kiểm tra')}</small></button>`).join('')||'<p>Chưa có ảnh phiếu nhập từ TK NCC.</p>'}</div>`;
  host.querySelector('[data-ncc-refresh]').onclick=()=>void loadList();
  host.querySelector('[data-ncc-upload]').onclick=()=>void uploadManual(host);
  host.querySelector('[data-ncc-create-manual]').onclick=()=>showTypedInvoiceEditor(host,accounts);
  host.querySelector('[data-ncc-manage]').onclick=()=>manageSuppliers(host,accounts);
  host.querySelector('[data-ncc-scanners]').onclick=()=>manageScannerAssignments(host,scanners.accounts||[],assignedIds);
  for(const btn of host.querySelectorAll('[data-ncc-id]'))btn.onclick=()=>void view(btn.dataset.nccId);
 }catch{host.textContent='Chưa mở được danh sách phiếu. Kiểm tra quyền và phiên bản máy chủ.';}
}
// NCC-002: uploads originate from an explicit Admin tap; no background scanning or message sends.
function fileAsBase64(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('image_read_failed'));
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.readAsDataURL(file);
 });
}
async function uploadManual(host){
 if(busy)return;
 const file=host.querySelector('[data-ncc-file]')?.files?.[0];
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<100||file.size>4000000){
  notify('Chọn ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 4 MB.');return;
 }
 const supplierId=host.querySelector('[data-ncc-supplier]')?.value||'';
 updateBusy(true);notify('Đang lưu ảnh phiếu nhập…');
 try{
  const base64=await fileAsBase64(file);
  const data=await call('manual_upload',{supplierId,mime:file.type,base64});
  if(data.status==='duplicate'){notify('Ảnh trùng: phiếu này đã được nhận trước đó.');return;}
  await view(data.id);
  notify('Đã thêm phiếu. Bấm “AI đọc phiếu” để phân tích và ghép sản phẩm.');
 }catch{notify('Không lưu được ảnh phiếu. Kiểm tra phiên quản trị và cấu hình máy chủ.');}
 finally{updateBusy(false);}
}
// NCC-003: manually key an invoice when no usable photo is available.
function showTypedInvoiceEditor(host,accounts){
 const panel=host.querySelector('[data-ncc-typed-panel]');if(!panel)return;
 panel.hidden=!panel.hidden;if(panel.hidden)return;
 panel.innerHTML=`<div class="ncc-pane"><strong>Nhập phiếu hàng bằng tay</strong>
 <p class="ncc-help">Nhập ngày ghi trên phiếu, mã phiếu (nếu có), tên hàng, số lượng và giá nhập. Dữ liệu chỉ lưu để đối chiếu sản phẩm, chưa sửa giá vốn.</p>
 <div class="ncc-controls">
 <label>Nhà cung cấp<input type="text" data-ncc-typed-supplier placeholder="Tên nhà cung cấp" maxlength="120" required></label>
 <label>Ngày trên phiếu<input type="date" data-ncc-typed-date required></label>
 <label>Mã phiếu (nếu có)<input type="text" data-ncc-typed-number maxlength="100" placeholder="VD: 033791"></label>
 <label>Tài khoản Chat (nếu có)
  <select data-ncc-typed-account><option value="">Không liên kết Chat</option>
   ${accounts.map(a=>`<option value="${escape(a.id)}">${escape(a.display_name||a.username||a.id)}</option>`).join('')}
  </select></label></div>
 <div class="ncc-typed-lines">
 <div class="ncc-typed-row ncc-help"><strong>Tên sản phẩm</strong><strong>Đơn vị</strong><strong>SL</strong><strong>Giá nhập</strong><strong>Thành tiền</strong><strong></strong></div>
 <div data-ncc-typed-rows></div></div>
 <div class="ncc-controls"><button type="button" data-ncc-typed-add>+ Thêm dòng</button>
 <strong data-ncc-typed-total>0 đ</strong></div>
 <div class="ncc-controls"><label>Tổng trên phiếu (để trống nếu không có)
 <input type="number" data-ncc-typed-printed-total min="0" step="1" placeholder="Tự tính theo dòng"></label>
 <button type="button" class="ncc-primary" data-ncc-typed-save>Lưu phiếu nhập</button></div>
 <p class="ncc-help">Nếu trùng nhà cung cấp + ngày + mã phiếu hoặc trùng toàn bộ nội dung, hệ thống không nhập lần hai.</p></div>`;
 const rows=panel.querySelector('[data-ncc-typed-rows]');
 const newRow=()=>{
  const row=document.createElement('div');row.className='ncc-typed-row';row.dataset.nccTypedRow='';
  row.innerHTML=`<input type="text" data-ncc-line-name placeholder="Tên hàng NCC" maxlength="160" aria-label="Tên hàng">
   <input type="text" data-ncc-line-unit placeholder="Quy cách" maxlength="60" aria-label="Đơn vị">
   <input type="number" data-ncc-line-qty min="0.001" step="any" value="1" aria-label="Số lượng">
   <input type="number" data-ncc-line-price min="0" step="1" placeholder="Giá" aria-label="Đơn giá">
   <strong data-ncc-line-total>0</strong>
   <button type="button" data-ncc-line-remove aria-label="Xóa dòng">×</button>`;
  rows.appendChild(row);
  row.addEventListener('input',updateTotal);
  row.querySelector('[data-ncc-line-remove]').onclick=()=>{row.remove();updateTotal();};
  updateTotal();
 };
 const collect=()=>[...rows.querySelectorAll('[data-ncc-typed-row]')].map(row=>{
  const quantity=Number(row.querySelector('[data-ncc-line-qty]').value);
  const unitPriceVnd=Number(row.querySelector('[data-ncc-line-price]').value);
  return {printedName:row.querySelector('[data-ncc-line-name]').value.trim(),
   printedUnit:row.querySelector('[data-ncc-line-unit]').value.trim(),
   quantity,unitPriceVnd,lineTotalVnd:quantity*unitPriceVnd};
 });
 function updateTotal(){
  let total=0;
  for(const row of rows.querySelectorAll('[data-ncc-typed-row]')){
   const qty=Number(row.querySelector('[data-ncc-line-qty]').value);
   const price=Number(row.querySelector('[data-ncc-line-price]').value);
   const sum=Number.isFinite(qty)&&Number.isFinite(price)?qty*price:0;
   row.querySelector('[data-ncc-line-total]').textContent=money(sum);
   total+=sum;
  }
  panel.querySelector('[data-ncc-typed-total]').textContent=money(total)+' đ';
 }
 panel.querySelector('[data-ncc-typed-add]').onclick=newRow;newRow();
 panel.querySelector('[data-ncc-typed-save]').onclick=async()=>{
  if(busy)return;
  const supplierLabel=panel.querySelector('[data-ncc-typed-supplier]').value.trim();
  const date=panel.querySelector('[data-ncc-typed-date]').value;
  const invoiceNumber=panel.querySelector('[data-ncc-typed-number]').value.trim();
  const accountId=panel.querySelector('[data-ncc-typed-account]').value;
  const lines=collect();
  if(supplierLabel.length<2||!date||!lines.length||lines.some(x=>!x.printedName||
      !Number.isFinite(x.quantity)||x.quantity<=0||
      !Number.isSafeInteger(x.unitPriceVnd)||x.unitPriceVnd<0||
      !Number.isSafeInteger(x.lineTotalVnd)||x.lineTotalVnd<0)){
   notify('Kiểm tra ngày phiếu, tên hàng, số lượng và giá tiền nguyên VND.');return;
  }
  const total=lines.reduce((sum,line)=>sum+line.lineTotalVnd,0);
  const stated=panel.querySelector('[data-ncc-typed-printed-total]').value.trim();
  const printedTotalVnd=stated===''?total:Number(stated);
  if(!Number.isSafeInteger(printedTotalVnd)||printedTotalVnd!==total){
   notify('Tổng phiếu không khớp với tổng từng dòng. Chưa lưu.');return;
  }
  updateBusy(true);notify('Đang lưu phiếu nhập thủ công…');
  try{
   const saved=await call('manual_create',{supplierLabel,date,invoiceNumber,accountId,
    lines,printedTotalVnd});
   await view(saved.id);
   notify('Đã lưu phiếu để ghép sản phẩm, chưa cập nhật giá vốn.');
  }catch{notify('Phiếu bị trùng hoặc dữ liệu chưa hợp lệ. Chưa lưu thêm phiếu.');}
  finally{updateBusy(false);}
 };
}
function manageSuppliers(host,accounts){
 const panel=host.querySelector('[data-ncc-manage-panel]');if(!panel)return;
 panel.hidden=!panel.hidden;
 if(panel.hidden)return;
 panel.innerHTML=`<div class="ncc-controls"><label>Chọn tài khoản Chat
 <select data-ncc-account><option value="">Chọn tài khoản</option>
 ${accounts.map(a=>`<option value="${escape(a.id)}">${escape(a.display_name||a.username||a.id)}${a.contact_group==='ncc'?' · TK NCC':''}</option>`).join('')}</select></label>
 <button type="button" class="ncc-primary" data-ncc-group-save>Gán vào TK NCC</button></div>
 <div class="ncc-hint">Sau khi gán, ảnh mới do tài khoản này gửi sẽ được xét là phiếu nhập; ảnh trước đó không tự quét lại.</div>`;
 panel.querySelector('[data-ncc-group-save]').onclick=async()=>{
  if(busy)return;
  const id=panel.querySelector('[data-ncc-account]').value;
  if(!id){notify('Chọn tài khoản trước khi gán.');return;}
  const client=auth()?.getClient?.();
  if(!client||!admin())return;
  updateBusy(true);
  try{
   const {data,error}=await client.functions.invoke('v21-zalo-admin',
    {body:{action:'set_group',target_account_id:id,contact_group:'ncc'}});
   if(error||!data?.ok)throw Error(data?.code||'group_update_failed');
   await window.V21ContactDirectoryAdmin?.refreshGroups?.();
   await loadList();
   notify('Đã gán tài khoản vào TK NCC. Ảnh gửi mới sẽ vào hàng chờ.');
  }catch{notify('Chưa gán được tài khoản. Kiểm tra quyền và kích hoạt TK NCC phía máy chủ.');}
  finally{updateBusy(false);}
 };
}
// NCC-003: assigned scanners are independent of Chat contact groups and banking flows.
function manageScannerAssignments(host,accounts,assignedIds){
 const panel=host.querySelector('[data-ncc-scanner-panel]');if(!panel)return;
 panel.hidden=!panel.hidden;if(panel.hidden)return;
 let people=[...accounts].sort((a,b)=>
  Number(assignedIds.has(String(b.id)))-Number(assignedIds.has(String(a.id)))
   ||String(a.display_name||a.username).localeCompare(String(b.display_name||b.username),'vi'));
 panel.innerHTML=`<div class="ncc-pane"><strong>Người được phép gửi ảnh phiếu nhập</strong>
 <p class="ncc-help">Cấp quyền cho tài khoản Chat bất kỳ mà không đổi nhóm danh bạ. Chỉ ảnh mới được kiểm tra; ảnh cũ không tự quét lại. Có thể thu hồi quyền bất cứ lúc nào.</p>
 <div class="ncc-controls"><input type="search" data-ncc-person-find placeholder="Tìm tên hoặc tài khoản Chat" aria-label="Tìm tài khoản được gán">
 <button type="button" data-ncc-person-search>Tìm tài khoản</button></div>
 <div data-ncc-person-results class="ncc-docs"></div></div>`;
 const input=panel.querySelector('[data-ncc-person-find]'),list=panel.querySelector('[data-ncc-person-results]');
 function render(){
  const q=String(input.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const choices=people.filter(a=>!q||String(a.display_name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)
    ||String(a.username||'').toLowerCase().includes(q)).slice(0,80);
  list.innerHTML=choices.map(a=>`<div class="ncc-doc">
   <span><strong>${escape(a.display_name||a.username||a.id)}</strong><small> @${escape(a.username||'')}</small>
   <div class="ncc-help">${a.contact_group==='ncc'?'Đã thuộc TK NCC (tự nhận ảnh)':
    assignedIds.has(String(a.id))?'Đã cấp quyền quét':'Chưa cấp quyền quét'}</div></span>
   <button type="button" data-ncc-set-scanner="${escape(a.id)}"
    ${a.contact_group==='ncc'?'disabled':''}
    data-enabled="${assignedIds.has(String(a.id))?'0':'1'}">${a.contact_group==='ncc'?'Quét theo nhóm NCC':assignedIds.has(String(a.id))?'Thu hồi quyền':'Gán quét ảnh'}</button></div>`).join('')||'<p>Không tìm thấy tài khoản phù hợp.</p>';
  for(const button of list.querySelectorAll('[data-ncc-set-scanner]')){
   button.onclick=async()=>{
    if(busy)return;
    const id=button.dataset.nccSetScanner,enabled=button.dataset.enabled==='1';
    updateBusy(true);
    try{
     await call('scanner_assign',{accountId:id,enabled});
     if(enabled)assignedIds.add(String(id));else assignedIds.delete(String(id));
     render();
     notify(enabled?'Đã cấp quyền quét ảnh phiếu mới.':'Đã thu hồi quyền quét ảnh của tài khoản.');
    }catch{notify('Chưa cập nhật được quyền quét ảnh.');}
    finally{updateBusy(false);}
   };
  }
 }
 panel.querySelector('[data-ncc-person-search]').onclick=async()=>{
  const q=input.value.trim();
  if(q.length<2){notify('Nhập ít nhất 2 ký tự để tìm tất cả tài khoản.');return;}
  try{
   const data=await call('scanner_list',{q});
   people=[...(data.accounts||[])];
   render();notify('Đã tìm tài khoản phù hợp.');
  }catch{notify('Không tìm được tài khoản Chat.');}
 };
 input.addEventListener('input',render);
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void panel.querySelector('[data-ncc-person-search]').click();}});
 render();
}
async function view(id){
 if(!id)return;
 docId=id;lastDoc=null;const host=content();if(!host)return;
 host.textContent='Đang mở phiếu…';notify('');
 try{
  const data=await call('detail',{id});if(docId!==id)return;
  const doc=data.document;lastDoc=doc;
  const imageUrl=String(data.imageUrl||'');
  const safeUrl=/^https:\/\//i.test(imageUrl)?imageUrl:'';
  host.innerHTML=`<div class="ncc-controls"><button type="button" data-ncc-back>‹ Danh sách</button>
    <strong>${escape(doc.invoice_number||'Chưa rõ mã phiếu')}</strong>
    <span class="ncc-help">${escape(statusText[doc.status]||doc.status)} · ${escape(doc.invoice_date||'Chưa rõ ngày')}</span>
    ${(['pending','failed','needs_review'].includes(doc.status) && (doc.origin==='chat'||Boolean(doc.manual_storage_key)))?'<button type="button" class="ncc-primary" data-ncc-scan>AI đọc phiếu</button>':''}</div>
    <div class="ncc-pane">${safeUrl?`<img src="${escape(safeUrl)}" alt="Ảnh gốc phiếu nhập NCC">`:''}
    <div class="ncc-help">Tổng phiếu: ${money(doc.printed_total_vnd)} đ. Nếu ảnh có chữ viết tay, chỉ nhận diện bảng in.</div></div>
    <div class="ncc-table-scroll"><table class="ncc-line-table"><thead><tr><th>STT</th><th>TÊN TRÊN PHIẾU</th><th>SL</th><th data-ncc-money>GIÁ NHẬP</th><th>LIÊN KẾT</th></tr></thead><tbody>
    ${(data.lines||[]).map(x=>`<tr><td>${x.row_no}</td><td>${escape(x.printed_name)}<div class="ncc-help">${escape(x.printed_unit||'Chưa rõ đơn vị')}</div></td><td>${escape(x.quantity)}</td><td data-ncc-money>${money(x.unit_price_vnd)}</td>
    <td>${x.product_code?`<div>${escape(x.product_code)} · ${money(x.normalized_cost_vnd)}</div>`:'<span class="ncc-help">Chưa ghép</span>'}
    <button type="button" data-ncc-row="${x.row_no}">${x.product_code?'Đổi hàng':'Chọn sản phẩm'}</button></td></tr>`).join('')||'<tr><td colspan="5">Chưa có dữ liệu dòng hàng được xác minh.</td></tr>'}</tbody></table></div>
    <div class="ncc-help">Dòng đã ghép chỉ là đề xuất đối chiếu; giá vốn TAPHOA chưa bị thay đổi.</div><div data-ncc-assign></div>`;
  host.querySelector('[data-ncc-back]').onclick=()=>void loadList();
  host.querySelector('[data-ncc-scan]')?.addEventListener('click',()=>void scan(id));
  for(const btn of host.querySelectorAll('[data-ncc-row]'))btn.onclick=()=>void assignPanel(Number(btn.dataset.nccRow));
 }catch{host.textContent='Không mở được phiếu. Vui lòng thử lại.';}
}
async function scan(id){
 if(busy)return;
 updateBusy(true);notify('AI đang kiểm tra ảnh và số học của phiếu…');
 try{
  const data=await call('scan',{id});
  notify(data.status==='duplicate'?'Đã phát hiện phiếu trùng':data.status==='not_invoice'?'Ảnh này không phải phiếu nhập':'Đã phân tích xong');
  await view(id);
 }catch{notify('Chưa đọc được ảnh. Ảnh mờ hoặc dịch vụ AI chưa sẵn sàng; chưa cập nhật giá.');}
 finally{updateBusy(false);}
}
function assignPanel(rowNo){
 const host=content()?.querySelector('[data-ncc-assign]');if(!host||!lastDoc)return;
 const id=docId;const row=Array.from(content().querySelectorAll('[data-ncc-row]')).find(x=>Number(x.dataset.nccRow)===rowNo);
 if(!row)return;
 host.innerHTML=`<div class="ncc-pane"><strong>Chọn sản phẩm cho dòng ${rowNo}</strong>
 <div class="ncc-controls"><input type="search" data-ncc-search placeholder="Tên sản phẩm TAPHOA" aria-label="Tên sản phẩm"><button type="button" data-ncc-find>Tìm</button></div>
 <div data-ncc-results></div>
 <div class="ncc-controls"><label>Quy đổi đơn vị: <input data-ncc-factor type="number" min="0.001" step="any" value="1" style="width:98px"></label>
 <label><input type="checkbox" data-ncc-remember ${lastDoc?.chat_account_id?'checked':'disabled'}> Nhớ tên NCC cho lần sau</label>
 <label><input type="checkbox" data-ncc-price-jump> Tôi xác nhận nếu giá lệch trên 20%</label></div>
 <div class="ncc-help">Hệ số quy đổi phải đúng quy cách: giá vốn TAPHOA = đơn giá phiếu / hệ số. Không tự suy đoán thùng/hộp.</div>
 <button type="button" data-ncc-save class="ncc-primary" disabled>Xác nhận liên kết</button></div>`;
 let chosen=null;
 const input=host.querySelector('[data-ncc-search]'),result=host.querySelector('[data-ncc-results]'),save=host.querySelector('[data-ncc-save]');
 async function search(){
  const q=input.value.trim();if(q.length<2){result.textContent='Nhập ít nhất 2 ký tự.';return;}
  result.textContent='Đang tìm…';
  try{
   const data=await call('catalog',{q});if(docId!==id)return;
   result.innerHTML=(data.products||[]).map(p=>`<button type="button" data-product="${escape(p.product_code)}">${escape(p.product_name)} · ${money(p.input_price_vnd)}</button>`).join('')||'Không thấy sản phẩm. Cần tạo hàng trong danh mục TAPHOA trước.';
   for(const btn of result.querySelectorAll('[data-product]')){
    btn.addEventListener('click',()=>{chosen=btn.dataset.product;save.disabled=false;for(const x of result.querySelectorAll('[data-product]'))x.style.borderColor=x===btn?'#171717':'';});
   }
  }catch{result.textContent='Không tải được danh mục sản phẩm.';}
 }
 host.querySelector('[data-ncc-find]').onclick=()=>void search();
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void search();}});
 save.onclick=async()=>{
  if(!chosen||busy)return;
  const factor=Number(host.querySelector('[data-ncc-factor]').value);
  if(!Number.isFinite(factor)||factor<=0){notify('Hệ số quy đổi không hợp lệ.');return;}
  updateBusy(true);
  try{
   await call('assign',{id,rowNo,productCode:chosen,unitFactor:factor,
    rememberAlias:host.querySelector('[data-ncc-remember]').checked,
    acceptPriceJump:host.querySelector('[data-ncc-price-jump]').checked});
   await view(id);notify('Đã liên kết sản phẩm. Chưa thay đổi giá vốn.');
  }catch{notify('Chưa lưu liên kết. Kiểm tra giá bất thường, quy cách và quyền truy cập.');}
  finally{updateBusy(false);}
 };
}
document.addEventListener('v21-auth-state',()=>{if(!admin())dialog?.close();else ensureButton();});
document.addEventListener('v21-contact-groups-change',ensureButton);
document.addEventListener('v21-active-contact-change',ensureButton);
document.addEventListener('v21-mobile-directory-change',ensureButton);
window.setTimeout(ensureButton,0);
window.V21NccInvoiceAdmin=Object.freeze({open:()=>void open(),refresh:()=>void loadList()});
})();
