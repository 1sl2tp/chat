import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
const bill={media_asset_id:"synthetic-bank355",status:"amount_read",amount_vnd:890000,sent_at:"2026-11-14T10:07:35Z",transfer_at_vn:"2026-11-14 17:07:22",sender_name:"PHAM THI THU HA",receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",receiving_account:"290118199999",receiving_account_last5:"99999",transfer_content:"PHAM THI THU HA chuyen tien",transaction_nature:"transfer",requires_bank_memo:true};
const credit={id:307,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",is_own_transfer:false,amount_vnd:890000,body:"Agribank: 17:07 14/11/2026 Tài khoản 2901181999999: +890,000VND. Nội dung giao dịch: IBFT PHAM THI THU HA chuyen tien. Số dư cuối: -15,357,230VND"};
const run=(b=bill,e=credit)=>previewBillAppMatch(b,[e],[],Date.parse("2026-11-14T10:12:00Z"));
assert.equal(run().status,"candidate_unique");
for(const bad of [
 {...credit,body:credit.body.replace("PHAM THI THU HA","PHAM THI THU HOA")},
 {...credit,body:credit.body.replace("IBFT ","IBFTX ")},
 {...credit,body:credit.body.replace("17:07","17:04")},
 {...credit,body:credit.body.replace("2901181999999","2901181999998")},
 {...credit,amount_vnd:889000}
])assert.notEqual(run(bill,bad).status,"candidate_unique");
assert.notEqual(run({...bill,sender_name:"PHAM THI THU HOA"}).status,"candidate_unique");
// 17:02 receipt vs 17:01 bank print is NOT proven same minute;
// do not auto-credit by changing a clock without reviewing the original image.
const other={...bill,amount_vnd:380000,transfer_at_vn:"2026-11-14 17:02:01",sender_name:"TRAN THI THANH HUYEN",transfer_content:"TRAN THI THANH HUYEN chuyen tien"};
const otherCredit={...credit,amount_vnd:380000,body:"Agribank: 17:01 14/11/2026 Tài khoản 2901181999999: +380,000VND. Nội dung giao dịch: TRAN THI THANH HUYEN chuyen tien. Số dư cuối: -16,247,230VND"};
assert.notEqual(run(other,otherCredit).status,"candidate_unique");
console.log("BANK-355: IBFT anchored exact memo; account, amount, sender, clock negatives PASS");
