import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-346: evidence-shaped fixture from the observed 20:46 local case.
// No real user message, Edge invocation, bank notification or ledger write.
const now=Date.parse("2026-11-13T13:50:00.000Z");
const memo="Y NGA chuyen tien";
const bankHead="Agribank: 20:46 13/11/2026 Tài khoản 2901181999999: +1,050,000VND. Nội dung giao dịch: ";
const bankTail=". Số dư cuối: -26,620,730VND";
const route=note=>"MBVCB.17025983715.182356."+note+
 ".CT tu 1047134306 Y NGA toi 2901181999999 Bui Xuan Tung tai AGRIBANK";
const credit={id:294,status:"credit_candidate",is_own_transfer:false,
 amount_vnd:1050000,package_name:"com.vnpay.Agribank3g",
 body:bankHead+route(memo)+bankTail};
const bill={
 media_asset_id:"safe-local-test",status:"amount_read",amount_vnd:1050000,
 sent_at:"2026-11-13T13:47:09.618Z",transfer_at_vn:"2026-11-13 20:46:00",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"290118199999",receiving_account_last5:"99999",
 transfer_content:memo,transfer_reference:"17025983715",
 transaction_nature:"transfer",requires_bank_memo:true,
 ocr_date_normalization_corrected:false
};
const run=(b=bill,e=[credit],others=[])=>previewBillAppMatch(b,e,others,now);
const match=run();
assert.equal(match.status,"candidate_unique");
assert.equal(match.notification_id,294);
assert.equal(match.matched_amount_vnd,1050000);
assert.equal(match.ledger_written,false,"preview MUST NOT write a debt payment");
assert.equal(match.bank_confirmed,false,"SQL RPC must independently validate bank and duplicates");
assert.equal(run({...bill,ocr_date_normalization_corrected:true}).status,"candidate_unique");
const reject=[
 ["wrong memo",{...credit,body:bankHead+route("OTHER PERSON chuyen tien")+bankTail}],
 ["wrong route reference",{...credit,body:bankHead+route(memo).replace("17025983715","17025983716")+bankTail}],
 ["wrong recipient",{...credit,body:bankHead+route(memo).replace("Bui Xuan Tung","Nguyen Van A")+bankTail}],
 ["wrong destination",{...credit,body:bankHead+route(memo).replace("toi 2901181999999","toi 2901181999998")+bankTail}],
 ["missing closing transfer section",{...credit,body:bankHead+route(memo).replace(".CT tu ",".A tu ")+bankTail}],
 ["spoofed leading route",{...credit,body:bankHead+"X"+route(memo)+bankTail}],
 ["fake separator",{...credit,body:bankHead+route(memo).replace("MBVCB.","MBVCB-")+bankTail}],
 ["incomplete sender detail",{...credit,body:bankHead+route(memo).replace(" Y NGA toi "," toi ")+bankTail}],
 ["unrelated suffix",{...credit,body:bankHead+route(memo)+" EXTRA"+bankTail}],
 ["amount mismatch",{...credit,amount_vnd:1051000}],
 ["wrong bank account credit",{...credit,body:credit.body.replace("Tài khoản 2901181999999","Tài khoản 2901181999998")}],
 ["wrong day",{...credit,body:credit.body.replace("13/11/2026","12/11/2026")}],
 ["wrong bank minute",{...credit,body:credit.body.replace("20:46 13","20:42 13")}],
 ["not official bank",{...credit,package_name:"not-official"}],
 ["marked own transfer",{...credit,is_own_transfer:true}]
];
for(const [name,e] of reject){
 assert.notEqual(run(bill,[e]).status,"candidate_unique",name);
}
assert.notEqual(run({...bill,transfer_reference:"different"},[credit]).status,"candidate_unique",
 "OCR bank routing reference conflict must not be ignored");
assert.equal(run(bill,[credit,{...credit,id:295}]).status,"review","competing credits never auto-post");
assert.equal(run({...bill,receiving_account_last5:"22222"}).status,"review");
assert.equal(run({...bill,transaction_nature:"withdrawal"}).status,"review");
assert.equal(run({...bill,transfer_content:"Y NGA chuyen tien EXTRA"}).status,"review");
// An own-transfer with a full MBVCB sender envelope is still not an outside customer payment.
const own={...credit,body:bankHead+route(memo).replace("1047134306 Y NGA","1047134306 Bui Xuan Tung")+bankTail};
assert.notEqual(run(bill,[own]).status,"candidate_unique","owner sender must not be collected");
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.match(worker,/if\(job.status==="amount_read"\)/);
assert.match(worker,/previewBillAppMatch\(candidate,app.data,others.data\)/);
assert.match(worker,/db\.rpc\("chat_bank_app_collect"/);
console.log("BANK-346: verified MBVCB wrapper, routing ref, memo, account, clock, sender, duplicate and no-ledger preview PASS");
