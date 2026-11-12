import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

const now=Date.parse("2026-11-12T08:45:00Z");
const note="NGUYEN THI OANH chuyen tien";
const bill={
  media_asset_id:"bank296-mocked-ngoc-bill",status:"amount_read",amount_vnd:3000000,
  sent_at:"2026-11-12T08:33:44.463Z",transfer_at_vn:"2026-11-12 15:33:28",
  receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
  receiving_account:"290118199999",receiving_account_last5:"99999",
  transfer_content:note,transaction_nature:"transfer",
  requires_bank_memo:true,ocr_date_normalization_corrected:false
};
const lead="Agribank: 15:33 12/11/2026 Tài khoản 2901181999999: +3,000,000VND. Nội dung giao dịch:  ";
const tail=". Số dư cuối: -136,114,730VND";
const credit={
  id:270,status:"credit_candidate",amount_vnd:3000000,
  package_name:"com.vnpay.Agribank3g",is_own_transfer:false,
  body:lead+"MB(046501)("+note+")"+tail
};
const preview=(b=bill,events=[credit],others=[])=>previewBillAppMatch(b,events,others,now);
const ok=preview();
assert.equal(ok.status,"candidate_unique");
assert.equal(ok.notification_id,270);
assert.equal(ok.matched_amount_vnd,3000000);
assert.equal(ok.bank_confirmed,false);
assert.equal(ok.ledger_written,false);
assert.equal(preview({...bill,ocr_date_normalization_corrected:true}).status,"candidate_unique");
for(const memo of [note,"QR - "+note,"MB(046501)("+note+")"]){
  const r=preview(bill,[{...credit,body:lead+memo+tail}]);
  assert.equal(r.status,"candidate_unique",memo);
}
const bad=[
  "MB(046501)(ANOTHER SENDER chuyen tien)",
  "MB(046501)("+note+" THEM)",
  "MB(046501)("+note+") EXTRA",
  "XMB(046501)("+note+")",
  "MB(04650)("+note+")",
  "MB(0465017)("+note+")",
  "MB(ABCDEF)("+note+")",
  "MB(046501)(("+note+"))",
  "MB(046501)("+note+")..",
  "PREFIX MB(046501)("+note+")",
  "MB(046501)("+note.slice(0,-1)+")",
];
for(const memo of bad){
 const result=preview(bill,[{...credit,body:lead+memo+tail}]);
 assert.equal(result.status,"review",memo);
 assert.equal(result.reason,"ocr_date_corrected_bank_memo_unverified",memo);
}
for(const invalid of [
  [{...credit,amount_vnd:3001000}],
  [{...credit,body:credit.body.replace("2901181999999","2901181999998")}],
  [{...credit,body:credit.body.replace("15:33","15:31")}],
  [{...credit,package_name:"wrong.app"}],
  [{...credit,is_own_transfer:true}],
  [{...credit},{...credit,id:271}]
]){
 assert.notEqual(preview(bill,invalid).status,"candidate_unique");
}
assert.notEqual(preview({...bill,receiving_account_last5:"11111"}).status,"candidate_unique");
assert.notEqual(preview({...bill,transfer_content:""}).status,"candidate_unique");
// Preview never alters ledger, status, or bank data. Only the independently
// guarded financial RPC may post after all evidence and duplicate checks.
console.log("BANK-296 exact MB routing envelope, strict bank evidence, false-positive guards PASS");
