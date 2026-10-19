import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
const sent="2026-10-19T03:04:00Z",now=Date.parse("2026-10-19T03:08:00Z");
const bill={media_asset_id:"asset1",status:"amount_read",amount_vnd:406000,
  sent_at:sent,receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
  receiving_account_last5:"99999",transaction_nature:"transfer",
  transfer_at_vn:"2026-10-19 10:02"};
const app={id:20,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 amount_vnd:406000,posted_at:"2026-10-19T03:03:00Z",
 body:"Agribank: 10:02 19/10/2026 Tài khoản 2901181999999: +406,000VND. Nội dung giao dịch: chuyen tien."};
assert.equal(previewBillAppMatch(bill,[app],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch(bill,[],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(bill,[app,app],[],now).status,"review");
assert.equal(previewBillAppMatch(bill,[{...app,amount_vnd:405000}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch({...bill,receiving_account_last5:"11111"},[app],[],now).status,"review");
assert.equal(previewBillAppMatch({...bill,amount_vnd:406000},[app],[{...bill,media_asset_id:"asset2"}],now).status,"review");

// BANK-166: customer bill 10k in Chat, Agribank confirms amount/time;
// recipient details may be absent or partially cropped without blocking.
const tier1={...bill,receiving_name:null,receiving_bank:null,receiving_account:null,
 receiving_account_last5:null};
assert.equal(previewBillAppMatch(tier1,[app],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch(tier1,[app],[],now).match_level,1);
const tier2={...tier1,receiving_name:"Bùi Xuân Tùng"};
assert.equal(previewBillAppMatch(tier2,[app],[],now).match_level,2);
const partialAccount={...bill,receiving_account:"290118199999"};
assert.equal(previewBillAppMatch(partialAccount,[app],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch(partialAccount,[app],[],now).match_level,3);
assert.equal(previewBillAppMatch({...tier1,receiving_name:"OTHER PERSON"},[app],[],now).status,"review");
assert.equal(previewBillAppMatch({...tier1,receiving_bank:"OTHERBANK"},[app],[],now).status,"review");
assert.equal(previewBillAppMatch({...tier1,receiving_account:"2901181999998"},[app],[],now).status,"review");
const late={...app,posted_at:"2026-10-19T03:10:00Z",
 body:"Agribank: 10:02 19/10/2026 Tài khoản 2901181999999: +406,000VND. Nội dung giao dịch: nhan tien."};
assert.equal(previewBillAppMatch(tier1,[late],[],Date.parse("2026-10-19T03:13:00Z")).status,"candidate_unique");
assert.equal(previewBillAppMatch(tier1,[{...late,posted_at:"2026-10-19T03:22:00Z"}],[],Date.parse("2026-10-19T03:23:00Z")).status,"waiting_bank_event");
// A credit event needs the bank's own printed transaction time; pushed-at alone is not proof.
assert.equal(previewBillAppMatch(tier1,[{...app,body:""}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(tier1,[{...app,body:"Agribank: 10:55 19/10/2026 +406,000VND"}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(tier1,[{...app,amount_vnd:10000}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(tier1,[app],[{...bill,media_asset_id:"another-asset"}],now).status,"review");
console.log("BANK-162 bank app + bill preview PASS");
