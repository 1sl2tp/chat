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

// The configured columns are only an ordered source path. Their old labels
// do not define search semantics. Empty cells collapse, so every product is
// searched as level 1 -> level 2 -> ... -> level 9 (or however many exist).
const LEVEL_FIELDS=['type','c1','c2','size','label2','form','color','volume','variant'];

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

function aliases(value){
  return clean(value)
    .split(/,\s+/)
    .map(normalizeSearch)
    .filter(Boolean);
}

function structuredPath(row){
  return LEVEL_FIELDS
    .map(field=>aliases(row?.[field]))
    .filter(levelAliases=>levelAliases.length>0);
}

function hasStructuredKeys(row){
  return structuredPath(row).length>0;
}

function aliasMatchesQuery(alias,queryTokenSet){
  const aliasTokens=tokens(alias);
  return aliasTokens.length>0&&aliasTokens.every(token=>queryTokenSet.has(token));
}

function levelMatchesQuery(levelAliases,queryTokenSet){
  return levelAliases.some(alias=>aliasMatchesQuery(alias,queryTokenSet));
}

function pathMatch(row,query,queryTokenSet){
  const path=structuredPath(row);
  const matchedIndexes=[];
  for(let index=0;index<path.length;index++){
    if(levelMatchesQuery(path[index],queryTokenSet))matchedIndexes.push(index);
  }

  if(!matchedIndexes.length)return null;

  // A complete level-1/root alias may identify a product by itself.
  // Example: `huong duong my vi` is the root alias for `Huong duong mv`.
  // A lone lower-level word such as `vi` is never enough to jump branches.
  if(matchedIndexes.length===1){
    const onlyIndex=matchedIndexes[0];
    const exactRoot=onlyIndex===0&&path[0].some(alias=>alias===query);
    if(!exactRoot)return null;
  }

  const first=matchedIndexes[0];
  const last=matchedIndexes[matchedIndexes.length-1];
  return {
    row,
    path,
    matchedCount:matchedIndexes.length,
    gapCount:(last-first+1)-matchedIndexes.length,
  };
}

function findStructuredProduct(query,rows){
  const candidates=rows.filter(hasStructuredKeys);
  if(!candidates.length)return {matched:false,result:null};

  const queryTokenSet=new Set(tokens(query));
  const scored=candidates
    .map(row=>pathMatch(row,query,queryTokenSet))
    .filter(Boolean);

  if(!scored.length)return {matched:false,result:null};

  // First prefer the path containing the most actual input levels.
  const maxMatched=Math.max(...scored.map(item=>item.matchedCount));
  let best=scored.filter(item=>item.matchedCount===maxMatched);

  // If the same keys fit both a direct path and a deeper path with an omitted
  // node in the middle, prefer the direct path. Example:
  //   chua -> co      beats      chua -> nha dam -> co
  const minGaps=Math.min(...best.map(item=>item.gapCount));
  best=best.filter(item=>item.gapCount===minGaps);

  return {
    matched:true,
    result:uniqueNameMatch(best.map(item=>item.row)),
  };
}

function catalogRowForMatch(match,rows){
  if(!match)return null;
  const matchId=clean(match.productId);
  if(matchId){
    const byId=rows.find(row=>rowId(row)===matchId);
    if(byId)return byId;
  }
  const matchName=normalize(match.productName);
  return rows.find(row=>normalize(rowName(row))===matchName)||null;
}

function sharedLevelAlias(previousLevel,nextLevel){
  const nextSet=new Set(nextLevel);
  return previousLevel.find(alias=>nextSet.has(alias))||null;
}

function sharedContextTerms(previousRow,nextRow){
  if(!previousRow||!nextRow||!hasStructuredKeys(previousRow)||!hasStructuredKeys(nextRow))return [];

  const previousPath=structuredPath(previousRow);
  const nextPath=structuredPath(nextRow);
  const terms=[];
  const limit=Math.min(previousPath.length,nextPath.length);

  // Context is only the common tree prefix. Once the two neighbours diverge,
  // nothing below that split may be inherited by the middle line.
  for(let index=0;index<limit;index++){
    const shared=sharedLevelAlias(previousPath[index],nextPath[index]);
    if(!shared)break;
    terms.push(shared);
  }
  return terms;
}

function resolvedRow(row,match,contextMatched=false){
  const rawProductName=clean(row?.productName);
  const productName=match.productName;
  const changed=clean(productName)!==rawProductName;
  const review=changed&&rawProductName?` (${rawProductName})`:'';
  return {
    ...row,
    rawProductName,
    productName,
    productId:match.productId,
    catalogMatched:true,
    catalogContextMatched:contextMatched,
    line:`${quantityText(row?.quantity)} ${productName}${review}`,
  };
}

export function findCatalogProduct(productText,catalog=[]){
  const query=normalizeSearch(productText);
  if(!query)return null;

  const rows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));
  const exact=rows.filter(row=>normalize(rowName(row))===query);
  if(exact.length)return uniqueNameMatch(exact);

  const structured=findStructuredProduct(query,rows);
  if(structured.matched)return structured.result;

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
  const input=Array.isArray(lines)?lines:[];
  const catalogRows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));

  const directMatches=input.map(row=>findCatalogProduct(clean(row?.productName),catalogRows));
  const directRows=directMatches.map(match=>catalogRowForMatch(match,catalogRows));

  return input.map((row,index)=>{
    const directMatch=directMatches[index];
    if(directMatch)return resolvedRow(row,directMatch,false);

    let previousIndex=index-1;
    while(previousIndex>=0&&!directMatches[previousIndex])previousIndex-=1;
    let nextIndex=index+1;
    while(nextIndex<input.length&&!directMatches[nextIndex])nextIndex+=1;

    if(previousIndex>=0&&nextIndex<input.length){
      const contextTerms=sharedContextTerms(directRows[previousIndex],directRows[nextIndex]);
      if(contextTerms.length){
        const rawProductName=clean(row?.productName);
        const contextMatch=findCatalogProduct(`${rawProductName} ${contextTerms.join(' ')}`,catalogRows);
        if(contextMatch)return resolvedRow(row,contextMatch,true);
      }
    }

    return {...row,catalogMatched:false};
  });
}
