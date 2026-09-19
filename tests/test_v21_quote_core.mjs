import assert from 'node:assert/strict';
import {buildQuoteItems, makePublicPayload} from '../supabase/functions/v21-quote/quote-core.mjs';

const items=buildQuoteItems([
  {
    product_code:'A',product_name:'Sua A',source_key:'sua',sale_price_vnd:100000,
    carton_price_vnd:100000,retail_price_vnd:5000,input_price_basis:'carton',
    units_per_carton:20,retail_unit:'hop',input_price_vnd:90000,applied_profit_vnd:10000,
  },
  {product_code:'B',product_name:'Sua B',source_key:'sua',sale_price_vnd:null},
]);

assert.deepEqual(items,[{
  product_code:'A',product_name:'Sua A',source_key:'sua',display_price_vnd:100000,
  carton_price_vnd:100000,retail_price_vnd:5000,primary_packaging:'Thùng',
  retail_packaging:'1 hop',units_per_carton:20,retail_unit:'hop',
},{
  product_code:'B',product_name:'Sua B',source_key:'sua',display_price_vnd:null,
  carton_price_vnd:null,retail_price_vnd:null,primary_packaging:'Thùng',
  retail_packaging:'',units_per_carton:null,retail_unit:null,
}]);
assert.equal('input_price_vnd' in items[0],false);
assert.equal('applied_profit_vnd' in items[0],false);
assert.equal(items[1].display_price_vnd,null);

const sources=[{source_key:'sua',source_name:'Sữa',sort_order:2}];
const publicPayload=makePublicPayload({
  scope:'source',source_key:'sua',source_name:'Sữa',item_count:1,
  created_at:'2026-09-13T00:00:00.000Z',payload:{items,sources},created_by:'secret-admin-id'
});
assert.deepEqual(publicPayload,{
  ok:true,scope:'source',source_key:'sua',source_name:'Sữa',item_count:1,
  created_at:'2026-09-13T00:00:00.000Z',sources,items,
});
assert.equal('created_by' in publicPayload,false);

console.log('chat quote core contract PASS');
