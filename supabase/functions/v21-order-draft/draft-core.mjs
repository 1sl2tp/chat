export function normalizeDraftLines(value){
  if(!Array.isArray(value)||!value.length)throw new Error('draft_lines_required');
  return value.map(row=>{
    const quantity=Number(row?.quantity);
    const name=String(row?.name??'').trim();
    if(!Number.isFinite(quantity)||quantity<=0||!name)throw new Error('invalid_draft_line');
    return {quantity,name};
  });
}

export function normalizePrice(value){
  const price=Number(String(value??'').replace(/[.,\s]/g,''));
  if(!Number.isFinite(price)||price<0)throw new Error('invalid_price');
  return price;
}

export function productId(uuid){
  const suffix=String(uuid??'').replace(/-/g,'').slice(0,12).toUpperCase();
  if(!/^[A-F0-9]{12}$/.test(suffix))throw new Error('invalid_product_id_seed');
  return `CHAT-${suffix}`;
}
