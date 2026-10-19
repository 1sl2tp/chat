import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
const bill={media_asset_id:"receipt-169",status:"amount_read",amount_vnd:10000,
 sent_at:"2026-10-19T03:42:00Z",transfer_at_vn:"2026-10-19 10:41",
 receiving_name:null,receiving_bank:null,receiving_account_last5:null,transaction_nature:"transfer"};
const credit={id:10,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 amount_vnd:10000,posted_at:"2026-10-19T03:56:29Z",
 body:"Agribank: 10:41 19/10/2026 Tài khoản 2901181999999: +10,000VND. Nội dung giao dịch: chuyen tien."};
const now=Date.parse("2026-10-19T03:57:00Z");
assert.equal(previewBillAppMatch(bill,[credit],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch({...bill,sent_at:"2026-10-19T03:54:00Z"},[credit],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch(bill,[{...credit,posted_at:"2026-10-19T04:35:00Z"}],[],Date.parse("2026-10-19T04:40:00Z")).status,"candidate_unique");
assert.equal(previewBillAppMatch(bill,[{...credit,amount_vnd:20000}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(bill,[{...credit,body:credit.body.replace("10:41","10:50")}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(bill,[credit,credit],[],now).status,"review");
assert.equal(previewBillAppMatch(bill,[{...credit,body:"bank notification has no printed time"}],[],now).status,"waiting_bank_event");
console.log("BANK-169 matches original printed transaction clocks, never Android arrival clocks");
