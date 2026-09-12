const PUBLIC_FIELDS=[
  'product_code',
  'product_name',
  'source_key',
  'display_price_vnd',
  'carton_price_vnd',
  'retail_price_vnd',
  'primary_packaging',
  'retail_packaging',
  'units_per_carton',
  'retail_unit',
];

export function buildQuoteItems(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .filter(row=>Number(row?.display_price_vnd)>0)
    .map(row=>Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,row?.[key]??null])));
}

export function makePublicPayload(snapshot={}){
  const payload=snapshot?.payload&&typeof snapshot.payload==='object'?snapshot.payload:{};
  return {
    ok:true,
    scope:snapshot?.scope??'all',
    source_key:snapshot?.source_key??null,
    source_name:snapshot?.source_name??null,
    item_count:Number(snapshot?.item_count)||0,
    created_at:snapshot?.created_at??null,
    items:Array.isArray(payload?.items)?payload.items:[],
  };
}
