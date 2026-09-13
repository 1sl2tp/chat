function normalizeSource(value){
  return String(value??'').replace(/\r\n?/g,'\n').trim();
}
function quantityNumber(value){
  const amount=Number(String(value??'').replace(',','.'));
  return Number.isFinite(amount)&&amount>0?amount:null;
}
function quickChunks(source){
  if(/\n|;|\/(?:\s|$)|,(?!\d)/u.test(source)){
    return source.split(/\s*(?:\n|;|\/(?:\s|$)|,(?!\d))\s*/u).map(value=>value.trim()).filter(Boolean);
  }
  return [source.trim()];
}
function looksLikeSpokenMultiItem(name){
  return /\s(?:một|mot|hai|ba|bốn|bon|năm|nam|sáu|sau|bảy|bay|tám|tam|chín|chin|mười|muoi)\s+(?:thùng|thung|hộp|hop|gói|goi|bịch|bich|túi|tui|chai|lon|lốc|loc|khay|cây|cay)\b/iu.test(name);
}

export function parseQuickOrderText(value){
  const source=normalizeSource(value);
  if(!source)return {ok:false,items:[],error:'order_text_required'};
  const chunks=quickChunks(source);
  if(!chunks.length)return {ok:false,items:[],error:'order_text_required'};
  const items=[];
  for(const chunk of chunks){
    const match=chunk.match(/^\s*(\d+(?:[.,]\d+)?)\s+([\s\S]+?)\s*$/u);
    if(!match)return {ok:false,items:[],error:'quick_parse_failed'};
    const quantity=quantityNumber(match[1]);
    const name=String(match[2]??'').trim();
    if(!quantity||!name)return {ok:false,items:[],error:'quick_parse_failed'};
    if(chunks.length===1&&looksLikeSpokenMultiItem(name)){
      return {ok:false,items:[],error:'quick_parse_failed'};
    }
    items.push({quantity,name});
  }
  return {ok:true,items,error:null};
}

export function materializeAiSpans(value,spans){
  const source=String(value??'');
  if(!source.trim())throw new Error('order_text_required');
  if(!Array.isArray(spans)||!spans.length)throw new Error('ai_items_missing');
  const items=[];
  let priorEnd=-1;
  for(const raw of spans){
    const quantity=quantityNumber(raw?.quantity);
    const start=Number(raw?.name_start);
    const end=Number(raw?.name_end);
    if(
      !quantity||!Number.isInteger(start)||!Number.isInteger(end)||
      start<0||end<=start||end>source.length||start<priorEnd
    )throw new Error('invalid_ai_span');
    const name=source.slice(start,end).trim();
    if(!name)throw new Error('invalid_ai_span');
    items.push({quantity,name});
    priorEnd=end;
  }
  return items;
}

export function formatOrderItems(items){
  return (Array.isArray(items)?items:[]).map(item=>`${Number(item.quantity)} ${String(item.name??'')}`).join('\n');
}
