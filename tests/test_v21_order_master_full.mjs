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
        raw_text:'5 vnm ít đường bé',
        detected_brand:'VNM',
        action:'new',
        normalized_name:'Vinamilk it duong be',
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
  assert.equal(order.text,'5 vnm it duong be\n15 th 247','visible result must preserve the literal source after quantity; only Vietnamese accents are removed');
}

{
  const literal=core.parseMasterOrderPayload({
    intent:'ORDER',
    parsed_items:[
      {
        line_number:1,
        raw_text:'Thế cho c 2 sữa chua chân châu đường đen',
        action:'new',
        normalized_name:'Sua chua chan chau duong den',
        quantity_number:2,
        unit:null,
        inherited_from_line:null,
      },
      {
        line_number:2,
        raw_text:'3 ko đường bịch',
        action:'new',
        normalized_name:'Sua chua khong duong',
        quantity_number:3,
        unit:'bich',
        inherited_from_line:null,
      },
      {
        line_number:3,
        raw_text:'2 sc nếp cẩm',
        action:'new',
        normalized_name:'Sua chua nep cam',
        quantity_number:2,
        unit:null,
        inherited_from_line:null,
      },
      {
        line_number:4,
        raw_text:'5 milo to 180 có dg',
        action:'new',
        normalized_name:'Milo to 180 co duong',
        quantity_number:5,
        unit:null,
        inherited_from_line:null,
      },
      {
        line_number:5,
        raw_text:'Cho c thêm 5 thùng green ita đường to',
        action:'new',
        normalized_name:'Green it duong to',
        quantity_number:5,
        unit:'thung',
        inherited_from_line:null,
      },
    ],
  });
  assert.equal(
    literal.text,
    '2 sua chua chan chau duong den\n3 ko duong bich\n2 sc nep cam\n5 milo to 180 co dg\n5 thung green ita duong to',
    'AI may select the order line, but must not rewrite abbreviations, inherit a product name, or drop packaging words from the literal name',
  );
}

{
  const inherited=core.parseMasterOrderPayload({
    intent:'IMAGE_ORDER',
    parsed_items:[{
      line_number:2,
      raw_text:'______ 3 không đường',
      action:'new',
      normalized_name:'Sua chua khong duong',
      quantity_number:3,
      unit:null,
      inherited_from_line:1,
    }],
  });
  assert.equal(inherited.text,'3 Sua chua khong duong','explicit repeat-marker inheritance may use the resolved inherited name');
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
