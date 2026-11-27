// Server-only tick, one claim per invocation. No collection imports or writes.
import {runDeferred} from "./bill-deferred-reread.mjs";
const encode=bytes=>{let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
export async function runFocusedTick({db,key,digest,signal,fetchFn=fetch}){
 const call=async(name,args={})=>{const {data,error}=await db.rpc(name,args);if(error)throw Error("focused_rpc_failed");return data;};
 const mode=await call("v0_bill_focus_mode");
 if(mode!=="pilot"&&mode!=="auto")return {state:"disabled",ledger_written:false};
 if(!key)throw Error("missing_model_key");
 await call("v0_bill_focus_seed",{p_limit:20});
 const store={claim:()=>call("v0_bill_focus_claim"),finish:(job,v)=>call("v0_bill_focus_finish",{p_id:job.id,p_lease:job.lease_id,p_state:v.state,p_evidence:v.evidence})};
 return runDeferred({store,key,digest,encode,signal,fetchFn,download:async path=>{
  if(typeof path!=="string"||!path||path.length>1000||signal?.aborted)throw Error("invalid_storage_path");
  const {data,error}=await db.storage.from("v21-media").download(path);
  if(error||!data||data.size<1||data.size>6_000_000||signal?.aborted)throw Error("storage_unavailable");
  return new Uint8Array(await data.arrayBuffer());
 }});
}
