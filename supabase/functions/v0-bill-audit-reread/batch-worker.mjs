import {item,pack,manifest,submitOnce,fetchBatch} from "./batch-protocol.mjs";
import {createBatchStore} from "./batch-store.mjs";
import {SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE,BILL_LITERAL_MEMO_OCR_GUIDANCE,readV4Fields,validateVisionRead,sanitizeJournalRecipientFields} from "./bill-amount-rules.mjs";
import {FIELD_KEYS,FIELD_EVIDENCE_PROMPT,evidenceStatuses} from "./field-evidence.mjs";
import {REGION_PROMPT} from "./crop-geometry.mjs";
const PROMPT=[SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE,BILL_LITERAL_MEMO_OCR_GUIDANCE,FIELD_EVIDENCE_PROMPT,REGION_PROMPT,"Đọc lại ảnh lịch sử; chỉ trả dữ liệu nhìn thấy, không ghi thu."].join("\n");
const MAX_IMAGE=6_000_000;
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertId=id=>{if(typeof id!=="string"||!idPattern.test(id))throw Error("invalid_id")};
const call=async(db,name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(name+":"+String(error.code||"rpc_failed"));return data};
const base64=bytes=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
export function normalizeResult(raw){
 const data=sanitizeJournalRecipientFields(raw);
 if(data?.transfer_success_visible!==true||data?.transaction_selection!=="single_detail")return {corrections:{},fields:{},state:"needs_review"};
 const f=readV4Fields(data),verdict=validateVisionRead(data);
 const date=typeof f.transfer_date_vn==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(f.transfer_date_vn)&&f.transfer_date_printed_vn&&!f.time_date_conflict?f.transfer_date_vn.split("-").reverse().join("/"):null;
 const clock=typeof f.transfer_time_printed_vn==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(f.transfer_time_printed_vn)&&!f.time_date_conflict?f.transfer_time_printed_vn:null;
 const values={amount_vnd:Number.isSafeInteger(verdict.amount_vnd)&&verdict.amount_vnd>0&&verdict.amount_vnd<1e12?String(verdict.amount_vnd):null,date_raw:date,clock,account_raw:f.receiving_account,recipient:f.receiving_name,memo:f.transfer_content?.replace(/\s+/g," ").trim(),reference:f.transfer_reference,trace:typeof data.trace_code==="string"&&/^[A-Za-z0-9./_-]{3,64}$/.test(data.trace_code)?data.trace_code:null,sending_bank:f.sending_bank,receiving_bank:f.receiving_bank};
 const fields=evidenceStatuses(values,data.field_evidence,null),corrections={};
 // Never blank a previous OCR value from a single uncertain read.
 for(const k of FIELD_KEYS){const v=values[k];if(typeof v==="string"&&v.trim()&&v.length<=1000)corrections[k]=v}
 // Wrong recipient or incomplete/short account stays review, not collection.
 const complete=FIELD_KEYS.every(k=>fields[k]==="read")&&values.account_raw==="2901181999999"&&values.recipient==="BUI XUAN TUNG"&&!f.time_date_conflict;
 return {corrections,fields,state:complete?"saved":"needs_review"};
}
// Call from a trusted server after verifying admin AAL2 session and its account id.
// This module has no route, cron or automatic execution.
export function createWorker({db,key,adminId,fetchFn=fetch,digest=sha256,encode=base64}){
 assertId(adminId);const store=createBatchStore(db);
 return {
 async submit({jobId,limit=5,signal}){
  assertId(jobId);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error("invalid_limit");
  const candidates=await call(db,"v0_bill_batch_candidates",{p_admin:adminId,p_limit:limit});
  if(!Array.isArray(candidates)||candidates.length>limit)throw Error("candidate_contract");
  const items=[],skipped=[];
  for(const c of candidates){
   try{
    assertId(c.receipt_id);if(c.revision!==0||typeof c.storage_key!=="string"||!c.storage_key)throw Error("candidate_invalid");
    const {data:file,error}=await db.storage.from("v21-media").download(c.storage_key);
    if(error||!file||file.size<1||file.size>MAX_IMAGE)throw Error("image_size");
    const bytes=new Uint8Array(await file.arrayBuffer());if(await digest(bytes)!==c.image_sha256)throw Error("image_hash");
    const mime=c.mime_type==="image/jpg"?"image/jpeg":c.mime_type;
    items.push(item({id:c.receipt_id,hash:c.image_sha256,mime,data:encode(bytes),prompt:PROMPT,revision:c.revision}));
   }catch{skipped.push(c.receipt_id)}
  }
  if(!items.length)return {state:"no_eligible_images",skipped:skipped.length};
  const groups=pack(items),first=groups[0],job=manifest(first,jobId);
  const submitted=await submitOnce({job,items:first,store,key,fetchFn,signal});
  return {...submitted,count:first.length,skipped:skipped.length,deferred:items.length-first.length};
 },
 async reconcile({jobId,signal}){
  assertId(jobId);const job=await call(db,"v0_bill_batch_job",{p_admin:adminId,p_job:jobId});
  if(job.jobId!==jobId)throw Error("job_scope");
  if(job.state==="complete")return {state:"complete",replay:true};
  if(job.state!=="submitted")return {state:job.state};
  const result=await fetchBatch({job,key,fetchFn,signal});if(result.state!=="complete"&&result.state!=="failed")return {state:result.state};
  const rows=result.state==="failed"?job.items.map(x=>({...x,state:"failed",batch_completed_at:null})):result.rows;
  const tally={saved:0,needs_review:0,failed:0,stale:0};
  for(const row of rows){
   const normalized=row.state==="read"?normalizeResult(row.raw):{state:"failed",corrections:{},fields:{}};
   const saved=await store.save({jobId,receiptId:row.receipt_id,completedAt:row.batch_completed_at,corrections:normalized.corrections,fields:normalized.fields,state:normalized.state});
   if(!Object.hasOwn(tally,saved.state))throw Error("save_contract");
   tally[saved.state]++;
  }
  return {state:"complete",...tally,ledger_written:false};
 }
 };
}
