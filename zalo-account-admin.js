(()=>{
'use strict';

const MODULE_VERSION='V21.73.0';
const ERRORS={
  invalid_username:'Tên đăng nhập chỉ gồm a-z, 0-9, gạch dưới; dài 3–24 ký tự',
  username_taken:'Tên đăng nhập đã được dùng',
  invalid_display_name:'Tên hiển thị không hợp lệ',
  invalid_password:'Mật khẩu cần từ 6 đến 128 ký tự',
  zalo_not_found:'Không tìm thấy tài khoản Zalo',
  zalo_already_linked:'Tài khoản Zalo này đã được gán',
  user_not_found:'Không tìm thấy User Chat',
  admin_required:'Bạn không có quyền thực hiện',
  unauthorized:'Bạn không có quyền thực hiện',
};

let mountedHost=null;
let root=null;
let snapshot={accounts:[],contacts:[],links:[]};
let busy=false;

function authStore(){return window.V21AuthSessionStore||null;}
function isAdmin(){
  const snap=authStore()?.snapshot?.()||{};
  return snap.state==='AUTHENTICATED'&&snap.account?.role==='admin';
}

async function invoke(body){
  const store=authStore();
  const snap=store?.snapshot?.()||{};
  if(snap.state!=='AUTHENTICATED'||snap.account?.role!=='admin')throw new Error('admin_required');
  const client=store.getClient?.();
  if(!client)throw new Error('unauthorized');
  const {data,error}=await client.functions.invoke('v21-zalo-admin',{body});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.code||'zalo_update_failed');
  return data;
}

function errorText(error){
  const code=String(error?.message||error||'').toLowerCase();
  return ERRORS[code]||'Không thể cập nhật Zalo & tài khoản';
}

function avatarNode(url,name){
  const node=document.createElement('span');
  node.className='zalo-account-avatar';
  const safeUrl=String(url||'').trim();
  if(safeUrl){
    const img=document.createElement('img');
    img.src=safeUrl;
    img.alt='';
    img.loading='lazy';
    img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{img.remove();node.textContent=(String(name||'Z').trim()[0]||'Z').toUpperCase();},{once:true});
    node.appendChild(img);
  }else node.textContent=(String(name||'Z').trim()[0]||'Z').toUpperCase();
  return node;
}

function normalize(){
  const accounts=Array.isArray(snapshot.accounts)?snapshot.accounts:[];
  const contacts=Array.isArray(snapshot.contacts)?snapshot.contacts:[];
  const links=Array.isArray(snapshot.links)?snapshot.links:[];
  const linksByAccount=new Map(links.map(link=>[String(link.chat_account_id),link]));
  const linksByZalo=new Map(links.map(link=>[String(link.zalo_id),link]));
  const contactsById=new Map(contacts.map(contact=>[String(contact.zalo_id),contact]));
  const rows=[];
  for(const account of accounts){
    const link=linksByAccount.get(String(account.id))||null;
    const contact=link?contactsById.get(String(link.zalo_id))||null:null;
    rows.push({kind:'account',account,link,contact,status:link?'Đã kết nối':'Chưa kết nối'});
  }
  for(const contact of contacts){
    if(!linksByZalo.has(String(contact.zalo_id))){
      rows.push({kind:'zalo',account:null,link:null,contact,status:'Chưa có tài khoản Chat'});
    }
  }
  return {rows,contacts,linksByZalo};
}

function setBusy(next){
  busy=Boolean(next);
  if(root)root.dataset.busy=String(busy);
  for(const button of root?.querySelectorAll('button')||[])button.disabled=busy||button.dataset.unavailable==='true';
  for(const input of root?.querySelectorAll('input')||[])input.disabled=busy;
}

