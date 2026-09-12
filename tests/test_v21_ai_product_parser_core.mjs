import assert from 'node:assert/strict';
import { finalizeProductLines } from '../supabase/functions/v21-ai-product-parser/parser-core.mjs';

const catalog=[
  {productCode:'SUA-000022',productName:'Sua chua nep cam'},
  {productCode:'HT-000105',productName:'Mi indi'},
];

{
  const result=finalizeProductLines([
    {quantity:2,product_code:'SUA-000022',product_name:'sc nep cam',unit_hint:'thùng'},
  ],catalog);
  assert.deepEqual(result,[{
    quantity:2,
    productCode:'SUA-000022',
    productName:'Sua chua nep cam',
    matched:true,
    line:'2 Sua chua nep cam',
  }]);
}

{
  const result=finalizeProductLines([
    {quantity:2,product_code:null,product_name:'chân gà',unit_hint:'thùng'},
    {quantity:1,product_code:'FAKE-001',product_name:'cửu ca',unit_hint:null},
  ],catalog);
  assert.equal(result[0].line,'2 chân gà (chưa có SKU)');
  assert.equal(result[1].line,'1 cửu ca (chưa có SKU)');
  assert.equal(result[0].productCode,null);
  assert.equal(result[1].productCode,null);
  assert.equal(result[0].matched,false);
  assert.equal(result[1].matched,false);
}

{
  const result=finalizeProductLines([
    {quantity:10,product_code:'HT-000105',product_name:'indomie',unit_hint:'thùng'},
  ],catalog);
  assert.equal(result[0].line,'10 Mi indi');
  assert.doesNotMatch(result[0].line,/thùng|HT-000105/i);
}

console.log('chat AI product parser core contract PASS');
