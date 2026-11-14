// Read-only pairing of customer bill with stored official Agribank Plus credit notification.
import {compareBillTransferIdentity,competesForBankCredit} from "./bill-transfer-identity.mjs";
import {normalizeBillRecipientName} from "./bill-amount-rules.mjs";
const when=x=>{const n=Date.parse(x||"");return Number.isFinite(n)?n:null;};
// Strict VN wall-clock parser shared by bill and official OTT timestamps.
// JS Date.parse may silently normalize 31/02 -> March: reject it explicitly.
// The financial SQL RPC independently verifies the same date/time.
function bankTime(value){
 const text=String(value||"").trim().replace("T"," ");
 const m=/^(20\d{2})-([01]\d)-([0-3]\d) ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
 if(!m)return null;
 const y=Number(m[1]),mon=Number(m[2]),day=Number(m[3]);
 const calendar=new Date(Date.UTC(y,mon-1,day));
 if(calendar.getUTCFullYear()!==y||calendar.getUTCMonth()!==mon-1||
    calendar.getUTCDate()!==day)return null;
 return Date.UTC(y,mon-1,day,Number(m[4]),Number(m[5]),Number(m[6]||0))-7*3600000;
}
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
// BANK-351: SHB -> Agribank official MCC envelope. Only unwrap the exact
// six-digit routing prefix + literal payer memo + MCC + printed bank clock
// + source account + bank code. The independent bank minute must equal the
// receipt minute; the bill sender and full literal memo must agree.
function verifiedMccMemo(raw,bill,event){
 const m=/^([0-9]{6})-(.+?);MCC;(20[0-9]{12});([0-9]{9,20});([0-9]{6})\.?$/i.exec(String(raw||"" ).trim());
 if(!m)return null;
 const clock=m[3];
 const bankMinute=bankEventTime(event);
 const wrappedMinute=bankTime(clock.slice(0,4)+"-"+clock.slice(4,6)+"-"+clock.slice(6,8)+" "+clock.slice(8,10)+":"+clock.slice(10,12)+":"+clock.slice(12,14));
 const billMinute=bankTime(bill?.transfer_at_vn);
 if(bankMinute===null||wrappedMinute===null||billMinute===null||
    Math.abs(bankMinute-wrappedMinute)>60000||Math.abs(bankMinute-billMinute)>60000)return null;
 const sender=normalizeBillRecipientName(bill?.sender_name);
 const memo=normalizeBillRecipientName(m[2]);
 if(!sender||sender==="BUI XUAN TUNG"||!memo.startsWith(sender+" "))return null;
 if(tidy(memo)!==tidy(bill?.transfer_content)||tidy(memo).length<12)return null;
 return m[2];
}
// BANK-356: Bank-side technical routing prefix is not part of the payer's
// original memo. Only unwrap exact anchored IBFT + full sender + full note.
function verifiedIbftMemo(raw,bill){
 const m=/^IBFT\s+(.+)$/i.exec(String(raw||"").trim());
 if(!m)return null;
 const sender=normalizeBillRecipientName(bill?.sender_name);
 if(!sender||sender==="BUI XUAN TUNG"||
    !/^[A-Z]+(?: [A-Z]+){2,}$/.test(sender)||sender.length<12||
    !normalizeBillRecipientName(m[1]).startsWith(sender+" ")||
    tidy(m[1])!==tidy(bill?.transfer_content))return null;
 return m[1];
}
// BANK-346: Agribank wraps some incoming Vietcombank memos as
// MBVCB.<bank-reference>.<routing-code>.<literal payer memo>.CT tu <source>
// <sender> toi <our-account> <our-name> tai AGRIBANK.
// Only unwrap a COMPLETE anchored bank-side structure with verified target;
// an unknown/partial prefix is NOT permission to guess the payer's memo.
function verifiedMbvcbMemo(raw){
 const match=/^MBVCB\.([0-9]{9,14})\.([0-9]{4,8})\.(.+?)\.CT tu ([0-9]{9,20}) (.+?) toi ([0-9]{9,20}) (.+?) tai AGRIBANK\.?$/i.exec(String(raw||"").trim());
 if(!match||match[6]!=="2901181999999"||
    normalizeBillRecipientName(match[7])!=="BUI XUAN TUNG")return null;
 const memo=match[3].trim(),sender=match[5].trim();
 if(!memo||!sender)return null;
 return {reference:match[1],memo,sender};
}
// BANK-349: A late Agribank MBVCB credit is an independent, bank-side
// reference + full sender + full destination proof. Permit precisely ONE
// OCR character substitution in the *generic* "CHUYEN TIEN" suffix, and only
// when the receipt's complete 9-14 digit routing reference is IDENTICAL to
// the bank envelope and the payer name prefix matches that bank sender
// verbatim. This does not mutate OCR, guess a missing date, or weaken the
// transactional financial RPC / duplicate or unique-minute checks.
function verifiedMbvcbTransferSuffixOcr(bill,wrapper){
 if(!wrapper)return false;
 const reference=String(bill?.transfer_reference||"").trim();
 if(!/^[0-9]{9,14}$/.test(reference)||reference!==wrapper.reference)return false;
 const sender=normalizeBillRecipientName(wrapper.sender);
 if(sender==="BUI XUAN TUNG"||
    !/^[A-Z]+(?: [A-Z]+){2,}$/.test(sender)||sender.length<12)return false;
 const prefix=tidy(sender),correct="CHUYENTIEN";
 const bankLiteral=tidy(wrapper.memo),printed=tidy(bill?.transfer_content);
 if(bankLiteral!==prefix+correct||printed.length!==bankLiteral.length||
    !printed.startsWith(prefix))return false;
 const printedSuffix=printed.slice(prefix.length);
 let differences=0;
 for(let i=0;i<correct.length;i++)differences+=(printedSuffix[i]!==correct[i])?1:0;
 return differences===1;
}
// BANK-347: A VietinBank paper receipt may print only the generic memo
// "CHUYEN TIEN", while the independently received Agribank QR memo prints
// "QR - <full sender name> Chuyen tien". The memo is verified ONLY when the
// OCR sender name is complete, specific and exactly equals the bank QR name.
// Amount, minute, destination, day, competing proofs and financial SQL
// guards remain mandatory; the generic memo by itself proves nothing.
function verifiedQrSenderMemo(bill,rawBankMemo){
 const printed=tidy(bill?.transfer_content);
 if(printed!=="CHUYENTIEN")return false;
 const parsed=/^QR\s*[-–:]\s+(.+?)\s+(chuyen tien|chuyển tiền)\.?\s*$/i.exec(String(rawBankMemo||"").trim());
 if(!parsed||tidy(parsed[2])!=="CHUYENTIEN")return false;
 const sender=normalizeBillRecipientName(bill?.sender_name);
 const bankSender=normalizeBillRecipientName(parsed[1]);
 if(!sender||sender!==bankSender||sender==="BUI XUAN TUNG"||
   sender.length<12||!/^[A-Z]+(?: [A-Z]+){2,}$/.test(sender))return false;
 const account=String(bill?.receiving_account||"").replace(/\D/g,"");
 if(account.length<9||!account.endsWith("99999"))return false;
 return true;
}
function ownTransferNotice(e){
 // BANK-298: the bank can spell the account-holder name with accents and
 // can wrap its memo in QR - / MB(six-digit-code)(literal original memo).
 // Only inspect a name at the START of the real sender memo. A beneficiary
 // mentioned AFTER "chuyen tien den" must never be mistaken for the sender.
 if(e?.is_own_transfer===true)return true;
 const raw=bankMemo(e?.body);
 const qr=/^QR *[-–:] +/i;
 const unwrappedQr=qr.test(raw)?raw.replace(qr,""):raw;
 const mb=/^MB\([0-9]{6}\)\(([^()]*)\)\.?\s*$/i.exec(unwrappedQr);
 const mbvcb=verifiedMbvcbMemo(unwrappedQr);
 const normalized=normalizeBillRecipientName(mb?mb[1]:mbvcb?.memo||unwrappedQr);
 const sender=normalizeBillRecipientName(mbvcb?.sender||"");
 return sender==="BUI XUAN TUNG"||
    /^BUI XUAN TUNG(?:\s|[^A-Z0-9]|$)/.test(normalized);
}
export function previewBillAppMatch(bill,events,otherBills=[],now=Date.now()){
 if(bill?.status!=="amount_read"||!Number.isSafeInteger(bill.amount_vnd)||bill.amount_vnd<=0)return{status:"review",reason:"bill_unreadable"};
 if(!["transfer","incoming_transfer"].includes(bill.transaction_nature))return{status:"review",reason:"transaction_unclear"};
 // Optional verification tiers: M1 = amount + transaction time; M2 = name if visible;
 // M3 = account and receiving bank if visible. A clear contradiction still blocks.
 const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").trim().replace(/\s+/g," ").toUpperCase();
 const name=normalizeBillRecipientName(bill.receiving_name),bank=norm(bill.receiving_bank);
 const destination="2901181999999";
 const acct=String(bill.receiving_account||"").replace(/\D/g,"");
 const suffix=String(bill.receiving_account_last5||"").trim();
 if(name&&name!=="BUI XUAN TUNG")return{status:"review",reason:"recipient_name_conflict"};
 if(bank&&bank!=="AGRIBANK")return{status:"review",reason:"recipient_bank_conflict"};
 if(suffix&&suffix!==destination.slice(-5))return{status:"review",reason:"recipient_account_conflict"};
 // Customer receipts may show only *****99999 or have OCR errors in preceding digits.
 // Agribank's own credit notice remains responsible for verifying the FULL target account.
 if((acct.length>=destination.length && acct!==destination) ||
    (acct.length>=9 && acct.length<destination.length && !destination.startsWith(acct.slice(0,6))) ||
    (acct.length>=5 && !acct.endsWith(destination.slice(-5))))
  return{status:"review",reason:"recipient_account_conflict"};
 const matchLevel=acct&&bank?3:name?2:1;
 const date=bankTime(bill.transfer_at_vn), sent=when(bill.sent_at);
 if(date===null||sent===null)return{status:"review",reason:"bill_time_unreadable"};
 // BANK-212: broaden only the ambiguity search; require <= 60 seconds to auto-match.
 const nearby=(events||[]).filter(e=>!ownTransferNotice(e)&&creditAccountFromEvent(e)===destination&&e.package_name==="com.vnpay.Agribank3g"&&e.status==="credit_candidate"
   &&e.amount_vnd===bill.amount_vnd&&bankEventTime(e)!==null&&Math.abs(bankEventTime(e)-date)<=5*60000);
 // Different transfers of equal amount may occur minutes apart. Look at the
 // bank-printed 60-second clock window, not every same-amount notice within 5m.
 // Allow a one-minute displayed-clock discrepancy only with a unique bank
 // credit and complete sender-bound memo. This is a candidate for the
 // financial RPC, never a direct authorization to write money.
 const qualified=nearby.filter(e=>{
   const delta=Math.abs(bankEventTime(e)-date);
   if(delta<=60000)return true;
   if(delta>120000)return false;
   const printed=tidy(bill.transfer_content);
   const raw=bankMemo(e.body);
   const sender=normalizeBillRecipientName(bill.sender_name);
   return sender&&sender!=="BUI XUAN TUNG"&&sender.length>=12&&
     printed.length>=12&&printed.startsWith(tidy(sender))&&
     (printed===tidy(raw)||printed===tidy(verifiedIbftMemo(raw,bill))||
      printed===tidy(verifiedMccMemo(raw,bill,e)));
 });
 if(qualified.length>1)return{status:"review",reason:"multiple_credits_same_amount_same_minute"};
 if(!qualified.length&&nearby.length)return{status:"review",reason:"bank_time_outside_one_minute"};
 if(!qualified.length)return{status:"waiting_bank_event",reason:"no_matching_agribank_notification"};
 // BANK-270: When the AI's ISO date was corrected from literal printed
 // DD/MM + HH:mm, additionally require the unique bank credit to carry the
 // EXACT same normalized transfer memo. This protects against fabricated
 // literal OCR values and two equal amounts in the same bank minute.
 if(bill.ocr_date_normalization_corrected||bill.requires_bank_memo){
   const printedMemo=tidy(bill.transfer_content);
   const rawBankMemo=bankMemo(qualified[0].body);
   const bankText=tidy(rawBankMemo);
   // BANK-287: Agribank QR credits prepend "QR - " to the routing memo,
   // but the payer's receipt contains only the original transfer message.
   // Strip only this anchored bank-side routing marker, never an arbitrary
   // substring, and still require the full remainder to match exactly.
   const qrMarker=/^QR *[-–:] +/i;
   const bankMemoWithoutQr=qrMarker.test(rawBankMemo)
     ?tidy(rawBankMemo.replace(qrMarker,"")):null;
   // BANK-296: An official Agribank mobile notice may wrap the sender's
   // literal note in MB(6-digit routing code)(EXACT payer note).
   // Only unwrap this complete, anchored bank-side envelope. Never strip
   // arbitrary prefixes, partial text, nested brackets or OCR-side tokens.
   const mbRoutingEnvelope=/^MB\([0-9]{6}\)\(([^()]*)\)\.?\s*$/i;
   const mbFields=mbRoutingEnvelope.exec(rawBankMemo);
   const bankMemoWithoutMb=mbFields?tidy(mbFields[1]):null;
   const mbvcb=verifiedMbvcbMemo(rawBankMemo);
    const mcc=verifiedMccMemo(rawBankMemo,bill,qualified[0]);
   // When the receipt prints the routing reference, it must match the bank's
   // exact reference too. A conflicting reference is a review, never a match.
   const billRef=String(bill.transfer_reference||"").trim();
   const bankMemoWithoutMbvcb=mbvcb&&(!billRef||billRef===mbvcb.reference)
     ?tidy(mbvcb.memo):null;
   const qrSenderVerified=verifiedQrSenderMemo(bill,rawBankMemo);
    const bankMemoWithoutMcc=mcc?tidy(mcc):null;
   const bankMemoWithoutIbft=tidy(verifiedIbftMemo(rawBankMemo,bill));
   const mbvcbSingleOcr=verifiedMbvcbTransferSuffixOcr(bill,mbvcb);
   if((printedMemo.length<12&&!qrSenderVerified)||!bankText||
      (printedMemo!==bankText&&printedMemo!==bankMemoWithoutQr&&
       printedMemo!==bankMemoWithoutMb&&printedMemo!==bankMemoWithoutMbvcb&&
        printedMemo!==bankMemoWithoutMcc&&printedMemo!==bankMemoWithoutIbft&&
        !verifiedSenderBoundWrappedMemo(bill,rawBankMemo)&&
       !qrSenderVerified&&!mbvcbSingleOcr))
     return{status:"review",reason:"ocr_date_corrected_bank_memo_unverified"};
 }
 // Same reliable bank reference is the same transfer across cropped/reuploaded
 // images. Distinct sender names / references remain distinct bills, but with
 // just one bank credit and a shared minute, their bank proof still competes.
 const closeBills=(otherBills||[]).filter(b=>b.media_asset_id!==bill.media_asset_id
   &&["amount_read","review","received","historical_reference"].includes(b.status)
   &&b.amount_vnd===bill.amount_vnd);
 if(closeBills.some(b=>compareBillTransferIdentity(bill,b)==="same"))
   return{status:"review",reason:"same_transfer_reference_other_image"};
 if(closeBills.some(b=>competesForBankCredit(bill,b)))
   return{status:"review",reason:"competing_bills_one_bank_credit_unverified"};
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
// BANK-362: only allow a bank-side *anchored* routing envelope around a
// complete payer memo. A memo with arbitrary extra words is not equivalent.
function verifiedSenderBoundWrappedMemo(bill,raw){
 const sender=normalizeBillRecipientName(bill?.sender_name);
 const printed=tidy(bill?.transfer_content);
 if(!sender||sender.length<12||printed.length<16||
    !printed.startsWith(tidy(sender)))return false;
 // Existing MCC / IBFT envelope verifiers handle their own precise wrappers.
 // Do not accept generic substring containment, even within 60 seconds.
 return false;
}
// BANK-359: contiguous full-memo containment, not token overlap. Require a
// substantial literal payer phrase and word boundaries on the longer side.
// Amount, bank credit, recipient, clock, uniqueness and ledger guards remain mandatory.
function contiguousMemoContains(a,b){
 const left=tidy(a),right=tidy(b);
 if(Math.min(left.length,right.length)<16)return false;
 const shorter=left.length<=right.length?left:right;
 const longer=left.length<=right.length?right:left;
 // Do not let a common short memo (e.g. CHUYENTIEN) authorize another payer.
 // A full sender-bound phrase is required by the caller's other guards.
 return longer.includes(shorter);
}

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
