import assert from 'node:assert/strict';
import { formatOrderSummary } from '../supabase/functions/v21-ai-product-parser/order-summary.mjs';

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

console.log('chat order summary footer contract PASS');
