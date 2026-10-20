import assert from 'node:assert/strict';
import {buildBankNotificationPayload} from '../supabase/functions/v21-admin-push/push-core.mjs';

const base={outbox_id:'o-1',notification_id:'34',receipt_id:'r-1',
  business_date:'2026-10-20',transfer_time:'06:54',amount_vnd:1430000,
  customer_name:'Chị Sâm',report_contact_id:'fc3ec480-60d2-4749-b7af-5f4ae71eb14e'};
const bank=buildBankNotificationPayload({...base,kind:'bank_only',receipt_id:''});
assert.equal(bank.kind,'bank_reconciliation');
assert.equal(bank.title,'TAPHOA · Tiền về');
assert.match(bank.body,/\+1\.430\.000đ/);
assert.match(bank.body,/Chưa có bill/);
assert.equal(bank.tag,'bank:notice:34');
assert.equal(bank.contact_id,base.report_contact_id);
assert.equal(bank.bank_day,'2026-10-20');
const bill=buildBankNotificationPayload({...base,kind:'bill_waiting',notification_id:''});
assert.match(bill.title,/Có bill mới/);
assert.match(bill.body,/Chị Sâm/);
assert.match(bill.body,/Chờ Agribank/);
assert.equal(bill.tag,'bank:receipt:r-1');
const matched=buildBankNotificationPayload({...base,kind:'matched'});
assert.match(matched.title,/Đối soát thành công/);
assert.match(matched.body,/Đã ghi thu/);
assert.equal(matched.tag,bank.tag,'new match replaces bank-only OS notification');
const review=buildBankNotificationPayload({...base,kind:'review',notification_id:'',reason:'Bill sai ngày'});
assert.match(review.body,/Bill sai ngày/);
assert.match(review.body,/Chưa ghi thu/);
assert.equal(review.tag,'bank:receipt:r-1');
assert.equal(Object.hasOwn(matched,'message_id'),false,'not a Chat message');
console.log('BANK-181 dedicated reconciliation PWA push contract PASS');