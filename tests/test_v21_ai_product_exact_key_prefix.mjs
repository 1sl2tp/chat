import assert from 'node:assert/strict';
import { findCatalogProduct } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

const cosyCatalog = [
  {id:'ht13',name:'Banh cosy 336',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'336'},
  {id:'ht14',name:'Banh cosy 48',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'48'},
  {id:'ht15',name:'Banh cosy 480',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'480'},
  {id:'ht16',name:'Banh cosy que',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'que'},
];

// Exact key lookup may climb left only when every matching row has the same left prefix.
assert.deepEqual(
  findCatalogProduct('cosy', cosyCatalog),
  {productName:'Banh cosy', productId:null},
  'cosy is exact level 2 in four rows and all four share banh > cosy, so only that common prefix is certain',
);

// Exact means exact: no substring/fuzzy lookup.
assert.equal(findCatalogProduct('cos', cosyCatalog), null);
assert.equal(findCatalogProduct('cosyy', cosyCatalog), null);

// Adding an exact next key resolves the one full product.
assert.equal(findCatalogProduct('cosy 336', cosyCatalog)?.productName, 'Banh cosy 336');

// If the same exact key exists under different left parents, no parent may be invented.
assert.equal(
  findCatalogProduct('cosy', [
    ...cosyCatalog,
    {id:'k1',name:'Keo cosy deo',source:'Hàng thường',level1:'keo',level2:'cosy',level3:'deo'},
  ]),
  null,
  'banh > cosy and keo > cosy disagree on the left prefix, so cosy stays unresolved',
);

// 100% unaccented exact key search still resolves a unique one-row branch.
assert.equal(
  findCatalogProduct('cung', [
    {id:'tl1',name:'Cứng',source:'Thuốc lá',level1:'cung'},
  ])?.productName,
  'Cứng',
);

console.log('chat exact key + common-left-prefix formula PASS');
