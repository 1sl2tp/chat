// CHAT-418: one explicit "Nhập hàng" action for incoming photos of selected
// supplier contacts. Existing NCC room remains the only invoice reader.
(()=>{'use strict';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
function imageIds(message){
 if(!message?.media||message.sender==='self')return [];
 const m=message.media;
 const entries=m.type==='image'?[m]:
  m.type==='gallery'&&Array.isArray(m.items)?m.items:[];
 return [...new Set(entries.map(item=>String(item?.assetId||'').toLowerCase())
  .filter(id=>uuid.test(id)))].slice(0,12);
}
function sync(node,message){
 const unit=node?.querySelector?.('.message-turn-shell .message-unit');
 if(!unit)return false;
 const id=String(window.V21SyncEngine?.snapshot?.().currentContactId||'');
 const allowed=window.V21NccSources?.selected?.(id)===true;
 const ids=allowed?imageIds(message):[];
 let wrap=unit.querySelector(':scope > .message-ncc-photo-actions');
 if(!ids.length){
  if(wrap){wrap.remove();return true;}
  return false;
 }
 const signature=id+'|'+ids.join('|');
 if(wrap?.dataset?.signature===signature)return false;
 if(!wrap){
  wrap=document.createElement('div');
  wrap.className='message-ncc-photo-actions';
  for(const type of ['click','pointerdown','touchstart'])
   wrap.addEventListener(type,e=>e.stopPropagation());
 }
 wrap.dataset.signature=signature;
 wrap.replaceChildren();
 ids.forEach((assetId,index)=>{
  const line=document.createElement('div');
  line.className='message-ncc-photo-line';
  const btn=document.createElement('button');
  btn.type='button';btn.className='message-ncc-photo-button';
  btn.textContent=ids.length>1?'Đưa ảnh '+(index+1)+' vào Nhập hàng':'Đưa ảnh vào Nhập hàng';
  const status=document.createElement('small');
  status.className='message-ncc-photo-status';
  btn.addEventListener('click',async e=>{
   e.preventDefault();e.stopPropagation();
   if(btn.disabled||!window.V21NccSources?.selected?.(id))return;
   btn.disabled=true;
   status.textContent='Đang chuẩn bị ảnh phiếu nhập…';
   try{
    const ok=await window.V21NccAiRoom?.stageChatImage?.({assetId,contactId:id});
    if(!ok)throw Error('source_unavailable');
    status.textContent='Đã đưa ảnh sang Nhập hàng để kiểm tra';
   }catch(error){
    status.textContent=String(error?.message||'')==='image_unavailable'?
     'Ảnh chưa tải xong. Mở ảnh rồi thử lại.':
     'Chưa mở được phiếu nhập. Thử lại.';
   }finally{btn.disabled=false;}
  });
  line.append(btn,status);wrap.append(line);
 });
 const actions=unit.querySelector(':scope > .message-action-group');
 if(actions)unit.insertBefore(wrap,actions);
 else unit.appendChild(wrap);
 return true;
}
window.V21NccChatImageUI=Object.freeze({sync,imageIds});
})();
