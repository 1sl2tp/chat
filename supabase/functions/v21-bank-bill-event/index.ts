import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {RULE_VERSION,SYSTEM_PROMPT,validateVisionRead,readV4Fields} from "./bill-amount-rules.mjs";
import {previewBillSmsMatch,readIncomingAgribankSms} from "./bill-sms-preview.mjs";
import {previewBillAppMatch} from "./bill-app-preview.mjs";

const db=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const HEX=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const MIN_BYTES=100,MAX_BYTES=4000000;
const model="gemini-3.5-flash-lite";
const sha256=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
function amountInVnd(v:unknown):number|null{
 if(typeof v==="number")return Number.isSafeInteger(v)&&v>0&&v<1e12?v:null;
 if(typeof v==="string"&&/^\d{1,12}$/.test(v.trim())){
   const n=Number(v.trim());return Number.isSafeInteger(n)&&n>0&&n<1e12?n:null;
 }
 return null;
}
async function finish(asset:string,change:Record<string,unknown>){
 const {error}=await db.from("chat_bank_bill_receipts").update({...change,scanned_at:new Date().toISOString()}).eq("media_asset_id",asset).eq("status","scanning");
 if(error)throw new Error("receipt_save_failed");
}
// Visible scan feedback is PILOT-ONLY for test; never notify real customers.
// Uses existing collection-message opt-in enforcement, but never changes debt.
const TEST_ACCOUNT="8c4ac6ec-3178-4661-8696-04e345bf443e";
async function notifyTestScan(asset:string,customer:string,status:string,amount:number|null){
 if(customer!==TEST_ACCOUNT||!["amount_read","review","duplicate","non_bill"].includes(status))return false;
 const {data:receipt}=await db.from("chat_bank_bill_receipts")
   .select("customer_notified_at,ledger_id,status,amount_vnd").eq("media_asset_id",asset).maybeSingle();
 if(!receipt||receipt.customer_notified_at||receipt.ledger_id)return false;
 const canonicalStatus=String(receipt.status||"");
 if(!["amount_read","review","duplicate","non_bill"].includes(canonicalStatus))return false;
 const {data:media}=await db.from("v21_media_assets").select("conversation_id").eq("id",asset).maybeSingle();
 if(!media?.conversation_id)return false;
 const {data:conversation}=await db.from("v21_conversations")
   .select("member_a,member_b").eq("id",media.conversation_id).maybeSingle();
 if(!conversation)return false;
 const adminId=conversation.member_a===customer?conversation.member_b:
               conversation.member_b===customer?conversation.member_a:null;
 if(!adminId)return false;
 const {data:admin}=await db.from("v21_accounts").select("role,deleted_at,locked_at").eq("id",adminId).maybeSingle();
 if(admin?.role!=="admin"||admin.deleted_at||admin.locked_at)return false;
 const fmt=(n:number)=>n.toLocaleString("vi-VN")+"đ";
 const money=amountInVnd(amount??receipt.amount_vnd);
 const msg=canonicalStatus==="duplicate"
   ?"🔁 Ảnh trùng: tệp ảnh này đã được gửi trước đó."+
    (money?"\nSố tiền ảnh gốc: "+fmt(money):"")+
    "\nChỉ kiểm tra ảnh, CHƯA GHI THU."
   :canonicalStatus==="non_bill"
   ?"🖼️ AI không nhận diện đây là bill chuyển khoản thành công."+
    "\nKhông đọc số tiền, CHƯA GHI THU."
   :canonicalStatus==="amount_read"&&money
   ?"🔎 AI đọc số tiền: "+fmt(money)+
    "\nTrạng thái: Đã đọc ảnh · CHƯA GHI THU."+
    "\nChưa xác minh giao dịch."
   :"🔎 AI chưa đọc chắc chắn số tiền trong ảnh."+
    "\nTrạng thái: Cần kiểm tra · CHƯA GHI THU.";
 const {data:messageId,error}=await db.rpc("taphoa_chat_notify_customer",{
   p_customer_id:customer,p_sender_account_id:adminId,
   p_client_id:"taphoa:bill:amount:"+asset+":collection",p_body:msg
 });
 if(error||!messageId){console.warn("bill_amount_test_chat_feedback_skipped",String(error?.message||"opt_in_blocked").slice(0,80));return false;}
 await db.from("chat_bank_bill_receipts").update({customer_notified_at:new Date().toISOString()})
   .eq("media_asset_id",asset).is("customer_notified_at",null);
 return true;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return response({error:"method_not_allowed"},405);
 const {data:cfgRaw,error:cfgError}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(cfgRaw)?cfgRaw[0]:cfgRaw;
 if(cfgError||!cfg?.scan_key||req.headers.get("x-internal-dispatch-key")!==cfg.scan_key)return response({error:"not_authorized"},403);
 const body=await req.json().catch(()=>({}));const asset=String(body.asset_id||"").toLowerCase();
 if(!HEX.test(asset))return response({error:"asset_id_invalid"},400);
 const {data:job,error:jobError}=await db.from("chat_bank_bill_receipts").select("id,status,customer_account_id,sent_at,attempt_count").eq("media_asset_id",asset).maybeSingle();
 if(jobError||!job)return response({error:"not_queued"},404);
 // A real Agribank Plus credit may arrive after AI already read this bill.
 // Compare the persisted bill without redownloading the image or calling Gemini.
 if(job.status==="amount_read"){
   const {data:r}=await db.from("chat_bank_bill_receipts")
     .select("id,raw_read,amount_vnd,receiving_name,receiving_bank,receiving_account,transfer_at_vn,sent_at")
     .eq("media_asset_id",asset).eq("status","amount_read").maybeSingle();
   if(r?.raw_read?.rule_version==="bank_bill_amount_v4_20261018" &&
      Number.isSafeInteger(r.amount_vnd)&&r.amount_vnd>0){
     const sent=Date.parse(r.sent_at);
     if(Number.isFinite(sent)){
       const [app,others]=await Promise.all([
         db.from("taphoa_agribank_notifications")
           .select("id,package_name,posted_at,status,amount_vnd,body")
           .eq("package_name","com.vnpay.Agribank3g").eq("status","credit_candidate")
           .eq("amount_vnd",r.amount_vnd)
           .gte("posted_at",new Date(sent-20*60000).toISOString())
           .lte("posted_at",new Date(sent+15*60000).toISOString())
           .order("posted_at",{ascending:false}).limit(100),
         db.from("chat_bank_bill_receipts")
           .select("media_asset_id,status,amount_vnd,transfer_at_vn,sent_at")
           .eq("amount_vnd",r.amount_vnd).neq("media_asset_id",asset)
           .gte("sent_at",new Date(sent-20*60000).toISOString())
           .lte("sent_at",new Date(sent+20*60000).toISOString()).limit(100)
       ]);
       if(!app.error&&!others.error&&app.data&&others.data&&
          app.data.length<100&&others.data.length<100){
         const match=previewBillAppMatch({
           media_asset_id:asset,status:"amount_read",amount_vnd:r.amount_vnd,sent_at:r.sent_at,
           receiving_name:r.receiving_name,receiving_bank:r.receiving_bank,
           receiving_account:r.receiving_account,
           receiving_account_last5:r.raw_read?.recipient_account_last5,
           transfer_at_vn:r.transfer_at_vn,
           transaction_nature:r.raw_read?.transaction_nature
         },app.data,others.data);
         if(match?.status==="candidate_unique"&&Number.isSafeInteger(match.notification_id)){
           const {error:saveError}=await db.from("chat_bank_bill_receipts")
             .update({raw_read:{...r.raw_read,match_preview:match}})
             .eq("id",r.id).eq("status","amount_read");
           if(!saveError){
             const {data:posted,error:postError}=await db.rpc("chat_bank_app_collect",{
               p_asset_id:asset,p_notification_id:match.notification_id
             });
             if(!postError&&posted?.ok===true&&posted?.status==="received")
               return response({ok:true,status:"received",ai_called:false,
                 ledger_written:true,ledger_id:posted.ledger_id});
           }
         }
       }
     }
   }
 }
 if(job.status!=="queued"){
   if(job.customer_account_id===TEST_ACCOUNT&&["amount_read","review","duplicate","non_bill"].includes(job.status)){
     try{await notifyTestScan(asset,job.customer_account_id,job.status,null);}catch(e){console.warn("bill_scan_feedback_retry_failed",String(e).slice(0,80));}
   }
   return response({ok:true,existing:true,status:job.status,mode:"amount_hash_only"},202);
 }
 // BANK-159: no SMS => no binary download/hash and no Gemini request.
 // Both SMS-first and bill-first wake the same queued job; never interval-poll.
 const billSentMs=Date.parse(job.sent_at);
 if(!Number.isFinite(billSentMs))return response({ok:false,error:"invalid_bill_timestamp",ai_called:false},409);
 const {data:bankSmsRows,error:bankSmsError}=await db.from("taphoa_sms_inbox")
   .select("id,sender,body,sms_timestamp_ms,received_at,created_at")
   .gte("received_at",new Date(billSentMs-24*3600000).toISOString())
   .lte("received_at",new Date(billSentMs+15*60000).toISOString())
   .order("received_at",{ascending:false}).limit(120);
 if(bankSmsError||!bankSmsRows||bankSmsRows.length>=120)
   return response({ok:false,error:"bank_sms_preflight_unavailable",ai_called:false,ledger_written:false},503);
 const eligibleSms=bankSmsRows.map(readIncomingAgribankSms).filter(s=>
   s&&s.receiving_account_last5&&Number.isFinite(s.transaction_at_ms)
    &&Number.isFinite(s.sms_received_at_ms)
    &&Math.abs(s.transaction_at_ms-s.sms_received_at_ms)<=24*3600000
    &&s.transaction_at_ms<=billSentMs+10*60000
    &&billSentMs-s.transaction_at_ms<=24*3600000);
 // BANK-162: SMS is optional. Genuine Agribank Plus app credit notifications
 // can wake the same bill AI reader, with no changes to ledger authorization.
 let eligibleAppEvents:any[]=[];
 if(eligibleSms.length===0){
   const {data:appRows,error:appError}=await db.from("taphoa_agribank_notifications")
     .select("id,package_name,posted_at,status,amount_vnd,body")
     .eq("package_name","com.vnpay.Agribank3g").eq("status","credit_candidate")
     .gte("posted_at",new Date(billSentMs-24*3600000).toISOString())
     .lte("posted_at",new Date(billSentMs+15*60000).toISOString())
     .order("posted_at",{ascending:false}).limit(120);
   if(appError||!appRows||appRows.length>=120)
     return response({ok:false,error:"bank_app_preflight_unavailable",ai_called:false,ledger_written:false},503);
   eligibleAppEvents=appRows.filter(e=>Number.isSafeInteger(e.amount_vnd)&&e.amount_vnd>0);
 }
 if(eligibleSms.length===0&&eligibleAppEvents.length===0)
   return response({ok:true,status:"waiting_bank_event",reason:"no_recent_credit_sms_or_agribank_app_notification",
     ai_called:false,ledger_written:false},202);
 const {data:media,error:mediaError}=await db.from("v21_media_assets").select("id,message_id,owner_account_id,storage_key,mime_type,kind,size_bytes,deleted_at").eq("id",asset).is("deleted_at",null).maybeSingle();
 if(mediaError||!media||media.kind!=="image"||media.owner_account_id!==job.customer_account_id)return response({error:"not_a_customer_image"},403);
 const {data:message}=await db.from("v21_messages").select("sender_account_id,created_at,deleted_at").eq("id",media.message_id).maybeSingle();
 const {data:account}=await db.from("v21_accounts").select("id,role,contact_group,deleted_at,locked_at").eq("id",job.customer_account_id).maybeSingle();
 if(!message||message.deleted_at||message.sender_account_id!==job.customer_account_id||
    !account||account.role!=="user"||account.contact_group!=="customer"||account.deleted_at||account.locked_at)return response({error:"not_customer_submitted"},403);
 if(!Number.isFinite(Date.parse(job.sent_at))||Math.abs(Date.now()-new Date(job.sent_at).getTime())>36*3600000)return response({error:"historical_asset_not_auto_processed"},409);
 const now=new Date(),todayUTC=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString();
 const {count:perCustomer}=await db.from("chat_bank_bill_receipts").select("*",{head:true,count:"exact"}).eq("customer_account_id",job.customer_account_id).gte("created_at",todayUTC);
 const {count:allCustomers}=await db.from("chat_bank_bill_receipts").select("*",{head:true,count:"exact"}).gte("created_at",todayUTC);
 if((perCustomer||0)>30||(allCustomers||0)>200){
   await db.from("chat_bank_bill_receipts").update({status:"review",reason:"daily_scan_limit_no_collection"}).eq("media_asset_id",asset).eq("status","queued");
   return response({ok:true,status:"review",reason:"daily_scan_limit"},200);
 }
 const {data:claimed,error:claimError}=await db.from("chat_bank_bill_receipts").update({status:"scanning",reason:"reading_amount_and_hash",attempt_count:(job.attempt_count||0)+1}).eq("media_asset_id",asset).eq("status","queued").select("id");
 if(claimError)return response({error:"claim_failed"},500);
 if(!claimed?.length)return response({ok:true,status:"already_claimed"},202);
 let digest="";
 try{
   if(!media.size_bytes||media.size_bytes<MIN_BYTES||media.size_bytes>MAX_BYTES)throw new Error("unsupported_image_size");
   const {data:file,error:downloadError}=await db.storage.from("v21-media").download(media.storage_key);
   if(downloadError||!file)throw new Error("storage_download_failed");
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(bytes.length<MIN_BYTES||bytes.length>MAX_BYTES)throw new Error("actual_image_size_invalid");
   digest=await sha256(bytes);
   // Global PRIMARY KEY is an atomic single-scan reservation. One byte-identical
   // image can be owned by only one first receipt, regardless of customer.
   const {data:inserted,error:insertError}=await db.from("chat_bank_bill_image_hashes").insert({
     image_sha256:digest,first_asset_id:asset,customer_account_id:job.customer_account_id,scan_status:"pending"
   }).select("image_sha256");
   if(insertError&&insertError.code!=="23505")throw new Error("hash_registry_unavailable");
   if(!inserted?.length){
     const {data:existing,error:existingError}=await db.from("chat_bank_bill_image_hashes").select("first_asset_id,amount_vnd,scan_status").eq("image_sha256",digest).maybeSingle();
     if(existingError||!existing)throw new Error("hash_registry_lookup_failed");
     if(existing.first_asset_id!==asset){
       const {data:firstReceipt}=await db.from("chat_bank_bill_receipts").select("id").eq("media_asset_id",existing.first_asset_id).maybeSingle();
       await finish(asset,{status:"duplicate",reason:"duplicate_exact_image_sha256_no_ai",image_sha256:digest,duplicate_of:firstReceipt?.id||null,
         amount_vnd:existing.amount_vnd||null,raw_read:{read_mode:"amount_hash_only",same_image_sha256:true,first_scan_state:existing.scan_status}});
       try{await notifyTestScan(asset,job.customer_account_id,"duplicate",existing.amount_vnd||null);}catch(e){console.warn("bill_scan_duplicate_feedback_failed",String(e).slice(0,80));}
       return response({ok:true,status:"duplicate",reason:"same_exact_image",amount_vnd:existing.amount_vnd||null,ai_called:false});
     }
   }
   const geminiKey=Deno.env.get("GEMINI_API_KEY")||"";
   if(!geminiKey)throw new Error("gemini_key_missing");
   let b64="";
   for(let n=0;n<bytes.length;n+=16000)b64+=String.fromCharCode(...bytes.subarray(n,Math.min(bytes.length,n+16000)));
   const prompt=SYSTEM_PROMPT;
   const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),24000);
   let gr:Response;
   try{gr=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
     method:"POST",headers:{"x-goog-api-key":geminiKey,"content-type":"application/json"},
     body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:media.mime_type||"image/jpeg",data:btoa(b64)}}]}],
       generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:1100}}),
     signal:ctl.signal
   });}finally{clearTimeout(timeout);}
   if(!gr.ok)throw new Error("gemini_http_"+gr.status);
   const modelResult=await gr.json();
   const resultString=(modelResult.candidates?.[0]?.content?.parts||[]).map((x:any)=>String(x.text||"")).join("");
   let parsed:any;try{parsed=JSON.parse(resultString)}catch{throw new Error("gemini_invalid_json")}
   const fields=readV4Fields(parsed);
   const verdict=validateVisionRead(parsed);
   const {status,reason,amount_vnd:amount}=verdict;
   // Prior SMS are candidates only, NEVER authorization to debit debts.
   let matchPreview:any={status:"review",reason:"sms_bill_not_evaluated"};
   if(status==="amount_read"&&amount&&Number.isFinite(Date.parse(job.sent_at))){
     try{
       const sentMillis=Date.parse(job.sent_at);
       const [smsRes,otherRes,appRes]=await Promise.all([
         db.from("taphoa_sms_inbox")
           .select("id,sender,body,sms_timestamp_ms,received_at,created_at")
           .gte("received_at",new Date(sentMillis-24*3600000).toISOString())
           .lte("received_at",new Date(sentMillis+15*60000).toISOString())
           .order("received_at",{ascending:false}).limit(100),
         db.from("chat_bank_bill_receipts")
           .select("media_asset_id,status,amount_vnd,transfer_at_vn,sent_at")
           .eq("amount_vnd",amount)
           .gte("sent_at",new Date(sentMillis-20*60000).toISOString())
           .lte("sent_at",new Date(sentMillis+20*60000).toISOString())
           .neq("media_asset_id",asset).limit(100),
         db.from("taphoa_agribank_notifications")
           .select("id,package_name,posted_at,status,amount_vnd,body")
           .eq("package_name","com.vnpay.Agribank3g").eq("status","credit_candidate")
           .eq("amount_vnd",amount)
           .gte("posted_at",new Date(sentMillis-20*60000).toISOString())
           .lte("posted_at",new Date(sentMillis+15*60000).toISOString())
           .order("posted_at",{ascending:false}).limit(100)
       ]);
       if(smsRes.error||otherRes.error||appRes.error||
          smsRes.data?.length===100||otherRes.data?.length===100||appRes.data?.length===100)
         matchPreview={status:"review",reason:"matching_data_incomplete"};
       else {
         const bill={media_asset_id:asset,status,amount_vnd:amount,sent_at:job.sent_at,...fields};
         const smsMatch=previewBillSmsMatch(bill,smsRes.data||[],otherRes.data||[]);
         const appMatch=previewBillAppMatch(bill,appRes.data||[],otherRes.data||[]);
         matchPreview=smsMatch.status==="candidate_unique"&&appMatch.status==="candidate_unique"
           ?{status:"review",reason:"two_sources_same_amount_review"}
           :smsMatch.status==="candidate_unique"?smsMatch
           :appMatch.status==="candidate_unique"?appMatch
           :appMatch.status==="review"?appMatch:smsMatch;
       }
     }catch(_e){matchPreview={status:"review",reason:"matching_preview_unavailable"};}
   }
   await finish(asset,{status,reason,image_sha256:digest,amount_vnd:amount,model_name:model,
     receiving_name:fields.receiving_name,receiving_account:fields.receiving_account,
     receiving_bank:fields.receiving_bank,sending_bank:fields.sending_bank,
     transfer_reference:fields.transfer_reference,transfer_at_vn:fields.transfer_at_vn,
     raw_read:{read_mode:"amount_hash_only",rule_version:RULE_VERSION,
      image_type:String(parsed?.image_type||"").slice(0,48),
      amount_role:String(parsed?.amount_role||"").slice(0,40),
      transfer_success_visible:parsed?.transfer_success_visible===true,
      amount_vnd:amount,amount_text:String(parsed?.amount_text||"").slice(0,80),
      amount_clear:parsed?.amount_clear===true,uncertainty:String(parsed?.uncertainty||"").slice(0,160),
      recipient_account_last5:fields.receiving_account_last5,
      recipient_account_visible:fields.receiving_account_visible,
      transaction_selection:fields.transaction_selection,
      transaction_nature:fields.transaction_nature,
      transaction_datetime_vn:fields.transfer_at_vn,
      transaction_time_precision:fields.transaction_time_precision,
      recipient_name:fields.receiving_name,receiving_bank:fields.receiving_bank,
      match_preview:matchPreview}});
   await db.from("chat_bank_bill_image_hashes").update({amount_vnd:amount,scan_status:amount===null?"unreadable":"amount_read"})
     .eq("image_sha256",digest).eq("first_asset_id",asset);
   // BANK-164: only the service-role RPC may authorize a TAPHOA collection.
   // DB independently verifies the Agribank notification, bill and Admin state.
   let receiptPosted:any=null;
   if(status==="amount_read"&&matchPreview?.source==="agribank_plus_notification"
      &&matchPreview?.status==="candidate_unique"
      &&Number.isSafeInteger(matchPreview.notification_id)){
     const {data:posted,error:postError}=await db.rpc("chat_bank_app_collect",{
       p_asset_id:asset,p_notification_id:matchPreview.notification_id
     });
     if(!postError&&posted?.ok===true&&posted?.status==="received")
       receiptPosted=posted;
   }
   if(receiptPosted){
     return response({ok:true,status:"received",amount_vnd:amount,
       ai_called:true,ledger_written:true,ledger_id:receiptPosted.ledger_id});
   }
   try{await notifyTestScan(asset,job.customer_account_id,status,amount);}catch(e){console.warn("bill_scan_feedback_failed",String(e).slice(0,80));}
   return response({ok:true,status,amount_vnd:amount,duplicate:false,ai_called:true,ledger_written:false});
 }catch(error){
   const reason=String(error instanceof Error?error.message:error).slice(0,90);
   await finish(asset,{status:"failed",reason:"amount_scan_"+reason,image_sha256:digest||null}).catch(()=>{});
   if(digest)await db.from("chat_bank_bill_image_hashes").update({scan_status:"failed"})
     .eq("image_sha256",digest).eq("first_asset_id",asset).then(()=>{});
   return response({ok:false,error:"amount_scan_failed",reason},502);
 }
});