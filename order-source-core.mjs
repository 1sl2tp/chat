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
  const hasQty=/(^|\s)\d+(?:[.,]\d+)?\s+\S/u.test(valueNorm);
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
      name:String(item?.name||'').trim(),
    }))
    .filter(item=>Number.isFinite(item.quantity)&&item.quantity>0&&item.name);
  return [...unresolved,...items];
}

export function customerOrderSourceGroup(rows=[]){
  const active=(Array.isArray(rows)?rows:[])
    .map((row,index)=>({row:row||{},index}))
    .filter(({row})=>{
      const state=String(row?.state||'pending');
      return state!=='imported'&&state!=='ignored'&&String(row?.messageId||'').trim()&&String(row?.text||'').trim();
    })
    .sort((a,b)=>{
      const at=Date.parse(String(a.row?.createdAt||''));
      const bt=Date.parse(String(b.row?.createdAt||''));
      if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
      if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(at)?-1:1;
      return a.index-b.index;
    })
    .map(({row})=>row);
  return{
    sourceMessageIds:active.map(row=>String(row.messageId||'').trim()),
    text:active.map(row=>String(row.text||'').trim()).join('\n'),
    firstCreatedAt:active.length?String(active[0]?.createdAt||''):'',
    lastCreatedAt:active.length?String(active[active.length-1]?.createdAt||''):'',
    count:active.length,
  };
}