/* CHAT-381/399: read-only, reversible parser for real customer stock requests.
   Never turns a chat message into an actual order. Unknown units remain empty. */
(function(global){
'use strict';
const U='(?:thùng|thung|th|thg|lốc|loc|hộp|hop|gói|goi|chai|bịch|bich|bao|kiện|kien|cái|cai|kg|lon|cây|cay|bộ|bo|túi|tui|vỉ|vi|lít|lit)';
const suffix=new RegExp('^(.+?)\\s+(\\d{1,3})\\s*('+U+')\\s*$','iu');
const colonQuantity=new RegExp('^(.+?)\\s*[:：]\\s*(\\d{1,3})\\s*('+U+')\\s*$','iu');
const prefix=new RegExp('^(\\d{1,3})\\s*('+U+')\\s+(.+?)\\s*$','iu');
const labeled=new RegExp('^(.+?)\\s+(?:sl|số lượng|so luong)\\s*[:=]?\\s*(\\d{1,3})(?:\\s*('+U+'))?\\s*$','iu');
const multiply=/^(.+?)\s+[x×]\s*(\d{1,3})\s*$/iu;
const bare=/^(\d{1,3})\s+([\p{L}][^:]{1,100})$/iu;
// Known numeric-leading product names: "9 hạt" is a product, not quantity 9.
// Without a product catalog, keep ambiguous numeric names intact for review.
const numericProductName=/^(?:9\s+hạt|7\s*up|3\s+miền|5\s+sao)\b/iu;
const orderCue=/(?:báo\s*(?:lấy\s*)?hàng|lấy\s*hàng|đặt\s*hàng|đơn\s*hàng|soạn\s*hàng|lên\s*đơn|gửi\s*hàng|(?:^|\n)\s*(?:lấy|đặt|cho|e bán|em bán)\s)/iu;
const titles=[
 ['items',/^(?:báo\s*)?(?:lấy\s*hàng|đặt\s*hàng|danh\s*sách\s*hàng|hàng\s*cần\s*lấy)$/iu],
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
function entry(raw,qty,u,source,review=false){
 const name=stripListMarker(raw);
 const amount=Number(qty);
 return name.length>=2&&name.length<=100&&/\p{L}/u.test(name)&&!/[<>]/u.test(name)
  &&Number.isInteger(amount)&&amount>=1&&amount<=999
  ?{name,qty:amount,unit:unit(u),source,review:Boolean(review)}:null;
}
// Explicit quantity/packaging wins over the presence of digits in a product name.
function parseStrongLine(line){
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const clean=stripListMarker(raw);
 let m=clean.match(labeled);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(colonQuantity);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(suffix);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(prefix);
 if(m)return entry(m[3],m[1],m[2],raw);
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
 if(/^(?:giá|ship|giao|lưu ý|ghi chú|ngày|tháng|địa chỉ|sđt|đt)\b/iu.test(m[2]))return null;
 // "5 sữa 100 200" is ambiguous code/price text, never a silent item.
 if(/\s+\d{2,}\s+\d{2,}\s*$/u.test(clean))return null;
 return entry(m[2],m[1],'',raw);
}
function parseCompoundVariant(line){
 const raw=String(line||'').trim();
 const m=stripListMarker(raw).match(/^(.{2,80}?)\s*[:：]\s*(.+)$/u);
 if(!m||/^(?:ghi chú|lưu ý|giao hàng|thanh toán|giá|địa chỉ|ship)$/iu.test(m[1].trim()))return null;
 const parts=m[2].split(/\s*[,;]\s*/u);
 if(parts.length<2||parts.length>12)return null;
 const variant=new RegExp('^(\\d{1,3})\\s+(?:('+U+')\\s+)?([\\p{L}][\\p{L}\\p{N}\\s./-]{1,60})$','iu');
 const found=[];
 for(const part of parts){
  const p=part.trim().match(variant);
  if(!p)return null;
  const label=p[3].trim();
  // "có" is reproduced verbatim, not guessed as a flavor or corrected.
  const review=/^(?:có|ko|không|ít)$/iu.test(label);
  const item=entry(m[1].trim()+' '+label,p[1],p[2]||'',raw,review);
  if(!item)return null;
  found.push(item);
 }
 return found;
}
function parsePieces(line,isOrder){
 const raw=String(line||'').trim();
 if(!raw||raw.length>240||/https?:\/\/|[<>]/iu.test(raw))return [];
 const compound=parseCompoundVariant(raw);
 if(compound)return compound;
 // E.g. "5 sữa, 3 bánh" or "Mì 2 thùng; Bánh 3 gói".
 // Split only when ALL fragments stand alone as products.
 const segments=raw.split(/\s*[,;]\s*/u);
 if(segments.length>=2&&segments.length<=12){
  const found=segments.map(x=>parseStrongLine(x)||(isOrder?parseBareLine(x,true):null));
  if(found.every(Boolean))return found;
 }
 const single=parseStrongLine(raw)||(isOrder?parseBareLine(raw,true):null);
 return single?[single]:[];
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
 if(source.length<10||source.length>5000||!source.includes('\n')
   ||/https?:\/\//iu.test(source)||source.includes(String.fromCharCode(96).repeat(3)))return null;
 const lines=source.split('\n').map(x=>x.trim()).filter(Boolean);
 if(lines.length<2||lines.length>48)return null;
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
 const orderContext=cue||strongCount>0||bareCount>=2;
 let active='other';
 for(const line of lines){
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
  if(parsed.length){items.push(...parsed);continue;}
  notes.push({topic:noteTopic(line,active),text:line});
 }
 const isOrder=items.length>=2||(items.length>=1&&(cue||heads.has('items')));
 const isTopics=!items.length&&heads.size>=2&&notes.length>=2;
 if(!isOrder&&!isTopics)return null;
 const grouped=new Map();
 for(const note of notes){if(!grouped.has(note.topic))grouped.set(note.topic,[]);grouped.get(note.topic).push(note.text);}
 return {kind:isOrder?'order':'topics',items,groups:Array.from(grouped,([key,rows])=>({key,label:labels[key]||'Ghi chú',rows})),source};
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
 head.append(el('strong','incoming-brief-title',parsed.kind==='order'?'Danh sách lấy hàng':'Nội dung theo chủ đề'),
  el('span','incoming-brief-count',parsed.kind==='order'?parsed.items.length+' mặt hàng':parsed.groups.length+' chủ đề'));
 root.append(head);
 if(parsed.items.length){
  const list=el('div','incoming-brief-products');
  const columns=el('div','incoming-brief-columns');
  columns.append(el('span','','STT'),el('span','','Tên sản phẩm'),
    el('span','','SL'),el('span','','Quy cách'));
  list.append(columns);
  parsed.items.forEach((item,index)=>{
   const row=el('div','incoming-brief-item');
   const name=el('span','incoming-brief-product',item.name);
   if(item.review)name.append(el('span','incoming-brief-review',' · Soát tên'));
   row.append(el('span','incoming-brief-index',index+1),name,
    el('span','incoming-brief-quantity',item.qty),
    el('span','incoming-brief-unit',item.unit||'—'));
   list.append(row);
  });
  root.append(list);
 }
 for(const group of parsed.groups){
  const section=el('section','incoming-brief-topic');
  section.append(el('div','incoming-brief-topic-title',group.label));
  for(const note of group.rows)section.append(el('div','incoming-brief-note',note));
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
 target.dataset.hasLink='false';
 target.dataset.richText='true';
 target.dataset.autoLayout=parsed.kind;
 return true;
}
global.V21IncomingMessageLayout=Object.freeze({analyze,render});
})(window);
