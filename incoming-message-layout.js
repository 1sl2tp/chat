/* CHAT-381/399: read-only, reversible parser for real customer stock requests.
   Never turns a chat message into an actual order. Unknown units remain empty. */
(function(global){
'use strict';
const U='(?:thùng|thung|th|thg|lốc|loc|hộp|hop|gói|goi|chai|bịch|bich|bao|kiện|kien|cái|cai|kg|lon|cây|cay|bộ|bo|túi|tui|vỉ|vi|lít|lit)';
const suffix=new RegExp('^(.+?)\\s+(\\d{1,3})\\s*('+U+')\\s*$','iu');
const colonQuantity=new RegExp('^(.+?)\\s*[:：]\\s*(\\d{1,3})\\s*('+U+')\\s*$','iu');
const prefix=new RegExp('^(\\d{1,3})\\s*('+U+')\\s+(.+?)\\s*$','iu');
const labeled=new RegExp('^(.+?)\\s+(?:sl|số lượng|so luong)\\s*[:=]?\\s*(\\d{1,3})(?:\\s*('+U+'))?\\s*$','iu');
const multiply=/^(.+?)(?:\s+[x×]\s*|\s*\*\s*)(\d{1,3})\s*$/iu;
// CHAT-425: explicit *quantity + unit. Preserve sizes/codes/prices in prefix.
const explicitStarPack=new RegExp('^(.+?)\\s*[*×]\\s*(\\d{1,3})(?:\\s*('+U+'))?\\s*$','iu');
// Unitless `Tên: SL` requires an independently established order context;
// this could otherwise be a price, product code or time.
const colonBare=/^(.+?)\s*[:：=]\s*(\d{1,3})\s*$/iu;
const bare=/^(\d{1,3})\s+([\p{L}][^:]{1,100})$/iu;
// Known numeric-leading product names: "9 hạt" is a product, not quantity 9.
// Without a product catalog, keep ambiguous numeric names intact for review.
const numericProductName=/^(?:9\s+hạt|7\s*up|3\s+miền|5\s+sao)(?=\s|$)/iu;
const orderCue=/(?:báo\s*(?:lấy\s*)?hàng|lấy\s*hàng|đặt\s*hàng|đơn\s*hàng|soạn\s*hàng|lên\s*đơn|gửi\s*hàng|(?:^|\n)\s*(?:lấy|đặt|cho|e bán|em bán)\s)/iu;
const titles=[
 ['items',/^(?:báo\s*hàng|(?:báo\s*)?(?:lấy\s*hàng|đặt\s*hàng|danh\s*sách\s*hàng|hàng\s*cần\s*lấy))$/iu],
 ['delivery',/^(?:giao\s*hàng|giao\s*nhận|địa\s*chỉ\s*giao|thời\s*gian\s*giao|ship)$/iu],
 ['price',/^(?:giá|báo\s*giá|giá\s*riêng|chiết\s*khấu|khuyến\s*mãi)$/iu],
 ['payment',/^(?:thanh\s*toán|chuyển\s*khoản|công\s*nợ|tiền\s*hàng)$/iu],
 ['note',/^(?:ghi\s*chú|lưu\s*ý|dặn\s*thêm|nhắc\s*thêm)$/iu]
];
const labels={delivery:'Giao nhận',price:'Giá và chiết khấu',payment:'Thanh toán',note:'Ghi chú',other:'Lời nhắn'};
const unitOnly=new RegExp('^'+U+'$','iu');
function unit(raw){
 const v=String(raw||'').toLocaleLowerCase('vi-VN');
 return ({th:'thùng',thg:'thùng',thung:'thùng',loc:'lốc',hop:'hộp',goi:'gói',bich:'bịch',kien:'kiện',cai:'cái',cay:'cây',bo:'bộ',tui:'túi',vi:'vỉ',lit:'lít'})[v]||v;
}
function stripListMarker(raw){
 // STT "1. ", "2) ", bullet; NEVER remove numeric product names ("9 hạt").
 return String(raw||'').trim().replace(/^(?:[-•*]\s+|\d{1,3}[.)]\s+|\d{1,3}\s*[-–]\s+)/u,'').trim();
}
// CHAT-402: read-only corpus rules drawn from E Quyên's stock-list patterns.
// CHAT-408: C Trang Sữa's short, standalone purchase lines are known
// quantity-first products, unlike unqualified numeric price chatter.
const knownSingleCustomerProduct=/^\d{1,3}\s+(?:milo|bò|chua|proby|probi|yomost|green\s+farm|sữa\s+chua|susu\s+lọ)(?=\s|$)/iu;
const extraItemHeading=/^(?:thêm|lấy thêm|cho thêm|thêm vào đơn(?: hôm trước)?)\s*[:：]?\s*$/iu;
const deicticProduct=/^(?:này|kia|đó|đấy|vậy|ấy)(?:\s|$)/iu;
const deicticTail=/(?:\s|^)(?:này|kia|đấy|đó)\s*$/iu;
// Preserve review only for genuinely shortened, unresolved flavor names.
const uncertainFlavorShorthand=/^(?:probi|proby)\s+(?:bé|be|to)\s+(?:co|it)\s+dg$/iu;
function ambiguousOrderNote(line){
 const raw=String(line||'').trim();
 if(!raw||/https?:\/\/|[<>]/iu.test(raw))return false;
 if(/^(?:giá|thanh toán|giao hàng|chuyển khoản|công nợ)\b/iu.test(raw))return false;
 return /^\d{1,3}\s*(?:thùng|th|thg|hộp|hop|bao|bịch|bich|lốc|loc|kg|gói|goi)\b/iu.test(raw)
   || /^\d{1,3}(?:probi|proby)\b/iu.test(raw)
   || /^\d{1,3}\s+[\p{L}][^:]{2,100}\s*[:：]\s*[\p{L}]/iu.test(raw)
   || /^[\p{L}][\p{L}\s\d]{2,60}\s*[:：]\s*\d{1,3}\s+[\p{L}]/iu.test(raw);
}
function entry(raw,qty,u,source,review=false,allowVerifiedNumericName=false){
 const name=stripListMarker(raw);
 const amount=Number(qty);
 // "5 thùng này" has no product. "1 thùng milo này" needs a human check.
 if(deicticProduct.test(name))return null;
 // These are sentence scaffolds, not merchandise names.
 if(/^(?:lấy\s+)?tạm\s+cho$/iu.test(name)||
   /^(?:giá|báo\s+giá|giá\s+bán)(?=\s|[:：]|$)/iu.test(name))return null;
 return name.length>=2&&name.length<=100&&
  (/\p{L}/u.test(name)||(allowVerifiedNumericName&&/^454$/u.test(name)))&&
  !/[<>]/u.test(name)
  &&Number.isInteger(amount)&&amount>=1&&amount<=999
  ?{name,qty:amount,unit:unit(u),source,review:Boolean(review)||deicticTail.test(name)||uncertainFlavorShorthand.test(name)}:null;
}
// Explicit quantity/packaging wins over the presence of digits in a product name.
// CHAT-400: read units on either side of the quantity (not from a fixed
// column). CHAT-423: unknown typos are never silently read as units;
// product names are never spell-corrected. The distinction "bò" vs "bộ"
// is deliberate, so exact aliases retain their Vietnamese accents.
const unitAliases=new Map([
 ['thùng','thùng'],['thung','thùng'],['th','thùng'],['thg','thùng'],
 ['lốc','lốc'],['loc','lốc'],['hộp','hộp'],['hop','hộp'],
 ['gói','gói'],['goi','gói'],['chai','chai'],['bịch','bịch'],
 ['bich','bịch'],['bao','bao'],['kiện','kiện'],['kien','kiện'],
 ['cái','cái'],['cai','cái'],['kg','kg'],['lon','lon'],
 ['cây','cây'],['cay','cây'],['bộ','bộ'],['bo','bộ'],
 ['túi','túi'],['tui','túi'],['vỉ','vỉ'],['vi','vỉ'],
 ['lít','lít'],['lit','lít']
]);
function foldUnit(text){
 return String(text||'').toLocaleLowerCase('vi-VN').normalize('NFD')
  .replace(/[\u0300-\u036f]/gu,'').replace(/đ/gu,'d');
}
function oneEditApart(a,b){
 if(Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,diffs=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue;}
  if(++diffs>1)return false;
  if(a.length>b.length)i++;
  else if(b.length>a.length)j++;
  else{i++;j++;}
 }
 return diffs+(a.length-i)+(b.length-j)<=1;
}
function unitCandidate(token,allowTypo=false){
 const raw=String(token||'').toLocaleLowerCase('vi-VN').trim();
 const exact=unitAliases.get(raw);
 if(exact)return{value:exact,review:false};
 const folded=foldUnit(raw);
 if(!allowTypo||folded.length<4||folded.length>8)return null;
 const options=new Set();
 for(const [alias,value] of unitAliases){
  const candidate=foldUnit(alias);
  if(candidate.length>=4&&oneEditApart(folded,candidate))options.add(value);
 }
 return options.size===1?{value:[...options][0],review:true}:null;
}
function parseUnitAroundNumber(line,isOrder){
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const clean=stripListMarker(raw);
 const patterns=[
  clean.match(/^(.+?)\s+([\p{L}]{2,9})\s+(\d{1,3})$/u),
  clean.match(/^(\d{1,3})\s+(.+?)\s+([\p{L}]{2,9})$/u),
  clean.match(/^(.+?)\s+(\d{1,3})\s*([\p{L}]{2,9})$/u),
  clean.match(/^(\d{1,3})\s*([\p{L}]{2,9})\s+(.+?)$/u)
 ];
 for(let i=0;i<patterns.length;i++){
  const m=patterns[i];
  if(!m)continue;
  const token=i===0?m[2]:i===1?m[3]:i===2?m[3]:m[2];
  const decoded=unitCandidate(token,false);
  if(!decoded)continue;
  const name=i===0?m[1]:i===1?m[2]:i===2?m[1]:m[3];
  const qty=i===0?m[3]:i===1?m[1]:i===2?m[2]:m[1];
  const row=entry(name,qty,decoded.value,raw,decoded.review);
  if(row)return row;
 }
 return null;
}
// CHAT-401: reviewed request-word and stock-size lexicon (read-only).
// Never automatically learn uncertain abbreviations from conversations.
const REQUEST_LEADS=[
 /^(?:cho\s+(?:tôi|em|e|chị|anh|a|c|mình|thêm))(?=\s|[:：,.]|$)(?:\s+(?:lấy|mua|thêm))?\s*[:：,.-]?\s*/iu,
 /^(?:lấy|đặt|gửi|mua)\s+(?:thêm\s+)?(?:cho\s+(?:tôi|em|e|chị|anh|a|c)\s+)?\s*[:：,.-]?\s*/iu,
 /^(?:thêm|bổ\s+sung)\s*[:：,.-]?\s*/iu
];
const AVAILABILITY_LEAD=/^đang\s+có(?=\s|[:：,.]|$)\s*[:：,.-]?\s*/iu;
function requestLine(raw){
 const text=stripListMarker(raw);
 for(const regex of REQUEST_LEADS){
  const m=text.match(regex);
  if(m&&text.slice(m[0].length).trim())return{body:text.slice(m[0].length).trim(),kind:'request'};
 }
 const m=text.match(AVAILABILITY_LEAD);
 if(m&&text.slice(m[0].length).trim())return{body:text.slice(m[0].length).trim(),kind:'availability'};
 return{body:text,kind:''};
}
// Explicitly confirmed by the user: the last number is requested quantity.
const VERIFIED_SIZE=/^bát\s+(?:1\s*kg|454\s*g)$/iu;
const SIZED_TAIL=/^(.+?\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|gam|ml|lít|lit)\b)\s+(\d{1,3})$/iu;
function parseSizedQuantity(line,isOrder){
 const raw=String(line||'').trim(),m=stripListMarker(raw).match(SIZED_TAIL);
 if(!m||/^(?:giá|báo giá|bán giá)\b/iu.test(raw))return null;
 if(!isOrder&&!VERIFIED_SIZE.test(m[1]))return null;
 return entry(m[1],m[2],'',raw);
}
const KNOWN_VARIANT_TAIL=/^(probi|proby)\s+(?:(to|bé)\s+)?(trắng|vq|việt\s+quất|ít\s+đường|có\s+đường)\s+(\d{1,3})$/iu;
function parseVariantTail(line){
 const raw=String(line||'').trim(),m=stripListMarker(raw).match(KNOWN_VARIANT_TAIL);
 if(!m)return null;
 const stem=m[1]+' '+(m[2]||'').trim();
 return entry((stem+' '+m[3]).replace(/\s+/gu,' ').trim(),m[4],'',raw);
}
// "10 th bé ít đường" in E Quyên's messages refers to TH milk.
// The letters TH here are a product brand, not the carton abbreviation.
const thMilkProduct=/^(\d{1,3})\s+th\s+(to|bé|bịch|lon)(?=\s|$)(.*)$/iu;
// CHAT-404: two attested colloquial carton phrases from the customer chats.
// Restrict "t" = "thùng" to the bát product family and an explicit number.
// Do not generalize "t" into money/price discussions or rewrite names.
const BAT_LEADING_CARTONS=/^(\d{1,3})\s*t\s+(bát\s+\d+(?:[.,]\d+)?\s*(?:kg|g)?)$/iu;
const BAT_INVERTED_CARTONS=/^có\s+(bát\s+454(?:g)?)\s+(?:a|anh|ạ)\s+(\d{1,3})\s*t$/iu;
function parseBatCartons(line){
 const raw=String(line||'').trim();
 if(!raw||raw.length>150)return null;
 const clean=stripListMarker(raw);
 const leading=clean.match(BAT_LEADING_CARTONS);
 if(leading)return entry(leading[2].trim(),leading[1],'thùng',raw);
 const inverted=clean.match(BAT_INVERTED_CARTONS);
 // "Có ..." can also be an availability question; preserve as yellow review.
 return inverted?entry(inverted[1].trim(),inverted[2],'thùng',raw,true):null;
}
// CHAT-406: Narrow, verified chat grammar:
// "Có pepsi lon vàng rồi thì phải, lấy tạm cho 10 thùng".
// "Có"/"rồi thì phải"/"lấy tạm cho" describe uncertain availability and
// request intent, not the product name. This rule does NOT guess other prose.
const TENTATIVE_STOCK_REQUEST=new RegExp(
 '^có\\s+([\\p{L}][\\p{L}\\p{N}\\s.-]{2,80}?)\\s+rồi\\s+thì\\s+phải\\s*[,，]\\s*'+
 'lấy\\s+tạm\\s+cho\\s+(\\d{1,3})\\s*('+U+')\\s*$','iu'
);
function parseTentativeStockRequest(line){
 const raw=String(line||'').trim();
 if(!raw||raw.length>170||/[<>]/u.test(raw))return null;
 const found=stripListMarker(raw).match(TENTATIVE_STOCK_REQUEST);
 if(!found)return null;
 // "thì phải" expresses uncertainty; the user sees a yellow review marker.
 return entry(found[1].trim(),found[2],found[3],raw,true);
}
// CHAT-407: customer-confirmed packaging shorthand with NUMERIC product
// names. "20 t 1 kg 10 t 454" means two different products: "1 kg"
// and "454". Accept only an explicit request and consecutive complete pairs.
const NUMBERED_CARTON_PAIR=/^(\d{1,3})\s*(t|thùng)\s+(1\s*kg|454\s*g?)(?=\s+\d{1,3}\s*(?:t|thùng)\s+|$)/iu;
const RETURN_REMAINDER=/\s+(còn\s+đâu\s+gửi\s+lại\s+kho)\s*$/iu;
function parseNumericCartonList(line){
 const original=String(line||'').trim(),lead=requestLine(original);
 if(lead.kind!=='request')return null;
 let body=lead.body.trim(),note='';
 const trailing=body.match(RETURN_REMAINDER);
 if(trailing){note=trailing[1];body=body.slice(0,trailing.index).trim();}
 const rows=[];let rest=body;
 for(let n=0;n<12&&rest;n++){
  const match=rest.match(NUMBERED_CARTON_PAIR);
  if(!match)break;
  const product=match[3].trim();
  const pack=match[2].toLowerCase()==='t'?'thùng':match[2];
  const row=entry(product,match[1],pack,original,false,true);
  if(!row)return null;
  rows.push(row);
  rest=rest.slice(match[0].length).trim();
 }
 return rows.length>=2&&!rest?{items:rows,note}:null;
}
// User-approved item names with internal numbers: 600 is part of "côsy
// bơ 600". Here "t" is carton only in the exact observed constructions.
const VERIFIED_SHORT_T=/^(?:bốc\s+c\s+chị\s+)?(\d{1,3})\s*t\s+((?:kopikô|kopiko)\s+sữa|(?:côsy|cosy)\s+bơ\s+600)\s*$/iu;
function parseNamedShortCarton(line){
 const original=String(line||'').trim();
 const match=stripListMarker(original).match(VERIFIED_SHORT_T);
 return match?entry(match[2].trim(),match[1],'thùng',original):null;
}
function parseStrongLine(line){
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const clean=stripListMarker(raw);
 const thMilk=clean.match(thMilkProduct);
 if(thMilk)return entry('th '+thMilk[2]+thMilk[3],thMilk[1],'',raw,true);
 let m=clean.match(labeled);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(colonQuantity);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(suffix);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(prefix);
 if(m)return entry(m[3],m[1],m[2],raw);
 m=clean.match(explicitStarPack);
 if(m&&!/^(?:cộng|tổng|thành tiền|tiền hàng|giá|giảm giá)(?=\s|[:：]|$)/iu.test(m[1].trim()))
  return entry(m[1],m[2],m[3],raw);
 m=clean.match(multiply);
 if(m)return entry(m[1],m[2],'',raw);
 return null;
}
// Unlabeled "5 Grow Plus" is a quantity only inside a stock-order context.
// Do not treat numeric product names or pure units as quantities.
function parseBareLine(line,isOrder){
 if(!isOrder)return null;
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const clean=stripListMarker(raw);
 if(numericProductName.test(clean))return null;
 const m=clean.match(bare);
 if(!m||unitOnly.test(m[2].trim()))return null;
 if(/^(?:giá|ship|giao|lưu ý|ghi chú|ngày|tháng|địa chỉ|sđt|đt|thùg)\b/iu.test(m[2]))return null;
 // "5 sữa 100 200" is ambiguous code/price text, never a silent item.
 if(/\s+\d{2,}\s+\d{2,}\s*$/u.test(clean))return null;
 return entry(m[2],m[1],'',raw);
}
// CHAT-424: a plain trailing number is quantity only in an established
// stock-request context. Longer numbers are more likely sizes/product codes;
// those need a separate explicit SL, "*" or unit marker.
function parseBareSuffixLine(line,isOrder){
 if(!isOrder)return null;
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const m=stripListMarker(raw).match(/^(.+?)\s+(\d{1,3})$/iu);
 if(!m||Number(m[2])>99)return null;
 const name=m[1].trim();
 if(/^(?:giá|báo giá|giảm giá|ship|giao hàng|ngày|tháng|sđt|mã|tổng|cộng|địa chỉ)(?:\s|$)/iu.test(name))return null;
 return entry(name,m[2],'',raw);
}
// A pack descriptor at the END of a quantity-first product name is
// merchandise text, not a reason to shorten the customer's product name.
function parseLiteralPackName(line,isOrder){
 if(!isOrder)return null;
 const raw=String(line||'').trim(),clean=stripListMarker(raw);
 if(!/^\d{1,3}\s+[\p{L}][\p{L}\p{N}\s./-]{1,90}\s+(?:lon|chai|bịch)$/iu.test(clean))return null;
 return parseBareLine(clean,true);
}
function parseColonBare(line,isOrder){
 if(!isOrder)return null;
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const m=stripListMarker(raw).match(colonBare);
 return m?entry(m[1],m[2],'',raw):null;
}
function parseCompoundVariant(line){
 const raw=String(line||'').trim();
 const clean=stripListMarker(raw);
 const colon=clean.match(/^(.{2,80}?)\s*[:：]\s*(.+)$/u);
 // Seen in real chat: "probi to có 5. ít 2. việt quất 2".
 // Only known Probi family messages with at least two dotted clauses use
 // this alternate grammar; ordinary sentences remain original text.
 const dotted=colon?null:clean.match(/^((?:probi|proby)\s+(?:to|bé))\s+(.+)$/iu);
 const m=colon||(dotted&&/\d\.\s*[\p{L}]/u.test(dotted[2])?dotted:null);
 if(!m||/^(?:ghi chú|lưu ý|giao hàng|thanh toán|giá|địa chỉ|ship)$/iu.test(m[1].trim()))return null;
 const chunks=m[2].trim().replace(/\.{2,}\s*$/u,'').split(
  colon?/\s*[,;]\s*/u:/\.\s+/u
 );
 if(chunks.length<2||chunks.length>12)return null;
 const qtyFirst=new RegExp('^(\\d{1,3})\\s*(?:('+U+')\\s+)?([\\p{L}][\\p{L}\\p{N}\\s./-]{0,60})$','iu');
 const nameFirst=new RegExp('^([\\p{L}][\\p{L}\\p{N}\\s./-]{0,60}?)\\s+(\\d{1,3})(?:\\s*('+U+'))?$','iu');
 const heading=m[1].trim();
 const totalMatch=heading.match(new RegExp('^(\\d{1,3})\\s*('+U+')\\s+(.+)$','iu'));
 const root=totalMatch?totalMatch[3].trim():heading;
 const expectedTotal=totalMatch?Number(totalMatch[1]):null;
 const inheritedUnit=totalMatch?unit(totalMatch[2]):'';
 const result=[];
 for(const chunk of chunks){
  const first=chunk.trim().match(qtyFirst),last=first?null:chunk.trim().match(nameFirst);
  if(!first&&!last)return null;
  const label=String(first?first[3]:last[1]).trim();
  const quantity=first?first[1]:last[2],pack=first?first[2]:last[3];
  if(!label)return null;
  const shortVq=/^vq$/iu.test(label),probiTo=/^probi(?:y)?\s+to$/iu.test(root);
  const name=(shortVq&&probiTo?'probi':root)+' '+label;
  const review=/^(?:có|ít|dưa|dươngf|ko|không)$/iu.test(label)||(shortVq&&!probiTo);
  const item=entry(name,quantity,pack||inheritedUnit,raw,review);
  if(!item)return null;
  result.push(item);
 }
 if(expectedTotal!==null&&result.reduce((sum,item)=>sum+item.qty,0)!==expectedTotal)
  result.forEach(item=>{item.review=true;});
 return result;
}
function parsePieces(line,isOrder){
 const original=String(line||'').trim();
 if(!original||original.length>240||/https?:\/\/|[<>]/iu.test(original))return [];
 const numericCartons=parseNumericCartonList(original);
 if(numericCartons){
  const parsed=numericCartons.items.map(item=>({...item,source:original}));
  if(numericCartons.note)parsed.trailingNote=numericCartons.note;
  return parsed;
 }
 const namedCarton=parseNamedShortCarton(original);
 if(namedCarton)return [{...namedCarton,source:original}];
 const lead=requestLine(original),raw=lead.body.replace(/^(\d{1,3})(?=[\p{L}]{3,})/u,'$1 ');
 // A second carton marker indicates a multi-item request. If a numeric
 // product name is unverified, leave the entire line undecoded instead of
 // misreading the rest of the message as the name of the first item.
 if(/^\d{1,3}\s*(?:t|thùng)\s+(?:1\s*kg|454\s*g?)\s+\d{1,3}\s*(?:t|thùng)\s+/iu.test(raw))
  return [];
 const colloquial=parseBatCartons(raw);
 if(colloquial)return [{...colloquial,source:original}];
 const tentative=parseTentativeStockRequest(raw);
 if(tentative)return [{...tentative,source:original}];
 const compound=parseCompoundVariant(raw);
 if(compound)return compound.map(item=>({...item,source:original,review:item.review||lead.kind==='availability'}));
 // E.g. "5 sữa, 3 bánh" or "Mì 2 thùng; Bánh 3 gói".
 // Split only when ALL fragments stand alone as products.
 const segments=raw.split(/\s*[,;]\s*|\s+\+\s+/u);
 if(segments.length>=2&&segments.length<=12){
  const found=segments.map(x=>parseStrongLine(x)||parseLiteralPackName(x,isOrder)||
   parseUnitAroundNumber(x,isOrder)||parseSizedQuantity(x,isOrder)||
   parseVariantTail(x)||parseColonBare(x,isOrder)||parseBareLine(x,isOrder)||
   parseBareSuffixLine(x,isOrder));
  if(found.every(Boolean)){
   // Each fragment keeps the name actually written; never inherit
   // a product family from another fragment automatically.
   return found.map(item=>({...item,source:original,
    review:item.review||lead.kind==='availability'}));
  }
 }
 const single=parseStrongLine(raw)||parseLiteralPackName(raw,isOrder)||
  parseUnitAroundNumber(raw,isOrder)||parseSizedQuantity(raw,isOrder)||
  parseVariantTail(raw)||parseColonBare(raw,isOrder)||parseBareLine(raw,isOrder)||
  parseBareSuffixLine(raw,isOrder);
 return single?[{...single,source:original,review:single.review||lead.kind==='availability'}]:[];
}
function topicLine(line){
 const match=String(line||'').trim().replace(/^[#•\s]+/u,'').match(/^(.{2,36}?)(?:\s*[:：-]\s*(.*))?$/u);
 if(!match)return null;
 const title=titles.find(pair=>pair[1].test(match[1].trim()));
 return title?{key:title[0],rest:String(match[2]||'').trim()}:null;
}
function noteTopic(line,current){
 if(/^(?:giao|ship|địa chỉ|hẹn giao|nhận hàng)/iu.test(line))return 'delivery';
 if(/^(?:giá|giảm giá|chiết khấu|giá riêng|khuyến mãi)/iu.test(line))return 'price';
 if(/^(?:chuyển khoản|thanh toán|công nợ|tiền hàng)/iu.test(line))return 'payment';
 if(/^(?:ghi chú|lưu ý|nhớ|nếu thiếu|đổi hàng|thay hàng)/iu.test(line))return 'note';
 return current==='items'?'other':current;
}
function analyze(input){
 const source=String(input??'').replace(/\r\n?/gu,'\n');
 if(source.length<6||source.length>5000
   ||/https?:\/\//iu.test(source)||source.includes(String.fromCharCode(96).repeat(3)))return null;
 const lines=source.split('\n').map(x=>x.trim()).filter(Boolean);
 if(lines.length<1||lines.length>48)return null;
 const requestIntent=lines.some(line=>requestLine(line).kind==='request');
 const hasItemHeading=lines.some(line=>extraItemHeading.test(line));
 const availabilityOnly=lines.every(line=>requestLine(line).kind==='availability')||
  (requestLine(lines[0]).kind==='availability'&&!requestIntent&&!orderCue.test(source));
 const cue=orderCue.test(source),items=[],notes=[],heads=new Set();
 // First pass: strong unit/SL declarations and compound variants establish
 // context even when the customer never writes "lấy hàng". Multiple bare
 // quantity-first lines can establish context without a label.
 let strongCount=0,bareCount=0;
 for(const line of lines){
  if(topicLine(line))continue;
  const strong=parsePieces(line,false);
  strongCount+=strong.length;
  if(!strong.length&&parseBareLine(line,true))bareCount++;
 }
 const orderContext=cue||requestIntent||hasItemHeading||strongCount>0||bareCount>0||
  (lines.length===1&&knownSingleCustomerProduct.test(lines[0]));
 let active='other';
 for(const line of lines){
  if(extraItemHeading.test(line)){active='items';heads.add('items');continue;}
  const t=topicLine(line);
  if(t){
   active=t.key;heads.add(active);
   if(t.rest){
    const inline=t.key==='items'?parsePieces(t.rest,true):[];
    if(inline.length)items.push(...inline);
    else notes.push({topic:active==='items'?'other':active,text:t.rest});
   }
   continue;
  }
  // Notes headed explicitly as payment/delivery must stay notes even if
  // their text happens to contain a number.
  if(active!=='other'&&active!=='items'){
   notes.push({topic:noteTopic(line,active),text:line});
   continue;
  }
  const parsed=parsePieces(line,orderContext||active==='items');
  if(parsed.length){
   items.push(...parsed);
   if(parsed.trailingNote)notes.push({topic:'other',text:parsed.trailingNote});
   continue;
  }
  notes.push({topic:noteTopic(line,active),text:line});
 }
 const isOrder=items.length>=2||(items.length>=1&&(cue||requestIntent||heads.has('items')||
  // One-line explicit container + product was common in E Quyên's orders.
  (lines.length===1&&Boolean(items[0].unit))||
  (lines.length===1&&knownSingleCustomerProduct.test(lines[0]))||
  (lines.length===1&&parseBareLine(lines[0],true)!==null)||
  (lines.length===1&&/(?:^|\s)(?:sl|số lượng|so luong)\s*[:=]?\s*\d{1,3}/iu.test(lines[0]))||
  (lines.length===1&&multiply.test(stripListMarker(requestLine(lines[0]).body)))||
  (lines.length===1&&explicitStarPack.test(stripListMarker(requestLine(lines[0]).body)))||
  (items[0].unit&&notes.some(note=>ambiguousOrderNote(note.text)))||
  items.every(item=>VERIFIED_SIZE.test(item.name))||
  items.every(item=>KNOWN_VARIANT_TAIL.test(stripListMarker(item.source)))));
 const isAvailability=availabilityOnly&&items.length>0;
 const isTopics=!items.length&&heads.size>=2&&notes.length>=2;
 const reviewOnly=!items.length&&lines.length===1&&
  /^(?:cho\s+)?\d{1,3}\s*(?:thùng|th|hộp|bao|bịch|lốc)\s+(?:này|kia|vậy|đấy)\b/iu.test(lines[0]);
 if(!isOrder&&!isTopics&&!isAvailability&&!reviewOnly)return null;
 const grouped=new Map();
 for(const note of notes){if(!grouped.has(note.topic))grouped.set(note.topic,[]);grouped.get(note.topic).push(note.text);}
 return {kind:reviewOnly?'review':isAvailability?'availability':isOrder?'order':'topics',items,groups:Array.from(grouped,([key,rows])=>({key,label:labels[key]||'Ghi chú',rows})),source};
}
// KH read-only daily card: record each explicit name + quantity as written.
// Never sum repeated names, infer corrections, substitute names, or deduplicate
// across text and photos. No orders or customer messages are ever created.
function summarizeDay(messages){
 if(!Array.isArray(messages)||!messages.length)return null;
 const items=[],notes=[],sourceKeys=new Set(),imageGroups=[];
 for(const message of messages){
  if(!message||message.sender==='self')continue;
  if(message.media){
   // A user-selected OCR reading is independent evidence, not a new order.
   for(const read of (Array.isArray(message.imageReadings)?message.imageReadings:[]).slice(0,12)){
    if(read?.status!=='read')continue;
    const rows=(Array.isArray(read.lines)?read.lines:[]).filter(item=>
     String(item?.name||'').trim().length>1&&
     Number.isSafeInteger(Number(item?.qty))&&Number(item.qty)>=1&&Number(item.qty)<=999
    ).slice(0,60).map(item=>({
     name:String(item.name).trim().slice(0,120),qty:Number(item.qty),
     unit:String(item.unit||'').slice(0,25),
     note:String(item.note||'').trim().slice(0,240),review:true
    }));
    const rawNotes=(Array.isArray(read.notes)?read.notes:[]).slice(0,60)
     .map(note=>String(note).trim().slice(0,240)).filter(Boolean);
    if(rows.length||rawNotes.length){
     imageGroups.push({assetId:String(read.assetId||''),
      stamp:Number(message.stamp)||0,items:rows,notes:rawNotes});
    }
   }
   continue;
  }
  const original=String(message.text??'').trim();
  if(!original||original.length>5000)continue;
  const parsed=analyze(original);
  if(parsed?.kind!=='order'||!parsed.items.length)continue;
  sourceKeys.add(String(message.key??message.id??'')||original);
  for(const item of parsed.items){
   items.push({name:String(item.name||'').trim(),qty:item.qty,
    unit:String(item.unit||'').trim(),review:!!item.review,mentions:1});
  }
  for(const group of parsed.groups||[]){
   if(group.key==='other'||group.key==='note'||group.key==='delivery'){
    for(const note of group.rows||[]){
     if(notes.length<16)notes.push({text:String(note),review:false});
    }
   }
  }
 }
 if(!items.length&&!imageGroups.length)return null;
 return {kind:'daily-order',items,notes,imageGroups,messageCount:sourceKeys.size};
}
// CHAT-422: the approved KH card and every source use the SAME
// STT | Tên sản phẩm | SL geometry. Pure DOM, no OCR/AI, ledger or send owner.
// Product names remain byte-for-byte data; SL is numeric-only and unit stays
// in read-only metadata rather than becoming a fourth column.
function stockTable(){
 const grid=el('div','incoming-brief-products');
 grid.dataset.stockColumns='stt-name-qty';
 grid.setAttribute('role','table');
 const columns=el('div','incoming-brief-columns');
 columns.setAttribute('role','row');
 for(const title of ['STT','Tên sản phẩm','SL']){
  const heading=el('span','',title);
  heading.setAttribute('role','columnheader');
  columns.append(heading);
 }
 grid.append(columns);
 return grid;
}
function stockTableRow(item,index,{review=false,reviewText='Cần hướng dẫn'}={}){
 const row=el('div','incoming-brief-item');
 row.setAttribute('role','row');
 const needsReview=review||Boolean(item?.review);
 if(needsReview)row.dataset.needsReview='true';
 const name=el('span','incoming-brief-product',item.name);
 if(needsReview)name.append(el('span','incoming-brief-review',reviewText));
 // CHAT-426: the OCR remainder is a note attached to its single item.
 if(item?.note)name.append(el('span','incoming-brief-product-note','Ghi chú: '+item.note));
 const cells=[
  el('span','incoming-brief-index',index+1),
  name,
  el('span','incoming-brief-quantity',item.qty)
 ];
 for(const cell of cells)cell.setAttribute('role','cell');
 row.append(...cells);
 return row;
}
function renderDailySummary(target,summary){
 if(!target||summary?.kind!=='daily-order'||
   !(summary.items?.length||summary.imageGroups?.length))return false;
 const root=el('section','incoming-brief day-order-summary-card');
 root.dataset.approvedLayout='kh-stock-three-columns-v1';
 root.setAttribute('aria-label','Tổng hợp tin lấy hàng trong ngày');
 const head=el('div','incoming-brief-head');
 head.append(el('strong','incoming-brief-title','Tổng hợp lấy hàng · '+String(summary.dayLabel||'trong ngày')),
  el('span','incoming-brief-count',
   summary.items.length+' hàng từ tin · '+(summary.imageGroups?.length||0)+' ảnh'));
 root.append(head);
 if(summary.items.length){
 const grid=stockTable();
 summary.items.forEach((item,index)=>grid.append(stockTableRow(item,index)));
 root.append(grid);
 }
 for(const image of summary.imageGroups||[]){
  const source=el('section','day-order-image-source');
  const time=Number.isFinite(image.stamp)&&image.stamp>0?
   new Date(image.stamp).toLocaleTimeString('vi-VN',{
    timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
   }):'';
  source.append(el('strong','day-order-image-title',
   'Ảnh '+time+' · '+image.items.length+' dòng · Cần soát'));
  const grid=stockTable();
  image.items.forEach((item,index)=>grid.append(stockTableRow(item,index,{
   review:true,reviewText:'Cần soát ảnh'
  })));
  source.append(grid);
  for(const text of image.notes){
   const line=el('div','incoming-brief-note',text);
   line.dataset.needsReview='true';
   line.append(el('span','incoming-brief-review','Cần hướng dẫn'));
   source.append(line);
  }
  source.append(el('div','day-order-image-note',
   'Không cộng vào hàng từ tin · ảnh khác có thể là bản sửa'));
  root.append(source);
 }
 for(const note of summary.notes||[]){
  const row=el('div','incoming-brief-note',note.text);
  if(note.review){
   row.dataset.needsReview='true';
   row.append(el('span','incoming-brief-review','Cần hướng dẫn'));
  }
  root.append(row);
 }
 root.append(el('div','day-order-summary-disclaimer',
  'Chỉ tổng hợp tin đã tải và ảnh đã chọn đọc · chưa xác nhận hoặc tạo đơn'));
 target.replaceChildren(root);
 window.V21ChatMessageCase?.normalizeRendered?.(root);
 return true;
}
function el(tag,cls,content){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(content!==undefined)n.textContent=String(content);
 return n;
}
function render(target,input){
 const parsed=analyze(input);
 if(!target||!parsed)return false;
 const root=el('div','incoming-brief'),head=el('div','incoming-brief-head');
 head.append(el('strong','incoming-brief-title',
  parsed.kind==='order'?'Danh sách lấy hàng':parsed.kind==='availability'?'Hàng đang có · Cần soát':parsed.kind==='review'?'Cần hướng dẫn':'Nội dung theo chủ đề'),
  el('span','incoming-brief-count',
   parsed.kind==='order'||parsed.kind==='availability'?parsed.items.length+' mặt hàng':parsed.groups.length+' chủ đề'));
 root.append(head);
 if(parsed.items.length){
  const list=stockTable();
  parsed.items.forEach((item,index)=>list.append(stockTableRow(item,index)));
  root.append(list);
 }
 for(const group of parsed.groups){
  const section=el('section','incoming-brief-topic');
  section.append(el('div','incoming-brief-topic-title',group.label));
  for(const note of group.rows){
   const needsReview=(group.key==='other'&&ambiguousOrderNote(note))||parsed.kind==='review';
   const line=el('div','incoming-brief-note',note);
   if(needsReview){
    line.dataset.needsReview='true';
    line.append(el('span','incoming-brief-review','Cần hướng dẫn'));
   }
   section.append(line);
  }
  root.append(section);
 }
 const original=el('details','incoming-brief-original');
 original.append(el('summary','incoming-brief-original-toggle','Xem tin nguyên văn'),
  el('div','incoming-brief-original-text',parsed.source));
 original.addEventListener('click',e=>e.stopPropagation());
 original.addEventListener('pointerdown',e=>e.stopPropagation());
 // Mobile Safari must not interpret expanding the original as a message action.
 original.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
 root.append(original);
 target.replaceChildren(root);
 window.V21ChatMessageCase?.normalizeRendered?.(root);
 target.dataset.hasLink='false';
 target.dataset.richText='true';
 target.dataset.autoLayout=parsed.kind;
 return true;
}
global.V21IncomingMessageLayout=Object.freeze({analyze,render,summarizeDay,renderDailySummary});
})(window);
