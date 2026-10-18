import assert from "node:assert/strict";
import {RULE_VERSION,SYSTEM_PROMPT,parseAmountText,validateVisionRead} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
assert.equal(RULE_VERSION,"bank_bill_amount_v3_20261018");
for(const token of ["-648,000đ","Người thụ hưởng nhận","bank_credit_transaction","bank_credit_notification","ghi có","nứt","lóa"]){
 assert(SYSTEM_PROMPT.includes(token),"missing prompt acceptance: "+token);
}
const money=[
 ["648,000đ",648000],["-648,000đ",-648000],["−648.000đ",-648000],
 ["- 648 000 đ",-648000],["648.000 VNĐ",648000],["₫ 648,000",648000],
 ["VND -648,000",-648000],["+648.000đ",648000],["1,205,000 VND",1205000],
 ["1.100.000,00 đ",1100000],["1,100,000.00 VND",1100000],
 ["797,000 VND",797000],["1 344 000 đ",1344000],
 ["1,20,000đ",null],["-648,00đ",null],["-648,000 extra",null],
 ["1.000đ - 2.000đ",null],["0đ",null],["1,100.000đ",null]
];
for(const [txt,num] of money)assert.equal(parseAmountText(txt),num,"parse amount: "+txt);
function v(image_type,amount_role,amount_text,amount_vnd,extra={}){
 return {image_type,amount_role,amount_text,amount_vnd,amount_clear:true,transfer_success_visible:true,uncertainty:null,...extra};
}
function accept(image_type,role,text,amount){
 assert.deepEqual(validateVisionRead(v(image_type,role,text,amount)),{status:"amount_read",reason:"bank_image_amount_only_no_collection",amount_vnd:amount});
}
accept("successful_transfer_receipt","beneficiary_received","648,000",648000);
accept("successful_transfer_receipt","sender_debit","-648,000đ",648000);
accept("successful_transfer_receipt","sender_debit","−648.000đ",648000);
accept("successful_transfer_receipt","transfer_amount","1,205,000 VND",1205000);
accept("bank_credit_transaction","incoming_credit","+648.000đ",648000);
accept("bank_credit_notification","incoming_credit","797,000 VND",797000);
const declines=[
 [v("successful_transfer_receipt","transfer_amount","-648,000đ",648000),"negative_amount_wrong_role"],
 [v("bank_credit_transaction","sender_debit","-648,000đ",648000),"amount_direction_conflict"],
 [v("successful_transfer_receipt","incoming_credit","648,000đ",648000),"amount_direction_conflict"],
 [v("successful_transfer_receipt","beneficiary_received","648,000đ",1296000),"amount_text_number_mismatch"],
 [v("successful_transfer_receipt","sender_debit","-648,000đ",-648000),"amount_text_number_mismatch"],
 [v("successful_transfer_receipt","sender_debit","-648,000đ",648000,{amount_clear:false}),"amount_unclear"],
 [v("bank_credit_notification","incoming_credit","+648.000đ",648000,{transfer_success_visible:false}),"transaction_or_bank_notice_not_clear"],
 [v("multiple_transactions","transfer_amount","648,000đ",648000),"multiple_transactions_ambiguous"],
 [v("not_transfer_receipt","incoming_credit","648,000đ",648000),"not_bank_transfer_or_credit_record"],
 [v("possible_transfer_receipt",null,null,null),"bill_type_uncertain"]
];
for(const [payload,reason] of declines)assert.equal(validateVisionRead(payload).reason,reason,reason);
console.log("PASS receipt amount v3: minus sender debits, beneficiary money, incoming credit notices, safe refusal");
