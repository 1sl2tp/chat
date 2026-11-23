import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-367: c Sam 70k ZaloPay; old preview stayed "no matching bank"
// because a stored Agribank notice wraps the COMPLETE original memo in a
// fixed-length routing token. No OCR retry, DB write or real transfer.
const note="Agribank: 15:25 16/11/2026 Tài khoản 2901181999999: +70,000VND. Nội dung giao dịch: O5CH7L3VSMM4-Hanh dung Zalopay chuyen tien. Số dư cuối: -212,394,230VND";
const candidate={
 media_asset_id:"synthetic-c-sam-70k",status:"amount_read",amount_vnd:70000,
 sent_at:"2026-11-16T08:25:31Z",transfer_at_vn:"2026-11-16 15:25:00",
 transfer_date_vn:"2026-11-16",transfer_content:"Hanh dùng Zalopay chuyển tiền",
 sender_name:"HANH",receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"290118199999",receiving_account_last5:"99999",
 transaction_nature:"transfer",transfer_reference:"#261116003119208",
 requires_bank_memo:true,ocr_date_normalization_corrected:false
};
const credit={id:348,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:70000,body:note};
const checked=(bill=candidate,notices=[credit],others=[])=>previewBillAppMatch(bill,notices,others);
assert.deepEqual(checked().status,"candidate_unique");
assert.equal(checked().notification_id,348);
const refusal=[
 ["not a bank payment",{...credit,status:"unclassified"}],
 ["different recipient",{...credit,body:note.replace("2901181999999","2901181888888")}],
 ["different amount",{...credit,amount_vnd:71000}],
 ["different minute",{...credit,body:note.replace("15:25","15:29")}],
 ["different sender memo",{...credit,body:note.replace("Hanh dung Zalopay","Hoa dung Zalopay")}],
 ["wrong technical prefix width",{...credit,body:note.replace("O5CH7L3VSMM4-","SHORT-")}],
 ["partial payer memo",{...credit,body:note.replace("Hanh dung Zalopay chuyen tien","Hanh chuyen tien")}],
 ["same text but different final bank balance",{...credit,body:note.replace("-212,394,230","-212,464,230")}]
];
for(const [label,event] of refusal){
 const result=checked(candidate,[event]);
 if(label==="same text but different final bank balance"){
  // A changed final balance can be a distinct real bank credit; it must not
  // be deduplicated by the ingest. As a sole match it is valid evidence.
  assert.equal(result.status,"candidate_unique",label);
 } else assert.notEqual(result.status,"candidate_unique",label);
}
assert.notEqual(checked({...candidate,sender_name:"HOA"}).status,"candidate_unique",
 "A matching suffix is insufficient if OCR sender differs");
assert.notEqual(checked({...candidate,receiving_account:"2901161999999"}).status,"candidate_unique",
 "A known conflicting full account cannot be silently accepted");
assert.equal(checked(candidate,[credit,{...credit,id:349}]).status,"review",
 "Two separately ingested credits must still be stopped before ledger RPC");
assert.equal(checked(candidate,[credit],[
 {...candidate,media_asset_id:"other-photo",status:"amount_read",raw_read:{transfer_content:candidate.transfer_content}}
]).status,"review","Another competing bill in the minute must not collect");
console.log("BANK-367: full original bank routing memo reconciliation PASS");
