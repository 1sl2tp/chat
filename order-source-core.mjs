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

function sortedRows(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .map((row,index)=>({row:row||{},index}))
    .filter(({row})=>String(row?.messageId||'').trim()&&String(row?.text||'').trim())
    .sort((a,b)=>{
      const at=Date.parse(String(a.row?.createdAt||''));
      const bt=Date.parse(String(b.row?.createdAt||''));
      if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
      if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(at)?-1:1;
      return a.index-b.index;
    })
    .map(({row})=>row);
}

function groupShape(rows,state='working'){
  const list=sortedRows(rows);
  const first=list[0]||{};
  return{
    state,
    sourceMessageIds:list.map(row=>String(row.messageId||'').trim()),
    text:list.map(row=>String(row.text||'').trim()).join('\n'),
    firstCreatedAt:list.length?String(first.createdAt||''):'',
    lastCreatedAt:list.length?String(list[list.length-1]?.createdAt||''):'',
    count:list.length,
    linkedExternalOrderId:first.linkedExternalOrderId?String(first.linkedExternalOrderId):null,
    linkedExternalOrderNo:first.linkedExternalOrderNo?String(first.linkedExternalOrderNo):null,
  };
}

export function customerOrderSourceGroup(rows=[]){
  const active=sortedRows(rows).filter(row=>{
    const state=String(row?.state||'pending');
    return state!=='imported'&&state!=='ignored';
  });
  const group=groupShape(active,'working');
  return{
    sourceMessageIds:group.sourceMessageIds,
    text:group.text,
    firstCreatedAt:group.firstCreatedAt,
    lastCreatedAt:group.lastCreatedAt,
    count:group.count,
  };
}

export function customerOrderSourceTimeline(rows=[]){
  const ordered=sortedRows(rows);
  const active=ordered.filter(row=>{
    const state=String(row?.state||'pending');
    return state!=='imported'&&state!=='ignored';
  });
  const timeline=[];
  if(active.length)timeline.push(groupShape(active,'working'));

  const importedGroups=new Map();
  for(const row of ordered){
    if(String(row?.state||'pending')!=='imported')continue;
    const orderId=String(row?.linkedExternalOrderId||'').trim();
    const orderNo=String(row?.linkedExternalOrderNo||'').trim();
    const messageId=String(row?.messageId||'').trim();
    const key=orderId?`id:${orderId}`:orderNo?`no:${orderNo}`:`message:${messageId}`;
    if(!importedGroups.has(key))importedGroups.set(key,[]);
    importedGroups.get(key).push(row);
  }
  const history=[...importedGroups.values()]
    .map(group=>groupShape(group,'imported'))
    .sort((a,b)=>Date.parse(String(b.lastCreatedAt||''))-Date.parse(String(a.lastCreatedAt||'')));
  return [...timeline,...history];
}