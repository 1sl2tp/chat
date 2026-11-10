import assert from "node:assert/strict";
import {readV4Fields} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

const sentAt="2026-11-10T10:43:21Z"; // 17:43:21 Vietnam
const parsed={
 transaction_datetime_vn:"2026-10-11 17:42:38",
 transfer_date_vn:"2026-10-11",
 transfer_date_printed_vn:"10/11/2026",
 transfer_time_printed_vn:"17:42:38",
 recipient_name:"BUI XUAN TUNG",
 recipient_account_visible:"2901181999999",
 receiving_bank:"AGRIBANK",
 sender_name:"NGUYEN THI THUY",
 transfer_content:"NGUYEN THI THUY Chuyen tien",
 transaction_nature:"transfer"
};
const corrected=readV4Fields(parsed,{sentAt});
assert.equal(corrected.transfer_at_vn,"2026-11-10 17:42:38");
assert.equal(corrected.transfer_date_vn,"2026-11-10");
assert.equal(corrected.time_date_conflict,false);
assert.equal(corrected.ocr_date_normalization_corrected,true);
assert.equal(corrected.ocr_iso_date_conflict,true);
assert.equal(corrected.date_swap_suspected,true,"audit AI date swap, not bill error");
const bill={...corrected,status:"amount_read",amount_vnd:949000,
 sent_at:sentAt,media_asset_id:"safe-test-bill"};
const bank={
 id:245,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:949000,
 body:"Agribank: 17:42 10/11/2026 Tài khoản 2901181999999: +949,000VND. "+
  "Nội dung giao dịch: NGUYEN THI THUY Chuyen tien. Số dư cuối: ..."
};
const now=Date.parse("2026-11-10T11:00:00Z");
const normal=previewBillAppMatch(bill,[bank],[],now);
assert.equal(normal.status,"candidate_unique",
 "correct literal date plus exact bank proof restores old auto-match workflow");
assert.equal(normal.notification_id,245);
assert.equal(normal.ledger_written,false,"preview must not book money");
assert.equal(previewBillAppMatch({...bill,transfer_content:"NGUYEN THI ANH chuyen tien"},
 [bank],[],now).reason,"ocr_date_corrected_bank_memo_unverified",
 "model-corrected date requires additional official transfer memo proof");
assert.equal(previewBillAppMatch({...bill,transfer_content:""},[bank],[],now).status,"review");
assert.equal(previewBillAppMatch(bill,[{...bank,
 body:bank.body.replace("17:42","17:47")}],[],now).status,"review",
 "different bank clock cannot be used as replacement proof");
assert.equal(previewBillAppMatch(bill,[bank,{...bank,id:246}],[],now).status,"review",
 "multiple same-amount credits in bank minute are not uniquely provable");
const withoutPrinted=readV4Fields({...parsed,transfer_date_printed_vn:null},{sentAt});
assert.equal(withoutPrinted.transfer_at_vn,null,
 "do not fix an OCR date by borrowing the Chat upload time");
assert.equal(withoutPrinted.time_date_conflict,true);
const oldDate=readV4Fields({...parsed,transaction_datetime_vn:"2026-10-11 17:42:38",
 transfer_date_vn:"2026-10-11",transfer_date_printed_vn:"11/10/2026"},
 {sentAt});
assert.equal(oldDate.transfer_at_vn,"2026-10-11 17:42:38",
 "truly old printed bill must remain old on November upload");
assert.equal(oldDate.ocr_date_normalization_corrected,false);
assert.equal(previewBillAppMatch({...bill,...oldDate},[bank],[],now).status,"waiting_bank_event",
 "old bank transfer cannot be recognized as today's separate credit");

console.log("BANK-270: literal printed DD/MM beats AI ISO; unique Agribank memo required PASS");
