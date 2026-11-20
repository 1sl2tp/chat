// CHAT-419: pure read-only grouping for scanned supplier slips.
// Each original invoice remains independently reviewable; never post inventory.
(function(global){
 'use strict';
 const HASH=/^[a-f0-9]{64}$/iu;
 const TYPE_LABELS=Object.freeze({general:'Hàng thường',u:'Hàng U',tobacco:'Thuốc lá',other:'Hàng khác'});
 const num=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
 const qty=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
 const text=value=>String(value??'').trim().slice(0,150);
 const normal=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .replace(/đ/giu,'d').toLocaleLowerCase('vi').replace(/\s+/gu,' ');
 function dayISO(value){
  if(typeof value!=='string')return '';
  const raw=value.trim();
  let y,m,d;
  let match=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/u);
  if(match){y=+match[1];m=+match[2];d=+match[3];}
  else{
   match=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/u);
   if(!match)return '';
   d=+match[1];m=+match[2];y=+match[3];
  }
  if(y<2020||y>2100||m<1||m>12||d<1||d>31)return '';
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return '';
  return [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
 }
 function dayVN(iso){
  const s=dayISO(iso);
  return s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
 }
 function dateFor(record,meta={}){
  const manual=dayISO(meta.day||'');
  if(manual)return{day:manual,basis:'đã chọn ngày'};
  const printed=dayISO(record?.document?.date||'');
  if(printed)return{day:printed,basis:'ngày trên phiếu'};
  const message=dayISO(meta.messageDay||'');
  if(message)return{day:message,basis:'ngày ảnh trong Chat'};
  const read=dayISO(record?.created_at||'');
  return read?{day:read,basis:'ngày đọc, chưa xác minh ngày phiếu'}:null;
 }
 function aggregate(records,links,sourceList){
  const sources=new Map((Array.isArray(sourceList)?sourceList:[])
   .filter(source=>source?.selected&&source.group!=='customer')
   .map(source=>[String(source.id),source]));
  const items=new Map();
  const seen=new Set();
  for(const record of Array.isArray(records)?records:[]){
   const hash=String(record?.hash||'').toLowerCase();
   if(!HASH.test(hash)||seen.has(hash))continue;
   seen.add(hash);
   const link=links&&typeof links==='object'?links[hash]:null;
   const contactId=String(link?.contactId||'');
   const source=sources.get(contactId);
   if(!source||record?.status==='not_invoice')continue;
   const dated=dateFor(record,link);
   if(!dated)continue;
   const groupKey=contactId+'|'+dated.day;
   if(!items.has(groupKey))items.set(groupKey,{
    id:groupKey,day:dated.day,dateLabel:dayVN(dated.day),
    contactId,sourceName:text(source.name),
    type:source.type||'other',typeLabel:TYPE_LABELS[source.type]||TYPE_LABELS.other,
    invoices:[],rows:[],bases:new Set(),review:false,
    grossTotal:0,netTotal:0,printedPayable:0,
    grossComplete:true,netComplete:true,payableComplete:true,
    missingPrices:0,discountUncertain:false
   });
   const group=items.get(groupKey);
   group.invoices.push(hash);group.bases.add(dated.basis);
   const status=String(record?.summary?.status||'');
   if(status!=='verified')group.review=true;
   const printed=num(record?.summary?.payable_printed_vnd);
   if(printed!==null&&status==='verified')group.printedPayable+=printed;
   else group.payableComplete=false;
   const rowMap=group._rows||(group._rows=new Map());
   const lines=Array.isArray(record?.lines)?record.lines:[];
   for(const line of lines.slice(0,100)){
    const name=text(line?.printed_name);
    const quantity=qty(line?.quantity);
    if(!name||quantity===null){group.review=true;continue;}
    const unit=text(line?.printed_unit);
    const price=num(line?.unit_price_vnd);
    const afterPrice=num(line?.net_unit_vnd);
    const gross=num(line?.gross_line_vnd??line?.line_total_vnd);
    const net=num(line?.net_line_vnd);
    // The printed product name and packaging must match. Different prices
    // remain distinct rows: no invented average price and no silent price merge.
    const key=normal(name)+'|'+normal(unit)+'|'+String(price??'unknown')+'|'+String(afterPrice??'unknown');
    let row=rowMap.get(key);
    if(!row){
     row={name,unit,quantity:0,price,afterPrice,gross:0,net:0,
      grossComplete:true,netComplete:true,invoiceHashes:[]};
     rowMap.set(key,row);
    }
    row.quantity+=quantity;
    if(!row.invoiceHashes.includes(hash))row.invoiceHashes.push(hash);
    if(gross===null){row.grossComplete=false;group.grossComplete=false;group.missingPrices++;}
    else{row.gross+=gross;group.grossTotal+=gross;}
    if(net===null){row.netComplete=false;group.netComplete=false;}
    else{row.net+=net;group.netTotal+=net;}
   }
  }
  const result=[...items.values()].map(group=>{
   group.rows=[...(group._rows||new Map()).values()].map(row=>({
    ...row,gross:row.grossComplete?row.gross:null,
    net:row.netComplete?row.net:null
   }));
   delete group._rows;
   if(group.invoices.length>1&&group.bases.has('ngày đọc, chưa xác minh ngày phiếu'))group.review=true;
   group.grossTotal=group.grossComplete?group.grossTotal:null;
   group.netTotal=group.netComplete?group.netTotal:null;
   group.printedPayable=group.payableComplete?group.printedPayable:null;
   group.bases=[...group.bases];
   return group;
  });
  result.sort((a,b)=>b.day.localeCompare(a.day)||a.type.localeCompare(b.type)||a.sourceName.localeCompare(b.sourceName,'vi'));
  return result;
 }
 function storageKey(accountId){return 'chat-ncc-invoice-sources-v1:'+String(accountId||'');}
 function load(accountId,storage=global.localStorage){
  if(!accountId)return {};
  try{
   const value=JSON.parse(storage?.getItem(storageKey(accountId))||'{}');
   return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return {};}
 }
 function save(accountId,hash,metadata,storage=global.localStorage){
  if(!accountId||!HASH.test(String(hash||''))||!metadata?.contactId)return false;
  const data=load(accountId,storage);
  const date=dayISO(String(metadata.day||'')),messageDay=dayISO(String(metadata.messageDay||''));
  data[String(hash).toLowerCase()]={contactId:String(metadata.contactId).slice(0,128),
   ...(date?{day:date}:{}),...(messageDay?{messageDay}:{}),
   updatedAt:new Date().toISOString()};
  try{storage?.setItem(storageKey(accountId),JSON.stringify(data));return true;}catch{return false;}
 }
 function unlink(accountId,hash,storage=global.localStorage){
  if(!accountId||!HASH.test(String(hash||'')))return false;
  const data=load(accountId,storage);
  delete data[String(hash).toLowerCase()];
  try{storage?.setItem(storageKey(accountId),JSON.stringify(data));return true;}catch{return false;}
 }
 global.V21NccDayGroups=Object.freeze({aggregate,dateFor,dayISO,dayVN,load,save,unlink,types:TYPE_LABELS});
})(typeof window==='undefined'?globalThis:window);
