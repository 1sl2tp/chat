(()=>{
'use strict';

const ADMIN_ENDPOINT='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-call-invite-admin';
const PUBLIC_KEY='sb_publishable_UY3gfQ9MsntDFCUJ_uV0UA__eTYXz_w';
let targetAccountId='';
let mountQueued=false;
let watchChannel=null;
let watchInviteId='';
let incomingWatchChannel=null;
let nativeCallEngine=null;
let externalCallAdapter=null;
let acceptingInviteId='';
const invitesByContact=new Map();

function authStore(){return window.V21AuthSessionStore||null;}
function contactStore(){return window.V21ContactStore||null;}
function callCommand(){return window.ChatAppShell?.CallCommand||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function targetContact(){
  return contactStore()?.snapshot?.().find(item=>String(item?.id||'')===String(targetAccountId||''))||null;
}
function contactForId(contactId){
  return contactStore()?.snapshot?.().find(item=>String(item?.id||'')===String(contactId||''))||null;
}
function contactNameFor(contactId){
  const contact=contactForId(contactId);
  return String(contact?.display_name||contact?.username||'Khách hàng');
}
function activeInvite(contactId=targetAccountId){
  return invitesByContact.get(String(contactId||''))||null;
}
function isExpired(invite){
  const due=Date.parse(String(invite?.expiresAt||''));
  return !Number.isFinite(due)||Date.now()>=due;
}
function isIncomingPending(invite){
  return Boolean(
    invite?.inviteId&&invite?.guestJoinedAt&&!invite?.adminJoinedAt&&
    !invite?.revokedAt&&!invite?.endedAt&&!isExpired(invite)
  );
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

function inviteFromRow(row,current=null){
  return {
    ...(current||{}),
    inviteId:String(row?.id||current?.inviteId||''),
    url:String(current?.url||''),
    expiresAt:String(row?.expires_at||current?.expiresAt||''),
    createdAt:row?.created_at||current?.createdAt||null,
    openedAt:row?.opened_at||current?.openedAt||null,
    guestJoinedAt:row?.guest_joined_at||current?.guestJoinedAt||null,
    adminJoinedAt:row?.admin_joined_at||current?.adminJoinedAt||null,
    revokedAt:row?.revoked_at||current?.revokedAt||null,
    endedAt:row?.ended_at||current?.endedAt||null,
    sendFailed:Boolean(current?.sendFailed),
    adminConnected:Boolean(current?.adminConnected),
  };
}

function mergeInviteRow(contactId,row){
  const key=String(contactId||row?.contact_id||'');
  if(!key)return null;
  const current=invitesByContact.get(key)||null;
  if(current&&String(current.inviteId)!==String(row?.id||'')){
    const currentCreated=Date.parse(String(current.createdAt||''));
    const incomingCreated=Date.parse(String(row?.created_at||''));
    if(Number.isFinite(currentCreated)&&Number.isFinite(incomingCreated)&&currentCreated>incomingCreated)return current;
  }
  const next=inviteFromRow(row,current&&String(current.inviteId)===String(row?.id||'')?current:null);
  invitesByContact.set(key,next);
  document.dispatchEvent(new CustomEvent('v21-call-invite-state',{detail:{contactId:key,invite:{...next}}}));
  return next;
}

function dismissExternal(reason='answered-elsewhere',inviteId=externalCallAdapter?.inviteId){
  const current=externalCallAdapter;
  if(!current||String(current.inviteId)!==String(inviteId||''))return false;
  externalCallAdapter=null;
  acceptingInviteId='';
  callCommand()?.forceReset?.();
  document.dispatchEvent(new CustomEvent('v21-call-invite-incoming-dismissed',{
    detail:{inviteId:String(inviteId||''),reason:String(reason||'answered-elsewhere')}
  }));
  return true;
}

async function acceptExternalCurrent(){
  const adapter=externalCallAdapter;
  if(!adapter||adapter.busy||adapter.phase!=='ringing')return false;
  adapter.busy=true;
  acceptingInviteId=adapter.inviteId;
  callCommand()?.refresh?.();
  callCommand()?.enterConnecting?.(adapter.contactId,adapter.contactName,{
    id:adapter.inviteId,direction:'incoming',source:'guest-link'
  });
  try{
    const ok=await joinInvite({contactId:adapter.contactId});
    if(!ok)throw new Error('livekit_token_failed');
    if(externalCallAdapter!==adapter)return false;
    adapter.busy=false;
    adapter.phase='active';
    adapter.startedAt=new Date().toISOString();
    acceptingInviteId='';
    callCommand()?.enterActive?.(adapter.contactId,adapter.contactName,{
      id:adapter.inviteId,direction:'incoming',source:'guest-link',mediaStartedAt:adapter.startedAt
    });
    return true;
  }catch(error){
    adapter.busy=false;
    acceptingInviteId='';
    externalCallAdapter=null;
    callCommand()?.forceReset?.();
    return false;
  }
}

async function declineExternalCurrent(){
  const adapter=externalCallAdapter;
  if(!adapter||adapter.busy||adapter.phase!=='ringing')return false;
  adapter.busy=true;
  callCommand()?.refresh?.();
  try{await endInvite({contactId:adapter.contactId});}catch{}
  externalCallAdapter=null;
  acceptingInviteId='';
  callCommand()?.forceReset?.();
  return true;
}

async function hangupExternalCurrent({reason='hangup'}={}){
  const adapter=externalCallAdapter;
  if(!adapter||adapter.busy)return false;
  adapter.busy=true;
  callCommand()?.endOptimistic?.(reason);
  try{await endInvite({contactId:adapter.contactId});}catch{}
  externalCallAdapter=null;
  acceptingInviteId='';
  return true;
}

function installCallEngineAdapter(){
  if(nativeCallEngine&&window.V21CallEngine?.__guestInviteAdapter)return true;
  const engine=window.V21CallEngine||null;
  if(!engine?.acceptCurrent||!engine?.rejectCurrent||!engine?.stopCurrent)return false;
  nativeCallEngine=engine;
  window.V21CallEngine=Object.freeze({
    ...engine,
    __guestInviteAdapter:true,
    acceptCurrent:(...args)=>externalCallAdapter?acceptExternalCurrent():nativeCallEngine.acceptCurrent(...args),
    rejectCurrent:(...args)=>externalCallAdapter?declineExternalCurrent():nativeCallEngine.rejectCurrent(...args),
    stopCurrent:(...args)=>externalCallAdapter?hangupExternalCurrent(...args):nativeCallEngine.stopCurrent(...args),
    snapshot(){
      const snap=nativeCallEngine?.snapshot?.()||{};
      if(!externalCallAdapter)return snap;
      return {
        ...snap,
        busy:Boolean(externalCallAdapter.busy),
        guestInvite:{
          inviteId:externalCallAdapter.inviteId,
          contactId:externalCallAdapter.contactId,
          phase:externalCallAdapter.phase,
        },
      };
    },
  });
  return true;
}

function presentIncoming(invite,contactId){
  if(!currentAdmin()||!isIncomingPending(invite))return false;
  const inviteId=String(invite.inviteId||'');
  if(externalCallAdapter?.inviteId===inviteId)return true;
  if(externalCallAdapter)return false;
  if(!installCallEngineAdapter())return false;
  const nativeCall=nativeCallEngine?.snapshot?.().call||null;
  if(nativeCall)return false;
  const name=contactNameFor(contactId);
  const adapter={inviteId,contactId:String(contactId),contactName:name,phase:'ringing',busy:false};
  externalCallAdapter=adapter;
  const received=Boolean(callCommand()?.receiveIncoming?.(contactId,name,{
    id:inviteId,direction:'incoming',source:'guest-link'
  }));
  if(!received){externalCallAdapter=null;return false;}
  document.dispatchEvent(new CustomEvent('v21-call-invite-incoming',{
    detail:{inviteId,contactId:String(contactId),contactName:name}
  }));
  return true;
}

function processInviteRow(row){
  const contactId=String(row?.contact_id||'');
  const invite=mergeInviteRow(contactId,row);
  if(!invite)return null;
  if(isIncomingPending(invite)){
    presentIncoming(invite,contactId);
    return invite;
  }
  if(externalCallAdapter?.inviteId===invite.inviteId){
    if(invite.adminJoinedAt&&!invite.adminConnected&&acceptingInviteId!==invite.inviteId){
      dismissExternal('answered-elsewhere',invite.inviteId);
    }else if(invite.revokedAt||invite.endedAt||isExpired(invite)){
      dismissExternal('invite-ended',invite.inviteId);
    }
  }
  return invite;
}

function watchInvite(contactId,inviteId){
  stopWatch();
  const client=authStore()?.getClient?.();
  if(!client?.channel||!inviteId)return false;
  watchInviteId=String(inviteId);
  watchChannel=client.channel(`call-invite:${watchInviteId}`)
    .on('postgres_changes',{
      event:'UPDATE',schema:'public',table:'chat_call_invites',filter:`id=eq.${watchInviteId}`,
    },payload=>processInviteRow(payload?.new||{}))
    .subscribe();
  return true;
}

function stopIncomingWatch(){
  if(!incomingWatchChannel)return;
  try{incomingWatchChannel.unsubscribe?.();}catch{}
  const client=authStore()?.getClient?.();
  try{client?.removeChannel?.(incomingWatchChannel);}catch{}
  incomingWatchChannel=null;
}

async function reconcileIncomingInvites(){
  if(!currentAdmin())return [];
  const client=authStore()?.getClient?.();
  if(!client?.from)return [];
  const now=new Date().toISOString();
  const {data,error}=await client.from('chat_call_invites')
    .select('id,contact_id,created_at,expires_at,opened_at,guest_joined_at,admin_joined_at,revoked_at,ended_at')
    .not('guest_joined_at','is',null)
    .is('admin_joined_at',null)
    .is('revoked_at',null)
    .is('ended_at',null)
    .gt('expires_at',now)
    .order('guest_joined_at',{ascending:false})
    .limit(10);
  if(error)return [];
  const rows=Array.isArray(data)?data:[];
  for(const row of rows)processInviteRow(row);
  return rows;
}

function startIncomingWatch(){
  stopIncomingWatch();
  if(!currentAdmin())return false;
  const client=authStore()?.getClient?.();
  if(!client?.channel)return false;
  incomingWatchChannel=client.channel('call-invite-incoming')
    .on('postgres_changes',{
      event:'UPDATE',schema:'public',table:'chat_call_invites',
    },payload=>processInviteRow(payload?.new||{}))
    .subscribe();
  void reconcileIncomingInvites();
  return true;
}

async function focusIncomingInvite(inviteId,contactId=''){
  const id=String(inviteId||'').trim();
  if(!id||!currentAdmin())return false;
  installCallEngineAdapter();
  const client=authStore()?.getClient?.();
  if(!client?.from)return false;
  const {data,error}=await client.from('chat_call_invites')
    .select('id,contact_id,created_at,expires_at,opened_at,guest_joined_at,admin_joined_at,revoked_at,ended_at')
    .eq('id',id)
    .maybeSingle();
  if(error||!data)return false;
  const resolvedContactId=String(data.contact_id||contactId||'');
  if(resolvedContactId)window.ChatAppShell?.NavigationCommand?.openContact?.(resolvedContactId);
  const invite=processInviteRow(data);
  return Boolean(invite&&isIncomingPending(invite));
}

async function createAndSend({contactId=targetAccountId}={}){
  const target=String(contactId||'').trim();
  if(!target)throw new Error('contact_required');
  if(!currentAdmin())throw new Error('admin_required');
  const {client,token}=await accessToken();
  const {data,error}=await client.functions.invoke('v21-call-invite-admin',{
    body:{action:'create',contactId:target},headers:{authorization:`Bearer ${token}`},
  });
  if(error)throw error;
  if(!data?.ok||!data?.inviteId||!data?.url)throw new Error(data?.error||'invite_create_failed');

  const invite={
    inviteId:String(data.inviteId),url:String(data.url),expiresAt:String(data.expiresAt||''),createdAt:new Date().toISOString(),
    openedAt:null,guestJoinedAt:null,adminJoinedAt:null,revokedAt:null,endedAt:null,sendFailed:false,adminConnected:false,
  };
  invitesByContact.set(target,invite);
  watchInvite(target,invite.inviteId);
  try{await sendTextLink(invite.url,target);}
  catch(error){
    invite.sendFailed=true;invitesByContact.set(target,invite);
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
  const ok=await session.joinAdmin({inviteId:invite.inviteId,endpoint:ADMIN_ENDPOINT,apiKey:PUBLIC_KEY,accessToken:token});
  if(!ok)throw new Error(session.snapshot?.().error||'livekit_token_failed');
  invite.adminConnected=true;
  invite.adminJoinedAt=invite.adminJoinedAt||new Date().toISOString();
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
  if(invite.adminConnected)return 'Đang nghe';
  if(invite.guestJoinedAt)return 'Khách đang gọi';
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
    busy=Boolean(next);sendButton.disabled=busy;joinButton.disabled=busy;endButton.disabled=busy;
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
    if(busy)return;setBusy(true);
    try{const invite=activeInvite(contactId);if(invite?.sendFailed&&!isExpired(invite))await resendInvite(contactId);else await createAndSend({contactId});}
    catch(error){status.textContent=errorText(error);}finally{setBusy(false);render();}
  });
  joinButton.addEventListener('click',async()=>{
    if(busy)return;setBusy(true);status.textContent='Đang vào phòng…';
    try{await joinInvite({contactId});}catch(error){status.textContent=errorText(error);}finally{setBusy(false);render();}
  });
  endButton.addEventListener('click',async()=>{
    if(busy)return;setBusy(true);
    try{await endInvite({contactId});}catch(error){status.textContent=errorText(error);}finally{setBusy(false);render();}
  });

  const stateListener=event=>{if(String(event?.detail?.contactId||'')===contactId&&host.isConnected)render();};
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
installCallEngineAdapter();
window.setTimeout(installCallEngineAdapter,0);
window.setTimeout(installCallEngineAdapter,250);
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const manage=target?.closest?.('[data-contact-manage]');
  if(!manage)return;
  targetAccountId=String(manage.dataset.contactId||'');
  window.setTimeout(scheduleMount,0);
},true);
new MutationObserver(scheduleMount).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('v21-auth-state',event=>{
  scheduleMount();
  if(event?.detail?.state==='AUTHENTICATED'&&event?.detail?.account?.role==='admin'){
    installCallEngineAdapter();
    startIncomingWatch();
  }else{
    stopIncomingWatch();
    dismissExternal('auth-reset');
  }
});
document.addEventListener('v21-call-invite-push-open',event=>{
  const detail=event?.detail||{};
  void focusIncomingInvite(detail.inviteId,detail.contactId);
});
document.addEventListener('v21-contact-store-change',()=>{
  if(currentAdmin())void reconcileIncomingInvites();
});

if(currentAdmin())startIncomingWatch();

window.TaphoaCallInviteClient=Object.freeze({
  openForContact,createAndSend,resendInvite,joinInvite,endInvite,focusIncomingInvite,reconcileIncomingInvites,
  snapshot:(contactId=targetAccountId)=>activeInvite(contactId),
});
})();
