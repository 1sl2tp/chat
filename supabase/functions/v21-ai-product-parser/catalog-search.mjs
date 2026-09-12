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

function rowSource(row){
  return normalizeStrict(row?.source);
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

function buildLooseRootAliasIndex(rows){
  const index=new Map();
  for(const row of rows){
    const root=rowPath(row)[0]||[];
    for(const alias of root){
      const loose=normalizeLoose(alias);
      if(!loose)continue;
      if(!index.has(loose))index.set(loose,new Set());
      index.get(loose).add(alias);
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

function tokenSpanAnywhere(queryTokens,aliasTokens){
  if(!aliasTokens.length||aliasTokens.length>queryTokens.length)return false;
  for(let index=0;index<=queryTokens.length-aliasTokens.length;index++){
    if(tokensEqualAt(queryTokens,index,aliasTokens))return true;
  }
  return false;
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

function aliasAppears(alias,queryStrictTokens,queryLooseTokens,looseAliasIndex){
  if(tokenSpanAnywhere(queryStrictTokens,strictTokens(alias)))return true;
  const looseAlias=normalizeLoose(alias);
  const strictForms=looseAliasIndex.get(looseAlias);
  if(!strictForms||strictForms.size!==1)return false;
  return tokenSpanAnywhere(queryLooseTokens,looseTokens(alias));
}

function rowFormulaMatch(row,queryStrictTokens,queryLooseTokens,looseAliasIndex,minimumMatchedLevels=2){
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

  const valid=solutions.filter(solution=>solution.matchedLevels.length>=minimumMatchedLevels||path.length===1);
  if(!valid.length)return null;

  const full=valid.some(solution=>solution.matchedLevels.length===path.length);
  const maxStrict=Math.max(...valid.map(solution=>solution.strictCount));
  return {row,full,maxStrict};
}

function findStructuredProduct(query,rows,minimumMatchedLevels=2){
  const candidates=rows.filter(hasConfiguredPath);
  if(!candidates.length)return null;

  const queryStrictTokens=strictTokens(query);
  const queryLooseTokens=looseTokens(query);
  if(!queryStrictTokens.length)return null;

  const looseAliasIndex=buildLooseAliasIndex(candidates);
  const matches=candidates
    .map(row=>rowFormulaMatch(row,queryStrictTokens,queryLooseTokens,looseAliasIndex,minimumMatchedLevels))
    .filter(Boolean);
  if(!matches.length)return null;

  const fullMatches=matches.filter(item=>item.full);
  if(fullMatches.length){
    return uniqueNameMatch(fullMatches.map(item=>item.row));
  }

  return uniqueNameMatch(matches.map(item=>item.row));
}

function rootScopeGroups(query,rows){
  const queryStrictTokens=strictTokens(query);
  const queryLooseTokens=looseTokens(query);
  if(!queryStrictTokens.length)return [];

  const looseRootIndex=buildLooseRootAliasIndex(rows);
  const groups=new Map();

  for(const row of rows.filter(hasConfiguredPath)){
    const path=rowPath(row);
    const root=path[0]||[];
    if(!root.some(alias=>aliasAppears(alias,queryStrictTokens,queryLooseTokens,looseRootIndex)))continue;

    const key=`${rowSource(row)}\u0000${normalizeLoose(root[0]||'')}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }

  return [...groups.values()];
}

function findByExplicitRoot(query,rows){
  const groups=rootScopeGroups(query,rows);
  if(!groups.length)return null;

  const matches=[];
  for(const groupRows of groups){
    const match=findStructuredProduct(query,groupRows,2);
    if(match)matches.push(match);
  }

  const byName=new Map(matches.map(match=>[normalizeStrict(match.productName),match]));
  return byName.size===1?[...byName.values()][0]:null;
}

function rowForMatch(match,rows){
  if(!match)return null;
  const id=clean(match.productId);
  if(id){
    const byId=rows.find(row=>rowId(row)===id);
    if(byId)return byId;
  }
  const name=normalizeStrict(match.productName);
  return rows.find(row=>normalizeStrict(rowName(row))===name)||null;
}

function contextFromRow(row){
  if(!row)return null;
  const path=rowPath(row);
  if(!path.length)return null;
  return {
    source:rowSource(row),
    levels:path.length>1?path.slice(0,-1):path,
    pathLength:path.length,
  };
}

function sameAliasLevel(left,right){
  const rightStrict=new Set(right);
  if(left.some(alias=>rightStrict.has(alias)))return true;

  const rightLoose=new Set(right.map(normalizeLoose));
  return left.some(alias=>rightLoose.has(normalizeLoose(alias)));
}

function rowMatchesContextPrefix(row,context,depth){
  if(context.source&&rowSource(row)!==context.source)return false;
  const path=rowPath(row);
  if(path.length<depth)return false;
  for(let index=0;index<depth;index++){
    if(!sameAliasLevel(path[index],context.levels[index]))return false;
  }
  return true;
}

function findCatalogProductInContext(productText,rows,context){
  const query=normalizeQuery(productText);
  if(!query||!context?.levels?.length)return null;

  for(let depth=context.levels.length;depth>=1;depth--){
    const scoped=rows.filter(row=>rowMatchesContextPrefix(row,context,depth));
    if(!scoped.length)continue;

    // Human shorthand normally changes the leaf while keeping the same key
    // level. Prefer that sibling depth first (chua/co -> chua/it) before any
    // deeper child such as chua/nha-dam/it.
    if(context.pathLength){
      const sameDepth=scoped.filter(row=>rowPath(row).length===context.pathLength);
      const sameDepthMatch=findStructuredProduct(query,sameDepth,1);
      if(sameDepthMatch)return sameDepthMatch;
    }

    const match=findStructuredProduct(query,scoped,1);
    if(match)return match;
  }
  return null;
}

function explicitRootContext(productText,rows){
  const query=normalizeQuery(productText);
  const groups=rootScopeGroups(query,rows);
  if(groups.length!==1)return null;

  const first=groups[0][0];
  const root=rowPath(first)[0];
  if(!root?.length)return null;
  return {source:rowSource(first),levels:[root]};
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
  const exact=rows.filter(row=>normalizeStrict(rowName(row))===query);
  if(exact.length)return uniqueNameMatch(exact);

  const direct=findStructuredProduct(query,rows,2);
  if(direct)return direct;

  // When a level-1/root key is explicit, narrow to that branch first. This is
  // the deterministic de-noising step for dictionary forms such as be/bé.
  return findByExplicitRoot(query,rows);
}

export function resolveParsedLinesWithCatalog(lines,catalog=[]){
  const input=Array.isArray(lines)?lines:[];
  const catalogRows=(Array.isArray(catalog)?catalog:[]).filter(row=>rowName(row));
  const directMatches=input.map(row=>findCatalogProduct(clean(row?.productName),catalogRows));
  const directRows=directMatches.map(match=>rowForMatch(match,catalogRows));
  const rootContexts=input.map(row=>explicitRootContext(clean(row?.productName),catalogRows));

  let activeContext=null;
  const output=[];

  for(let index=0;index<input.length;index++){
    const row=input[index];
    const directMatch=directMatches[index];
    if(directMatch){
      output.push(resolvedRow(row,directMatch,false));
      activeContext=contextFromRow(directRows[index]);
      continue;
    }

    // An explicit new root is a topic switch. Never drag the older branch into
    // it, even if this line itself is still incomplete.
    if(rootContexts[index]){
      activeContext=rootContexts[index];
      const rootMatch=findCatalogProductInContext(clean(row?.productName),catalogRows,activeContext);
      if(rootMatch){
        output.push(resolvedRow(row,rootMatch,true));
        activeContext=contextFromRow(rowForMatch(rootMatch,catalogRows));
      }else{
        output.push({...row,catalogMatched:false});
      }
      continue;
    }

    let contextMatch=null;
    if(activeContext){
      contextMatch=findCatalogProductInContext(clean(row?.productName),catalogRows,activeContext);
    }else{
      // Only when there is no key above, the nearest usable key below may
      // provide the input topic. Above wins once a topic has been established.
      for(let next=index+1;next<input.length;next++){
        const below=directRows[next]?contextFromRow(directRows[next]):rootContexts[next];
        if(!below)continue;
        contextMatch=findCatalogProductInContext(clean(row?.productName),catalogRows,below);
        if(contextMatch)activeContext=below;
        break;
      }
    }

    if(contextMatch){
      output.push(resolvedRow(row,contextMatch,true));
      activeContext=contextFromRow(rowForMatch(contextMatch,catalogRows));
    }else{
      output.push({...row,catalogMatched:false});
    }
  }

  return output;
}
