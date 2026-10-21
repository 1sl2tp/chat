(()=>{
'use strict';
// Customer Photos is an on-demand view of already synchronized Chat media.
// Work's implementation and database are deliberately left untouched.
const host=document.getElementById('customerPhotoLibrary');
if(!host)return;
let generation=0,moreCount=60,records=[],observer=null,refreshTimer=0;
const objectUrls=new Map();
const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const auth=()=>window.V21AuthSessionStore?.snapshot?.()||{};
const current=()=>window.ChatAppShell?.snapshot?.()||{};
function release(){
  observer?.disconnect();observer=null;
  for(const src of objectUrls.values())URL.revokeObjectURL(src);
  objectUrls.clear();
}
function layout(){
  if(host.hidden)return;
  const header=document.getElementById('regionTop')?.getBoundingClientRect();
  const pane=document.getElementById('scrollRoot')?.getBoundingClientRect();
  if(!pane)return;
  const top=Math.max(pane.top,header?.bottom||pane.top);
  host.style.top=top+'px';
  host.style.left=pane.left+'px';
  host.style.width=pane.width+'px';
  host.style.height=Math.max(0,pane.bottom-top)+'px';
}
function imageMeta(row,conversationId){
  const meta=row?.remote_meta||{};
  const kind=String(meta.kind||'');
  const mime=String(meta.mime_type||row?.mime_type||'');
  return !meta.deleted_at&&String(meta.conversation_id||'')===conversationId&&
    (kind==='image'||mime.startsWith('image/'))&&Boolean(meta.id||row.asset_id);
}
function photoItems(rows,conversationId,accountId){
  return (Array.isArray(rows)?rows:[])
    .filter(row=>imageMeta(row,conversationId))
    .map(row=>({
      id:String(row.remote_meta?.id||row.asset_id),
      accountId:String(accountId),
      messageId:String(row.remote_meta?.message_id||''),
      createdAt:Date.parse(row.remote_meta?.created_at||'')||0,
      senderKey:String(row.remote_meta?.owner_account_id||'')===String(accountId)?'self':'remote',
      width:Number(row.remote_meta?.width_px)||null,
      height:Number(row.remote_meta?.height_px)||null
    }))
    .sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
}
// Media creation time is only a fallback. Prefer the original Chat message
// timestamp from local IndexedDB, with no network pull or new photo storage.
async function resolveMessageTimes(items,accountId){
  const getMessage=window.V21CacheStore?.getMessage;
  if(typeof getMessage!=='function')return items;
  const ids=[...new Set(items.map(item=>item.messageId).filter(Boolean))];
  const timestamps=new Map();
  for(let i=0;i<ids.length;i+=24){
    await Promise.all(ids.slice(i,i+24).map(async messageId=>{
      try{
        const message=await getMessage(accountId,messageId);
        const sentAt=Date.parse(String(message?.created_at||''));
        if(Number.isFinite(sentAt)&&sentAt>0)timestamps.set(messageId,sentAt);
      }catch{} // Archived media may outlive its locally cached message.
    }));
  }
  for(const item of items){
    if(timestamps.has(item.messageId))item.createdAt=timestamps.get(item.messageId);
  }
  return items.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
}
function dateLabel(ms){
  if(!ms)return 'Không rõ ngày';
  try{return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms));}
  catch{return 'Không rõ ngày';}
}
function allViewerItems(){
  return records.map(item=>({
    assetId:item.id,accountId:item.accountId,messageId:item.messageId,
    senderKey:item.senderKey,createdAt:item.createdAt,width:item.width,height:item.height
  }));
}
async function hydrate(button,item,token){
  const img=button.querySelector('img');
  if(!img||token!==generation||host.hidden)return;
  try{
    let media=await window.V21MediaCache?.get?.({accountId:item.accountId,assetId:item.id});
    if(!(media?.blob instanceof Blob)){
      media=await window.V21SyncEngine?.ensureMediaRemote?.({
        accountId:item.accountId,assetId:item.id
      })||media;
    }
    if(token!==generation||host.hidden||!button.isConnected)return;
    if(!(media?.blob instanceof Blob)){button.dataset.failed='true';return;}
    const src=URL.createObjectURL(media.blob);
    const prior=objectUrls.get(item.id);
    if(prior&&prior!==src)URL.revokeObjectURL(prior);
    objectUrls.set(item.id,src);
    img.src=src;
    button.dataset.ready='true';
  }catch{if(button.isConnected)button.dataset.failed='true';}
}
function appendTiles(grid,items,token){
  if(typeof IntersectionObserver!=='undefined'&&!observer){
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        observer.unobserve(entry.target);
        const item=entry.target._photoItem;
        if(item)void hydrate(entry.target,item,token);
      }
    },{root:host,rootMargin:'150px'});
  }
  let label='';
  for(const item of items){
    const day=dateLabel(item.createdAt);
    if(day!==label){
      label=day;
      grid.appendChild(el('h3','customer-photo-day',day));
    }
    const button=el('button','customer-photo-tile');
    button.type='button';
    button.setAttribute('aria-label','Xem ảnh ngày '+day);
    button._photoItem=item;
    const img=el('img');
    img.alt='';
    img.loading='lazy';img.decoding='async';
    button.appendChild(img);
    button.addEventListener('click',()=>window.V21ChatImageViewer?.open?.({
      assetId:item.id,accountId:item.accountId,messageId:item.messageId,
      items:allViewerItems()
    }));
    grid.appendChild(button);
    if(observer)observer.observe(button);
    else if(grid.childElementCount<=15)void hydrate(button,item,token);
  }
}
async function render(){
  const token=++generation;
  release();
  host.replaceChildren();
  if(current().route!=='photos'){host.hidden=true;return;}
  host.hidden=false;
  layout();
  const acct=auth();
  const accountId=String(acct.account?.id||'');
  const contact=current().activeContact;
  const heading=el('header','customer-photo-header');
  const title=el('div','customer-photo-title');
  title.appendChild(el('strong','', 'Ảnh của '+String(contact?.name||'khách hàng')));
  const caption=el('span','customer-photo-caption','Ảnh đã đồng bộ trong Chat');
  title.appendChild(caption);
  const close=el('button','customer-photo-back','Trò chuyện');
  close.type='button';
  close.addEventListener('click',()=>window.ChatAppShell?.NavigationCommand?.openChat?.());
  heading.append(title,close);
  host.appendChild(heading);
  if(acct.state!=='AUTHENTICATED'||!accountId||!contact?.id){
    host.appendChild(el('p','customer-photo-empty','Chọn một khách hàng trong Danh bạ để xem ảnh.'));
    return;
  }
  const contactRow=(window.V21ContactStore?.snapshot?.()||[])
    .find(row=>String(row?.id||'')===String(contact.id));
  const conversationId=String(contactRow?.conversation_id||'');
  if(!conversationId){
    host.appendChild(el('p','customer-photo-empty','Đang chờ hội thoại được đồng bộ. Hãy mở tin nhắn của khách hàng trước.'));
    return;
  }
  const loading=el('p','customer-photo-empty','Đang đọc thư viện ảnh…');
  host.appendChild(loading);
  try{
    const rows=await window.V21CacheStore?.listMediaRecords?.(accountId)||[];
    if(token!==generation||host.hidden||
      String(current().activeContact?.id||'')!==String(contact.id))return;
    const sorted=await resolveMessageTimes(photoItems(rows,conversationId,accountId),accountId);
    if(token!==generation||host.hidden||String(current().activeContact?.id||'')!==String(contact.id))return;
    records=sorted;
    loading.remove();
    caption.textContent=records.length+' ảnh đã đồng bộ';
    if(!records.length){
      host.appendChild(el('p','customer-photo-empty','Chưa tìm thấy ảnh đã đồng bộ của khách hàng này. Ảnh cũ sẽ xuất hiện khi lịch sử hội thoại được tải.'));
      return;
    }
    const grid=el('div','customer-photo-grid');
    host.appendChild(grid);
    appendTiles(grid,records.slice(0,moreCount),token);
    if(moreCount<records.length){
      const more=el('button','customer-photo-more','Xem thêm ảnh');
      more.type='button';
      more.addEventListener('click',()=>{
        moreCount+=60;
        void render();
      });
      host.appendChild(more);
    }
  }catch{
    loading.textContent='Không đọc được ảnh đã lưu trên thiết bị. Vui lòng mở lại Chat.';
  }
}
function switchView(){
  const show=current().route==='photos';
  if(!show){generation++;release();host.hidden=true;host.replaceChildren();return;}
  moreCount=60;
  void render();
}
document.addEventListener('navigation-change',switchView);
document.addEventListener('v21-active-contact-change',()=>{
  if(current().route==='photos'){moreCount=60;void render();}
});
document.addEventListener('v21-auth-state',()=>{
  if(current().route==='photos')void render();
  else {generation++;release();}
});
document.addEventListener('v21-media-ready',()=>{
  if(current().route!=='photos'||refreshTimer)return;
  refreshTimer=setTimeout(()=>{refreshTimer=0;if(current().route==='photos')void render();},600);
});
document.addEventListener('v21-media-removed',()=>{
  if(current().route==='photos')void render();
});
window.addEventListener('resize',layout,{passive:true});
window.visualViewport?.addEventListener('resize',layout,{passive:true});
window.V21CustomerPhotos=Object.freeze({open:()=>window.ChatAppShell?.NavigationCommand?.openPhotos?.(),refresh:render,photoItems});
switchView();
})();
