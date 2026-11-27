// FINANCE-NOTICE-ROOT-01 candidate. Pure projection of committed receipt, never posts money.
const integer=v=>typeof v==='number'&&Number.isSafeInteger(v);
export function financeReceiptSnapshot(event,proof,{imagePolicy=false}={}){
 if(event?.ok!==true||event.notice_sent!==true||!proof||proof.authorized!==true||
    proof.messageLive!==true||proof.recipientMatch!==true||proof.senderMatch!==true||
    proof.commandMatch!==true||proof.ledgerMatch!==true||proof.eventMatch!==true)return {state:'blocked'};
 if(imagePolicy!==true)return {state:'text_only'};
 const {amount_vnd:a,movement:m,balance_before_vnd:b,balance_after_vnd:c,receipt_kind:k}=event;
 if(![a,m,b,c].every(integer)||a<=0||!['collection','payment'].includes(k)||
    m!==(k==='collection'?-a:a)||c-b!==m)return {state:'review'};
 if(event.source==='manual_cash'&&(!integer(event.source_amount_vnd)||event.source_amount_vnd!==a*1000||
    !Number.isSafeInteger(event.ledger_id)||event.ledger_id<=0||k!=='collection'))return {state:'review'};
 // Unit of canonical TAPHOA balance is thousands; never mix with Chat's full-VND input.
 const full=[a,m,b,c].map(v=>v*1000);
 if(!full.every(Number.isSafeInteger))return {state:'review'};
 if(typeof event.receipt_at!=='string'||!Number.isFinite(Date.parse(event.receipt_at)))return {state:'review'};
 return {state:'eligible',receipt:{kind:k,amountVnd:full[0],movementVnd:full[1],beforeVnd:full[2],afterVnd:full[3],note:String(event.receipt_note??''),at:event.receipt_at}};
}
