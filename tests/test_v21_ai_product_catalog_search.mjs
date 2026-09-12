import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

const productOnlyCatalog=[
  {id:'tl30',name:'555 dẹt'},
  {id:'tl34',name:'555 dẹt bấm'},
  {id:'khac202',name:'Mi tom hao hao'},
  {id:'tau53',name:'Chan don cuu ca'},
  {id:'tau54',name:'Chan ga doi ana'},
];

const structuredCatalog=[
  {id:'vnm6',name:'Sua bo bich co',type:'Sữa',c1:'bo',form:'bich',variant:'có, có đường'},
  {id:'vnm7',name:'Sua bo bich it',type:'Sữa',c1:'bo',form:'bich',variant:'ít, ít đường'},
  {id:'vnm8',name:'Sua bo bich khong',type:'Sữa',c1:'bo',form:'bich',variant:'không, không đường'},
  {id:'vnm11',name:'Sua bo lit co',type:'Sữa',c1:'bo',form:'lit',variant:'có, có đường'},
  {id:'vnm13',name:'Sua bo lit khong',type:'Sữa',c1:'bo',form:'lit',variant:'không, không đường'},
  {id:'vnm17',name:'Sua chua co',type:'Sữa',c1:'chua',variant:'có, có đường'},
  {id:'vnm19',name:'Sua chua greenfram',type:'Sữa',c1:'chua',label2:'greenfram, green, fram'},
  {id:'vnm20',name:'Sua chua it',type:'Sữa',c1:'chua',variant:'ít, ít đường'},
  {id:'vnm21',name:'Sua chua khong',type:'Sữa',c1:'chua',variant:'không, không đường'},
  {id:'vnm23',name:'Sua chua nha dam co',type:'Sữa',c1:'chua',label2:'nha dam, nha, dam',variant:'có, có đường'},
  {id:'vnm24',name:'Sua chua nha dam it',type:'Sữa',c1:'chua',label2:'nha dam, nha, dam',variant:'ít, ít đường'},
  {id:'vnm32',name:'Sua green fram to co 180ml',type:'Sữa',c1:'green',c2:'fram',size:'to, 180',variant:'có, có đường'},
  {id:'vnm33',name:'Sua green fram to it 180ml',type:'Sữa',c1:'green',c2:'fram',size:'to, 180',variant:'ít, ít đường'},
  {id:'vnm58',name:'Sua green lit',type:'Sữa',c1:'green',form:'lit'},
  {id:'vnm38',name:'Sua probi be mau - dứa',type:'Sữa',c1:'probi, bi, proby',size:'be',label2:'mau',variant:'dứa'},
  {id:'vnm39',name:'Sua probi be mau - dưa gang',type:'Sữa',c1:'probi, bi, proby',size:'be',label2:'mau',variant:'dưa gang, dưa'},
  {id:'vnm41',name:'Sua probi be mau - viet quat',type:'Sữa',c1:'probi, bi, proby',size:'be',label2:'mau',variant:'viet quat, vq'},
  {id:'vnm46',name:'Sua probi to mau - viet quat',type:'Sữa',c1:'probi, bi, proby',size:'to, 180',label2:'mau',variant:'viet quat, vq'},
  {id:'vnm47',name:'Sua probi to trang',type:'Sữa',c1:'probi, bi, proby',size:'to, 180',color:'trắng, có, truyền thống'},
  {id:'vnm50',name:'Sua tho do giay 1284g',type:'Sữa',c1:'tho',label2:'do',form:'giay',volume:'1284g, 1,2kg'},
  {id:'vnm51',name:'Sua tho do giay 1kg',type:'Sữa',c1:'tho',label2:'do',form:'giay',volume:'1kg'},
  {id:'vnm53',name:'Sua tho do sat',type:'Sữa',c1:'tho',label2:'do',form:'sat'},
  {id:'vnm56',name:'Sua tho vi',type:'Sữa',c1:'tho',form:'vi'},
  {id:'tau67',name:'Huong duong mv',type:'hương dương mỹ vị, huong duong mv'},
];

function line(productName,quantity=1){
  return {quantity,productName,line:`${quantity} ${productName}`};
}

// Products without configured 1..9 keys must not be guessed from partial name tokens.
assert.equal(findCatalogProduct('cửu ca',productOnlyCatalog),null);
assert.equal(findCatalogProduct('chân đôi ana',productOnlyCatalog),null);
assert.deepEqual(
  resolveParsedLinesWithCatalog([line('cửu ca',1),line('chân đôi ana',2)],productOnlyCatalog).map(row=>row.line),
  ['1 cửu ca','2 chân đôi ana'],
  'unconfigured products keep the customer wording instead of legacy fuzzy renaming',
);

