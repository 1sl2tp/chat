import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';
import { protectNumericLeadingProducts } from '../supabase/functions/v21-ai-product-parser/numeric-product-protection.mjs';

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

const milkCatalog = [
  {id:'s17',name:'Sua chua co',source:'Sữa',level1:'sua',level2:'chua',level3:'co'},
  {id:'s20',name:'Sua chua it',source:'Sữa',level1:'sua',level2:'chua',level3:'it'},
  {id:'s21',name:'Sua chua khong',source:'Sữa',level1:'sua',level2:'chua',level3:'khong'},
  {id:'s23',name:'Sua chua nha dam co',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'co'},
  {id:'s24',name:'Sua chua nha dam it',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'it'},
];

assert.deepEqual(
  findCatalogProduct('chua co duong', milkCatalog),
  {productName:'Sua chua co', productId:'s17'},
  'customer wording co duong maps only to the exact catalog key co; chua+co is then the exact 2-3 window and may infer level 1 sua',
);

assert.deepEqual(
  findCatalogProduct('chua nha dam', milkCatalog),
  {productName:'Sua chua nha dam', productId:null},
  'three exact adjacent keys may match a 2-3-4 window and infer only the common level 1 to the left',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Chua có đường',line:'3 Chua có đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
    {quantity:3,productName:'Không đường',line:'3 Không đường'},
  ],milkCatalog).map(row=>row.line),
  [
    '3 Sua chua co (Chua có đường)',
    '3 Sua chua it (Ít đường)',
    '3 Sua chua khong (Không đường)',
  ],
  'once chua+co establishes the sua chua branch, exact it/khong sugar wording stays inside that branch',
);

const numericCatalog = [
  {id:'s1',name:'Sua 9 hat',source:'Sữa',level1:'sua',level2:'9',level3:'hat'},
  {id:'s2',name:'Sua 9 hat cao dam',source:'Sữa',level1:'sua',level2:'9',level3:'hat',level4:'cao',level5:'dam'},
  {id:'m1',name:'Nuoc 247',source:'Hàng thường',level1:'nuoc',level2:'247'},
  {id:'m2',name:'Nuoc 247 chai nhua',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'chai',level4:'nhua'},
  {id:'m3',name:'Nuoc 247 lon thap',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'lon',level4:'thap'},
];

assert.deepEqual(
  resolveParsedLinesWithCatalog(
    protectNumericLeadingProducts([{quantity:9,productName:'Hat 2',line:'9 Hat 2'}],numericCatalog),
    numericCatalog,
  )[0],
  {
    quantity:2,
    productName:'Sua 9 hat',
    line:'2 Sua 9 hat (9 Hat)',
    rawProductName:'9 Hat',
    productId:null,
    catalogMatched:true,
    catalogContextMatched:false,
  },
  'when part 1 reads 9 as quantity, exact catalog phrase 9 hat must protect the numeric product phrase and move trailing 2 to quantity',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog(
    protectNumericLeadingProducts([{quantity:247,productName:'2',line:'247 2'}],numericCatalog),
    numericCatalog,
  )[0],
  {
    quantity:2,
    productName:'Nuoc 247',
    line:'2 Nuoc 247 (247)',
    rawProductName:'247',
    productId:null,
    catalogMatched:true,
    catalogContextMatched:false,
  },
  '247 is an exact catalog key with one shared left parent nuoc, so 247 2 means product 247 quantity 2',
);

console.log('chat exact key + common-left-prefix formula PASS');
