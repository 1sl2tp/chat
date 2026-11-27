// Coordinates are a performance hint, never account or financial evidence.
import {normalizeAccountRegion} from "./bill-account-crop.mjs";
export const ACCOUNT_REGION_CACHE_VERSION=1;
export function makeAccountRegionCache(db,kind,job,{trace=()=>{},signal,timeoutMs=750}={}){
 if(!["benchmark","focused"].includes(kind)||!job?.id||!job?.lease_id||!/^[a-f0-9]{64}$/.test(job.image_sha256||""))return null;
 const args={p_kind:kind,p_id:job.id,p_lease:job.lease_id,p_sha:job.image_sha256,p_version:ACCOUNT_REGION_CACHE_VERSION};
 const call=async(name,extra={})=>{
  if(signal?.aborted){trace({stage:"cache",reason:"aborted"});return null;}
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.max(1,Math.min(1000,Number(timeoutMs)||750)));
  const combined=signal?AbortSignal.any([signal,ctl.signal]):ctl.signal;
  let onAbort;
  try{
   const abort=new Promise((_,reject)=>{onAbort=()=>reject(Error("cache_timeout"));combined.addEventListener("abort",onAbort,{once:true});});
   if(combined.aborted)throw Error("cache_timeout");
   let request=db.rpc(name,{...args,...extra});
   if(typeof request?.abortSignal==="function")request=request.abortSignal(combined);
   const {data,error}=await Promise.race([Promise.resolve(request),abort]);
   if(combined.aborted||error)throw Error("cache_rpc");
   return data;
  }catch{trace({stage:"cache",reason:signal?.aborted?"aborted":ctl.signal.aborted?"timeout":"unavailable"});return null;}
  finally{clearTimeout(timer);combined.removeEventListener("abort",onAbort);}

 };
 return {
  get:async()=>normalizeAccountRegion(await call("v0_bill_account_region_cache_get")),
  put:async region=>{const value=normalizeAccountRegion(region);if(!value)return false;return (await call("v0_bill_account_region_cache_put",{p_region:value}))===true;},
  remove:async()=> (await call("v0_bill_account_region_cache_remove"))===true
 };
}
