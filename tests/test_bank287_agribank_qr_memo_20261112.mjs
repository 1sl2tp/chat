import assert from 'node:assert/strict';
import {previewBillAppMatch} from '../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs';

// Sanitized structural fixture from the 11/11/2026 21:53 C Ha Trang case.
// Read-only preview: the authoritative financial RPC is deliberately not called.
const now=Date.parse('2026-11-11T14:56:00Z');
const memo='Ha Trang chuyen khoan nhanh qua Zalo';
const bill={
 media_asset_id:'bill-hatrang-2153',status:'amount_read',amount_vnd:10157000,
 sent_at:'2026-11-11T14:53:30.607Z',transfer_at_vn:'2026-11-11 21:53:00',
 transfer_content:memo,transaction_nature:'transfer',
 receiving_name:'BUI XUAN TUNG',receiving_bank:'AGRIBANK',
 receiving_account:'290118199999',receiving_account_last5:'99999',
 requires_bank_memo:true,ocr_date_normalization_corrected:false
};
const notice={
 id:268,status:'credit_candidate',package_name:'com.vnpay.Agribank3g',
 amount_vnd:10157000,is_own_transfer:false,
 body:'Agribank: 21:53 11/11/2026 Tài khoản 2901181999999: +10,157,000VND. '+
      'Nội dung giao dịch: QR - '+memo+'. Số dư cuối: -141,114,730VND'
};
const preview=(b=bill,n=[notice],others=[])=>
 previewBillAppMatch(b,n,others,now);
const expected=preview();
assert.equal(expected.status,'candidate_unique',JSON.stringify(expected));
assert.equal(expected.source,'agribank_plus_notification');
assert.equal(expected.notification_id,268);
assert.equal(expected.ledger_written,false,'preview must never post money');
assert.equal(expected.bank_confirmed,false,'a preview is not DB verification');

// The bank may add only an anchored QR routing marker. Exact memos still work.
for(const prefix of ['','QR - ','QR: ','QR – ']){
 const n={...notice,body:notice.body.replace('QR - '+memo,prefix+memo)};
 assert.equal(preview(bill,[n]).status,'candidate_unique',prefix);
}
// The same additional bank marker rule applies when printed OCR date was corrected.
assert.equal(preview({...bill,requires_bank_memo:false,ocr_date_normalization_corrected:true}).status,'candidate_unique');

// Never fall back to startsWith/endsWith on arbitrary memo strings.
const notEqual=[
 'QR - Ha Trang chuyen khoan nhanh qua Zalo THEM',
 'QR - Ha Trang chuyen khoan nhanh qua Zalo 2',
 'QR - Nguoi khac chuyen khoan nhanh qua Zalo',
 'NO QR - '+memo,'QRX - '+memo,'QR - ','QR - '+memo+' GHI THEM'
];
for(const otherMemo of notEqual){
 const n={...notice,body:notice.body.replace('QR - '+memo,otherMemo)};
 const result=preview(bill,[n]);
 assert.equal(result.status,'review',otherMemo);
 assert.equal(result.reason,'ocr_date_corrected_bank_memo_unverified',otherMemo);
}
// Only the official, unique bank proof of the same amount, date, minute,
// beneficiary and bank-app package may qualify; do not weaken these guards.
const rejections=[
 preview(bill,[{...notice,amount_vnd:10158000}]),
 preview(bill,[{...notice,package_name:'other.bank.app'}]),
 preview(bill,[{...notice,is_own_transfer:true}]),
 preview(bill,[{...notice,body:notice.body.replace('2901181999999','1234567890000')}]),
 preview(bill,[{...notice,body:notice.body.replace('21:53','21:56')}]),
 preview(bill,[{...notice,id:268},{...notice,id:269}]),
 preview({...bill,receiving_account_last5:'12345'}),
 preview({...bill,receiving_name:'OTHER PERSON'}),
 preview({...bill,transfer_at_vn:'2026-11-10 21:53:00'}),
 preview({...bill,amount_vnd:10158000}),
 preview({...bill,transaction_nature:'unknown'})
];
for(const result of rejections)assert.notEqual(result.status,'candidate_unique',JSON.stringify(result));
console.log('BANK-287 QR bank-prefix matching, strict memo and financial guards PASS');
