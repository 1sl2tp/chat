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

function clean(value){
  return String(value??'').trim();
}

function positiveNumber(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:null;
}

function publicItem(row={}){
  const display=positiveNumber(row?.sale_price_vnd??row?.display_price_vnd);
  if(!display)return null;
  const basis=clean(row?.input_price_basis).toLowerCase()==='retail'?'retail':'carton';
  const retailUnit=clean(row?.retail_unit);
  const carton=positiveNumber(row?.carton_price_vnd) ?? (basis==='carton'?display:null);
  const retail=positiveNumber(row?.retail_price_vnd) ?? (basis==='retail'?display:null);
  const primary=clean(row?.primary_packaging) || (
    basis==='retail'
      ?(retailUnit?`1 ${retailUnit}`:'Lẻ')
      :'Thùng'
  );
  const retailPackaging=clean(row?.retail_packaging) || (
    retail
      ?(retailUnit?`1 ${retailUnit}`:'Lẻ')
      :''
  );
  const item={
    product_code:row?.product_code??null,
    product_name:row?.product_name??null,
    source_key:row?.source_key??null,
    display_price_vnd:display,
    carton_price_vnd:carton,
    retail_price_vnd:retail,
    primary_packaging:primary,
    retail_packaging:retailPackaging,
    units_per_carton:row?.units_per_carton??null,
    retail_unit:row?.retail_unit??null,
  };
  return Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,item[key]??null]));
}

export function buildQuoteItems(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(publicItem).filter(Boolean);
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
    sources:Array.isArray(payload?.sources)?payload.sources:[],
    items:Array.isArray(payload?.items)?payload.items:[],
  };
}
