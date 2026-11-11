(()=>{
'use strict';
// P1-NET-288: advisory device connectivity only. A browser "online" event is
// not a message-delivery receipt. Realtime/SyncEngine remains the only sync
// and reconnect owner. No polling, RPC, fetch, timer, or log in this module.
const holder=document.getElementById('chatConnectionStatus');
if(!holder)return;
const label=holder.querySelector('[data-chat-network-label]');
if(!label)return;
let phase=navigator.onLine===false?'offline':'idle';

function visible(){
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const shell=window.ChatAppShell?.snapshot?.()||{};
 return auth.state==='AUTHENTICATED'&&shell.route==='chat';
}
function render(){
 if(!visible()||phase==='idle'){
  holder.hidden=true;
  holder.dataset.state='idle';
  label.textContent='';
  return;
 }
 const offline=navigator.onLine===false||phase==='offline';
 const effective=offline?'offline':phase;
 const copy={
  offline:'Thiết bị đang ngoại tuyến · tin chưa xác nhận vẫn chờ gửi',
  reconnecting:'Đã có mạng · đang kiểm tra đồng bộ',
  unstable:'Chưa thể đồng bộ · tin chưa xác nhận vẫn chờ gửi'
 };
 holder.dataset.state=effective;
 label.textContent=copy[effective]||'';
 holder.hidden=!copy[effective];
}
window.addEventListener('offline',()=>{
 phase='offline';render();
},{passive:true});
window.addEventListener('online',()=>{
 phase='reconnecting';render();
},{passive:true});
document.addEventListener('v21-sync-lifecycle',event=>{
 if(navigator.onLine===false){
  phase='offline';
 }else if(phase==='reconnecting'||phase==='unstable'){
  phase=event?.detail?.state==='completed'?'idle':'unstable';
 }
 render();
});
document.addEventListener('v21-auth-state',()=>{
 if(navigator.onLine===false)phase='offline';
 else if(!visible())phase='idle';
 render();
});
document.addEventListener('navigation-change',render);
document.addEventListener('visibilitychange',render);
render();
})();
