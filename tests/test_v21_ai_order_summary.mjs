import assert from 'node:assert/strict';
import { formatOrderSummary } from '../supabase/functions/v21-ai-product-parser/order-summary.mjs';
import { resolveParsedLinesWithCatalog } from '../supabase/functions/v21-ai-product-parser/catalog-search.mjs';

assert.equal(
  formatOrderSummary([
    {quantity:4,productName:'Bo',catalogMatched:false,line:'4 Bo *'},
    {quantity:6,productName:'Hai san',source:'Hàng thường',line:'6 Hai san *'},
    {quantity:5,productName:'Sua chua it',source:'Sữa',line:'5 Sua chua it *'},
    {quantity:5,productName:'Nam ngu',source:'Hàng masan',line:'5 Nam ngu *'},
    {quantity:20,productName:'SG bac',source:'Thuốc lá',line:'20 SG bac *'},
  ]),
  '— Tổng: 5 mã · 20 thùng · Thuốc lá: 20 cây',
  'summary counts every result row, including unresolved *, while tobacco is separated from the non-tobacco quantity',
);

assert.equal(
  formatOrderSummary([
    {quantity:10,productName:'Sua',source:'Sữa',line:'10 Sua *'},
    {quantity:60,productName:'SG bac',source:'Thuốc lá',line:'60 SG bac *'},
  ]),
  '— Tổng: 2 mã · 10 thùng · Thuốc lá: 60 cây ~ 1 thùng',
  'tobacco over 50 trees gets an approximate carton hint',
);

assert.equal(
  formatOrderSummary([
    {quantity:3,productName:'Unknown',line:'3 Unknown *'},
  ]),
  '— Tổng: 1 mã · 3 thùng',
  'unresolved rows still participate in the aggregate',
);

const resolved=resolveParsedLinesWithCatalog([
  {quantity:4,productName:'Sua chua co',line:'4 Sua chua co'},
  {quantity:20,productName:'SG bac',line:'20 SG bac'},
],[
  {id:'S-1',name:'Sua chua co',source:'Sữa',level1:'sua',level2:'chua',level3:'co'},
  {id:'TL-1',name:'SG bạc',source:'Thuốc lá',level1:'sg',level2:'bac'},
]);
assert.equal(
  formatOrderSummary(resolved),
  '— Tổng: 2 mã · 4 thùng · Thuốc lá: 20 cây',
  'catalog source must survive resolution so tobacco is not counted as a normal carton',
);

console.log('chat order summary footer contract PASS');
