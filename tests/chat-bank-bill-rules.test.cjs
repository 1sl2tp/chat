/* Run with: node --test tests/chat-bank-bill-rules.test.cjs */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../chat-bank-bill-rules.js');
const raw={
 is_bank_receipt:true,transfer_success:true,amount_vnd:9270000,
 receiving_name:'BUI XUAN TUNG',receiving_account:'2901 181999999',
 receiving_bank:'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
 sending_bank:'Techcombank',
 transaction_datetime_vn:'18 thg 10, 2026 lúc 10:07',
 transfer_reference:'FT26292115078746'
};
const meta={asset_id:'image-A',customer_id:'test',sent_at:'2026-10-18T05:53:47.348936+00:00',image_sha256:'a'.repeat(64)};
function prior(result,id='older'){return {status:'received',id,...result.normalized};}
test('valid bill: 9.270.000 VND produces a -9.270 collection in thousands',()=>{
 const r=rules.evaluate(raw,meta,[]);
 assert.equal(r.status,'received');assert.equal(r.ledger_amount_thousands,-9270);
 assert.equal(r.normalized.receiving_bank,'AGRIBANK');
});
test('identical image hash shared across customers is duplicate',()=>{
 const existing=prior(rules.evaluate(raw,meta));
 const r=rules.evaluate({...raw,transfer_reference:null},{...meta,asset_id:'new',customer_id:'different'},[existing]);
 assert.equal(r.status,'duplicate');assert.equal(r.reason,'duplicate_hash');
 assert.equal(r.ledger_amount_thousands,null);
});
test('same sending bank + reference different image is globally duplicate',()=>{
 const existing=prior(rules.evaluate(raw,meta));
 const r=rules.evaluate(raw,{...meta,asset_id:'other',customer_id:'another',image_sha256:'b'.repeat(64)},[existing]);
 assert.equal(r.status,'duplicate');assert.equal(r.reason,'duplicate_reference');
});
test('same amount but distinct reference/time is not duplicate',()=>{
 const existing=prior(rules.evaluate(raw,meta));
 const r=rules.evaluate({...raw,transfer_reference:'FT26292115078749',transaction_datetime_vn:'18/10/2026 10:20'},
 {...meta,asset_id:'b',image_sha256:'b'.repeat(64)},[existing]);
 assert.equal(r.status,'received');
});
test('transaction reference optional when source hash available',()=>{
 const r=rules.evaluate({...raw,transfer_reference:null},{...meta,asset_id:'new'},[]);
 assert.equal(r.status,'received');
});
test('same amount/minute/recipient different hash means REVIEW, not double-collection',()=>{
 const existing=prior(rules.evaluate(raw,meta));
 const r=rules.evaluate({...raw,transfer_reference:null},{...meta,asset_id:'new',image_sha256:'c'.repeat(64)},[existing]);
 assert.equal(r.status,'review');assert.equal(r.reason,'suspected_same_amount_time');
 assert.equal(r.ledger_amount_thousands,null);
});
test('same byte size and pixels alone do not imply duplicate',()=>{
 const old=prior(rules.evaluate(raw,meta));
 old.width_px=500;old.height_px=659;old.image_size_bytes=37538;
 const r=rules.evaluate({...raw,amount_vnd:2000000,transfer_reference:'FT26292000001',transaction_datetime_vn:'18/10/2026 12:22'},
 {...meta,asset_id:'new',image_sha256:'d'.repeat(64),width_px:500,height_px:659,image_size_bytes:37538},[old]);
 assert.equal(r.status,'received');
});
test('legacy historical reference blocks repeat even though no money was posted',()=>{
 const old={...prior(rules.evaluate(raw,meta)),status:'historical_reference'};
 const r=rules.evaluate(raw,{...meta,asset_id:'test-sent-again',image_sha256:'e'.repeat(64)},[old]);
 assert.equal(r.status,'duplicate');
});
test('17/10 transaction resent on 18/10 is HOLD',()=>{
 const r=rules.evaluate({...raw,amount_vnd:1072000,transaction_datetime_vn:'17 thg 10, 2026 lúc 17:25',transfer_reference:'FT26290879348410'},
 {...meta,asset_id:'f',image_sha256:'f'.repeat(64),sent_at:'2026-10-18T06:32:05.680779+00:00'},[]);
 assert.equal(r.status,'hold');assert.equal(r.reason,'transfer_day_differs_from_sent_day_vn');
});
test('masked account cannot pass',()=>{
 const r=rules.evaluate({...raw,receiving_account:'**** 1999'},meta,[]);
 assert.equal(r.status,'review');
});
test('wrong recipient/name or receiving bank cannot pass',()=>{
 for(const diff of [{receiving_account:'2901181999998'},{receiving_bank:'VietinBank'},{receiving_name:'BUI XUAN NAM'}]){
  const r=rules.evaluate({...raw,...diff},meta,[]);
  assert.equal(r.status,'hold');assert.equal(r.ledger_amount_thousands,null);
 }
});
test('status unknown or missing time goes to REVIEW',()=>{
 assert.equal(rules.evaluate({...raw,transfer_success:null},meta,[]).status,'review');
 assert.equal(rules.evaluate({...raw,transaction_datetime_vn:'18/10/2026'},meta,[]).status,'review');
});
test('preserves leading zeros, validates calendar dates',()=>{
 assert.equal(rules.normalizedReference(' 001 23ABC'),'00123ABC');
 assert.equal(rules.parseTransactionVietnam('2026-10-18 10:07:01').keyMinute,'2026-10-18T10:07');
 assert.equal(rules.parseTransactionVietnam('31/02/2026 10:07'),null);
});

