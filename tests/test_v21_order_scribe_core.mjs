// RED gate: quick split must reuse the tested chat-input parser behavior.
import assert from 'node:assert/strict';
import {
  parseQuickOrderText,
  materializeAiSpans,
  materializeAiImageItems,
  materializeAiImageTranscriptions,
  extractOrderIntentSource,
  finalizeAiOrderText,
} from '../supabase/functions/v21-order-scribe/scribe-core.mjs';

{
  const result=parseQuickOrderText('5 chua không đường\n3 chua có đường\n2 chua nha đam');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:5,quantityLabel:'5',name:'chua không đường'},
    {quantity:3,quantityLabel:'3',name:'chua có đường'},
    {quantity:2,quantityLabel:'2',name:'chua nha đam'},
  ]);
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('15 thùng bò\n1 sim 5 lít');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:15,quantityLabel:'15 thùng',name:'bò'},
    {quantity:1,quantityLabel:'1',name:'sim 5 lít'},
  ]);
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('Cho e\n2proby to ít đường\n1th proby ít đg bé');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:2,quantityLabel:'2',name:'proby to ít đường'},
    {quantity:1,quantityLabel:'1th',name:'proby ít đg bé'},
  ],'quick split must support quantity attached to product text and attached unit markers');
  assert.deepEqual(result.unresolved,[],'standalone order preface is context, not a product line');
}

{
  const result=parseQuickOrderText('6 thùng yomost 3 màu : dâu, cam, việt quất');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:6,quantityLabel:'6 thùng',name:'yomost 3 màu : dâu, cam, việt quất'},
  ],'a colon variant list without child quantities stays inside the product name');
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('Probi:\n2 to ít đường\n1 bé ít đg');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:2,quantityLabel:'2',name:'Probi to ít đường'},
    {quantity:1,quantityLabel:'1',name:'Probi bé ít đg'},
  ],'a standalone parent ending in colon is inherited by following quantity lines');
  assert.deepEqual(result.unresolved,[]);
}

