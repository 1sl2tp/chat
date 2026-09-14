import assert from 'node:assert/strict';
import {rangeForPreset,orderSplitPreviewEntries,customerOrderSourceGroup} from '../order-source-core.mjs';

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

const rows=[
  {messageId:'m2',text:'2 thùng omo',createdAt:'2026-09-13T03:05:00.000Z',state:'pending'},
  {messageId:'old-2',text:'2 thùng đơn cũ',createdAt:'2026-09-13T02:02:00.000Z',state:'imported',linkedExternalOrderId:'o-1',linkedExternalOrderNo:'A101'},
  {messageId:'old-1',text:'1 thùng đơn cũ',createdAt:'2026-09-13T02:00:00.000Z',state:'imported',linkedExternalOrderId:'o-1',linkedExternalOrderNo:'A101'},
  {messageId:'m1',text:'1 thùng dầu simply',createdAt:'2026-09-13T03:00:00.000Z',state:'working'},
  {messageId:'skip',text:'3 thùng trước đây từng bị bỏ qua',createdAt:'2026-09-13T03:03:00.000Z',state:'ignored'},
];
assert.deepEqual(customerOrderSourceGroup(rows),{
  sourceMessageIds:['old-1','old-2','m1','skip','m2'],
  text:'1 thùng đơn cũ\n2 thùng đơn cũ\n1 thùng dầu simply\n3 thùng trước đây từng bị bỏ qua\n2 thùng omo',
  firstCreatedAt:'2026-09-13T02:00:00.000Z',
  lastCreatedAt:'2026-09-13T03:05:00.000Z',
  count:5,
});
assert.deepEqual(customerOrderSourceGroup([
  {messageId:'old',text:'đơn cũ',createdAt:'2026-09-13T02:00:00.000Z',state:'imported'},
  {messageId:'skip',text:'tin từng bị bỏ qua',createdAt:'2026-09-13T02:01:00.000Z',state:'ignored'},
]),{
  sourceMessageIds:['old','skip'],text:'đơn cũ\ntin từng bị bỏ qua',firstCreatedAt:'2026-09-13T02:00:00.000Z',lastCreatedAt:'2026-09-13T02:01:00.000Z',count:2,
},'Tin đơn is a read-only view over Chat history: legacy ignored state must never hide customer messages');

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
