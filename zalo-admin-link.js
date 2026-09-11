(()=>{
'use strict';

const MODULE_VERSION='V21.73.0';
const mounted=new WeakSet();

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
  if(raw.includes('zalo_already_linked'))return'Tài khoản Zalo này đã được gán';
  if(raw.includes('zalo_not_found'))return'Không tìm thấy tài khoản Zalo';
  if(raw.includes('user_not_found'))return'Không tìm thấy User Chat';
  if(raw.includes('admin_required')||raw.includes('unauthorized'))return'Bạn không có quyền thực hiện';
  return'Không thể cập nhật liên kết Zalo';
}

async function invoke(action,targetAccountId,zaloId=null){
  const client=authStore()?.getClient?.();
  if(!client||!currentAdmin())throw new Error('admin_required');
  const body={action,target_account_id:String(targetAccountId||'')};
  if(zaloId)body.zalo_id=String(zaloId);
  const {data,error}=await client.functions.invoke('v21-zalo-admin',{body});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.code||'zalo_update_failed');
  return data;
}

function avatarNode(contact){
  const avatar=document.createElement('span');
  avatar.className='zalo-admin-avatar';
  const url=String(contact?.avatar_url||'').trim();
  if(url){
    const img=document.createElement('img');
    img.src=url;
    img.alt='';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{img.remove();avatar.textContent=String(contact?.display_name||'Z').trim().charAt(0).toUpperCase()||'Z';},{once:true});
    avatar.appendChild(img);
  }else avatar.textContent=String(contact?.display_name||'Z').trim().charAt(0).toUpperCase()||'Z';
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
      label.textContent='Zalo';
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
      if(linkedElsewhere||linkedHere){
        const state=document.createElement('small');
        state.textContent=linkedElsewhere?'Đã gán':'Đang gán';
        text.appendChild(state);
      }
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

function scan(){
  for(const root of document.querySelectorAll('[data-profile-overlay]'))tryMountProfile(root);
}

const observer=new MutationObserver(scan);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('v21-contact-store-change',scan);
document.addEventListener('v21-auth-state',scan);
scan();

window.V21ZaloAdminLink=Object.freeze({version:MODULE_VERSION,mount,scan});
})();
