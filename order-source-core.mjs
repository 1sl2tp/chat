import './order-source-image-viewer.js';

const DAY=86400000;

function normalized(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
}

export function rangeForPreset(preset,nowMs=Date.now(),offsetMinutes=new Date().getTimezoneOffset(),custom={}){
  const offset=Number(offsetMinutes)||0;
  const shifted=new Date(Number(nowMs)-offset*60000);
  const localMidnightUtc=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())+offset*60000;
  if(preset==='today')return {from:new Date(localMidnightUtc).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  if(preset==='yesterday')return {from:new Date(localMidnightUtc-DAY).toISOString(),to:new Date(localMidnightUtc).toISOString()};
  if(preset==='week'){
    const weekday=(shifted.getUTCDay()+6)%7;
    const start=localMidnightUtc-weekday*DAY;
    return {from:new Date(start).toISOString(),to:new Date(localMidnightUtc+DAY).toISOString()};
  }
  if(preset==='custom'){
    const from=String(custom.from||'').trim();
    const to=String(custom.to||'').trim();
    const start=Date.parse(`${from}T00:00:00.000Z`)+offset*60000;
    const end=Date.parse(`${to}T00:00:00.000Z`)+offset*60000+DAY;
    if(!from||!to||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('invalid_date_range');
    return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
  }
  throw new Error('invalid_range_preset');
}

export function isLikelyOrderSource(value,aliases=[]){
  const text=String(value||'').trim();
  if(!text)return false;
  const valueNorm=normalized(text);
  if(/^(em cam on|cam on|vang|da|ok|oke|ok e|em cam on a)\b/u.test(valueNorm))return false;
  const hasQty=/(^|\s)\d+(?:[.,]\d+)?(?:(?:\s+\S)|(?=[^\d\s]))/u.test(valueNorm);
  if(!hasQty)return false;
  const hasPack=/\b(thung|loc|goi|bich|tui|chai|lon|hop|khay|cay)\b/u.test(valueNorm);
  const multiLine=text.split(/\n+/u).filter(Boolean).length>1;
  const aliasHit=(Array.isArray(aliases)?aliases:[]).some(alias=>{
    const key=normalized(alias);
    return key&&valueNorm.includes(key);
  });
  const looksTimeOnly=/\b\d{1,2}\s*(gio|h|phut)\b/u.test(valueNorm)&&!hasPack&&!multiLine&&!aliasHit;
  if(looksTimeOnly)return false;
  return true;
}

export function orderSplitPreviewEntries(result={}){
  const unresolved=(Array.isArray(result?.unresolved)?result.unresolved:[])
    .map(item=>String(item?.raw||'').trim())
    .filter(Boolean)
    .map(text=>({type:'unresolved',text}));
  const items=(Array.isArray(result?.items)?result.items:[])
    .map(item=>({
      type:'item',
      quantity:Number(item?.quantity),
      quantityLabel:String(item?.quantityLabel??item?.quantity??'').trim(),
      name:String(item?.name||'').trim(),
      uncertain:item?.uncertain===true,
    }))
    .filter(item=>Number.isFinite(item.quantity)&&item.quantity>0&&item.name);
  return [...unresolved,...items];
}

function imageAssetsForRow(row={}){
  const messageId=String(row?.messageId||'').trim();
  return (Array.isArray(row?.imageAssets)?row.imageAssets:[])
    .map(asset=>({
      assetId:String(asset?.assetId||'').trim(),
      messageId,
      mimeType:String(asset?.mimeType||'image/jpeg').trim()||'image/jpeg',
      widthPx:Number(asset?.widthPx)||null,
      heightPx:Number(asset?.heightPx)||null,
    }))
    .filter(asset=>asset.assetId);
}

function sortedRows(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .map((row,index)=>({row:row||{},index}))
    .filter(({row})=>{
      const hasMessageId=Boolean(String(row?.messageId||'').trim());
      const hasText=Boolean(String(row?.text||'').trim());
      const hasImages=imageAssetsForRow(row).length>0;
      return hasMessageId&&(hasText||hasImages);
    })
    .sort((a,b)=>{
      const at=Date.parse(String(a.row?.createdAt||''));
      const bt=Date.parse(String(b.row?.createdAt||''));
      if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
      if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(at)?-1:1;
      return a.index-b.index;
    })
    .map(({row})=>row);
}

export function customerOrderSourceGroup(rows=[]){
  // Tin đơn chỉ là cách đọc lại lịch sử Chat theo thời gian. Trạng thái cũ
  // (kể cả "ignored") không được làm tin nhắn khách biến mất khỏi tổng hợp.
  const active=sortedRows(rows);
  const text=active.map(row=>String(row?.text||'').trim()).filter(Boolean).join('\n');
  const images=active.flatMap(imageAssetsForRow);
  const result={
    sourceMessageIds:active.map(row=>String(row.messageId||'').trim()),
    text,
    firstCreatedAt:active.length?String(active[0]?.createdAt||''):'',
    lastCreatedAt:active.length?String(active[active.length-1]?.createdAt||''):'',
    count:active.length,
  };
  if(images.length)result.images=images;
  if(typeof globalThis!=='undefined')globalThis.__V21LastOrderSourceGroup=result;
  return result;
}
