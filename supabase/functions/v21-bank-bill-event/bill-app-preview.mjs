// Read-only pairing of customer bill with stored official Agribank Plus credit notification.
const when=x=>{const n=Date.parse(x||"");return Number.isFinite(n)?n:null;};
const bankTime=x=>when(String(x||"").replace(" ","T")+"+07:00");
export function previewBillAppMatch(bill,events,otherBills=[],now=Date.now()){
 if(bill?.status!=="amount_read"||!Number.isSafeInteger(bill.amount_vnd)||bill.amount_vnd<=0)return{status:"review",reason:"bill_unreadable"};
 if(!["transfer","incoming_transfer"].includes(bill.transaction_nature))return{status:"review",reason:"transaction_unclear"};
 if(String(bill.receiving_name||"").trim().replace(/\s+/g," ").toUpperCase()!=="BUI XUAN TUNG"||String(bill.receiving_bank||"").trim().toUpperCase()!=="AGRIBANK")
  return{status:"review",reason:"recipient_unverified"};
 const last5=bill.receiving_account_last5||bill.receiving_account?.slice(-5)||null;
 if(last5!=="99999")return{status:"review",reason:"recipient_account_unverified"};
 const date=bankTime(bill.transfer_at_vn), sent=when(bill.sent_at);
 if(date===null||sent===null||date>sent+2*60000||sent-date>20*60000)return{status:"review",reason:"bill_time_invalid"};
 if(now-sent>36*3600000)return{status:"review",reason:"stale_bill"};
 const qualified=(events||[]).filter(e=>e.package_name==="com.vnpay.Agribank3g"&&e.status==="credit_candidate"
   &&e.amount_vnd===bill.amount_vnd&&when(e.posted_at)!==null&&Math.abs(when(e.posted_at)-date)<=5*60000
   &&when(e.posted_at)<=sent+10*60000);
 if(!qualified.length)return{status:"waiting_bank_event",reason:"no_matching_agribank_notification"};
 if(qualified.length>1)return{status:"review",reason:"multiple_matching_agribank_notifications"};
 if((otherBills||[]).some(b=>b.media_asset_id!==bill.media_asset_id&&b.status==="amount_read"&&
    b.amount_vnd===bill.amount_vnd&&Math.abs(bankTime(b.transfer_at_vn)-date)<=5*60000))
   return{status:"review",reason:"another_bill_same_time_amount"};
 if(now-sent<2*60000)return{status:"waiting_settlement",reason:"checking_other_bills"};
 return{status:"candidate_unique",source:"agribank_plus_notification",notification_id:qualified[0].id,
   matched_amount_vnd:bill.amount_vnd,bank_confirmed:false,ledger_written:false};
}