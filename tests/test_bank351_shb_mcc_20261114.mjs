import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
// BANK-351: Synthetic mirror of a verified SHB->Agribank MCC envelope.
// Read-only preview; no real customer data, no ledger or bank writes.
const memo="NGUYEN THI LAM chuyen tien";
const bankHead="Agribank: 15:30 14/11/2026 Tài khoản 2901181999999: +1,355,000VND. Nội dung giao dịch: ";
const envelope=note=>"906615-"+note+";MCC;20261114153027;0394161478;970443";
const bankTail=". Số dư cuối: -19,089,230VND";
const credit={id:302,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",is_own_transfer:false,amount_vnd:1355000,body:bankHead+envelope(memo)+bankTail};
const bill={media_asset_id:"fixture-bank351",status:"amount_read",amount_vnd:1355000,sent_at:"2026-11-14T08:30:40Z",transfer_at_vn:"2026-11-14 15:30:26",sender_name:"NGUYEN THI LAM",receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",receiving_account:"290118199999",receiving_account_last5:"99999",transfer_content:memo,transfer_reference:"6318SHBAP2F2XML9",transaction_nature:"transfer",requires_bank_memo:true};
const now=Date.parse("2026-11-14T08:35:00Z");
const run=(b=bill,e=[credit],others=[])=>previewBillAppMatch(b,e,others,now);
assert.equal(run().status,"candidate_unique");
assert.equal(run().notification_id,302);
assert.equal(run().ledger_written,false);
for(const [label,c] of [
 ["memo altered",{...credit,body:bankHead+envelope("OTHER PERSON chuyen tien")+bankTail}],
 ["sender altered",{...bill,sender_name:"NGUYEN THI HOA"}],
 ["MCC marker changed",{...credit,body:credit.body.replace(";MCC;",";OTHER;")}],
 ["wrapper timestamp changed",{...credit,body:credit.body.replace("20261114153027","20261114152527")}],
 ["bank clock changed",{...credit,body:credit.body.replace("15:30 14/11","15:25 14/11")}],
 ["bank account changed",{...credit,body:credit.body.replace("Tài khoản 2901181999999","Tài khoản 2901181999998")}],
 ["extra suffix",{...credit,body:credit.body.replace(";970443.",";970443;EXTRA.")}],
 ["wrong amount",{...credit,amount_vnd:1355001}],
 ["wrong bank",{...credit,package_name:"other.app"}],
 ["own transfer",{...credit,is_own_transfer:true}]
]){
 const result=label==="sender altered"?run(c):run(bill,[c]);
 assert.notEqual(result.status,"candidate_unique",label);
}
assert.equal(run(bill,[credit,{...credit,id:303}]).status,"review");
assert.notEqual(run({...bill,receiving_account_last5:"11111"}).status,"candidate_unique");
assert.notEqual(run({...bill,transfer_content:"OTHER PERSON chuyen tien"}).status,"candidate_unique");
assert.notEqual(run({...bill,transfer_at_vn:"2026-11-14 15:25:26"}).status,"candidate_unique");
console.log("BANK-351: exact MCC envelope, amount, account, minute, sender, memo, uniqueness PASS");
