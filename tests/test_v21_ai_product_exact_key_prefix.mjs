import assert from 'node:assert/strict';
import { findCatalogProduct, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';
import { protectNumericLeadingProducts } from '../supabase/functions/v21-ai-product-parser/numeric-product-protection.mjs';

const cosyCatalog = [
  {id:'ht13',name:'Banh cosy 336',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'336'},
  {id:'ht14',name:'Banh cosy 48',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'48'},
  {id:'ht15',name:'Banh cosy 480',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'480'},
  {id:'ht16',name:'Banh cosy que',source:'Hàng thường',level1:'banh',level2:'cosy',level3:'que'},
];

assert.deepEqual(findCatalogProduct('cosy',cosyCatalog),{productName:'Banh cosy',productId:null});
assert.equal(findCatalogProduct('cos',cosyCatalog),null);
assert.equal(findCatalogProduct('cosyy',cosyCatalog),null);
assert.equal(findCatalogProduct('cosy 336',cosyCatalog)?.productName,'Banh cosy 336');
assert.equal(findCatalogProduct('cosy',[...cosyCatalog,{id:'k1',name:'Keo cosy deo',source:'Hàng thường',level1:'keo',level2:'cosy',level3:'deo'}]),null);
assert.equal(findCatalogProduct('cung',[{id:'tl1',name:'Cứng',source:'Thuốc lá',level1:'cung'}])?.productName,'Cứng');

const milkCatalog = [
  {id:'s17',name:'Sua chua co',source:'Sữa',level1:'sua',level2:'chua',level3:'co',aliases:'co | co duong | truyen thong | trang'},
  {id:'s20',name:'Sua chua it',source:'Sữa',level1:'sua',level2:'chua',level3:'it',aliases:'it | it duong'},
  {id:'s21',name:'Sua chua khong',source:'Sữa',level1:'sua',level2:'chua',level3:'khong',aliases:'khong | khong duong'},
  {id:'s23',name:'Sua chua nha dam co',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'co',aliases:'co | co duong | truyen thong | trang'},
  {id:'s24',name:'Sua chua nha dam it',source:'Sữa',level1:'sua',level2:'chua',level3:'nha',level4:'dam',level5:'it',aliases:'it | it duong'},
  {id:'p1',name:'Sua probi be mau - it',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'it',aliases:'it | it duong'},
  {id:'p2',name:'Sua probi be mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'vq'},
  {id:'p3',name:'Sua probi to mau - it',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'it',aliases:'it | it duong'},
  {id:'p4',name:'Sua probi to mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'vq'},
  {id:'p5',name:'Sua probi to trang',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'trang',aliases:'trang | co | co duong | truyen thong'},
];

assert.deepEqual(findCatalogProduct('chua co duong',milkCatalog),{productName:'Sua chua co',productId:'s17'});
assert.deepEqual(findCatalogProduct('chua nha dam',milkCatalog),{productName:'Sua chua nha dam',productId:null});
assert.equal(findCatalogProduct('chua dam',milkCatalog),null,'direct windows cannot skip a level');
assert.deepEqual(
  findCatalogProduct('probi to co duong',milkCatalog),
  {productName:'Sua probi to trang',productId:'p5'},
  'input phrase must resolve only because the catalog row explicitly contains that alias',
);
assert.equal(
  findCatalogProduct('probi to nguyen ban',milkCatalog),
  null,
  'runtime must never invent an alias that is absent from catalog data',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Chua có đường',line:'3 Chua có đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
    {quantity:2,productName:'Probi to mau',line:'2 Probi to mau'},
    {quantity:2,productName:'vq',line:'2 vq'},
    {quantity:3,productName:'Chua không đường',line:'3 Chua không đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
  ],milkCatalog).map(row=>row.line),
  [
    '3 Sua chua co (Chua có đường)',
    '3 Ít đường *',
    '2 Sua probi to mau (Probi to mau)',
    '2 vq *',
    '3 Sua chua khong (Chua không đường)',
    '3 Ít đường *',
  ],
  'binary filter carries only 1/1-2; deeper ambiguity is not inherited or guessed',
);

const numericCatalog = [
  {id:'s1',name:'Sua 9 hat',source:'Sữa',level1:'sua',level2:'9',level3:'hat'},
  {id:'s2',name:'Sua 9 hat cao dam',source:'Sữa',level1:'sua',level2:'9',level3:'hat',level4:'cao',level5:'dam'},
  {id:'m1',name:'Nuoc 247',source:'Hàng thường',level1:'nuoc',level2:'247'},
  {id:'m2',name:'Nuoc 247 chai nhua',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'chai',level4:'nhua'},
  {id:'m3',name:'Nuoc 247 lon thap',source:'Hàng masan',level1:'nuoc',level2:'247',level3:'lon',level4:'thap'},
];

assert.deepEqual(
  resolveParsedLinesWithCatalog(protectNumericLeadingProducts([{quantity:9,productName:'Hat 2',line:'9 Hat 2'}],numericCatalog),numericCatalog)[0],
  {quantity:2,productName:'Sua 9 hat',line:'2 Sua 9 hat (9 Hat)',rawProductName:'9 Hat',productId:null,catalogMatched:true,catalogContextMatched:false},
);
assert.deepEqual(
  resolveParsedLinesWithCatalog(protectNumericLeadingProducts([{quantity:247,productName:'2',line:'247 2'}],numericCatalog),numericCatalog)[0],
  {quantity:2,productName:'Nuoc 247',line:'2 Nuoc 247 (247)',rawProductName:'247',productId:null,catalogMatched:true,catalogContextMatched:false},
);

console.log('chat exact key + binary 1/1-2 filter + catalog alias PASS');
