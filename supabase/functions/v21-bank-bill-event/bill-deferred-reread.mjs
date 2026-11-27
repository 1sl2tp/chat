// Display-only focused recovery; no ledger, receipt mutation, or matcher.
// Store owns atomic claim + version-checked save. Caller is a trusted server.
import {ACCOUNT_DIGIT_RECHECK_PROMPT,SMALL_TEXT_RECHECK_PROMPT,needsAccountDigitRecheck,resolveAccountDigitRecheck,needsSmallTextRecheck,recoverSmallText,readV4Fields} from "./bill-amount-rules.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
const retryable=s=>["timeout","budget_exhausted","request_failed","invalid_json","gemini_http_502","gemini_http_503","gemini_http_504"].includes(s);
export function deferredFields(raw){
 if(!raw||raw.transfer_success_visible!==true)return [];
 const result=[];
 if(retryable(raw.account_digit_recheck_state)&&needsAccountDigitRecheck(raw))result.push("account");
 if(retryable(raw.small_text_recheck_state)&&needsSmallTextRecheck(raw))result.push("small_text");
 return result;
}
export function displayEvidence(raw,field,second){
 if(field==="account"){
  const v=resolveAccountDigitRecheck(raw,second);
  return v?{account:v}:null;
 }
 if(field!=="small_text")return null;
 const before=readV4Fields(raw),after=readV4Fields(recoverSmallText(raw,second)),result={};
 if(!before.transfer_date_printed_vn&&after.transfer_date_printed_vn)result.date=after.transfer_date_printed_vn;
 if(!before.transfer_time_printed_vn&&after.transfer_time_printed_vn)result.clock=after.transfer_time_printed_vn;
 if(!before.transfer_content&&after.transfer_content)result.memo=after.transfer_content;
 return Object.keys(result).length?result:null;
}
export async function runDeferred({store,download,digest,encode,key,fetchFn=fetch,signal}){
 const job=await store.claim();if(!job)return {state:"idle",ledger_written:false};
 // Compute once. Persist once; ambiguous persistence is resolved by lease expiry,
 // not a second finish call with a different state.
 let state="retry",evidence=null;
 const mime=job.mime_type==="image/jpg"?"image/jpeg":job.mime_type;
 try{
  if(!deferredFields(job.raw).includes(job.field)||!(/^[a-f0-9]{64}$/.test(job.image_sha256))||!["image/png","image/jpeg","image/webp"].includes(mime))state="stale";
  else{
   const bytes=await download(job.storage_key,signal);
   if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>6_000_000||await digest(bytes)!==job.image_sha256)state="stale";
   else{
    const prompt=job.field==="account"?ACCOUNT_DIGIT_RECHECK_PROMPT:SMALL_TEXT_RECHECK_PROMPT;
    const bounded=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,bounded]):bounded;
    const v=await requestBillGemini({key,model:"gemini-3.5-flash-lite",maxRequests:1,signal:combined,fetchFn,payload:{contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:mime,data:encode(bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:job.field==="account"?2048:1024}}});
    const parsed=await parseBillGeminiResponse(v.response,{signal:combined});
    evidence=displayEvidence(job.raw,job.field,parsed);state=evidence?"verified":"needs_review";
   }
  }
 }catch(error){
  const msg=String(error?.message||"");
  state=/^gemini_http_(400|401|403|404|429)$/.test(msg)?"needs_review":"retry";
 }
 const saved=await store.finish(job,{state,evidence});
 return {state:typeof saved==="string"?saved:state,ledger_written:false};
}
