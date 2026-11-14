// NCC-007: Admin-only, Chat-like OCR room with private Storage-backed history.
// No supplier auto intake, no new Postgres tables, no customer Chat/Zalo traffic.
// Input: photo -> OCR table; duplicate of identical image is reported by SHA-256.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {reconcileInvoice} from "./invoice-reconciliation.mjs";

const BASE=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(BASE,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET="v21-media";
const PROJECT="ncc-ai-room-v1";
const LIMIT_BYTES=4000000;
const HASH=/^[a-f0-9]{64}$/;
const headers={
 "access-control-allow-origin":"*",
 "access-control-allow-methods":"POST, OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "content-type":"application/json; charset=utf-8",
 "cache-control":"no-store"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(code:string,status=400)=>json({ok:false,code},status);
const root=(id:string)=>"ncc-ai-room/"+PROJECT+"/"+id;
const resultKey=(id:string,hash:string)=>root(id)+"/results/"+hash+".txt";
const revisedKey=(id:string,hash:string)=>root(id)+"/reconciled/"+hash+".txt";
const lockKey=(id:string,hash:string)=>root(id)+"/locks/"+hash+".txt";
const imageKey=(id:string,hash:string,mime:string)=>root(id)+"/photos/"+hash+
 (mime==="image/png"?".png":mime==="image/webp"?".webp":".jpg");
const keyDate=()=>new Date().toISOString();

async function requireAdmin(req:Request){
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")||"")?.[1];
 if(!token)return null;
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.id)return null;
 const {data:account,error:accountError}=await db.from("v21_accounts")
  .select("id,role,locked_at")
  .eq("auth_user_id",user.id).eq("role","admin")
  .is("locked_at",null).is("deleted_at",null).maybeSingle();
 return accountError?null:account||null;
}
function bytesFromBase64(raw:unknown){
 const str=String(raw||"");
 if(str.length<140||str.length>5500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(str))
  throw Error("invalid_image");
 const decoded=atob(str);
 if(decoded.length<100||decoded.length>LIMIT_BYTES)throw Error("invalid_image_size");
 const bytes=new Uint8Array(decoded.length);
 for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
 return bytes;
}
function mimeVerified(bytes:Uint8Array,mime:unknown){
 const m=String(mime||"").toLowerCase();
 if(m==="image/jpeg" && bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return m;
 if(m==="image/png" && bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return m;
 if(m==="image/webp" && new TextDecoder().decode(bytes.subarray(0,4))==="RIFF" &&
    new TextDecoder().decode(bytes.subarray(8,12))==="WEBP")return m;
 throw Error("invalid_image_type");
}
async function sha256(bytes:Uint8Array){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 return [...digest].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function toDataUri(bytes:Uint8Array){
 let parts="";
 for(let i=0;i<bytes.length;i+=8192)
  parts+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(parts);
}
function nonnegativeInt(value:unknown,max:number){
 if(value===null||value===undefined||value==="")return null;
 if(typeof value==="string"&&!/^\d{1,12}$/.test(value.trim()))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
}
function positiveNumber(value:unknown){
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>0&&n<=1000000?Math.round(n*1000)/1000:null;
}
function text(value:unknown,max=160){
 return String(value??"").trim().slice(0,max);
}
function normalize(raw:any){
 const classification=raw?.classification==="supplier_invoice"?"supplier_invoice":"other";
 const items=Array.isArray(raw?.lines)?raw.lines.slice(0,120):[];
 const lines=classification==="supplier_invoice"?items.map((item:any,index:number)=>({
  row_no:index+1,
  printed_name:text(item?.printedName,180),
  printed_unit:text(item?.printedUnit,40),
  quantity:positiveNumber(item?.quantity),
  unit_price_vnd:nonnegativeInt(item?.unitPriceVnd,100000000000),
  line_total_vnd:nonnegativeInt(item?.lineTotalVnd,100000000000)
 })).filter((item:any)=>Boolean(item.printed_name)):[];
 return {
  status:classification==="supplier_invoice"?(lines.length?"extracted":"needs_review"):"not_invoice",
  document:{
   classification,date:text(raw?.date,30)||null,
   invoice_number:text(raw?.invoiceNumber,100)||null,
   printed_total_vnd:nonnegativeInt(raw?.printedTotalVnd,100000000000),
   subtotal_vnd:nonnegativeInt(raw?.subtotalVnd,100000000000),
   discount_amount_vnd:nonnegativeInt(raw?.discountAmountVnd,100000000000),
   discount_percent:raw?.discountPercent===null||raw?.discountPercent===undefined?null:
     (Number.isFinite(Number(raw.discountPercent))?Number(raw.discountPercent):null),
   shipping_fee_vnd:nonnegativeInt(raw?.shippingFeeVnd,100000000000),
   other_fee_vnd:nonnegativeInt(raw?.otherFeeVnd,100000000000),
   tax_vnd:nonnegativeInt(raw?.taxVnd,100000000000),
   total_payable_vnd:nonnegativeInt(raw?.totalPayableVnd,100000000000)
  },
  lines
 };
}
async function readWithGemini(bytes:Uint8Array,mime:string){
 const key=Deno.env.get("GEMINI_API_KEY")||"";
 if(!key)throw Error("ai_not_configured");
 const prompt=[
 "You are a careful Vietnamese supplier invoice and delivery-note reader.",
 "The ADMIN needs a FIRST PASS information table, not stock posting or product matching.",
 "Read only details that are visibly present in this image; never invent missing values.",
 "If this is a bank transfer receipt, chat image, or unrelated photo set classification=other and lines=[].",
 "If supplier invoice or delivery note, set classification=supplier_invoice.",
 "Date and invoiceNumber may be null; still read individual item lines when legible.",
 "Read the full image including bottom totals, supplier's TOTAL DISCOUNT (chiết khấu tổng), any discount percentage, and the actual final amount payable.",
 "Distinguish subtotal (tiền hàng trước chiết khấu) from total payable (thực trả, phải thanh toán) and printedTotalVnd when its role is ambiguous.",
 "Sometimes supplier applies a single discount to the WHOLE invoice: record its exact amount in discountAmountVnd and percent in discountPercent IF VISIBLE.",
 "Do not manufacture per-row prices or distribute an invoice-level discount yourself; server arithmetic handles allocation only when every line has enough price data.",
 "Do not confuse product weight (e.g. 'bát 2kg') with money or quantity.",
 "Return ONLY JSON with shape:",
 '{"classification":"supplier_invoice"|"other","date":string|null,"invoiceNumber":string|null,"printedTotalVnd":integer|null,"subtotalVnd":integer|null,"discountAmountVnd":integer|null,"discountPercent":number|null,"shippingFeeVnd":integer|null,"otherFeeVnd":integer|null,"taxVnd":integer|null,"totalPayableVnd":integer|null,"lines":[{"printedName":string,"printedUnit":string|null,"quantity":number|null,"unitPriceVnd":integer|null,"lineTotalVnd":integer|null}]}',
 "Preserve source row order; do not infer packaging or prices; missing fields must be null. Amounts use VND integer, NOT thousands.",
 "Avoid using handwritten marginal notes as product rows."
 ].join("\n");
 const body={contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:mime,data:toDataUri(bytes)}}]}],
  generationConfig:{temperature:0,responseMimeType:"application/json"}};
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+encodeURIComponent(key),{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
  signal:AbortSignal.timeout(30000)
 });
 if(!response.ok)throw Error("ai_unavailable");
 const ai=await response.json();
 const content=String(ai?.candidates?.[0]?.content?.parts?.find((p:any)=>typeof p.text==="string")?.text||"");
 if(!content)throw Error("ai_empty");
 try{return normalize(JSON.parse(content.trim().replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}$/,"")));}
 catch{throw Error("ai_invalid_json");}
}
async function getSaved(id:string,hash:string){
 // A reviewed recheck overrides original extraction without deleting it.
 for(const path of [revisedKey(id,hash),resultKey(id,hash)]){
  const {data,error}=await db.storage.from(BUCKET).download(path);
  if(error||!data)continue;
  try{
   const result=JSON.parse(await data.text());
   if(result?.hash===hash&&result?.version===PROJECT)return result;
  }catch{}
 }
 return null;
}
async function publicRecord(id:string,result:any){
 const image=result.image_key?await db.storage.from(BUCKET).createSignedUrl(result.image_key,600):null;
 return {
  hash:result.hash,
  created_at:result.created_at,
  status:result.status,
  document:result.document,
  lines:result.lines,
  summary:result.summary||null,
  rechecked_at:result.rechecked_at||null,
  image_url:image?.data?.signedUrl||null
 };
}
async function handleSend(adminId:string,body:any){
 let bytes:Uint8Array,mime:string;
 try{bytes=bytesFromBase64(body?.base64);mime=mimeVerified(bytes,body?.mime);}
 catch(error){return fail(String((error as Error)?.message||"invalid_image"));}
 const hash=await sha256(bytes);
 const saved=await getSaved(adminId,hash);
 if(saved)return json({ok:true,duplicate:true,status:"duplicate",record:await publicRecord(adminId,saved)});
 const lockPath=lockKey(adminId,hash);
 const lock=await db.storage.from(BUCKET).upload(lockPath,
  new Blob([keyDate()],{type:"text/plain"}),{contentType:"text/plain",upsert:false});
 if(lock.error){
  const latest=await getSaved(adminId,hash);
  if(latest)return json({ok:true,duplicate:true,status:"duplicate",record:await publicRecord(adminId,latest)});
  if(String(lock.error.message||"").toLowerCase().includes("exist")||
     String((lock.error as any)?.statusCode)==="409")
   return json({ok:true,status:"processing",hash,duplicate:true});
  return fail("storage_unavailable",503);
 }
 const imgKey=imageKey(adminId,hash,mime);
 let stored=false;
 let committed=false;
 try{
  const image=await db.storage.from(BUCKET).upload(imgKey,bytes,{contentType:mime,upsert:false});
  if(image.error)throw Error("image_storage_unavailable");
  stored=true;
  const parsed=await readWithGemini(bytes,mime);
  const checked=parsed.status==="not_invoice"?null:reconcileInvoice(parsed.document,parsed.lines);
  const result={
   version:PROJECT,hash,created_at:keyDate(),image_key:imgKey,
   status:parsed.status,document:parsed.document,
   lines:checked?.lines||parsed.lines,summary:checked?.summary||null
  };
  const write=await db.storage.from(BUCKET).upload(resultKey(adminId,hash),
   new Blob([JSON.stringify(result)],{type:"text/plain"}),
   {contentType:"text/plain",upsert:false});
  if(write.error)throw Error("result_storage_unavailable");
  committed=true;
  return json({ok:true,duplicate:false,status:result.status,record:await publicRecord(adminId,result)});
 }catch(error){
  const code=String((error as Error)?.message||"scan_unavailable");
  return fail(["ai_unavailable","ai_empty","ai_invalid_json","ai_not_configured",
   "image_storage_unavailable","result_storage_unavailable"].includes(code)?code:"scan_unavailable",503);
 }finally{
  await db.storage.from(BUCKET).remove([lockPath]);
  if(!committed&&stored)await db.storage.from(BUCKET).remove([imgKey]);
 }
}
async function handleRecheck(adminId:string,body:any){
 const hash=String(body?.hash||"").toLowerCase();
 if(!HASH.test(hash))return fail("invalid_hash");
 const previous=await getSaved(adminId,hash);
 if(!previous||!previous.image_key)return fail("invoice_not_found",404);
 const locked=await db.storage.from(BUCKET).upload(lockKey(adminId,hash),
  new Blob([keyDate()],{type:"text/plain"}),{contentType:"text/plain",upsert:false});
 if(locked.error)return fail("already_processing",409);
 try{
  const {data:image,error}=await db.storage.from(BUCKET).download(previous.image_key);
  if(error||!image)return fail("image_unavailable",404);
  const bytes=new Uint8Array(await image.arrayBuffer());
  const mime=previous.image_key.endsWith(".png")?"image/png":
    previous.image_key.endsWith(".webp")?"image/webp":"image/jpeg";
  const parsed=await readWithGemini(bytes,mime);
  // Preserve the original recognized table if a recheck has no useful rows.
  if(Array.isArray(previous.lines)&&previous.lines.length>0&&
     (parsed.status==="not_invoice"||parsed.lines.length===0))
   return fail("recheck_not_enough_evidence",422);
  const checked=parsed.status==="not_invoice"?null:reconcileInvoice(parsed.document,parsed.lines);
  const revised={
   version:PROJECT,hash,created_at:previous.created_at,image_key:previous.image_key,
   rechecked_at:keyDate(),status:parsed.status,document:parsed.document,
   lines:checked?.lines||parsed.lines,summary:checked?.summary||null
  };
  const written=await db.storage.from(BUCKET).upload(revisedKey(adminId,hash),
   new Blob([JSON.stringify(revised)],{type:"text/plain"}),
   {contentType:"text/plain",upsert:true,cacheControl:"0"});
  if(written.error)return fail("recheck_storage_unavailable",503);
  return json({ok:true,status:revised.status,record:await publicRecord(adminId,revised)});
 }catch{
  return fail("recheck_unavailable",503);
 }finally{
  await db.storage.from(BUCKET).remove([lockKey(adminId,hash)]);
 }
}
async function handleStatus(adminId:string,body:any){
 const hash=String(body?.hash||"").toLowerCase();
 if(!HASH.test(hash))return fail("invalid_hash");
 const saved=await getSaved(adminId,hash);
 if(saved)return json({ok:true,status:saved.status,record:await publicRecord(adminId,saved)});
 const {data}=await db.storage.from(BUCKET).download(lockKey(adminId,hash));
 if(data)return json({ok:true,status:"processing",hash});
 return json({ok:false,code:"not_found"},404);
}
async function handleHistory(adminId:string){
 const folder=root(adminId)+"/results";
 const found=await db.storage.from(BUCKET).list(folder,{
  limit:30,sortBy:{column:"created_at",order:"desc"}
 });
 if(found.error)return fail("history_unavailable",503);
 const hashes=(found.data||[]).map((f:any)=>String(f.name||"").replace(/\.txt$/,""))
  .filter((value:string)=>HASH.test(value)).slice(0,20);
 const results=await Promise.all(hashes.map(async hash=>{
  const saved=await getSaved(adminId,hash);
  return saved?publicRecord(adminId,saved):null;
 }));
 return json({ok:true,records:results.filter(Boolean)});
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return fail("method_not_allowed",405);
 const admin=await requireAdmin(req);
 if(!admin)return fail("admin_required",403);
 let body:any={};
 try{body=await req.json();}catch{return fail("invalid_json");}
 const action=String(body?.action||"").trim();
 if(action==="health")return json({ok:true,ready:Boolean(Deno.env.get("GEMINI_API_KEY")),features:["invoice_totals_v2"]});
 if(action==="send")return handleSend(admin.id,body);
 if(action==="status")return handleStatus(admin.id,body);
 if(action==="recheck")return handleRecheck(admin.id,body);
 if(action==="history")return handleHistory(admin.id);
 return fail("unknown_action");
});
