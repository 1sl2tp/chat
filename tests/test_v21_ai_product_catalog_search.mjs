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
  {id:'s6',name:'Sua chua duong den',source:'Sữa',level1:'sua',level2:'chua',level3:'duong',level4:'den'},
  {id:'p1',name:'Sua probi be mau - dua',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'dua'},
  {id:'p2',name:'Sua probi be mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'vq'},
  {id:'p3',name:'Sua probi to mau - it',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'it'},
  {id:'p4',name:'Sua probi to mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'vq'},
  {id:'w1',name:'Cf wakeup bich',source:'Hàng thường',level1:'cf',level2:'wakeup',level3:'bich'},
  {id:'g1',name:'Cf g7 bich',source:'Hàng thường',level1:'cf',level2:'g7',level3:'bich'},
  {id:'m1',name:'Sua bo bich co',source:'Sữa',level1:'sua',level2:'bo',level3:'bich',level4:'co'},
  {id:'x1',name:'Keo to mau',source:'Hàng thường',level1:'keo',level2:'to',level3:'mau'},
];

// Direct keys are exact adjacent level windows only.
assert.deepEqual(findCatalogProduct('cosy',catalog),{productName:'Banh cosy',productId:null});
assert.deepEqual(findCatalogProduct('probi',catalog),{productName:'Sua probi',productId:null});
assert.equal(findCatalogProduct('bich',catalog),null);
assert.equal(findCatalogProduct('chua co',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('cosy 336',catalog)?.productName,'Banh cosy 336');
assert.deepEqual(findCatalogProduct('chua nha dam',catalog),{productName:'Sua chua nha dam',productId:null});
assert.deepEqual(findCatalogProduct('probi be mau',catalog),{productName:'Sua probi be mau',productId:null});
assert.equal(findCatalogProduct('chua dam',catalog),null,'direct windows cannot skip a level');
assert.equal(findCatalogProduct('probi mau',catalog),null,'direct windows cannot skip a level');
assert.equal(findCatalogProduct('cos',catalog),null);
assert.equal(findCatalogProduct('prob',catalog),null);
assert.equal(findCatalogProduct('chua co duong',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('chua it duong',catalog)?.productName,'Sua chua it');
assert.equal(findCatalogProduct('chua khong duong',catalog)?.productName,'Sua chua khong');
assert.equal(findCatalogProduct('Sua chua nha dam co',catalog)?.productName,'Sua chua nha dam co');
assert.equal(findCatalogProduct('Sua chua duong den',catalog)?.productName,'Sua chua duong den');

// Filter context keeps only a certain 1 or 1-2 anchor. A lower window may use
// that anchor, but no old 3-4/4-5 branch is inherited. Unknown input is kept + *.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Chua có đường',line:'3 Chua có đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
    {quantity:2,productName:'Probi to mau',line:'2 Probi to mau'},
    {quantity:2,productName:'vq',line:'2 vq'},
    {quantity:3,productName:'Chua không đường',line:'3 Chua không đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
  ],catalog).map(row=>row.line),
  [
    '3 Sua chua co (Chua có đường)',
    '3 Ít đường *',
    '2 Sua probi to mau (Probi to mau)',
    '2 vq *',
    '3 Sua chua khong (Chua không đường)',
    '3 Ít đường *',
  ],
  'carry is a 1/1-2 filter only; if the scoped key is still not exclusive, keep raw input + *',
);

// Longest-to-shorter key detection: the full input may fail, but the first
// shorter exclusive key establishes the 1/1-2 filter. Stop at that level.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:1,productName:'Probi xyz',line:'1 Probi xyz'},
    {quantity:2,productName:'to mau',line:'2 to mau'},
    {quantity:1,productName:'Chua abc',line:'1 Chua abc'},
    {quantity:2,productName:'to mau',line:'2 to mau'},
  ],catalog).map(row=>row.line),
  [
    '1 Probi xyz *',
    '2 Sua probi to mau (to mau)',
    '1 Chua abc *',
    '2 to mau *',
  ],
  '2-token input falls back to an exclusive 1-token anchor; a different 1/1-2 anchor resets the previous filter',
);

// When a failed full input contains a longer valid embedded phrase, prefer that
// phrase over its shorter sub-phrase and keep the exact branch it identified.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:1,productName:'Probi to xyz',line:'1 Probi to xyz'},
    {quantity:2,productName:'mau',line:'2 mau'},
  ],catalog).map(row=>row.line),
  [
    '1 Probi to xyz *',
    '2 Sua probi to mau (mau)',
  ],
  'probi to must win over probi and preserve the sua/probi/to branch',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:1,productName:'Ít đường',line:'1 Ít đường'},
    {quantity:1,productName:'Chua có đường',line:'1 Chua có đường'},
  ],catalog).map(row=>row.line),
  ['1 Ít đường *','1 Sua chua co (Chua có đường)'],
  'no lookahead: a later key cannot change an earlier line',
);

console.log('chat binary exact-window filter + bounded 1/1-2 carry PASS');
