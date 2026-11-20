// CHAT-409: sender-neutral, admin-only OCR affordance under an inbound image.
// No image overlays, no automatic scanning, no message-store mutations.
(()=>{'use strict';
function assets(message){
 if(!message?.media||message.sender==='self')return [];
 const media=message.media;
 const list=media.type==='image'?[media]:
  media.type==='gallery'&&Array.isArray(media.items)?media.items:[];
 return [...new Set(list.map(x=>String(x?.assetId||'').toLowerCase())
  .filter(x=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(x)))].slice(0,12);
}
function reads(message){
 const reader=window.V21ChatStockImageRead;
 return assets(message).map(id=>reader?.peek?.(id)).filter(Boolean);
}
function sync(node,message,onRead){
 const unit=node?.querySelector?.('.message-turn-shell .message-unit');
 if(!unit)return false;
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const reader=window.V21ChatStockImageRead;
 const ids=auth.state==='AUTHENTICATED'&&auth.account?.role==='admin'&&
  reader?.owner?.()?assets(message):[];
 let wrap=unit.querySelector(':scope > .message-stock-image-read');
 if(!ids.length){if(wrap){wrap.remove();return true;}return false;}
 const capability=reader.availability?.();
 if(capability==null)void reader.checkReady?.();
 const identity=ids.join('|');
 if(wrap&&wrap.dataset.assetKeys===identity){
  for(const button of wrap.querySelectorAll('button[data-stock-image-id]')){
   const result=reader.peek(button.dataset.stockImageId);
   button.disabled=Boolean(result)||capability!==true;
   button.textContent=result?
    result.status==='read'?'Đã đọc chữ · Xem cuối ngày':'Ảnh không phải danh sách · Đã soát':
    capability===false?'Chưa triển khai bộ đọc ảnh':
    capability==null?'Đang kiểm tra bộ đọc ảnh…':'Đọc chữ hàng trong ảnh';
  }
  return false;
 }
 if(!wrap){
  wrap=document.createElement('div');
  wrap.className='message-stock-image-read';
  for(const kind of ['click','pointerdown','touchstart'])wrap.addEventListener(kind,e=>e.stopPropagation());
 }
 wrap.dataset.assetKeys=identity;
 wrap.replaceChildren();
 ids.forEach((assetId,index)=>{
  const entry=document.createElement('div');
  entry.className='message-stock-image-read-row';
  const button=document.createElement('button');
  button.type='button';
  button.className='message-stock-image-read-button';
  button.dataset.stockImageId=assetId;
  const current=reader.peek(assetId);
  button.disabled=Boolean(current)||capability!==true;
  button.textContent=current?
    current.status==='read'?'Đã đọc chữ · Xem cuối ngày':'Ảnh không phải danh sách · Đã soát':
    capability===false?'Chưa triển khai bộ đọc ảnh':
    capability==null?'Đang kiểm tra bộ đọc ảnh…':
    ids.length>1?'Đọc chữ ảnh '+(index+1):'Đọc chữ hàng trong ảnh';
  const status=document.createElement('span');
  status.className='message-stock-image-read-status';
  status.textContent=current?.status==='read'?current.lines.length+' dòng · Cần soát':
   capability===false?'Máy chủ chưa có phiên bản đọc ảnh · Chờ cập nhật':'';
  button.addEventListener('click',e=>{
   e.preventDefault();e.stopPropagation();
   if(button.disabled)return;
   const scope=reader.owner()?.key;
   if(!scope)return;
   button.disabled=true;
   button.textContent='Đang đọc chữ…';
   status.textContent='Chỉ đọc ảnh này · Không tạo đơn';
   void reader.scan(assetId).then(result=>{
    if(reader.owner()?.key!==scope)return;
    status.textContent=result.status==='read'?
     result.lines.length+' dòng · Xem ở bảng cuối ngày · Cần soát':
     'Ảnh không phải danh sách hàng đánh máy';
    if(typeof onRead==='function')onRead();
   }).catch(error=>{
    if(reader.owner()?.key!==scope)return;
    button.disabled=false;button.textContent='Đọc lại chữ trong ảnh';
    status.textContent={
     image_unavailable:'Ảnh chưa tải xong · Mở ảnh rồi thử lại',
     image_too_large:'Ảnh quá lớn hoặc chưa hỗ trợ',
     ocr_not_deployed:'Máy chủ chưa có bộ đọc ảnh',
     ai_not_configured:'AI máy chủ chưa sẵn sàng',
     conversation_switched:'Đã chuyển hội thoại'
    }[String(error?.message||'')]||'Chưa đọc được ảnh · Thử lại';
   });
  });
  entry.append(button,status);
  wrap.append(entry);
 });
 const actions=unit.querySelector(':scope > .message-action-group');
 if(actions)unit.insertBefore(wrap,actions);
 else unit.appendChild(wrap);
 return true;
}
window.V21ChatStockImageUI=Object.freeze({assets,reads,sync});
})();