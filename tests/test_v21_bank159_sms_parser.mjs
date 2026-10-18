import assert from "node:assert/strict";
import {readIncomingAgribankSms} from "../supabase/functions/v21-bank-bill-event/bill-sms-preview.mjs";

const timestamp=Date.parse("2026-10-19T07:32:00Z"); // 14:32 VN
const base={
 id:12,sender:"AGRIBANK",sms_timestamp_ms:timestamp,
 received_at:new Date(timestamp).toISOString(),
 body:"Agribank: 14:32 19/10 TK 1234567899999: +406.000 VND (CK THANH TOAN). SD: 6.850.000 VND"
};
const parsed=readIncomingAgribankSms(base);
assert.ok(parsed,"Agribank no-year SMS must parse");
assert.equal(parsed.amount_vnd,406000,"read transaction amount, not balance");
assert.equal(parsed.receiving_account_last5,"99999");
assert.equal(parsed.transaction_at_ms,timestamp,"infer year via APK timestamp");

assert.equal(readIncomingAgribankSms({...base,body:"Agribank: 14:32 19/10 TK 1234567899999: -406.000 VND. SD: 6.850.000 VND"}),null,"debit is not an incoming transaction");
assert.equal(readIncomingAgribankSms({...base,body:"Agribank: 14:32 19/10 TK 1234567899999: SD: +6.850.000 VND"}),null,"positive balance is not a transaction");
assert.equal(readIncomingAgribankSms({...base,sender:"BANK_FAKE"}),null,"not an authenticated bank sender");
assert.equal(readIncomingAgribankSms({...base,body:"OTP 123456 "+base.body}),null,"reject OTP-bearing text");
const bad=readIncomingAgribankSms({...base,body:"Agribank: 14:32 18/10 TK 1234567899999: +406.000 VND",sms_timestamp_ms:timestamp});
assert.ok(bad&&bad.transaction_at_ms===Date.parse("2026-10-18T07:32:00Z"),"nearby previous day accepted");
const old=readIncomingAgribankSms({...base,body:"Agribank: 14:32 09/10 TK 1234567899999: +406.000 VND",sms_timestamp_ms:timestamp});
assert.ok(old&&old.transaction_at_ms===null,"stale ambiguous SMS date must not pass preflight");
const rollover=Date.parse("2025-12-31T17:03:00Z");
assert.equal(readIncomingAgribankSms({...base,body:"Agribank: 23:59 31/12 TK 1234567899999: +100.000 VND",sms_timestamp_ms:rollover,received_at:new Date(rollover).toISOString()})?.transaction_at_ms,Date.parse("2025-12-31T16:59:00Z"),"31 Dec / 1 Jan rollover");
console.log("BANK-159 SMS transaction-only text parsing and no-year dates PASS");
