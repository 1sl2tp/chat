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
  {id:'p2',name:'Sua probi be mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'be',level4:'mau',level5:'vq'},
  {id:'p3',name:'Sua probi to mau - it',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'it'},
  {id:'p4',name:'Sua probi to mau - vq',source:'Sữa',level1:'sua',level2:'probi',level3:'to',level4:'mau',level5:'vq'},
  {id:'w1',name:'Cf wakeup bich',source:'Hàng thường',level1:'cf',level2:'wakeup',level3:'bich'},
  {id:'g1',name:'Cf g7 bich',source:'Hàng thường',level1:'cf',level2:'g7',level3:'bich'},
  {id:'m1',name:'Sua bo bich co',source:'Sữa',level1:'sua',level2:'bo',level3:'bich',level4:'co'},
];

assert.deepEqual(findCatalogProduct('cosy',catalog),{productName:'Banh cosy',productId:null});
assert.deepEqual(findCatalogProduct('probi',catalog),{productName:'Sua probi',productId:null});
assert.equal(findCatalogProduct('bich',catalog),null);
assert.equal(findCatalogProduct('chua co',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('cosy 336',catalog)?.productName,'Banh cosy 336');
assert.deepEqual(findCatalogProduct('chua nha dam',catalog),{productName:'Sua chua nha dam',productId:null});
assert.deepEqual(findCatalogProduct('probi be mau',catalog),{productName:'Sua probi be mau',productId:null});
assert.equal(findCatalogProduct('chua dam',catalog),null);
assert.equal(findCatalogProduct('probi mau',catalog),null);
assert.equal(findCatalogProduct('cos',catalog),null);
assert.equal(findCatalogProduct('prob',catalog),null);
assert.equal(findCatalogProduct('chua co duong',catalog)?.productName,'Sua chua co');
assert.equal(findCatalogProduct('chua it duong',catalog)?.productName,'Sua chua it');
assert.equal(findCatalogProduct('chua khong duong',catalog)?.productName,'Sua chua khong');
assert.equal(findCatalogProduct('Sua chua nha dam co',catalog)?.productName,'Sua chua nha dam co');

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
    '3 Sua chua it (Ít đường)',
    '2 Sua probi to mau (Probi to mau)',
    '2 vq',
    '3 Sua chua khong (Chua không đường)',
    '3 Sua chua it (Ít đường)',
  ],
  'context carries only prefix 1-2 (or 1 when only level1 exists); an explicit different 1-2/1-2-3 resets it, and deeper previous levels are never inherited',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:1,productName:'Ít đường',line:'1 Ít đường'},
    {quantity:1,productName:'Chua có đường',line:'1 Chua có đường'},
  ],catalog).map(row=>row.line),
  ['1 Ít đường','1 Sua chua co (Chua có đường)'],
  'no lookahead: a later anchor cannot change an earlier line',
);

console.log('chat exact adjacent windows + bounded carry PASS');
