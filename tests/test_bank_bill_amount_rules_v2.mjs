// TAPHOA bank amount-only deterministic acceptance (no network, no ledger).
import assert from "node:assert/strict";
import {RULE_VERSION,SYSTEM_PROMPT,parseAmountText,validateVisionRead} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
assert.equal(RULE_VERSION,"bank_bill_amount_v2_20261018");
for(const must of ["ảnh chụp", "lóa", "nứt", "biên lai", "THÀNH CÔNG", "không thu tiền", "mã giao dịch"]){
 assert(SYSTEM_PROMPT.toLocaleLowerCase("vi").includes(must.toLocaleLowerCase("vi")),must);
}
const amounts=[
 ["1.205.000đ",1205000],["1,100,000 VND",1100000],
 ["797,000 VND",797000],["1 344 000 đ",1344000],
 ["312000 VNĐ",312000],["1.100.000,00 đ",1100000],
 ["1,100,000.00 VND",1100000],["₫",null],
 ["1.34.000đ",null],["1,34,000đ",null],["1.000đ và 2.000đ",null],
 ["9999999999999 VND",null],["0đ",null]
];
for(const [moneyText,expected] of amounts)assert.equal(parseAmountText(moneyText),expected,"amount "+moneyText);
function bill(amount_text,amount_vnd,props={}){
 return {image_type:"successful_transfer_receipt",transfer_success_visible:true,amount_text,amount_vnd,amount_clear:true,uncertainty:null,...props};
}
for(const [moneyText,n] of amounts.slice(0,7)){
 assert.deepEqual(validateVisionRead(bill(moneyText,n)),{status:"amount_read",reason:"bill_amount_only_no_collection",amount_vnd:n});
}
assert.equal(validateVisionRead(bill("797.000đ",797000,{amount_clear:false})).status,"review");
assert.equal(validateVisionRead(bill("797.000đ",797001)).reason,"amount_text_number_mismatch");
assert.equal(validateVisionRead(bill("797.000đ",797000,{transfer_success_visible:false})).reason,"transfer_success_not_visible");
assert.equal(validateVisionRead({...bill("797.000đ",797000),image_type:"possible_transfer_receipt"}).reason,"bill_type_uncertain");
assert.equal(validateVisionRead({...bill("797.000đ",797000),image_type:"multiple_transactions"}).reason,"multiple_transactions_ambiguous");
assert.equal(validateVisionRead({...bill("797.000đ",797000),image_type:"not_transfer_receipt"}).status,"non_bill");
assert.equal(validateVisionRead({}).status,"review");
assert.equal(validateVisionRead(bill("312.000đ",312000,{image_type:"instruction_to_send_money"})).status,"review");
console.log("PASS bank bill amount rules v2 — real amount examples, uncertain/multi/nonbill, mismatch guard");
