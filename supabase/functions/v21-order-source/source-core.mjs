export function clean(value,max=6000){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}

function normalized(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
}

export function isLikelyOrderSource(value,aliases=[]){
  const text=clean(value);
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

export function normalizeState(value){
  const state=String(value||'').trim().toLowerCase();
  if(!['pending','working','ignored','imported'].includes(state))throw new Error('invalid_source_state');
  return state;
}
