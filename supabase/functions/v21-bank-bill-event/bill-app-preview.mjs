// Read-only pairing of customer bill with stored official Agribank Plus credit notification.
const when=x=>{const n=Date.parse(x||"");return Number.isFinite(n)?n:null;};
const bankTime=x=>when(String(x||"").replace(" ","T")+"+07:00");
// Prefer Agribank's own transaction time, not Android's potentially delayed push time.
function bankEventTime(event){
 const text=String(event?.body||"");
 const m=/Agribank:\s*([01]\d|2[0-3]):([0-5]\d)\s+([0-3]\d)\/([01]\d)\/(20\d\d)/i.exec(text);
 if(!m)return null; // No printed bank time: cannot authorize money using push arrival alone.
 const t=bankTime(`${m[5]}-${m[4]}-${m[3]} ${m[1]}:${m[2]}`);
 // Android may deliver the OTT notice after the phone is unlocked.
 // The bank-printed transaction time is the matching clock, never posted_at.
 return t;
}
function creditAccountFromEvent(e){
 const text=String(e?.body||"");
 const m=/Tài khoản\s+([0-9]{9,20})\s*:\s*\+/i.exec(text);
 return m?.[1]||null;
}
function ownTransferNotice(e){
 const m=/Nội dung giao dịch:\s*([^\r\n.]+)/i.exec(String(e?.body||""));
 return !!(e?.is_own_transfer===true || (m&&/BUI\s+XUAN\s+TUNG/i.test(m[1])));
}
export function previewBillAppMatch(bill,events,otherBills=[],now=Date.now()){
 if(bill?.status!=="amount_read"||!Number.isSafeInteger(bill.amount_vnd)||bill.amount_vnd<=0)return{status:"review",reason:"bill_unreadable"};
 if(!["transfer","incoming_transfer"].includes(bill.transaction_nature))return{status:"review",reason:"transaction_unclear"};
 // Optional verification tiers: M1 = amount + transaction time; M2 = name if visible;
 // M3 = account and receiving bank if visible. A clear contradiction still blocks.
 const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").trim().replace(/\s+/g," ").toUpperCase();
 const name=norm(bill.receiving_name),bank=norm(bill.receiving_bank);
 const destination="2901181999999";
 const acct=String(bill.receiving_account||"").replace(/\D/g,"");
 const suffix=String(bill.receiving_account_last5||"").trim();
 if(name&&name!=="BUI XUAN TUNG")return{status:"review",reason:"recipient_name_conflict"};
 if(bank&&bank!=="AGRIBANK")return{status:"review",reason:"recipient_bank_conflict"};
 if(suffix&&suffix!==destination.slice(-5))return{status:"review",reason:"recipient_account_conflict"};
 // Customer receipts may show only *****99999 or have OCR errors in preceding digits.
 // Agribank's own credit notice remains responsible for verifying the FULL target account.
 if(acct.length>=5 && !acct.endsWith(destination.slice(-5)))
  return{status:"review",reason:"recipient_account_conflict"};
 const matchLevel=acct&&bank?3:name?2:1;
 const date=bankTime(bill.transfer_at_vn), sent=when(bill.sent_at);
 if(date===null||sent===null)return{status:"review",reason:"bill_time_unreadable"};
 // BANK-212: broaden only the ambiguity search; require <= 60 seconds to auto-match.
 const nearby=(events||[]).filter(e=>!ownTransferNotice(e)&&creditAccountFromEvent(e)===destination&&e.package_name==="com.vnpay.Agribank3g"&&e.status==="credit_candidate"
   &&e.amount_vnd===bill.amount_vnd&&bankEventTime(e)!==null&&Math.abs(bankEventTime(e)-date)<=5*60000);
 if(nearby.length>1)return{status:"review",reason:"multiple_matching_agribank_notifications"};
 const qualified=nearby.filter(e=>Math.abs(bankEventTime(e)-date)<=60000);
 if(!qualified.length&&nearby.length)return{status:"review",reason:"bank_time_outside_one_minute"};
 if(!qualified.length)return{status:"waiting_bank_event",reason:"no_matching_agribank_notification"};
 if((otherBills||[]).some(b=>b.media_asset_id!==bill.media_asset_id&&b.status==="amount_read"&&
    b.amount_vnd===bill.amount_vnd&&Math.abs(bankTime(b.transfer_at_vn)-date)<=5*60000))
   return{status:"review",reason:"another_bill_same_time_amount"};
 // BANK-164: no scheduler is required; uniqueness is rechecked transactionally by
 // the database before any collection. Do not leave this bill permanently waiting.
 if(sent>now+2*60000)return{status:"review",reason:"future_upload_metadata"};
 return{status:"candidate_unique",source:"agribank_plus_notification",notification_id:qualified[0].id,
   matched_amount_vnd:bill.amount_vnd,match_level:matchLevel,bank_confirmed:false,ledger_written:false};
}

