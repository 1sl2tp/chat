// BANK-367: Bank-ingest duplicate identity. The Android posted-at timestamp
// changes when the SAME bank notice is replayed, so transport fingerprint
// alone does not identify one underlying credit.
// Fail closed: only the entire byte-for-byte BANK text (including balance),
// same official bank minute, exact destination and amount are the same notice.
// No approximate memo / amount-only / same-clock deduplication is allowed.
import {officialCreditWindow} from "./credit-recheck.mjs";
export function sameOfficialCreditNotice(existing,body,amount){
 const incomingWindow=officialCreditWindow(body);
 const existingWindow=officialCreditWindow(existing?.body);
 return Number.isSafeInteger(amount)&&amount>0&&incomingWindow!==null&&
   existingWindow!==null&&incomingWindow.from===existingWindow.from&&
   existing?.package_name==="com.vnpay.Agribank3g"&&
   existing?.status==="credit_candidate"&&
   existing?.is_own_transfer!==true&&
   existing?.bank_credit_account==="2901181999999"&&
   existing.amount_vnd===amount&&
   typeof existing.body==="string"&&existing.body===body;
}
export function exactCreditMinuteWindow(body){
 const window=officialCreditWindow(body);
 if(!window)return null;
 // officialCreditWindow.from is the bank's own minute -5.
 const t=Date.parse(window.from)+5*60000;
 if(!Number.isFinite(t))return null;
 return {from:new Date(t).toISOString(),to:new Date(t+59999).toISOString()};
}
