(()=>{
'use strict';

const ADMIN_ENDPOINT='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-call-invite-admin';
const PUBLIC_KEY='sb_publishable_UY3gfQ9MsntDFCUJ_uV0UA__eTYXz_w';
let targetAccountId='';
let mountQueued=false;
let watchChannel=null;
let watchInviteId='';
const invitesByContact=new Map();

function authStore(){return window.V21AuthSessionStore||null;}
function contactStore(){return window.V21ContactStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function targetContact(){
  return contactStore()?.snapshot?.().find(item=>String(item?.id||'')===String(targetAccountId||''))||null;
}
function activeInvite(contactId=targetAccountId){
  return invitesByContact.get(String(contactId||''))||null;
}
function isExpired(invite){
  const due=Date.parse(String(invite?.expiresAt||''));
  return !Number.isFinite(due)||Date.now()>=due;
}
function errorText(error){
  const raw=String(error?.message||error||'Không thể tạo link gọi').trim();
  const known={
    admin_required:'Chỉ Admin được gửi link gọi',
    unauthorized:'Phiên đăng nhập đã hết hạn',
    authentication_required:'Phiên đăng nhập chưa sẵn sàng',
    contact_required:'Chưa chọn khách hàng',
    invite_create_failed:'Không thể tạo link gọi',
    invite_not_active:'Link gọi đã hết hạn',
    invite_not_found:'Không tìm thấy link gọi',
    livekit_token_failed:'Không thể vào phòng gọi',
    conversation_not_ready:'Đoạn chat chưa sẵn sàng',
  };
  return known[raw]||raw;
}

function installStyle(){
  if(document.getElementById('v21-call-invite-style'))return;
  const style=document.createElement('style');
  style.id='v21-call-invite-style';
  style.textContent=`
    .call-invite-admin-block{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--theme-border-default,#dedede)}
    .call-invite-primary,.call-invite-secondary{appearance:none;min-height:44px;border:1px solid var(--theme-border-default,#dedede);border-radius:14px;font:inherit;font-weight:650;cursor:pointer}
    .call-invite-primary{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .call-invite-secondary{background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717)}
    .call-invite-primary:disabled,.call-invite-secondary:disabled{opacity:.5;cursor:default}
    .call-invite-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .call-invite-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    [data-call-invite-hidden="true"]{display:none!important}
  `;
  document.head.appendChild(style);
}

async function accessToken(){
  const client=authStore()?.getClient?.();
  if(!client||!currentAdmin())throw new Error('admin_required');
  const sessionResult=await client.auth.getSession();
  const token=String(sessionResult?.data?.session?.access_token||'');
  if(!token)throw new Error('authentication_required');
  return {client,token};
}

async function invokeAdmin(body){
  const {client,token}=await accessToken();
  const {data,error}=await client.functions.invoke('v21-call-invite-admin',{
    body,
    headers:{authorization:`Bearer ${token}`},
  });
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||'invite_request_failed');
  return data;
}

async function sendTextLink(url,contactId=targetAccountId){
  const text=String(url||'').trim();
  const target=String(contactId||'').trim();
  if(!text||!target)throw new Error('conversation_not_ready');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const messageState=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`call-link-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  if(
    messageStore?.send&&
    messageState.ready&&
    String(messageState.currentContactId||'')===target
  ){
    await messageStore.send({
      clientId,
      text,
      contactId:target,
      conversationId:messageState.currentConversationId||null,
      reply:null,
    });
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({
      clientId,
      text,
      contactId:target,
      conversationId:null,
      reply:null,
    });
  }
  void sync?.wake?.({reason:'guest-call-link-send'});
  return true;
}

function stopWatch(){
  if(!watchChannel)return;
  try{watchChannel.unsubscribe?.();}catch{}
  const client=authStore()?.getClient?.();
  try{client?.removeChannel?.(watchChannel);}catch{}
  watchChannel=null;
  watchInviteId='';
}

function mergeInviteRow(contactId,row){
  const key=String(contactId||'');
  const current=invitesByContact.get(key);
  if(!current||String(current.inviteId)!==String(row?.id||current.inviteId))return current||null;
  const next={
    ...current,
    openedAt:row?.opened_at||current.openedAt||null,
    guestJoinedAt:row?.guest_joined_at||current.guestJoinedAt||null,
    adminJoinedAt:row?.admin_joined_at||current.adminJoinedAt||null,
    revokedAt:row?.revoked_at||current.revokedAt||null,
    endedAt:row?.ended_at||current.endedAt||null,
  };
  invitesByContact.set(key,next);
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:key,invite:{...next}}}));
  return next;
}

function watchInvite(contactId,inviteId){
  stopWatch();
  const client=authStore()?.getClient?.();
  if(!client?.channel||!inviteId)return false;
  watchInviteId=String(inviteId);
  watchChannel=client.channel(`call-invite:${watchInviteId}`)
    .on('postgres_changes',{
      event:'UPDATE',
      schema:'public',
      table:'chat_call_invites',
      filter:`id=eq.${watchInviteId}`,
    },payload=>mergeInviteRow(contactId,payload?.new||{}))
    .subscribe();
  return true;
}

async function createAndSend({contactId=targetAccountId}={}){
  const target=String(contactId||'').trim();
  if(!target)throw new Error('contact_required');
  if(!currentAdmin())throw new Error('admin_required');
  const {client,token}=await accessToken();
  const {data,error}=await client.functions.invoke('v21-call-invite-admin',{
    body:{action:'create',contactId:target},
    headers:{authorization:`Bearer ${token}`},
  });
  if(error)throw error;
  if(!data?.ok||!data?.inviteId||!data?.url)throw new Error(data?.error||'invite_create_failed');

  const invite={
    inviteId:String(data.inviteId),
    url:String(data.url),
    expiresAt:String(data.expiresAt||''),
    openedAt:null,
    guestJoinedAt:null,
    adminJoinedAt:null,
    revokedAt:null,
    endedAt:null,
    sendFailed:false,
    adminConnected:false,
  };
  invitesByContact.set(target,invite);
  watchInvite(target,invite.inviteId);
  try{
    await sendTextLink(invite.url,target);
  }catch(error){
    invite.sendFailed=true;
    invitesByContact.set(target,invite);
    document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:target,invite:{...invite}}}));
    throw error;
  }
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:target,invite:{...invite}}}));
  return invite;
}

async function joinInvite({contactId=targetAccountId}={}){
  const target=String(contactId||'').trim();
  const invite=activeInvite(target);
  if(!invite||isExpired(invite)||invite.revokedAt||invite.endedAt)throw new Error('invite_not_active');
  const {token}=await accessToken();
  const session=window.TaphoaGuestCallSession||null;
  if(!session?.joinAdmin)throw new Error('livekit_session_unavailable');
  const ok=await session.joinAdmin({
    inviteId:invite.inviteId,
    endpoint:ADMIN_ENDPOINT,
    apiKey:PUBLIC_KEY,
    accessToken:token,
  });
  if(!ok)throw new Error(session.snapshot?.().error||'livekit_token_failed');
  invite.adminConnected=true;
  invitesByContact.set(target,invite);
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:target,invite:{...invite}}}));
  return true;
}

async function endInvite({contactId=targetAccountId}={}){
  const target=String(contactId||'').trim();
  const invite=activeInvite(target);
  if(!invite)return false;
  await window.TaphoaGuestCallSession?.leave?.({reason:'ended'});
  try{await invokeAdmin({action:'end',inviteId:invite.inviteId});}catch{}
  invite.adminConnected=false;
  invite.endedAt=invite.endedAt||new Date().toISOString();
  invitesByContact.set(target,invite);
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:target,invite:{...invite}}}));
  return true;
}

async function resendInvite(contactId=targetAccountId){
  const target=String(contactId||'').trim();
  const invite=activeInvite(target);
  if(!invite||!invite.url||isExpired(invite)||invite.revokedAt||invite.endedAt)throw new Error('invite_not_active');
  await sendTextLink(invite.url,target);
  invite.sendFailed=false;
  invitesByContact.set(target,invite);
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:target,invite:{...invite}}}));
  return invite;
}

function statusText(invite){
  if(!invite)return '';
  if(invite.endedAt)return 'Cuộc gọi đã kết thúc';
  if(invite.revokedAt||isExpired(invite))return 'Link gọi đã hết hạn';
  if(invite.guestJoinedAt)return 'Khách đã vào phòng';
  if(invite.openedAt)return 'Khách đã mở link';
  if(invite.sendFailed)return 'Link đã tạo nhưng chưa gửi';
  return 'Đã gửi link gọi · hiệu lực 10 phút';
}

function mountCallInvitePanel(){
  if(!currentAdmin()||!targetAccountId)return false;
  const overlay=document.querySelector('[data-profile-overlay]');
  if(!overlay)return false;
  const title=String(overlay.querySelector('#shell-profile-title')?.textContent||'').trim();
  if(title!=='Thông tin liên hệ')return false;
  const adminActions=overlay.querySelector('[data-profile-admin-actions]');
  if(!adminActions||adminActions.parentElement?.querySelector('[data-call-invite-admin-block]'))return Boolean(adminActions);

  const contactId=String(targetAccountId);
  const contact=targetContact();
  const host=document.createElement('section');
  host.className='call-invite-admin-block';
  host.dataset.callInviteAdminBlock='';
  host.innerHTML=`
    <button type="button" class="call-invite-primary" data-call-invite-send>Gửi link gọi</button>
    <p class="call-invite-status" data-call-invite-status></p>
    <div class="call-invite-actions" data-call-invite-actions data-call-invite-hidden="true">
      <button type="button" class="call-invite-secondary" data-call-invite-join>Tham gia</button>
      <button type="button" class="call-invite-secondary" data-call-invite-end data-call-invite-hidden="true">Kết thúc</button>
    </div>`;
  adminActions.parentElement.insertBefore(host,adminActions);

  const sendButton=host.querySelector('[data-call-invite-send]');
  const status=host.querySelector('[data-call-invite-status]');
  const actions=host.querySelector('[data-call-invite-actions]');
  const joinButton=host.querySelector('[data-call-invite-join]');
  const endButton=host.querySelector('[data-call-invite-end]');
  let busy=false;

  function setBusy(next){
    busy=Boolean(next);
    sendButton.disabled=busy;
    joinButton.disabled=busy;
    endButton.disabled=busy;
  }
  function render(){
    const invite=activeInvite(contactId);
    status.textContent=invite?statusText(invite):(contact?`Gửi link gọi cho ${String(contact.display_name||contact.username||'khách hàng')}`:'');
    const live=Boolean(invite&&!isExpired(invite)&&!invite.revokedAt&&!invite.endedAt);
    actions.dataset.callInviteHidden=String(!live);
    joinButton.dataset.callInviteHidden=String(Boolean(invite?.adminConnected));
    endButton.dataset.callInviteHidden=String(!invite?.adminConnected);
    sendButton.textContent=invite?.sendFailed&&live?'Gửi lại link':'Gửi link gọi';
  }

  sendButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const invite=activeInvite(contactId);
      if(invite?.sendFailed&&!isExpired(invite))await resendInvite(contactId);
      else await createAndSend({contactId});
    }catch(error){status.textContent=errorText(error);}
    finally{setBusy(false);render();}
  });

  joinButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);status.textContent='Đang vào phòng…';
    try{await joinInvite({contactId});}
    catch(error){status.textContent=errorText(error);}
    finally{setBusy(false);render();}
  });

  endButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);
    try{await endInvite({contactId});}
    catch(error){status.textContent=errorText(error);}
    finally{setBusy(false);render();}
  });

  const stateListener=event=>{
    if(String(event?.detail?.contactId||'')===contactId&&host.isConnected)render();
  };
  document.addEventListener('v21-call-invite-state',stateListener);
  render();
  return true;
}

function openForContact({contactId}={}){
  targetAccountId=String(contactId||'');
  return mountCallInvitePanel();
}

function scheduleMount(){
  if(mountQueued)return;
  mountQueued=true;
  queueMicrotask(()=>{mountQueued=false;mountCallInvitePanel();});
}

installStyle();
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const manage=target?.closest?.('[data-contact-manage]');
  if(!manage)return;
  targetAccountId=String(manage.dataset.contactId||'');
  window.setTimeout(scheduleMount,0);
},true);
new MutationObserver(scheduleMount).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('v21-auth-state',scheduleMount);

window.TaphoaCallInviteClient=Object.freeze({
  openForContact,
  createAndSend,
  resendInvite,
  joinInvite,
  endInvite,
  snapshot:(contactId=targetAccountId)=>activeInvite(contactId),
});
})();
