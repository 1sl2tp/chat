import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-349: synthetic local reproduction of the 14/11 08:19 VCB -> Agribank
// case. This is a READ-ONLY pairing test, never a real bank/customer write.
const now=Date.parse("2026-11-14T01:29:00.000Z");
const memo="PHAM VAN QUANG chuyen tien";
const envelope=note=>`MBVCB.17030210865.218318.${note}.CT tu 1028483735 PHAM VAN QUANG toi 2901181999999 Bui Xuan Tung tai AGRIBANK`;
const creditHead="Agribank: 08:19 14/11/2026 Tài khoản 2901181999999: +5,547,000VND. Nội dung giao dịch: ";
const creditTail=". Số dư cuối: -20,561,730VND";
const credit={id:298,status:"credit_candidate",is_own_transfer:false,
 amount_vnd:5547000,package_name:"com.vnpay.Agribank3g",
 body:creditHead+envelope(memo)+creditTail};
const bill={
 media_asset_id:"local-only-bill",status:"amount_read",amount_vnd:5547000,
 sent_at:"2026-11-14T01:20:28.990Z",transfer_at_vn:"2026-11-14 08:19:00",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"290118199999",receiving_account_last5:"99999",
 transfer_content:"PHAM VAN QUANG choyen tien",transfer_reference:"17030210865",
 transaction_nature:"transfer",requires_bank_memo:true,ocr_date_normalization_corrected:false
};
const match=(b=bill,e=[credit],others=[])=>previewBillAppMatch(b,e,others,now);
const candidate=match();
assert.equal(candidate.status,"candidate_unique");
assert.equal(candidate.notification_id,298);
assert.equal(candidate.source,"agribank_plus_notification");
assert.equal(candidate.ledger_written,false,"preview must NEVER post money");
assert.equal(candidate.bank_confirmed,false,"the SQL financial guard is still required");
assert.equal(match({...bill,transfer_content:memo}).status,"candidate_unique",
 "exact memo remains valid");
assert.equal(match({...bill,transfer_content:"PHAM VAN QUANG chuven tien"}).status,"candidate_unique",
 "one OCR substitution inside the bank-confirmed generic transfer suffix");
assert.equal(match({...bill,transfer_content:"PHAM VAN QUANG choyen tiin"}).status,"review",
 "two OCR substitutions are rejected");
assert.equal(match({...bill,transfer_content:"NGUYEN VAN QUANG choyen tien"}).status,"review",
 "payer's entire name prefix must be identical to the bank sender");
assert.equal(match({...bill,transfer_content:"PHAM VAN QUANG choyen tien khac"}).status,"review",
 "extended or custom memo is not autocorrected");
assert.equal(match({...bill,transfer_content:"choyen tien"}).status,"review",
 "generic memo alone is not identifying evidence");
assert.equal(match({...bill,transfer_reference:"17030210866"}).status,"review",
 "different bank routing reference rejects even one OCR difference");
assert.equal(match({...bill,transfer_reference:null}).status,"review",
 "missing full reference disallows OCR correction");
assert.equal(match({...bill,receiving_account_last5:"99998"}).status,"review",
 "bank account last-five conflict always blocks");
assert.equal(match({...bill,receiving_name:"OTHER PAYEE"}).status,"review");
assert.equal(match({...bill,transfer_at_vn:"2026-11-14 08:16:00"}).status,"review",
 "bank clock must be within the verified minute");
assert.equal(match({...bill,amount_vnd:5548000}).status,"review");
assert.equal(match(bill,[{...credit,body:creditHead+envelope("OTHER SENDER chuyen tien")+creditTail}]).status,"review");
assert.equal(match(bill,[{...credit,body:creditHead+envelope(memo).replace("17030210865","17030210866")+creditTail}]).status,"review");
assert.equal(match(bill,[{...credit,body:creditHead+envelope(memo).replace("PHAM VAN QUANG toi","NGUYEN VAN A toi")+creditTail}]).status,"review");
assert.equal(match(bill,[{...credit,body:creditHead+envelope(memo).replace("toi 2901181999999","toi 2901181999998")+creditTail}]).status,"review");
assert.equal(match(bill,[{...credit,body:creditHead+envelope(memo).replace(".CT tu ",".ERR tu ")+creditTail}]).status,"review");
assert.equal(match(bill,[credit,{...credit,id:299}]).status,"review",
 "competing bank credits must be reviewed, not collected");
assert.equal(match(bill,[credit],[{...bill,media_asset_id:"other-bill"}]).status,"review",
 "competing same-transfer photos must not double collect");
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert(worker.includes('db.rpc("chat_bank_app_collect"'),
 "only production financial RPC may authorize the posting");
console.log("BANK-349: exact MBVCB proof + one OCR substitution, mismatch/duplicate guards, no direct financial mutation PASS");
