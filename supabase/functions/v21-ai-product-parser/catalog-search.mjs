function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function normalize(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/gi,'d')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const SEARCH_WORD_DICTIONARY=new Map([
  ['ko','khong'],
]);

function normalizeSearch(value){
  return normalize(value)
    .split(' ')
    .filter(Boolean)
    .map(token=>SEARCH_WORD_DICTIONARY.get(token)||token)
    .join(' ');
}

function tokens(value){
  return normalize(value).split(' ').filter(Boolean);
}

function quantityText(value){
  const n=Number(value);
  if(!Number.isFinite(n))return String(value??'').trim();
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

function rowName(row){
  return clean(row?.name??row?.product_name??row?.productName);
}

function rowId(row){
  return clean(row?.id??row?.product_id??row?.productId??row?.product_code??row?.productCode);
}

function uniqueNameMatch(rows){
  const byName=new Map();
  for(const row of rows){
    const productName=rowName(row);
    const key=normalize(productName);
    if(!productName||!key||byName.has(key))continue;
    byName.set(key,{productName,productId:rowId(row)||null});
  }
  return byName.size===1?[...byName.values()][0]:null;
}

export function findCatalogProduct(productText,catalog=[]){
  const query=normalizeSearch(productText);
  if(!query)return null;

  const rows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));
  const exact=rows.filter(row=>normalize(rowName(row))===query);
  if(exact.length)return uniqueNameMatch(exact);

  const queryTokens=tokens(query);
  if(queryTokens.length<2)return null;

  const candidates=rows.filter(row=>{
    const candidateTokens=tokens(rowName(row));
    const candidateSet=new Set(candidateTokens);
    if(!queryTokens.every(token=>candidateSet.has(token)))return false;
    return queryTokens.length/candidateTokens.length>=0.5;
  });
  return uniqueNameMatch(candidates);
}

export function resolveParsedLinesWithCatalog(lines,catalog=[]){
  return (Array.isArray(lines)?lines:[]).map(row=>{
    const rawProductName=clean(row?.productName);
    const match=findCatalogProduct(rawProductName,catalog);
    if(!match)return {...row,catalogMatched:false};

    const productName=match.productName;
    const changed=clean(productName)!==rawProductName;
    const review=changed&&rawProductName?` (${rawProductName})`:'';
    return {
      ...row,
      rawProductName,
      productName,
      productId:match.productId,
      catalogMatched:true,
      line:`${quantityText(row?.quantity)} ${productName}${review}`,
    };
  });
}
