// BANK-295: One bounded same-key fallback only when Gemini returns HTTP 503.
// This module never authorizes collections or alters the strict bill validator.
export const BILL_OCR_FALLBACK_MODEL="gemini-3.5-flash";

export async function requestBillGemini({
  key,model,payload,signal,fetchFn=fetch,
  sleepFn=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}){
  if(!key)throw new Error("gemini_key_missing");
  // Reuse identical request data for both models; bank matching stays downstream.
  const requestBody=JSON.stringify(payload);
  const call=selected=>fetchFn(
    "https://generativelanguage.googleapis.com/v1beta/models/"+selected+":generateContent",{
      method:"POST",
      headers:{"x-goog-api-key":key,"content-type":"application/json"},
      body:requestBody,signal
    }
  );
  const primary=await call(model);
  if(primary.ok)return{response:primary,usedModel:model};
  if(primary.status!==503||model===BILL_OCR_FALLBACK_MODEL)
    throw new Error("gemini_http_"+primary.status);
  // A single delayed fallback inside the caller's existing 30-second deadline.
  // The database owns longer retries; avoid an unbounded network retry loop.
  if(signal?.aborted)throw new Error("AbortError");
  await sleepFn(800);
  if(signal?.aborted)throw new Error("AbortError");
  const backup=await call(BILL_OCR_FALLBACK_MODEL);
  if(!backup.ok)throw new Error("gemini_http_"+backup.status);
  return{response:backup,usedModel:BILL_OCR_FALLBACK_MODEL};
}
