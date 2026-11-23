// BANK-364: Reconcile ALREADY-scanned no-clock receipts against one independent
// official Agribank transaction minute. No image fetch, AI request or ledger write.
// The SQL financial writer remains the only authority to post a collection.
const ACCOUNT="2901181999999";
const compact=value=>String(value||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
 .toUpperCase().replace(/[^A-Z0-9]/g,"");
const dayOf=timestamp=>{
 const date=new Date(timestamp);
 return Number.isFinite(date.getTime())
  ?new Date(date.getTime()+7*3600000).toISOString().slice(0,10):null;
};
const localClock=raw=>{
 const m=/^Agribank:\s*([01]\d|2[0-3]):([0-5]\d)\s+([0-3]\d)\/([01]\d)\/(20\d{2})\s+Tài khoản\s+(\d{9,20})\s*:\s*\+\s*([\d.,]+)\s*VND\b/i.exec(String(raw||""));
 if(!m||m[6]!==ACCOUNT)return null;
 const iso=`${m[5]}-${m[4]}-${m[3]}T${m[1]}:${m[2]}:00`;
 const millis=Date.parse(iso+"+07:00");
 if(!Number.isFinite(millis)||
    new Date(millis+7*3600000).toISOString().slice(0,19)!==iso)return null;
 const amountText=m[7];
 if(!/^(?:\d{1,12}|\d{1,3}(?:[.,]\d{3})+)$/.test(amountText))return null;
 const amount=Number(amountText.replace(/[.,]/g,""));
 if(!Number.isSafeInteger(amount)||amount<=0)return null;
 const memo=/Nội dung giao dịch:\s*([\s\S]*?)(?:\s*Số dư cuối:|$)/i.exec(raw)?.[1]?.trim()||"";
 return {millis,clock:iso.replace("T"," "),day:iso.slice(0,10),amount,memo};
};
const visibleDay=receipt=>{
 const raw=receipt?.raw_read||{};
 const literal=String(raw.transfer_date_printed_vn||"").trim();
 const match=/^(\d{2})\/(\d{2})\/(20\d{2})$/.exec(literal);
 if(!match)return null;
 const iso=`${match[3]}-${match[2]}-${match[1]}`;
 const t=Date.parse(iso+"T00:00:00+07:00");
 return Number.isFinite(t)&&dayOf(t)===iso&&raw.transfer_date_vn===iso?iso:null;
};
const accountConsistent=receipt=>{
 const raw=receipt?.raw_read||{};
 const full=String(receipt.receiving_account||"").replace(/\D/g,"");
 const suffix=String(raw.recipient_account_last5||"").trim();
 // A single omitted digit is not authorization to change the OCR account.
 // Bank's fully printed destination must independently confirm the account.
 return suffix==="99999"&&full.length>=12&&full.length<=13
  &&full.startsWith(ACCOUNT.slice(0,6))&&full.endsWith("99999")
  &&(full.length!==ACCOUNT.length||full===ACCOUNT);
};
const evidenceSafe=receipt=>{
 const raw=receipt?.raw_read||{};
 const ref=String(receipt.transfer_reference||"").trim();
 return receipt?.ledger_id==null&&
  receipt?.status==="review"&&receipt?.reason==="bill_printed_time_missing"&&
  receipt?.transfer_at_vn==null&&
  Number.isSafeInteger(receipt?.amount_vnd)&&receipt.amount_vnd>0&&
  receipt.amount_vnd%1000===0&&
  /^[A-Za-z0-9][A-Za-z0-9._-]{9,79}$/.test(ref)&&
  raw.rule_version==="bank_bill_amount_v5_20261110"&&
  raw.image_type==="successful_transfer_receipt"&&
  raw.transfer_success_visible===true&&raw.amount_clear===true&&
  raw.transaction_selection==="single_detail"&&raw.transaction_nature==="transfer"&&
  !raw.transfer_time_printed_vn&&
  raw.time_date_conflict!==true&&raw.clock_text_conflict!==true&&
  raw.printed_date_invalid!==true&&raw.ocr_iso_date_conflict!==true&&
  visibleDay(receipt)!==null&&accountConsistent(receipt)&&
  compact(receipt.receiving_name)==="BUIXUANTUNG"&&
  compact(receipt.receiving_bank)==="AGRIBANK"&&
  compact(receipt.sending_bank).length>=3&&
  compact(raw.transfer_content).length>=16;
};
const sameTransfer=(a,b)=>{
 const ar=a?.raw_read||{},br=b?.raw_read||{};
 const senderA=compact(ar.sender_name),senderB=compact(br.sender_name);
 return a?.customer_account_id===b?.customer_account_id&&
  a?.amount_vnd===b?.amount_vnd&&
  compact(a?.transfer_reference)&&
  compact(a.transfer_reference)===compact(b?.transfer_reference)&&
  compact(a?.sending_bank)===compact(b?.sending_bank)&&
  compact(ar.transfer_content)===compact(br.transfer_content)&&
  visibleDay(a)===visibleDay(b)&&
  visibleDay(a)!==null&&
  (!senderA||!senderB||senderA===senderB)&&
  accountConsistent(a)&&accountConsistent(b);
};
/**
 * Return a conservative, deterministic plan for an existing bank-backed case.
 * "eligible" is NOT a receipt or financial permission; the service-role SQL
 * RPC checks the bank clock, memo, customer, duplicates and ledger atomically.
 */
export function planVerifiedNoClockRecovery(receipt,peers,credits,now=Date.now()){
 if(!evidenceSafe(receipt)||!Number.isFinite(now))
  return {status:"review",reason:"receipt_evidence_incomplete"};
 const siblings=[receipt,...(Array.isArray(peers)?peers:[])
  .filter(x=>x?.id!==receipt.id&&sameTransfer(receipt,x))];
 if(siblings.length>20)return {status:"review",reason:"too_many_related_receipts"};
 if(siblings.some(x=>x.status==="received"||x.ledger_id!=null))
  return {status:"review",reason:"transfer_already_collected"};
 // Only review-state siblings can be collapsed. A non-review competing image
 // is not silently overwritten or reclassified as a new transfer.
 if(siblings.some(x=>x.status!=="review"&&x.status!=="duplicate"))
  return {status:"review",reason:"related_receipt_unresolved"};
 const knownSender=compact(receipt.raw_read?.sender_name);
 const matchingCredits=(Array.isArray(credits)?credits:[]).filter(c=>{
  const bank=localClock(c.body);
  if(!bank||c.status!=="credit_candidate"||
     c.package_name!=="com.vnpay.Agribank3g"||
     c.is_own_transfer===true||c.amount_vnd!==receipt.amount_vnd||
     (c.bank_credit_account&&c.bank_credit_account!==ACCOUNT)||
     bank.amount!==receipt.amount_vnd||bank.day!==visibleDay(receipt)||
     bank.day!==dayOf(now)||
     compact(bank.memo)!==compact(receipt.raw_read?.transfer_content))return false;
  const sender=compact(receipt.raw_read?.sender_name);
  if(sender&&(!compact(bank.memo).startsWith(sender)||sender.length<12))return false;
  const sent=Date.parse(receipt.sent_at||"");
  return Number.isFinite(sent)&&sent>=bank.millis-120000&&sent<=bank.millis+15*60000;
 });
 if(matchingCredits.length!==1)
  return {status:"review",reason:"bank_credit_not_unique_or_not_verified"};
 const bank=localClock(matchingCredits[0].body);
 const bankMemo=compact(bank.memo);
 // Distinct same-amount credits in one minute remain ambiguous even if one
 // memo matches. The SQL writer independently checks competing credits.
 const closeCredits=(Array.isArray(credits)?credits:[]).filter(c=>{
  const other=localClock(c.body);
  return c.status==="credit_candidate"&&other&&other.amount===receipt.amount_vnd&&
   Math.abs(other.millis-bank.millis)<=60000;
 });
 if(closeCredits.length!==1)
  return {status:"review",reason:"competing_bank_credits"};
 const eligible=siblings.filter(x=>evidenceSafe(x)&&
  compact(x.raw_read?.sender_name).length>=12&&
  bankMemo.startsWith(compact(x.raw_read.sender_name))&&
  compact(x.raw_read.transfer_content)===bankMemo&&
  Number.isFinite(Date.parse(x.sent_at||""))&&
  Date.parse(x.sent_at)>=bank.millis-120000&&
  Date.parse(x.sent_at)<=bank.millis+15*60000);
 if(!eligible.length)return {status:"review",reason:"sender_not_verified"};
 eligible.sort((a,b)=>
  Number(b.receiving_account===ACCOUNT)-Number(a.receiving_account===ACCOUNT)||
  Date.parse(a.sent_at)-Date.parse(b.sent_at)||
  String(a.id).localeCompare(String(b.id)));
 const canonical=eligible[0];
 // Stronger OCR proof can be on a SECOND image: do not choose first by upload
 // order, and never call Gemini again to make the first image fit.
 if(canonical.id!==receipt.id)return {status:"defer_to_canonical",
  canonical_id:canonical.id,reason:"stronger_existing_bill"};
 return {status:"eligible",canonical_id:canonical.id,
  bank_time_vn:bank.clock,notification_id:matchingCredits[0].id,
  duplicate_ids:siblings.filter(x=>x.id!==canonical.id&&x.status==="review")
   .map(x=>x.id)};
}
