// BANK-364: bank-event recovery of EXISTING OCR only; never fetch a new photo.
// Returning a candidate is not permission to write debt. Only the existing
// locked financial RPC can post a verified receipt.
import {planVerifiedNoClockRecovery} from "./bill-no-clock-recovery.mjs";
import {previewBillAppMatch} from "./bill-app-preview.mjs";
const vnClock=ms=>new Date(ms+7*3600000).toISOString().slice(0,19).replace("T"," ");
export async function recoverStoredNoClockBankCredit(db,asset){
 try{
  const {data:r,error}=await db.from("chat_bank_bill_receipts")
   .select("id,media_asset_id,customer_account_id,status,reason,ledger_id,amount_vnd,receiving_name,receiving_account,receiving_bank,sending_bank,transfer_reference,transfer_at_vn,sent_at,raw_read")
   .eq("media_asset_id",asset).eq("status","review")
   .eq("reason","bill_printed_time_missing").maybeSingle();
  if(error||!r)return null;
  const day=String(r.raw_read?.transfer_date_vn||"");
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))return null;
  const start=Date.parse(day+"T00:00:00+07:00");
  if(!Number.isFinite(start))return null;
  const [notices,peers]=await Promise.all([
   db.from("taphoa_agribank_notifications")
    .select("id,package_name,status,amount_vnd,body,is_own_transfer,bank_credit_account")
    .eq("amount_vnd",r.amount_vnd).eq("status","credit_candidate")
    .eq("package_name","com.vnpay.Agribank3g")
    .gte("transfer_at",new Date(start).toISOString())
    .lt("transfer_at",new Date(start+86400000).toISOString()).limit(60),
   db.from("chat_bank_bill_receipts")
    .select("id,media_asset_id,customer_account_id,status,reason,ledger_id,amount_vnd,receiving_name,receiving_account,receiving_bank,sending_bank,transfer_reference,transfer_at_vn,sent_at,raw_read")
    .eq("customer_account_id",r.customer_account_id).eq("amount_vnd",r.amount_vnd)
    .gte("sent_at",new Date(start).toISOString())
    .lt("sent_at",new Date(start+86400000).toISOString()).limit(60)
  ]);
  if(notices.error||peers.error||notices.data?.length>=60||peers.data?.length>=60)
   return null;
  const plan=planVerifiedNoClockRecovery(r,peers.data||[],notices.data||[]);
  if(plan.status==="defer_to_canonical")
   return {handled:true,status:"review",reason:"stronger_existing_bill",
    ai_called:false,ledger_written:false};
  if(plan.status!=="eligible")return null;
  const minute=Date.parse(plan.bank_time_vn.replace(" ","T")+"+07:00");
  if(!Number.isFinite(minute))return null;
  const [others,manual,linked]=await Promise.all([
   db.from("chat_bank_bill_receipts")
    .select("media_asset_id,status,amount_vnd,transfer_at_vn,transfer_reference,sending_bank,image_sha256,raw_read,sent_at")
    .eq("amount_vnd",r.amount_vnd).neq("media_asset_id",asset)
    .gte("transfer_at_vn",vnClock(minute-300000))
    .lte("transfer_at_vn",vnClock(minute+300000)).limit(100),
   db.from("chat_bank_manual_collections").select("notification_id")
    .eq("notification_id",plan.notification_id).limit(1),
   db.from("chat_bank_app_collection_links").select("notification_id")
    .eq("notification_id",plan.notification_id).limit(1)
  ]);
  if(others.error||manual.error||linked.error||others.data?.length>=100||
     manual.data?.length||linked.data?.length)return null;
  const candidate={
   media_asset_id:asset,status:"amount_read",amount_vnd:r.amount_vnd,
   sent_at:r.sent_at,transfer_at_vn:plan.bank_time_vn,transfer_date_vn:day,
   receiving_name:r.receiving_name,receiving_bank:r.receiving_bank,
   receiving_account:r.receiving_account,
   receiving_account_last5:r.raw_read?.recipient_account_last5,
   sending_bank:r.sending_bank,sender_name:r.raw_read?.sender_name,
   transfer_reference:r.transfer_reference,
   transfer_content:r.raw_read?.transfer_content,
   transaction_nature:r.raw_read?.transaction_nature,
   requires_bank_memo:true
  };
  const match=previewBillAppMatch(candidate,notices.data||[],others.data||[]);
  if(match?.status!=="candidate_unique"||match.notification_id!==plan.notification_id)
   return null;
  // Deterministically collapse ONLY strongly identical references and OCR,
  // never equal amounts alone. All writes remain conditional/idempotent.
  for(const id of plan.duplicate_ids){
   const {data:updated,error:upError}=await db.from("chat_bank_bill_receipts")
    .update({status:"duplicate",reason:"same_verified_transfer_other_image",
     duplicate_of:r.id})
    .eq("id",id).eq("status","review")
    .eq("reason","bill_printed_time_missing").is("ledger_id",null)
    .select("id");
   if(upError||updated?.length!==1)return null;
  }
  // Keep the actual OCR image fields untouched, including the missing
  // printed time. Record official bank time as INDEPENDENT evidence.
  const corrected={...r.raw_read,match_preview:match,
   manual_datetime_correction:{
    source:"independent_agribank_credit_notification",
    bank_notice_id:plan.notification_id,bank_time_precision:"minute",
    bank_time_vn:plan.bank_time_vn,customer_ledger_untouched:true,
    without_new_image:true,reason:"missing_image_clock_exact_bank_sender_memo"
   }};
  const {data:updated,error:upError}=await db.from("chat_bank_bill_receipts")
   .update({status:"amount_read",reason:"official_bank_minute_verified",
    transfer_at_vn:plan.bank_time_vn,raw_read:corrected})
   .eq("id",r.id).eq("status","review").eq("reason","bill_printed_time_missing")
   .is("ledger_id",null).select("id");
  if(upError||updated?.length!==1)return null;
  const {data:posted,error:postError}=await db.rpc("chat_bank_app_collect",{
   p_asset_id:asset,p_notification_id:plan.notification_id
  });
  if(!postError&&posted?.ok===true&&posted?.status==="received")
   return {handled:true,status:"received",ai_called:false,ledger_written:true,
    ledger_id:posted.ledger_id,posted};
  console.warn("bank364_financial_guard_deferred",
   String(posted?.status||postError?.code||"rpc_unavailable").slice(0,64));
  return {handled:true,status:"amount_read",reason:"financial_guard_pending",
   ai_called:false,ledger_written:false};
 }catch(_e){
  console.warn("bank364_existing_bill_recovery_unavailable");
  return null;
 }
}
