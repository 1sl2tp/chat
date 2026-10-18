import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";

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
Deno.serve(async req=>{
 if(req.method!=="POST")return response({error:"method_not_allowed"},405);
 const {data:cfgRaw,error:cfgError}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(cfgRaw)?cfgRaw[0]:cfgRaw;
 if(cfgError||!cfg?.scan_key||req.headers.get("x-internal-dispatch-key")!==cfg.scan_key)return response({error:"not_authorized"},403);
 const body=await req.json().catch(()=>({}));const asset=String(body.asset_id||"").toLowerCase();
 if(!HEX.test(asset))return response({error:"asset_id_invalid"},400);
 const {data:job,error:jobError}=await db.from("chat_bank_bill_receipts").select("id,status,customer_account_id,sent_at,attempt_count").eq("media_asset_id",asset).maybeSingle();
 if(jobError||!job)return response({error:"not_queued"},404);
 if(job.status!=="queued")return response({ok:true,existing:true,status:job.status,mode:"amount_hash_only"},202);
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
       return response({ok:true,status:"duplicate",reason:"same_exact_image",amount_vnd:existing.amount_vnd||null,ai_called:false});
     }
   }
   const geminiKey=Deno.env.get("GEMINI_API_KEY")||"";
   if(!geminiKey)throw new Error("gemini_key_missing");
   let b64="";
   for(let n=0;n<bytes.length;n+=16000)b64+=String.fromCharCode(...bytes.subarray(n,Math.min(bytes.length,n+16000)));
   const prompt="Chỉ đọc SỐ TIỀN chuyển khoản từ ảnh biên lai ngân hàng Việt Nam, không xử lý người nhận, STK, thời gian hay mã giao dịch. Ảnh có thể chụp màn hình điện thoại đặt trên bàn hoặc bị lóa. Xác định vùng màn hình điện thoại và phần BIÊN LAI CHUYỂN TIỀN THÀNH CÔNG, bỏ qua nền, tay, vỏ ốp. Tìm SỐ TIỀN CHUYỂN THÀNH CÔNG thường in lớn và nổi bật nhất trong vùng xác nhận, KHÔNG lấy số dư, số tài khoản, mã giao dịch hoặc số khác. Trả duy nhất JSON object {is_transfer_receipt:boolean,amount_vnd:integer|null,amount_text:string|null,amount_clear:boolean,uncertainty:string|null}. Nếu QR nhận tiền, ảnh không phải bill thành công, hoặc số tiền mờ/mâu thuẫn thì amount_vnd=null; không tự đoán. amount_vnd phải là số tiền gốc bằng VND, KHÔNG chia 1000.";
   const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),24000);
   let gr:Response;
   try{gr=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
     method:"POST",headers:{"x-goog-api-key":geminiKey,"content-type":"application/json"},
     body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:media.mime_type||"image/jpeg",data:btoa(b64)}}]}],
       generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:340}}),
     signal:ctl.signal
   });}finally{clearTimeout(timeout);}
   if(!gr.ok)throw new Error("gemini_http_"+gr.status);
   const modelResult=await gr.json();
   const resultString=(modelResult.candidates?.[0]?.content?.parts||[]).map((x:any)=>String(x.text||"")).join("");
   let parsed:any;try{parsed=JSON.parse(resultString)}catch{throw new Error("gemini_invalid_json")}
   const valid=parsed?.is_transfer_receipt===true&&parsed?.amount_clear===true;
   const amount=valid?amountInVnd(parsed.amount_vnd):null;
   const status=amount===null?"review":"amount_read";
   const reason=amount===null?"amount_unclear_or_not_receipt_no_collection":"amount_read_only_no_collection";
   await finish(asset,{status,reason,image_sha256:digest,amount_vnd:amount,model_name:model,
     raw_read:{read_mode:"amount_hash_only",is_transfer_receipt:parsed?.is_transfer_receipt===true,
      amount_vnd:amount,amount_text:String(parsed?.amount_text||"").slice(0,80),
      amount_clear:parsed?.amount_clear===true,uncertainty:String(parsed?.uncertainty||"").slice(0,160)}});
   await db.from("chat_bank_bill_image_hashes").update({amount_vnd:amount,scan_status:amount===null?"unreadable":"amount_read"})
     .eq("image_sha256",digest).eq("first_asset_id",asset);
   return response({ok:true,status,amount_vnd:amount,duplicate:false,ai_called:true,ledger_written:false});
 }catch(error){
   const reason=String(error instanceof Error?error.message:error).slice(0,90);
   await finish(asset,{status:"failed",reason:"amount_scan_"+reason,image_sha256:digest||null}).catch(()=>{});
   if(digest)await db.from("chat_bank_bill_image_hashes").update({scan_status:"failed"})
     .eq("image_sha256",digest).eq("first_asset_id",asset).then(()=>{});
   return response({ok:false,error:"amount_scan_failed",reason},502);
 }
});