
(()=>{
'use strict';

const RELEASE_VERSION='V21.72.34';
const MODULE_CONTRACT_VERSION='auth-session-v21.72.5';
const SUPABASE_URL='https://gcnoahqsrquxkwkjbuxy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_UY3gfQ9MsntDFCUJ_uV0UA__eTYXz_w';
const AUTH_STORAGE_KEY='taphoa.v21.auth';
const DEVICE_STORAGE_KEY='taphoa.v21.deviceKey';
const HEARTBEAT_MS=15000;

let client=null;
let state='BOOTING';
let account=null;
let appSessionId=null;
let deviceId=null;
let heartbeatId=0;
let busy=false;
let handlingRevoke=false;

function normalizeUsername(value){
  return String(value??'').trim().replace(/^@/,'').toLowerCase();
}

const AVATAR_TYPES=new Set(['image/png','image/jpeg','image/webp']);

function normalizeProfileUsername(value){
  return normalizeUsername(value);
}

function getDeviceKey(){
  let value='';
  try{ value=localStorage.getItem(DEVICE_STORAGE_KEY)||''; }catch{}
  if(!/^[0-9a-f-]{36}$/i.test(value)){
    value=window.V21RuntimeId.create();
    try{ localStorage.setItem(DEVICE_STORAGE_KEY,value); }catch{}
  }
  return value;
}

function deviceLabel(){
  const ua=navigator.userAgent||'';
  if(/iPhone|iPad|iPod/i.test(ua))return 'iPhone/iPad';
  if(/Android/i.test(ua))return 'Android';
  if(/Macintosh|Mac OS X/i.test(ua))return 'Mac';
  if(/Windows/i.test(ua))return 'Windows';
  return 'Trình duyệt';
}

function platformLabel(){
  const ua=navigator.userAgent||'';
  if(/iPhone|iPad|iPod/i.test(ua))return 'ios-web';
  if(/Android/i.test(ua))return 'android-web';
  return 'web';
}

function mapError(error,fallback='unknown'){
  const raw=String(error?.message||error?.code||error||'').toLowerCase();
  if(raw.includes('invalid login credentials')||raw.includes('invalid_credentials'))return 'invalid_credentials';
  if(raw.includes('username_taken')||raw.includes('already registered')||raw.includes('already_registered'))return 'account_exists';
  if(raw.includes('invalid_password')||raw.includes('password'))return 'weak_password';
  if(raw.includes('session_revoked')||raw.includes('account_locked'))return 'session_revoked';
  if(raw.includes('account_not_registered'))return 'invalid_credentials';
  return fallback;
}

function shell(){return window.ChatAppShell||null}
function authUI(){return shell()?.AuthUI||null}


async function syncRealtimeAuth(){
  if(!client)return false;
  try{
    const {data:{session}}=await client.auth.getSession();
    const token=session?.access_token||null;
    if(!token)return false;
    await Promise.resolve(client.realtime.setAuth(token));
    return true;
  }catch{return false;}
}

function setBusy(next){
  busy=Boolean(next);
  const form=document.querySelector('[data-guest-auth-form]');
  if(form)form.setAttribute('aria-busy',String(busy));
  for(const button of document.querySelectorAll('[data-guest-auth-form] button'))button.disabled=busy;
}

function emitAuthState(){
  document.dispatchEvent(new CustomEvent('v21-auth-state',{detail:{state,account:account?{...account}:null,appSessionId,deviceId}}));
}

function renderGuest(){
  state='GUEST'; account=null; appSessionId=null; deviceId=null;
  authUI()?.setAuthenticated(false,null);
  ContactStore.clear();
  emitAuthState();
}

function renderAuthenticated(payload){
  state='AUTHENTICATED';
  account=payload?.account?{...payload.account}:null;
  appSessionId=payload?.session?.app_session_id||payload?.app_session_id||null;
  deviceId=payload?.session?.device_id||payload?.device_id||null;
  authUI()?.setAuthenticated(true,account);
  shell()?.ScreenSession?.restore?.(account);
  const password=document.getElementById('guest-auth-password');
  if(password)password.value='';
  emitAuthState();
}

function clearHeartbeat(){
  if(heartbeatId){window.clearInterval(heartbeatId);heartbeatId=0;}
}


async function handleRevoked(){
  if(handlingRevoke)return;
  handlingRevoke=true;
  state='REVOKED';
  clearHeartbeat();
  const revokedAppSessionId=appSessionId||null;
  window.V21CallEngine?.clearLocal?.('session-revoked');
  // Backend session-revoke trigger has already cleaned any call owned by this
  // appSession, so its persisted pending-END marker is no longer needed.
  if(revokedAppSessionId)window.V21CallEngine?.clearPersistedPendingEnd?.(revokedAppSessionId);
  shell()?.CallCommand?.forceReset?.();
  const revokedAccountId=account?.id||null;
  shell()?.ScreenSession?.clear?.(revokedAccountId);
  if(revokedAccountId)await window.V21SyncEngine?.clearAccount?.(revokedAccountId);
  appSessionId=null; deviceId=null; account=null;
  try{await client?.auth?.signOut({scope:'local'});}catch{}
  renderGuest();
  handlingRevoke=false;
}

async function heartbeat(){
  if(!client||state!=='AUTHENTICATED'||!appSessionId)return false;
  const {data,error}=await client.rpc('v21_auth_heartbeat',{p_app_session_id:appSessionId});
  if(error){
    if(mapError(error)==='session_revoked')await handleRevoked();
    return false;
  }
  if(data?.account){account={...data.account};authUI()?.setAccount(account);}
  return true;
}

function startHeartbeat(){
  clearHeartbeat();
  heartbeatId=window.setInterval(()=>{void heartbeat();},HEARTBEAT_MS);
}


function emitContactStoreChange(reason,changedId=null){
  document.dispatchEvent(new CustomEvent('v21-contact-store-change',{
    detail:{
      reason:String(reason||'update'),
      changedId:changedId==null?null:String(changedId),
      contacts:ContactStore.snapshot()
    }
  }));
}

const ContactStore={
  contacts:[],
  clear(){
    this.contacts=[];
    authUI()?.clearContacts?.();
    emitContactStoreChange('clear');
  },
  replace(items=[]){
    this.contacts=(Array.isArray(items)?items:[]).filter(item=>item&&item.id).map(item=>({...item}));
    authUI()?.renderContacts?.(this.contacts);
    emitContactStoreChange('replace');
    return this.snapshot();
  },
  upsert(item){
    if(!item?.id)return false;
    const index=this.contacts.findIndex(row=>String(row.id)===String(item.id));
    if(index>=0){
      this.contacts[index]={...this.contacts[index],...item};
      if(!authUI()?.patchContact?.(this.contacts[index]))authUI()?.renderContacts?.(this.contacts);
    }else{
      this.contacts.push({...item});
      authUI()?.renderContacts?.(this.contacts);
    }
    emitContactStoreChange(index>=0?'update':'insert',item.id);
    return true;
  },
  remove(id){
    const before=this.contacts.length;
    this.contacts=this.contacts.filter(row=>String(row.id)!==String(id));
    const changed=this.contacts.length!==before;
    if(changed){
      if(!authUI()?.removeContact?.(id))authUI()?.renderContacts?.(this.contacts);
      emitContactStoreChange('remove',id);
    }
    return changed;
  },
  async refresh(){
    if(state!=='AUTHENTICATED'){
      this.clear();
      return [];
    }
    return window.V21SyncEngine?.syncContacts?.()||this.snapshot();
  },
  snapshot(){return this.contacts.map(item=>({...item}));}
};


function avatarUrl(path){
  if(!client||!path)return'';
  try{return client.storage.from('v21-avatars').getPublicUrl(String(path)).data?.publicUrl||'';}catch{return'';}
}

async function uploadAvatar(targetAccountId,file){
  if(!client||!targetAccountId||!file)return null;
  if(!AVATAR_TYPES.has(String(file.type||'').toLowerCase()))throw new Error('invalid_avatar');
  if(Number(file.size)>2*1024*1024)throw new Error('avatar_too_large');
  const ext=String(file.type||'image/webp').split('/')[1]?.replace('jpeg','jpg')||'webp';
  const path=`${String(targetAccountId)}/${Date.now()}-${window.V21RuntimeId.create()}.${ext}`;
  const {error}=await client.storage.from('v21-avatars').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  return path;
}

async function removeAvatar(path){
  if(!client||!path)return false;
  try{const {error}=await client.storage.from('v21-avatars').remove([String(path)]);return !error;}catch{return false;}
}

function profileError(error,fallback='Không thể lưu thay đổi'){
  const raw=String(error?.message||error?.code||error||'').toLowerCase();
  if(raw.includes('invalid_display_name'))return'Tên không hợp lệ';
  if(raw.includes('invalid_username'))return'Tên đăng nhập phải có 3–24 ký tự, chỉ gồm a-z, 0-9 và _';
  if(raw.includes('username_taken'))return'Tên đăng nhập đã được sử dụng';
  if(raw.includes('invalid_password')||raw.includes('password'))return'Mật khẩu tối thiểu 6 ký tự';
  if(raw.includes('avatar_too_large'))return'Ảnh tối đa 2 MB';
  if(raw.includes('invalid_avatar'))return'Chỉ dùng ảnh PNG, JPG hoặc WebP';
  if(raw.includes('admin_required'))return'Bạn không có quyền thực hiện';
  return fallback;
}

async function updateSelf({username,displayName,password='',avatarFile=null}={}){
  if(state!=='AUTHENTICATED'||!account?.id||!appSessionId||!client)return{ok:false,message:'Chưa đăng nhập'};
  let newPath=null;
  const oldPath=account.avatar_path||null;
  const currentUsername=String(account.username||'').toLowerCase();
  const nextUsername=normalizeProfileUsername(username||currentUsername);
  try{
    if(avatarFile)newPath=await uploadAvatar(account.id,avatarFile);
    const body={
      app_session_id:appSessionId,
      username:nextUsername,
      display_name:String(displayName||'').trim(),
      password:password?String(password):undefined
    };
    if(newPath!==null)body.avatar_path=newPath;

    const {data,error}=await client.functions.invoke('v21-account-self',{body});
    if(error)throw error;
    if(!data?.ok)throw new Error(data?.code||'profile_update_failed');

    account={...account,...(data.account||{})};
    authUI()?.setAccount(account);

    if(nextUsername!==currentUsername){
      void client.auth.refreshSession()
        .then(()=>syncRealtimeAuth())
        .catch(()=>false);
    }
    if(newPath&&oldPath&&oldPath!==newPath)void removeAvatar(oldPath);
    document.dispatchEvent(new CustomEvent('v21-account-profile-updated',{detail:{account:{...account}}}));
    void window.V21SyncEngine?.wake?.({reason:'self-profile'});
    return{ok:true,account:{...account}};
  }catch(error){
    if(newPath)void removeAvatar(newPath);
    return{ok:false,message:profileError(error)};
  }
}

async function invokeAdmin(body){
  if(state!=='AUTHENTICATED'||account?.role!=='admin'||!client)return{ok:false,message:'Bạn không có quyền thực hiện'};
  const {data,error}=await client.functions.invoke('v21-account-admin',{body});
  if(error)return{ok:false,message:profileError(error)};
  if(!data?.ok)return{ok:false,message:profileError(data?.code||'admin_update_failed')};
  return{ok:true,account:data.account||null};
}

async function adminSaveUser({targetAccountId,username,displayName,password='',avatarFile=null}={}){
  const target=ContactStore.contacts.find(row=>String(row.id)===String(targetAccountId));
  if(!target||target.role!=='user')return{ok:false,message:'Người dùng không tồn tại'};
  let newPath=null;
  const oldPath=target.avatar_path||null;
  try{
    if(avatarFile)newPath=await uploadAvatar(targetAccountId,avatarFile);
    const result=await invokeAdmin({
      action:'save',
      target_account_id:String(targetAccountId),
      username:String(username||'').trim(),
      display_name:String(displayName||'').trim(),
      avatar_path:newPath===null?undefined:newPath,
      password:password?String(password):undefined
    });
    if(!result.ok){if(newPath)void removeAvatar(newPath);return result;}
    if(result.account)ContactStore.upsert({...target,...result.account});
    if(newPath&&oldPath&&oldPath!==newPath)void removeAvatar(oldPath);
    void window.V21SyncEngine?.wake?.({reason:'admin-profile'});
    return result;
  }catch(error){
    if(newPath)void removeAvatar(newPath);
    return{ok:false,message:profileError(error)};
  }
}

async function adminSetLocked({targetAccountId,locked}={}){
  const target=ContactStore.contacts.find(row=>String(row.id)===String(targetAccountId));
  if(!target||target.role!=='user')return{ok:false,message:'Người dùng không tồn tại'};
  const result=await invokeAdmin({action:'lock',target_account_id:String(targetAccountId),locked:Boolean(locked)});
  if(result.ok&&result.account)ContactStore.upsert({...target,...result.account});
  void window.V21SyncEngine?.wake?.({reason:'admin-lock'});
  return result;
}

async function adminDeleteUser({targetAccountId}={}){
  const target=ContactStore.contacts.find(row=>String(row.id)===String(targetAccountId));
  if(!target||target.role!=='user')return{ok:false,message:'Người dùng không tồn tại'};
  const result=await invokeAdmin({action:'delete',target_account_id:String(targetAccountId)});
  if(result.ok)ContactStore.remove(targetAccountId);
  void window.V21SyncEngine?.wake?.({reason:'admin-delete'});
  return result;
}

const AccountProfileStore={
  version:RELEASE_VERSION,moduleContractVersion:MODULE_CONTRACT_VERSION,
  avatarUrl,updateSelf,adminSaveUser,adminSetLocked,adminDeleteUser,
  snapshot(){return{account:account?{...account}:null,state};}
};

async function bootstrap(){
  if(!client)return false;
  const {data:{session}}=await client.auth.getSession();
  if(!session){renderGuest();return false;}
  const {data,error}=await client.rpc('v21_auth_bootstrap',{
    p_device_key:getDeviceKey(),p_label:deviceLabel(),p_platform:platformLabel()
  });
  if(error){
    await client.auth.signOut({scope:'local'}).catch(()=>{});
    renderGuest();
    return false;
  }
  renderAuthenticated(data);
  startHeartbeat();
  return true;
}

async function login({account:username,password}){
  if(busy||!client)return false;
  setBusy(true);
  try{
    const user=normalizeUsername(username);
    const {error}=await client.auth.signInWithPassword({email:`${user}@taphoa.chat`,password:String(password??'')});
    if(error)throw error;
    const ok=await bootstrap();
    if(!ok)throw new Error('invalid_credentials');
    return true;
  }catch(error){
    authUI()?.setError(mapError(error,'invalid_credentials'));
    return false;
  }finally{setBusy(false);}
}

async function register({name,account:username,password}){
  if(busy||!client)return false;
  setBusy(true);
  try{
    const user=normalizeUsername(username);
    const response=await fetch(`${SUPABASE_URL}/functions/v1/v21-register`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify({username:user,display_name:String(name??'').trim(),password:String(password??'')})
    });
    const payload=await response.json().catch(()=>({ok:false,code:'registration_failed'}));
    if(!response.ok||!payload?.ok){
      const code=payload?.code==='username_taken'?'account_exists':payload?.code;
      authUI()?.setError(code||'registration_failed');
      return false;
    }
    const {error}=await client.auth.signInWithPassword({email:`${user}@taphoa.chat`,password:String(password??'')});
    if(error)throw error;
    const ok=await bootstrap();
    if(!ok)throw new Error('registration_failed');
    return true;
  }catch(error){
    authUI()?.setError(mapError(error,'registration_failed'));
    return false;
  }finally{setBusy(false);}
}

async function logout(){
  if(busy||!client)return false;
  setBusy(true);
  try{
    const logoutAppSessionId=appSessionId||null;
    await window.V21CallEngine?.stopCurrent?.({reason:'logout'});
    window.V21CallEngine?.clearLocal?.('logout');
    shell()?.CallCommand?.forceReset?.();
    const logoutAccountId=account?.id||null;
    shell()?.ScreenSession?.clear?.(logoutAccountId);
    clearHeartbeat();
    if(logoutAccountId)await window.V21SyncEngine?.clearAccount?.(logoutAccountId);

    let serverLogoutConfirmed=false;
    if(logoutAppSessionId){
      try{
        const {error}=await client.rpc('v21_auth_logout',{p_app_session_id:logoutAppSessionId});
        serverLogoutConfirmed=!error;
      }catch{}
    }
    // Once the server confirms revocation, its call-cleanup trigger is the
    // canonical owner of any call that could not be ended before logout.
    if(serverLogoutConfirmed&&logoutAppSessionId){
      window.V21CallEngine?.clearPersistedPendingEnd?.(logoutAppSessionId);
    }

    // Local only: a revoked old browser must never revoke the newer browser's Supabase session.
    await client.auth.signOut({scope:'local'});
    renderGuest();
    return true;
  }finally{setBusy(false);}
}

function initClient(){
  if(!window.supabase?.createClient){
    state='ERROR';
    renderGuest();
    return false;
  }
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:false,
      storageKey:AUTH_STORAGE_KEY
    }
  });

  client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'&&!handlingRevoke){
      clearHeartbeat();
      renderGuest();
    }
    if(event==='TOKEN_REFRESHED'&&state==='AUTHENTICATED'){
      document.dispatchEvent(new CustomEvent('v21-auth-token-refreshed',{detail:{accessToken:session?.access_token||null}}));
      void heartbeat();
    }
  });
  return true;
}

async function boot(){
  state='BOOTING';
  if(!initClient())return false;
  return bootstrap();
}

window.V21ContactStore=ContactStore;
window.V21AccountProfileStore=AccountProfileStore;
window.V21AuthSessionStore={
  version:RELEASE_VERSION,moduleContractVersion:MODULE_CONTRACT_VERSION,
  boot,login,register,logout,heartbeat,syncRealtimeAuth,handleRevoked,
  getClient(){return client;},
  snapshot(){return{state,account:account?{...account}:null,appSessionId,deviceId,busy,deviceKey:getDeviceKey()};}
};

void boot();
})();

