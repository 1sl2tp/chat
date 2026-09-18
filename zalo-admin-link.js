(()=>{
'use strict';

const MODULE_VERSION='V21.73.0';
const mounted=new WeakSet();
let accountModal=null;
let accountSnapshot={accounts:[],contacts:[],links:[]};
let deviceSnapshot=[];
let accountBusy=false;
const ACCOUNT_SETTINGS_OWNER='zalo-account-settings';

function interactionController(){return window.V21InteractionController||null;}
function accountSettingsMode(){return window.V21InteractionMode?.ACCOUNT_SETTINGS||'ACCOUNT_SETTINGS';}
function zaloEndpointKind(contact){
  return String(contact?.thread_type||'user').toLowerCase()==='group'?'Nhóm Zalo':'Zalo cá nhân';
}
function zaloEndpointShort(contact){
  return String(contact?.thread_type||'user').toLowerCase()==='group'?'Nhóm':'Cá nhân';
}

function authStore(){return window.V21AuthSessionStore||null;}
function contactStore(){return window.V21ContactStore||null;}

function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}

function targetFromProfile(root){
  const adminActions=root?.querySelector?.('[data-profile-admin-actions]');
  if(!adminActions||adminActions.hidden||!currentAdmin())return null;
  const username=String(root.querySelector?.('[data-profile-username]')?.value||'').trim().replace(/^@/,'').toLowerCase();
  if(!username)return null;
  const rows=contactStore()?.snapshot?.()||[];
  return rows.find(row=>row?.role==='user'&&String(row.username||'').trim().toLowerCase()===username)||null;
}

function errorText(code){
  const raw=String(code||'').toLowerCase();
  if(raw.includes('invalid_username'))return'Tên đăng nhập chỉ gồm a-z, 0-9, gạch dưới; dài 3–24 ký tự';
  if(raw.includes('username_taken'))return'Tên đăng nhập đã được dùng';
  if(raw.includes('invalid_display_name'))return'Tên hiển thị không hợp lệ';
  if(raw.includes('invalid_password'))return'Mật khẩu cần từ 6 đến 128 ký tự';
  if(raw.includes('zalo_already_linked'))return'Tài khoản Zalo này đã được gán';
  if(raw.includes('zalo_not_found'))return'Không tìm thấy tài khoản Zalo';
  if(raw.includes('user_not_found'))return'Không tìm thấy User Chat';
  if(raw.includes('admin_required')||raw.includes('unauthorized'))return'Bạn không có quyền thực hiện';
  return'Không thể cập nhật Zalo & tài khoản';
}

async function invokeBody(body){
  const client=authStore()?.getClient?.();
  if(!client||!currentAdmin())throw new Error('admin_required');
  const {data,error}=await client.functions.invoke('v21-zalo-admin',{body});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.code||'zalo_update_failed');
  return data;
}

async function invoke(action,targetAccountId,zaloId=null){
  const body={action,target_account_id:String(targetAccountId||'')};
  if(zaloId)body.zalo_id=String(zaloId);
  return invokeBody(body);
}

