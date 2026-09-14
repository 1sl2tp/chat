const CACHE_TTL_MS=10*60*1000;
const PAGE_SIZE=1000;
const PACKAGING_NOISE=new Set([
  'thung','t','th','hop','loc','bich','goi','chai','lon','khay','tui','vi','bao','cay','can',
  'thùng','hộp','lốc','bịch','gói','khay','túi','vỉ','cây',
]);
const POLITE_NOISE=new Set(['nhe','a','ah','cho','lay','them']);
const NUMBER_WORDS=new Set(['mot','hai','ba','bon','nam','sau','bay','tam','chin','muoi']);
let cache={at:0,rows:[]};

function ascii(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/gi,'d')
    .toLowerCase();
}
function words(value){
  return ascii(value).replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
}
function stripLeadingQuantity(tokens){
  const out=[...tokens];
  if(!out.length)return out;
  if(/^\d+(?:[.,]\d+)?$/.test(out[0])||NUMBER_WORDS.has(out[0]))out.shift();
  if(out.length&&PACKAGING_NOISE.has(out[0]))out.shift();
  return out;
}
export function normalizeRecognitionCore(value){
  const tokens=stripLeadingQuantity(words(value))
    .filter(token=>!PACKAGING_NOISE.has(token)&&!POLITE_NOISE.has(token));
  return tokens.join(' ').trim();
}
function trigrams(value){
  const text=`  ${String(value||'')}  `;
  const out=new Map();
  for(let i=0;i<text.length-2;i++){
    const tri=text.slice(i,i+3);
    out.set(tri,(out.get(tri)||0)+1);
  }
  return out;
}
function dice(a,b){
  if(!a||!b)return 0;
  if(a===b)return 1;
  const aa=trigrams(a),bb=trigrams(b);
  let shared=0,totalA=0,totalB=0;
  for(const count of aa.values())totalA+=count;
  for(const count of bb.values())totalB+=count;
  for(const [tri,count] of aa){
    const other=bb.get(tri)||0;
    shared+=Math.min(count,other);
  }
  return totalA+totalB?2*shared/(totalA+totalB):0;
}
function tokenOverlap(a,b){
  const A=new Set(a.split(' ').filter(Boolean));
  const B=new Set(b.split(' ').filter(Boolean));
  if(!A.size||!B.size)return 0;
  let shared=0;
  for(const token of A)if(B.has(token))shared++;
  return shared/Math.max(A.size,B.size);
}
function contiguousPhrase(haystack,needle){
  if(!haystack||!needle)return false;
  return (` ${haystack} `).includes(` ${needle} `);
}
function digitScore(query,candidate){
  const q=[...query.matchAll(/\b\d+\b/g)].map(x=>x[0]);
  if(!q.length)return 0;
  const c=new Set([...candidate.matchAll(/\b\d+\b/g)].map(x=>x[0]));
  return q.every(x=>c.has(x))?0.16:-0.18;
}
function categoryScore(query,row){
  const category=normalizeRecognitionCore(row?.category||'');
  if(!category)return 0;
  const tokens=query.split(' ').filter(Boolean);
  if(tokens.some(token=>category.split(' ').includes(token)))return 0.10;
  return 0;
}
function sourceBoost(row){
  const priority=Math.max(0,Math.min(120,Number(row?.priority)||0));
  return (priority/120)*0.12;
}
function candidateScore(query,row){
  const candidate=normalizeRecognitionCore(row?.name||'');
  if(!query||!candidate)return 0;
  const exact=candidate===query?1.25:contiguousPhrase(candidate,query)?0.92:contiguousPhrase(query,candidate)?0.78:0;
  const overlap=tokenOverlap(query,candidate);
  const shape=dice(query,candidate);
  const prefix=(candidate.startsWith(query)||query.startsWith(candidate))?0.10:0;
  return exact+overlap*0.52+shape*0.34+prefix+digitScore(query,candidate)+categoryScore(query,row)+sourceBoost(row);
}
export function rankGroceryCandidates(query,rows,limit=8){
  const core=normalizeRecognitionCore(query);
  if(!core)return [];
  const ranked=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const name=String(row?.name||'').trim();
    if(!name)continue;
    const score=candidateScore(core,row);
    if(score<0.20)continue;
    ranked.push({...row,name,score:Number(score.toFixed(6))});
  }
  ranked.sort((a,b)=>b.score-a.score||(Number(b.priority)||0)-(Number(a.priority)||0)||a.name.localeCompare(b.name,'vi'));
  return ranked.slice(0,Math.max(1,Number(limit)||8));
}
export function recognitionDecision(source,ranked){
  const core=normalizeRecognitionCore(source);
  if(!core)return {mode:'empty',value:''};
  const tokens=core.split(' ').filter(Boolean);
  const candidates=Array.isArray(ranked)?ranked:[];
  const exactPhrase=tokens.length>=2&&candidates.some(row=>contiguousPhrase(normalizeRecognitionCore(row?.name||''),core));
  if(exactPhrase)return {mode:'preserve',value:core};
  const top=candidates[0];
  const second=candidates[1];
  if(top&&top.score>=0.92&&(!second||top.score-second.score>=0.08)){
    return {mode:'candidate',value:String(top.name||'').trim(),candidate:top};
  }
  return {mode:'preserve',value:core};
}
function referenceLine(row){
  const category=String(row?.category||'').trim()||'Khac';
  const source=String(row?.source||'').trim()||'library';
  return `- [${source}] [cha:${category}] ${String(row?.name||'').trim()}`;
}
export function buildGroceryReferenceContext(source,rows,{perLine=6,maxLines=30}={}){
  const lines=String(source??'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,maxLines);
  const blocks=[];
  for(const line of lines){
    const ranked=rankGroceryCandidates(line,rows,perLine);
    if(!ranked.length)continue;
    const decision=recognitionDecision(line,ranked);
    blocks.push([
      `DONG NGUON: ${line}`,
      `CHE DO: ${decision.mode==='preserve'?'GIU_CUM_DA_RO':'THAM_CHIEU_MO_HO'}`,
      ...ranked.map(referenceLine),
    ].join('\n'));
  }
  if(!blocks.length)return '';
  return [
    'THU VIEN THAM CHIEU NHAN DIEN HANG HOA:',
    'Ten trong thu vien chi la bang chung nhan dien. Khong duoc tu them tu, nhan hieu, quy cach hay mo rong cum da ro.',
    'Neu cum nguon da xuat hien nguyen ven trong mot ten thu vien (vi du: banh gao, dns 681, xx poni) thi GIU NGUYEN cum nguon; thu vien chi xac nhan cum do la hop le.',
    'Thong tin [cha:...] la danh muc cha de ho tro suy luan khi net chu/am doc mo ho. Bao bi thung/hop/loc/bich/chai/lon/goi khong quyet dinh ten hang.',
    '',
    ...blocks,
  ].join('\n');
}
export function buildOwnRecognitionVocabulary(rows,{maxChars=12000}={}){
  const preferred=(Array.isArray(rows)?rows:[])
    .filter(row=>['own','ai_key','tobacco'].includes(String(row?.source||'')))
    .sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0));
  const seen=new Set();
  const out=[];
  let size=0;
  for(const row of preferred){
    const name=String(row?.name||'').trim();
    const key=normalizeRecognitionCore(name);
    if(!name||!key||seen.has(key))continue;
    seen.add(key);
    const category=String(row?.category||'').trim()||'Khac';
    const line=`[${category}] ${name}`;
    if(size+line.length+1>maxChars)break;
    out.push(line);size+=line.length+1;
  }
  return out.length?`TU DIEN TEN HANG UU TIEN (chi de doi chieu net chu, khong duoc tu them):\n${out.join('\n')}`:'';
}
async function fetchAll(db,table,select,filter){
  const out=[];
  for(let start=0;;start+=PAGE_SIZE){
    let query=db.from(table).select(select).range(start,start+PAGE_SIZE-1);
    if(filter)query=filter(query);
    const {data,error}=await query;
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    out.push(...rows);
    if(rows.length<PAGE_SIZE)break;
  }
  return out;
}
function addRef(target,row){
  const name=String(row?.name||'').trim();
  if(!name)return;
  const category=String(row?.category||'').trim();
  const source=String(row?.source||'').trim();
  const key=`${normalizeRecognitionCore(name)}|${normalizeRecognitionCore(category)}`;
  if(!key.startsWith('|')){
    const existing=target.get(key);
    if(!existing||Number(row?.priority||0)>Number(existing?.priority||0))target.set(key,{...row,name,category,source});
  }
}
export async function loadGroceryReferenceLibrary(db,{force=false}={}){
  const now=Date.now();
  if(!force&&cache.rows.length&&now-cache.at<CACHE_TTL_MS)return cache.rows;
  const [keys,products,suppliers,market,brands]=await Promise.all([
    fetchAll(db,'chat_ai_product_keys','product_name,type,source,level1,level2,level3,level4',q=>q.eq('active',true)),
    fetchAll(db,'products','name,group_name,source_id',q=>q.eq('active',true)),
    fetchAll(db,'getlink_supplier_products','product_name,primary_packaging,retail_packaging',q=>q.eq('is_active',true)),
    fetchAll(db,'getlink_links','name,group_name,branch_name,source,link_type',q=>q.eq('link_type','product')),
    fetchAll(db,'getlink_brand_aliases','canonical_name,brand_key',null),
  ]);
  const refs=new Map();
  for(const row of products)addRef(refs,{name:row.name,category:row.group_name,source:String(row.group_name||'').toLowerCase().includes('thuốc lá')?'tobacco':'own',priority:120});
  for(const row of keys)addRef(refs,{name:row.product_name,category:row.type||row.source||row.level1,source:'ai_key',priority:115,levels:[row.level1,row.level2,row.level3,row.level4].filter(Boolean)});
  for(const row of suppliers)addRef(refs,{name:row.product_name,category:'',source:'supplier',priority:90});
  for(const row of market)addRef(refs,{name:row.name,category:row.group_name||row.branch_name||row.source,source:`market:${row.source||'unknown'}`,priority:60});
  for(const row of brands)addRef(refs,{name:row.canonical_name,category:'Thuong hieu',source:'brand',priority:80,alias:row.brand_key});
  cache={at:now,rows:[...refs.values()]};
  return cache.rows;
}
