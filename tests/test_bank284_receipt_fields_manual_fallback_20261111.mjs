import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readV4Fields,validateVisionRead,requiredAutoCollectEvidence}
  from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
  from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// SPEC BANK-284: Given a customer transfer image, when any one of the
// amount / recipient account / printed date / printed clock is uncertain,
// then leave it for Admin verification. No customer ledger is written.
const raw={
 image_type:"successful_transfer_receipt",transaction_nature:"transfer",
 transaction_selection:"single_detail",transfer_success_visible:true,
 amount_clear:true,amount_role:"transfer_amount",amount_text:"850.000 đ",
 amount_vnd:850000,recipient_name:"BUI XUAN TUNG",
 recipient_account_visible:"2901181999999",recipient_account_last5:"99999",
 receiving_bank:"Agribank",sending_bank:"VPBank",
 transaction_datetime_vn:"2026-11-11 08:25",
 transfer_date_vn:"2026-11-11",
 transfer_date_printed_vn:"11/11/2026",transfer_time_printed_vn:"08:25"
};
const parse=x=>readV4Fields(x,{sentAt:"2026-11-11T01:27:00Z"});
const good=parse(raw);
assert.equal(validateVisionRead(raw).status,"amount_read");
assert.deepEqual(requiredAutoCollectEvidence(good),{complete:true,reason:null});
assert.equal(good.transfer_at_vn,"2026-11-11 08:25");
assert.equal(good.receiving_account,"2901181999999");

// Alternate receipt: only last five beneficiary digits are visible.
const masked=parse({...raw,recipient_account_visible:"*****99999"});
assert.equal(masked.receiving_account,null);
assert.equal(masked.receiving_account_last5,"99999");
assert.equal(requiredAutoCollectEvidence(masked).complete,true);

const missingAccount=parse({...raw,recipient_account_visible:null,recipient_account_last5:null});
assert.equal(requiredAutoCollectEvidence(missingAccount).reason,"bill_recipient_account_missing");
const senderOnly=parse({...raw,recipient_account_visible:null,recipient_account_last5:null,
 sending_bank:"AGRIBANK",recipient_name:null});
assert.equal(requiredAutoCollectEvidence(senderOnly).reason,"bill_recipient_account_missing",
 "do not copy sender account/logo to beneficiary");

const falseFull=parse({...raw,recipient_account_visible:"7777777999999"});
assert.equal(requiredAutoCollectEvidence(falseFull).reason,"bill_recipient_account_conflict",
 "sharing the last five digits is insufficient when full account is visible");

assert.equal(requiredAutoCollectEvidence(parse({...raw,transfer_date_printed_vn:null}))
 .reason,"bill_printed_date_missing");
assert.equal(requiredAutoCollectEvidence(parse({...raw,transfer_time_printed_vn:null}))
 .reason,"bill_printed_time_missing");
assert.equal(requiredAutoCollectEvidence(parse({...raw,transfer_time_printed_vn:"08:26"}))
 .reason,"bill_printed_datetime_conflict");
assert.equal(requiredAutoCollectEvidence(parse({...raw,transfer_date_printed_vn:"31/02/2026"}))
 .reason,"bill_printed_date_missing");
assert.equal(requiredAutoCollectEvidence(parse({...raw,transfer_time_printed_vn:"24:25"}))
 .reason,"bill_printed_time_missing");

// Text conversion may swap DD/MM; the literal receipt day + clock is authoritative.
const corrected=parse({...raw,transaction_datetime_vn:"2026-11-11 08:25"});
assert.equal(requiredAutoCollectEvidence(corrected).complete,true);
const ambiguous={...raw,image_type:"multiple_transactions"};
assert.equal(validateVisionRead(ambiguous).status,"review");
assert.equal(validateVisionRead({...raw,amount_text:"Số dư: 850.000"}).status,"review");
assert.equal(validateVisionRead({...raw,amount_clear:false}).status,"review");

// Even a same-amount bank notification must not promote an incomplete image.
const incompleteBill={status:"review",media_asset_id:"test",amount_vnd:850000,
 sent_at:"2026-11-11T01:27:00Z",transaction_nature:"transfer",...missingAccount};
const bankNotice={id:284,package_name:"com.vnpay.Agribank3g",
 status:"credit_candidate",is_own_transfer:false,amount_vnd:850000,
 body:"Agribank: 08:25 11/11/2026 Tài khoản 2901181999999: +850,000VND. Nội dung giao dịch: KH chuyen tien."};
assert.equal(previewBillAppMatch(incompleteBill,[bankNotice],[],
 Date.parse("2026-11-11T02:00:00Z")).status,"review");

const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",
 import.meta.url),"utf8");
assert.match(worker,/requiredAutoCollectEvidence\(fields\)/);
assert.match(worker,/verdict\.status==="amount_read"&&!evidence\.complete\?"review"/);
assert.match(worker,/bill_evidence_policy:"manual_on_missing_v1"/);
assert.match(worker,/if\(status==="amount_read"&&matchPreview\?\.source/);
console.log("BANK-284: amount, beneficiary account, printed day/clock, manual-only fallback PASS");
