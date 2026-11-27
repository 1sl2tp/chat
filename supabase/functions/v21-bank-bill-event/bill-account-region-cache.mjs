// Coordinates are a performance hint, never account or financial evidence.
import {normalizeAccountRegion} from "./bill-account-crop.mjs";
export const ACCOUNT_REGION_CACHE_VERSION=1;
export function makeAccountRegionCache(db,kind,job,{trace=()=>{}}={}){
 if(!["benchmark","focused"].includes(kind)||!job?.id||!job?.lease_id||!/^[a-f0-9]{64}$/.test(job.image_sha256||""))return null;
 const args={p_kind:kind,p_id:job.id,p_lease:job.lease_id,p_sha:job.image_sha256,p_version:ACCOUNT_REGION_CACHE_VERSION};
 const call=async(name,extra={})=>{
  try{const {data,error}=await db.rpc(name,{...args,...extra});if(error)throw Error("cache_rpc");return data;}
  catch{trace({stage:"cache",reason:"unavailable"});return null;}
 };
 return {
  get:async()=>normalizeAccountRegion(await call("v0_bill_account_region_cache_get")),
  put:async region=>{const value=normalizeAccountRegion(region);if(!value)return false;return (await call("v0_bill_account_region_cache_put",{p_region:value}))===true;},
  remove:async()=> (await call("v0_bill_account_region_cache_remove"))===true
 };
}
