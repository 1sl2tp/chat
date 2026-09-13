import {parseCustomerTextPartial} from '../_shared/customer-order-parser.mjs';

function normalizeSource(value){
  return String(value??'').replace(/\r\n?/g,'\n').trim();
}
function quantityNumber(value){
  const amount=Number(String(value??'').replace(',','.'));
  return Number.isFinite(amount)&&amount>0?amount:null;
}

export function parseQuickOrderText(value){
  const source=normalizeSource(value);
  if(!source)return {ok:false,items:[],unresolved:[],error:'order_text_required'};

  const parsed=parseCustomerTextPartial(source,{preserveRaw:true});
  const items=(Array.isArray(parsed?.lines)?parsed.lines:[]).map(line=>({
    quantity:Number(line?.quantity),
    name:String(line?.rawProductName||line?.productName||'').trim(),
  })).filter(item=>Number.isFinite(item.quantity)&&item.quantity>0&&item.name);
  const unresolved=(Array.isArray(parsed?.unresolved)?parsed.unresolved:[])
    .map(item=>({raw:String(item?.raw||'').trim()}))
    .filter(item=>item.raw);

  return {ok:true,items,unresolved,error:null};
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
