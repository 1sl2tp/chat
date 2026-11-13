import assert from 'node:assert/strict';
import {buildBankNotificationPayload,recognizedBillPushEligible} from '../supabase/functions/v21-admin-push/push-core.mjs';
// BANK-350: Only recognized customer transfer receipts with readable positive
// amount may cause an OS PWA finance alert. Other bank/AI evidence stays on
// the report, without a Push notification or English internal error reason.
const base={outbox_id:'o-1',notification_id:'34',receipt_id:'r-1',
 business_date:'2026-11-13',transfer_time:'21:08',amount_vnd:492000,
 customer_name:'C Sâm',report_contact_id:'fc3ec480-60d2-4749-b7af-5f4ae71eb14e'};
const receipt={status:'review',amount_vnd:492000,ledger_id:null,
 raw_read:{image_type:'successful_transfer_receipt',amount_clear:true,
   transfer_success_visible:true}};
assert.equal(recognizedBillPushEligible({kind:'review',receipt}),true,
 'readable amount still qualifies when other image characters are blurred');
for(const [kind,changed] of [
 ['bank_only',{}],['review',{amount_vnd:null}],
 ['review',{amount_vnd:0}],['review',{amount_vnd:492000.5}],
 ['review',{status:'failed'}],['review',{status:'duplicate'}],
 ['review',{raw_read:{image_type:'not_transfer_receipt',amount_clear:true,transfer_success_visible:true}}],
 ['review',{raw_read:{image_type:'successful_transfer_receipt',amount_clear:false,transfer_success_visible:true}}],
 ['review',{raw_read:{image_type:'successful_transfer_receipt',amount_clear:true,transfer_success_visible:false}}],
 ['bill_waiting',{status:'review'}],['matched',{status:'received',ledger_id:null}]
])assert.equal(recognizedBillPushEligible({kind,receipt:{...receipt,...changed}}),false,
 kind+' must stay silent without a confirmed bill and amount');
assert.equal(recognizedBillPushEligible({kind:'bill_waiting',receipt:{...receipt,status:'amount_read'}}),true);
assert.equal(recognizedBillPushEligible({kind:'matched',receipt:{...receipt,status:'received',ledger_id:874}}),true);
const bank=buildBankNotificationPayload({...base,kind:'bank_only',receipt_id:'',bill_recognized:false});
assert.equal(bank.kind,'bank_reconciliation');
assert.equal(bank.bank_alert_allowed,false);
assert.equal(bank.bill_amount_vnd,null);
assert.equal(bank.tag,'bank:notice:34');
const bill=buildBankNotificationPayload({...base,kind:'review',notification_id:'',
 bill_recognized:true,reason:'gemini_http_503 failed to fetch'});
assert.equal(bill.bank_alert_allowed,true);
assert.equal(bill.bill_amount_vnd,492000);
assert.equal(bill.title,'TAPHOA · Đã nhận diện bill');
assert.match(bill.body,/C Sâm · 492\.000đ · Cần xác minh/);
assert.doesNotMatch(bill.body,/gemini|http|failed|review|amount_read|error/i);
assert.equal(bill.tag,'bank:receipt:r-1');
const matched=buildBankNotificationPayload({...base,kind:'matched',bill_recognized:true});
assert.match(matched.body,/Đã ghi thu/);
assert.equal(matched.tag,bill.tag,'one receipt retains one OS notification slot');
const invalid=buildBankNotificationPayload({...base,kind:'review',amount_vnd:0,bill_recognized:true});
assert.equal(invalid.bank_alert_allowed,false);
assert.equal(invalid.body,'');
const noReceipt=buildBankNotificationPayload({...base,kind:'review',receipt_id:'',bill_recognized:true});
assert.equal(noReceipt.bank_alert_allowed,false);
assert.equal(Object.hasOwn(matched,'message_id'),false,'not a Chat message');
console.log('BANK-181/350: only bill + OCR amount gets Vietnamese PWA notification PASS');
