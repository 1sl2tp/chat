import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// BANK-368: user-defined cutover. This is a unit/contract test only.
// It never scans a production image, sends a message, or writes money.
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ingest=file("supabase/functions/v21-agribank-notification-ingest/index.ts");
const bill=file("supabase/functions/v21-bank-bill-event/index.ts");
const marker="2026-11-23T09:58:11.000Z";
assert(ingest.includes(marker),"same forward-only cutover in Agribank ingest");
assert(bill.includes(marker),"same forward-only cutover in bank bill worker");

const cutoffMs=Date.parse(marker);
const billEligible=sentAt=>{
 const t=Date.parse(sentAt||"");
 return Number.isFinite(t)&&t>=cutoffMs;
};
for(const old of [
 "2026-11-15T13:16:00.000Z",
 "2026-11-22T01:14:00.000Z",
 "2026-11-23T09:53:45.868Z",
 "2026-11-23T09:58:10.999Z",
 "",null,"not-an-iso"
])assert.equal(billEligible(old),false,"old/invalid evidence not processed: "+old);
for(const future of [
 "2026-11-23T09:58:11.000Z",
 "2026-11-23T09:58:11.001Z",
 "2026-11-24T00:00:00.000Z",
])assert.equal(billEligible(future),true,"new bill remains eligible: "+future);

const receiptFetch=bill.indexOf('if(jobError||!job)return response({error:"not_queued"},404)');
const earlyGuard=bill.indexOf('originalBillTime<forwardOnlyCutover');
const recovery=bill.indexOf('recoverStoredNoClockBankCredit(db,asset)');
const customerNotice=bill.indexOf('sendMissingClockCustomerReconciliation(db,asset)');
const claim=bill.indexOf('update({status:"scanning"');
const bankCollect=bill.indexOf('db.rpc("chat_bank_app_collect"');
assert(receiptFetch>=0&&receiptFetch<earlyGuard,
 "must validate the original bill record before comparing the cutover");
assert(earlyGuard<recovery&&earlyGuard<customerNotice&&earlyGuard<claim&&earlyGuard<bankCollect,
 "legacy guard MUST precede no-clock recovery, customer notice, OCR and money");
assert.match(bill,/reason:"bank368_legacy_bill_untouched",ai_called:false,\s*ledger_written:false,customer_notified:false/);

const eligibleStart=(windowFrom)=>new Date(Math.max(Date.parse(windowFrom),cutoffMs)).toISOString();
assert.equal(eligibleStart("2026-11-22T23:00:00.000Z"),marker,
 "same-day old bill excluded even when official credit window overlaps it");
assert.equal(eligibleStart("2026-11-23T10:05:00.000Z"),"2026-11-23T10:05:00.000Z",
 "newer bank window remains intact");
assert.match(ingest,/query\.searchParams\.append\("sent_at","gte\."\+\s*new Date\(Math\.max\(Date\.parse\(window\.from\),cutoverMs\)\)\.toISOString\(\)\)/);
assert.match(ingest,/if\(Date\.parse\(window\.to\)<cutoverMs\)return;/);
assert.match(ingest,/recheck_bank_credit:true/);
assert.match(ingest,/if\(amount!==null&&row\.status==="credit_candidate"&&Array\.isArray\(saved\)&&saved\.length===1\)/,
 "ingest must keep accepting new legitimate bank credits independently");
console.log("BANK-368: old bill untouched and future billing remains enabled PASS");
