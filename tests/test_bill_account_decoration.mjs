import assert from "node:assert/strict";
import * as live from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import * as reread from "../supabase/functions/v0-bill-audit-reread/bill-amount-rules.mjs";
const target="2901181999999";
const raw={"image_type":"successful_transfer_receipt","transaction_selection":"single_detail","transaction_nature":"transfer","transfer_success_visible":true,"amount_role":"sender_debit","amount_clear":true,"amount_text":"20.000 VND","amount_vnd":20000,"recipient_name":"BUI XUAN TUNG","recipient_account_visible":"2901181999999 •","recipient_account_last5":"99999","receiving_bank":"AGRIBANK","sending_bank":"VietinBank","transfer_date_vn":"2026-11-26","transfer_date_printed_vn":"26/11/2026","transfer_time_printed_vn":"16:41","transaction_datetime_vn":"2026-11-26 16:41","transfer_content":"TEST CHUYEN TIEN"};
for(const api of [live,reread]){
 const fields=api.readV4Fields(raw);
 assert.equal(fields.receiving_account,target);
 assert.equal(fields.receiving_account_visible,target+" •");
 assert.equal(api.requiredAutoCollectEvidence(fields).complete,true);
 for(const input of [target+" ••",target.slice(0,-1)+" •",target+"0 •"]){
  const bad=api.readV4Fields({...raw,recipient_account_visible:input});
  assert.notEqual(bad.receiving_account,target);
  assert.equal(api.requiredAutoCollectEvidence(bad).complete,false);
 }
 const masked=api.readV4Fields({...raw,recipient_account_visible:"2901181•999999"});
 assert.notEqual(masked.receiving_account,target);
 assert.equal(api.requiredAutoCollectEvidence(masked).requires_bank_memo,true);
 assert.equal(api.requiredAutoCollectEvidence(api.readV4Fields({...raw,transfer_time_printed_vn:null})).complete,false);
}
console.log("Bill account decoration fixtures passed; no financial posting tested or performed.");
