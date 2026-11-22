// BANK-366: bank-event replay identity, not proof of a customer payment.
// Only a bank-issued FULL transaction clock / destination / transfer amount
// and one literal 14-digit FT reference can ignore Android posted_at_ms.
// This helper never reads a bill, changes a ledger, or authorizes collection.
import {officialCreditWindow} from "./credit-recheck.mjs";
import {parseCredit} from "./credit-parser.mjs";

export function creditReplayIdentity({package_name,title,body,posted_at_ms,amount_vnd}){
 const raw=String(body||"");
 const window=officialCreditWindow(raw);
 const memo=/Nội dung giao dịch:\s*([\s\S]*?)(?:\s*Số dư cuối:|$)/i.exec(raw)?.[1]||"";
 const refs=[...memo.matchAll(/\bFT[0-9]{14}\b/gi)];
 const strong=package_name==="com.vnpay.Agribank3g"&&
   Number.isSafeInteger(amount_vnd)&&amount_vnd>0&&
   parseCredit(title,raw)===amount_vnd&&window!==null&&refs.length===1;
 if(!strong)return{
   strong:false,from:null,to:null,
   fingerprintMaterial:package_name+"\n"+posted_at_ms+"\n"+title+"\n"+body
 };
 // Include the whole original body. Two independent transfers must not be
 // merged just because amount, clock or sender look alike. The FT reference
 // must be both distinctive and identical within the unmodified bank text.
 return {
   strong:true,
   from:window.from,
   to:new Date(Date.parse(window.from)+10*60000).toISOString(),
   fingerprintMaterial:"BANK-366:official-ft\n"+package_name+"\n"+amount_vnd+"\n"+raw.trim()
 };
}
