// BANK-214: Two equal-amount bills are NOT the same transfer by default.
// Identity: bank + sender + bank reference + transaction date/time, not amount alone.
// This helper never authorizes a financial collection.
const canonical=s=>String(s||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
 .toUpperCase().trim().replace(/\s+/g," ");
const key=s=>canonical(s).replace(/\s+/g,"");
const clock=s=>{
 const v=String(s||"").trim();
 if(!/^20\d\d-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(v))return null;
 const n=Date.parse(v.replace(" ","T")+"+07:00");
 return Number.isFinite(n)?n:null;
};
const ref=s=>{const x=key(s);return /^[A-Z0-9][A-Z0-9._-]{7,79}$/.test(x)?x:"";};
const billData=b=>({
 amount:Number(b?.amount_vnd)||0,
 reference:ref(b?.transfer_reference),
 sender:canonical(b?.sender_name||b?.raw_read?.sender_name),
 bank:canonical(b?.sending_bank||b?.raw_read?.sending_bank),
 time:clock(b?.transfer_at_vn),
 date:String(b?.transfer_at_vn||b?.transfer_date_vn||b?.raw_read?.transfer_date_vn||"").slice(0,10),
 sha:String(b?.image_sha256||"")
});
// "same" requires a reliable same reference and compatible origin.
// "distinct" may be established by different trustworthy references,
// sender names, sender banks, or nonoverlapping transaction times.
// "unknown" remains review-only, never a proven duplicate or payment.
export function compareBillTransferIdentity(first,second){
 const a=billData(first),b=billData(second);
 if(a.amount<=0||b.amount<=0||a.amount!==b.amount)return "distinct";
 if(a.sha&&b.sha&&a.sha===b.sha)return "same";
 if(a.reference&&b.reference&&a.reference!==b.reference)return "distinct";
 if(a.bank&&b.bank&&a.bank!==b.bank)return "distinct";
 if(a.sender&&b.sender&&a.sender!==b.sender)return "distinct";
 if(a.date&&b.date&&a.date!==b.date)return "distinct";
 if(a.reference&&b.reference&&a.reference===b.reference&&a.date&&a.date===b.date)
   return "same";
 if(a.time!==null&&b.time!==null&&Math.abs(a.time-b.time)>60000)return "distinct";
 return "unknown";
}
// Distinct bills can still compete for ONE received-credit proof.
// Without a bank-side shared reference or a uniquely discriminating bank
// memo, amount + clock cannot assign a single credit among two bills.
export function competesForBankCredit(first,second){
 const a=billData(first),b=billData(second);
 return a.amount>0&&a.amount===b.amount&&a.time!==null&&b.time!==null
   &&Math.abs(a.time-b.time)<=60000;
}
