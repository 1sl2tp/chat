import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recognizedBillPushEligible,buildBankNotificationPayload,bankScanReasonLabel}
 from '../supabase/functions/v21-admin-push/push-core.mjs';
const edge=readFileSync(new URL('../supabase/functions/v21-admin-push/index.ts',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const bill={status:'review',amount_vnd:492000,ledger_id:null,
 raw_read:{image_type:'successful_transfer_receipt',amount_clear:true,transfer_success_visible:true}};
assert.equal(recognizedBillPushEligible({kind:'review',receipt:bill}),true);
assert.equal(recognizedBillPushEligible({kind:'bank_only',receipt:bill}),false);
assert.equal(recognizedBillPushEligible({kind:'review',receipt:{...bill,status:'failed'}}),false);
assert.equal(recognizedBillPushEligible({kind:'review',receipt:{...bill,amount_vnd:null}}),false);
assert.equal(recognizedBillPushEligible({kind:'review',receipt:{...bill,raw_read:{...bill.raw_read,image_type:'not_transfer_receipt'}}}),false);
assert.equal(recognizedBillPushEligible({kind:'review',receipt:{...bill,raw_read:{...bill.raw_read,amount_clear:false}}}),false);
assert.equal(recognizedBillPushEligible({kind:'matched',receipt:{...bill,status:'received',ledger_id:875}}),true);
assert.equal(recognizedBillPushEligible({kind:'matched',receipt:{...bill,status:'received',ledger_id:null}}),false);
assert.match(edge,/recognizedBillPushEligible\(\{kind,receipt\}\)/);
assert.match(edge,/if\(!billRecognized\)terminal=true/);
assert.match(edge,/bill_recognized:billRecognized/);
assert.match(edge,/select\("id,amount_vnd,transfer_at_vn,sent_at,customer_account_id,reason,status,ledger_id,raw_read"\)/);
assert.match(sw,/if\(bankPush&&!visibleBankBill\)return;/);
assert.match(sw,/payload\.bank_alert_allowed===true/);
assert.match(sw,/Number\.isSafeInteger\(billAmount\)&&billAmount>0/);
assert.match(sw,/bankPush\?bankTitle/);
assert.match(sw,/bankPush\?bankBody/);
assert.match(sw,/if\(bankPush\)\{/);
assert.match(sw,/ADMIN_PUSH_BANK_DIRTY/);
assert.match(sw,/renotify:!bankPush/);
const payload=buildBankNotificationPayload({
 kind:'review',receipt_id:'some-receipt',amount_vnd:492000,
 customer_name:'C Sâm pl',bill_recognized:true,reason:'gemini_http_503'
});
assert.equal(payload.bank_alert_allowed,true);
assert.match(payload.body,/492\.000đ/);
assert.doesNotMatch(payload.body,/gemini|http|failed|error|review/i);
assert.doesNotMatch(bankScanReasonLabel('totally_unexpected_error'),/totally_unexpected_error/,
 'any fallback reason must be localized');
console.log('BANK-350 PASS: PWA alerts only for OCR bill+positive amount, text Vietnamese, no finance side effects');
