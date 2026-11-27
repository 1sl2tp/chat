// Internal pilot diagnostic: metadata only, no AI, no financial writes.
// Bound to the already settled Nov 27 cohort. Never return original bytes or paths.
import {classifyAccountReadAnomaly} from "./bill-amount-rules.mjs";
import {inspectJpeg,probeJpegCodec} from "./bill-account-crop.mjs";
export async function inspectAccountCohort({db,digest,signal}){
 const {data:rows,error}=await db.from("chat_bank_bill_receipts").select("id,media_asset_id,message_id,customer_account_id,image_sha256,amount_vnd,sending_bank,raw_read").eq("status","received").not("ledger_id","is",null).eq("raw_read->>transfer_success_visible","true").gte("sent_at","2026-11-27T00:00:00+07:00").lt("sent_at","2026-11-28T00:00:00+07:00").order("id").limit(15);
 if(error||!Array.isArray(rows)||rows.length!==14)return {state:"cohort_changed",count:rows?.length??null,ledger_written:false};
 const {data:mode,error:modeError}=await db.rpc("v0_bill_focus_mode");
 if(modeError||mode!=="pilot")return {state:"disabled",ledger_written:false};
 const results=[];
 for(const r of rows){
  if(signal?.aborted)break;
  const item={receipt_id:r.id,amount_vnd:r.amount_vnd,sending_bank:r.sending_bank,account_anomaly:classifyAccountReadAnomaly(r.raw_read)};
  try{
   const {data:a,error}=await db.from("v21_media_assets").select("storage_key,mime_type").eq("id",r.media_asset_id).eq("message_id",r.message_id).eq("owner_account_id",r.customer_account_id).is("deleted_at",null).maybeSingle();
   if(error||!a?.storage_key||!["image/jpeg","image/jpg","image/png","image/webp"].includes(a.mime_type))throw Error("asset_unavailable");
   const {data:file,error:downloadError}=await db.storage.from("v21-media").download(a.storage_key);
   if(downloadError||!file||file.size<1||file.size>6_000_000||signal?.aborted)throw Error("storage_unavailable");
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(await digest(bytes)!==r.image_sha256)throw Error("hash_mismatch");
   const metadata=inspectJpeg(bytes);
   // Prior version rejected every EXIF segment, even orientation=1.
   const codec=await probeJpegCodec(bytes,{signal});
   results.push({...item,mime:a.mime_type,...metadata,codec,legacy_header_eligible:metadata.reason==="eligible"&&!metadata.exif});
  }catch(e){results.push({...item,reason:["asset_unavailable","storage_unavailable","hash_mismatch"].includes(e?.message)?e.message:"diagnostic_failed"});}
 }
 return {state:results.length===14?"complete":"partial",results,ledger_written:false};
}
