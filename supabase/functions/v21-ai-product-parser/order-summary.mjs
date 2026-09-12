function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function normalize(value){
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/gi,'d')
    .toLowerCase();
}

function quantityValue(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}

function quantityText(value){
  const n=Number(value);
  if(!Number.isFinite(n))return '0';
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

const TOBACCO_PHRASE_HINTS=['thang long','sai gon','ba so'];

function containsPhrase(text,phrase){
  const haystack=` ${normalize(text)} `;
  const needle=` ${normalize(phrase)} `;
  return haystack.includes(needle);
}

function hasTobaccoPhrase(row){
  for(const candidate of [row?.productName,row?.rawProductName,row?.line]){
    if(!candidate)continue;
    if(TOBACCO_PHRASE_HINTS.some(phrase=>containsPhrase(candidate,phrase)))return true;
  }
  return false;
}

function catalogSourceLookup(catalog=[]){
  const byId=new Map();
  const byName=new Map();

  for(const row of Array.isArray(catalog)?catalog:[]){
    const source=clean(row?.source);
    if(!source)continue;

    const id=clean(row?.id??row?.product_id??row?.productId??row?.product_code??row?.productCode);
    if(id)byId.set(id,source);

    const name=normalize(row?.name??row?.product_name??row?.productName);
    if(!name)continue;
    const existing=byName.get(name);
    if(existing===undefined)byName.set(name,source);
    else if(existing!==source)byName.set(name,null);
  }

  return {byId,byName};
}

function rowSource(row,lookup){
  const direct=clean(row?.source);
  if(direct)return direct;

  const id=clean(row?.productId??row?.product_id??row?.id);
  if(id&&lookup.byId.has(id))return clean(lookup.byId.get(id));

  for(const candidate of [row?.productName,row?.rawProductName]){
    const name=normalize(candidate);
    if(!name)continue;
    const source=lookup.byName.get(name);
    if(source)return clean(source);
  }

  if(hasTobaccoPhrase(row))return 'Thuốc lá';
  return '';
}

function isTobaccoSource(source){
  return normalize(source)==='thuoc la';
}

export function formatOrderSummary(rows=[],catalog=[]){
  const items=Array.isArray(rows)?rows:[];
  const lookup=catalogSourceLookup(catalog);
  let cartonQuantity=0;
  let tobaccoTrees=0;

  for(const row of items){
    const quantity=quantityValue(row?.quantity);
    if(isTobaccoSource(rowSource(row,lookup)))tobaccoTrees+=quantity;
    else cartonQuantity+=quantity;
  }

  let footer=`— Tổng: ${items.length} mã · ${quantityText(cartonQuantity)} thùng`;
  if(tobaccoTrees>0){
    footer+=` · Thuốc lá: ${quantityText(tobaccoTrees)} cây`;
    if(tobaccoTrees>50){
      const approximateCartons=Math.max(1,Math.round(tobaccoTrees/60));
      footer+=` ~ ${approximateCartons} thùng`;
    }
  }
  return footer;
}
