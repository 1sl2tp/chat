import assert from 'node:assert/strict';
import {rangeForPreset,isLikelyOrderSource,orderSplitPreviewEntries,customerOrderSourceGroup} from '../order-source-core.mjs';

const now=Date.parse('2026-09-13T08:30:00.000Z');
const vnOffset=-420;
assert.deepEqual(rangeForPreset('today',now,vnOffset),{
  from:'2026-09-12T17:00:00.000Z',
  to:'2026-09-13T17:00:00.000Z',
});
assert.deepEqual(rangeForPreset('yesterday',now,vnOffset),{
  from:'2026-09-11T17:00:00.000Z',
  to:'2026-09-12T17:00:00.000Z',
});
assert.equal(isLikelyOrderSource('3 chua có đường'),true);
assert.equal(isLikelyOrderSource('2 thùng sim 1 lít'),true);
assert.equal(isLikelyOrderSource('2proby to ít đường'),true,'quantity attached to the name is still an order signal');
assert.equal(isLikelyOrderSource('em cảm ơn ạ'),false);
assert.equal(isLikelyOrderSource('mai 2 giờ em qua'),false);
assert.equal(isLikelyOrderSource('5 sua chua khong duong',['sua chua khong duong']),true);

const preview=orderSplitPreviewEntries({
  items:[
    {quantity:1,quantityLabel:'1th',name:'thùng 40'},
    {quantity:2,name:'thùng'},
    {quantity:95,name:'(hoặc 90)',uncertain:true},
  ],
  unresolved:[
    {raw:'Tôi thiếu 4 thùng bánh kinh đô của khách'},
    {raw:'mai xem lấy đc trên chợ ko láo ơi'},
  ],
});
assert.deepEqual(preview,[
  {type:'unresolved',text:'Tôi thiếu 4 thùng bánh kinh đô của khách'},
  {type:'unresolved',text:'mai xem lấy đc trên chợ ko láo ơi'},
  {type:'item',quantity:1,quantityLabel:'1th',name:'thùng 40',uncertain:false},
  {type:'item',quantity:2,quantityLabel:'2',name:'thùng',uncertain:false},
  {type:'item',quantity:95,quantityLabel:'95',name:'(hoặc 90)',uncertain:true},
]);

// Tin đơn là một cách đọc lịch sử Chat theo thời gian. Trạng thái "imported"
// cũ từ tích hợp bán hàng không được làm tin biến mất hay chia thành lịch sử đơn riêng.
const rows=[
  {messageId:'m2',text:'2 thùng omo',createdAt:'2026-09-13T03:05:00.000Z',state:'pending'},
  {messageId:'old-2',text:'2 thùng đơn cũ',createdAt:'2026-09-13T02:02:00.000Z',state:'imported',linkedExternalOrderId:'o-1',linkedExternalOrderNo:'A101'},
  {messageId:'old-1',text:'1 thùng đơn cũ',createdAt:'2026-09-13T02:00:00.000Z',state:'imported',linkedExternalOrderId:'o-1',linkedExternalOrderNo:'A101'},
  {messageId:'m1',text:'1 thùng dầu simply',createdAt:'2026-09-13T03:00:00.000Z',state:'working'},
  {messageId:'skip',text:'3 thùng bỏ qua',createdAt:'2026-09-13T03:03:00.000Z',state:'ignored'},
];
assert.deepEqual(customerOrderSourceGroup(rows),{
  sourceMessageIds:['old-1','old-2','m1','m2'],
  text:'1 thùng đơn cũ\n2 thùng đơn cũ\n1 thùng dầu simply\n2 thùng omo',
  firstCreatedAt:'2026-09-13T02:00:00.000Z',
  lastCreatedAt:'2026-09-13T03:05:00.000Z',
  count:4,
});
assert.deepEqual(customerOrderSourceGroup([
  {messageId:'old',text:'đơn cũ',createdAt:'2026-09-13T02:00:00.000Z',state:'imported'},
  {messageId:'skip',text:'bỏ qua',createdAt:'2026-09-13T02:01:00.000Z',state:'ignored'},
]),{
  sourceMessageIds:['old'],text:'đơn cũ',firstCreatedAt:'2026-09-13T02:00:00.000Z',lastCreatedAt:'2026-09-13T02:00:00.000Z',count:1,
});

assert.deepEqual(customerOrderSourceGroup([
  {
    messageId:'img-1',text:'',createdAt:'2026-09-13T04:00:00.000Z',state:'pending',
    imageAssets:[{assetId:'asset-1',mimeType:'image/jpeg',widthPx:1536,heightPx:2048}],
  },
]),{
  sourceMessageIds:['img-1'],text:'',firstCreatedAt:'2026-09-13T04:00:00.000Z',lastCreatedAt:'2026-09-13T04:00:00.000Z',count:1,
  images:[{assetId:'asset-1',messageId:'img-1',mimeType:'image/jpeg',widthPx:1536,heightPx:2048}],
},'image-only inbound messages stay in the Chat summary without fabricating text');

console.log('customer order source core contract PASS');
