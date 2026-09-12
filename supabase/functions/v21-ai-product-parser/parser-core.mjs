function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function numberValue(value){
  const n=Number(String(value??'').replace(',','.'));
  return Number.isFinite(n)&&n>0?n:null;
}

function quantityText(value){
  const n=numberValue(value);
  if(n==null)return '1';
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

function upperFirst(value){
  const text=clean(value);
  if(!text)return '';
  return text.slice(0,1).toLocaleUpperCase('vi-VN')+text.slice(1);
}

const UNIT='(?:t|th|thùng|thung|bao|ba0|bịch|bich|gói|goi|chai|lốc|loc|hộp|hop|cây|cay)';
const explicitQty=new RegExp(`(^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})(?=\\s|$)`,'iu');
const chatter=/\b(?:cho|em|e|c|chị|chi|anh|ok|nhé|nhe|thế|the|t2)\b/iu;

export function splitCustomerSegments(value){
  return String(value??'')
    .replace(/\r\n?/g,'\n')
    .split(/\n/)
    .flatMap(line=>line.split(/\s*(?:,|;)\s*|\s+\/\s+/))
    .map(part=>part.replace(/^\s*[-•]\s*/,'').trim())
    .filter(Boolean);
}

function parseSegment(raw){
  const text=clean(raw);
  if(!text)return null;

  const explicit=text.match(explicitQty);
  if(explicit){
    const quantity=numberValue(explicit[2]);
    if(quantity==null)return null;
    const markerStart=explicit.index+(explicit[1]?.length||0);
    const markerEnd=(explicit.index||0)+explicit[0].length;
    const before=clean(text.slice(0,markerStart));
    const after=clean(text.slice(markerEnd));
    const name=after||before;
    if(!name)return null;
    const productName=upperFirst(name);
    return {quantity,productName,line:`${quantityText(quantity)} ${productName}`};
  }

  const start=text.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/u);
  if(start){
    const quantity=numberValue(start[1]);
    if(quantity==null)return null;
    let name=clean(start[2]);
    name=name.replace(new RegExp(`^${UNIT}(?:\\s+|$)`,'iu'),'').trim();
    if(!name)return null;
    const productName=upperFirst(name);
    return {quantity,productName,line:`${quantityText(quantity)} ${productName}`};
  }

  const loose=[...text.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s)/gu)];
  for(const match of loose){
    const markerStart=(match.index||0)+(match[0].length-match[1].length);
    const prefix=clean(text.slice(0,markerStart));
    if(!prefix||!chatter.test(prefix))continue;
    const quantity=numberValue(match[1]);
    const name=clean(text.slice(markerStart+match[1].length));
    if(quantity==null||!name)continue;
    const productName=upperFirst(name);
    return {quantity,productName,line:`${quantityText(quantity)} ${productName}`};
  }

  return null;
}

export function parseCustomerText(value){
  return splitCustomerSegments(value).map(parseSegment).filter(Boolean);
}
