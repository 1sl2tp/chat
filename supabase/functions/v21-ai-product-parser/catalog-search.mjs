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

const LEVEL_FIELDS=['level1','level2','level3','level4','level5','level6','level7','level8','level9'];

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

function rowPath(row){
  return LEVEL_FIELDS
    .map(field=>aliases(row?.[field]))
    .filter(level=>level.length>0);
}

function hasConfiguredPath(row){
  return rowPath(row).length>0;
}

function buildLooseAliasIndex(rows){
  const index=new Map();
  for(const row of rows){
    for(const level of rowPath(row)){
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

function tokensEqualAt(queryTokens,queryIndex,aliasTokens){
  if(!aliasTokens.length||queryIndex+aliasTokens.length>queryTokens.length)return false;
  for(let i=0;i<aliasTokens.length;i++){
    if(queryTokens[queryIndex+i]!==aliasTokens[i])return false;
  }
  return true;
}

function aliasMatchAt(alias,queryIndex,queryStrictTokens,queryLooseTokens,looseAliasIndex){
  const strictAliasTokens=strictTokens(alias);
  if(tokensEqualAt(queryStrictTokens,queryIndex,strictAliasTokens)){
    return {length:strictAliasTokens.length,strict:true};
  }

  const looseAlias=normalizeLoose(alias);
  const strictForms=looseAliasIndex.get(looseAlias);
  if(!strictForms||strictForms.size!==1)return null;

  const looseAliasTokens=looseTokens(alias);
  if(!tokensEqualAt(queryLooseTokens,queryIndex,looseAliasTokens))return null;
  return {length:looseAliasTokens.length,strict:false};
}

function rowFormulaMatch(row,queryStrictTokens,queryLooseTokens,looseAliasIndex){
  const path=rowPath(row);
  if(!path.length)return null;

  const solutions=[];

  function walk(levelIndex,queryIndex,matchedLevels,strictCount){
    if(queryIndex===queryStrictTokens.length){
      solutions.push({matchedLevels:[...matchedLevels],strictCount});
      return;
    }
    if(levelIndex>=path.length)return;

    walk(levelIndex+1,queryIndex,matchedLevels,strictCount);

    const candidates=[];
    for(const alias of path[levelIndex]){
      const match=aliasMatchAt(alias,queryIndex,queryStrictTokens,queryLooseTokens,looseAliasIndex);
      if(match)candidates.push(match);
    }

    candidates.sort((a,b)=>b.length-a.length||Number(b.strict)-Number(a.strict));
    for(const match of candidates){
      matchedLevels.push(levelIndex);
      walk(levelIndex+1,queryIndex+match.length,matchedLevels,strictCount+(match.strict?1:0));
      matchedLevels.pop();
    }
  }

  walk(0,0,[],0);
  if(!solutions.length)return null;

  const valid=solutions.filter(solution=>solution.matchedLevels.length>=2||path.length===1);
  if(!valid.length)return null;

  const full=valid.some(solution=>solution.matchedLevels.length===path.length);
  const maxStrict=Math.max(...valid.map(solution=>solution.strictCount));
  return {row,full,maxStrict};
}

function findStructuredProduct(query,rows){
  const candidates=rows.filter(hasConfiguredPath);
  if(!candidates.length)return null;

  const queryStrictTokens=strictTokens(query);
  const queryLooseTokens=looseTokens(query);
  if(!queryStrictTokens.length)return null;

  const looseAliasIndex=buildLooseAliasIndex(candidates);
  const matches=candidates
    .map(row=>rowFormulaMatch(row,queryStrictTokens,queryLooseTokens,looseAliasIndex))
    .filter(Boolean);
  if(!matches.length)return null;

  const fullMatches=matches.filter(item=>item.full);
  if(fullMatches.length){
    return uniqueNameMatch(fullMatches.map(item=>item.row));
  }

  return uniqueNameMatch(matches.map(item=>item.row));
}

function resolvedRow(row,match){
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
    catalogContextMatched:false,
    line:`${quantityText(row?.quantity)} ${productName}${review}`,
  };
}

export function findCatalogProduct(productText,catalog=[]){
  const query=normalizeQuery(productText);
  if(!query)return null;

  const rows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));
  const exact=rows.filter(row=>normalizeStrict(rowName(row))===query);
  if(exact.length)return uniqueNameMatch(exact);

  return findStructuredProduct(query,rows);
}

export function resolveParsedLinesWithCatalog(lines,catalog=[]){
  const input=Array.isArray(lines)?lines:[];
  const catalogRows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));

  return input.map(row=>{
    const match=findCatalogProduct(clean(row?.productName),catalogRows);
    if(match)return resolvedRow(row,match);
    return {...row,catalogMatched:false};
  });
}
