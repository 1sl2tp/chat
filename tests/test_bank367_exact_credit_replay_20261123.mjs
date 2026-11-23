import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sameOfficialCreditNotice,exactCreditMinuteWindow} from "../supabase/functions/v21-agribank-notification-ingest/credit-duplicate-identity.mjs";

// BANK-367: synthetic shape of the 360k Agribank #424/#425 replay, where
// Android posts the SAME official event twice with different posted_at_ms.
const body="Agribank: 08:14 22/11/2026 Tài khoản 2901181999999: +360,000VND. Nội dung giao dịch: Trang Tuan chuyen khoan nhanh qua Zalo FT26327204990536. Số dư cuối: -108,604,230VND";
const base={id:424,package_name:"com.vnpay.Agribank3g",
 status:"credit_candidate",is_own_transfer:false,bank_credit_account:"2901181999999",
 amount_vnd:360000,body,
 transfer_at:"2026-11-22T01:14:00Z",posted_at:"2026-11-22T01:14:57Z"};
const replay={...base,id:425,posted_at:"2026-11-22T01:34:30Z"};
assert(sameOfficialCreditNotice(base,replay.body,360000),"Android push-time changes are not a second bank payment");
assert.deepEqual(exactCreditMinuteWindow(body),{from:"2026-11-22T01:14:00.000Z",to:"2026-11-22T01:14:59.999Z"});
for(const [label,other,payment] of [
 ["Other amount",base,361000],
 ["Different balance",{...base,body:body.replace("-108,604,230","-108,244,230")},360000],
 ["Different bank minute",{...base,body:body.replace("08:14 22/11","08:15 22/11")},360000],
 ["Other bank account",{...base,bank_credit_account:"2901181888888"},360000],
 ["Other customer memo",{...base,body:body.replace("Trang Tuan","Trang Hien")},360000],
 ["Other provider",{...base,package_name:"com.other.app"},360000],
 ["Excluded internal transfer",{...base,is_own_transfer:true},360000],
 ["No official clock",{...base,body:"Agribank: +360000"},360000],
 ["Already processed",{...base,status:"processed"},360000]
])assert.equal(sameOfficialCreditNotice(other,body,payment),false,label);
const ingest=readFileSync(new URL("../supabase/functions/v21-agribank-notification-ingest/index.ts",import.meta.url),"utf8");
assert.match(ingest,/exactCreditMinuteWindow\(body\)/);
assert.match(ingest,/sameOfficialCreditNotice\(e,body,amount\)/);
assert.match(ingest,/duplicate_kind:"same_official_bank_notice"/);
assert.match(ingest,/recheckNewCredit\(body,amount\)/);
console.log("BANK-367: exact Agribank repeated-credit detection PASS");
