// NCC-010 · Deterministic canonical product identity.
// Invoice names, TAPHOA catalog names and Vietnamese display names are separate.
// Product prices are never written by this module.
export function normalizeProductName(value){
 return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[đĐ]/g,"d").toLocaleLowerCase("vi-VN")
  .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
const normalizedTokens=value=>new Set(normalizeProductName(value).split(" ").filter(Boolean));
function similar(a,b){
 const x=normalizedTokens(a),y=normalizedTokens(b);
 if(x.size<2||y.size<2)return 0;
 let common=0;for(const word of x)if(y.has(word))common++;
 const recall=common/Math.max(x.size,y.size);
 return recall>=0.75&&common>=2?recall:0;
}
function priceOf(line){
 const net=Number(line?.net_unit_vnd);
 if(line?.net_unit_vnd!==null&&line?.net_unit_vnd!==undefined&&
    Number.isFinite(net)&&net>=0)return {value:net,kind:"after_discount"};
 const gross=Number(line?.unit_price_vnd);
 if(line?.unit_price_vnd!==null&&line?.unit_price_vnd!==undefined&&
    Number.isFinite(gross)&&gross>=0)return {value:gross,kind:"printed_before_discount"};
 return {value:null,kind:"unreadable"};
}
export function linkInvoiceLines(lines=[],products=[],aliases=[],translations=[]){
 const canonical=(Array.isArray(products)?products:[])
  .filter(p=>p?.product_code&&p?.product_name&&p?.is_active!==false&&p?.deleted_at==null);
 const byCode=new Map(canonical.map(p=>[String(p.product_code),p]));
 const names=new Map((Array.isArray(translations)?translations:[])
  .filter(x=>x?.product_code&&x?.vietnamese_name)
  .map(x=>[String(x.product_code),String(x.vietnamese_name)]));
 const aliasBuckets=new Map();
 for(const row of Array.isArray(aliases)?aliases:[]){
  const key=normalizeProductName(row?.alias_key||row?.alias_name);
  const code=String(row?.product_code||"");
  if(!key||!byCode.has(code))continue;
  if(!aliasBuckets.has(key))aliasBuckets.set(key,new Set());
  aliasBuckets.get(key).add(code);
 }
 return (Array.isArray(lines)?lines:[]).map((line,index)=>{
  const raw=String(line?.printed_name||"");
  const key=normalizeProductName(raw);
  const price=priceOf(line);
  const base={
   row_no:line?.row_no??index+1,printed_name:raw,
   invoice_purchase_unit_vnd:price.value,invoice_price_basis:price.kind,
   product_code:null,product_name:null,vietnamese_name:null,
   status:"unmatched",candidates:[],matched_by:null
  };
  if(!key)return base;
  const confirmed=[...(aliasBuckets.get(key)||[])];
  let candidates=[],status="unmatched",matchedBy=null;
  if(confirmed.length===1){
   candidates=confirmed;status="linked";matchedBy="admin_approved_alias";
  }else if(confirmed.length>1){
   candidates=confirmed;status="ambiguous";matchedBy="conflicting_alias";
  }else{
   const exact=canonical.filter(p=>
    normalizeProductName(p.product_code)===key||
    normalizeProductName(p.product_name)===key||
    (names.has(String(p.product_code))&&normalizeProductName(names.get(String(p.product_code)))===key)
   ).map(p=>String(p.product_code));
   if(exact.length){
    candidates=exact;status=exact.length===1?"suggested":"ambiguous";matchedBy="exact_catalog_name";
   }else{
    const scored=canonical.map(p=>{
     const value=Math.max(similar(raw,p.product_name),similar(raw,names.get(String(p.product_code))||""));
     return {code:String(p.product_code),score:value};
    }).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
    candidates=scored.slice(0,3).map(x=>x.code);
    if(candidates.length){status="suggested";matchedBy="similar_name_review_only";}
   }
  }
  const list=[...new Set(candidates)].filter(code=>byCode.has(code)).slice(0,3).map(code=>{
   const p=byCode.get(code);
   return {product_code:code,product_name:p.product_name,
    vietnamese_name:names.get(code)||null};
  });
  const selected=(status==="linked"||status==="suggested"&&list.length===1&&matchedBy==="exact_catalog_name")?list[0]:null;
  return {...base,status,matched_by:matchedBy,candidates:list,
   product_code:selected?.product_code||null,product_name:selected?.product_name||null,
   vietnamese_name:selected?.vietnamese_name||null};
 });
}
