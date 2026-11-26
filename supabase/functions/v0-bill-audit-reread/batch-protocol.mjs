// Historical Bill audit only; never use this for collection.
export const MODEL="gemini-3.5-flash-lite";
export const MAX_ITEMS=50, MAX_BYTES=12_000_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/i, OP=/^batches\/[A-Za-z0-9_-]{1,200}$/;
const bytes=x=>{let n=0;for(const c of JSON.stringify(x)){const v=c.codePointAt(0);n+=v<128?1:v<2048?2:v<65536?3:4}return n};
export function item({id,hash,mime,data,prompt,revision=0,stage=1,crops=[]}){
 if(!UUID.test(id)||!HASH.test(hash)||!["image/jpeg","image/png","image/webp"].includes(mime)||typeof data!=="string"||!data||typeof prompt!=="string"||!prompt.trim()||!Number.isSafeInteger(revision)||revision<0||![1,2].includes(stage)||!Array.isArray(crops)||crops.length>3||stage===1&&crops.length)throw Error("invalid_input");
 // crops are trusted pixel crops of the same original, never other bills.
 if(crops.some(c=>c?.mimeType!=="image/png"||typeof c.data!=="string"||!c.data))throw Error("invalid_crop");
 const parts=[{text:prompt},{inlineData:{mimeType:mime,data}},...crops.map(inlineData=>({inlineData}))];
 return {request:{contents:[{role:"user",parts}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:3072}},metadata:{key:id+":"+stage+":"+revision,receipt_id:id,image_sha256:hash,revision,stage}};
}
export function body(items,jobId){
 if(!UUID.test(jobId)||!items.length||items.length>MAX_ITEMS)throw Error("invalid_batch");
 return {batch:{displayName:"0v-bill-audit-"+jobId,inputConfig:{requests:{requests:items}}}};
}
export function pack(items,{maxItems=MAX_ITEMS,maxBytes=MAX_BYTES}={}){
 if(!Number.isInteger(maxItems)||maxItems<1||maxItems>MAX_ITEMS||!Number.isInteger(maxBytes)||maxBytes<100||maxBytes>MAX_BYTES)throw Error("invalid_limits");
 const placeholder="00000000-0000-0000-0000-000000000000",groups=[],seen=new Set();let group=[];
 for(const x of items){
  const id=x?.metadata?.receipt_id;
  if(!UUID.test(id)||seen.has(id))throw Error("duplicate_receipt");seen.add(id);
  if(bytes(body([x],placeholder))>maxBytes)throw Error("image_over_limit");
  if(group.length===maxItems||bytes(body([...group,x],placeholder))>maxBytes){groups.push(group);group=[]}
  group.push(x);
 }
 if(group.length)groups.push(group);return groups;
}
export function manifest(items,jobId){
 if(bytes(body(items,jobId))>MAX_BYTES)throw Error("batch_over_limit");
 if(new Set(items.map(x=>x.metadata.receipt_id)).size!==items.length)throw Error("duplicate_receipt");
 return {jobId,model:MODEL,items:items.map(x=>({...x.metadata}))};
}
export async function submitOnce({job,items,store,key,fetchFn=fetch,signal}){
 if(!key)throw Error("missing_provider_key");
 if(JSON.stringify(job)!==JSON.stringify(manifest(items,job.jobId)))throw Error("manifest_mismatch");
 // store.reserve MUST be a durable atomic lease across job IDs and
 // receipt+stage+revision; ambiguous sends must not be retried automatically.
 const lease=await store.reserve(job);
 if(!lease.acquired)return {state:lease.state,operation:lease.operation??null};
 let operation=null;
 try{
  const r=await fetchFn("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":batchGenerateContent",{method:"POST",headers:{"x-goog-api-key":key,"content-type":"application/json"},body:JSON.stringify(body(items,job.jobId)),signal});
  if(!r.ok)throw Error("batch_http_"+r.status);
  const result=await r.json();if(!OP.test(result.name))throw Error("invalid_operation");
  operation=result.name;await store.markSubmitted(job.jobId,operation);return {state:"submitted",operation};
 }catch(e){await store.markAmbiguous(job.jobId,operation);throw e}
}
export function decode(operation,job){
 if(!OP.test(operation?.name)||operation.name!==job.operation)throw Error("operation_mismatch");
 const m=operation.metadata||{};
 if(m.displayName!=="0v-bill-audit-"+job.jobId)throw Error("job_mismatch");
 if(!operation.done)return {state:m.state||"pending",rows:[]};
 if(operation.error)return {state:"failed",rows:[]};
 const responses=operation.response?.inlinedResponses?.inlinedResponses??m.output?.inlinedResponses?.inlinedResponses;
 if(!Array.isArray(responses)||responses.length!==job.items.length)throw Error("result_count");
 const expected=new Map(job.items.map(x=>[x.key,x])),seen=new Set(),completed=m.endTime&&Number.isFinite(Date.parse(m.endTime))?m.endTime:null;
 const rows=responses.map(r=>{
  const a=r.metadata,b=expected.get(a?.key);
  if(!b||seen.has(a.key)||a.receipt_id!==b.receipt_id||a.image_sha256!==b.image_sha256||a.revision!==b.revision||a.stage!==b.stage)throw Error("result_scope");
  seen.add(a.key);const base={...b,batch_completed_at:completed,ledger_written:false};
  if(r.error)return {...base,state:"failed"};
  try{const p=r.response?.candidates?.[0]?.content?.parts;if(!Array.isArray(p))throw Error("empty");
   const raw=p.filter(x=>typeof x?.text==="string"&&!x.thought).map(x=>x.text).join("").trim();if(raw.length>30000)throw Error("too_large");
   const fields=JSON.parse(raw);if(!fields||typeof fields!=="object"||Array.isArray(fields))throw Error("invalid");
   return {...base,state:"read",raw:fields};
  }catch{return {...base,state:"invalid_response"}}
 });
 return {state:"complete",rows};
}
export async function fetchBatch({job,key,fetchFn=fetch,signal}){
 if(!key||!OP.test(job.operation))throw Error("invalid_operation");
 const r=await fetchFn("https://generativelanguage.googleapis.com/v1beta/"+job.operation,{headers:{"x-goog-api-key":key},signal});if(!r.ok)throw Error("status_http_"+r.status);return decode(await r.json(),job);
}
