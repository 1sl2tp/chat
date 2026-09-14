import assert from 'node:assert/strict';
import * as core from '../supabase/functions/v21-order-scribe/master-order-core.mjs';

assert.equal(typeof core.parseMasterOrderPayload,'function','master JSON parser must live in a shared pure core');

{
  const order=core.parseMasterOrderPayload({
    intent:'ORDER',
    requires_human_action:false,
    parsed_items:[
      {
        line_number:1,
        raw_text:'5 vnm it dg be',
        detected_brand:'VNM',
        action:'new',
        normalized_name:'Vnm it duong be',
        quantity_number:5,
        unit:null,
        is_ambiguous:false,
        inherited_from_line:null,
        price_code:null,
      },
      {
        line_number:2,
        raw_text:'15 th 247',
        detected_brand:'247',
        action:'new',
        normalized_name:'Nuoc 247',
        quantity_number:15,
        unit:'thung',
        is_ambiguous:false,
        inherited_from_line:null,
        price_code:null,
      },
    ],
  });
  assert.equal(order.text,'5 Vnm it duong be\n15 Nuoc 247','visible result must be strictly SL + Ten and must not include packaging unit');
  assert.deepEqual(order.items.map(({quantity,name,unit,isAmbiguous})=>({quantity,name,unit,isAmbiguous})),[
    {quantity:5,name:'Vnm it duong be',unit:null,isAmbiguous:false},
    {quantity:15,name:'Nuoc 247',unit:'thung',isAmbiguous:false},
  ]);
}

{
  const legacy=core.parseMasterOrderPayload({
    intent:'ORDER',
    parsed_items:[{quantity_number:5,unit:'bich',normalized_vn:'5 bich Sua chua khong duong'}],
  });
  assert.equal(legacy.text,'5 Sua chua khong duong','legacy normalized_vn must not duplicate quantity or packaging in visible text');
}

{
  const noAction=core.parseMasterOrderPayload({intent:'NO_ACTION',requires_human_action:false,parsed_items:[]});
  assert.equal(noAction.text,'','NO_ACTION with zero items is valid and must not become invalid_response');
  assert.deepEqual(noAction.items,[]);

  const inquiry=core.parseMasterOrderPayload({intent:'INQUIRY',requires_human_action:true,parsed_items:[]});
  assert.equal(inquiry.text,'','INQUIRY with zero items is valid and must not become invalid_response');

  assert.throws(()=>core.parseMasterOrderPayload({intent:'ORDER',requires_human_action:false,parsed_items:[]}),/ai_items_missing/,'ORDER with no extracted items remains an extraction failure');
}

console.log('master full SL + name contract PASS');
