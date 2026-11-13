// NCC-001 — pure supplier invoice validation/matching. No network, sends or price writes.
export function nameKey(value){
  return String(value??'').normalize('NFKC').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d')
    .toLowerCase().replace(/(\d),(\d)/g,'$1.$2')
    .replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
}
export function invoiceDate(value){
  const raw=String(value??'').trim();
  const m=/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(raw);
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const y=Number(m?m[3]:iso?.[1]),month=Number(m?m[2]:iso?.[2]),day=Number(m?m[1]:iso?.[3]);
  if(!y||y<2000||y>2100||!month||!day)return null;
  const d=new Date(Date.UTC(y,month-1,day));
  return d.getUTCFullYear()===y&&d.getUTCMonth()===month-1&&d.getUTCDate()===day
    ?d.toISOString().slice(0,10):null;
}
export function documentKey({senderId,date,invoiceNumber,imageHash}){
  const sender=String(senderId??'').trim();
  if(!sender)return null;
  const d=invoiceDate(date),number=String(invoiceNumber??'').trim().toUpperCase().replace(/\s+/g,'');
  if(d&&number)return `ncc:${sender}:${d}:${number}`;
  const hash=String(imageHash??'').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash)?`ncc:${sender}:sha256:${hash}`:null;
}
function positive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function money(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
export function validatePrintedInvoice(raw={}){
  if(raw.classification!=='supplier_invoice')return {ok:false,reason:'not_supplier_invoice',lines:[]};
  const date=invoiceDate(raw.date),number=String(raw.invoiceNumber||'').trim()||null;
  if(!date)return {ok:false,reason:'date_unverified',lines:[]};
  if(!Array.isArray(raw.lines)||raw.lines.length<1||raw.lines.length>300)
    return {ok:false,reason:'lines_missing',lines:[]};
  const lines=[];
  for(let i=0;i<raw.lines.length;i++){
    const x=raw.lines[i]||{},name=String(x.printedName||'').trim();
    const quantity=positive(x.quantity),unitPrice=money(x.unitPriceVnd),lineTotal=money(x.lineTotalVnd);
    if(!name||!quantity||unitPrice===null||lineTotal===null
      ||Math.abs(quantity*unitPrice-lineTotal)>0.01){
      return {ok:false,reason:'line_arithmetic_or_ocr_uncertain',row:i+1,lines:[]};
    }
    lines.push({row:i+1,printedName:name,quantity,printedUnit:String(x.printedUnit||'').trim(),
      unitPriceVnd:unitPrice,lineTotalVnd:lineTotal});
  }
  const total=lines.reduce((sum,x)=>sum+x.lineTotalVnd,0);
  const printedTotal=money(raw.printedTotalVnd);
  if(printedTotal===null||Math.abs(total-printedTotal)>0.01)
    return {ok:false,reason:'total_mismatch_or_missing',lines,total,printedTotal};
  return {ok:true,date,invoiceNumber:number,lines,total,quantity:lines.reduce((a,x)=>a+x.quantity,0)};
}
export function matchSupplierLine(line,products=[],aliases=[],senderId=''){
  const key=nameKey(line.printedName),unit=nameKey(line.printedUnit);
  if(!key)return {status:'manual',reason:'missing_name',options:[]};
  const valid=(products||[]).filter(p=>p&&p.product_code&&!p.deleted_at&&p.sync_status!=='deleted'&&p.is_active!==false);
  const byId=new Map(valid.map(p=>[String(p.product_code),p]));
  const alias=(aliases||[]).filter(a=>String(a.chat_account_id)===String(senderId)
    &&a.supplier_name_key===key&&nameKey(a.supplier_unit_key)===unit);
  const aliasCandidates=alias.map(a=>({product:byId.get(String(a.product_code)),factor:Number(a.unit_factor),method:'alias'}))
    .filter(a=>a.product&&Number.isFinite(a.factor)&&a.factor>0);
  // An exact product name is not proof of packaging. Require explicit unit agreement;
  // missing supplier unit can only match through a curated supplier alias.
  const exact=valid.filter(p=>nameKey(p.product_name)===key && unit
    &&nameKey(p.input_price_basis||p.retail_unit)===unit)
    .map(product=>({product,factor:1,method:'exact'}));
  const candidates=aliasCandidates.length?aliasCandidates:exact;
  if(candidates.length!==1)return {status:'manual',reason:candidates.length?'ambiguous':'no_verified_unit_match',
    options:valid.filter(p=>nameKey(p.product_name).includes(key)||key.includes(nameKey(p.product_name)))
      .slice(0,8).map(p=>({product_code:p.product_code,product_name:p.product_name}))};
  const {product,factor,method}=candidates[0];
  const cost=line.unitPriceVnd/factor;
  const oldCost=Number(product.input_price_vnd??product.cost);
  const deviation=Number.isFinite(oldCost)&&oldCost>0?Math.abs(cost-oldCost)/oldCost:null;
  return {status:deviation!==null&&deviation>0.20?'manual':'matched',
    reason:deviation!==null&&deviation>0.20?'price_jump':null,
    product_code:product.product_code,method,unitFactor:factor,costVnd:cost,
    oldCostVnd:Number.isFinite(oldCost)?oldCost:null,
    deviationPercent:deviation===null?null:Math.round(deviation*10000)/100};
}
export function previewInvoice(raw,products=[],aliases=[],senderId=''){
  const checked=validatePrintedInvoice(raw);
  if(!checked.ok)return {...checked,rows:[],ready:false};
  const rows=checked.lines.map(line=>({...line,...matchSupplierLine(line,products,aliases,senderId)}));
  return {...checked,rows,ready:rows.every(x=>x.status==='matched'),
    matched:rows.filter(x=>x.status==='matched').length,
    manual:rows.filter(x=>x.status!=='matched').length};
}
