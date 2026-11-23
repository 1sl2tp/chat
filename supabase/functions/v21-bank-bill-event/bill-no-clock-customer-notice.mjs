// BANK-366: One auditable Chat reconciliation request per verified no-clock
// transfer. Never classify a payment as received or mutate a financial ledger.
// Uses the EXISTING opt-in / Zalo-bridge / unique-client-id message owner.
const YYYYMMDD=/^20\d{2}-\d{2}-\d{2}$/;
const clean=s=>String(s||"").trim();
const canonical=s=>clean(s).normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D")
 .toUpperCase().replace(/[^A-Z0-9]/g,"");
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<1000000000000;
const validUuid=s=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clean(s));
const safeReference=s=>/^[A-Za-z0-9][A-Za-z0-9._-]{9,79}$/.test(clean(s));
export function planMissingClockCustomerNotice(receipt){
 const raw=receipt?.raw_read||{};
 const date=clean(raw.transfer_date_vn);
 const literal=clean(raw.transfer_date_printed_vn);
 const ref=clean(receipt?.transfer_reference);
 const memo=canonical(raw.transfer_content);
 if(receipt?.status!=="review"||receipt.reason!=="bill_printed_time_missing"||
  receipt.ledger_id!=null||!validUuid(receipt.customer_account_id)||
  !positive(receipt.amount_vnd)||receipt.amount_vnd%1000!==0||
  !YYYYMMDD.test(date)||!literal||
  !Number.isFinite(Date.parse(date+"T00:00:00+07:00"))||
  new Date(Date.parse(date+"T00:00:00+07:00")+7*3600000)
   .toISOString().slice(0,10)!==date||
  raw.rule_version!=="bank_bill_amount_v5_20261110"||
  raw.image_type!=="successful_transfer_receipt"||
  raw.transfer_success_visible!==true||raw.amount_clear!==true||
  raw.transaction_selection!=="single_detail"||
  !["transfer","incoming_transfer"].includes(raw.transaction_nature)||
  raw.transfer_time_printed_vn||receipt.transfer_at_vn||
  raw.time_date_conflict===true||raw.clock_text_conflict===true||
  raw.printed_date_invalid===true||raw.ocr_iso_date_conflict===true||
  !Array.isArray(raw.missing_fields)||
  !raw.missing_fields.includes("transaction_clock")||
  memo.length<12||
  canonical(receipt.receiving_name)!=="BUIXUANTUNG"||
  canonical(receipt.receiving_bank)!=="AGRIBANK"||
  !String(receipt.receiving_account||"").replace(/\D/g,"").endsWith("99999")
 )return null;
 const original=clean(raw.uncertainty).normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase();
 // If the AI specifically says the clock is blurry, cut off or uncertain,
 // we cannot AFFIRM the source image has no printed clock. Fail closed.
 if(/(mo|nh\s*o|khong ro|bi che|khuat|khong chac|uncertain|blur|obscur|unreadab)/i.test(original)
    && !/(chi co ngay khong co gio|khong co gio)/i.test(original))return null;
 const dd=date.slice(8,10),mm=date.slice(5,7),yyyy=date.slice(0,4);
 const money=receipt.amount_vnd.toLocaleString("vi-VN")+"đ";
 const identity=safeReference(ref)
  ?["ref",ref.toUpperCase(),date,String(receipt.amount_vnd)]
  :["memo",memo,date,String(receipt.amount_vnd)];
 const body="📄 Cần đối soát bill chuyển khoản "+money+" ngày "+
  dd+"/"+mm+"/"+yyyy+".\n"+
  "Ảnh bill gửi chưa thể xác nhận giờ giao dịch (HH:mm). "+
  "Bill này đang chờ đối soát, chưa được xác nhận ghi thu tự động.\n"+
  (safeReference(ref)?"Mã giao dịch: "+ref+".\n":"")+
  "Nhờ anh/chị nhắn lại giờ chuyển tiền (HH:mm) và xác nhận "+
  "thông tin giao dịch ngay tại hội thoại này để cả hai bên lưu làm căn cứ đối soát. "+
  "Không cần chuyển khoản thêm.";
 return {date,amount:receipt.amount_vnd,identity:identity.join("|"),body};
}
export async function sendMissingClockCustomerReconciliation(db,asset){
 try{
  const {data:r,error:readError}=await db.from("chat_bank_bill_receipts")
   .select("id,media_asset_id,message_id,customer_account_id,status,reason,ledger_id,amount_vnd,receiving_name,receiving_account,receiving_bank,transfer_reference,transfer_at_vn,raw_read,customer_notified_at")
   .eq("media_asset_id",asset).maybeSingle();
  if(readError||!r)return false;
  const plan=planMissingClockCustomerNotice(r);
  if(!plan||r.customer_notified_at)return false;
  const [{data:media,error:mediaError},{data:message,error:messageError}]=await Promise.all([
   db.from("v21_media_assets")
    .select("id,message_id,owner_account_id,conversation_id,kind,deleted_at")
    .eq("id",asset).is("deleted_at",null).maybeSingle(),
   db.from("v21_messages")
    .select("id,sender_account_id,deleted_at")
    .eq("id",r.message_id).is("deleted_at",null).maybeSingle()
  ]);
  if(mediaError||messageError||!media||!message||
    media.kind!=="image"||media.owner_account_id!==r.customer_account_id||
    media.message_id!==r.message_id||message.sender_account_id!==r.customer_account_id)
    return false;
  const {data:room,error:roomError}=await db.from("v21_conversations")
   .select("member_a,member_b").eq("id",media.conversation_id).maybeSingle();
  if(roomError||!room)return false;
  const adminId=room.member_a===r.customer_account_id?room.member_b:
   room.member_b===r.customer_account_id?room.member_a:null;
  if(!adminId)return false;
  const [{data:admin,error:adminError},{data:customer,error:customerError}]=await Promise.all([
   db.from("v21_accounts")
    .select("role,deleted_at,locked_at").eq("id",adminId).maybeSingle(),
   db.from("v21_accounts")
    .select("role,contact_group,deleted_at,locked_at")
    .eq("id",r.customer_account_id).maybeSingle()
  ]);
  if(adminError||customerError||admin?.role!=="admin"||
     admin.deleted_at||admin.locked_at||
     customer?.role!=="user"||customer.contact_group!=="customer"||
     customer.deleted_at||customer.locked_at)return false;
  // A stable fingerprint makes two different crops of one transfer exactly
  // one message. The existing sender+client-id unique DB constraint provides
  // idempotency even for concurrent OCR events and retries.
  const bytes=new TextEncoder().encode(r.customer_account_id+"|"+plan.identity);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
   .map(n=>n.toString(16).padStart(2,"0")).join("");
  const clientId="taphoa:bill:no-clock:"+digest+":collection";
  const {data:messageId,error:sendError}=await db.rpc("taphoa_chat_notify_customer",{
   p_customer_id:r.customer_account_id,p_sender_account_id:adminId,
   p_client_id:clientId,p_body:plan.body
  });
  if(sendError||!messageId){
   console.warn("bank366_no_clock_chat_notice_blocked");
   return false; // Respects global / customer opt-in; no bypass via raw INSERT.
  }
  // Sending text is NOT evidence of a verified deposit; never modify
  // status, match_preview, bank link, receipt amount or financial ledger.
  await db.from("chat_bank_bill_receipts")
   .update({customer_notified_at:new Date().toISOString()})
   .eq("id",r.id).eq("status","review")
   .eq("reason","bill_printed_time_missing").is("customer_notified_at",null);
  return true;
 }catch(_error){
  console.warn("bank366_no_clock_chat_notice_unavailable");
  return false;
 }
}
