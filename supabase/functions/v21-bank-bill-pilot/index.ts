import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const base=Deno.env.get("SUPABASE_URL")||"";
const db=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
 if(req.method!=="POST")return reply({error:"method"},405);
 const {data:raw,error}=await db.rpc("chat_customer_summary_runtime_config");
 const cfg=Array.isArray(raw)?raw[0]:raw;
 if(error||!cfg?.scan_key||req.headers.get("x-internal-dispatch-key")!==cfg.scan_key)return reply({error:"not_authorized"},403);
 const input=await req.json().catch(()=>({}));
 const asset=String(input.asset_id||"");
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(asset))return reply({error:"invalid_asset"},400);
 try{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),28000);
  let result:Response;
  try{result=await fetch(base+"/functions/v1/v21-bank-bill-event",{method:"POST",
    headers:{"content-type":"application/json","x-internal-dispatch-key":cfg.scan_key},
    body:JSON.stringify({asset_id:asset}),signal:ctl.signal});}
  finally{clearTimeout(timer);}
  return reply(await result.json().catch(()=>({error:"invalid_reader_response"})),result.status);
 }catch{return reply({error:"amount_scan_unavailable"},503)}
});