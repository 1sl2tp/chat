import assert from 'node:assert/strict';
import {previewBillReferenceMatch,previewBillAppMatch} from '../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs';
import {readV4Fields} from '../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs';

const day='2026-10-20',now=Date.parse('2026-10-20T05:00:00Z');
const memo='MBVCB.16623942691.493107.NGUYEN THI LIEU chuyen tien';
const ref='MBVCB.16623942691.493107';
const bill={media_asset_id:'a1',status:'amount_read',amount_vnd:1568000,
 sent_at:'2026-10-20T02:25:19Z',transfer_at_vn:null,transfer_date_vn:day,
 transfer_reference:ref,transfer_content:memo,
 receiving_name:'BUI XUAN TUNG',receiving_bank:'AGRIBANK',
 receiving_account_last5:'99999',transaction_nature:'transfer'};
const credit={id:35,status:'credit_candidate',package_name:'com.vnpay.Agribank3g',
 amount_vnd:1568000,is_own_transfer:false,
 body:'Agribank: 09:25 20/10/2026 Tài khoản 2901181999999: +1,568,000VND. Nội dung giao dịch: '+memo+'. Số dư cuối: 150,591,546VND'};
const preview=previewBillReferenceMatch(bill,[credit],[],now);
assert.equal(preview.status,'review','do not authorize ledger without DB financial guard');
assert.equal(preview.reason,'reference_and_memo_verified_waiting_financial_guard');
assert.equal(preview.notification_id,35);
const status=(b=bill,arr=[credit],others=[])=>previewBillReferenceMatch(b,arr,others,now);
for(const b of [
 {...bill,transfer_date_vn:null},
 {...bill,transfer_date_vn:'2026-10-19'},
 {...bill,transfer_reference:null},
 {...bill,transfer_reference:'NGUYEN THI LIEU'},
 {...bill,transfer_reference:'MBVCB.OTHER'},
 {...bill,transfer_content:null},
 {...bill,transfer_content:'another message'},
 {...bill,amount_vnd:1569000},
 {...bill,receiving_account_last5:'88888'},
 {...bill,transfer_at_vn:'2026-10-20 09:25'}
]){
 const outcome=status(b);
 assert.notEqual(outcome.reason,'reference_and_memo_verified_waiting_financial_guard',JSON.stringify(b));
}
const other={...bill,media_asset_id:'another'};
assert.equal(status(bill,[credit],[other]).reason,'multiple_bills_share_reference');
assert.equal(status(bill,[credit,credit]).reason,'multiple_matching_reference_events');
assert.equal(status(bill,[{...credit,is_own_transfer:true}]).reason,'no_matching_shared_reference');
assert.equal(status(bill,[{...credit,body:credit.body.replace(memo,'DIFFERENT MEMO')}]).reason,'no_matching_shared_reference');
assert.equal(status(bill,[{...credit,body:credit.body.replace('2901181999999','1234567890123')}]).reason,'no_matching_shared_reference');
assert.equal(status(bill,[{...credit,body:credit.body.replace('20/10/2026','19/10/2026')}]).reason,'no_matching_shared_reference');
assert.equal(previewBillAppMatch(bill,[credit],[],now).reason,'bill_time_unreadable');
const ocr=readV4Fields({transaction_datetime_vn:null,transfer_date_vn:'2026-10-20',
 transfer_content:memo,transfer_reference:ref});
assert.equal(ocr.transfer_at_vn,null);
assert.equal(ocr.transfer_date_vn,day);
assert.equal(ocr.transfer_content,memo);
assert.equal(ocr.transfer_reference,ref);
assert.equal(readV4Fields({transfer_date_vn:'2026-02-30'}).transfer_date_vn,null);
assert.equal(readV4Fields({transfer_date_vn:'2026-10-20',transaction_datetime_vn:'2026-10-20 09:25'}).transfer_date_vn,day);
console.log('BANK-182 missing bill time: strict memo/ref and fail-closed gate PASS');