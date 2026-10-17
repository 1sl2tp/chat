(()=>{
'use strict';
// UI only: all sends are enforced by Supabase's customer + event allowlist.
const types=[['order','Bán mới (đã giao) · ảnh + link'],['order_edit','Sửa đơn đã giao · ảnh mới + link'],['deliver','Chuyển đơn tạm → đã giao · ảnh + link'],['debt','Ghi nợ / Đã thu · ảnh công nợ + số dư + link']];
let current=null;
const style=document.createElement('style');
style.textContent=`
.tp-outbound-panel{display:flex;flex-direction:column;gap:9px;min-width:0;max-height:min(83dvh,750px);overflow-y:auto}
.tp-outbound-panel h3{margin:14px 0 3px;font-size:14px;font-weight:750}
.tp-outbound-panel p{margin:4px 0;font-size:12px;line-height:1.55;color:var(--theme-content-secondary,#667)}
.tp-outbound-panel .tp-outbound-status{border-radius:10px;padding:10px;background:var(--theme-surface-secondary,#f3f5f4);font-size:12px;font-weight:650}
.tp-outbound-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px;border:1px solid var(--theme-border-default,#ddd);border-radius:10px;margin:4px 0;min-width:0;cursor:pointer}
.tp-outbound-line>span{display:grid;gap:2px;min-width:0}
.tp-outbound-line strong{font-size:13px;line-height:1.35;overflow-wrap:anywhere}
.tp-outbound-line small{font-size:11px;line-height:1.4;color:var(--theme-content-secondary,#777)}
.tp-outbound-line input{appearance:auto!important;accent-color:#187b54;flex:0 0 18px;width:18px;height:18px;margin:0}
.tp-outbound-filter{display:flex;gap:8px;align-items:end;margin:9px 0}
.tp-outbound-filter label{min-width:0;flex:1;display:grid;gap:4px;font-size:11px;font-weight:650}
.tp-outbound-filter input,.tp-outbound-filter select{box-sizing:border-box;width:100%;height:38px;border:1px solid var(--theme-border-default,#ccc);border-radius:9px;padding:6px;background:var(--theme-surface-primary,#fff);color:inherit;font-size:13px}
.tp-outbound-list{max-height:285px;overflow-y:auto;overscroll-behavior:contain}
@media(max-width:420px){.tp-outbound-panel{max-height:86dvh}.tp-outbound-list{max-height:27dvh}}
`;
document.head.appendChild(style);
const auth=()=>window.V21AuthSessionStore;
function client(){const s=auth()?.snapshot?.();if(s?.account?.role!=='admin'||s?.state!=='AUTHENTICATED')throw Error('admin_required');return auth().getClient();}
async function rpc(name,args){const {data,error}=await client().rpc(name,args);if(error)throw error;return data;}
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function open(modal){
  const host=modal.querySelector('[data-zalo-account-panel]');if(!host)return;
  host.replaceChildren();
  const panel=document.createElement('section');
  panel.className='zalo-account-panel tp-outbound-panel';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Thông báo nghiệp vụ khách hàng');
  panel.innerHTML='<div class="zalo-account-panel-head"><strong>Thông báo nghiệp vụ KH</strong><button type="button" data-tp-close>Đóng</button></div><p>Chỉ khách nhóm KH được chọn mới nhận thông báo. Đơn tạm: tạo, sửa, xóa đều không gửi. Chỉ đơn đã giao mới tự thông báo. Lưu cài đặt không tạo đơn hay công nợ.</p><div class="tp-outbound-status" role="status">Đang tải cấu hình…</div><div data-tp-content></div><p data-tp-error class="zalo-account-error" hidden></p>';
  host.appendChild(panel);
  panel.querySelector('[data-tp-close]').addEventListener('click',()=>host.replaceChildren());
  const status=panel.querySelector('.tp-outbound-status');
  const content=panel.querySelector('[data-tp-content]');
  const err=panel.querySelector('[data-tp-error]');
  let data=null,filter='all',searchText='',saving=false;
  function line(label,help,checked,key,id=null){
    const row=document.createElement('label');row.className='tp-outbound-line';
    const wrap=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small'),input=document.createElement('input');
    title.textContent=label;small.textContent=help||'';wrap.append(title,small);
    input.type='checkbox';input.checked=Boolean(checked);input.setAttribute('aria-label',label);
    input.addEventListener('change',()=>void save(key,input.checked,id));
    row.append(wrap,input);return row;
  }
  function heading(text){const h=document.createElement('h3');h.textContent=text;content.appendChild(h);}
  function render(){
    if(!panel.isConnected||!data)return;
    const arr=Array.isArray(data.customers)?data.customers:[];
    const num=arr.filter(x=>x.enabled).length;
    status.textContent=(data.master?'Đang bật':'Đang tắt')+' · '+num+'/'+arr.length+' khách được chọn';
    content.replaceChildren();
    content.appendChild(line('Cho phép gửi tự động','Tắt tổng = không gửi bất kỳ loại tin nghiệp vụ nào.',data.master,'master'));
    heading('Loại tin');
    for(const [key,label] of types)content.appendChild(line(label,'Chỉ gửi cho khách được chọn.',data.events?.[key],key));
    const care=document.createElement('p');care.textContent='Chăm sóc / nhắc nhập hàng: lịch vẫn tạm dừng, không kích hoạt ở đây.';content.appendChild(care);
    heading('Kênh nhận');
    content.appendChild(line('KH có liên kết Zalo','Tin lưu trong Chat; Zalo chuyển tiếp nếu đang liên kết.',data.audience?.linked,'linked'));
    content.appendChild(line('KH chưa liên kết Zalo','Chỉ gửi trong Chat; không thể chuyển sang Zalo.',data.audience?.unlinked,'unlinked'));
    heading('Chọn từng khách KH');
    const f=document.createElement('div');f.className='tp-outbound-filter';
    const a=document.createElement('label');a.textContent='Tìm khách';const input=document.createElement('input');input.type='search';input.value=searchText;a.appendChild(input);
    const b=document.createElement('label');b.textContent='Liên kết';const select=document.createElement('select');
    for(const [value,label] of [['all','Tất cả'],['linked','Có Zalo'],['unlinked','Chưa có Zalo']]){
      const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);
    }select.value=filter;b.appendChild(select);f.append(a,b);content.appendChild(f);
    const list=document.createElement('div');list.className='tp-outbound-list';content.appendChild(list);
    function paint(){
      list.replaceChildren();let count=0;
      for(const c of arr){
        if(filter!=='all'&&Boolean(c.linked)!==(filter==='linked'))continue;
        if(!normalize(c.name+' '+c.username).includes(normalize(searchText)))continue;
        count++;list.appendChild(line(c.name||c.username,(c.linked?'Có liên kết Zalo':'Chưa liên kết Zalo')+' · '+c.username,c.enabled,'customer',c.id));
      }
      if(!count){const p=document.createElement('p');p.textContent='Không có khách phù hợp';list.appendChild(p);}
    }
    input.addEventListener('input',()=>{searchText=input.value;paint();});
    select.addEventListener('change',()=>{filter=select.value;paint();});
    paint();
  }
  async function save(key,enabled,id=null){
    if(saving)return;saving=true;status.textContent='Đang lưu…';
    panel.querySelectorAll('input,select').forEach(x=>x.disabled=true);
    try{
      data=await rpc('chat_admin_outbound_settings_set',{p_key:key,p_enabled:enabled,p_customer_id:id});
      err.hidden=true;
    }catch(e){err.textContent='Lưu thất bại: '+String(e.message||e);err.hidden=false;}
    finally{saving=false;render();}
  }
  void rpc('chat_admin_outbound_settings_get',{}).then(result=>{data=result;render();}).catch(e=>{status.textContent='Không tải được cấu hình';err.textContent=String(e.message||e);err.hidden=false;});
  setTimeout(()=>panel.querySelector('[data-tp-close]')?.focus?.({preventScroll:true}),0);
}
function install(){
  const modal=document.querySelector('[data-zalo-account-admin-modal]');
  if(!modal||modal.querySelector('[data-tp-outbound-open]'))return;
  const device=modal.querySelector('[data-admin-device-setting]');if(!device)return;
  const row=document.createElement('div');row.className='zalo-account-notification';
  row.innerHTML='<span class="zalo-account-notification-copy"><strong>Thông báo nghiệp vụ KH</strong><small>Loại tin · khách nhận · liên kết Zalo</small></span><button type="button" class="zalo-account-notification-action" data-tp-outbound-open>Cài đặt</button>';
  row.querySelector('button').addEventListener('click',()=>open(modal));
  device.parentNode.insertBefore(row,device);
}
function init(){
  const root=document.querySelector('[data-global-overlay-root]')||document.body;
  new MutationObserver(install).observe(root,{childList:true});
  install();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();