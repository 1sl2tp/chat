import assert from "node:assert/strict";
import {parseAgribankHint,chooseAgribankHint,shouldAssistBankImage,bankAssistedReadPrompt}
  from "../supabase/functions/v21-bank-bill-event/bill-bank-hints.mjs";

const event={id:8,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 amount_vnd:20000,posted_at:"2026-10-19T02:41:59.413Z",
 body:"Agribank: 09:41 19/10/2026 Tài khoản 2901181999999: +20,000VND. Nội dung giao dịch: BUI XUAN TUNG chuyen tien. Số dư cuối: 137,280,546VND"};
const h=parseAgribankHint(event);
assert.equal(h.amount_vnd,20000);
assert.equal(h.transaction_at_vn,"2026-10-19 09:41");
assert.equal(h.description,"BUI XUAN TUNG chuyen tien");
assert.equal(h.transfer_reference,null); // source bank push has no reference number
assert.equal(chooseAgribankHint([event],"2026-10-19T02:42:42.501Z").id,8);
assert.equal(chooseAgribankHint([event,event],"2026-10-19T02:42:42.501Z"),null);
assert.equal(chooseAgribankHint([event],"2026-10-19T04:00:00Z"),null);
assert.equal(parseAgribankHint({...event,amount_vnd:30000}),null);
assert.equal(parseAgribankHint({...event,body:event.body.replace("+20,000VND","-20,000VND")}),null);
assert.equal(parseAgribankHint({...event,body:event.body.replace("09:41","08:00")}),null);
const coded={...event,body:event.body+" Mã giao dịch: AB12345678"};
assert.equal(parseAgribankHint(coded).transfer_reference,"AB12345678");
assert.equal(shouldAssistBankImage({status:"review"},{}),true);
assert.equal(shouldAssistBankImage({status:"amount_read"},{transfer_at_vn:null}),true);
assert.equal(shouldAssistBankImage({status:"amount_read"},{transfer_at_vn:"2026-10-19 09:41"}),false);
assert.equal(shouldAssistBankImage({status:"non_bill"},{}),false);
const prompt=bankAssistedReadPrompt("READ FROM IMAGE ONLY",h);
assert(prompt.includes("20000 VND"));
assert(prompt.includes("KHÔNG được chép số tiền"));
assert(!prompt.includes("137,280,546")); // never give balance to the AI
assert(!prompt.includes("2901181999999")); // no full account in bank hint
console.log("BANK-168 sanitized bank-assisted image hints PASS");
