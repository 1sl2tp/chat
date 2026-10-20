(()=>{
'use strict';
// CALL-186: iOS PWA private phonebook and callback panel. No SIM history.
const cache=new Map();let saving=false;
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const au=()=>window.V21AuthSessionStore?.snapshot?.()||{};
const admin=()=>au().state==='AUTHENTICATED'&&au().account?.role==='admin';
const current=()=>window.ChatAppShell?.snapshot?.().activeContact||null;
const normalize=s=>String(s||'').replace(/[\s().-]/g,'');
const valid=s=>/^\+?[0-9]{9,15}$/.test(s);
function style(){
 if(document.getElementById('v21-contact-phone-css'))return;
 const st=el('style');st.id='v21-contact-phone-css';
 st.textContent=[
 '.v21-phone-header-button{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;cursor:pointer;background:transparent;color:inherit;border:0;border-radius:50%}',
 '.v21-phone-header-button[hidden]{display:none!important}',
 '.v21-phone-overlay{position:fixed;inset:0;z-index:9500;background:#0009;display:grid;place-items:center;padding:12px}',
 '.v21-phone-panel{box-sizing:border-box;width:min(100%,430px);max-height:92dvh;overflow:auto;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#222);border-radius:17px;padding:16px}',
 '.v21-phone-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:700}',
 '.v21-phone-close{background:transparent;border:0;font-size:24px;cursor:pointer}',
 '.v21-phone-hint,.v21-phone-feedback{font-size:12px;line-height:1.5;color:var(--theme-content-secondary,#666)}',
 '.v21-phone-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;margin:13px 0}',
 '.v21-phone-field input{box-sizing:border-box;width:100%;padding:12px;font-size:16px;border:1px solid #cbd0d5;background:var(--theme-surface-primary,#fff);color:inherit;border-radius:10px}',
 '.v21-phone-actions{display:flex;gap:7px;flex-wrap:wrap}',
 '.v21-phone-action{flex:1;min-width:108px;padding:11px 9px;border-radius:10px;border:1px solid #cbd0d5;background:var(--theme-surface-secondary,#f5f5f5);color:inherit;font-weight:650;font-size:12px;cursor:pointer}',
 '.v21-phone-action[data-main=true]{background:#139e53;border-color:#139e53;color:white}',
 '.v21-phone-action:disabled{opacity:.5}',
 '@media(max-width:640px){.v21-phone-overlay{padding:0;align-items:end}.v21-phone-panel{max-height:92dvh;width:100%;border-radius:17px 17px 0 0;padding-bottom:calc(15px + env(safe-area-inset-bottom,0px))}}'
 ].join('');
 document.head.appendChild(st);
}
function attach(){
 style();
 const host=document.querySelector('.call-focus-slot');if(!host)return;
 let btn=host.querySelector('[data-v21-phone-open]');
 if(!btn){
  btn=el('button','v21-phone-header-button');
  btn.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.91.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.26a2 2 0 0 1 2.11-.45c.9.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/></svg>';
  btn.type='button';btn.dataset.v21PhoneOpen='';
  btn.setAttribute('aria-label','Số điện thoại và gọi lại');
  btn.title='Số điện thoại · Gọi lại';
  btn.addEventListener('click',()=>void open());
  host.insertBefore(btn,host.firstChild);
 }
 btn.hidden=!admin()||!current()?.id;
}
async function rpc(id,action='get',primary=null,secondary=null){
 const client=window.V21AuthSessionStore?.getClient?.();
 if(!client||!au().appSessionId||!admin())throw new Error('Yêu cầu phiên Admin');
 const {data,error}=await client.rpc('v21_admin_contact_phone',{
  p_app_session_id:au().appSessionId,p_contact_id:id,p_action:action,
  p_primary:primary,p_secondary:secondary
 });
 if(error)throw error;
 if(!data?.ok)throw new Error('Không thể đọc số');
 return data;
}
function dismiss(){document.querySelector('[data-v21-phone-overlay]')?.remove();}
async function open({contactId=current()?.id,missed=false}={}){
 if(!admin()||!contactId)return false;
 const id=String(contactId),account=String(au().account?.id||'');
 if(id!==String(current()?.id||'')){
  if(!window.ChatAppShell?.NavigationCommand?.openContact?.(id))return false;
 }
 dismiss();style();
 const overlay=el('div','v21-phone-overlay');overlay.dataset.v21PhoneOverlay='';
 const panel=el('section','v21-phone-panel');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 const head=el('div','v21-phone-head');
 head.appendChild(el('strong','',missed?'Cuộc gọi nhỡ · Gọi lại':'Số điện thoại khách hàng'));
 const close=el('button','v21-phone-close','×');close.type='button';close.addEventListener('click',dismiss);
 close.setAttribute('aria-label','Đóng');head.appendChild(close);panel.appendChild(head);
 const name=String(current()?.name||'Khách hàng');
 panel.appendChild(el('p','v21-phone-hint',name+
 (missed?' · Cuộc gọi nhỡ trong Chat, không phải nhật ký SIM iPhone.':' · Số riêng chỉ Admin xem/sửa.')));
 function field(label,placeholder){
  const wrap=el('label','v21-phone-field',label);
  const input=el('input');input.type='tel';input.inputMode='tel';input.autocomplete='off';
  input.maxLength=20;input.placeholder=placeholder;
  wrap.appendChild(input);panel.appendChild(wrap);return input;
 }
 const primary=field('Số chính','09… hoặc +84…');
 const secondary=field('Số phụ (nếu có)','Số điện thoại khác');
 const actions=el('div','v21-phone-actions');
 const save=el('button','v21-phone-action','Lưu số');save.type='button';save.dataset.main='true';
 const dial=el('button','v21-phone-action','Gọi bằng iPhone');dial.type='button';dial.disabled=true;
 const chat=el('button','v21-phone-action','Gọi qua Chat');chat.type='button';
 actions.append(save,dial,chat);panel.appendChild(actions);
 const status=el('p','v21-phone-feedback','Đang tải số điện thoại…');status.setAttribute('role','status');
 panel.appendChild(status);overlay.appendChild(panel);document.body.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)dismiss()});
 const key=account+':'+id;
 try{
  const data=cache.has(key)?cache.get(key):await rpc(id);
  if(!overlay.isConnected)return false;
  cache.set(key,data);
  primary.value=data.phone_primary||'';secondary.value=data.phone_secondary||'';
  dial.disabled=!valid(normalize(primary.value));
  status.textContent='Bấm Gọi bằng iPhone để mở ứng dụng Điện thoại.';
 }catch(error){status.textContent='Không tải được số: '+String(error?.message||error);save.disabled=true;}
 primary.addEventListener('input',()=>dial.disabled=!valid(normalize(primary.value)));
 dial.addEventListener('click',()=>{
  const number=normalize(primary.value);
  if(valid(number))window.location.href='tel:'+number;
 });
 chat.addEventListener('click',()=>{
  dismiss();
  window.ChatAppShell?.CallCommand?.start?.(id,name);
 });
 save.addEventListener('click',async()=>{
  if(saving)return;
  const p=normalize(primary.value),s=normalize(secondary.value);
  if((p&&!valid(p))||(s&&!valid(s))){status.textContent='Số điện thoại phải gồm 9–15 chữ số.';return;}
  saving=true;save.disabled=true;status.textContent='Đang lưu…';
  try{
   const data=await rpc(id,'save',p||null,s||null);
   cache.set(key,data);status.textContent='Đã lưu số riêng tư cho khách.';
   dial.disabled=!valid(p);
  }catch(error){status.textContent='Lưu thất bại: '+String(error?.message||error)}
  finally{saving=false;save.disabled=false}
 });
 close.focus();
 return true;
}
document.addEventListener('v21-active-contact-change',attach);
document.addEventListener('v21-auth-state',()=>{cache.clear();dismiss();attach()});
document.addEventListener('v21-missed-call-push-open',e=>{
 const contactId=String(e.detail?.contactId||'');
 if(contactId)void open({contactId,missed:true});
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
else attach();
window.V21ContactPhoneAdmin=Object.freeze({open,valid});
})();