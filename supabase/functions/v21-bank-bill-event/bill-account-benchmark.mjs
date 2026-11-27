// Read-only benchmark of explicitly queued, already settled bills.
// No receipt, reconciliation, notification, or ledger write.
import {prepareLocatedAccountParts} from "./bill-account-locator.mjs";
import {ACCOUNT_DIGIT_RECHECK_PROMPT} from "./bill-amount-rules.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
const literal=v=>typeof v==="string"?v.trim().replace(/[ \t]/g,""):"";
export function benchmarkProof(proof){
 if(proof?.role!=="recipient_account"||proof.clear!==true||!Array.isArray(proof.digits)||!Array.isArray(proof.reverse_digits)||proof.digits.length!==13||proof.reverse_digits.length!==13||!proof.digits.every(d=>typeof d==="string"&&/^\d$/.test(d))||!proof.reverse_digits.every(d=>typeof d==="string"&&/^\d$/.test(d))||proof.digit_count!==13||proof.trailing_nines!==6)return false;
 const digits=proof.digits.join("");
 return digits==="2901181999999"&&literal(proof.visible)===digits&&proof.reverse_digits.join("")===[...digits].reverse().join("");
}
const encode=bytes=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export async function runAccountBenchmark({db,key,digest,signal,fetchFn=fetch}){
 const rpc=async(name,args={})=>{const {data,error}=await db.rpc(name,args);if(error)throw Error("benchmark_rpc_failed");return data};
 if(!key)throw Error("missing_model_key");
 const job=await rpc("v0_bill_crop_benchmark_claim");if(!job)return {state:"idle",ledger_written:false};
 const started=Date.now(),trace=event=>console.info("bank_account_crop_trace",JSON.stringify(event));
 let state="failed",result={crop_used:false,exact:false,requests:0};
 try{
  const mime=job.mime_type==="image/jpg"?"image/jpeg":job.mime_type;
  if(!["image/jpeg","image/png","image/webp"].includes(mime)||!(/^[a-f0-9]{64}$/.test(job.image_sha256)))throw Error("invalid_image");
  const {data,error}=await db.storage.from("v21-media").download(job.storage_key);
  if(error||!data||data.size<1||data.size>6_000_000||signal?.aborted)throw Error("storage_unavailable");
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(await digest(bytes)!==job.image_sha256)throw Error("image_hash_mismatch");
  const counted=(...a)=>{result.requests++;return fetchFn(...a)};
  const parts=await prepareLocatedAccountParts({bytes,mime,stored:job.region,encode,key,fetchFn:counted,signal,trace});
  result.crop_used=parts.length===3;
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const v=await requestBillGemini({key,model:"gemini-3.5-flash-lite",maxRequests:1,fetchFn:counted,signal:deadline,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_DIGIT_RECHECK_PROMPT},...parts]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:2048}}});
  result.exact=benchmarkProof(await parseBillGeminiResponse(v.response,{signal:deadline}));
  state=result.exact?"verified":"needs_review";
 }catch{state="failed";}
 console.info("bank_account_benchmark_timing",JSON.stringify({state,...result,elapsed_ms:Math.max(0,Date.now()-started)}));
 const saved=await rpc("v0_bill_crop_benchmark_finish",{p_id:job.id,p_lease:job.lease_id,p_state:state,p_result:result});
 return {state:typeof saved==="string"?saved:state,...result,ledger_written:false};
}
