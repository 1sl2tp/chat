import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

const catalog=[
  {id:'b1',name:'Banh cosy 336',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'336'},
  {id:'b2',name:'Banh cosy 48',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'48'},
  {id:'s1',name:'Sua chua co',source:'Sữa',level1:'sua',level2:'chua',level3:'co'},
  {id:'s2',name:'Sua chua it',source:'Sữa',level1:'sua',level2:'chua',level3:'it'},
  {id:'s3',name:'Sua chua khong',source:'Sữa',level1:'sua',level2:'chua',level3:'khong'},
  {id:'s4',name:'Sua chua nha dam co',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'co'},
  {id:'s5',name:'Sua chua nha dam it',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'it'},
  {id:'p1',name:'Sua probi be mau - dua',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'dua'},
  {id:'p2',name:'Sua probi to mau - it',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'it'},
  {id:'w1',name:'Cf wakeup bich',source:'Hàng thường',level1:'cf',level2:'wakeup',level3:'bich'},
  {id:'g1',name:'Cf g7 bich',source:'Hàng thường',level1:'cf',level2:'g7',level3:'bich'},
  {id:'m1',name:'Sua bo bich co',source:'Sữa',level1:'sua',level2:'bo',level3:'bich',level4:'co'},
];

// Exact single key may infer only a common left prefix.
assert.deepEqual(findCatalogProduct('cosy',catalog),{productName:'Banh cosy',productId:null});
assert.deepEqual(findCatalogProduct('probi',catalog),{productName:'Sua probi',productId:null});
assert.equal(findCatalogProduct('bich',catalog),null,'bich has multiple different left parents');

// Exact adjacent two-level window.
assert.equal(findCatalogProduct('chua co',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('cosy 336',catalog)?.productName,'Banh cosy 336');

// Exact adjacent three-level window.
assert.deepEqual(
  findCatalogProduct('chua nha dam',catalog),
  {productName:'Sua chua nha dam',productId:null},
);
assert.deepEqual(
  findCatalogProduct('probi be mau',catalog),
  {productName:'Sua probi be mau',productId:null},
);

// No skipped level and no fuzzy/substring search.
assert.equal(findCatalogProduct('chua dam',catalog),null);
assert.equal(findCatalogProduct('probi mau',catalog),null);
assert.equal(findCatalogProduct('cos',catalog),null);
assert.equal(findCatalogProduct('prob',catalog),null);

// Sugar wording is a tiny dictionary overlay, not a new tree level.
assert.equal(findCatalogProduct('chua co duong',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('chua it duong',catalog)?.productName,'Sua chua it');
assert.equal(findCatalogProduct('chua khong duong',catalog)?.productName,'Sua chua khong');

// Full canonical name remains valid.
assert.equal(findCatalogProduct('Sua chua nha dam co',catalog)?.productName,'Sua chua nha dam co');

// Every line is independent. There is no previous-line topic/context carry.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Chua có đường',line:'3 Chua có đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
    {quantity:2,productName:'Probi be mau',line:'2 Probi be mau'},
    {quantity:3,productName:'Không đường',line:'3 Không đường'},
  ],catalog).map(row=>row.line),
  [
    '3 Sua chua co (Chua có đường)',
    '3 Ít đường',
    '2 Sua probi be mau (Probi be mau)',
    '3 Không đường',
  ],
);

console.log('chat exact adjacent 1-3 level product formula PASS');
