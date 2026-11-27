import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {FIELDS,PROMPT,RESPONSE_SCHEMA,validate,planRead2} from "./reader.mjs";
import {parseAmountText} from "./bill-amount-rules.mjs";
import {inspectJpeg,probeJpegCodec} from "./bill-account-crop.mjs";
import {prepareLocatedAccountParts} from "./bill-account-locator.mjs";
import {normalizeBillImageMime,validateBillImageMime} from "./bill-image-identity.mjs";
import {ACCOUNT_DIGIT_RECHECK_PROMPT,validateAccountDigitProof} from "./bill-amount-rules.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
// Isolated, short-lived read-only pilot. No receipt/ledger writes, no production worker imports.
const VERSION="a7b18128b0ae7857182d1a572a77fa1d22d7bfdf";
const CASES={
 vietin:{id:"b88d06a9-9495-456b-a7fd-67df48beb95f",ledger:1259,notice:484,amount:2200000,hash:"68184556885e687449a0ca4320c458220a1956e923bd51a34a392479c52f938d"},
 bidv:{id:"dbf9ca35-44d7-4255-ba2b-d3d772b8cfc8",ledger:1279,notice:497,amount:5000000,hash:"9fc7d446dd04e2ed8d644c886484b80e8f87de0e4f42e7f6de08eee16fb832ba"}
} as const;
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
const encode=(bytes:Uint8Array)=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const exact=(a:string,b:string)=>{if(a.length!==b.length||a.length<16)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
Deno.serve(async req=>{
 if(req.method!=="POST")return response({error:"method"},405);
 if(Date.now()>=Date.parse("2026-11-27T15:00:00Z"))return response({error:"pilot_expired"},410);
 const {data:c,error:ce}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(c)?c[0]:c;
 if(ce||!exact(req.headers.get("x-internal-dispatch-key")||"",String(cfg?.scan_key||"")))return response({error:"forbidden"},403);
 const body=await req.json().catch(()=>null);
 if(!body||!Object.hasOwn(CASES,body.case)||body.action!=="first")return response({error:"case"},400);
 const target=CASES[body.case as keyof typeof CASES];
 const {data:mode,error:me}=await db.rpc("v0_bill_focus_mode");
 if(me||mode!=="pilot")return response({error:"not_pilot"},409);
 const started=Date.now();let calls=0,crop=false,localized=false,finishCount=0;
 const stages:Record<string,unknown>[]=[];
 const logFn=(name:string,fields:any)=>{
  if(name==="bank_focused_stage"&&stages.length<30){
   stages.push({stage:fields.stage,reason:fields.reason,elapsed_ms:fields.elapsed_ms,total_ms:fields.total_ms,requests:fields.requests});
  }
  console.info(name,JSON.stringify(fields));
 };
 const signal=AbortSignal.timeout(45000);
 try{
  const {data:r,error:re}=await db.from("chat_bank_bill_receipts").select("id,media_asset_id,message_id,customer_account_id,status,ledger_id,amount_vnd,image_sha256,raw_read").eq("id",target.id).single();
  if(re||!r||r.status!=="received"||Number(r.ledger_id)!==target.ledger||Number(r.amount_vnd)!==target.amount||r.image_sha256!==target.hash)throw Error("receipt_guard");
  const {data:l,error:le}=await db.from("chat_bank_app_collection_links").select("receipt_id").eq("receipt_id",target.id).eq("ledger_id",target.ledger).eq("notification_id",target.notice).single();
  if(le||!l)throw Error("link_guard");
  const {data:a,error:ae}=await db.from("v21_media_assets").select("storage_key,mime_type").eq("id",r.media_asset_id).eq("message_id",r.message_id).eq("owner_account_id",r.customer_account_id).is("deleted_at",null).single();
  if(ae||!a)throw Error("media_guard");
  const mime=normalizeBillImageMime(a.mime_type);
  const {data:file,error:fe}=await db.storage.from("v21-media").download(a.storage_key);
  if(fe||!file||file.size<1||file.size>6000000||signal.aborted)throw Error("storage_guard");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!mime||!validateBillImageMime(bytes,mime)||await digest(bytes)!==target.hash)throw Error("image_guard");
  const key=Deno.env.get("GEMINI_API_KEY")||"";
  if(!key)throw Error("missing_key");
  const counted=async(url:string,opts:any)=>{
   if(calls>=1)throw Error("request_cap");
   calls++;
   const p=JSON.parse(opts.body);
   if(p.generationConfig?.responseJsonSchema)localized=true;
   else crop=p.contents?.[0]?.parts?.filter((x:any)=>x.inlineData).length===2;
   return fetch(url,opts);
  };
  const image=inspectJpeg(bytes);
  const readSignal=AbortSignal.any([signal,AbortSignal.timeout(30000)]);
  const v=await requestBillGemini({key,model:"gemini-3.5-flash-lite",maxRequests:1,fetchFn:counted,signal:readSignal,payload:{contents:[{role:"user",parts:[{text:PROMPT},{inlineData:{mimeType:mime,data:encode(bytes)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseJsonSchema:RESPONSE_SCHEMA,maxOutputTokens:4096}}});
  const first=validate(await parseBillGeminiResponse(v.response,{signal:readSignal}),FIELDS);
  const plan=planRead2(first,FIELDS);
  // Only compare after the independent read. Never send reference values to AI.
  const {data:n,error:ne}=await db.from("taphoa_agribank_notifications").select("amount_vnd,bank_credit_account").eq("id",target.notice).single();
  if(ne||!n)throw Error("link_guard");
  const val=(k:string)=>first.fields[k]?.state==="clear"?first.fields[k].literal:null;
  const amount=val("amount"),account=val("recipient_account");
  return response({version:VERSION,case:body.case,kind:first.kind,selection:first.selection,fields:Object.fromEntries(FIELDS.map(k=>[k,{state:first.fields[k].state,has_box:!!first.fields[k].box}])),plan,amount_bank_match:typeof amount==="string"&&Math.abs(parseAmountText(amount))===Number(n.amount_vnd),account_bank_match:typeof account==="string"&&account.replace(/\s/g,"")===String(n.bank_credit_account),requests:calls,elapsed_ms:Date.now()-started,ledger_written:false,receipt_written:false});
 }catch(e){
  const msg=String(e?.message||"");
  return response({version:VERSION,case:body.case,state:"failed",reason:/^(receipt|link|media|storage|image|finish)_guard$|^missing_key$|^request_cap$|^gemini_http_[0-9]{3}$|^gemini_invalid_json$/.test(msg)?msg:signal.aborted?"timeout":"request_failed",requests:calls,locator_called:localized,crop_used:crop,elapsed_ms:Date.now()-started,ledger_written:false,receipt_written:false},502);
 }
});
