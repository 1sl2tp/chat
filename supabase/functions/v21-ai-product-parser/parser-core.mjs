function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function quantityText(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)return '1';
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

export function splitCustomerSegments(value){
  return String(value??'')
    .replace(/\r\n?/g,'\n')
    .split(/\n/)
    .flatMap(line=>line.split(/\s*(?:,|;)\s*|\s+\/\s+/))
    .map(part=>part.replace(/^\s*[-•]\s*/,'').trim())
    .filter(Boolean);
}

export function finalizeProductLines(items,catalog){
  const byCode=new Map(
    (Array.isArray(catalog)?catalog:[])
      .filter(row=>row?.productCode&&row?.productName)
      .map(row=>[String(row.productCode),String(row.productName)])
  );

  return (Array.isArray(items)?items:[]).map(item=>{
    const quantity=Number.isFinite(Number(item?.quantity))&&Number(item.quantity)>0
      ?Number(item.quantity)
      :1;
    const requestedCode=clean(item?.product_code||item?.productCode);
    const canonicalName=requestedCode?byCode.get(requestedCode):null;
    const matched=Boolean(canonicalName);
    const productName=matched
      ?clean(canonicalName)
      :clean(item?.product_name||item?.productName||item?.raw_text||item?.rawText)||'chưa rõ tên';

    return {
      quantity,
      productCode:matched?requestedCode:null,
      productName,
      matched,
      line:`${quantityText(quantity)} ${productName}${matched?'':' (chưa có SKU)'}`,
    };
  });
}