async function sendAccountCredentials({accountId='',username='',password=''}={}){
  const target=String(accountId||'').trim();
  const user=String(username||'').trim();
  const pass=String(password||'');
  if(!target||!user||!pass)throw new Error('credentials_missing');
  const text=[
    'Thông tin đăng nhập TAPHOA Chat',
    `Tài khoản: ${user}`,
    `Mật khẩu: ${pass}`,
    'Đăng nhập: https://chat.taphoa.xyz',
  ].join('\n');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const state=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`login-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  if(messageStore?.send&&state.ready&&String(state.currentContactId||'')===target){
    await messageStore.send({
      clientId,
      text,
      contactId:target,
      conversationId:state.currentConversationId||null,
      reply:null,
    });
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({clientId,text,contactId:target,conversationId:null,reply:null});
  }
  void sync?.wake?.({reason:'account-credentials-send'});
  return true;
}

function avatarNode(contact){
  const avatar=document.createElement('span');
  avatar.className='zalo-admin-avatar';
  const url=String(contact?.avatar_url||contact?.avatar_path||'').trim();
  const label=String(contact?.display_name||contact?.username||'Z').trim();
  if(url){
    const img=document.createElement('img');
    img.src=url;
    img.alt='';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{img.remove();avatar.textContent=label.charAt(0).toUpperCase()||'Z';},{once:true});
    avatar.appendChild(img);
  }else avatar.textContent=label.charAt(0).toUpperCase()||'Z';
  return avatar;
}

function mount({root,targetAccount}={}){
  if(!root||!targetAccount?.id||mounted.has(root))return null;
  const adminActions=root.querySelector('[data-profile-admin-actions]');
  if(!adminActions||adminActions.hidden||!currentAdmin())return null;
  mounted.add(root);

  const section=document.createElement('section');
  section.className='zalo-admin-link';
  section.dataset.zaloAdminLink='';
  section.innerHTML=`
    <div class="zalo-admin-summary">
      <div class="zalo-admin-copy">
        <strong data-zalo-label>Liên kết Zalo</strong>
        <span data-zalo-value>Đang tải…</span>
      </div>
      <div class="zalo-admin-summary-actions">
        <button type="button" class="zalo-admin-change" data-zalo-change disabled>Chọn</button>
        <button type="button" class="zalo-admin-unlink" data-zalo-unlink hidden>Bỏ liên kết</button>
      </div>
    </div>
    <div class="zalo-admin-picker" data-zalo-picker hidden>
      <label class="zalo-admin-search-wrap">
        <span class="sr-only">Tìm Zalo</span>
        <input type="search" inputmode="search" autocomplete="off" placeholder="Tìm tên Zalo" data-zalo-search>
      </label>
      <div class="zalo-admin-list" data-zalo-list></div>
    </div>
    <p class="zalo-admin-error" data-zalo-error hidden></p>`;
  adminActions.before(section);

  const label=section.querySelector('[data-zalo-label]');
  const value=section.querySelector('[data-zalo-value]');
  const change=section.querySelector('[data-zalo-change]');
  const unlink=section.querySelector('[data-zalo-unlink]');
  const picker=section.querySelector('[data-zalo-picker]');
  const search=section.querySelector('[data-zalo-search]');
  const list=section.querySelector('[data-zalo-list]');
  const errorNode=section.querySelector('[data-zalo-error]');

  let snapshot={link:null,contacts:[]};
  let busy=false;

  function setError(message=''){
    errorNode.textContent=String(message||'');
    errorNode.hidden=!message;
  }

  function setBusy(next){
    busy=Boolean(next);
    section.dataset.busy=String(busy);
    change.disabled=busy;
    unlink.disabled=busy;
    search.disabled=busy;
    for(const button of list.querySelectorAll('button'))button.disabled=busy||button.dataset.unavailable==='true';
  }

  function closePicker(){
    picker.hidden=true;
    search.value='';
  }

  function renderSummary(){
    const link=snapshot?.link||null;
    if(link){
      label.textContent=zaloEndpointKind(link);
      value.textContent=String(link.display_name||'Đã liên kết');
      change.textContent='Đổi';
      unlink.hidden=false;
    }else{
      label.textContent='Liên kết Zalo';
      value.textContent='Chưa liên kết';
      change.textContent='Chọn';
      unlink.hidden=true;
    }
    change.disabled=busy;
  }

  function renderContacts(){
    const query=String(search.value||'').trim().toLocaleLowerCase('vi');
    list.replaceChildren();
    const contacts=(Array.isArray(snapshot?.contacts)?snapshot.contacts:[])
      .filter(contact=>!query||String(contact?.display_name||'').toLocaleLowerCase('vi').includes(query));

    if(!contacts.length){
      const empty=document.createElement('p');
      empty.className='zalo-admin-empty';
      empty.textContent=query?'Không tìm thấy':'Chưa có danh sách Zalo';
      list.appendChild(empty);
      return;
    }

    for(const contact of contacts){
      const linkedElsewhere=Boolean(contact?.linked_chat_account_id&&!contact?.linked_to_target);
      const linkedHere=Boolean(contact?.linked_to_target);
      const button=document.createElement('button');
      button.type='button';
      button.className='zalo-admin-contact';
      button.dataset.zaloId=String(contact?.zalo_id||'');
      button.dataset.unavailable=String(linkedElsewhere);
      if(linkedElsewhere)button.disabled=true;
      button.appendChild(avatarNode(contact));

      const text=document.createElement('span');
      text.className='zalo-admin-contact-copy';
      const name=document.createElement('strong');
      name.textContent=String(contact?.display_name||'Zalo');
      text.appendChild(name);
      const state=document.createElement('small');
      state.textContent=`${zaloEndpointShort(contact)} · ${linkedElsewhere?'Đã gán':linkedHere?'Đang gán':'Có thể chọn'}`;
      text.appendChild(state);
      button.appendChild(text);

      if(!linkedElsewhere){
        button.addEventListener('click',async()=>{
          if(busy||!contact?.zalo_id)return;
          setBusy(true);setError('');
          try{
            await invoke('link',targetAccount.id,contact.zalo_id);
            await refresh();
            closePicker();
          }catch(error){setError(errorText(error?.message||error));}
          finally{setBusy(false);renderSummary();}
        });
      }
      list.appendChild(button);
    }
  }

  async function refresh(){
    const data=await invoke('snapshot',targetAccount.id);
    snapshot=data?.snapshot||{link:null,contacts:[]};
    renderSummary();
    if(!picker.hidden)renderContacts();
    return snapshot;
  }

  change.addEventListener('click',()=>{
    if(busy)return;
    setError('');
    picker.hidden=!picker.hidden;
    if(!picker.hidden){renderContacts();window.setTimeout(()=>search.focus({preventScroll:true}),0);}
  });
  search.addEventListener('input',renderContacts);
  unlink.addEventListener('click',async()=>{
    if(busy||!snapshot?.link)return;
    setBusy(true);setError('');
    try{
      await invoke('unlink',targetAccount.id);
      await refresh();
      closePicker();
    }catch(error){setError(errorText(error?.message||error));}
    finally{setBusy(false);renderSummary();}
  });

  setBusy(true);
  void refresh()
    .catch(error=>{setError(errorText(error?.message||error));value.textContent='Không tải được';})
    .finally(()=>{setBusy(false);renderSummary();});

  return Object.freeze({refresh,close:closePicker});
}

function tryMountProfile(root){
  if(!root||mounted.has(root))return null;
  const target=targetFromProfile(root);
  return target?mount({root,targetAccount:target}):null;
}

function accountModel(){
  const accounts=Array.isArray(accountSnapshot?.accounts)?accountSnapshot.accounts:[];
  const contacts=Array.isArray(accountSnapshot?.contacts)?accountSnapshot.contacts:[];
  const links=Array.isArray(accountSnapshot?.links)?accountSnapshot.links:[];
  const contactsById=new Map(contacts.map(contact=>[String(contact.zalo_id),contact]));
  const linksByAccount=new Map(links.map(link=>[String(link.chat_account_id),link]));
  const linksByZalo=new Map(links.map(link=>[String(link.zalo_id),link]));
  return{accounts,contacts,links,contactsById,linksByAccount,linksByZalo};
}

function setAccountError(message=''){
  const node=accountModal?.querySelector?.('[data-zalo-account-error]');
  if(!node)return;
  node.textContent=String(message||'');
  node.hidden=!message;
}

function setAccountBusy(next){
  accountBusy=Boolean(next);
  if(!accountModal)return;
  accountModal.dataset.busy=String(accountBusy);
  for(const button of accountModal.querySelectorAll('button'))button.disabled=accountBusy||button.dataset.unavailable==='true';
  for(const input of accountModal.querySelectorAll('input'))input.disabled=accountBusy;
}

function closeAccountPanel(){
  const panel=accountModal?.querySelector?.('[data-zalo-account-panel]');
  if(panel)panel.replaceChildren();
}

function normalizeAccountSearch(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLocaleLowerCase('vi')
    .trim();
}

function accountMatchesSearch(account,contact,query){
  if(!query)return true;
  const haystack=normalizeAccountSearch(`${account?.display_name||''} ${account?.username||''} ${contact?.display_name||''}`);
  return haystack.includes(query);
}

function renderAccountRows(){
  const body=accountModal?.querySelector?.('[data-zalo-account-list]');
  if(!body)return;
  body.replaceChildren();
  const model=accountModel();
  const query=normalizeAccountSearch(accountModal?.querySelector?.('[data-zalo-account-search]')?.value||'');

  for(const account of model.accounts){
    const link=model.linksByAccount.get(String(account.id))||null;
    const contact=link?model.contactsById.get(String(link.zalo_id))||null:null;
    if(!accountMatchesSearch(account,contact,query))continue;
    const row=document.createElement('div');
    row.className='zalo-account-row';
    row.dataset.accountId=String(account.id||'');

    const chat=document.createElement('div');
    chat.className='zalo-account-person';
    chat.appendChild(avatarNode(account));
    const chatCopy=document.createElement('span');
    chatCopy.className='zalo-account-person-copy';
    chatCopy.innerHTML='<strong></strong><small></small>';
    chatCopy.querySelector('strong').textContent=String(account.display_name||account.username||'User');
    chatCopy.querySelector('small').textContent='@'+String(account.username||'');
    chat.appendChild(chatCopy);

    const relation=document.createElement('div');
    relation.className='zalo-account-relation';
    if(contact){
      relation.appendChild(avatarNode(contact));
      const copy=document.createElement('span');
      copy.className='zalo-account-person-copy';
      copy.innerHTML='<strong></strong><small></small>';
      copy.querySelector('strong').textContent=String(contact.display_name||'Zalo');
      copy.querySelector('small').textContent=`${zaloEndpointKind(contact)} · Đã kết nối`;
      relation.appendChild(copy);
    }else{
      const copy=document.createElement('span');
      copy.className='zalo-account-person-copy';
      copy.innerHTML='<strong>Chưa kết nối</strong><small>Chưa chọn Zalo</small>';
      relation.appendChild(copy);
    }

    const actions=document.createElement('div');
    actions.className='zalo-account-row-actions';
    const choose=document.createElement('button');
    choose.type='button';
    choose.className='zalo-account-action';
    choose.textContent=link?'Đổi':'Chọn Zalo';
    choose.addEventListener('click',()=>openAccountPicker(account));
    actions.appendChild(choose);
    if(link){
      const unlink=document.createElement('button');
      unlink.type='button';
      unlink.className='zalo-account-action zalo-account-action-danger';
      unlink.textContent='Bỏ liên kết';
      unlink.addEventListener('click',async()=>{
        if(accountBusy)return;
        setAccountBusy(true);setAccountError('');
        try{
          await invokeBody({action:'unlink',target_account_id:String(account.id)});
          await refreshAccountAdmin();
        }catch(error){setAccountError(errorText(error?.message||error));}
        finally{setAccountBusy(false);}
      });
      actions.appendChild(unlink);
    }

    row.append(chat,relation,actions);
    body.appendChild(row);
  }

  for(const contact of model.contacts){
    if(model.linksByZalo.has(String(contact.zalo_id)))continue;
    if(!accountMatchesSearch(null,contact,query))continue;
    const row=document.createElement('div');
    row.className='zalo-account-row zalo-account-row-zalo-only';
    const chat=document.createElement('div');
    chat.className='zalo-account-person zalo-account-missing';
    chat.innerHTML='<span class="zalo-account-person-copy"><strong>Chưa có tài khoản Chat</strong><small>Có thể tạo mới</small></span>';

    const relation=document.createElement('div');
    relation.className='zalo-account-relation';
    relation.appendChild(avatarNode(contact));
    const copy=document.createElement('span');
    copy.className='zalo-account-person-copy';
    copy.innerHTML='<strong></strong><small></small>';
    copy.querySelector('strong').textContent=String(contact.display_name||'Zalo');
    copy.querySelector('small').textContent=`${zaloEndpointKind(contact)} · Chưa được gán`;
    relation.appendChild(copy);

    const actions=document.createElement('div');
    actions.className='zalo-account-row-actions';
    const create=document.createElement('button');
    create.type='button';
    create.className='zalo-account-action';
    create.textContent='Tạo tài khoản';
    create.addEventListener('click',()=>openCreateAccount(contact));
    actions.appendChild(create);
    row.append(chat,relation,actions);
    body.appendChild(row);
  }

  if(!body.childElementCount){
    const empty=document.createElement('p');
    empty.className='zalo-account-empty';
    empty.textContent='Chưa có dữ liệu tài khoản hoặc Zalo';
    body.appendChild(empty);
  }
}

function openAccountPicker(account){
  if(!accountModal||!account?.id)return;
  const panel=accountModal.querySelector('[data-zalo-account-panel]');
  const model=accountModel();
  panel.replaceChildren();
  const box=document.createElement('section');
  box.className='zalo-account-panel';
  box.innerHTML='<div class="zalo-account-panel-head"><strong data-picker-title></strong><button type="button" data-close>Đóng</button></div><input type="search" placeholder="Tìm Zalo cá nhân hoặc nhóm" autocomplete="off" data-search><div class="zalo-account-picker-list" data-list></div>';
  box.querySelector('[data-picker-title]').textContent=`Chọn Zalo cho ${String(account.display_name||account.username||'User')}`;
  panel.appendChild(box);
  box.querySelector('[data-close]').addEventListener('click',closeAccountPanel);
  const search=box.querySelector('[data-search]');
  const list=box.querySelector('[data-list]');
  const paint=()=>{
    list.replaceChildren();
    const query=String(search.value||'').trim().toLocaleLowerCase('vi');
    for(const contact of model.contacts){
      if(query&&!String(contact.display_name||'').toLocaleLowerCase('vi').includes(query))continue;
      const owner=model.linksByZalo.get(String(contact.zalo_id))||null;
      const linkedHere=Boolean(owner&&String(owner.chat_account_id)===String(account.id));
      const unavailable=Boolean(owner&&!linkedHere);
      const button=document.createElement('button');
      button.type='button';
      button.className='zalo-account-picker-option';
      button.dataset.unavailable=String(unavailable||linkedHere);
      button.disabled=accountBusy||unavailable||linkedHere;
      button.appendChild(avatarNode(contact));
      const copy=document.createElement('span');
      copy.className='zalo-account-person-copy';
      copy.innerHTML='<strong></strong><small></small>';
      copy.querySelector('strong').textContent=String(contact.display_name||'Zalo');
      copy.querySelector('small').textContent=`${zaloEndpointShort(contact)} · ${unavailable?'Đã được gán':linkedHere?'Đã kết nối với User này':'Có thể chọn'}`;
      button.appendChild(copy);
      if(!unavailable&&!linkedHere){
        button.addEventListener('click',async()=>{
          if(accountBusy)return;
          setAccountBusy(true);setAccountError('');
          try{
            await invokeBody({action:'link',target_account_id:String(account.id),zalo_id:String(contact.zalo_id)});
            await refreshAccountAdmin();
            closeAccountPanel();
          }catch(error){setAccountError(errorText(error?.message||error));}
          finally{setAccountBusy(false);}
        });
      }
      list.appendChild(button);
    }
    if(!list.childElementCount){
      const empty=document.createElement('p');
      empty.className='zalo-account-empty';
      empty.textContent='Không tìm thấy';
      list.appendChild(empty);
    }
  };
  search.addEventListener('input',paint);
  paint();
  window.setTimeout(()=>search.focus({preventScroll:true}),0);
}

function openCreateAccount(contact){
  if(!accountModal||!contact?.zalo_id)return;
  const panel=accountModal.querySelector('[data-zalo-account-panel]');
  panel.replaceChildren();
  const form=document.createElement('form');
  form.className='zalo-account-panel zalo-account-create-form';
  form.innerHTML=`
    <div class="zalo-account-panel-head"><strong data-create-title></strong><button type="button" data-close>Đóng</button></div>
    <label>Tên đăng nhập<input name="username" required autocomplete="off" maxlength="24"></label>
    <label>Tên hiển thị<input name="display_name" required maxlength="50"></label>
    <label>Mật khẩu<input name="password" required type="password" autocomplete="new-password" minlength="6" maxlength="128"></label>
    <label class="zalo-account-check"><input name="use_zalo_avatar" type="checkbox"> Dùng ảnh Zalo</label>
    <label class="zalo-account-check"><input name="send_credentials" type="checkbox" data-send-credentials checked> Gửi user/pass vào chat</label>
    <button type="submit" class="zalo-account-create-submit">Tạo tài khoản</button>`;
  form.querySelector('[data-create-title]').textContent=`Tạo tài khoản từ ${String(contact.display_name||'Zalo')}`;
  panel.appendChild(form);
  form.querySelector('[data-close]').addEventListener('click',closeAccountPanel);
  const username=form.elements.namedItem('username');
  const displayName=form.elements.namedItem('display_name');
  const password=form.elements.namedItem('password');
  const useAvatar=form.elements.namedItem('use_zalo_avatar');
  const sendCredentials=form.elements.namedItem('send_credentials');
  const submit=form.querySelector('.zalo-account-create-submit');
  let createdCredentials=null;
  displayName.value=String(contact.display_name||'').trim();
  useAvatar.checked=Boolean(String(contact.avatar_url||'').trim());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(accountBusy)return;
    setAccountBusy(true);setAccountError('');
    try{
      const plainPassword=String(password.value||'');
      if(createdCredentials){
        await sendAccountCredentials({...createdCredentials,password:plainPassword});
        password.value='';
        await refreshAccountAdmin();
        closeAccountPanel();
        return;
      }
      const normalizedUsername=String(username.value||'').trim().replace(/^@/,'').toLowerCase();
      const result=await invokeBody({
        action:'create_and_link',
        zalo_id:String(contact.zalo_id),
        username:normalizedUsername,
        display_name:String(displayName.value||'').trim(),
        password:plainPassword,
        use_zalo_avatar:Boolean(useAvatar.checked),
      });
      createdCredentials={
        accountId:String(result?.account?.id||''),
        username:String(result?.account?.username||normalizedUsername),
      };
      if(sendCredentials?.checked){
        try{
          await sendAccountCredentials({...createdCredentials,password:plainPassword});
        }catch{
          username.disabled=true;
          displayName.disabled=true;
          useAvatar.disabled=true;
          sendCredentials.disabled=true;
          if(submit)submit.textContent='Gửi lại user/pass';
          setAccountError('Tài khoản đã tạo. Chưa gửi được user/pass; bấm Gửi lại user/pass để thử lại.');
          return;
        }
      }
      password.value='';
      await refreshAccountAdmin();
      closeAccountPanel();
    }catch(error){
      if(!createdCredentials)password.value='';
      setAccountError(errorText(error?.message||error));
    }finally{setAccountBusy(false);}
  });
  window.setTimeout(()=>username.focus({preventScroll:true}),0);
}

function renderAccountRowsPreservingScroll(){
  const scrollHost=accountModal?.querySelector?.('[data-zalo-account-list]');
  const scrollTop=scrollHost?.scrollTop||0;
  renderAccountRows();
  if(scrollHost)scrollHost.scrollTop=scrollTop;
}

async function refreshAccountAdmin(){
  const data=await invokeBody({action:'admin_snapshot'});
  accountSnapshot=data?.snapshot||{accounts:[],contacts:[],links:[]};
  renderAccountRowsPreservingScroll();
  return accountSnapshot;
}

function closeAccountAdmin(){
  accountModal?.remove?.();
  accountModal=null;
  accountSnapshot={accounts:[],contacts:[],links:[]};
  deviceSnapshot=[];
  accountBusy=false;
  interactionController()?.exit?.(accountSettingsMode(),{owner:ACCOUNT_SETTINGS_OWNER});
}

function deviceStatusText(device){
  const status=String(device?.status||'');
  if(device?.current_device)return'Thiết bị này · đang hoạt động';
  if(status==='pending')return'Chờ duyệt';
  if(status==='revoked')return'Đã thu hồi';
  if(Number(device?.active_sessions)>0)return'Đã duyệt · đang hoạt động';
  return'Đã duyệt';
}

function formatDeviceSeen(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  return date.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function paintAdminDeviceSetting(){
  if(!accountModal)return;
  const status=accountModal.querySelector('[data-admin-device-status]');
  if(!status)return;
  const pending=deviceSnapshot.filter(item=>item?.status==='pending').length;
  const active=deviceSnapshot.filter(item=>Number(item?.active_sessions)>0).length;
  status.textContent=pending>0
    ?`${pending} thiết bị chờ duyệt · ${active} đang hoạt động`
    :`${deviceSnapshot.length} thiết bị đã đăng ký · ${active} đang hoạt động`;
}

async function refreshAdminDevices(){
  const client=authStore()?.getClient?.();
  const snap=authStore()?.snapshot?.()||{};
  if(!client||!currentAdmin()||!snap.appSessionId)throw new Error('admin_required');
  const {data,error}=await client.rpc('v21_admin_devices_list',{p_app_session_id:String(snap.appSessionId)});
  if(error)throw error;
  deviceSnapshot=Array.isArray(data)?data:[];
  paintAdminDeviceSetting();
  return deviceSnapshot;
}

async function runDeviceAction(device,action){
  const client=authStore()?.getClient?.();
  const snap=authStore()?.snapshot?.()||{};
  if(!client||!snap.appSessionId||!device?.id)throw new Error('admin_required');
  const rpc=action==='revoke'?'v21_admin_device_revoke':'v21_admin_device_approve';
  const {error}=await client.rpc(rpc,{
    p_app_session_id:String(snap.appSessionId),
    p_device_id:String(device.id)
  });
  if(error)throw error;
  await refreshAdminDevices();
  return true;
}

function openDevicePanel(){
  if(!accountModal)return;
  const panel=accountModal.querySelector('[data-zalo-account-panel]');
  panel.replaceChildren();
  const box=document.createElement('section');
  box.className='zalo-account-panel';
  box.innerHTML='<div class="zalo-account-panel-head"><strong>Thiết bị Admin</strong><button type="button" data-close>Đóng</button></div><div class="zalo-account-picker-list" data-device-list></div><p class="zalo-account-error" data-device-error hidden></p>';
  panel.appendChild(box);
  box.querySelector('[data-close]').addEventListener('click',closeAccountPanel);
  const list=box.querySelector('[data-device-list]');
  const errorNode=box.querySelector('[data-device-error]');

  const paint=()=>{
    list.replaceChildren();
    for(const device of deviceSnapshot){
      const row=document.createElement('div');
      row.className='zalo-account-row';
      const copy=document.createElement('div');
      copy.className='zalo-account-person-copy';
      const name=document.createElement('strong');
      name.textContent=String(device?.label||'Thiết bị');
      const meta=document.createElement('small');
      const seen=formatDeviceSeen(device?.last_seen_at);
      meta.textContent=`${deviceStatusText(device)}${seen?` · ${seen}`:''}`;
      copy.append(name,meta);

      const relation=document.createElement('div');
      relation.className='zalo-account-relation';
      const platform=document.createElement('span');
      platform.className='zalo-account-person-copy';
      platform.innerHTML='<strong></strong><small></small>';
      platform.querySelector('strong').textContent=String(device?.platform||'web');
      platform.querySelector('small').textContent=String(device?.status||'approved')==='pending'?'Chưa được phép đăng nhập':'';
      relation.appendChild(platform);

      const actions=document.createElement('div');
      actions.className='zalo-account-row-actions';
      if(!device?.current_device){
        const button=document.createElement('button');
        button.type='button';
        button.className='zalo-account-action';
        const needsApprove=String(device?.status||'')!=='approved';
        button.textContent=needsApprove?'Duyệt':'Thu hồi';
        if(!needsApprove)button.classList.add('zalo-account-action-danger');
        button.addEventListener('click',async()=>{
          if(accountBusy)return;
          setAccountBusy(true);
          errorNode.hidden=true;
          try{
            await runDeviceAction(device,needsApprove?'approve':'revoke');
            paint();
          }catch(error){
            errorNode.textContent=String(error?.message||'Không thể cập nhật thiết bị');
            errorNode.hidden=false;
          }finally{setAccountBusy(false);}
        });
        actions.appendChild(button);
      }
      row.append(copy,relation,actions);
      list.appendChild(row);
    }
    if(!list.childElementCount){
      const empty=document.createElement('p');
      empty.className='zalo-account-empty';
      empty.textContent='Chưa có thiết bị';
      list.appendChild(empty);
    }
  };

  void refreshAdminDevices().then(paint).catch(error=>{
    errorNode.textContent=String(error?.message||'Không thể tải thiết bị');
    errorNode.hidden=false;
  });
}

function adminPushView(snapshot={}){
  const code=String(snapshot?.code||'');
  if(code==='ios_install_required')return{status:'Cài TAPHOA Chat ra Màn hình chính để nhận thông báo nền',action:'',mode:'none'};
  if(code==='unsupported'||snapshot?.supported===false)return{status:'Thiết bị này không hỗ trợ',action:'',mode:'none'};
  if(code==='blocked')return{status:'Thông báo bị chặn',action:'',mode:'none'};
  if(snapshot?.enabled)return{status:'Đã bật thông báo',action:'Tắt thông báo',mode:'disable'};
  return{status:'Bật thông báo',action:'Bật thông báo',mode:'enable'};
}

function paintAdminPushSetting(snapshot={}){
  if(!accountModal)return;
  const setting=accountModal.querySelector('[data-admin-push-setting]');
  const statusNode=setting?.querySelector?.('[data-admin-push-status]');
  const action=setting?.querySelector?.('[data-admin-push-action]');
  if(!setting||!statusNode||!action)return;
  const view=adminPushView(snapshot);
  statusNode.textContent=view.status;
  action.textContent=view.action||'Bật thông báo';
  action.dataset.mode=view.mode;
  action.hidden=view.mode==='none';
  action.disabled=false;
  setting.dataset.state=String(snapshot?.code||view.mode||'idle');
}

async function refreshAdminPushSetting(){
  const push=window.V21AdminPush;
  if(!push?.status){
    paintAdminPushSetting({supported:false,code:'unsupported'});
    return null;
  }
  try{
    const snapshot=await push.status();
    paintAdminPushSetting(snapshot);
    return snapshot;
  }catch{
    paintAdminPushSetting({supported:false,code:'unsupported'});
    return null;
  }
}

async function runAdminPushAction(button){
  const push=window.V21AdminPush;
  if(!push||!button||button.disabled)return;
  button.disabled=true;
  const mode=String(button.dataset.mode||'enable');
  try{
    const snapshot=mode==='disable'?await push.disable():await push.enable();
    paintAdminPushSetting(snapshot);
  }catch{
    await refreshAdminPushSetting();
  }finally{
    if(button.isConnected)button.disabled=false;
  }
}

async function openAccountAdmin(){
  if(!currentAdmin())return null;
  closeAccountAdmin();
  const controller=interactionController();
  const lease=controller?.enter?.(accountSettingsMode(),{owner:ACCOUNT_SETTINGS_OWNER,lockBaseUi:true});
  if(controller&&!lease)return null;
  const host=document.querySelector('[data-global-overlay-root]')||document.body;
  accountModal=document.createElement('div');
  accountModal.className='zalo-account-modal';
  accountModal.dataset.zaloAccountAdminModal='';
  accountModal.innerHTML=`
    <button type="button" class="zalo-account-backdrop" aria-label="Đóng"></button>
    <section class="zalo-account-card" role="dialog" aria-modal="true" aria-labelledby="zalo-account-title">
      <header class="zalo-account-modal-head"><div><h2 id="zalo-account-title">Cài đặt tài khoản</h2><p>Zalo · Thông báo · Thiết bị</p></div><button type="button" class="zalo-account-close" aria-label="Đóng"></button></header>
      <div class="zalo-account-notification" data-admin-push-setting>
        <span class="zalo-account-notification-copy"><strong>Thông báo</strong><small data-admin-push-status>Bật thông báo</small></span>
        <button type="button" class="zalo-account-notification-action" data-admin-push-action data-mode="enable">Bật thông báo</button>
      </div>
      <div class="zalo-account-notification" data-admin-device-setting>
        <span class="zalo-account-notification-copy"><strong>Thiết bị</strong><small data-admin-device-status>Đang tải thiết bị…</small></span>
        <button type="button" class="zalo-account-notification-action" data-admin-device-open>Quản lý</button>
      </div>
      <label class="zalo-account-search"><span class="sr-only">Tìm tài khoản</span><input type="search" autocomplete="off" inputmode="search" placeholder="Tìm Chat, @username, Zalo hoặc nhóm" data-zalo-account-search></label>
      <p class="zalo-account-error" data-zalo-account-error hidden></p>
      <div class="zalo-account-list" data-zalo-account-list></div>
      <div class="zalo-account-submodal" data-zalo-account-panel></div>
    </section>`;
  host.appendChild(accountModal);
  const modalClose=accountModal.querySelector('.zalo-account-close');
  if(modalClose)modalClose.innerHTML=window.V21Icons?.markup?.('close',{size:20})||'×';
  accountModal.querySelector('.zalo-account-backdrop').addEventListener('click',closeAccountAdmin);
  accountModal.querySelector('.zalo-account-close').addEventListener('click',closeAccountAdmin);
  const pushAction=accountModal.querySelector('[data-admin-push-action]');
  pushAction?.addEventListener('click',()=>void runAdminPushAction(pushAction));
  const deviceAction=accountModal.querySelector('[data-admin-device-open]');
  deviceAction?.addEventListener('click',openDevicePanel);
  const search=accountModal.querySelector('[data-zalo-account-search]');
  search?.addEventListener('input',()=>{
    renderAccountRows();
    const list=accountModal?.querySelector?.('[data-zalo-account-list]');
    if(list)list.scrollTop=0;
  });
  void refreshAdminPushSetting();
  void refreshAdminDevices().catch(()=>{paintAdminDeviceSetting();});
  const submodal=accountModal.querySelector('[data-zalo-account-panel]');
  submodal.addEventListener('click',event=>{if(event.target===submodal)closeAccountPanel();});
  setAccountBusy(true);
  try{await refreshAccountAdmin();}
  catch(error){setAccountError(errorText(error?.message||error));}
  finally{setAccountBusy(false);}
  return accountModal;
}

function syncAccountAdminButton(){
  const footer=document.querySelector('[data-sidebar-account-footer]');
  if(!footer)return;
  let button=footer.querySelector('[data-zalo-account-admin-open]');
  if(!currentAdmin()){
    button?.remove?.();
    closeAccountAdmin();
    return;
  }
  if(button)return;
  button=document.createElement('button');
  button.type='button';
  button.className='zalo-account-admin-open';
  button.dataset.zaloAccountAdminOpen='';
  button.textContent='Cài đặt';
  button.setAttribute('aria-label','Cài đặt tài khoản');
  button.addEventListener('click',()=>void openAccountAdmin());
  const authAction=footer.querySelector('.shell-sidebar-account-action');
  footer.insertBefore(button,authAction||null);
}

function scan(){
  for(const root of document.querySelectorAll('[data-profile-overlay]'))tryMountProfile(root);
  syncAccountAdminButton();
}

const observer=new MutationObserver(scan);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('v21-contact-store-change',scan);
document.addEventListener('v21-auth-state',scan);
scan();

window.V21ZaloAccountAdmin=Object.freeze({version:MODULE_VERSION,open:openAccountAdmin,close:closeAccountAdmin,refresh:refreshAccountAdmin});
window.V21ZaloAdminLink=Object.freeze({version:MODULE_VERSION,mount,scan});
})();

void import('./contact-directory-admin.js').catch(error=>console.warn('[contact-directory-admin]',error));