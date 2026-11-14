import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
const base={media_asset_id:"synthetic-bank356",status:"amount_read",amount_vnd:380000,sent_at:"2026-11-14T10:02:17Z",transfer_at_vn:"2026-11-14 17:02:01",sender_name:"TRAN THI THANH HUYEN",receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",receiving_account:"290118199999",receiving_account_last5:"99999",transfer_content:"TRAN THI THANH HUYEN chuyen tien",transaction_nature:"transfer",requires_bank_memo:true};
const event={id:306,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",is_own_transfer:false,amount_vnd:380000,body:"Agribank: 17:01 14/11/2026 Tài khoản 2901181999999: +380,000VND. Nội dung giao dịch: TRAN THI THANH HUYEN chuyen tien. Số dư cuối: -16,247,230VND"};
const run=(bill=base,ev=[event])=>previewBillAppMatch(bill,ev,[],Date.parse("2026-11-14T10:06:00Z"));
assert.equal(run().status,"candidate_unique");
// BANK-360: OCR may truncate the 13-digit destination to 12 digits;
// bank-side notice must still prove the full account, while last five match.
assert.equal(run({...base,receiving_account:"290118199999",receiving_account_last5:"99999"}).status,"candidate_unique");
assert.notEqual(run({...base,receiving_account:"290118199998",receiving_account_last5:"99998"}).status,"candidate_unique");
assert.notEqual(run(base,[{...event,body:event.body.replace("2901181999999","2901181999998")}]).status,"candidate_unique");

assert.equal(run().ledger_written,false);
assert.notEqual(run(base,[event,{...event,id:308}]).status,"candidate_unique");
for(const [b,e] of [
 [{...base,sender_name:"TRAN THI THANH HOA"},event],
 [{...base,transfer_content:"SOMEONE ELSE chuyen tien"},event],
 [base,{...event,amount_vnd:380001}],
 [base,{...event,body:event.body.replace("17:01","16:58")}],
 [base,{...event,body:event.body.replace("2901181999999","2901181999998")}]
])assert.notEqual(run(b,[e]).status,"candidate_unique");
const ibft={...base,amount_vnd:890000,transfer_at_vn:"2026-11-14 17:07:22",sender_name:"PHAM THI THU HA",transfer_content:"PHAM THI THU HA chuyen tien"};
const ibftEvent={...event,id:307,amount_vnd:890000,body:"Agribank: 17:07 14/11/2026 Tài khoản 2901181999999: +890,000VND. Nội dung giao dịch: IBFT PHAM THI THU HA chuyen tien. Số dư cuối: -15,357,230VND"};
assert.equal(run(ibft,[ibftEvent]).status,"candidate_unique");

// BANK-359: bank notice may wrap a full contiguous payer memo.
const wrapped={...event,body:event.body.replace("Nội dung giao dịch: TRAN","Nội dung giao dịch: 906615-TRAN").replace("chuyen tien. Số dư","chuyen tien;MCC;20261114170100;0394161478;970443. Số dư")};
assert.equal(run(base,[wrapped]).status,"candidate_unique");
assert.notEqual(run({...base,transfer_content:"CHUYEN TIEN"},[wrapped]).status,"candidate_unique");
console.log("BANK-356: normalized bill fields, 1m clock, IBFT, duplicate & conflicts PASS");