function makeContactPicker(accountId,model){
  const wrap=document.createElement('div');
  wrap.className='zalo-account-picker';
  const input=document.createElement('input');
  input.type='search';
  input.placeholder='Tìm tên Zalo';
  input.autocomplete='off';
  const list=document.createElement('div');
  list.className='zalo-account-picker-list';
  wrap.append(input,list);

  const paint=()=>{
    list.replaceChildren();
    const q=String(input.value||'').trim().toLocaleLowerCase('vi');
    const linkedToAccount=snapshot.links?.find(link=>String(link.chat_account_id)===String(accountId));
    for(const contact of model.contacts){
      if(q&&!String(contact.display_name||'').toLocaleLowerCase('vi').includes(q))continue;
      const owner=model.linksByZalo.get(String(contact.zalo_id));
      const linkedHere=Boolean(owner&&String(owner.chat_account_id)===String(accountId));
      const unavailable=Boolean(owner&&!linkedHere);
      const button=document.createElement('button');
      button.type='button';
      button.className='zalo-account-picker-option';
      button.dataset.unavailable=String(unavailable);
      button.disabled=busy||unavailable;
      button.appendChild(avatarNode(contact.avatar_url,contact.display_name));
      const copy=document.createElement('span');
      copy.innerHTML=`<strong></strong><small></small>`;
      copy.querySelector('strong').textContent=String(contact.display_name||'Zalo');
      copy.querySelector('small').textContent=unavailable?'Zalo đã được gán':linkedHere?'Đang kết nối':'Có thể chọn';
      button.appendChild(copy);
      if(!unavailable&&!linkedHere){
        button.addEventListener('click',async()=>{
          if(busy)return;
          setBusy(true);
          try{
            await invoke({action:'link',target_account_id:accountId,zalo_id:contact.zalo_id});
            await refresh();
          }catch(error){window.alert?.(errorText(error));}
          finally{setBusy(false);}
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
    if(linkedToAccount){wrap.dataset.currentZalo=String(linkedToAccount.zalo_id||'');}
  };
  input.addEventListener('input',paint);
  paint();
  return wrap;
}

function makeCreateForm(contact){
  const form=document.createElement('form');
  form.className='zalo-account-create-form';
  form.innerHTML=`
    <label>Tên đăng nhập<input name="username" required autocomplete="off" maxlength="24"></label>
    <label>Tên hiển thị<input name="display_name" required maxlength="50"></label>
    <label>Mật khẩu<input name="password" required type="password" autocomplete="new-password" minlength="6" maxlength="128"></label>
    <label class="zalo-account-check"><input name="use_zalo_avatar" type="checkbox"> Dùng ảnh Zalo</label>
    <div class="zalo-account-create-actions"><button type="submit">Tạo tài khoản</button><button type="button" data-cancel>Hủy</button></div>
    <p class="zalo-account-form-error" hidden></p>`;
  const username=form.elements.namedItem('username');
  const displayName=form.elements.namedItem('display_name');
  const password=form.elements.namedItem('password');
  const useAvatar=form.elements.namedItem('use_zalo_avatar');
  displayName.value=String(contact?.display_name||'').trim();
  useAvatar.checked=Boolean(String(contact?.avatar_url||'').trim());
  form.querySelector('[data-cancel]').addEventListener('click',()=>form.remove());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    const errorNode=form.querySelector('.zalo-account-form-error');
    errorNode.hidden=true;
    setBusy(true);
    try{
      await invoke({
        action:'create_and_link',
        zalo_id:contact.zalo_id,
        username:username.value.trim().replace(/^@/,'').toLowerCase(),
        display_name:displayName.value.trim(),
        password:password.value,
        use_zalo_avatar:useAvatar.checked,
      });
      password.value='';
      await refresh();
    }catch(error){
      password.value='';
      errorNode.textContent=errorText(error);
      errorNode.hidden=false;
    }finally{setBusy(false);}
  });
  return form;
}

function render(){
  if(!root)return;
  const model=normalize();
  const body=root.querySelector('[data-zalo-account-body]');
  body.replaceChildren();
  for(const row of model.rows){
    const card=document.createElement('article');
    card.className='zalo-account-row';
    card.dataset.kind=row.kind;

    const chat=document.createElement('div');
    chat.className='zalo-account-cell zalo-account-chat';
    if(row.account){
      chat.appendChild(avatarNode(row.account.avatar_path,row.account.display_name));
      const copy=document.createElement('span');
      copy.innerHTML='<strong></strong><small></small>';
      copy.querySelector('strong').textContent=String(row.account.display_name||row.account.username||'User');
      copy.querySelector('small').textContent='@'+String(row.account.username||'');
      chat.appendChild(copy);
    }else chat.textContent='—';

    const zalo=document.createElement('div');
    zalo.className='zalo-account-cell zalo-account-zalo';
    if(row.contact){
      zalo.appendChild(avatarNode(row.contact.avatar_url,row.contact.display_name));
      const name=document.createElement('span');
      name.textContent=String(row.contact.display_name||'Zalo');
      zalo.appendChild(name);
    }else zalo.textContent='—';

    const avatar=document.createElement('div');
    avatar.className='zalo-account-cell zalo-account-avatar-cell';
    const avatarUrl=row.account?.avatar_path||row.contact?.avatar_url||'';
    avatar.appendChild(avatarNode(avatarUrl,row.account?.display_name||row.contact?.display_name));

    const status=document.createElement('div');
    status.className='zalo-account-cell zalo-account-status';
    status.textContent=row.status;

    const actions=document.createElement('div');
    actions.className='zalo-account-cell zalo-account-actions';
    if(row.kind==='account'){
      const choose=document.createElement('button');
      choose.type='button';
      choose.textContent=row.link?'Đổi':'Chọn Zalo';
      choose.addEventListener('click',()=>{
        card.querySelector('.zalo-account-picker')?.remove();
        card.appendChild(makeContactPicker(row.account.id,model));
      });
      actions.appendChild(choose);
      if(row.link){
        const unlink=document.createElement('button');
        unlink.type='button';
        unlink.className='danger';
        unlink.textContent='Bỏ liên kết';
        unlink.addEventListener('click',async()=>{
          if(busy)return;
          setBusy(true);
          try{
            await invoke({action:'unlink',target_account_id:row.account.id});
            await refresh();
          }catch(error){window.alert?.(errorText(error));}
          finally{setBusy(false);}
        });
        actions.appendChild(unlink);
      }
    }else{
      const create=document.createElement('button');
      create.type='button';
      create.textContent='Tạo tài khoản';
      create.addEventListener('click',()=>{
        card.querySelector('.zalo-account-create-form')?.remove();
        card.appendChild(makeCreateForm(row.contact));
      });
      actions.appendChild(create);
    }

    card.append(chat,zalo,avatar,status,actions);
    body.appendChild(card);
  }
  if(!model.rows.length){
    const empty=document.createElement('p');
    empty.className='zalo-account-empty';
    empty.textContent='Chưa có dữ liệu tài khoản hoặc Zalo';
    body.appendChild(empty);
  }
  setBusy(false);
}

async function refresh(){
  if(!isAdmin()||!root)return null;
  const data=await invoke({action:'admin_snapshot'});
  snapshot=data?.snapshot||{accounts:[],contacts:[],links:[]};
  render();
  return snapshot;
}

function mount({host}={}){
  if(!isAdmin())return null;
  const target=host||document.querySelector('[data-zalo-account-admin-host]');
  if(!target)return null;
  if(mountedHost===target&&root)return root;
  mountedHost=target;
  target.replaceChildren();
  root=document.createElement('section');
  root.className='zalo-account-admin';
  root.hidden=true;
  root.innerHTML=`
    <div class="zalo-account-head"><div><strong>Zalo & tài khoản</strong><span>Quản lý Chat User ↔ Zalo</span></div><button type="button" data-zalo-account-close>Đóng</button></div>
    <div class="zalo-account-columns" aria-hidden="true"><span>Chat User</span><span>Zalo</span><span>Avatar</span><span>Trạng thái</span><span>Hành động</span></div>
    <div data-zalo-account-body></div>`;
  target.appendChild(root);
  root.querySelector('[data-zalo-account-close]').addEventListener('click',close);
  return root;
}

async function open(){
  if(!root)mount();
  if(!root)return null;
  root.hidden=false;
  setBusy(true);
  try{return await refresh();}
  catch(error){
    const body=root.querySelector('[data-zalo-account-body]');
    body.textContent=errorText(error);
    setBusy(false);
    return null;
  }
}

function close(){if(root)root.hidden=true;}

function autoMount(){
  if(!isAdmin())return;
  mount();
  const button=document.querySelector('[data-zalo-account-admin-open]');
  if(button&&!button.dataset.zaloAccountBound){
    button.dataset.zaloAccountBound='true';
    button.addEventListener('click',()=>void open());
  }
}

document.addEventListener('v21-auth-state',autoMount);
new MutationObserver(autoMount).observe(document.documentElement,{childList:true,subtree:true});
autoMount();

window.V21ZaloAccountAdmin=Object.freeze({version:MODULE_VERSION,mount,refresh,open,close});
})();
