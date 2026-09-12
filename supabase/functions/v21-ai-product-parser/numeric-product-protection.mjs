import { findCatalogProduct } from './catalog-search.mjs';

function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function numberValue(value){
  const n=Number(String(value??'').replace(',','.'));
  return Number.isFinite(n)&&n>0?n:null;
}

function quantityText(value){
  const n=Number(value);
  if(!Number.isFinite(n))return clean(value);
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

function numericLeadingAlternative(row,catalog){
  const rawProductName=clean(row?.productName);
  const match=rawProductName.match(/^(.*?)(?:\s+)?(\d+(?:[.,]\d+)?)$/u);
  if(!match)return null;

  const trailingQuantity=numberValue(match[2]);
  if(trailingQuantity==null)return null;

  const candidate=clean(`${quantityText(row?.quantity)} ${clean(match[1])}`);
  if(!candidate)return null;

  const catalogMatch=findCatalogProduct(candidate,catalog);
  if(!catalogMatch)return null;

  return {
    ...row,
    quantity:trailingQuantity,
    productName:candidate,
    line:`${quantityText(trailingQuantity)} ${candidate}`,
  };
}

export function protectNumericLeadingProducts(lines,catalog=[]){
  const rows=Array.isArray(lines)?lines:[];
  const catalogRows=Array.isArray(catalog)?catalog:[];

  return rows.map(row=>{
    // Keep the normal Part 1 interpretation whenever that product phrase
    // already resolves exactly/deterministically in the catalog.
    if(findCatalogProduct(clean(row?.productName),catalogRows))return row;

    // Otherwise try the only competing shape: the leading number belongs to
    // the product key and the final number is quantity. Accept it only when
    // the reconstructed product phrase itself resolves deterministically.
    return numericLeadingAlternative(row,catalogRows)||row;
  });
}
