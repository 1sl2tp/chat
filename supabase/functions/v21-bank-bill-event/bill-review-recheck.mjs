// BANK-293: bounded receipt-pixel re-read AFTER an independent bank credit.
// At most TWO additional AI reads in total (attempt_count 1 -> 2 -> 3),
// including the documented correction for Techcombank's abbreviated 'thg'.
// This check itself never creates a financial record.
export function eligibleForPrintedDateRescan(job,receipt,now=Date.now()){
 const fields=receipt?.raw_read||{};
 const sent=Date.parse(String(job?.sent_at||""));
 const scanned=Date.parse(String(job?.scanned_at||""));
 const tx=String(receipt?.transfer_at_vn||"");
 const txMs=Date.parse(tx.replace(" ","T")+"+07:00");
 const vnDate=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
 const bankClock=tx.slice(11,16);
 const visibleClock=/^(?:lúc\s+)?([01]?\d|2[0-3]):([0-5]\d)$/i
   .exec(String(fields.transfer_time_printed_vn||"").trim());
 if(job?.status!=="review"||job?.reason!=="bill_printed_datetime_conflict"
   ||(Number(job?.attempt_count)!==1&&Number(job?.attempt_count)!==2)||receipt?.ledger_id!=null
   ||fields.rule_version!=="bank_bill_amount_v5_20261110"
   ||fields.printed_date_invalid!==true
   ||fields.transfer_date_printed_vn
   ||fields.time_date_conflict===true||fields.clock_text_conflict===true
   ||fields.ocr_iso_date_conflict===true
   ||fields.image_type!=="successful_transfer_receipt"
   ||fields.transaction_nature!=="transfer"
   ||fields.transaction_selection!=="single_detail"
   ||fields.transfer_success_visible!==true||fields.amount_clear!==true
   ||receipt?.receiving_account!=="2901181999999"
   ||receipt?.receiving_bank!=="AGRIBANK"
   ||!Number.isSafeInteger(receipt?.amount_vnd)||receipt.amount_vnd<1000
   ||!fields.transfer_content||String(fields.transfer_content).trim().length<12
   ||!Number.isFinite(now)||!Number.isFinite(sent)||!Number.isFinite(scanned)
   ||!Number.isFinite(txMs)||!visibleClock
   ||String(visibleClock[1]).padStart(2,"0")+":"+visibleClock[2]!==bankClock
   ||fields.transfer_date_vn!==tx.slice(0,10)
   ||now<scanned||now-scanned<15000
   ||now-sent>24*3600000||sent>now+120000
   ||Math.abs(sent-txMs)>30*60000
   ||vnDate(sent)!==vnDate(now)||vnDate(txMs)!==vnDate(now))
  return false;
 return true;
}
