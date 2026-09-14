function seq(value){
  const n=Number(value?.sourceSeq??value?.source_seq??0);
  return Number.isSafeInteger(n)&&n>0?n:0;
}
function clean(value){return String(value??'').replace(/\r\n?/g,'\n').trim();}

export function sortSourcesBySequence(rows){
  return [...(Array.isArray(rows)?rows:[])].sort((a,b)=>seq(a)-seq(b));
}

export function sourcesAfterCursor(rows,lastSourceSeq=0){
  const cursor=Number(lastSourceSeq)||0;
  return sortSourcesBySequence(rows).filter(row=>seq(row)>cursor);
}

export function buildScanSourceText(rows){
  return sortSourcesBySequence(rows)
    .map(row=>clean(row?.text??row?.body))
    .filter(Boolean)
    .join('\n\n');
}