test('QR payment request is not a successful receipt',()=>{
 const qr={is_bank_receipt:false,transfer_success:false,receiving_name:'BUI XUAN TUNG',
  receiving_bank:'VietinBank',receiving_account:'197981999999'};
 const r=rules.evaluate(qr,meta,[]);
 assert.equal(r.status,'ignored');
 assert.equal(r.ledger_amount_thousands,null);
 assert.equal(rules.notification(r.status,r.reason,null,false).kind,'none');
});
test('wrong recipient DO THI THOA is immediately HOLD even when other fields unreadable',()=>{
 const r=rules.evaluate({is_bank_receipt:true,transfer_success:true,amount_vnd:3000000,
  receiving_name:'DO THI THOA',receiving_account:'MS00T06217365102867',
  receiving_bank:'Techcombank',transaction_datetime_vn:'18/10/2026 09:41'},
  {...meta,asset_id:'wrong-bank-destination'},[]);
 assert.equal(r.status,'hold');
 assert.equal(r.reason,'wrong_receiving_name');
 assert.equal(r.ledger_amount_thousands,null);
 assert.equal(rules.notification(r.status,r.reason,null,false).kind,'stop_transfer');
});
test('AI success alone must never produce customer-facing collected notice',()=>{
 const verdict=rules.evaluate(raw,meta,[]);
 assert.equal(verdict.status,'received');
 assert.equal(rules.notification(verdict.status,verdict.reason,verdict.collection_thousands,false).kind,'internal_only');
 const notice=rules.notification(verdict.status,verdict.reason,verdict.collection_thousands,true);
 assert.equal(notice.kind,'collected');
 assert.equal(notice.text,'Đã thu 9.270');
});
test('wrong bank-account pair and partial account do not pass',()=>{
 const wrongPair=rules.evaluate({...raw,receiving_account:'197981999999'},meta,[]);
 assert.equal(wrongPair.status,'hold');
 const cropped=rules.evaluate({...raw,receiving_account:'901 1819 9999 9'},meta,[]);
 assert.equal(cropped.status,'review');
});
test('UTC sent time is normalized to Vietnam date correctly across midnight',()=>{
 assert.equal(rules.vietnamSentDate('2026-10-17T17:03:00.000Z'),'2026-10-18');
 assert.equal(rules.vietnamSentDate('2026-10-18T16:59:59.000Z'),'2026-10-18');
 assert.equal(rules.vietnamSentDate('2026-10-18T17:00:00.000Z'),'2026-10-19');
});
