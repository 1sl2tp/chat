const VALID_INTENTS=new Set(['ORDER','CANCEL_CHANGE','INQUIRY','MIXED','GET_DETAIL','IMAGE_ORDER','NO_ACTION']);
const EMPTY_OK_INTENTS=new Set(['NO_ACTION','INQUIRY','GET_DETAIL','CANCEL_CHANGE']);
const UNIT_WORDS=new Set(['thung','kien','cay','bao','loc','bich','can','chai','tui','goi','hop','khay','vi']);

function clean(value,max=1000){
  return String(value??'').replace(/\r\n?/g,'\n').replace(/\s+/g,' ').trim().slice(0,max);
}
function ascii(value){
  return clean(value,2000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D');
}
function positiveNumber(value){
  const number=Number(String(value??'').replace(',','.'));
  return Number.isFinite(number)&&number>0?number:null;
}
function intentOf(value){
  const intent=clean(value,40).toUpperCase();
  return VALID_INTENTS.has(intent)?intent:'ORDER';
}
function stripDuplicateQuantity(value,quantity,unit){
  let text=clean(value,500);
  const q=String(quantity??'').trim();
  if(q){
    const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    text=text.replace(new RegExp(`^${escaped}(?:[.,]0+)?\\s+`,'u'),'');
  }
  const unitCore=ascii(unit).toLowerCase();
  if(unitCore&&UNIT_WORDS.has(unitCore)){
    const first=text.split(/\s+/)[0]||'';
    if(ascii(first).toLowerCase()===unitCore)text=text.slice(first.length).trimStart();
  }
  return text;
}
function literalNameFromRaw(rawText,quantity){
  const source=clean(rawText,500);
  const q=String(quantity??'').trim();
  if(!source||!q)return '';
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`(?:^|\\s)${escaped}(?:[.,]0+)?(?:\\s+|$)`,'u').exec(source);
  if(!match)return '';
  const name=source.slice(match.index+match[0].length).trim();
  return ascii(name).trim();
}
function itemName(raw,quantity,unit){
  const inherited=Number.isInteger(Number(raw?.inherited_from_line))&&Number(raw?.inherited_from_line)>0;
  if(!inherited){
    const literal=literalNameFromRaw(raw?.raw_text,quantity);
    if(literal)return literal;
  }
  const source=raw?.normalized_name??raw?.normalized_vn??raw?.name??'';
  return ascii(stripDuplicateQuantity(source,quantity,unit)).trim();
}

export function parseMasterOrderPayload(payload){
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.parsed_items))throw new Error('ai_response_invalid');
  const intent=intentOf(payload.intent);
  const items=[];
  const unresolved=[];
  for(const raw of payload.parsed_items){
    const quantity=positiveNumber(raw?.quantity_number);
    const unitValue=clean(raw?.unit,50);
    const unit=unitValue?ascii(unitValue).toLowerCase():null;
    const name=itemName(raw,quantity,unit);
    if(!quantity||!name){
      const source=clean(raw?.raw_text,500);
      if(source)unresolved.push({raw:source});
      continue;
    }
    items.push({
      quantity,
      quantityLabel:String(quantity),
      name,
      unit,
      rawText:clean(raw?.raw_text,500),
      detectedBrand:clean(raw?.detected_brand,200),
      action:clean(raw?.action,50)||'new',
      isAmbiguous:raw?.is_ambiguous===true,
      inheritedFromLine:Number.isInteger(Number(raw?.inherited_from_line))&&Number(raw?.inherited_from_line)>0?Number(raw.inherited_from_line):null,
      priceCode:clean(raw?.price_code,100)||null,
    });
  }
  if(!items.length&&!EMPTY_OK_INTENTS.has(intent))throw new Error('ai_items_missing');
  return {
    intent,
    requiresHumanAction:payload.requires_human_action===true,
    humanActionReason:clean(payload.human_action_reason,500)||null,
    items,
    unresolved,
    summary:payload.summary&&typeof payload.summary==='object'?payload.summary:null,
    text:items.map(item=>`${item.quantityLabel} ${item.name}`.trim()).join('\n'),
  };
}

export function parseMasterOrderResponseText(value){
  const source=String(value??'').trim();
  if(!source)throw new Error('ai_response_invalid');
  const candidates=[];
  const fenced=/```(?:json)?\s*([\s\S]*?)```/giu;
  for(const match of source.matchAll(fenced)){
    const candidate=String(match[1]||'').trim();
    if(candidate)candidates.push(candidate);
  }
  const first=source.indexOf('{');
  const last=source.lastIndexOf('}');
  if(first>=0&&last>first)candidates.push(source.slice(first,last+1));
  for(const candidate of Array.from(new Set(candidates))){
    try{return parseMasterOrderPayload(JSON.parse(candidate));}catch(error){
      if(String(error?.message||error)==='ai_items_missing')throw error;
    }
  }
  throw new Error('ai_response_invalid');
}
