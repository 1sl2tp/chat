// Admin-only historical audit endpoint. No internal key from browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {createWorker} from "./batch-worker.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const key=Deno.env.get("GEMINI_API_KEY")||"";
const origin="https://1sl2tp.github.io";
const headers={"access-control-allow-origin":origin,"access-control-allow-headers":"authorization, apikey, content-type, x-client-info","access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store","content-type":"application/json","vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.headers.get("origin")!==origin)return reply({error:"origin"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"method"},405);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer ")||!url||!anon||!service||!key)return reply({error:"unavailable_or_unauthorized"},401);
 try{
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const token=auth.slice(7);
  const {data:claims,error:claimsError}=await userClient.auth.getClaims(token);
  if(claimsError||claims?.claims?.aal!=="aal2")return reply({error:"mfa_required"},403);
  const {data:user,error:userError}=await userClient.auth.getUser(token);
  if(userError||!user?.user||user.user.id!==claims.claims.sub)return reply({error:"auth_required"},401);
  const {data:session,error:sessionError}=await userClient.rpc("v0_admin_read",{p_kind:"session"});
  if(sessionError||session?.role!=="admin"||typeof session.account_id!=="string")return reply({error:"admin_required"},403);
  if(Number(req.headers.get("content-length")||0)>4096)return reply({error:"body_limit"},413);
  const raw=await req.text();if(raw.length>4096)return reply({error:"body_limit"},413);
  const body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["action","jobId"].includes(k))||!["submit_pilot","reconcile"].includes(body.action)||typeof body.jobId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.jobId))return reply({error:"invalid_request"},400);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const worker=createWorker({db,key,adminId:session.account_id});
  // Explicit user action only, one five-item pilot, no cron or looping.
  const signal=AbortSignal.timeout(45000);
  const result=body.action==="submit_pilot"?await worker.submit({jobId:body.jobId,limit:5,signal}):await worker.reconcile({jobId:body.jobId,signal});
  return reply(result);
 }catch{return reply({error:"batch_request_failed",ledger_written:false},502)}
});
