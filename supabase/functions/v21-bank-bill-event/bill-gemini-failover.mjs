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
  if(primary.ok)return{response:primary,usedModel:model,requestCount:1};
  if(!TRANSIENT_CAPACITY.has(primary.status)||model===BILL_OCR_FALLBACK_MODEL)
    throw new Error("gemini_http_"+primary.status);

  // 2) ONE alternate model, identical payload/key. No retry on invalid
  // request, missing key, forbidden access or quota (400/401/403/404/429).
  await wait(800);
  const backup=await call(BILL_OCR_FALLBACK_MODEL,"alternate");
  if(backup.ok)return{response:backup,usedModel:BILL_OCR_FALLBACK_MODEL,requestCount:2};
  if(!TRANSIENT_CAPACITY.has(backup.status))
    throw new Error("gemini_http_"+backup.status);

  // 3) ONE delayed return to the low-cost model, ONLY if both endpoints
  // reported temporary capacity errors. Common status remains unchanged
  // so the existing SQL 5-minute retry cron can still recognize it.
  await wait(1400);
  const last=await call(model,"last_capacity_retry");
  if(last.ok)return{response:last,usedModel:model,requestCount:3};
  throw new Error("gemini_http_"+last.status);
}


// BANK-303: an HTTP 200 can contain a truncated/non-JSON Gemini candidate.
// This is a MODEL/transport error, not proof the customer's photo is invalid.
// Parse exactly one complete JSON object. Never repair missing digits/dates.
export async function parseBillGeminiResponse(response,{signal}={}){
 if(signal?.aborted)throw new Error("AbortError");
 let envelope;
 try{envelope=await response.json();}
 catch{
   if(signal?.aborted)throw new Error("AbortError");
   throw new Error("gemini_invalid_json");
 }
 if(signal?.aborted)throw new Error("AbortError");
 const parts=envelope?.candidates?.[0]?.content?.parts;
 if(!Array.isArray(parts)||!parts.length)throw new Error("gemini_invalid_json");
 const text=parts.map(x=>typeof x?.text==="string"?x.text:"").join("").trim();
 // Rare model replies wrap a valid JSON object in a fenced block even with
 // responseMimeType=application/json. Accept only a COMPLETE single fence.
 let raw=text;
 const fence=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
 if(fence)raw=fence[1].trim();
 if(!raw||raw.length>30000)throw new Error("gemini_invalid_json");
 let parsed;
 try{parsed=JSON.parse(raw);}
 catch{throw new Error("gemini_invalid_json");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
   throw new Error("gemini_invalid_json");
 return parsed;
}

// Bounded recovery: primary HTTP 200 with invalid JSON gets ONE request to
// the alternate model using the same image and SAME 30s AbortSignal. If the
// HTTP-capacity fallback already consumed calls, do NOT exceed the three
// model-request ceiling. No extra polling and no financial authorization.
export async function requestParsedBillGemini({
 key,model,payload,signal,fetchFn=fetch,
 sleepFn=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 logFn=(name,fields)=>console.info(name,JSON.stringify(fields))
}){
 const call=async(selected,selectedPayload)=>requestBillGemini({
   key,model:selected,payload:selectedPayload,signal,fetchFn,sleepFn,logFn
 });
 const primary=await call(model,payload);
 try{
   return{parsed:await parseBillGeminiResponse(primary.response,{signal}),
      usedModel:primary.usedModel,modelRequestCount:primary.requestCount};
 }catch(error){
   if(signal?.aborted||error?.message==="AbortError")throw new Error("AbortError");
   if(error?.message!=="gemini_invalid_json")throw error;
   logFn("bank_bill_gemini_invalid_output",{
     model:primary.usedModel,request_count:primary.requestCount,
     finish_reason:"untrusted_response_unreadable"
   });
   if(primary.requestCount!==1||primary.usedModel!==model||
      model===BILL_OCR_FALLBACK_MODEL)throw error;
   // Longer output budget helps when malformed JSON was truncated; a
   // secondary request is strictly bounded and stays within total cap.
   const alternatePayload={
     ...payload,generationConfig:{
       ...payload.generationConfig,
       maxOutputTokens:Math.max(2048,Number(payload?.generationConfig?.maxOutputTokens)||0)
     }
   };
   if(signal?.aborted)throw new Error("AbortError");
   const alt=await call(BILL_OCR_FALLBACK_MODEL,alternatePayload);
   return{
     parsed:await parseBillGeminiResponse(alt.response,{signal}),
     usedModel:alt.usedModel,
     modelRequestCount:primary.requestCount+alt.requestCount
   };
 }
}
