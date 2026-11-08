'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261108163000_bank265_sender_only_internal_transfer.sql'),'utf8');
const wake=fs.readFileSync(path.join(root,'supabase/migrations/20261019124000_bank170_wake_only_target_credit_account.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/v21-bank-bill-event/index.ts'),'utf8');
const original='HOANG TRUNG TUAN chuyen tien den BUI XUAN TUNG - 2901181999999';
const internal='BUI XUAN TUNG chuyen tien';
const senderOnly=/^BUI\s+XUAN\s+TUNG(?:\s|[^a-zA-Z0-9]|$)/i;
assert(!senderOnly.test(original),'beneficiary must not be flagged as sender');
assert(senderOnly.test(internal),'actual owner-originated transfer stays excluded');
assert(sql.includes("create or replace function public.chat_agribank_own_transfer"));
assert(sql.includes("~* '^BUI[[:space:]]+XUAN[[:space:]]+TUNG"),'POSIX sender anchor required');
assert(!sql.includes("UPDATE public.taphoa_debt_ledger")&&!sql.includes("insert into public.taphoa_debt_ledger"),'classifier migration must not create a receipt');
assert(sql.includes("security invoker"),'no new privilege escalation');
assert(sql.includes("grant execute on function public.chat_agribank_own_transfer(text) to service_role"));
assert(wake.includes("new.is_own_transfer=true"),'bank notice wake still excludes owner transfers');
assert(edge.includes('.eq("is_own_transfer",false)'),'edge filter remains scoped to verified external credits');
assert(edge.includes('db.rpc("chat_bank_app_collect"'),'only atomic server RPC creates a collection');
console.log('BANK-265: sender-only internal-transfer guard and bank matching safety PASS');


(async()=>{
 const {previewBillAppMatch}=await import('../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs');
 const receipt={media_asset_id:'bank265-receipt',status:'amount_read',amount_vnd:1170000,
  sent_at:'2026-11-08T04:45:56.547Z',transfer_at_vn:'2026-11-08 11:45:00',
  transaction_nature:'transfer',receiving_name:'BUI XUAN TUNG',receiving_bank:'AGRIBANK',
  receiving_account:'2901181999999',receiving_account_last5:'99999'};
 const bank={id:219,package_name:'com.vnpay.Agribank3g',status:'credit_candidate',
  is_own_transfer:false,amount_vnd:1170000,posted_at:'2026-11-08T04:50:39.857Z',
  body:'Agribank: 11:45 08/11/2026 Tài khoản 2901181999999: +1,170,000VND. Nội dung giao dịch: HOANG TRUNG TUAN chuyen tien den BUI XUAN TUNG - 2901181999999. Số dư cuối: 27,900,270VND'};
 const now=Date.parse('2026-11-08T09:30:00Z');
 const found=previewBillAppMatch(receipt,[bank],[],now);
 assert.equal(found.status,'candidate_unique','incoming third-party bill must match one bank credit');
 assert.equal(found.notification_id,219);
 assert.equal(previewBillAppMatch(receipt,[{...bank,is_own_transfer:true}],[],now).status,'waiting_bank_event','db-declared own transfer must still be rejected');
 assert.equal(previewBillAppMatch(receipt,[{...bank,body:bank.body.replace('HOANG TRUNG TUAN chuyen tien den BUI XUAN TUNG - 2901181999999','BUI XUAN TUNG chuyen tien')}],[],now).status,'waiting_bank_event','own-sender memo stays blocked');
 console.log('BANK-265: real third-party beneficiary memo matches; own sender remains blocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