// BANK-182: Alternative proof when the printed bill has a clear DATE but no
// time. Both sides must carry the same exact transfer memo AND a common,
// distinctive transaction reference. Chat upload timestamp is not evidence.
const tidy=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]/g,"");
const BANK_REF=/^[A-Za-z0-9][A-Za-z0-9._-]{9,79}$/;
function bankMemo(body){
 const s=String(body||"");
 const m=/Nội dung giao dịch:\s*([\s\S]*?)(?:\s*Số dư cuối:|$)/i.exec(s);
 return m?.[1]?.trim()||"";
}
function sharedBankReference(reference,memo){
 const ref=String(reference||"").trim();
 if(!BANK_REF.test(ref)||!/\d{6,}/.test(ref)||!/[A-Za-z]/.test(ref))return false;
 const raw=String(memo||"").toUpperCase(),target=ref.toUpperCase();
 const at=raw.indexOf(target);
 if(at<0)return false;
 // The exact OCR reference must be delimited in the transfer memo.
 return at===0||!/[\dA-Z]/.test(raw[at-1])
   ?(at+target.length===raw.length||!/[\dA-Z]/.test(raw[at+target.length]))
   :false;
}
export function previewBillReferenceMatch(bill,events,otherBills=[],now=Date.now()){
 if(bill?.status!=="amount_read"||!Number.isSafeInteger(bill.amount_vnd)||bill.amount_vnd<=0
   ||!["transfer","incoming_transfer"].includes(bill.transaction_nature)
   ||bill.transfer_at_vn)return{status:"review",reason:"reference_path_not_applicable"};
 const sent=when(bill.sent_at);
 const billDay=String(bill.transfer_date_vn||"");
 const ref=String(bill.transfer_reference||"").trim();
 const memo=String(bill.transfer_content||"").trim();
 const destination="2901181999999";
 if(sent===null||sent>now+120000||!/^\d{4}-\d{2}-\d{2}$/.test(billDay)
   ||billDay!==new Date(sent+7*3600000).toISOString().slice(0,10)
   ||billDay!==new Date(now+7*3600000).toISOString().slice(0,10))
   return{status:"review",reason:"bill_date_missing_or_not_current"};
 const account=String(bill.receiving_account||"").replace(/\D/g,"");
 const suffix=String(bill.receiving_account_last5||"");
 const name=tidy(bill.receiving_name),bank=tidy(bill.receiving_bank);
 if((name&&name!=="BUIXUANTUNG")||(bank&&bank!=="AGRIBANK")||
   (suffix&&suffix!=="99999")||(account.length>=5&&!account.endsWith("99999")))
   return{status:"review",reason:"recipient_conflict"};
 if(memo.length<12||tidy(memo).length<12||!sharedBankReference(ref,memo))
   return{status:"review",reason:"reference_or_memo_unreadable"};
 const eligible=(events||[]).filter(e=>{
   const stamp=bankEventTime(e);
   const bankDay=stamp===null?"":new Date(stamp+7*3600000).toISOString().slice(0,10);
   return e.package_name==="com.vnpay.Agribank3g"&&e.status==="credit_candidate"
     &&!ownTransferNotice(e)&&creditAccountFromEvent(e)===destination
     &&e.amount_vnd===bill.amount_vnd&&bankDay===billDay
     &&tidy(bankMemo(e.body))===tidy(memo)
     &&sharedBankReference(ref,bankMemo(e.body));
 });
 if(eligible.length!==1)return{status:"review",
   reason:eligible.length?"multiple_matching_reference_events":"no_matching_shared_reference"};
 if((otherBills||[]).some(b=>b.media_asset_id!==bill.media_asset_id
   &&["amount_read","review","received"].includes(b.status)
   &&b.amount_vnd===bill.amount_vnd
   &&(tidy(b.transfer_reference)===tidy(ref) ||
      (b.raw_read?.transfer_content&&tidy(b.raw_read.transfer_content)===tidy(memo)))))
   return{status:"review",reason:"multiple_bills_share_reference"};
 // Financial writer does not yet authorize a missing printed clock.
 // Keep unique proof for Admin review rather than claiming "received".
 return{status:"review",reason:"reference_and_memo_verified_waiting_financial_guard",
   source:"agribank_plus_notification",notification_id:eligible[0].id,
   matched_amount_vnd:bill.amount_vnd,match_level:4,
   match_method:"reference_and_memo_no_time",
   bank_confirmed:true,ledger_written:false};
}
