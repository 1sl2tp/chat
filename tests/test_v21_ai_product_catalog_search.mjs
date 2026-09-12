import assert from 'node:assert/strict';
import { findCatalogProduct, formatCatalogSearchDisplayRows, resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

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

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:1,productName:'Probi to mau it',line:'1 Probi to mau it'},
    {quantity:9,productName:'unknown',line:'9 unknown'},
    {quantity:2,productName:'vq',line:'2 vq'},
    {quantity:1,productName:'Chua nha dam co',line:'1 Chua nha dam co'},
    {quantity:3,productName:'it',line:'3 it'},
  ],catalog).map(row=>row.line),
  [
    '1 Sua probi to mau - it (Probi to mau it)',
    '9 unknown *',
    '2 Sua probi to mau - vq (vq)',
    '1 Sua chua nha dam co (Chua nha dam co)',
    '3 Sua chua nha dam it (it)',
  ],
  'carry full successful key; back off from the right; failed rows do not replace it; a new successful key does',
);

assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Probi to có đường',line:'3 Probi to có đường'},
  ],catalog).map(row=>row.line),
  ['3 Sua probi to có đường *'],
  'same-line progressive search must keep sua/probi/to before the unknown tail',
);

// A partial line has already proven a level key. Keep that key for the next
// line. The next line tries the deepest key first, then backs off right-to-left
// (4,3,2,1...) until its first word becomes exclusive, and continues the rest
// of that same line from the newly proven key.
assert.deepEqual(
  resolveParsedLinesWithCatalog([
    {quantity:3,productName:'Chua co đường',line:'3 Chua co đường'},
    {quantity:3,productName:'Ít đường',line:'3 Ít đường'},
    {quantity:3,productName:'Nha đam có',line:'3 Nha đam có'},
    {quantity:3,productName:'Không đường',line:'3 Không đường'},
  ],catalog).map(row=>row.line),
  [
    '3 Sua chua co đường *',
    '3 Sua chua it đường *',
    '3 Sua chua nha dam co (Nha đam có)',
    '3 Sua chua khong đường *',
  ],
  'partial keys carry; each following line backs off 4-3-2-1 and then continues left-to-right',
);

// Search display may normalize accents, but must never reorder rows because
// row order carries context and shared-parent structure from the customer input.
const searched=resolveParsedLinesWithCatalog([
  {quantity:2,productName:'Probi to có đường',line:'2 Probi to có đường'},
  {quantity:3,productName:'Chua nha dam co',line:'3 Chua nha dam co'},
  {quantity:1,productName:'Chua co đường',line:'1 Chua co đường'},
],catalog);
assert.deepEqual(
  searched.map(row=>row.line),
  [
    '2 Sua probi to có đường *',
    '3 Sua chua nha dam co (Chua nha dam co)',
    '1 Sua chua co đường *',
  ],
  'Tách / resolver order stays unchanged',
);
assert.deepEqual(
  formatCatalogSearchDisplayRows(searched).map(row=>row.line),
  [
    '2 Sua probi to co duong *',
    '3 Sua chua nha dam co (Chua nha dam co)',
    '1 Sua chua co duong *',
  ],
  'Tìm display keeps original row order; no A-Z sorting',
);

console.log('chat binary progressive key + full carry/backoff + stable search display order PASS');
