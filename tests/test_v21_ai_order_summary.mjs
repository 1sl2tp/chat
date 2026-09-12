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
  '— Tổng: 5 dòng · 40 sản phẩm · Thuốc lá: 20 cây',
  'summary counts every line and every quantity; known tobacco is only an extra breakdown',
);

assert.equal(
  formatOrderSummary([
    {quantity:10,productName:'Sua',source:'Sữa',line:'10 Sua *'},
    {quantity:60,productName:'SG bac',source:'Thuốc lá',line:'60 SG bac *'},
  ]),
  '— Tổng: 2 dòng · 70 sản phẩm · Thuốc lá: 60 cây ~ 1 thùng',
  'known tobacco may keep the approximate-carton hint without changing the neutral total',
);

assert.equal(
  formatOrderSummary([
    {quantity:3,productName:'Unknown',line:'3 Unknown *'},
  ]),
  '— Tổng: 1 dòng · 3 sản phẩm',
  'unresolved rows still participate in the neutral aggregate without guessing a unit',
);

const summaryCatalog=[
  {id:'S-1',name:'Sua chua co',source:'Sữa',level1:'sua',level2:'chua',level3:'co'},
  {id:'TL-1',name:'SG bạc',source:'Thuốc lá',level1:'sg',level2:'bac'},
];
const resolved=resolveParsedLinesWithCatalog([
  {quantity:4,productName:'Sua chua co',line:'4 Sua chua co'},
  {quantity:20,productName:'SG bac',line:'20 SG bac'},
],summaryCatalog);
assert.equal(
  formatOrderSummary(resolved,summaryCatalog),
  '— Tổng: 2 dòng · 24 sản phẩm · Thuốc lá: 20 cây',
  'catalog metadata adds a tobacco breakdown only after normal search resolution',
);

const tobaccoCatalog=[
  {id:'TL-MEM',name:'Mềm',source:'Thuốc lá',level1:'mem'},
  {id:'TL-CUNG',name:'Cứng',source:'Thuốc lá',level1:'cung'},
  {id:'TL-DET',name:'Dẹt',source:'Thuốc lá',level1:'det'},
  {id:'TL-SGX',name:'SG xanh',source:'Thuốc lá',level1:'sg',level2:'xanh'},
  {id:'TL-SGD',name:'SG đào',source:'Thuốc lá',level1:'sg',level2:'dao'},
  {id:'TL-LOTUS',name:'Lotus',source:'Thuốc lá',level1:'lotus'},
  {id:'HT-G7DET',name:'Cf g7 det',source:'Hàng thường',level1:'cf',level2:'g7',level3:'det'},
  {id:'HT-XANH',name:'Banh xanh',source:'Hàng thường',level1:'banh',level2:'xanh'},
];
assert.equal(
  formatOrderSummary([
    {quantity:1,productName:'Thang long mem',line:'1 Thang long mem *'},
    {quantity:1,productName:'Thang long cung',line:'1 Thang long cung *'},
    {quantity:2,productName:'Thang long det',line:'2 Thang long det *'},
    {quantity:25,productName:'Sai gon xanh',line:'25 Sai gon xanh *'},
    {quantity:10,productName:'Sai gon dao',line:'10 Sai gon dao *'},
    {quantity:10,productName:'Lotus',productId:'TL-LOTUS',line:'10 Lotus'},
    {quantity:10,productName:'Ba so det vang',line:'10 Ba so det vang *'},
  ],tobaccoCatalog),
  '— Tổng: 7 dòng · 59 sản phẩm · Thuốc lá: 10 cây',
  'unresolved display wording must not be guessed as tobacco; only identified source contributes to the breakdown',
);

assert.equal(
  formatOrderSummary([
    {quantity:42,productName:'Hang khac',line:'42 Hang khac *'},
    {quantity:1,productName:'Thang long mem',line:'1 Thang long mem *'},
    {quantity:1,productName:'Sai gon dua',line:'1 Sai gon dua *'},
  ],tobaccoCatalog),
  '— Tổng: 3 dòng · 44 sản phẩm',
  'unresolved tobacco-looking wording remains neutral and is still fully counted in total products',
);

console.log('chat neutral line/product summary footer contract PASS');
