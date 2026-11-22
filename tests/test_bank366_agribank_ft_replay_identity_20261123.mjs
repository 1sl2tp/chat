import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {creditReplayIdentity} from "../supabase/functions/v21-agribank-notification-ingest/credit-replay-identity.mjs";

const package_name="com.vnpay.Agribank3g";
const title="Agribank";
const make=(reference,amount="360,000",clock="08:14",day="22/11/2026",account="2901181999999")=>
 `Agribank: ${clock} ${day} Tài khoản ${account}: +${amount}VND. Nội dung giao dịch: Trang Tuan chuyen khoan nhanh qua Zalo ${reference}. Số dư cuối: 10,000VND`;
const body=make("FT26327204990536");
const identity=(body,posted_at_ms,amount_vnd=360000)=>creditReplayIdentity({
 package_name,title,body,posted_at_ms,amount_vnd
});
const first=identity(body,Date.parse("2026-11-22T01:14:57Z"));
const replay=identity(body,Date.parse("2026-11-22T01:34:30Z"));
assert.equal(first.strong,true);
assert.equal(replay.strong,true);
assert.equal(first.fingerprintMaterial,replay.fingerprintMaterial,
 "same official FT + account + amount + bank minute despite different Android push time");
assert.equal(identity(make("FT26327204990536","361,000"),Date.now(),360000).strong,false,
 "discrepant amount argument must not authorize stable bank identity");
assert.equal(first.from,"2026-11-22T01:09:00.000Z");
assert.equal(first.to,"2026-11-22T01:19:00.000Z");
assert.notEqual(first.fingerprintMaterial,identity(make("FT26327204990537"),Date.now()).fingerprintMaterial,
 "two distinct FT references must never be collapsed even in the same minute");
assert.notEqual(first.fingerprintMaterial,identity(make("FT26327204990536","361,000"),Date.now(),361000).fingerprintMaterial);
assert.notEqual(first.fingerprintMaterial,identity(make("FT26327204990536","360,000","08:15"),Date.now()).fingerprintMaterial);
assert.notEqual(first.fingerprintMaterial,identity(make("FT26327204990536","360,000","08:14","23/11/2026"),Date.now()).fingerprintMaterial);
assert.notEqual(first.fingerprintMaterial,identity(make("FT26327204990536","360,000","08:14","22/11/2026","2901181999998"),Date.now()).fingerprintMaterial);

for(const invalid of [
 make("chuyen tien"),
 make("FT26327204990536 FT26327204990537"),
 make("FT26327204990536","360,000","08:14","31/02/2026"),
 "Nội dung giao dịch: FT26327204990536 +360,000VND",
 make("FT26327204990536").replace("Nội dung giao dịch:","Thông báo:")
]){
 const old=identity(invalid,1000),next=identity(invalid,2000);
 assert.equal(old.strong,false,"uncertain bank proof must remain non-deduplicable");
 assert.notEqual(old.fingerprintMaterial,next.fingerprintMaterial,
  "no FT, invalid date, multiple FTs or uncertain target must not collapse replays");
}
const importer=readFileSync(new URL("../supabase/functions/v21-agribank-notification-ingest/index.ts",import.meta.url),"utf8");
assert.ok(importer.includes("creditReplayIdentity({package_name,title,body,posted_at_ms,amount_vnd:amount})"));
assert.ok(importer.includes("await sha(identity.fingerprintMaterial)"));
assert.ok(importer.includes('lookup.searchParams.set("amount_vnd","eq."+amount)'));
assert.ok(importer.includes('lookup.searchParams.append("transfer_at","gte."+identity.from)'));
assert.ok(importer.includes('lookup.searchParams.append("transfer_at","lte."+identity.to)'));
assert.ok(importer.includes('String(entry?.body||"").trim()===body.trim()'));
assert.ok(importer.includes('error:"bank_replay_check_incomplete"'));
assert.ok(importer.includes('error:"bank_replay_check_unavailable"'));
assert.ok(importer.includes('stored:false,duplicate:true'));
assert.ok(importer.includes("EdgeRuntime.waitUntil(recheckNewCredit(body,amount)"));
assert.ok(!importer.includes("delete from taphoa_agribank_notifications"));
console.log("BANK-366 stable bank FT identity, old replay guard, distinct transfers, fail closed PASS");
