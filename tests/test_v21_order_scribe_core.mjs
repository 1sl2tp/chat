import assert from 'node:assert/strict';
import {
  parseQuickOrderText,
  materializeAiSpans,
} from '../supabase/functions/v21-order-scribe/scribe-core.mjs';

{
  const result=parseQuickOrderText('5 chua không đường\n3 chua có đường\n2 chua nha đam');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:5,name:'chua không đường'},
    {quantity:3,name:'chua có đường'},
    {quantity:2,name:'chua nha đam'},
  ]);
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('15 thùng bò\n1 sim 5 lít');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:15,name:'thùng bò'},
    {quantity:1,name:'sim 5 lít'},
  ]);
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('3 chua có đường\nem cảm ơn ạ\n2 chua nha đam');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:3,name:'chua có đường'},
    {quantity:2,name:'chua nha đam'},
  ]);
  assert.deepEqual(result.unresolved,[{raw:'em cảm ơn ạ'}]);
}

{
  const result=parseQuickOrderText('15 thùng bò một thùng sim 5 lít hai thùng sim 2 l');
  assert.equal(result.ok,true,'quick mode keeps an unseparated spoken-style order unresolved instead of guessing');
  assert.deepEqual(result.items,[]);
  assert.deepEqual(result.unresolved,[{raw:'15 thùng bò một thùng sim 5 lít hai thùng sim 2 l'}]);
}

{
  const result=parseQuickOrderText([
    '2 bịch hướng dương',
    '- 2 bật 1.8kg, 2 bật 1kg, 2 bật 454',
    '- 2 omo 1.15kg, 2 omo 5.5kg, 2 omo 5.1kg, 2 omo 2.9kg, 2 omo 2.6kg, 2 omo 700g, 1 omo 380g',
    '- 2 cái lăn 1l, 2 cái lăn 5l',
    '- 2 meizan 1l, 2 meizan 5l',
    '- 5 gạo 2l, 5 nếp 2l',
  ].join('\n'));
  assert.equal(result.ok,true);
  assert.deepEqual(result.unresolved,[], 'quick split must use the same bullet/comma segmentation rules as chat input parsing');
  assert.deepEqual(result.items,[
    {quantity:2,name:'bịch hướng dương'},
    {quantity:2,name:'bật 1.8kg'},
    {quantity:2,name:'bật 1kg'},
    {quantity:2,name:'bật 454'},
    {quantity:2,name:'omo 1.15kg'},
    {quantity:2,name:'omo 5.5kg'},
    {quantity:2,name:'omo 5.1kg'},
    {quantity:2,name:'omo 2.9kg'},
    {quantity:2,name:'omo 2.6kg'},
    {quantity:2,name:'omo 700g'},
    {quantity:1,name:'omo 380g'},
    {quantity:2,name:'cái lăn 1l'},
    {quantity:2,name:'cái lăn 5l'},
    {quantity:2,name:'meizan 1l'},
    {quantity:2,name:'meizan 5l'},
    {quantity:5,name:'gạo 2l'},
    {quantity:5,name:'nếp 2l'},
  ]);
}

{
  const result=parseQuickOrderText('probi to: 3 có đường, 2 ít, 2 vq');
  assert.equal(result.ok,true);
  assert.deepEqual(result.unresolved,[],'quick split must share chat parent/child syntax');
  assert.deepEqual(result.items,[
    {quantity:3,name:'probi to có đường'},
    {quantity:2,name:'probi to ít'},
    {quantity:2,name:'probi to vq'},
  ]);
}

{
  const source='15 thùng bò một thùng sim 5 lít hai thùng sim 2 l';
  const start1=source.indexOf('thùng bò');
  const end1=start1+'thùng bò'.length;
  const start2=source.indexOf('thùng sim 5 lít');
  const end2=start2+'thùng sim 5 lít'.length;
  const start3=source.indexOf('thùng sim 2 l');
  const end3=start3+'thùng sim 2 l'.length;
  const result=materializeAiSpans(source,[
    {quantity:15,name_start:start1,name_end:end1},
    {quantity:1,name_start:start2,name_end:end2},
    {quantity:2,name_start:start3,name_end:end3},
  ]);
  assert.deepEqual(result,[
    {quantity:15,name:'thùng bò'},
    {quantity:1,name:'thùng sim 5 lít'},
    {quantity:2,name:'thùng sim 2 l'},
  ]);
}

{
  const source='1 OMO 8 lạng';
  const start=source.indexOf('OMO 8 lạng');
  assert.deepEqual(materializeAiSpans(source,[{quantity:1,name_start:start,name_end:source.length}]),[
    {quantity:1,name:'OMO 8 lạng'},
  ],'AI result must preserve original case/accents/spelling exactly');
}

{
  assert.throws(
    ()=>materializeAiSpans('1 sim 5 lít',[{quantity:1,name_start:0,name_end:999}]),
    /invalid_ai_span/,
    'invalid AI boundaries must fail instead of fabricating or correcting a name',
  );
}

console.log('manual order scribe raw-name core contract PASS');
