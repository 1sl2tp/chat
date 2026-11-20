// CHAT-417: manual OCR action for KH images; OCR text can be corrected by hand.
// No auto-scan, no generative AI, no chat send and no order mutation.
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
function el(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function showOutput(row,assetId,reader,onRead){
 const result=reader.peek(assetId);
 let details=row.querySelector('.message-stock-ocr-detail');
 if(!result){
  details?.remove();row.dataset.renderedText='';
  return;
 }
 const signature=String(result.rawText||'')+'|'+result.lines.length+'|'+result.edited;
 if(details&&row.dataset.renderedText===signature)return;
 const expanded=Boolean(details?.open);
 if(!details){
  details=el('details','message-stock-ocr-detail');
  row.append(details);
 }
 details.replaceChildren();
 row.dataset.renderedText=signature;
 const summary=el('summary','message-stock-ocr-summary',
  'Chữ OCR · '+(result.textLines?.length||0)+' dòng · '+result.lines.length+' hàng');
 details.append(summary);
 if(!result.rawText){
  details.append(el('div','message-stock-ocr-hint','Không nhận ra chữ trong ảnh này.'));
  details.open=expanded;
  return;
 }
 const hint=el('div','message-stock-ocr-hint','Soát với ảnh gốc. Sửa chữ sai trước khi lấy danh sách hàng.');
 const editor=el('textarea','message-stock-ocr-editor');
 editor.value=result.rawText;
 editor.rows=Math.max(3,Math.min(10,(result.textLines||[]).length));
 editor.setAttribute('aria-label','Chữ OCR, có thể sửa thủ công');
 editor.spellcheck=false;
 const actions=el('div','message-stock-ocr-actions');
 const apply=el('button','message-stock-ocr-action','Áp dụng chữ đã sửa');
 apply.type='button';
 apply.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  const updated=reader.updateText?.(assetId,editor.value);
  if(!updated)return;
  showOutput(row,assetId,reader,onRead);
  if(typeof onRead==='function')onRead();
 });
 const copy=el('button','message-stock-ocr-action','Sao chép chữ');
 copy.type='button';
 copy.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  const value=editor.value;
  if(navigator.clipboard?.writeText){
   void navigator.clipboard.writeText(value).then(()=>{
    copy.textContent='Đã sao chép';
   }).catch(()=>{copy.textContent='Không sao chép được';});
  }else{
   editor.focus();editor.select();
   copy.textContent='Đã chọn chữ để sao chép';
  }
 });
 actions.append(apply,copy);
 details.append(hint,editor,actions);
 details.open=expanded;
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
 const same=wrap?.dataset.assetKeys===identity;
 if(!wrap){
  wrap=el('div','message-stock-image-read');
  for(const kind of ['click','pointerdown','touchstart'])
   wrap.addEventListener(kind,event=>event.stopPropagation());
 }
 if(!same){
  wrap.dataset.assetKeys=identity;
  wrap.replaceChildren();
 }
 ids.forEach((assetId,index)=>{
  let entry=Array.from(wrap.children).find(x=>x.dataset?.stockAsset===assetId);
  if(!entry){
   entry=el('div','message-stock-image-read-row');
   entry.dataset.stockAsset=assetId;
   const button=el('button','message-stock-image-read-button');
   button.type='button';button.dataset.stockImageId=assetId;
   const status=el('span','message-stock-image-read-status');
   button.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(button.disabled)return;
    const scope=reader.owner()?.key;
    if(!scope)return;
    const repeat=Boolean(reader.peek(assetId));
    button.disabled=true;
    button.textContent='Đang đọc chữ OCR…';
    status.textContent='Đọc ảnh trên thiết bị · Không dùng AI · Không tạo đơn';
    void reader.scan(assetId,progress=>{
     if(reader.owner()?.key===scope)status.textContent=String(progress||'Đang nhận chữ…');
    },repeat).then(result=>{
     if(reader.owner()?.key!==scope)return;
     button.disabled=false;button.textContent='Đọc lại OCR';
     status.textContent=(result.textLines?.length||0)+' dòng chữ · '+
      result.lines.length+' hàng gợi ý · Cần soát';
     showOutput(entry,assetId,reader,onRead);
     if(typeof onRead==='function')onRead();
    }).catch(error=>{
     if(reader.owner()?.key!==scope)return;
     button.disabled=false;button.textContent='Thử đọc lại OCR';
     status.textContent={
      image_unavailable:'Ảnh chưa tải xong · Mở ảnh rồi thử lại',
      image_too_large:'Ảnh quá lớn hoặc chưa hỗ trợ',
      ocr_unsupported:'Trình duyệt không hỗ trợ OCR',
      ocr_engine_unavailable:'Không tải được bộ chữ OCR · Kiểm tra mạng',
      conversation_switched:'Đã chuyển hội thoại'
     }[String(error?.message||'')]||'Chưa đọc được ảnh · Thử lại';
    });
   });
   entry.append(button,status);
   wrap.append(entry);
  }
  const button=entry.querySelector('button[data-stock-image-id]');
  const status=entry.querySelector('.message-stock-image-read-status');
  const current=reader.peek(assetId);
  if(button&&!button.disabled){
   button.disabled=capability===false;
   button.textContent=current?'Đọc lại OCR':
    capability===false?'OCR không được hỗ trợ':
    ids.length>1?'Đọc OCR ảnh '+(index+1):'Đọc chữ trong ảnh (OCR)';
  }
  if(status&&current&&!status.textContent)
   status.textContent=(current.textLines?.length||0)+' dòng chữ · '+
    current.lines.length+' hàng gợi ý · Cần soát';
  showOutput(entry,assetId,reader,onRead);
 });
 if(!same){
  const actions=unit.querySelector(':scope > .message-action-group');
  if(actions)unit.insertBefore(wrap,actions);
  else unit.appendChild(wrap);
 }
 return !same;
}
window.V21ChatStockImageUI=Object.freeze({assets,reads,sync});
})();
