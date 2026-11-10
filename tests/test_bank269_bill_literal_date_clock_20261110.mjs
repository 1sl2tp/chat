import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RULE_VERSION,SYSTEM_PROMPT,readV4Fields}
 from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";

const sentAt="2026-11-10T11:06:39Z"; // 18:06:39 Vietnam
assert.equal(RULE_VERSION,"bank_bill_amount_v5_20261110");
for(const marker of [
 "ĐỌC CHỮ TRƯỚC, CHUẨN HÓA SAU",
 "transfer_date_printed_vn",
 "transfer_time_printed_vn",
 "NGÀY/THÁNG/NĂM (DD/MM/YYYY)",
 "KHÔNG PHẢI ngày 11 tháng 10",
 "thanh trạng thái điện thoại",
 "KHÔNG nhắn khách",
 "KHÔNG ghi thu"
]) assert.ok(SYSTEM_PROMPT.includes(marker),"prompt must teach "+marker);
assert.ok(!SYSTEM_PROMPT.includes('"transaction_datetime_vn":"2026-10-18 19:51"'),
 "remove stale October timestamp from output example");

const read=(fields,when=sentAt)=>readV4Fields(fields,{sentAt:when});
const printed={
 transfer_date_printed_vn:"10/11/2026",
 transfer_date_vn:"2026-11-10",
 transfer_time_printed_vn:"18:06"
};
const recovered=read({...printed,transaction_datetime_vn:null});
assert.equal(recovered.transfer_at_vn,"2026-11-10 18:06");
assert.equal(recovered.transaction_time_precision,"minute");
assert.equal(recovered.transfer_date_vn,"2026-11-10");
assert.equal(recovered.time_date_conflict,false);
assert.equal(recovered.date_swap_suspected,false);
assert.equal(recovered.transfer_time_printed_vn,"18:06");

const seconds=read({...printed,transfer_time_printed_vn:"18:06:29",
 transaction_datetime_vn:null});
assert.equal(seconds.transfer_at_vn,"2026-11-10 18:06:29");
assert.equal(seconds.transaction_time_precision,"second");

// Never borrow the Chat upload day or clock.
const onlyClock=read({transfer_time_printed_vn:"18:06",transaction_datetime_vn:null});
assert.equal(onlyClock.transfer_at_vn,null);
assert.equal(onlyClock.transfer_date_vn,null);
const onlyDay=read({transfer_date_printed_vn:"10/11/2026",
 transfer_date_vn:"2026-11-10",transaction_datetime_vn:null});
assert.equal(onlyDay.transfer_at_vn,null);
assert.equal(onlyDay.transfer_date_vn,"2026-11-10");

// Printed clock/date contradictions must fail closed without changing the amount.
const falseSeconds=read({...printed,transaction_datetime_vn:"2026-11-10 18:06:00"});
assert.equal(falseSeconds.transfer_at_vn,"2026-11-10 18:06",
 "literal HH:mm on bill must not inherit fabricated :00 seconds");
assert.equal(falseSeconds.transaction_time_precision,"minute");
const contradictorySeconds=read({...printed,transfer_time_printed_vn:"18:06:29",
 transaction_datetime_vn:"2026-11-10 18:06:00"});
assert.equal(contradictorySeconds.clock_text_conflict,true);
assert.equal(contradictorySeconds.transfer_at_vn,null);
const wrongMinute=read({...printed,transfer_time_printed_vn:"18:07",
 transaction_datetime_vn:"2026-11-10 18:06"});
assert.equal(wrongMinute.clock_text_conflict,true);
assert.equal(wrongMinute.time_date_conflict,true);
assert.equal(wrongMinute.transfer_at_vn,null);
const dayMonthSwap=read({...printed,transaction_datetime_vn:"2026-10-11 18:06"});
assert.equal(dayMonthSwap.time_date_conflict,false,
 "AI ISO conversion is not stronger evidence than literal DD/MM and HH:mm");
assert.equal(dayMonthSwap.transfer_at_vn,"2026-11-10 18:06");
assert.equal(dayMonthSwap.transfer_date_vn,"2026-11-10");
assert.equal(dayMonthSwap.ocr_date_normalization_corrected,true);
assert.equal(dayMonthSwap.date_swap_suspected,true,
 "retain audit signal of AI inversion without accusing the customer bill");

// Actual 10/11 printed date/time with BOTH ISO fields incorrectly 11/10.
const ocrDoubleSwap=read({
 transfer_date_printed_vn:"10/11/2026",
 transfer_time_printed_vn:"17:42:38",
 transaction_datetime_vn:"2026-10-11 17:42:38",
 transfer_date_vn:"2026-10-11"
},"2026-11-10T10:43:21Z");
assert.equal(ocrDoubleSwap.transfer_at_vn,"2026-11-10 17:42:38");
assert.equal(ocrDoubleSwap.time_date_conflict,false);
assert.equal(ocrDoubleSwap.ocr_date_normalization_corrected,true);
assert.equal(ocrDoubleSwap.ocr_iso_date_conflict,true);

// Inconsistent visible time or missing date text still refuses an unsafe repair.
const missingLiteralClock=read({
 transaction_datetime_vn:"2026-10-11 17:42:38",
 transfer_date_vn:"2026-10-11",
 transfer_date_printed_vn:"10/11/2026"
},"2026-11-10T10:43:21Z");
assert.equal(missingLiteralClock.transfer_at_vn,null);
assert.equal(missingLiteralClock.time_date_conflict,true);

// Genuine old transfer stays old when printed text independently agrees.
const old=read({transaction_datetime_vn:null,
 transfer_date_vn:"2026-10-11",transfer_date_printed_vn:"11/10/2026",
 transfer_time_printed_vn:"10:25"});
assert.equal(old.time_date_conflict,false);
assert.equal(old.transfer_at_vn,"2026-10-11 10:25");

for(const bad of ["24:00","18:61","18:06:61","9 giờ 30",""])
 assert.equal(read({...printed,transfer_time_printed_vn:bad,
  transaction_datetime_vn:null}).transfer_at_vn,null,
  "refuse invalid or not actually printed time "+bad);

const source=readFileSync(new URL(
 "../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.match(source,/transfer_time_printed_vn:fields\.transfer_time_printed_vn/);
assert.match(source,/clock_text_conflict:fields\.clock_text_conflict/);
assert.match(source,/ocr_date_normalization_corrected:fields\.ocr_date_normalization_corrected/);
assert.match(source,/readV4Fields\(parsed,\{sentAt:job\.sent_at\}\)/);
assert.match(source,/&&!fields\.time_date_conflict/);

console.log("BANK-269 AI printed DD/MM and HH:mm OCR: correct, no guessing, conflict-safe PASS");
