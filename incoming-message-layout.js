/* CHAT-381: local, reversible layout for customer order and topic notes. */
(function(global){
'use strict';
const U='(?:thùng|thung|th|lốc|loc|hộp|hop|gói|goi|chai|bịch|bich|bao|kiện|kien|cái|cai|kg|lon|cây|cay|bộ|bo)';
const suffix=new RegExp('^(.+?)\\s+(\\d{1,3})\\s*('+U+')\\s*$','iu');
const prefix=new RegExp('^(\\d{1,3})\\s*('+U+')\\s+(.+?)\\s*$','iu');
const labeled=new RegExp('^(.+?)\\s+(?:sl|số lượng|so luong)\\s*[:=]?\\s*(\\d{1,3})(?:\\s*('+U+'))?\\s*$','iu');
const multiply=/^(.+?)\s+[x×]\s*(\d{1,3})\s*$/iu;
const bare=/^(\d{1,2})\s+([\p{L}][^:]{2,100})$/iu;
const orderCue=/(?:báo\s*(?:lấy\s*)?hàng|lấy\s*hàng|đặt\s*hàng|đơn\s*hàng|soạn\s*hàng|lên\s*đơn|gửi\s*hàng|(?:^|\n)\s*(?:lấy|đặt|cho|e bán|em bán)\s)/iu;
const titles=[
 ['items',/^(?:báo\s*)?(?:lấy\s*hàng|đặt\s*hàng|danh\s*sách\s*hàng|hàng\s*cần\s*lấy)$/iu],
 ['delivery',/^(?:giao\s*hàng|giao\s*nhận|địa\s*chỉ\s*giao|thời\s*gian\s*giao|ship)$/iu],
 ['price',/^(?:giá|báo\s*giá|giá\s*riêng|chiết\s*khấu|khuyến\s*mãi)$/iu],
 ['payment',/^(?:thanh\s*toán|chuyển\s*khoản|công\s*nợ|tiền\s*hàng)$/iu],
 ['note',/^(?:ghi\s*chú|lưu\s*ý|dặn\s*thêm|nhắc\s*thêm)$/iu]
];
const labels={delivery:'Giao nhận',price:'Giá và chiết khấu',payment:'Thanh toán',note:'Ghi chú',other:'Lời nhắn'};
function unit(raw){
 const v=String(raw||'').toLocaleLowerCase('vi-VN');
 return ({th:'thùng',thung:'thùng',loc:'lốc',hop:'hộp',goi:'gói',bich:'bịch',kien:'kiện',cai:'cái',cay:'cây',bo:'bộ'})[v]||v;
}
function entry(raw,qty,u,source){
 const name=String(raw||'').trim().replace(/^\s*(?:[-•*]|\d+[.)])\s+/u,'');
 const amount=Number(qty);
 return name.length>=2&&name.length<=100&&/\p{L}/u.test(name)&&!/[<>]/u.test(name)
  &&Number.isInteger(amount)&&amount>=1&&amount<=999
  ?{name,qty:amount,unit:unit(u),source}:null;
}
function parseLine(line,isOrder){
 const raw=String(line||'').trim();
 if(!raw||raw.length>150||/https?:\/\/|[<>]/iu.test(raw))return null;
 const clean=raw.replace(/^\s*(?:[-•*]|\d+[.)])\s+/u,'');
 let m=clean.match(labeled);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(suffix);
 if(m)return entry(m[1],m[2],m[3],raw);
 m=clean.match(prefix);
 if(m)return entry(m[3],m[1],m[2],raw);
 m=clean.match(multiply);
 if(m)return entry(m[1],m[2],'',raw);
 if(isOrder){
  m=clean.match(bare);
  // A unit alone is not a product name: "2 thùng" / "2 gói" are
  // incomplete pick instructions and must stay in the raw message.
  if(m){
    const onlyUnit=['thùng','thung','th','lốc','loc','hộp','hop','gói','goi','chai','bịch','bich','bao','kiện','kien','cái','cai','kg','lon','cây','cay','bộ','bo'];
    if(!onlyUnit.includes(m[2].trim().toLocaleLowerCase('vi-VN')))
      return entry(m[2],m[1],'',raw);
  }
 }
 // Bare trailing numbers are deliberately NOT quantities:
 // "cosy 480 335" and "Mì chính bát 2" may be names/prices.
 return null;
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
 let active='other';
 for(const line of lines){
  const t=topicLine(line);
  if(t){active=t.key;heads.add(active);if(t.rest)notes.push({topic:active==='items'?'other':active,text:t.rest});continue;}
  const item=parseLine(line,cue||active==='items');
  if(item){items.push(item);continue;}
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
  for(const item of parsed.items){
   const row=el('div','incoming-brief-item');
   row.append(el('span','incoming-brief-product',item.name),
    el('span','incoming-brief-quantity',item.qty+(item.unit?' '+item.unit:'')));
   list.append(row);
  }
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
 root.append(original);
 target.replaceChildren(root);
 target.dataset.hasLink='false';
 target.dataset.richText='true';
 target.dataset.autoLayout=parsed.kind;
 return true;
}
global.V21IncomingMessageLayout=Object.freeze({analyze,render});
})(window);
,'iu').test(m[2].trim()))
   return entry(m[2],m[1],'',raw);
 }
 // Bare trailing numbers are deliberately NOT quantities:
 // "cosy 480 335" and "Mì chính bát 2" may be names/prices.
 return null;
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
 let active='other';
 for(const line of lines){
  const t=topicLine(line);
  if(t){active=t.key;heads.add(active);if(t.rest)notes.push({topic:active==='items'?'other':active,text:t.rest});continue;}
  const item=parseLine(line,cue||active==='items');
  if(item){items.push(item);continue;}
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
  for(const item of parsed.items){
   const row=el('div','incoming-brief-item');
   row.append(el('span','incoming-brief-product',item.name),
    el('span','incoming-brief-quantity',item.qty+(item.unit?' '+item.unit:'')));
   list.append(row);
  }
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
 root.append(original);
 target.replaceChildren(root);
 target.dataset.hasLink='false';
 target.dataset.richText='true';
 target.dataset.autoLayout=parsed.kind;
 return true;
}
global.V21IncomingMessageLayout=Object.freeze({analyze,render});
})(window);