// A full canonical name is still deterministic and may match itself exactly.
assert.equal(findCatalogProduct('Chan don cuu ca',productOnlyCatalog)?.productId,'tau53');

// No legacy token-subset fallback for ordinary unconfigured catalog names.
assert.equal(findCatalogProduct('hao hao',productOnlyCatalog),null);
assert.equal(findCatalogProduct('555 det',productOnlyCatalog),null);

// 1..9 is the only structured search axis. Missing positions are allowed only
// when the keys actually present in the input leave one deterministic path.
assert.equal(
  findCatalogProduct('chua có đường',structuredCatalog)?.productName,
  'Sua chua co',
  'the shorter complete path wins over a deeper path that requires an omitted nha-dam node',
);

assert.equal(
  findCatalogProduct('nha dam có',structuredCatalog)?.productName,
  'Sua chua nha dam co',
  'keys from non-adjacent configured positions may identify one unique path',
);

assert.equal(
  findCatalogProduct('bich khong',structuredCatalog)?.productName,
  'Sua bo bich khong',
  'a unique subset of configured positions may fill omitted parent positions',
);

assert.equal(
  findCatalogProduct('tho do',structuredCatalog),
  null,
  'a subset shared by multiple 1..9 paths stays unresolved',
);

assert.equal(
  findCatalogProduct('tho do giay 1,2kg',structuredCatalog)?.productName,
  'Sua tho do giay 1284g',
  'additional configured positions disambiguate the path',
);

// Missing `mau` is filled only because probi + be + dưa identifies one path.
assert.equal(
  findCatalogProduct('probi bé dưa',structuredCatalog)?.productName,
  'Sua probi be mau - dưa gang',
  'dưa is the explicit alias of dưa gang and a unique 1..9 subset may fill the missing mau node',
);

assert.equal(
  findCatalogProduct('probi bé dứa',structuredCatalog)?.productName,
  'Sua probi be mau - dứa',
  'dứa is a different configured key from dưa',
);

assert.equal(
  findCatalogProduct('probi bé vq',structuredCatalog)?.productName,
  'Sua probi be mau - viet quat',
  'vq is the explicit alias of viet quat and may fill the omitted mau node when the path is unique',
);

const ambiguousMissingNodeCatalog=[
  {id:'a',name:'A',type:'Sữa',c1:'probi',size:'be',label2:'mau',variant:'dưa gang, dưa'},
  {id:'b',name:'B',type:'Sữa',c1:'probi',size:'be',label2:'khac',variant:'dưa gang, dưa'},
];
assert.equal(
  findCatalogProduct('probi bé dưa',ambiguousMissingNodeCatalog),
  null,
  'a missing position is never invented when the same visible key subset fits two paths',
);

// Accent fallback is allowed only when it is unambiguous. be<->bé remains
// usable, while dưa and dứa must never collapse into one key.
assert.equal(findCatalogProduct('probi be dua',structuredCatalog),null);

// A complete level-1/root alias can resolve by itself. Partial words cannot
// jump to an unrelated lower-level node such as Sữa > tho > vi.
assert.equal(
  findCatalogProduct('hương dương mỹ vị',structuredCatalog)?.productName,
  'Huong duong mv',
);
assert.equal(findCatalogProduct('my vi',structuredCatalog),null);

// Unknown words are not silently ignored by the formula.
assert.equal(findCatalogProduct('probi bé xyz dưa',structuredCatalog),null);

// Neighbour context remains deterministic: it only contributes configured
// keys shared at the same 1..9 positions, then the same formula runs again.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    line('Bịch có',2),
    line('Không',2),
    line('Bịch ít',2),
  ],structuredCatalog).map(row=>row.line),
  [
    '2 Sua bo bich co (Bịch có)',
    '2 Sua bo bich khong (Không)',
    '2 Sua bo bich it (Bịch ít)',
  ],
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    line('Bịch có',2),
    line('Không',2),
    line('Lít có',2),
  ],structuredCatalog).map(row=>row.line),
  [
    '2 Sua bo bich co (Bịch có)',
    '2 Không',
    '2 Sua bo lit co (Lít có)',
  ],
  'conflicting neighbours do not create a unique path',
);

console.log('chat deterministic 1..9 product path search contract PASS');
