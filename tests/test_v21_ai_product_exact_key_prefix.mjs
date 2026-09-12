import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

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

const numericCatalog = [
  {id:'s1',name:'Sua 9 hat',source:'Sữa',level1:'sua',level2:'9',level3:'hat'},
  {id:'s2',name:'Sua 9 hat cao dam',source:'Sữa',level1:'sua',level2:'9',level3:'hat',level4:'cao',level5:'dam'},
  {id:'m1',name:'Nuoc 247',source:'Hàng thường',level1:'nuoc',level2:'247'},
  {id:'m2',name:'Nuoc 247 chai nhua',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'chai',level4:'nhua'},
  {id:'m3',name:'Nuoc 247 lon thap',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'lon',level4:'thap'},
];

assert.deepEqual(
  resolveParsedLinesWithCatalog([{quantity:9,productName:'Hat 2',line:'9 Hat 2'}],numericCatalog)[0],
  {
    quantity:2,
    productName:'Sua 9 hat',
    line:'2 Sua 9 hat (9 Hat)',
    rawProductName:'9 Hat',
    productId:'s1',
    catalogMatched:true,
    catalogContextMatched:false,
  },
  'when part 1 reads 9 as quantity, exact catalog phrase 9 hat must protect the numeric product phrase and move trailing 2 to quantity',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([{quantity:247,productName:'2',line:'247 2'}],numericCatalog)[0],
  {
    quantity:2,
    productName:'Nuoc 247',
    line:'2 Nuoc 247 (247)',
    rawProductName:'247',
    productId:'m1',
    catalogMatched:true,
    catalogContextMatched:false,
  },
  '247 is an exact catalog key with one shared left parent nuoc, so 247 2 means product 247 quantity 2',
);

console.log('chat exact key + common-left-prefix formula PASS');
