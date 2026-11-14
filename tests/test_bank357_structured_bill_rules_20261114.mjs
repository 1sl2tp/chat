import assert from "node:assert/strict";
import {SYSTEM_PROMPT,STRUCTURED_BILL_VISION_RULES,RULE_VERSION} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
assert.equal(RULE_VERSION,"bank_bill_amount_v6_20261114");
assert.equal(SYSTEM_PROMPT.startsWith(STRUCTURED_BILL_VISION_RULES),true);
for(const phrase of ["VÙNG 0","VÙNG 1","VÙNG 2","VÙNG 3","VÙNG 4","VÙNG 5","VÙNG 6","thiếu giờ","1 phút","không tự bù","không tự ghi thu"])assert.ok(SYSTEM_PROMPT.toLowerCase().includes(phrase.toLowerCase()),phrase);
assert.ok(SYSTEM_PROMPT.indexOf("VÙNG 1")<SYSTEM_PROMPT.indexOf("VÙNG 6"));
console.log("BANK-357 structured OCR vision rules PASS");
