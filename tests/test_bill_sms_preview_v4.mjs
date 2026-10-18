import assert from "node:assert/strict";
import {readIncomingAgribankSms,previewBillSmsMatch} from "../supabase/functions/v21-bank-bill-event/bill-sms-preview.mjs";
const bill={media_asset_id:"billA",status:"amount_read",amount_vnd:465000,
transaction_nature:"transfer",receiving_name:"BÙI XUÂN TÙNG",
receiving_bank:"AGRIBANK",receiving_account_last5:"99999",
transfer_at_vn:"2026-10-18 19:50",sent_at:"2026-10-18T12:53:00Z"};
const sms={id:1,sender:"VM-AGRIBANK",body:"TK 2901181999999 GD +465,000VND luc 19:50 18/10/2026. So du 3,500,000VND",
received_at:"2026-10-18T12:50:40Z"};
const now=Date.parse("2026-10-18T13:00:00Z");
assert.equal(readIncomingAgribankSms(sms)?.amount_vnd,465000);
assert.equal(previewBillSmsMatch(bill,[sms],[],now).status,"candidate_unique");
assert.equal(previewBillSmsMatch(bill,[sms],[],Date.parse("2026-10-18T12:53:10Z")).status,"waiting_settlement");
assert.equal(previewBillSmsMatch(bill,[{...sms,id:2,body:sms.body.replace("19:50","19:51")},sms],[],now).reason,"multiple_eligible_sms");
assert.equal(previewBillSmsMatch(bill,[sms],[{...bill,media_asset_id:"billB"}],now).reason,"another_customer_or_bill_same_amount_time");
assert.equal(previewBillSmsMatch(bill,[{...sms,body:"TK GD +464,000VND luc 19:50 18/10/2026"}],[],now).status,"waiting_sms");
assert.equal(previewBillSmsMatch({...bill,receiving_bank:"VietinBank"},[sms],[],now).reason,"sms_only_for_agribank_destination");
assert.equal(previewBillSmsMatch({...bill,transfer_at_vn:"2026-10-17 19:50"},[sms],[],now).status,"review");
assert.equal(previewBillSmsMatch({...bill,receiving_account_last5:null},[sms],[],now).status,"review");
assert.equal(readIncomingAgribankSms({...sms,body:"TK +292VND TRA LAI TAI KHOAN luc 19:50 18/10/2026"}),null);
assert.equal(readIncomingAgribankSms({...sms,body:"So du 465000VND"}),null);
assert.equal(readIncomingAgribankSms({...sms,sender:"UNKNOWN"}),null);
assert.equal(readIncomingAgribankSms({...sms,body:"TK +465,000VND luc 19:50 18/10/2026 +292VND"}),null);
console.log("PASS V4 SMS-first preview: 3 times, uniqueness, same-amount conflicts, interest exclusion");
