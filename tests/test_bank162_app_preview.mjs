import assert from "node:assert/strict";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
const sent="2026-10-19T03:04:00Z",now=Date.parse("2026-10-19T03:08:00Z");
const bill={media_asset_id:"asset1",status:"amount_read",amount_vnd:406000,
  sent_at:sent,receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
  receiving_account_last5:"99999",transaction_nature:"transfer",
  transfer_at_vn:"2026-10-19 10:02"};
const app={id:20,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 amount_vnd:406000,posted_at:"2026-10-19T03:03:00Z"};
assert.equal(previewBillAppMatch(bill,[app],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch(bill,[],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(bill,[app,app],[],now).status,"review");
assert.equal(previewBillAppMatch(bill,[{...app,amount_vnd:405000}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch({...bill,receiving_account_last5:"11111"},[app],[],now).status,"review");
assert.equal(previewBillAppMatch({...bill,amount_vnd:406000},[app],[{...bill,media_asset_id:"asset2"}],now).status,"review");
console.log("BANK-162 bank app + bill preview PASS");
