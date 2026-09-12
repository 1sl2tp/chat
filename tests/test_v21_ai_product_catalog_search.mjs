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

console.log('chat shared-product catalog search contract PASS');
