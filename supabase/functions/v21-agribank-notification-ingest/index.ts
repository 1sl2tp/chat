import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {norm,forbidden,parseCredit} from "./credit-parser.mjs";
import {officialCreditWindow} from "./credit-recheck.mjs";
const URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PACKAGE="com.vnpay.Agribank3g";
const headers=(extra:Record<string,string>={})=>({apikey:KEY,Authorization:"Bearer "+KEY,"content-type":"application/json",...extra});
const reply=(a:unknown,code=200)=>new Response(JSON.stringify(a),{status:code,headers:{"content-type":"application/json","cache-control":"no-store"}});
async function sha(s:string){const x=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(x),x=>x.toString(16).padStart(2,"0")).join("");}
// BANK-291: One bounded event wake on a NEW official Agribank credit.
// No new cron/polling and no financial write outside the existing bank worker.
async function recheckNewCredit(body:string,amount:number){
 const window=officialCreditWindow(body);
 const vnToday=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 if(!window||window.businessDate!==vnToday)return;
 const configResponse=await fetch(URL+"/rest/v1/rpc/chat_customer_summary_runtime_config",{
   method:"POST",headers:headers(),body:"{}"
 });
 if(!configResponse.ok)return;
 const configRaw=await configResponse.json();
 const config=Array.isArray(configRaw)?configRaw[0]:configRaw;
 const scanKey=String(config?.scan_key||"");
 if(!scanKey)return;
 const query=new URL(URL+"/rest/v1/chat_bank_bill_receipts");
 query.searchParams.set("select","media_asset_id,status,reason,attempt_count");
 query.searchParams.set("amount_vnd","eq."+amount);
 query.searchParams.set("status","in.(amount_read,review)");
 query.searchParams.set("ledger_id","is.null");
 query.searchParams.append("sent_at","gte."+window.from);
 query.searchParams.append("sent_at","lte."+window.to);
 query.searchParams.set("order","sent_at.asc");
 query.searchParams.set("limit","9");
 const result=await fetch(query.toString(),{headers:headers()});
 if(!result.ok)return;
 const rows=await result.json();
 if(!Array.isArray(rows)||rows.length>8)return; // no ambiguous fan-out
 const eligible=rows.filter(r=>r?.status==="amount_read"||
   (r?.status==="review"&&r?.reason==="bill_printed_datetime_conflict"&&
     r?.attempt_count===1));
 for(const bill of eligible){
   if(typeof bill.media_asset_id!=="string")continue;
   const wake=await fetch(URL+"/functions/v1/v21-bank-bill-event",{
     method:"POST",headers:{"content-type":"application/json",
       "x-internal-dispatch-key":scanKey},
     body:JSON.stringify({asset_id:bill.media_asset_id,recheck_bank_credit:true}),
     signal:AbortSignal.timeout(45000)
   }).catch(()=>null);
   if(!wake?.ok)console.warn("bank291_event_recheck_deferred",wake?.status||"network");
 }
}
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!URL||!KEY)return reply({error:"server_not_configured"},503);
 const token=req.headers.get("x-device-token")||"";
 if(!/^[a-f0-9]{48,128}$/.test(token))return reply({error:"unauthorized"},401);
 try{
  const h=await sha(token);
  const auth=await fetch(URL+"/rest/v1/taphoa_sms_ingest_devices?select=id&key_sha256=eq."+h+"&active=eq.true&limit=1",{headers:headers()});
  if(!auth.ok)return reply({error:"device_check_failed"},503);
  const device=await auth.json();
  if(!Array.isArray(device)||device.length!==1)return reply({error:"unauthorized"},401);
  const data=await req.json();
  const {package_name,title,body,posted_at_ms}=data||{};
  if(package_name!==PACKAGE||typeof title!=="string"||title.length>250||typeof body!=="string"||body.length<3||body.length>2200
     ||!Number.isSafeInteger(posted_at_ms)||posted_at_ms<Date.now()-48*3600000||posted_at_ms>Date.now()+10*60000)
     return reply({error:"invalid_notification"},422);
  if(forbidden.some(word=>norm(title+" "+body).includes(word)))return reply({error:"sensitive_notification"},422);
  const amount=parseCredit(title,body);
  const row={device_id:device[0].id,package_name,title,body,
    posted_at:new Date(posted_at_ms).toISOString(),
    fingerprint:await sha(package_name+"\n"+posted_at_ms+"\n"+title+"\n"+body),
    amount_vnd:amount,status:amount===null?"unclassified":"credit_candidate"};
  const res=await fetch(URL+"/rest/v1/taphoa_agribank_notifications?on_conflict=device_id%2Cfingerprint",
    {method:"POST",headers:headers({prefer:"resolution=ignore-duplicates,return=representation"}),body:JSON.stringify(row)});
  if(!res.ok)return reply({error:"inbox_write_failed"},503);
  const saved=await res.json();
  if(row.status==="credit_candidate"&&Array.isArray(saved)&&saved.length===1){
   EdgeRuntime.waitUntil(recheckNewCredit(body,amount).catch(e=>{
     console.warn("bank291_event_recheck_unavailable",String(e?.name||"error").slice(0,40));
   }));
  }
  return reply({ok:true,stored:Array.isArray(saved)&&saved.length>0,
    duplicate:Array.isArray(saved)&&saved.length===0,
    kind:row.status,ledger_written:false});
 }catch(_e){return reply({error:"temporary_failure"},503);}
});