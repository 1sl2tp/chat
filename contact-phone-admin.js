(()=>{
'use strict';
// CALL-186: iOS PWA private phonebook and callback panel. No SIM history.
const cache=new Map();const pending=new Map();let saving=false;
let modalOpener=null;
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
 '.v21-phone-header-button{box-sizing:border-box;width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;display:grid;place-items:center;cursor:pointer;background:transparent;color:inherit;border:0;border-radius:50%;padding:0;touch-action:manipulation}',
 '.v21-phone-header-button:hover,.v21-phone-header-button:focus-visible{background:var(--theme-action-ghost-surface-hover,#eee)}',
 '.call-focus-slot:not([data-call-ui-state="idle"]) .v21-phone-header-button{display:none!important}',
 '.v21-phone-header-button[hidden]{display:none!important}',
 '.v21-phone-header-button[data-phone-state="loading"]{opacity:.56}',
 '.v21-phone-toast{position:fixed;inset-inline:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:9501;max-width:420px;margin-inline:auto;box-sizing:border-box;border:1px solid var(--theme-border-default,#ddd);border-radius:12px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#222);padding:12px 14px;box-shadow:0 8px 22px #0002;font-size:13px;line-height:1.45}',
 '.v21-phone-overlay{position:fixed;inset:0;z-index:9500;background:#0009;display:grid;place-items:center;padding:12px}',
 '.v21-phone-panel{box-sizing:border-box;width:min(100%,430px);max-height:92dvh;overflow:auto;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#222);border-radius:17px;padding:16px}',
 '.v21-phone-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:700}',
 '.v21-phone-close{box-sizing:border-box;width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;padding:0;background:transparent;border:0;border-radius:11px;font-size:24px;cursor:pointer}',
 '.v21-phone-close:hover,.v21-phone-close:focus-visible{background:var(--theme-action-ghost-surface-hover,#eee)}',
 '.v21-phone-hint,.v21-phone-feedback{font-size:12px;line-height:1.5;color:var(--theme-content-secondary,#666)}',
 '.v21-phone-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;margin:13px 0}',
 '.v21-phone-field input{box-sizing:border-box;width:100%;padding:12px;font-size:16px;border:1px solid #cbd0d5;background:var(--theme-surface-primary,#fff);color:inherit;border-radius:10px}',
 '.v21-phone-actions{display:flex;gap:7px;flex-wrap:wrap}',
 '.v21-phone-action{box-sizing:border-box;flex:1;min-width:108px;min-height:44px;padding:11px 9px;border-radius:10px;border:1px solid #cbd0d5;background:var(--theme-surface-secondary,#f5f5f5);color:inherit;font-weight:650;font-size:12px;cursor:pointer}',
 '.v21-phone-action[data-main=true]{background:#139e53;border-color:#139e53;color:white}',
 '.v21-phone-action:disabled{opacity:.5}',
 '@media(max-width:640px){.v21-phone-overlay{padding:0;align-items:end}.v21-phone-panel{max-height:92dvh;width:100%;border-radius:17px 17px 0 0;padding-bottom:calc(15px + env(safe-area-inset-bottom,0px))}}'
 ].join('');
 document.head.appendChild(st);
}
// CALL-187: pre-read a private Admin-only number when the contact changes.
// The eventual dial is ALWAYS a synchronous user click (never an RPC callback)
// because iOS/Safari can block tel: navigation after awaited network work.
const scopeKey=(id=current()?.id)=>String(au().account?.id||'')+':'+String(au().appSessionId||'')+':'+String(id||'');
function notice(message){
 let n=document.querySelector('[data-v21-phone-toast]');
 if(!n){
  n=el('div','v21-phone-toast');n.dataset.v21PhoneToast='';
  n.setAttribute('role','status');document.body.appendChild(n);
 }
 n.textContent=message;
}
function clearNotice(){document.querySelector('[data-v21-phone-toast]')?.remove()}
function updateDialButton(){
 const button=document.querySelector('[data-v21-phone-open]');
 if(!button)return;
 const id=String(current()?.id||'');
 const active=admin()&&Boolean(id);
 button.hidden=!active;
 if(!active)return;
 const data=cache.get(scopeKey(id));
 const number=normalize(data?.phone_primary||'');
 const ready=valid(number);
 button.dataset.phoneState=ready?'ready':pending.has(scopeKey(id))?'loading':'missing';
 button.setAttribute('aria-label',ready?'Gọi bằng iPhone':button.dataset.phoneState==='loading'?'Đang tải số điện thoại':'Chưa có số điện thoại. Thêm ở menu tùy chọn');
 button.title=ready?'Gọi bằng iPhone':button.dataset.phoneState==='loading'?'Đang tải số điện thoại':'Vào … → Số điện thoại để thêm';
}
async function readPhone(id,account=String(au().account?.id||''),session=String(au().appSessionId||'')){
 const key=account+':'+session+':'+String(id||'');
 if(cache.has(key))return cache.get(key);
 if(pending.has(key))return pending.get(key);
 const request=rpc(id).then(data=>{
  if(phoneContextActive(id,account,session)){
   cache.set(key,data);
   updateDialButton();
  }
  return data;
 }).finally(()=>{
  pending.delete(key);
  if(phoneContextActive(id,account,session))updateDialButton();
 });
 pending.set(key,request);
 updateDialButton();
 return request;
}
function dialCurrent(){
 const id=String(current()?.id||'');
 if(!admin()||!id)return false;
 const key=scopeKey(id);
 const number=normalize(cache.get(key)?.phone_primary||'');
 if(!valid(number)){
  notice(pending.has(key)?'Đang tải số điện thoại. Bấm gọi lại khi tải xong.':
   'Chưa có số chính. Vào … → Số điện thoại để thêm.');
  return false;
 }
 clearNotice();
 // Keep the tel navigation inside this trusted click; never initiate a call
 // from a resolved promise or automatically after a save/retry.
 window.location.href='tel:'+number;
 return true;
}
function attach(){
 style();
 const host=document.querySelector('.call-focus-slot');if(!host)return;
 let btn=host.querySelector('[data-v21-phone-open]');
 if(!btn){
  btn=el('button','v21-phone-header-button');
  btn.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.91.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.26a2 2 0 0 1 2.11-.45c.9.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/></svg>';
  btn.type='button';btn.dataset.v21PhoneOpen='';
  btn.addEventListener('click',dialCurrent);
  host.appendChild(btn);
 }
 updateDialButton();
 if(!btn.hidden&&!cache.has(scopeKey())&&!pending.has(scopeKey())){
  void readPhone(String(current().id)).catch(()=>{
   if(phoneContextActive(String(current()?.id||''),String(au().account?.id||'')))updateDialButton();
  });
 }
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
function dismiss({restoreFocus=false}={}){
 const target=modalOpener;
 modalOpener=null;
 const overlay=document.querySelector('[data-v21-phone-overlay]');
 if(!overlay)return;
 overlay.remove();
 if(restoreFocus){
  const opener=target?.isConnected?target:document.querySelector('[data-v21-phone-open]');
  if(opener&&!opener.hidden&&opener.isConnected)opener.focus?.({preventScroll:true});
 }
}
function phoneContextActive(id,account,session=String(au().appSessionId||'')){
 return admin()&&String(au().account?.id||'')===String(account)&&
  String(au().appSessionId||'')===String(session)&&
  String(current()?.id||'')===String(id);
}
async function open({contactId=current()?.id,missed=false,opener=null}={}){
 if(!admin()||!contactId)return false;
 const id=String(contactId),account=String(au().account?.id||'');
 if(id!==String(current()?.id||'')){
  if(!window.ChatAppShell?.NavigationCommand?.openContact?.(id))return false;
 }
 dismiss();clearNotice();style();
 modalOpener=opener?.isConnected?opener:null;
 const overlay=el('div','v21-phone-overlay');overlay.dataset.v21PhoneOverlay='';
 const panel=el('section','v21-phone-panel');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-labelledby','v21-phone-dialog-title');
 const head=el('div','v21-phone-head');
 const heading=el('strong','',missed?'Cuộc gọi nhỡ · Gọi lại':'Số điện thoại khách hàng');
 heading.id='v21-phone-dialog-title';head.appendChild(heading);
 const close=el('button','v21-phone-close','×');close.type='button';
 close.addEventListener('click',()=>dismiss({restoreFocus:true}));
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
 actions.append(save);
 if(missed)actions.append(dial,chat);
 panel.appendChild(actions);
 const status=el('p','v21-phone-feedback','Đang tải số điện thoại…');status.setAttribute('role','status');
 panel.appendChild(status);overlay.appendChild(panel);document.body.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)dismiss({restoreFocus:true})});
 overlay.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  event.preventDefault();event.stopPropagation();dismiss({restoreFocus:true});
 });
 const session=String(au().appSessionId||'');
 const key=account+':'+session+':'+id;
 try{
  const data=await readPhone(id,account,session);
  // CALL-186 audit round 2: a pending private-phone RPC must not paint
  // customer A's numbers after the Admin switches to customer B/logs out.
  if(!overlay.isConnected||!phoneContextActive(id,account)||String(au().appSessionId||'')!==session){
   dismiss();return false;
  }
  cache.set(key,data);
  primary.value=data.phone_primary||'';secondary.value=data.phone_secondary||'';
  dial.disabled=!valid(normalize(primary.value));
  status.textContent=missed?'Bấm Gọi bằng iPhone để mở ứng dụng Điện thoại.':'Thêm hoặc sửa số, sau đó bấm Lưu số.';
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
   if(!overlay.isConnected||!phoneContextActive(id,account,session))return;
   cache.set(key,data);updateDialButton();
   status.textContent='Đã lưu số riêng tư cho khách.';
   dial.disabled=!valid(p);
  }catch(error){status.textContent='Lưu thất bại: '+String(error?.message||error)}
  finally{saving=false;save.disabled=false}
 });
 close.focus();
 return true;
}
document.addEventListener('v21-active-contact-change',()=>{dismiss();clearNotice();attach()});
document.addEventListener('v21-auth-state',()=>{cache.clear();pending.clear();dismiss();clearNotice();attach()});
document.addEventListener('v21-missed-call-push-open',e=>{
 const contactId=String(e.detail?.contactId||'');
 if(contactId)void open({contactId,missed:true});
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
else attach();
window.V21ContactPhoneAdmin=Object.freeze({open,valid,dial:dialCurrent,refresh:attach});
})();