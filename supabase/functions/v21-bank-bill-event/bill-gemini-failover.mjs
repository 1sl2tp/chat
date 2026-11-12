// BANK-301: bounded resilience to Gemini transient capacity errors.
// Fail closed: no OCR result or bill financial authorization is invented.
// The worker's single existing 30-second AbortSignal bounds ALL calls,
// response body read, and these short delays. DB cron retains longer backoff.
export const BILL_OCR_FALLBACK_MODEL="gemini-3.5-flash";
export const BILL_OCR_MAX_MODEL_REQUESTS=3;
const TRANSIENT_CAPACITY=new Set([502,503,504]);

export async function requestBillGemini({
  key,model,payload,signal,fetchFn=fetch,
  sleepFn=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  logFn=(name,fields)=>console.info(name,JSON.stringify(fields))
}){
  if(!key)throw new Error("gemini_key_missing");
  const requestBody=JSON.stringify(payload);
  const call=async(selected,stage)=>{
    if(signal?.aborted)throw new Error("AbortError");
    const started=Date.now();
    // Only model, HTTP code, stage and duration are logged. NEVER log image
    // bytes, extracted contents, customer info or API key.
    try{
      const res=await fetchFn(
        "https://generativelanguage.googleapis.com/v1beta/models/"+selected+":generateContent",{
          method:"POST",
          headers:{"x-goog-api-key":key,"content-type":"application/json"},
          body:requestBody,signal
        });
      logFn("bank_bill_gemini_attempt",{stage,model:selected,status:res.status,
        elapsed_ms:Math.max(0,Date.now()-started)});
      return res;
    }catch(e){
      logFn("bank_bill_gemini_transport_error",{stage,model:selected,
        error_type:e?.name==="AbortError"?"abort":"network"});
      throw e;
    }
  };
  const wait=async(ms)=>{
    if(signal?.aborted)throw new Error("AbortError");
    await sleepFn(ms);
    if(signal?.aborted)throw new Error("AbortError");
  };
  // 1) Preferred small/low-cost model.
  const primary=await call(model,"primary");
  if(primary.ok)return{response:primary,usedModel:model};
  if(!TRANSIENT_CAPACITY.has(primary.status)||model===BILL_OCR_FALLBACK_MODEL)
    throw new Error("gemini_http_"+primary.status);

  // 2) ONE alternate model, identical payload/key. No retry on invalid
  // request, missing key, forbidden access or quota (400/401/403/404/429).
  await wait(800);
  const backup=await call(BILL_OCR_FALLBACK_MODEL,"alternate");
  if(backup.ok)return{response:backup,usedModel:BILL_OCR_FALLBACK_MODEL};
  if(!TRANSIENT_CAPACITY.has(backup.status))
    throw new Error("gemini_http_"+backup.status);

  // 3) ONE delayed return to the low-cost model, ONLY if both endpoints
  // reported temporary capacity errors. Common status remains unchanged
  // so the existing SQL 5-minute retry cron can still recognize it.
  await wait(1400);
  const last=await call(model,"last_capacity_retry");
  if(last.ok)return{response:last,usedModel:model};
  throw new Error("gemini_http_"+last.status);
}
