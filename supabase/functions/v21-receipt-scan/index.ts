import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL=String(Deno.env.get("SUPABASE_URL")||"").trim();
const SERVICE_KEY=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const MAX_IMAGE_BYTES=12*1024*1024;
const DEFAULT_MODEL="gemini-3.5-flash-lite";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}

function clean(value:unknown,max=500){
  return String(value??"").trim().slice(0,max);
}

function bytesToBase64(bytes:Uint8Array){
  let binary="";
  const CHUNK=0x8000;
  for(let i=0;i<bytes.length;i+=CHUNK){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
  }
  return btoa(binary);
}

function responseText(payload:any){
  const parts=payload?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts))return "";
  return parts.map((part:any)=>String(part?.text||"")).join("").trim();
}

async function runtimeConfig(){
  const result=await db.rpc("chat_customer_summary_runtime_config");
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    scanKey:String(row?.scan_key||""),
    model:clean(row?.model_name,120)||DEFAULT_MODEL,
    geminiKey:String(row?.gemini_api_key||""),
  };
}

function parseAiJson(text:string){
  const raw=String(text||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  const parsed=JSON.parse(raw);
  const isReceipt=parsed?.is_bank_receipt===true;
  const bank=clean(parsed?.bank_name,120);
  const recipientName=clean(parsed?.recipient_name,160);
  const recipientAccount=clean(parsed?.recipient_account,80);
  const transactionRef=clean(parsed?.transaction_ref,120)||null;
  const amount=Number(parsed?.amount_vnd);
  const date=clean(parsed?.transfer_date,20);
  const time=clean(parsed?.transfer_time,20);

  let transferAt:string|null=null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&/^\d{2}:\d{2}(?::\d{2})?$/.test(time)){
    const fullTime=time.length===5?time+":00":time;
    transferAt=`${date}T${fullTime}+07:00`;
  }

  return {
    is_bank_receipt:isReceipt,
    bank_name:bank||null,
    recipient_name:recipientName||null,
    recipient_account:recipientAccount||null,
    amount_vnd:Number.isSafeInteger(amount)&&amount>0?amount:null,
    transfer_at:transferAt,
    transaction_ref:transactionRef,
  };
}

async function setFailed(jobId:string,code:string){
  await db.from("v21_receipt_jobs").update({
    status:"failed",
    error_code:code.slice(0,120),
    processed_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq("id",jobId);
}

async function claimJob(jobId:string){
  const current=await db.from("v21_receipt_jobs")
    .select("id,status,media_asset_id,attempt_count")
    .eq("id",jobId)
    .maybeSingle();
  if(current.error)throw current.error;
  if(!current.data)return null;
  if(!["queued","failed"].includes(String(current.data.status||"")))return {skip:true,row:current.data};

  const claimed=await db.from("v21_receipt_jobs")
    .update({
      status:"processing",
      attempt_count:(Number(current.data.attempt_count)||0)+1,
      started_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      error_code:null,
    })
    .eq("id",jobId)
    .in("status",["queued","failed"])
    .select("id,status,media_asset_id")
    .maybeSingle();
  if(claimed.error)throw claimed.error;
  if(!claimed.data)return {skip:true,row:current.data};
  return {skip:false,row:claimed.data};
}

Deno.serve(async(req:Request)=>{
  let jobId="";
  try{
    if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

    const cfg=await runtimeConfig();
    const supplied=String(req.headers.get("x-receipt-scan-key")||"");
    if(!cfg.scanKey||!supplied||supplied!==cfg.scanKey)return json({ok:false,error:"unauthorized"},401);
    if(!cfg.geminiKey)return json({ok:false,error:"ai_not_configured"},503);

    const body=await req.json().catch(()=>({}));
    jobId=clean(body?.job_id,80);
    if(!/^[0-9a-f-]{36}$/i.test(jobId))return json({ok:false,error:"job_id_invalid"},400);

    const claim=await claimJob(jobId);
    if(!claim)return json({ok:false,error:"job_not_found"},404);
    if(claim.skip)return json({ok:true,status:String(claim.row?.status||"already_claimed"),jobId});

    const media=await db.from("v21_media_assets")
      .select("id,kind,mime_type,size_bytes,storage_key,deleted_at")
      .eq("id",String(claim.row.media_asset_id))
      .maybeSingle();
    if(media.error)throw media.error;
    const asset=media.data;
    const mime=String(asset?.mime_type||"").toLowerCase();
    const size=Number(asset?.size_bytes)||0;
    const storageKey=String(asset?.storage_key||"").trim();

    if(!asset||asset.deleted_at||asset.kind!=="image"||!mime.startsWith("image/")||!storageKey||size<1||size>MAX_IMAGE_BYTES){
      await setFailed(jobId,"source_image_invalid");
      return json({ok:false,error:"source_image_invalid"},422);
    }

    const download=await db.storage.from("v21-media").download(storageKey);
    if(download.error||!download.data)throw new Error("image_unavailable");
    const bytes=new Uint8Array(await download.data.arrayBuffer());
    if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new Error("image_unavailable");

    const prompt=[
      "Bạn đang đọc MỘT ảnh do khách gửi trong chat.",
      "Nhiệm vụ duy nhất: xác định ảnh có phải biên lai/chứng từ chuyển khoản ngân hàng hay không và chép lại đúng dữ liệu NHÌN THẤY.",
      "TUYỆT ĐỐI không suy đoán chữ/số bị mờ, không tự hoàn thiện số tài khoản, không suy ra tên người nhận từ ngữ cảnh.",
      "Nếu một trường không đọc chắc chắn thì trả null.",
      "amount_vnd là số tiền chuyển theo đơn vị VND, chỉ gồm số nguyên.",
      "transfer_date theo YYYY-MM-DD. transfer_time theo HH:MM hoặc HH:MM:SS.",
      "transaction_ref là mã giao dịch/mã tham chiếu nếu ảnh có; không có thì null.",
      "Chỉ trả JSON đúng schema:",
      '{"is_bank_receipt":true|false,"bank_name":string|null,"recipient_name":string|null,"recipient_account":string|null,"amount_vnd":integer|null,"transfer_date":string|null,"transfer_time":string|null,"transaction_ref":string|null}'
    ].join("\n");

    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model||DEFAULT_MODEL)}:generateContent`;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json","x-goog-api-key":cfg.geminiKey},
      body:JSON.stringify({
        contents:[{role:"user",parts:[
          {text:prompt},
          {inlineData:{mimeType:mime,data:bytesToBase64(bytes)}}
        ]}],
        generationConfig:{temperature:0,responseMimeType:"application/json"},
      }),
    });

    const payload=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(response.status===429?"ai_rate_limited":`ai_http_${response.status}`);
    const extracted=parseAiJson(responseText(payload));

    const finalized=await db.rpc("v21_receipt_finalize",{p_job_id:jobId,p_result:extracted});
    if(finalized.error)throw finalized.error;

    return json({ok:true,jobId,result:finalized.data});
  }catch(error){
    const code=String((error as any)?.message||error||"receipt_scan_failed").slice(0,120);
    if(jobId)await setFailed(jobId,code);
    console.error("[v21-receipt-scan]",code);
    return json({ok:false,error:"receipt_scan_failed"},500);
  }
});