{
  const result=parseQuickOrderText('3 chua có đường\nem cảm ơn ạ\n2 chua nha đam');
  assert.equal(result.ok,true);
  assert.deepEqual(result.items,[
    {quantity:3,quantityLabel:'3',name:'chua có đường'},
    {quantity:2,quantityLabel:'2',name:'chua nha đam'},
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
  assert.deepEqual(result.items.map(({quantity,quantityLabel,name})=>({quantity,quantityLabel,name})),[
    {quantity:2,quantityLabel:'2 bịch',name:'hướng dương'},
    {quantity:2,quantityLabel:'2',name:'bật 1.8kg'},
    {quantity:2,quantityLabel:'2',name:'bật 1kg'},
    {quantity:2,quantityLabel:'2',name:'bật 454'},
    {quantity:2,quantityLabel:'2',name:'omo 1.15kg'},
    {quantity:2,quantityLabel:'2',name:'omo 5.5kg'},
    {quantity:2,quantityLabel:'2',name:'omo 5.1kg'},
    {quantity:2,quantityLabel:'2',name:'omo 2.9kg'},
    {quantity:2,quantityLabel:'2',name:'omo 2.6kg'},
    {quantity:2,quantityLabel:'2',name:'omo 700g'},
    {quantity:1,quantityLabel:'1',name:'omo 380g'},
    {quantity:2,quantityLabel:'2',name:'cái lăn 1l'},
    {quantity:2,quantityLabel:'2',name:'cái lăn 5l'},
    {quantity:2,quantityLabel:'2',name:'meizan 1l'},
    {quantity:2,quantityLabel:'2',name:'meizan 5l'},
    {quantity:5,quantityLabel:'5',name:'gạo 2l'},
    {quantity:5,quantityLabel:'5',name:'nếp 2l'},
  ]);
}

{
  const result=parseQuickOrderText('probi to: 3 có đường, 2 ít, 2 vq');
  assert.equal(result.ok,true);
  assert.deepEqual(result.unresolved,[],'quick split must share chat parent/child syntax');
  assert.deepEqual(result.items,[
    {quantity:3,quantityLabel:'3',name:'probi to có đường'},
    {quantity:2,quantityLabel:'2',name:'probi to ít'},
    {quantity:2,quantityLabel:'2',name:'probi to vq'},
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
    {quantity:15,quantity_text:'15',name_start:start1,name_end:end1},
    {quantity:1,quantity_text:'1',name_start:start2,name_end:end2},
    {quantity:2,quantity_text:'2',name_start:start3,name_end:end3},
  ]);
  assert.deepEqual(result,[
    {quantity:15,quantityLabel:'15',name:'thùng bò'},
    {quantity:1,quantityLabel:'1',name:'thùng sim 5 lít'},
    {quantity:2,quantityLabel:'2',name:'thùng sim 2 l'},
  ]);
}

{
  const source='1 OMO 8 lạng';
  const start=source.indexOf('OMO 8 lạng');
  assert.deepEqual(materializeAiSpans(source,[{quantity:1,quantity_text:'1',name_start:start,name_end:source.length}]),[
    {quantity:1,quantityLabel:'1',name:'OMO 8 lạng'},
  ],'AI result must preserve original case/accents/spelling exactly');
}

{
  assert.deepEqual(materializeAiImageItems([
    {quantity:3,quantity_text:'3T',name:'Mì bò chua cay',uncertain:false},
    {quantity:5,quantity_text:'5T',name:'Hẻm chén sứ (1,8)',uncertain:true},
  ]),[
    {quantity:3,quantityLabel:'3T',name:'Mì bò chua cay',uncertain:false},
    {quantity:5,quantityLabel:'5T',name:'Hẻm chén sứ (1,8)',uncertain:true},
  ],'legacy image materializer remains stable for old callers');
}

{
  const result=materializeAiImageTranscriptions([
    {text:'Thọ tuýp đỏ : 1T',uncertain:false},
    {text:'2T probi (65) đường',uncertain:false},
    {text:'probi (130) ít đường 2T',uncertain:true},
    {text:'dòng chữ chưa thấy số lượng',uncertain:true},
  ]);
  assert.deepEqual(result,{
    items:[
      {quantity:1,quantityLabel:'1T',name:'Thọ tuýp đỏ',uncertain:false},
      {quantity:2,quantityLabel:'2T',name:'probi (65) đường',uncertain:false},
      {quantity:2,quantityLabel:'2T',name:'probi (130) ít đường',uncertain:true},
    ],
    unresolved:[{raw:'dòng chữ chưa thấy số lượng ?'}],
  },'handwriting must be transcribed literally first; deterministic code then removes only the visible quantity marker');
}

{
  assert.deepEqual(materializeAiImageTranscriptions([
    {text:'Thọ truyền đỏ : 1T',uncertain:true},
  ]).items,[
    {quantity:1,quantityLabel:'1T',name:'Thọ truyền đỏ',uncertain:true},
  ],'server must never silently correct or translate a transcription; uncertainty stays visible');
}

{
  assert.throws(
    ()=>materializeAiSpans('1 sim 5 lít',[{quantity:1,quantity_text:'1',name_start:0,name_end:999}]),
    /invalid_ai_span/,
    'invalid AI boundaries must fail instead of fabricating or correcting a name',
  );
}

{
  const selected=[
    'Thế cho c 2 sữa chua chân châu đường đen',
    '3 ko đường bịch',
    '2 sc nếp cẩm',
    '5 vnm ít đường bé',
    '5 milo to 180 có dg',
    'Nhé',
    'Nay e ko đi hàng a',
    'Cho c thêm 5 thùng green ita đường to',
  ].join('\n');
  assert.equal(extractOrderIntentSource(selected),[
    '2 sữa chua chân châu đường đen',
    '3 ko đường bịch',
    '2 sc nếp cẩm',
    '5 vnm ít đường bé',
    '5 milo to 180 có dg',
    '5 thùng green ita đường to',
  ].join('\n'),'AI source filter must remove chat-only lines and strip conversational order prefixes without touching product words');
}

{
  assert.equal(extractOrderIntentSource('Probi:\n2 to ít đường\nNhé\n1 bé có đường'),'Probi:\n2 to ít đường\n1 bé có đường','a parent label is kept only when it directly scopes quantity lines');
  assert.equal(extractOrderIntentSource('cho c hai thùng sim 2 l\nnhé'),'hai thùng sim 2 l','spoken quantity words must remain valid order intent');
}

{
  const final=finalizeAiOrderText([
    '2 Sua chua chan chau duong den',
    'Nhe',
    '3 Ko duong bich',
    'Nay e ko di hang a',
    '5 Green ita duong to',
  ].join('\n'));
  assert.deepEqual(final.items.map(({quantity,name})=>({quantity,name})),[
    {quantity:2,name:'Sua chua chan chau duong den'},
    {quantity:3,name:'Ko duong bich'},
    {quantity:5,name:'Green ita duong to'},
  ]);
  assert.equal(final.text,[
    '2 Sua chua chan chau duong den',
    '3 Ko duong bich',
    '5 Green ita duong to',
  ].join('\n'),'final AI text must contain only quantity + product name lines');
}

console.log('manual order scribe raw-name core contract PASS');
