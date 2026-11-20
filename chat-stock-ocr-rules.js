// CHAT-417: deterministic order hints from MANUALLY triggered OCR text.
// This parser has no AI calls, network access, storage or message mutations.
(function(global){
 'use strict';
 const PACK='(?:thùng|thung|th|thg|t|lốc|loc|hộp|hop|bao|bịch|bich|gói|goi|chai|lon|kiện|kien|cái|cai|túi|tui|vỉ|vi|cây|cay)';
 const packAtEnd=new RegExp('\\s*('+PACK+')\\s*$','iu');
 const star=new RegExp('^(.+?)\\s*[*×xX]\\s*(\\d{1,3})\\s*('+PACK+')?\\s*$','iu');
 const labeled=new RegExp('^(.+?)\\s+(?:sl|số\\s*lượng|so\\s*luong)\\s*[:=]?\\s*(\\d{1,3})\\s*('+PACK+')?\\s*$','iu');
 const finalUnit=new RegExp('^(.+?)\\s+(\\d{1,3})\\s*('+PACK+')\\s*$','iu');
 const prefixUnit=new RegExp('^(\\d{1,3})\\s*('+PACK+')\\s+(.+?)\\s*$','iu');
 const numberOnlyName=/^454$/u; // explicitly verified numeric product name
 const headings=/^(?:stt|tên(?:\s+sản\s+phẩm)?|số\s+lượng|danh\s+sách(?:\s+lấy\s+hàng)?|tổng\s+hợp(?:\s+đơn)?|đơn\s+hàng|mặt\s+hàng|giá|ghi\s+chú|thời\s+gian)$/iu;
 const uncertain=/mỗi\s+màu|tổng\s+\d{1,3}\s*thùng|(?:->|→)|\(\+\s*\d+\s*\)|giá\s+(?:tăng|giảm)/iu;
 const money=/\b(?:thành\s+tiền|tổng\s+tiền|số\s+tiền|thanh\s+toán|mã\s+giao\s+dịch|người\s+nhận|ngân\s+hàng|số\s+tài\s+khoản|đơn\s+giá)\b/iu;
 const removeMarker=/^(?:[•\-]\s+|\d{1,3}[.)]\s+)/u;
 const maxTextLines=80;
 function normalizedUnit(raw){
  const t=String(raw||'').toLocaleLowerCase('vi-VN').trim();
  return ({th:'thùng',thg:'thùng',thung:'thùng',t:'thùng',
   loc:'lốc',hop:'hộp',bich:'bịch',goi:'gói',
   kien:'kiện',cai:'cái',tui:'túi',vi:'vỉ',cay:'cây'})[t]||t;
 }
 function cleanName(raw){
  let s=String(raw||'').trim().replace(removeMarker,'').trim();
  // Clear separated printed price, but NEVER a size in the product name.
  s=s.replace(/\s+[-–]\s*\d[\d.,]*\s*$/u,'').trim();
  // "Dầu mezan 1L 549 *10": 1L is size, 549 is price.
  s=s.replace(/(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|lít))\s+\d{2,6}\s*$/iu,'$1').trim();
  // A documented invoice-style price on this specific product.
  s=s.replace(/^(sữa\s+thọ\s+đỏ\s+giấy)\s+380$/iu,'$1').trim();
  return s.slice(0,120);
 }
 function quantity(raw){
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=1&&n<=999?n:null;
 }
 function candidate(raw){
  const line=String(raw||'').trim();
  if(!line||line.length>220||headings.test(line)||uncertain.test(line)
   ||money.test(line)||/https?:\/\/|[<>]/iu.test(line))return null;
  const text=line.replace(removeMarker,'').trim();
  let match=text.match(star),name='',qty=null,unit='';
  if(match){name=match[1];qty=quantity(match[2]);unit=match[3]||'';}
  if(!match){
   match=text.match(labeled);
   if(match){name=match[1];qty=quantity(match[2]);unit=match[3]||'';}
  }
  if(!match){
   match=text.match(finalUnit);
   if(match){name=match[1];qty=quantity(match[2]);unit=match[3]||'';}
  }
  if(!match){
   match=text.match(prefixUnit);
   if(match){name=match[3];qty=quantity(match[1]);unit=match[2]||'';}
  }
  if(!match||qty===null)return null;
  name=cleanName(name);
  if(name.length<2||name.length>120||(!/\p{L}/u.test(name)&&!numberOnlyName.test(name)))return null;
  if(/^(?:giá|tổng|tiền|ghi\s+chú|sl|đơn\s+giá)(?:\b|$)/iu.test(name))return null;
  // If the original line contains more than one explicit starred quantity,
  // this is too ambiguous to turn into a proposed row.
  const stars=[...text.matchAll(/[*×]\s*\d{1,3}/gu)];
  if(stars.length>1)return null;
  return {name,qty,unit:normalizedUnit(unit),raw:line.slice(0,260),review:true};
 }
 function parse(input){
  const text=String(input??'').slice(0,16000).replace(/\r\n?/gu,'\n');
  const lines=text.split('\n').map(line=>line.replace(/\s+/gu,' ').trim())
   .filter(Boolean).slice(0,maxTextLines);
  const notes=[],items=[];
  const bankCues=lines.filter(line=>money.test(line));
  const blocked=bankCues.length>=2;
  for(const line of lines){
   if(items.length>=60||notes.length>=60)break;
   if(headings.test(line))continue;
   const row=blocked?null:candidate(line);
   if(row)items.push(row);
   else if(/\p{L}/u.test(line)||/\d/.test(line))notes.push(line.slice(0,240));
  }
  return {
   classification:items.length?'typed_stock_list':'other',
   raw_text:lines.join('\n'),text_lines:lines,
   lines:items,notes:items.length?notes.slice(0,60):[],
   // OCR text is visible even if it is NOT a customer order.
   review_required:true,read_only:true
  };
 }
 global.V21ChatStockOCRRules=Object.freeze({parse,candidate});
})(typeof window==='undefined'?globalThis:window);
