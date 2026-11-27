// Deployment candidate, NOT a deployed endpoint.
// Use current user's JWT and Storage RLS. No service-role key, no financial RPC.
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {createReaderHandler} from "./api.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const key=Deno.env.get("GEMINI_API_KEY")||"";
const model="gemini-3.5-flash-lite";
const client=(auth:string)=>createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
const handler=createReaderHandler({
 async authorize(auth:string){
  const db=client(auth);
  const {data,error}=await db.auth.getUser(auth.slice(7));
  if(error||!data.user||data.user.is_anonymous)return null;
  const r=await db.rpc("v0_admin_read",{p_kind:"session",p_conversation_id:null});
  if(r.error||r.data?.role!=="admin"||!r.data?.account_id)return null;
  return {db};
 },
 async loadMedia(actor:any,body:any){
  // Caller may supply IDs, never a raw storage key or URL.
  const m=await actor.db.rpc("v0_admin_media",{p_conversation_id:body.conversation_id});
  if(m.error||!Array.isArray(m.data))return null;
  const row=m.data.find((r:any)=>r.id===body.asset_id&&r.kind==="image");
  if(!row||typeof row.storage_key!=="string"||typeof row.mime_type!=="string")return null;
  const r=await actor.db.storage.from("v21-media").download(row.storage_key);
  if(r.error||!r.data||r.data.size>4000000)return null;
  return {bytes:new Uint8Array(await r.data.arrayBuffer()),mime:row.mime_type};
 },
 async reserve(actor:any){
  if(!key)throw Error("provider_unavailable");
  const r=await actor.db.rpc("v0_bill_reader_root02_reserve");
  if(r.error)throw Error("quota_unavailable");
  return r.data===true;
 },
 async invoke(payload:any,signal:AbortSignal){
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{method:"POST",headers:{"x-goog-api-key":key,"content-type":"application/json"},body:JSON.stringify(payload),signal});
  if(!r.ok)throw Error("provider_http");
  const e=await r.json(),c=e?.candidates?.[0];
  if(c?.finishReason!=="STOP"||!Array.isArray(c.content?.parts))throw Error("provider_response");
  const text=c.content.parts.filter((p:any)=>!p.thought&&typeof p.text==="string").map((p:any)=>p.text).join("");
  if(!text||text.length>30000)throw Error("provider_response");
  return JSON.parse(text);
 },
 async hash(bytes:Uint8Array){
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
 },
 encode(bytes:Uint8Array){
  let s="";for(let i=0;i<bytes.length;i+=16000)s+=String.fromCharCode(...bytes.subarray(i,i+16000));return btoa(s);
 }
});
Deno.serve(handler);
