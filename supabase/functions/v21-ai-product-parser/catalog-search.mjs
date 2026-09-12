function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function normalizeLoose(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/gi,'d')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeQuery(value){
  return normalizeLoose(value);
}

function quantityText(value){
  const n=Number(value);
  if(!Number.isFinite(n))return clean(value);
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

const LEVEL_FIELDS=['level1','level2','level3','level4','level5','level6','level7','level8','level9'];

function rowName(row){
  return clean(row?.name??row?.product_name??row?.productName);
}

function rowId(row){
  return clean(row?.id??row?.product_id??row?.productId??row?.product_code??row?.productCode);
}

function rowPath(row){
  return LEVEL_FIELDS
    .map(field=>normalizeLoose(row?.[field]))
    .filter(Boolean);
}

function rowAliases(row){
  const raw=row?.aliases??row?.alias??row?.product_aliases??row?.productAliases;
  const values=Array.isArray(raw)?raw:String(raw??'').split(/[|;\n]+/);
  return [...new Set(values.map(normalizeLoose).filter(Boolean))];
}

function rowKey(row){
  return rowId(row)||`${normalizeLoose(rowName(row))}\u0000${normalizeLoose(row?.source)}`;
}

function titlePrefix(prefix){
  const text=clean(prefix);
  return text?text.charAt(0).toUpperCase()+text.slice(1):'';
}

function startsWithPath(path,prefix){
  if(!prefix?.length)return true;
  if(path.length<prefix.length)return false;
  for(let i=0;i<prefix.length;i++){
    if(path[i]!==prefix[i])return false;
  }
  return true;
}

function buildCatalogIndex(catalog=[]){
  const rows=(Array.isArray(catalog)?catalog:[])
    .filter(row=>rowName(row)&&rowPath(row).length)
    .map(row=>({row,path:rowPath(row)}));

  const entries=[];
  for(const item of rows){
    const {row,path}=item;
    for(let start=0;start<path.length;start++){
      for(let end=start;end<path.length;end++){
        entries.push({
          key:path.slice(start,end+1).join(' '),
          row,
          path,
          start,
          end,
          prefix:path.slice(0,end+1),
        });
      }
    }

    // Aliases are explicit data, never guessed. They are alternate names for
    // the row's leaf key, so index the same adjacent windows with only the
    // final leaf replaced by the alias phrase. The resolved prefix remains
    // canonical (the original level path).
    const leaf=path.length-1;
    for(const alias of rowAliases(row)){
      if(alias===path[leaf])continue;
      for(let start=0;start<=leaf;start++){
        const left=path.slice(start,leaf);
        entries.push({
          key:[...left,alias].filter(Boolean).join(' '),
          row,
          path,
          start,
          end:leaf,
          prefix:path.slice(0,leaf+1),
          alias:true,
        });
      }
    }
  }

  entries.sort((a,b)=>{
    if(a.key<b.key)return -1;
    if(a.key>b.key)return 1;
    const ar=rowKey(a.row);
    const br=rowKey(b.row);
    if(ar<br)return -1;
    if(ar>br)return 1;
    return a.start-b.start||a.end-b.end;
  });

  return {rows,entries};
}

function lowerBound(entries,key){
  let lo=0;
  let hi=entries.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(entries[mid].key<key)lo=mid+1;
    else hi=mid;
  }
  return lo;
}

function upperBound(entries,key){
  let lo=0;
  let hi=entries.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(entries[mid].key<=key)lo=mid+1;
    else hi=mid;
  }
  return lo;
}

function binaryLookup(index,key,scopePrefix=null){
  if(!key)return [];
  const from=lowerBound(index.entries,key);
  const to=upperBound(index.entries,key);
  if(from>=to)return [];
  const slice=index.entries.slice(from,to);
  return scopePrefix?.length?slice.filter(entry=>startsWithPath(entry.path,scopePrefix)):slice;
}

function resolveHits(hits){
  if(!hits.length)return null;

  const byRow=new Map();
  for(const hit of hits){
    const key=rowKey(hit.row);
    if(!byRow.has(key))byRow.set(key,hit.row);
  }

  const prefixes=new Set(hits.map(hit=>hit.prefix.join(' ')).filter(Boolean));
  const canonicalNames=new Map();
  for(const row of byRow.values()){
    const name=rowName(row);
    const key=normalizeLoose(name);
    if(name&&key&&!canonicalNames.has(key))canonicalNames.set(key,name);
  }

  let productName='';
  let productId=null;
  if(byRow.size===1){
    const only=[...byRow.values()][0];
    productName=rowName(only);
    productId=rowId(only)||null;
  }else if(canonicalNames.size===1){
    productName=[...canonicalNames.values()][0];
  }else if(prefixes.size===1){
    productName=titlePrefix([...prefixes][0]);
  }else{
    return null;
  }

  const commonPrefix=prefixes.size===1?[...prefixes][0].split(' ').filter(Boolean):null;
  let anchorPrefix=commonPrefix;
  if(!anchorPrefix&&byRow.size===1){
    const onlyKey=[...byRow.keys()][0];
    const firstHit=hits.find(hit=>rowKey(hit.row)===onlyKey);
    anchorPrefix=firstHit?.prefix||firstHit?.path||null;
  }
  if(!anchorPrefix&&canonicalNames.size===1){
    const first=hits[0];
    anchorPrefix=first?.prefix||null;
  }

  return {
    productName,
    productId,
    prefix:Array.isArray(anchorPrefix)?anchorPrefix:null,
  };
}

