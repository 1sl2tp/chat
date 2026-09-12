import assert from 'node:assert/strict';
import {buildQuoteItems, makePublicPayload} from '../supabase/functions/v21-quote/quote-core.mjs';

const items=buildQuoteItems([
  {
    product_code:'A',product_name:'Sua A',source_key:'sua',display_price_vnd:100000,
    carton_price_vnd:100000,retail_price_vnd:5000,primary_packaging:'thung',retail_packaging:'hop',
    units_per_carton:20,retail_unit:'hop',input_price_vnd:90000,actual_profit_vnd:10000,
  },
  {product_code:'B',product_name:'Sua B',source_key:'sua',display_price_vnd:null},
]);

assert.deepEqual(items,[{
  product_code:'A',product_name:'Sua A',source_key:'sua',display_price_vnd:100000,
  carton_price_vnd:100000,retail_price_vnd:5000,primary_packaging:'thung',retail_packaging:'hop',
  units_per_carton:20,retail_unit:'hop',
}]);
assert.equal('input_price_vnd' in items[0],false);
assert.equal('actual_profit_vnd' in items[0],false);

const publicPayload=makePublicPayload({
  scope:'source',source_key:'sua',source_name:'Sữa',item_count:1,
  created_at:'2026-09-13T00:00:00.000Z',payload:{items},created_by:'secret-admin-id'
});
assert.deepEqual(publicPayload,{
  ok:true,scope:'source',source_key:'sua',source_name:'Sữa',item_count:1,
  created_at:'2026-09-13T00:00:00.000Z',items,
});
assert.equal('created_by' in publicPayload,false);

console.log('chat quote core contract PASS');
