import assert from 'node:assert/strict';
import {compareBillTransferIdentity,competesForBankCredit} from '../supabase/functions/v21-bank-bill-event/bill-transfer-identity.mjs';
import {previewBillAppMatch} from '../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs';
import {readV4Fields} from '../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs';

// Two different people can each send the same 2.000.000 VND.
const ngan={media_asset_id:'bill-ngan',status:'amount_read',
  amount_vnd:2000000,transfer_at_vn:'2026-10-25 10:01',
  sender_name:'Nguyễn Thị Ngân',sending_bank:'VIETINBANK',
  transfer_reference:'384K26A0SGM12345',transaction_nature:'transfer',
  receiving_name:'BUI XUAN TUNG',receiving_bank:'AGRIBANK',
  sent_at:'2026-10-25T03:02:00Z'};
const binh={...ngan,media_asset_id:'bill-binh',
  sender_name:'Nguyễn Thanh Bình',transfer_reference:'384K26A0SGM98765'};
const binh2={...binh,media_asset_id:'bill-binh-2',
  sender_name:'Nguyễn Ngọc Bình'};
const nguyenClone={...ngan,media_asset_id:'bill-cropped',
  sent_at:'2026-10-25T03:03:00Z'};

assert.equal(compareBillTransferIdentity(ngan,binh),'distinct');
assert.equal(compareBillTransferIdentity(ngan,{...ngan,media_asset_id:'same-ref-other-sender',
  sender_name:'Nguyễn Ngọc Bình'}),'distinct',
  'a common-looking reference cannot override a clearly different account owner');
assert.equal(compareBillTransferIdentity(binh,binh2),'distinct');
assert.equal(compareBillTransferIdentity(ngan,nguyenClone),'same',
  'identical bank reference+sender+origin+date is the same transfer despite another image');
assert.equal(compareBillTransferIdentity(ngan,{...ngan,transfer_reference:'OTHER_REFR123'}),'distinct');
assert.equal(compareBillTransferIdentity(ngan,{...ngan,sending_bank:'MBBANK'}),'distinct');
assert.equal(compareBillTransferIdentity(ngan,{...ngan,transfer_at_vn:'2026-10-26 10:01'}),'distinct');
assert.equal(compareBillTransferIdentity({...ngan,transfer_reference:null,sender_name:null},
  {...ngan,transfer_reference:null,sender_name:null,media_asset_id:'other'}),'unknown',
  'amount alone never proves a duplicate');

const credit=(id,minute)=>({id,amount_vnd:2000000,status:'credit_candidate',
 package_name:'com.vnpay.Agribank3g',is_own_transfer:false,
 body:`Agribank: 10:${minute} 25/10/2026 Tài khoản 2901181999999: +2,000,000VND. Nội dung giao dịch: khach chuyen tien.`});
const now=Date.parse('2026-10-25T03:10:00Z');
const preview=(b,credits,other=[])=>previewBillAppMatch(b,credits,other,now);
assert.equal(preview(ngan,[credit(1,'01')]).status,'candidate_unique');
assert.equal(preview(ngan,[credit(1,'01'),credit(2,'05')]).status,'candidate_unique',
 'same amount 4 minutes later is an independent bank credit');
assert.equal(preview(ngan,[credit(1,'01'),credit(2,'01')]).reason,
 'multiple_credits_same_amount_same_minute');
assert.equal(preview(ngan,[credit(1,'01')],[binh]).reason,
 'competing_bills_one_bank_credit_unverified',
 'different sender/ref cannot both claim one indistinguishable credit');
assert.equal(preview(ngan,[credit(1,'01')],[nguyenClone]).reason,
 'same_transfer_reference_other_image');
assert.equal(preview(ngan,[credit(1,'01')],[{...binh,transfer_at_vn:'2026-10-25 10:05'}]).status,
 'candidate_unique','separate credit four minutes away does not block one-minute matching');
assert.equal(competesForBankCredit(ngan,binh),true);
assert.equal(competesForBankCredit(ngan,{...binh,transfer_at_vn:'2026-10-25 10:05'}),false);

const ocr=readV4Fields({sender_name:'Nguyễn Thị Ngân',recipient_name:'BUI XUAN TUNG',
  sending_bank:'VietinBank',receiving_bank:'AGRIBANK',
  transaction_datetime_vn:'2026-10-25 10:01',transfer_reference:'384K26A0SGM12345'});
assert.equal(ocr.sender_name,'NGUYEN THI NGAN');
assert.equal(ocr.receiving_name,'BUI XUAN TUNG');
assert.equal(ocr.transfer_reference,'384K26A0SGM12345');
assert.equal(readV4Fields({recipient_name:'BUI XUAN TUNG'}).sender_name,null);
console.log('BANK-214 distinct sender, reference, clock and safe same-minute credit gate PASS');
