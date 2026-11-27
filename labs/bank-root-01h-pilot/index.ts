import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {runDeferred} from "./bill-deferred-reread.mjs";
import {prepareLocatedAccountParts} from "./bill-account-locator.mjs";
import {normalizeBillImageMime,validateBillImageMime} from "./bill-image-identity.mjs";
import {ACCOUNT_DIGIT_RECHECK_PROMPT,validateAccountDigitProof} from "./bill-amount-rules.mjs";
import {requestBillGemini,parseBillGeminiResponse} from "./bill-gemini-failover.mjs";
// Isolated, short-lived read-only pilot. No receipt/ledger writes, no production worker imports.
const VERSION="6e092576eb3feae2c9f455c53542fce59a48d458";
const CASES={
 small:{id:"eb514bf3-003e-4651-9c9e-55109df7a2c2",ledger:1280,notice:499,amount:677000,hash:"2781fcf69b4883601fff351aa5cd0518119da56c154e7327c2fde73930d4e123"},
 control:{id:"a70acdb6-f929-4582-ad88-327bd72688c2",ledger:1281,notice:500,amount:10000000,hash:"35b72c80f78d9535ba8a7d93848d4934443ed1f281be2b2e8a0c1dd268eeec43"}
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
 if(!body||!Object.hasOwn(CASES,body.case))return response({error:"case"},400);
 const target=CASES[body.case as keyof typeof CASES];
 const {data:mode,error:me}=await db.rpc("v0_bill_focus_mode");
 if(me||mode!=="pilot")return response({error:"not_pilot"},409);
 const started=Date.now();let calls=0,crop=false,localized=false,finishCount=0;
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
   if(calls>=2)throw Error("request_cap");
   calls++;
   const p=JSON.parse(opts.body);
   if(p.generationConfig?.responseJsonSchema)localized=true;
   else crop=p.contents?.[0]?.parts?.filter((x:any)=>x.inlineData).length===2;
   return fetch(url,opts);
  };
  let state="needs_review",proof=false;
  if(body.case==="small"){
   // Execute the exact candidate deferred reader, but claim/finish live only in memory.
   const job={id:r.id,raw:r.raw_read,field:"account",image_sha256:r.image_sha256,storage_key:a.storage_key,mime_type:a.mime_type};
   const result=await runDeferred({store:{claim:async()=>job,finish:async(_j:any,v:any)=>{finishCount++;proof=v.state==="verified"&&!!v.evidence?.account;return v.state}},download:async()=>bytes,digest,encode,key,fetchFn:counted,signal});
   state=result.state;
   if(finishCount!==1)throw Error("finish_guard");
  }else{
   // Full-digit control case: independent localization + strict shared proof, no fake OCR input.
   const parts=await prepareLocatedAccountParts({bytes,mime,stored:null,encode,key,fetchFn:counted,signal});
   const readSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
   const v=await requestBillGemini({key,model:"gemini-3.5-flash-lite",maxRequests:1,fetchFn:counted,signal:readSignal,payload:{contents:[{role:"user",parts:[{text:ACCOUNT_DIGIT_RECHECK_PROMPT},...parts]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:2048}}});
   proof=validateAccountDigitProof(await parseBillGeminiResponse(v.response,{signal:readSignal}))!==null;
   state=proof?"verified":"needs_review";
  }
  return response({version:VERSION,case:body.case,state,exact:proof,requests:calls,locator_called:localized,crop_used:crop,elapsed_ms:Date.now()-started,ledger_written:false,receipt_written:false});
 }catch(e){
  const msg=String(e?.message||"");
  return response({version:VERSION,case:body.case,state:"failed",reason:/^(receipt|link|media|storage|image|finish)_guard$|^missing_key$|^request_cap$|^gemini_http_[0-9]{3}$|^gemini_invalid_json$/.test(msg)?msg:signal.aborted?"timeout":"request_failed",requests:calls,locator_called:localized,crop_used:crop,elapsed_ms:Date.now()-started,ledger_written:false,receipt_written:false},502);
 }
});
