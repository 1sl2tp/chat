import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

const catalog=[
  {id:'tl30',name:'555 dẹt'},
  {id:'tl34',name:'555 dẹt bấm'},
  {id:'khac202',name:'Mi tom hao hao'},
  {id:'vnm21',name:'Sua chua khong'},
  {id:'vnm17',name:'Sua chua co'},
  {id:'tau90',name:'Keo trai cay khong duong'},
];

const structuredCatalog=[
  {id:'vnm19',name:'Sua chua greenfram',type:'Sữa',c1:'chua',label2:'greenfram, green, fram'},
  {id:'vnm33',name:'Sua green fram to it 180ml',type:'Sữa',c1:'green',c2:'fram',size:'to, 180',variant:'ít, ít đường'},
  {id:'vnm32',name:'Sua green fram to co 180ml',type:'Sữa',c1:'green',c2:'fram',size:'to, 180',variant:'có, có đường'},
  {id:'vnm58',name:'Sua green lit',type:'Sữa',c1:'green',form:'lit'},
  {id:'vnm46',name:'Sua probi to mau - viet quat',type:'Sữa',c1:'probi, bi, proby',size:'to, 180',label2:'mau',variant:'viet quat'},
  {id:'vnm47',name:'Sua probi to trang',type:'Sữa',c1:'probi, bi, proby',size:'to, 180',color:'trắng, có, truyền thống'},
  {id:'vnm50',name:'Sua tho do giay 1284g',type:'Sữa',c1:'tho',label2:'do',form:'giay',volume:'1284g, 1,2kg'},
  {id:'vnm51',name:'Sua tho do giay 1kg',type:'Sữa',c1:'tho',label2:'do',form:'giay',volume:'1kg'},
  {id:'vnm53',name:'Sua tho do sat',type:'Sữa',c1:'tho',label2:'do',form:'sat'},
];

function line(productName,quantity=1){
  return {quantity,productName,line:`${quantity} ${productName}`};
}

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('555 det',2)],catalog).map(row=>row.line),
  ['2 555 dẹt (555 det)'],
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('hao hao',2)],catalog).map(row=>row.line),
  ['2 Mi tom hao hao (hao hao)'],
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('sua chua ko',3)],catalog).map(row=>row.line),
  ['3 Sua chua khong (sua chua ko)'],
  'search dictionary expands ko -> khong without rewriting the raw customer text',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('sua chua',2)],catalog).map(row=>row.line),
  ['2 sua chua'],
  'ambiguous search keeps the parsed customer wording',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('ko duong',3)],catalog).map(row=>row.line),
  ['3 ko duong'],
  'generic attribute-only text is not enough to rename to an unrelated unique product',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('san pham khong co',3)],catalog).map(row=>row.line),
  ['3 san pham khong co'],
);

assert.equal(findCatalogProduct('sua chua ko',catalog)?.productId,'vnm21');

assert.equal(
  findCatalogProduct('bi to viet quat',structuredCatalog)?.productName,
  'Sua probi to mau - viet quat',
  'a configured alias in an earlier priority column can be the main key',
);

assert.equal(
  findCatalogProduct('proby to xyz viet quat',structuredCatalog)?.productName,
  'Sua probi to mau - viet quat',
  'unknown lower-priority wording must not destroy a unique structured match',
);

assert.equal(
  findCatalogProduct('sua chua green',structuredCatalog)?.productName,
  'Sua chua greenfram',
  'multi-name cells are searched as aliases without requiring the canonical combined spelling',
);

assert.equal(
  findCatalogProduct('green lit',structuredCatalog)?.productName,
  'Sua green lit',
  'the leftmost matching key wins before later-column aliases are considered',
);

assert.equal(
  findCatalogProduct('tho do',structuredCatalog),
  null,
  'a correct parent path stays unresolved while multiple products remain',
);

assert.equal(
  findCatalogProduct('tho do giay 1,2kg',structuredCatalog)?.productName,
  'Sua tho do giay 1284g',
  'later priority columns disambiguate within the already-matched parent path',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([line('bi to viet quat',5)],structuredCatalog).map(row=>row.line),
  ['5 Sua probi to mau - viet quat (bi to viet quat)'],
  'a unique structured match outputs the canonical product name (column K)',
);

console.log('chat shared-product catalog search contract PASS');