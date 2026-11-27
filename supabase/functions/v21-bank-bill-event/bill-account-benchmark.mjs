import {normalizeBillImageMime,validateBillImageMime} from "./bill-image-identity.mjs";
// Read-only benchmark of explicitly queued, already settled bills.
// No receipt, reconciliation, notification, or ledger write.
import {makeAccountRegionCache} from "./bill-account-region-cache.mjs";
import {prepareLocatedAccountParts} from "./bill-account-locator.mjs";
import {ACCOUNT_DIGIT_RECHECK_PROMPT,validateAccountDigitProof} from "./bill-amount-rules.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
export function benchmarkProof(proof){return validateAccountDigitProof(proof)!==null;}
const TRACE_REASONS={
 cache:new Set(["hit","miss","unavailable","timeout","aborted"]),
 locator:new Set(["located","stored_region","aborted","unsupported_mime","invalid_jpeg","byte_limit","pixel_limit","exif_invalid","exif_rotation","region_response_invalid","region_role_unknown","region_role_invalid","region_box_shape","region_coordinate_invalid","region_geometry_invalid","region_bounds","timeout","invalid_json","request_failed"]),
 crop:new Set(["used","aborted","unsupported_mime","invalid_jpeg","byte_limit","pixel_limit","exif_invalid","exif_rotation","region_missing_or_invalid","region_bounds","codec_import","codec_decode","codec_dimensions","crop_bounds","codec_encode","output_limit"])
};
const safeReason=(stage,reason)=>TRACE_REASONS[stage]?.has(reason)?reason:stage==="locator"&&/^gemini_http_[1-5][0-9]{2}$/.test(reason)?"provider_http":"other";
const encode=bytes=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export async function runAccountBenchmark({db,key,digest,signal,fetchFn=fetch}){
 const rpc=async(name,args={})=>{const {data,error}=await db.rpc(name,args);if(error)throw Error("benchmark_rpc_failed");return data};
 if(!key)throw Error("missing_model_key");
 const job=await rpc("v0_bill_crop_benchmark_claim");if(!job)return {state:"idle",ledger_written:false};
 const started=Date.now(),metrics={cache:"not_checked",locator:"not_checked",crop:"not_checked",outcome:"failed",elapsed_ms:0};
 const trace=event=>{
  if(!Object.hasOwn(TRACE_REASONS,event?.stage))return;
  const reason=safeReason(event.stage,event.reason);
  // A get timeout is followed by a miss; retain the more informative cause.
  if(!(event.stage==="cache"&&event.reason==="miss"&&["timeout","unavailable","aborted"].includes(metrics.cache)))metrics[event.stage]=reason;
  console.info("bank_account_crop_trace",JSON.stringify({stage:event.stage,reason}));
 };
 let state="failed",result={crop_used:false,exact:false,requests:0};
 try{
  const mime=normalizeBillImageMime(job.mime_type);
  if(!["image/jpeg","image/png","image/webp"].includes(mime)||!(/^[a-f0-9]{64}$/.test(job.image_sha256)))throw Error("invalid_image");
  const {data,error}=await db.storage.from("v21-media").download(job.storage_key);
  if(error||!data||data.size<1||data.size>6_000_000||signal?.aborted)throw Error("storage_unavailable");
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(!validateBillImageMime(bytes,mime))throw Error("invalid_image");
  if(await digest(bytes)!==job.image_sha256)throw Error("image_hash_mismatch");
  const counted=(...a)=>{result.requests++;return fetchFn(...a)};
  const cache=makeAccountRegionCache(db,"benchmark",job,{trace,signal});
  let usedRegion=null,cacheHit=false;
  const parts=await prepareLocatedAccountParts({bytes,mime,stored:job.region,encode,key,fetchFn:counted,signal,trace,cache,onCropRegion:(region,hit)=>{usedRegion=region;cacheHit=hit;}});
  result.crop_used=parts.length===3;
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const v=await requestBillGemini({key,model:"gemini-3.5-flash-lite",maxRequests:1,fetchFn:counted,signal:deadline,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_DIGIT_RECHECK_PROMPT},...parts]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:2048}}});
  result.exact=benchmarkProof(await parseBillGeminiResponse(v.response,{signal:deadline}));
  state=result.exact?"verified":"needs_review";metrics.outcome=result.exact?"exact":"proof_mismatch";
  if(result.exact&&usedRegion&&!cacheHit&&!signal?.aborted)await cache?.put(usedRegion);
  if(!result.exact&&cacheHit&&!signal?.aborted)await cache?.remove();
 }catch(error){state="failed";const reason=String(error?.message||"");metrics.outcome=["invalid_image","storage_unavailable","image_hash_mismatch","gemini_invalid_json"].includes(reason)?reason:signal?.aborted?"aborted":/^gemini_http_[1-5][0-9]{2}$/.test(reason)?"provider_http":"failed";}
 metrics.elapsed_ms=Math.min(120000,Math.max(0,Date.now()-started));
 console.info("bank_account_benchmark_timing",JSON.stringify({state,...result,...metrics}));
 const saved=await rpc("v0_bill_crop_benchmark_finish",{p_id:job.id,p_lease:job.lease_id,p_state:state,p_result:{...result,metrics}});
 return {state:typeof saved==="string"?saved:state,...result,ledger_written:false};
}
