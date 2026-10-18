/** TAPHOA V4: NON-AUTHORITATIVE SMS/bill matching preview. No database or ledger writes. */
const INTEREST=/(?:\bLAI\b|TRA LAI|TIEN LAI|HOAN PHI|PHI DICH VU|HOAN TIEN|DIEU CHINH)/;
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toUpperCase();
const parsableMoney=s=>{
 let x=String(s).trim().replace(/[ ,.\u00a0]/g,"");
 return /^\d{1,12}$/.test(x)&&Number(x)>0&&Number(x)<1e12?Number(x):null;
};
function vietTime(s){
 if(typeof s!=="string")return null;
 let t=s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
 if(t)return validDate(+t[1],+t[2],+t[3],+t[4],+t[5],+(t[6]||0));
 t=s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 if(t)return validDate(+t[3],+t[2],+t[1],+t[4],+t[5],+(t[6]||0));
 t=s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
 if(t)return validDate(+t[6],+t[5],+t[4],+t[1],+t[2],+(t[3]||0));
 return null;
}
function validDate(y,m,d,h,min,sec){
 if(y<2020||y>2100||m<1||m>12||h>23||min>59||sec>59)return null;
 const z=new Date(Date.UTC(y,m-1,d));
 if(z.getUTCFullYear()!==y||z.getUTCMonth()!==m-1||z.getUTCDate()!==d)return null;
 return Date.UTC(y,m-1,d,h-7,min,sec);
}
// AGRIBANK uses HH:mm DD/MM without a year. Resolve against APK's timestamp, VN timezone.
function bankSmsTimeWithoutYear(msg,sms){
 const t=msg.match(/(?:^|[^0-9])([01]?\d|2[0-3]):([0-5]\d)\s+([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-](20\d{2}))?(?=\D|$)/);
 if(!t)return null;
 const received=Number(sms?.sms_timestamp_ms);
 if(!Number.isSafeInteger(received)||received<1600000000000||received>Date.now()+86400000)return null;
 const y=Number(new Intl.DateTimeFormat("en",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric"}).format(new Date(received)));
 const years=t[5]?[Number(t[5])]:[y-1,y,y+1];
 let closest=null,distance=Infinity;
 for(const year of years){
   const at=validDate(year,Number(t[4]),Number(t[3]),Number(t[1]),Number(t[2]),0);
   if(at!==null&&Math.abs(at-received)<distance){closest=at;distance=Math.abs(at-received);}
 }
 return distance<=24*3600000?closest:null;
}
export function readIncomingAgribankSms(sms){
 const sender=norm(sms?.sender).trim();
 if(!/^(AGRIBANK|[A-Z]{2}-AGRIBANK)$/.test(sender))return null;
 const msg=norm(sms?.body);
 if(!msg||msg.length>2400||INTEREST.test(msg)||/(?:OTP|MA XAC THUC|MAT KHAU|PASSWORD|MA PIN)/.test(msg))return null;
 // Credit sign MUST precede a money value, or an explicit credit label
 // must be adjacent; balances with no signed transaction cannot be matched.
 const transactionText=msg.split(/\b(?:SD|SO DU)\s*:/)[0];
 const matches=[...transactionText.matchAll(/(^|[^\d])\+\s*(\d{1,3}(?:[., ]\d{3})+|\d{1,12})\s*(?:VND|DONG|D\b|₫)?/g)];
 const candidates=[...new Set(matches.map(m=>parsableMoney(m[2])).filter(Boolean))];
 if(candidates.length!==1)return null;
 const time=vietTime(msg)??bankSmsTimeWithoutYear(msg,sms);
 const statedBankAccount=msg.match(/(?:SO TK|SO TAI KHOAN|\bTK\b)[:\s]*([0-9*X]{5,22})/);
 const visible=statedBankAccount?.[1]||"";
 const acctSuffix=(visible.match(/(\d{5})$/)||[])[1]||null;
 const received=Date.parse(sms?.received_at||"");
 return {id:sms.id,amount_vnd:candidates[0],transaction_at_ms:time,
   sms_received_at_ms:Number.isFinite(received)?received:Number(sms?.sms_timestamp_ms)||null,
   receiving_account_last5:acctSuffix};
}
export function previewBillSmsMatch(bill,smsRows,otherBills=[],now=Date.now()){
 if(bill?.status!=="amount_read"||!Number.isSafeInteger(bill?.amount_vnd)||bill.amount_vnd<=0)
  return {status:"review",reason:"bill_amount_not_ready"};
 if(bill?.transaction_nature!=="transfer"&&bill?.transaction_nature!=="incoming_transfer")
  return {status:"review",reason:"transaction_kind_unclear"};
 if(norm(bill.receiving_name).replace(/\s+/g," ").trim()!=="BUI XUAN TUNG")
  return {status:"review",reason:"recipient_name_missing_or_wrong"};
 if(norm(bill.receiving_bank).trim()!=="AGRIBANK")
  return {status:"review",reason:"sms_only_for_agribank_destination"};
 const last5=bill.receiving_account_last5||bill.receiving_account?.slice(-5)||null;
 if(last5!=="99999")return{status:"review",reason:"receiving_account_suffix_unconfirmed"};
 const billTime=vietTime(bill.transfer_at_vn||"");
 const chatTime=Date.parse(bill.sent_at||"");
 if(!Number.isFinite(billTime)||!Number.isFinite(chatTime))
  return {status:"review",reason:"bill_or_chat_time_missing"};
 if(billTime>chatTime+2*60000||chatTime-billTime>20*60000)
  return {status:"review",reason:"bill_chat_time_out_of_range"};
 if(now-chatTime>36*3600000)
  return {status:"review",reason:"old_chat_bill"};
 const qualified=(smsRows||[]).map(readIncomingAgribankSms).filter(Boolean)
   .filter(s=>s.amount_vnd===bill.amount_vnd)
   .filter(s=>s.transaction_at_ms!==null)
   .filter(s=>Math.abs(s.transaction_at_ms-billTime)<=5*60000)
   .filter(s=>s.sms_received_at_ms!==null&&s.sms_received_at_ms<=chatTime+10*60000
              &&s.sms_received_at_ms>=billTime-3*60000)
   .filter(s=>!s.receiving_account_last5||s.receiving_account_last5===last5);
 if(qualified.length===0)return{status:"waiting_sms",reason:"no_exact_amount_and_three_times",sms_count:0};
 if(qualified.length!==1)return{status:"review",reason:"multiple_eligible_sms",sms_count:qualified.length};
 const competing=(otherBills||[]).filter(o=>
   o.media_asset_id!==bill.media_asset_id&&o.status==="amount_read"&&o.amount_vnd===bill.amount_vnd)
   .filter(o=>{
     const otherAt=vietTime(o.transfer_at_vn||"");
     const chat=Date.parse(o.sent_at||"");
     return otherAt!==null&&Math.abs(otherAt-qualified[0].transaction_at_ms)<=5*60000
       &&Number.isFinite(chat)&&Math.abs(chat-chatTime)<=20*60000;
   });
 if(competing.length)return{status:"review",reason:"another_customer_or_bill_same_amount_time",competing_bill_count:competing.length};
 if(now-chatTime<2*60000)return{status:"waiting_settlement",reason:"await_more_bill_messages"};
 return{status:"candidate_unique",reason:"three_times_exact_amount_single_candidate",
   sms_id:qualified[0].id,matched_amount_vnd:bill.amount_vnd,ledger_written:false,
   bank_confirmed:false};
}
