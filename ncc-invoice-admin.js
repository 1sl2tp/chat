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
 .ncc-help{font-size:12px;color:#64748b;line-height:1.5}.ncc-msg{min-height:18px;color:#b45309;font-size:12px}
 @media(max-width:600px){.ncc-dialog{padding:10px;max-height:92dvh}.ncc-head{top:-10px}.ncc-dialog .ncc-pane{gap:6px}}
 `;
 document.head.appendChild(style);
}
function ensureButton(){
 if(!admin())return;
 const tools=document.querySelector('[data-contact-directory-tools]');
 if(!tools)return;
 const ready=window.V21ContactDirectoryAdmin?.nccEnabled?.()===true;
 const existing=tools.querySelector('[data-ncc-launch]');
 if(existing){existing.disabled=!ready;existing.textContent=ready?'Phiếu nhập · TK NCC':'Phiếu NCC · Chưa kích hoạt';return;}
 ensureStyle();
 const button=document.createElement('button');button.type='button';button.className='ncc-launch';
 button.dataset.nccLaunch='';button.disabled=!ready;
 button.textContent=ready?'Phiếu nhập · TK NCC':'Phiếu NCC · Chưa kích hoạt';
 button.addEventListener('click',()=>{void open();});
 tools.appendChild(button);
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
  const {documents}=await call('list');
  supplierRows=documents||[];
  host.innerHTML=`<div class="ncc-controls"><button type="button" data-ncc-refresh>Làm mới</button><span class="ncc-help">Danh sách ảnh NCC, tối đa 60 phiếu mới</span></div>
  <div class="ncc-docs">${supplierRows.map(x=>`<button type="button" class="ncc-doc" data-ncc-id="${escape(x.id)}"><span><strong>${escape(x.invoice_number||'Chưa có mã phiếu')}</strong> · ${escape(x.invoice_date||'Chưa rõ ngày')}<small> · ${escape(x.created_at?.slice(0,10)||'')}</small></span><small>${escape(statusText[x.status]||'Chờ kiểm tra')}</small></button>`).join('')||'<p>Chưa có ảnh phiếu nhập từ TK NCC.</p>'}</div>`;
  host.querySelector('[data-ncc-refresh]').onclick=()=>void loadList();
  for(const btn of host.querySelectorAll('[data-ncc-id]'))btn.onclick=()=>void view(btn.dataset.nccId);
 }catch{host.textContent='Chưa mở được danh sách phiếu. Kiểm tra quyền và phiên bản máy chủ.';}
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
    ${['pending','failed','needs_review'].includes(doc.status)?'<button type="button" class="ncc-primary" data-ncc-scan>AI đọc phiếu</button>':''}</div>
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
 <label><input type="checkbox" data-ncc-remember checked> Nhớ tên NCC cho lần sau</label>
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
window.setTimeout(ensureButton,0);
window.V21NccInvoiceAdmin=Object.freeze({open:()=>void open(),refresh:()=>void loadList()});
})();
