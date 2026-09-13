import {parseCustomerTextPartial} from '../_shared/customer-order-parser.mjs';

function normalizeSource(value){
  return String(value??'').replace(/\r\n?/g,'\n').trim();
}
function quantityNumber(value){
  const amount=Number(String(value??'').replace(',','.'));
  return Number.isFinite(amount)&&amount>0?amount:null;
}
function quantityLabel(value,fallback){
  return String(value??'').trim()||String(fallback??'').trim();
}

export function parseQuickOrderText(value){
  const source=normalizeSource(value);
  if(!source)return {ok:false,items:[],unresolved:[],error:'order_text_required'};

  const parsed=parseCustomerTextPartial(source,{preserveRaw:true});
  const items=(Array.isArray(parsed?.lines)?parsed.lines:[]).map(line=>({
    quantity:Number(line?.quantity),
    quantityLabel:quantityLabel(line?.rawQuantityLabel,line?.quantity),
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
    items.push({
      quantity,
      quantityLabel:quantityLabel(raw?.quantity_text,quantity),
      name,
    });
    priorEnd=end;
  }
  return items;
}

// Kept for compatibility with older callers/tests. New handwriting flow does not
// ask Vision to invent product fields; it transcribes raw lines first instead.
export function materializeAiImageItems(rawItems){
  if(!Array.isArray(rawItems)||!rawItems.length)throw new Error('ai_items_missing');
  return rawItems.map(raw=>{
    const quantity=quantityNumber(raw?.quantity);
    const name=String(raw?.name??'').trim();
    if(!quantity||!name)throw new Error('invalid_ai_image_item');
    return{
      quantity,
      quantityLabel:quantityLabel(raw?.quantity_text,quantity),
      name,
      uncertain:raw?.uncertain===true,
    };
  });
}

const IMAGE_QTY_UNIT='(?:t|th|thùng|thung|bao|gói|goi|bịch|bich|túi|tui|chai|lon|lốc|loc|hộp|hop|khay|cây|cay)';
const IMAGE_QTY_START=new RegExp(`^(\\d+(?:[.,]\\d+)?)(\\s*${IMAGE_QTY_UNIT})?(?:\\s*[:\\-]\\s*|\\s+)(.+)$`,'iu');
const IMAGE_QTY_END_WITH_UNIT=new RegExp(`^(.+?)\\s*(?:[:\\-]\\s*)?(\\d+(?:[.,]\\d+)?)(\\s*${IMAGE_QTY_UNIT})\\s*[.]?$`,'iu');
const IMAGE_QTY_END_AFTER_SEPARATOR=new RegExp(`^(.+?)\\s*[:\\-]\\s*(\\d+(?:[.,]\\d+)?)\\s*[.]?$`,'u');
const IMAGE_REPEAT_MARKER=/^(?:_{2,}|—+|–{2,}|-{2,})\s*/u;

function trimLiteralName(value){
  return String(value??'').trim().replace(/[\s:;,-]+$/u,'').trim();
}
function visibleQuantityLabel(numberPart,unitPart=''){
  return `${String(numberPart??'').trim()}${String(unitPart??'')}`.trim();
}
function parseLiteralImageLine(value){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  if(!text)return null;

  let match=text.match(IMAGE_QTY_START);
  if(match){
    const quantity=quantityNumber(match[1]);
    const name=trimLiteralName(match[3]);
    if(quantity&&name)return{quantity,quantityLabel:visibleQuantityLabel(match[1],match[2]),name};
  }

  match=text.match(IMAGE_QTY_END_WITH_UNIT);
  if(match){
    const quantity=quantityNumber(match[2]);
    const name=trimLiteralName(match[1]);
    if(quantity&&name)return{quantity,quantityLabel:visibleQuantityLabel(match[2],match[3]),name};
  }

  match=text.match(IMAGE_QTY_END_AFTER_SEPARATOR);
  if(match){
    const quantity=quantityNumber(match[2]);
    const name=trimLiteralName(match[1]);
    if(quantity&&name)return{quantity,quantityLabel:String(match[2]).trim(),name};
  }
  return null;
}

function repeatRemainder(value){
  const text=String(value??'').trim();
  if(!IMAGE_REPEAT_MARKER.test(text))return null;
  return text.replace(IMAGE_REPEAT_MARKER,'').trim();
}

function normalizedToken(value){
  return String(value??'').toLocaleLowerCase('vi-VN');
}

function inheritedBase(previousName,newVariant){
  const priorTokens=String(previousName??'').trim().split(/\s+/u).filter(Boolean);
  const variantTokens=String(newVariant??'').trim().split(/\s+/u).filter(Boolean);
  if(!priorTokens.length||!variantTokens.length)return '';

  const firstVariant=normalizedToken(variantTokens[0]);
  const anchorIndex=priorTokens.findIndex((token,index)=>index>0&&normalizedToken(token)===firstVariant);
  if(anchorIndex>0)return priorTokens.slice(0,anchorIndex).join(' ');

  // The handwritten line means the prefix was intentionally omitted. Without
  // product data, the safest deterministic reconstruction is positional: the
  // visible remainder replaces the same number of trailing words above.
  if(variantTokens.length<priorTokens.length){
    return priorTokens.slice(0,priorTokens.length-variantTokens.length).join(' ');
  }
  return '';
}

export function materializeAiImageTranscriptions(rawLines){
  if(!Array.isArray(rawLines)||!rawLines.length)throw new Error('ai_items_missing');
  const items=[];
  const unresolved=[];
  let previous=null;
  for(const raw of rawLines){
    const text=String(raw?.text??'').trim();
    if(!text)continue;
    const uncertain=raw?.uncertain===true;
    const repeated=repeatRemainder(text);
    if(repeated!==null){
      const fragment=parseLiteralImageLine(repeated);
      const base=previous&&fragment?inheritedBase(previous.name,fragment.name):'';
      if(fragment&&base){
        const item={
          ...fragment,
          name:`${base} ${fragment.name}`.trim(),
          uncertain:uncertain||previous?.uncertain===true,
        };
        items.push(item);
        previous=item;
        continue;
      }
      unresolved.push({raw:`${text}${uncertain&&!/\?\s*$/u.test(text)?' ?':''}`});
      continue;
    }

    const parsed=parseLiteralImageLine(text);
    if(parsed){
      const item={...parsed,uncertain};
      items.push(item);
      previous=item;
      continue;
    }
    unresolved.push({raw:`${text}${uncertain&&!/\?\s*$/u.test(text)?' ?':''}`});
  }
  if(!items.length&&!unresolved.length)throw new Error('ai_items_missing');
  return{items,unresolved};
}

export function formatOrderItems(items){
  return (Array.isArray(items)?items:[]).map(item=>{
    const marker=quantityLabel(item?.quantityLabel,item?.quantity);
    const name=String(item?.name??'').trim();
    return `${marker} ${name}${item?.uncertain===true?' [?]':''}`.trim();
  }).join('\n');
}
