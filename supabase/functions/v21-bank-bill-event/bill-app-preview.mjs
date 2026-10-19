// Read-only pairing of customer bill with stored official Agribank Plus credit notification.
const when=x=>{const n=Date.parse(x||"");return Number.isFinite(n)?n:null;};
const bankTime=x=>when(String(x||"").replace(" ","T")+"+07:00");
// Prefer Agribank's own transaction time, not Android's potentially delayed push time.
function bankEventTime(event){
 const text=String(event?.body||"");
 const m=/Agribank:\s*([01]\d|2[0-3]):([0-5]\d)\s+([0-3]\d)\/([01]\d)\/(20\d\d)/i.exec(text);
 if(!m)return null; // No printed bank time: cannot authorize money using push arrival alone.
 const t=bankTime(`${m[5]}-${m[4]}-${m[3]} ${m[1]}:${m[2]}`);
 const posted=when(event?.posted_at);
 return t!==null&&posted!==null&&Math.abs(posted-t)<=15*60000?t:null;
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
 if(acct&&acct!==destination&&!(acct.length>=11&&acct.length<destination.length&&
   (destination.startsWith(acct)||destination.endsWith(acct))))
  return{status:"review",reason:"recipient_account_conflict"};
 const matchLevel=acct&&bank?3:name?2:1;
 const date=bankTime(bill.transfer_at_vn), sent=when(bill.sent_at);
 if(date===null||sent===null||date>sent+2*60000||sent-date>20*60000)return{status:"review",reason:"bill_time_invalid"};
 if(now-sent>36*3600000)return{status:"review",reason:"stale_bill"};
 const qualified=(events||[]).filter(e=>e.package_name==="com.vnpay.Agribank3g"&&e.status==="credit_candidate"
   &&e.amount_vnd===bill.amount_vnd&&bankEventTime(e)!==null&&Math.abs(bankEventTime(e)-date)<=5*60000
   &&when(e.posted_at)!==null&&when(e.posted_at)<=sent+15*60000);
 if(!qualified.length)return{status:"waiting_bank_event",reason:"no_matching_agribank_notification"};
 if(qualified.length>1)return{status:"review",reason:"multiple_matching_agribank_notifications"};
 if((otherBills||[]).some(b=>b.media_asset_id!==bill.media_asset_id&&b.status==="amount_read"&&
    b.amount_vnd===bill.amount_vnd&&Math.abs(bankTime(b.transfer_at_vn)-date)<=5*60000))
   return{status:"review",reason:"another_bill_same_time_amount"};
 // BANK-164: no scheduler is required; uniqueness is rechecked transactionally by
 // the database before any collection. Do not leave this bill permanently waiting.
 if(sent>now+2*60000)return{status:"review",reason:"future_bill_time"};
 return{status:"candidate_unique",source:"agribank_plus_notification",notification_id:qualified[0].id,
   matched_amount_vnd:bill.amount_vnd,match_level:matchLevel,bank_confirmed:false,ledger_written:false};
}