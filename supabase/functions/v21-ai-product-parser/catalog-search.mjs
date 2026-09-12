function clean(value){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function normalizeStrict(value){
  return String(value??'')
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeLoose(value){
  return normalizeStrict(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/gi,'d');
}

const SEARCH_WORD_DICTIONARY=new Map([
  ['ko','không'],
]);

// These are only absolute positions 1..9. Their old business labels are not
// search semantics. Empty positions stay empty; they are never collapsed.
const LEVEL_FIELDS=['type','c1','c2','size','label2','form','color','volume','variant'];

function normalizeQuery(value){
  return normalizeStrict(value)
    .split(' ')
    .filter(Boolean)
    .map(token=>SEARCH_WORD_DICTIONARY.get(token)||token)
    .join(' ');
}

function strictTokens(value){
  return normalizeStrict(value).split(' ').filter(Boolean);
}

function looseTokens(value){
  return normalizeLoose(value).split(' ').filter(Boolean);
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
    const key=normalizeStrict(productName);
    if(!productName||!key||byName.has(key))continue;
    byName.set(key,{productName,productId:rowId(row)||null});
  }
  return byName.size===1?[...byName.values()][0]:null;
}

function aliases(value){
  return clean(value)
    .split(/,\s+/)
    .map(normalizeStrict)
    .filter(Boolean);
}

function rowLevels(row){
  return LEVEL_FIELDS.map(field=>aliases(row?.[field]));
}

function hasStructuredKeys(row){
  return rowLevels(row).some(level=>level.length>0);
}

function buildLooseAliasIndex(rows){
  const index=new Map();
  for(const row of rows){
    for(const level of rowLevels(row)){
      for(const alias of level){
        const loose=normalizeLoose(alias);
        if(!loose)continue;
        if(!index.has(loose))index.set(loose,new Set());
        index.get(loose).add(alias);
      }
    }
  }
  return index;
}

function findTokenSpan(queryTokens,aliasTokens){
  if(!aliasTokens.length||aliasTokens.length>queryTokens.length)return null;
  for(let start=0;start<=queryTokens.length-aliasTokens.length;start++){
    let ok=true;
    for(let offset=0;offset<aliasTokens.length;offset++){
      if(queryTokens[start+offset]!==aliasTokens[offset]){
        ok=false;
        break;
      }
    }
    if(ok)return {start,end:start+aliasTokens.length};
  }
  return null;
}

function aliasMatch(alias,queryStrictTokens,queryLooseTokens,looseAliasIndex){
  const strictAliasTokens=strictTokens(alias);
  const strictSpan=findTokenSpan(queryStrictTokens,strictAliasTokens);
  if(strictSpan)return {...strictSpan,strict:true};

  const looseAlias=normalizeLoose(alias);
  const strictForms=looseAliasIndex.get(looseAlias);
  if(!strictForms||strictForms.size!==1)return null;

  const looseSpan=findTokenSpan(queryLooseTokens,looseTokens(alias));
  return looseSpan?{...looseSpan,strict:false}:null;
}

function rowFormulaMatch(row,query,queryStrictTokens,queryLooseTokens,looseAliasIndex){
  const levels=rowLevels(row);
  const covered=new Set();
  const matchedPositions=[];
  let strictLevelCount=0;
  let wholeRootMatch=false;

  for(let levelIndex=0;levelIndex<levels.length;levelIndex++){
    let levelMatched=false;
    let levelStrict=false;

    for(const alias of levels[levelIndex]){
      const match=aliasMatch(alias,queryStrictTokens,queryLooseTokens,looseAliasIndex);
      if(!match)continue;
      levelMatched=true;
      if(match.strict)levelStrict=true;
      for(let i=match.start;i<match.end;i++)covered.add(i);

      if(levelIndex===0&&match.start===0&&match.end===queryStrictTokens.length){
        wholeRootMatch=true;
      }
    }

    if(levelMatched){
      matchedPositions.push(levelIndex);
      if(levelStrict)strictLevelCount+=1;
    }
  }

  // Every customer token must be explained by configured keys. No old fuzzy
  // token-subset rule and no silently ignored words.
  if(covered.size!==queryStrictTokens.length)return null;
  if(!matchedPositions.length)return null;

  // One configured node is enough only when it is the complete level-1 root.
  if(matchedPositions.length===1&&!wholeRootMatch)return null;

  const first=matchedPositions[0];
  const last=matchedPositions[matchedPositions.length-1];
  let omittedBetween=0;
  for(let index=first;index<=last;index++){
    if(levels[index].length&&!matchedPositions.includes(index))omittedBetween+=1;
  }

  return {
    row,
    matchedCount:matchedPositions.length,
    matchedPositions,
    strictLevelCount,
    omittedBetween,
    wholeRootMatch,
  };
}

function findStructuredProduct(query,rows){
  const candidates=rows.filter(hasStructuredKeys);
  if(!candidates.length)return null;

  const queryStrictTokens=strictTokens(query);
  const queryLooseTokens=looseTokens(query);
  if(!queryStrictTokens.length)return null;

  const looseAliasIndex=buildLooseAliasIndex(candidates);
  const matches=candidates
    .map(row=>rowFormulaMatch(row,query,queryStrictTokens,queryLooseTokens,looseAliasIndex))
    .filter(Boolean);
  if(!matches.length)return null;

  // 1) Prefer the path that explains the most actual configured positions.
  const maxMatched=Math.max(...matches.map(item=>item.matchedCount));
  let best=matches.filter(item=>item.matchedCount===maxMatched);

  // 2) Exact-accent key matches beat safe accent fallback when otherwise tied.
  const maxStrict=Math.max(...best.map(item=>item.strictLevelCount));
  best=best.filter(item=>item.strictLevelCount===maxStrict);

  // 3) If the same visible keys fit a direct path and a path with an omitted
  // configured node between them, prefer the direct path. Missing nodes are
  // filled only when the remaining formula still leaves one unique product.
  const minOmitted=Math.min(...best.map(item=>item.omittedBetween));
  best=best.filter(item=>item.omittedBetween===minOmitted);

  return uniqueNameMatch(best.map(item=>item.row));
}

function catalogRowForMatch(match,rows){
  if(!match)return null;
  const matchId=clean(match.productId);
  if(matchId){
    const byId=rows.find(row=>rowId(row)===matchId);
    if(byId)return byId;
  }
  const matchName=normalizeStrict(match.productName);
  return rows.find(row=>normalizeStrict(rowName(row))===matchName)||null;
}

function sharedLevelAlias(previousLevel,nextLevel){
  const nextSet=new Set(nextLevel);
  return previousLevel.find(alias=>nextSet.has(alias))||null;
}

function sharedContextTerms(previousRow,nextRow){
  if(!previousRow||!nextRow||!hasStructuredKeys(previousRow)||!hasStructuredKeys(nextRow))return [];

  const previousLevels=rowLevels(previousRow);
  const nextLevels=rowLevels(nextRow);
  const terms=[];

  // Neighbour context obeys the same 1..9 formula: only values shared at the
  // exact same configured position are borrowed. Empty levels are skipped.
  for(let index=0;index<LEVEL_FIELDS.length;index++){
    if(!previousLevels[index].length||!nextLevels[index].length)continue;
    const shared=sharedLevelAlias(previousLevels[index],nextLevels[index]);
    if(shared)terms.push(shared);
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
  const query=normalizeQuery(productText);
  if(!query)return null;

  const rows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));

  // Full canonical equality is deterministic and does not invent missing
  // words, so it remains allowed even when the product has no 1..9 keys.
  const exact=rows.filter(row=>normalizeStrict(rowName(row))===query);
  if(exact.length)return uniqueNameMatch(exact);

  // Every non-exact rename now comes only from the configured 1..9 formula.
  return findStructuredProduct(query,rows);
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
