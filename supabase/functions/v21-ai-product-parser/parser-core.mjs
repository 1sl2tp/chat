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
const explicitQty=new RegExp(`(^|\\s)(\\d+(?:[.,]\\d+)?)(\\s*)(${UNIT})(?=\\s|$)`,'iu');
const chatter=/\b(?:cho|em|e|c|chị|chi|anh|ok|nhé|nhe|thế|the|t2)\b/iu;
const childQty=new RegExp(`^(\\d+(?:[.,]\\d+)?)(\\s*${UNIT})?\\s+(.+)$`,'iu');
const parentTotal=new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s*${UNIT})?\\s+(.+)$`,'iu');
const tobaccoName=/\b(?:cứng|cung|mềm|mem|dẹt|det|melon)\b/iu;
const protectedThName=/^th\s+(?:bé|be|to|có|co|ít|it|không|khong|ko|đường|duong|dâu|dau|socola|sô\s*cô\s*la|true|organic)\b/iu;

function canonicalUnit(value){
  const unit=clean(value).toLocaleLowerCase('vi-VN');
  if(['t','th','thùng','thung'].includes(unit))return 'thung';
  if(['bao','ba0'].includes(unit))return 'bao';
  if(['bịch','bich'].includes(unit))return 'bich';
  if(['gói','goi'].includes(unit))return 'goi';
  if(unit==='chai')return 'chai';
  if(['lốc','loc'].includes(unit))return 'loc';
  if(['hộp','hop'].includes(unit))return 'hop';
  if(['cây','cay'].includes(unit))return 'cay';
  return null;
}

function isProtectedThName(value){
  return protectedThName.test(clean(value));
}

function stripLeadingUnit(value){
  const text=clean(value);
  if(isProtectedThName(text))return {name:text,unit:null,explicitUnit:false};
  const match=text.match(new RegExp(`^(${UNIT})(?:\\s+|$)(.*)$`,'iu'));
  if(!match)return {name:text,unit:null,explicitUnit:false};
  return {name:clean(match[2]),unit:canonicalUnit(match[1]),explicitUnit:true};
}

function splitList(value){
  return String(value??'')
    .split(/\s*(?:,|;)\s*|\s+\/\s+/)
    .map(part=>part.trim())
    .filter(Boolean);
}

function expandParentLine(line){
  const text=line.replace(/^\s*[-•]\s*/,'').trim();
  if(!text)return [];
  const colon=text.indexOf(':');
  if(colon<=0||colon===text.length-1)return splitList(text);

  const parent=clean(text.slice(0,colon));
  const children=splitList(text.slice(colon+1));
  if(!parent||!children.length)return splitList(text);

  const childMatches=children.map(child=>child.match(childQty));
  const hasAnyChildQty=childMatches.some(Boolean);

  if(!hasAnyChildQty){
    const totalMatch=parent.match(parentTotal);
    if(totalMatch){
      const total=numberValue(totalMatch[1]);
      const parentName=clean(totalMatch[2]);
      if(total!=null&&Number.isInteger(total)&&total===children.length&&parentName){
        return children.map(child=>clean(`1 ${parentName} ${child}`));
      }
    }
  }

  const expanded=[];
  for(let i=0;i<children.length;i++){
    const child=children[i];
    const match=childMatches[i];
    if(!match){
      expanded.push(child);
      continue;
    }
    const qty=`${match[1]}${match[2]||''}`;
    expanded.push(clean(`${qty} ${parent} ${match[3]}`));
  }
  return expanded;
}

export function splitCustomerSegments(value){
  return String(value??'')
    .replace(/\r\n?/g,'\n')
    .split(/\n/)
    .flatMap(expandParentLine)
    .filter(Boolean);
}

function finalizeParsed(quantity,name,unit=null,explicitUnit=false){
  if(quantity==null||!name)return null;
  const productName=upperFirst(name);
  if(!productName)return null;
  const isTobacco=tobaccoName.test(productName);
  const normalizedQuantity=isTobacco&&unit==='thung'?quantity*50:quantity;
  const confirmation=isTobacco&&!explicitUnit&&quantity<=2
    ?{quantity,productName,prompt:`${quantityText(quantity)} ${productName} — 1 = thùng, 0 = cây`}
    :null;
  return {
    line:{quantity:normalizedQuantity,productName,line:`${quantityText(normalizedQuantity)} ${productName}`},
    confirmation,
  };
}

function parseSegmentDetailed(raw){
  const text=clean(raw);
  if(!text)return null;

  const explicit=text.match(explicitQty);
  if(explicit){
    const quantity=numberValue(explicit[2]);
    if(quantity==null)return null;
    const markerStart=(explicit.index||0)+(explicit[1]?.length||0);
    const markerEnd=(explicit.index||0)+explicit[0].length;
    const before=clean(text.slice(0,markerStart));
    const after=clean(text.slice(markerEnd));
    const unitText=clean(explicit[4]);
    const spaced=Boolean(explicit[3]);
    const protectedTh=unitText.toLocaleLowerCase('vi-VN')==='th'&&spaced&&isProtectedThName(clean(`th ${after}`));
    if(!protectedTh){
      const name=after||before;
      return finalizeParsed(quantity,name,canonicalUnit(unitText),true);
    }
  }

  const start=text.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/u);
  if(start){
    const quantity=numberValue(start[1]);
    if(quantity==null)return null;
    const stripped=stripLeadingUnit(start[2]);
    if(!stripped.name)return null;
    return finalizeParsed(quantity,stripped.name,stripped.unit,stripped.explicitUnit);
  }

  const loose=[...text.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s)/gu)];
  for(const match of loose){
    const markerStart=(match.index||0)+(match[0].length-match[1].length);
    const prefix=clean(text.slice(0,markerStart));
    if(!prefix||!chatter.test(prefix))continue;
    const quantity=numberValue(match[1]);
    const stripped=stripLeadingUnit(text.slice(markerStart+match[1].length));
    if(quantity==null||!stripped.name)continue;
    return finalizeParsed(quantity,stripped.name,stripped.unit,stripped.explicitUnit);
  }

  return null;
}

export function parseCustomerTextDetailed(value){
  const lines=[];
  const confirmations=[];
  for(const segment of splitCustomerSegments(value)){
    const parsed=parseSegmentDetailed(segment);
    if(!parsed)continue;
    if(parsed.confirmation)confirmations.push(parsed.confirmation);
    else lines.push(parsed.line);
  }
  return {lines,confirmations};
}

export function resolveTobaccoConfirmation(confirmations,decision){
  const choice=String(decision??'').trim();
  if(choice!=='1'&&choice!=='0')return [];
  const multiplier=choice==='1'?50:1;
  return (Array.isArray(confirmations)?confirmations:[]).map(item=>{
    const quantity=numberValue(item?.quantity);
    const productName=upperFirst(item?.productName);
    if(quantity==null||!productName)return null;
    const resolved=quantity*multiplier;
    return {quantity:resolved,productName,line:`${quantityText(resolved)} ${productName}`};
  }).filter(Boolean);
}

export function parseCustomerText(value){
  return parseCustomerTextDetailed(value).lines;
}