function resolveExactKey(key,index,scopePrefix=null){
  return resolveHits(binaryLookup(index,key,scopePrefix));
}

function resolveExactPhrase(productText,index,scopePrefix=null){
  const query=normalizeQuery(productText);
  if(!query)return null;
  return resolveExactKey(query,index,scopePrefix);
}

function anchorFromResolution(result){
  const prefix=result?.prefix;
  if(!Array.isArray(prefix)||!prefix.length)return null;
  return [...prefix];
}

function sameAnchor(left,right){
  if(!left?.length||!right?.length||left.length!==right.length)return false;
  return left.every((value,index)=>value===right[index]);
}

function scanAnchor(productText,index,scopePrefix=null){
  const query=normalizeQuery(productText);
  const tokens=query.split(' ').filter(Boolean);
  if(!tokens.length)return null;

  for(let size=tokens.length;size>=1;size--){
    const anchors=[];
    for(let start=0;start<=tokens.length-size;start++){
      const key=tokens.slice(start,start+size).join(' ');
      const result=resolveExactKey(key,index,scopePrefix);
      const anchor=Array.isArray(result?.prefix)&&result.prefix.length?result.prefix:null;
      if(anchor?.length)anchors.push(anchor);
    }
    if(!anchors.length)continue;

    const unique=new Map();
    for(const anchor of anchors)unique.set(anchor.join('\u0000'),anchor);
    if(unique.size===1)return [...unique.values()][0];
  }
  return null;
}

function resolveNextPhrase(productText,index,scopePrefix){
  const query=normalizeQuery(productText);
  if(!query||!scopePrefix?.length)return null;
  const hits=binaryLookup(index,query,scopePrefix)
    .filter(hit=>hit.start===scopePrefix.length);
  return resolveHits(hits);
}

function resolveWithBackoff(productText,index,activeAnchor){
  if(!activeAnchor?.length)return null;
  for(let keep=activeAnchor.length;keep>=1;keep--){
    const scope=activeAnchor.slice(0,keep);
    const result=resolveNextPhrase(productText,index,scope);
    if(result)return result;
  }
  return null;
}

function publicMatch(result){
  return result?{productName:result.productName,productId:result.productId}:null;
}

export function findCatalogProduct(productText,catalog=[]){
  const index=buildCatalogIndex(catalog);
  return publicMatch(resolveExactPhrase(productText,index,null));
}

function resolvedRow(row,match,contextMatched=false){
  const rawProductName=clean(row?.productName);
  const changed=clean(match.productName)!==rawProductName;
  const review=changed&&rawProductName?` (${rawProductName})`:'';
  return {
    ...row,
    rawProductName,
    productName:match.productName,
    productId:match.productId,
    catalogMatched:true,
    catalogContextMatched:contextMatched,
    line:`${quantityText(row?.quantity)} ${match.productName}${review}`,
  };
}

function unresolvedRow(row){
  const rawProductName=clean(row?.productName);
  return {
    ...row,
    rawProductName,
    catalogMatched:false,
    catalogContextMatched:false,
    line:`${quantityText(row?.quantity)} ${rawProductName} *`,
  };
}

export function resolveParsedLinesWithCatalog(lines,catalog=[]){
  const input=Array.isArray(lines)?lines:[];
  const index=buildCatalogIndex(catalog);
  const output=[];
  let activeAnchor=null;

  for(const row of input){
    const text=clean(row?.productName);

    const contextual=resolveWithBackoff(text,index,activeAnchor);
    if(contextual){
      output.push(resolvedRow(row,contextual,true));
      const nextAnchor=anchorFromResolution(contextual);
      if(nextAnchor?.length)activeAnchor=nextAnchor;
      continue;
    }

    const globalExact=resolveExactPhrase(text,index,null);
    if(globalExact){
      output.push(resolvedRow(row,globalExact,false));
      const nextAnchor=anchorFromResolution(globalExact);
      if(nextAnchor?.length)activeAnchor=nextAnchor;
      continue;
    }

    output.push(unresolvedRow(row));
  }

  return output;
}
